"""S3 題材判定：密度與 prompt 輸入（純函式）、`run_s3`（真實 SQLite＋假 llm）、job 層級續跑。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy import select
from storysphere.domain.documents import Chapter, ChapterRole, Document, FileType, Paragraph
from storysphere.domain.genres import GENRES
from storysphere.ingest.s3 import (
    compute_density,
    density_table,
    density_values,
    mechanism_ids,
    opening_sample,
    parse_genre_response,
    run_s3,
    strong_quotes,
)
from storysphere.ingest.service import IngestService, open_checkpointer
from storysphere.ingest.unit_runner import MAX_ATTEMPTS, QuotaPaused, UnitStage
from storysphere.ingest.units import build_units
from storysphere.llm.errors import LLMResponseBlocked
from storysphere.store.books import BookRow, get_book, save_book, set_genre_override
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.ingest_units import IngestUnitRow, save_output, seed_units
from storysphere.store.tables import Job, Run

from tests.ingest.test_unit_runner import BOOK_TEXT

FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"
MECHANISMS = (
    "info_control",
    "world_rules",
    "threat",
    "relations",
    "journey",
    "historicity",
    "language_form",
)


def sig(mechanism: str, strength: str = "weak", quote: str = "引文") -> dict:
    return {"mechanism": mechanism, "strength": strength, "subtags": [], "quote": quote}


def s1b(*signals) -> dict:
    return {"focalization": None, "imagery": [], "book_setting_hints": [], "signals": list(signals)}


def response(**overrides) -> str:
    data = {"primary": "mystery", "mixed": [], "mechanism_density": {"info_control": 0.99}, "rationale": "理由"}
    return json.dumps({**data, **overrides}, ensure_ascii=False)


class FakeLlm:
    """依序回覆；項目是字串（回應文字）或例外（丟出）。用完後重複最後一項。"""

    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.messages: list = []
        self.calls = 0

    async def ainvoke(self, messages):
        self.messages = messages
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        if isinstance(reply, Exception):
            raise reply
        return AIMessage(content=reply)


class TestMechanismIds:
    def test_seven_mechanisms_from_registry(self):
        assert mechanism_ids() == MECHANISMS

    def test_ten_genres(self):
        assert len(GENRES) == 10 and len(set(GENRES)) == 10


class TestComputeDensity:
    def test_density_strong_share_and_chapters(self):
        units = [
            (1, s1b(sig("info_control", "strong"))),
            (2, s1b(sig("info_control", "weak"), sig("threat"))),
            (4, s1b(sig("info_control", "strong"))),
            (5, s1b()),
        ]
        stats = compute_density(units)
        assert list(stats) == list(MECHANISMS)
        assert stats["info_control"].density == 0.75
        assert stats["info_control"].strong_share == 0.67
        assert stats["info_control"].chapters == (1, 4)
        assert stats["threat"].density == 0.25
        assert stats["threat"].strong_share == 0.0
        assert stats["threat"].chapters == (2, 2)

    def test_several_signals_in_one_unit_count_once(self):
        units = [(1, s1b(sig("threat"), sig("threat", "strong"), sig("threat"))), (2, s1b())]
        stats = compute_density(units)["threat"]
        assert stats.density == 0.5
        assert stats.strong_share == 1.0

    def test_zero_signals_still_lists_every_mechanism(self):
        stats = compute_density([(1, s1b()), (2, s1b())])
        assert set(stats) == set(MECHANISMS)
        assert all(s.density == 0 and s.strong_share == 0 and s.chapters is None for s in stats.values())

    def test_no_units(self):
        assert all(s.density == 0 for s in compute_density([]).values())

    def test_dirty_data_is_skipped(self):
        units = [
            (1, {"signals": "oops"}),
            (2, {"signals": [None, "x", {"mechanism": "romance_magic"}, {"strength": "strong"}]}),
            (3, "not a dict"),
            (4, None),
            (5, s1b(sig("journey", "strong"))),
        ]
        stats = compute_density(units)
        assert density_values(stats)["journey"] == 0.2
        assert sum(s.density for s in stats.values()) == 0.2

    def test_rounded_to_two_decimals(self):
        units = [(i, s1b(sig("threat") if i == 1 else None)) for i in range(1, 4)]
        units[0] = (1, s1b(sig("threat")))
        assert compute_density(units)["threat"].density == 0.33


class TestPromptInputs:
    def test_density_table(self):
        table = density_table(compute_density([(2, s1b(sig("threat", "strong"))), (7, s1b(sig("threat")))]))
        lines = table.splitlines()
        assert lines[0] == "| mechanism | density | strong_share | chapters |"
        assert "| threat | 1.00 | 0.50 | 2-7 |" in lines
        assert "| info_control | 0.00 | 0.00 | - |" in lines
        assert len(lines) == 2 + 7

    def test_strong_quotes_first_five_in_book_order(self):
        units = [(i, s1b(sig("info_control", "strong", f"q{i}"), sig("info_control", "weak", f"w{i}"))) for i in range(1, 9)]
        text = strong_quotes(units)
        assert '[info_control, ch 1] "q1"' in text
        assert '[info_control, ch 5] "q5"' in text
        assert "q6" not in text and "w1" not in text

    def test_strong_quotes_none_and_blank_quote(self):
        text = strong_quotes([(1, s1b(sig("threat", "strong", "  "), sig("journey", "weak", "x")))])
        assert text.count("- none") == 7
        assert "threat:\n- none" in text

    def _doc(self, paragraphs: list[tuple[ChapterRole, str]]) -> Document:
        chapters = [
            Chapter(
                number=i,
                role=role,
                paragraphs=[Paragraph(id=f"p{i}", text=text, chapter_number=i, position=0)],
            )
            for i, (role, text) in enumerate(paragraphs)
        ]
        return Document(id="b", title="t", file_path="x", file_type=FileType.TXT, chapters=chapters)

    def test_opening_sample_body_only_and_truncated(self):
        doc = self._doc(
            [(ChapterRole.preface, "序文不要"), (ChapterRole.body, "甲" * 1500), (ChapterRole.body, "乙" * 1500)]
        )
        sample = opening_sample(doc)
        assert "序文不要" not in sample
        assert len(sample) == 2000
        assert sample.startswith("甲") and sample.endswith("乙")

    def test_opening_sample_short_book(self):
        assert opening_sample(self._doc([(ChapterRole.body, "短")])) == "短"


class TestParseGenreResponse:
    def test_fixture_sample(self):
        text = json.loads((FIXTURES / "genre_detection" / "sample.json").read_text(encoding="utf-8"))["response_text"]
        parsed = parse_genre_response(text)
        assert parsed["primary"] == "mystery"
        assert [m["genre"] for m in parsed["mixed"]] == ["thriller", "romance", "adventure"]
        assert parsed["mixed"][0] == {
            "genre": "thriller",
            "score": 0.8,
            "chapters": [3, 4, 5, 7, 10, 11, 12],
        }

    def test_invalid_primary(self):
        with pytest.raises(ValueError, match="primary"):
            parse_genre_response(response(primary="cozy"))

    def test_rationale_must_be_string(self):
        with pytest.raises(ValueError, match="rationale"):
            parse_genre_response(response(rationale=3))

    def test_not_json(self):
        with pytest.raises(ValueError):
            parse_genre_response("抱歉")

    def test_dirty_mixed_items_dropped(self):
        good = {"genre": "horror", "score": 1, "chapters": []}
        mixed = [
            good,
            {"genre": "mystery", "score": 0.5, "chapters": [1]},  # 等於 primary
            {"genre": "cozy", "score": 0.5, "chapters": [1]},
            {"genre": "romance", "score": 1.5, "chapters": [1]},
            {"genre": "romance", "score": "0.5", "chapters": [1]},
            {"genre": "romance", "score": True, "chapters": [1]},
            {"genre": "romance", "score": 0.5, "chapters": "1"},
            {"genre": "romance", "score": 0.5, "chapters": [1, "2"]},
            "x",
        ]
        assert parse_genre_response(response(mixed=mixed))["mixed"] == [good]

    def test_mixed_not_a_list(self):
        with pytest.raises(ValueError, match="mixed"):
            parse_genre_response(response(mixed="none"))


@pytest.fixture
async def env(tmp_path) -> AsyncIterator[tuple]:
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    sf = make_session_factory(engine)
    chapters = [
        Chapter(
            number=n,
            title=f"第{n}章",
            paragraphs=[Paragraph(id=f"p{n}", text=f"第{n}章的正文。", chapter_number=n, position=0)],
        )
        for n in (1, 2, 3, 4)
    ]
    doc = Document(
        id="book-s3", title="測試書", author=None, file_path="x.txt", file_type=FileType.TXT,
        chapters=chapters, language="zh-TW",
    )
    async with sf() as session, session.begin():
        await save_book(session, doc)
    try:
        yield sf, doc
    finally:
        await engine.dispose()


async def seed_s1b(sf, doc: Document, outputs: dict[int, dict]) -> None:
    """`outputs`：章號 → s1b 輸出。"""
    units = build_units(doc)
    async with sf() as session, session.begin():
        await seed_units(session, "s1b", units)
        for unit in units:
            if unit.chapter in outputs:
                row = await session.get(IngestUnitRow, (doc.id, "s1b", unit.id))
                await save_output(session, row, outputs[unit.chapter], model="m", prompt_version="1")
                row.status = "done"


SIGNALS = {
    1: s1b(sig("info_control", "strong", "線索一")),
    2: s1b(sig("info_control"), sig("threat", "strong", "威脅一")),
    3: s1b(sig("info_control", "strong", "線索三")),
    4: s1b(),
}


async def runs(sf) -> list[Run]:
    async with sf() as session:
        return list(await session.scalars(select(Run)))


class TestRunS3:
    async def test_writes_genre_profile_with_program_density(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(
            response(
                mixed=[{"genre": "thriller", "score": 0.4, "chapters": [2]}, {"genre": "x", "score": 1, "chapters": []}]
            )
        )

        profile = await run_s3(sf, doc.id, llm=llm, model_id="fake:model", job_id="j1")

        async with sf() as session:
            book = await session.get(BookRow, doc.id)
        assert book.genre_profile == profile
        assert set(profile) == {"primary", "mixed", "mechanism_density", "rationale", "detected_by", "detected_at"}
        assert profile["primary"] == "mystery"
        assert profile["mixed"] == [{"genre": "thriller", "score": 0.4, "chapters": [2]}]
        assert profile["rationale"] == "理由"
        assert profile["detected_by"] == "fake:model"
        assert profile["detected_at"].endswith("+00:00")
        # 程式值（3/4、1/4、其餘 0），不是 LLM 抄回來的 0.99
        assert profile["mechanism_density"] == dict.fromkeys(MECHANISMS, 0.0) | {
            "info_control": 0.75,
            "threat": 0.25,
        }
        assert book.genre_override is None

    async def test_prompt_carries_inputs(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(response())
        await run_s3(sf, doc.id, llm=llm)

        user = llm.messages[1].content
        assert "TITLE: 測試書" in user and "AUTHOR: (unknown)" in user
        assert "| info_control | 0.75 | 0.67 | 1-3 |" in user
        assert '[threat, ch 2] "威脅一"' in user
        assert "第1章的正文。" in user

    async def test_run_record(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        await run_s3(sf, doc.id, llm=FakeLlm(response()), model_id="fake:model", job_id="j1")

        (run,) = await runs(sf)
        assert (run.ref_id, run.status, run.model, run.job_id) == ("ingest.s3", "done", "fake:model", "j1")
        assert run.prompt_version == "1"
        assert run.started_at is not None and run.finished_at is not None
        assert run.summary_json["primary"] == "mystery"
        assert run.summary_json["density"]["info_control"] == {
            "density": 0.75, "strong_share": 0.67, "chapters": [1, 3],
        }

    async def test_rerun_overwrites_profile_keeps_override(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        await run_s3(sf, doc.id, llm=FakeLlm(response()))
        async with sf() as session, session.begin():
            await set_genre_override(session, doc.id, "horror")
        await run_s3(sf, doc.id, llm=FakeLlm(response(primary="thriller")))

        async with sf() as session:
            book = await session.get(BookRow, doc.id)
        assert book.genre_profile["primary"] == "thriller"
        assert book.genre_override == "horror"
        assert len(await runs(sf)) == 2

    async def test_invalid_primary_retried_then_succeeds(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(response(primary="cozy"), "不是 JSON", response(primary="horror"))

        profile = await run_s3(sf, doc.id, llm=llm, retry_delay=0)

        assert profile["primary"] == "horror" and llm.calls == 3

    async def test_fails_after_max_attempts(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(response(primary="cozy"))

        with pytest.raises(ValueError, match="primary"):
            await run_s3(sf, doc.id, llm=llm, retry_delay=0)

        assert llm.calls == MAX_ATTEMPTS
        async with sf() as session:
            assert (await session.get(BookRow, doc.id)).genre_profile is None
        assert await runs(sf) == []

    async def test_rate_limit_raises_quota_paused_without_retry(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(RuntimeError("Error code: 429 - quota exceeded"))

        with pytest.raises(QuotaPaused):
            await run_s3(sf, doc.id, llm=llm, retry_delay=0)
        assert llm.calls == 1

    async def test_blocked_is_not_retried(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        llm = FakeLlm(LLMResponseBlocked("provider_blocked", "SAFETY"))

        with pytest.raises(LLMResponseBlocked):
            await run_s3(sf, doc.id, llm=llm, retry_delay=0)
        assert llm.calls == 1

    async def test_no_s1b_output_returns_none_without_calling_llm(self, env):
        sf, doc = env
        llm = FakeLlm(response())
        assert await run_s3(sf, doc.id, llm=llm) is None
        assert llm.calls == 0 and await runs(sf) == []

    async def test_outputs_without_signals_key_count_as_no_input(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, {1: {"unit": "x"}, 2: {"unit": "y"}})
        llm = FakeLlm(response())
        assert await run_s3(sf, doc.id, llm=llm) is None
        assert llm.calls == 0

    async def test_zero_signals_overall_skips(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, {1: s1b(), 2: s1b()})
        llm = FakeLlm(response())
        assert await run_s3(sf, doc.id, llm=llm) is None
        assert llm.calls == 0

    async def test_unknown_book(self, env):
        sf, _ = env
        with pytest.raises(LookupError):
            await run_s3(sf, "nope", llm=FakeLlm(response()))


class TestSetGenreOverride:
    async def test_set_and_clear_without_touching_profile(self, env):
        sf, doc = env
        await seed_s1b(sf, doc, SIGNALS)
        profile = await run_s3(sf, doc.id, llm=FakeLlm(response()))

        async with sf() as session, session.begin():
            await set_genre_override(session, doc.id, "thriller")
        async with sf() as session:
            book = await get_book(session, doc.id)
        assert book.genre_override == "thriller" and book.genre_profile == profile

        async with sf() as session, session.begin():
            await set_genre_override(session, doc.id, None)
        async with sf() as session:
            book = await get_book(session, doc.id)
        assert book.genre_override is None and book.genre_profile == profile

    async def test_unknown_genre(self, env):
        sf, doc = env
        async with sf() as session, session.begin():
            with pytest.raises(ValueError):
                await set_genre_override(session, doc.id, "cozy")

    async def test_unknown_book(self, env):
        sf, _ = env
        async with sf() as session, session.begin():
            with pytest.raises(LookupError):
                await set_genre_override(session, "nope", "mystery")


class S1Call:
    """假的 S1 stage：s1a 回空殼，s1b 每個單位標一個 info_control strong。"""

    def __init__(self, stage: str) -> None:
        self.stage = stage
        self.calls: list[str] = []

    async def __call__(self, unit):
        self.calls.append(unit.id)
        if self.stage == "s1a":
            return {"characters": [], "events": [], "relation_states": [], "utterances": []}
        return s1b(sig("info_control", "strong", f"線索{unit.chapter}"))


class TestJob:
    async def run_job(self, tmp_path, genre_llm):
        engine = create_engine(tmp_path / "neo.db")
        await init_db(engine)
        sf = make_session_factory(engine)
        path = tmp_path / "七日.txt"
        path.write_text(BOOK_TEXT, encoding="utf-8")
        a, b = S1Call("s1a"), S1Call("s1b")
        stages = [UnitStage(name=n, call=c, model="m", prompt_version="1") for n, c in (("s1a", a), ("s1b", b))]
        async with open_checkpointer(tmp_path / "ckpt.db") as saver:
            service = IngestService(
                sf,
                saver,
                stages=stages,
                retry_delay=0,
                concurrency=1,
                genre_llm=genre_llm,
                deep_llm=FakeLlm(json.dumps({"hidden_truth": [], "reveal": []})),
                consolidate_llm=FakeLlm("{}"),
            )
            job_id = await service.create_job(path)
            await service.run_to_review(job_id)
            async with sf() as session:
                job = await session.get(Job, job_id)
            await service.submit_review(job.book_id, {})
            yield service, sf, job_id, a, b
        await engine.dispose()

    async def test_genre_in_result(self, tmp_path):
        llm = FakeLlm(response(primary="adventure"))
        async for _, sf, job_id, _, _ in self.run_job(tmp_path, llm):
            async with sf() as session:
                job = await session.get(Job, job_id)
                book = await session.get(BookRow, job.book_id)
            assert (job.status, job.stage) == ("done", "s4")  # S3 之後接 S4
            assert job.result_json["genre"] == "adventure"
            assert book.genre_profile["mechanism_density"]["info_control"] == 1.0
            assert [r.ref_id for r in await runs(sf)] == ["ingest.s2", "ingest.s3", "ingest.s4"]

    async def test_429_pauses_then_resume_reruns_only_s3(self, tmp_path):
        llm = FakeLlm(RuntimeError("Error code: 429 - quota exceeded"), response(primary="horror"))
        async for service, sf, job_id, a, b in self.run_job(tmp_path, llm):
            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "paused_quota" and job.stage == "s3"
            assert job.error is None
            s1_calls = len(a.calls) + len(b.calls)
            assert s1_calls == 14

            await service.resume(job_id)

            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "done", job.error
            assert job.result_json["genre"] == "horror"
            assert llm.calls == 2
            assert len(a.calls) + len(b.calls) == s1_calls
            async with sf() as session:
                rows = list(await session.scalars(select(IngestUnitRow)))
            assert all(r.status == "done" for r in rows)

    async def test_s3_exhausted_retries_make_job_error(self, tmp_path):
        llm = FakeLlm(response(primary="cozy"))
        async for _, sf, job_id, _, _ in self.run_job(tmp_path, llm):
            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "error" and "primary" in job.error
            assert llm.calls == MAX_ATTEMPTS
