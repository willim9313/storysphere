"""S4 整合測試：真實 SQLite（tmp_path）＋合成小書＋假 llm；job 層級的 429 續跑。"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy import select
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.ingest.s4 import run_s4
from storysphere.ingest.service import IngestService, open_checkpointer
from storysphere.ingest.unit_runner import QuotaPaused, UnitStage
from storysphere.ingest.units import build_units
from storysphere.store.books import (
    BookParagraphSource,
    save_book,
    set_genre_override,
    set_genre_profile,
)
from storysphere.store.content_tables import get_content
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    QuoteDraft,
    WriteContext,
    write_evidence,
)
from storysphere.store.ingest_units import (
    IngestUnitOutputRow,
    IngestUnitRow,
    save_output,
    seed_units,
)
from storysphere.store.tables import (
    Evidence,
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    Job,
    Run,
)

from tests.ingest.test_unit_runner import BOOK_TEXT
from tests.methods.support import no_method_engine

BOOK_ID = "book-s4"
PARAS = {
    1: "管家老周說昨夜書房的門從裡面反鎖了，沒有人知道主人去了哪裡。偵探林默注意到門縫下有一抹紅色的蠟。",
    2: "林默在壁爐裡發現了一張燒了一半的信紙，上面是周小明的筆跡。老周低聲說他什麼也沒看見。",
    3: "最後林默當眾宣布：主人是被老周用毒酒害死的，他從窗外爬進去再爬出來，製造了密室的假象。",
    4: "尾聲，莊園恢復了平靜，沒有任何值得一提的事。",
}


def make_book() -> Document:
    chapters = [
        Chapter(
            number=n,
            title=f"第{n}章",
            paragraphs=[Paragraph(id=f"p{n}", text=text, chapter_number=n, position=0)],
        )
        for n, text in PARAS.items()
    ]
    return Document(
        id=BOOK_ID,
        title="測試書",
        file_path="x.txt",
        file_type=FileType.TXT,
        chapters=chapters,
        language="zh-TW",
    )


def s1b_with(*signals) -> dict:
    return {"focalization": None, "imagery": [], "book_setting_hints": [], "signals": list(signals)}


IC = {"mechanism": "info_control", "strength": "strong", "subtags": ["clue"], "quote": "q"}
S1B = {
    1: s1b_with(IC),
    2: s1b_with({**IC, "strength": "weak"}),
    3: s1b_with(IC),
    4: s1b_with({**IC, "mechanism": "threat"}),
}
PROFILE = {"primary": "mystery", "mixed": [], "mechanism_density": {}, "rationale": "r"}


class Llm:
    """依 `reply(messages)` 回覆；記下每次的 messages。reply 回例外時丟出。"""

    def __init__(self, reply) -> None:
        self.reply = reply
        self.calls: list[list] = []

    async def ainvoke(self, messages):
        self.calls.append(messages)
        out = self.reply(messages, len(self.calls))
        if isinstance(out, Exception):
            raise out
        return AIMessage(
            content=out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)
        )


@pytest.fixture
async def env(tmp_path) -> AsyncIterator[tuple]:
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    sf = make_session_factory(engine)
    doc = make_book()
    async with sf() as session, session.begin():
        await save_book(session, doc)
    try:
        yield sf, doc
    finally:
        await engine.dispose()


async def seed_book(sf, doc, *, profile=PROFILE, s1b=S1B) -> dict[str, str]:
    """S2 的角色證據、`s1b` 輸出與 `genre_profile`；回傳 名字 → 角色 id。"""
    ids: dict[str, str] = {}
    async with sf() as session, session.begin():
        source = BookParagraphSource(session)
        ctx = WriteContext(book_id=doc.id, source="extraction", produced_via="pipeline")
        for name, chapter in (("林默", 1), ("老周", 1), ("周小明", 2)):
            evidence = await write_evidence(
                session,
                ctx,
                EvidenceDraft(
                    claim_type="character",
                    summary=name,
                    confidence=0.8,
                    content={"canonical_name": name, "kind": "person", "first_chapter": chapter},
                    quotes=[QuoteDraft(paragraph_id=f"p{chapter}", text=name)],
                ),
                source,
            )
            ids[name] = evidence.id
        if profile is not None:
            await set_genre_profile(session, doc.id, profile)
        units = build_units(doc)
        await seed_units(session, "s1b", units)
        for unit in units:
            row = await session.get(IngestUnitRow, (doc.id, "s1b", unit.id))
            await save_output(session, row, s1b[unit.chapter], model="m", prompt_version="2")
            row.status = "done"
    return ids


def deep_reply(ids: dict[str, str]):
    """每個單位的 S4a 回應（依段落內容判斷是哪個單位）。"""
    by_chapter = {
        1: {
            "hidden_truth": [
                {
                    "statement": "主人去了哪裡、門為何從裡面反鎖",
                    "truth_kind": "how",
                    "concealer_ids": [ids["老周"]],
                    "concealed_from": "both",
                    "quote": "門從裡面反鎖了",
                }
            ],
            "reveal": [],
            "clue_points_to": [
                {
                    "clue_summary": "門縫下的一抹紅蠟",
                    "points_to_ids": ["老周"],
                    "reader_visible": True,
                    "noticed_by_ids": [ids["林默"]],
                    "quote": "門縫下有一抹紅色的蠟",
                }
            ],
            "trick": [],
            "character_roles": [],
        },
        2: {
            "hidden_truth": [],
            "reveal": [],
            "clue_points_to": [
                {
                    "clue_summary": "燒了一半的信紙上是周小明的筆跡",
                    "points_to_ids": [ids["周小明"]],
                    "reader_visible": True,
                    "noticed_by_ids": [ids["林默"]],
                    "quote": "上面是周小明的筆跡",
                }
            ],
            "trick": [],
        },
        3: {
            "hidden_truth": [],
            "reveal": [
                {
                    "statement": "主人是被老周用毒酒害死的",
                    "revealer_id": ids["林默"],
                    "audience": "both",
                    "reveal_method": "deduction",
                    "quote": "主人是被老周用毒酒害死的",
                }
            ],
            "clue_points_to": [],
            "trick": [
                {
                    "description": "從窗外爬進去再爬出來，佈置成密室",
                    "trick_category": "entry_exit",
                    "quote": "他從窗外爬進去再爬出來",
                }
            ],
        },
    }

    def reply(messages, _n):
        user = messages[1].content
        for chapter, out in by_chapter.items():
            if PARAS[chapter] in user:
                return out
        raise AssertionError(f"unexpected passage: {user[-80:]}")

    return reply


def consolidate_reply(ids: dict[str, str]):
    def reply(messages, _n):
        return {
            "truths": [
                {
                    "truth_id": "t1",
                    "statement": "老周用毒酒殺害主人並佈置成密室",
                    "truth_kind": "how",
                    "concealer_ids": [ids["老周"]],
                    "concealed_from": "both",
                    "merged_candidate_ids": ["cand_1"],
                    "reveal_candidate_ids": ["cand_4"],
                }
            ],
            "clues": [
                {"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": False},
                {"candidate_id": "cand_3", "truth_id": "t1", "is_misdirection": True},
            ],
            "tricks": [{"candidate_id": "cand_5", "truth_id": "t1"}],
            "dropped": [],
        }

    return reply


async def evidence_rows(
    sf, claim_type: str | None = None, status: str = "current"
) -> list[Evidence]:
    async with sf() as session:
        stmt = select(Evidence).where(Evidence.status == status, Evidence.run_id.is_not(None))
        if claim_type:
            stmt = stmt.where(Evidence.claim_type == claim_type)
        else:
            stmt = stmt.where(Evidence.claim_type != "character")
        return list(await session.scalars(stmt))


async def content_of(sf, claim_type: str, evidence_id: str) -> dict:
    async with sf() as session:
        return await get_content(session, claim_type, evidence_id)


async def go(sf, doc, ids, **kw):
    deep, cons = Llm(deep_reply(ids)), Llm(consolidate_reply(ids))
    report = await run_s4(
        sf, doc.id, deep_llm=deep, consolidate_llm=cons, retry_delay=0, concurrency=1, **kw
    )
    return report, deep, cons


class TestRunS4:
    async def test_writes_the_four_types_at_level_1_linked_to_the_truth(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        report, deep, cons = await go(sf, doc, ids)

        assert len(deep.calls) == 3 and len(cons.calls) == 1  # 第 4 章只有 threat、不讀
        rows = await evidence_rows(sf)
        assert sorted(r.claim_type for r in rows) == [
            "clue_points_to",
            "clue_points_to",
            "hidden_truth",
            "reveal",
            "trick",
        ]
        assert all(
            r.level == 1 and r.source == "extraction" and r.produced_via == "pipeline" for r in rows
        )
        async with sf() as session:
            assert list(await session.scalars(select(EvidenceLink))) == []  # 沒用 derived_from 連

        (truth,) = [r for r in rows if r.claim_type == "hidden_truth"]
        (reveal,) = [r for r in rows if r.claim_type == "reveal"]
        (trick,) = [r for r in rows if r.claim_type == "trick"]
        clues = {
            (await content_of(sf, "clue_points_to", r.id))["clue_summary"]: await content_of(
                sf, "clue_points_to", r.id
            )
            for r in rows
            if r.claim_type == "clue_points_to"
        }

        truth_content = await content_of(sf, "hidden_truth", truth.id)
        assert truth_content["statement"] == "老周用毒酒殺害主人並佈置成密室"
        assert truth_content["truth_kind"] == "how" and truth_content["concealed_from"] == "both"
        assert truth_content["concealer_ids"] == [ids["老周"]]
        assert truth_content["reveal_id"] == reveal.id
        assert truth.discourse_chapter == 3 and truth.known_by == {
            "reader": False,
            "characters": [],
        }

        reveal_content = await content_of(sf, "reveal", reveal.id)
        assert (
            reveal_content["hidden_truth_id"] == truth.id
            and reveal_content["revealer_id"] == ids["林默"]
        )
        assert (await content_of(sf, "trick", trick.id))["hidden_truth_id"] == truth.id
        assert (await content_of(sf, "trick", trick.id))["trick_category"] == "entry_exit"

        red, letter = clues["門縫下的一抹紅蠟"], clues["燒了一半的信紙上是周小明的筆跡"]
        assert red["points_to_truth_id"] == letter["points_to_truth_id"] == truth.id
        assert red["is_misdirection"] is False and letter["is_misdirection"] is True
        assert red["points_to_ids"] == [ids["老周"]]  # 名字換成 id
        assert red["reader_visible"] is True

        assert report.written == {"hidden_truth": 1, "reveal": 1, "clue_points_to": 2, "trick": 1}

    async def test_quotes_have_paragraph_and_offsets(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        await go(sf, doc, ids)
        async with sf() as session:
            quotes = list(
                await session.scalars(
                    select(EvidenceQuote)
                    .join(Evidence, Evidence.id == EvidenceQuote.evidence_id)
                    .where(Evidence.claim_type != "character")
                )
            )
        assert quotes and all(
            q.verified and q.start is not None and q.end is not None for q in quotes
        )
        assert all(PARAS[int(q.paragraph_id[1:])][q.start : q.end] == q.text for q in quotes)

    async def test_mystery_extension_in_genre_ext(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        await go(sf, doc, ids)
        (truth,) = await evidence_rows(sf, "hidden_truth")
        async with sf() as session:
            exts = list(await session.scalars(select(EvidenceGenreExt)))
        assert [(e.evidence_id, e.genre) for e in exts] == [(truth.id, "mystery")]
        assert exts[0].data_json == {
            "case_type": "other",
            "mystery_type": "howdunit",
            "victim_ids": [],
        }

    async def test_unit_outputs_and_run_record(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        report, _, _ = await go(sf, doc, ids, job_id="j1")

        async with sf() as session:
            outputs = list(
                await session.scalars(
                    select(IngestUnitOutputRow).where(IngestUnitOutputRow.stage == "s4a")
                )
            )
            unit_rows = list(
                await session.scalars(select(IngestUnitRow).where(IngestUnitRow.stage == "s4a"))
            )
            (run,) = (await session.scalars(select(Run).where(Run.ref_id == "ingest.s4"))).all()
        assert len(outputs) == 3 and all(o.prompt_version == "1+m1" for o in outputs)
        assert {r.status for r in unit_rows} == {"done"} and len(unit_rows) == 3
        assert (run.status, run.job_id, run.prompt_version) == (
            "done",
            "j1",
            "deep=1+m1;consolidate=1",
        )
        assert run.summary_json["written"]["clue_points_to"] == 2
        assert run.summary_json["quotes_total"] == run.summary_json["quotes_verified"] == 5
        assert report.run_id == run.id and report.units_selected == 3

    async def test_rerun_replaces_the_old_batch_without_calling_s4a_again(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        await go(sf, doc, ids)
        first = {r.id for r in await evidence_rows(sf)}
        _, deep, cons = await go(sf, doc, ids)

        assert deep.calls == [] and len(cons.calls) == 1
        assert {r.id for r in await evidence_rows(sf)}.isdisjoint(first)
        assert {r.id for r in await evidence_rows(sf, status="superseded")} == first
        async with sf() as session:
            assert (
                len(list(await session.scalars(select(Run).where(Run.ref_id == "ingest.s4")))) == 2
            )

    async def test_s4b_gets_summaries_and_quotes_but_not_the_full_text(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        _, _, cons = await go(sf, doc, ids)
        user = cons.calls[0][1].content
        assert "IS_MYSTERY: true" in user
        assert '"id": "cand_1"' in user and "門從裡面反鎖了" in user
        assert "沒有人知道主人去了哪裡" not in user  # 引文以外的原文不給
        assert json.dumps({"id": ids["老周"], "name": "老周"}, ensure_ascii=False) in user

    async def test_skips_without_calling_llm(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc, profile=None)
        report, deep, cons = await go(sf, doc, ids)
        assert report is None and deep.calls == [] and cons.calls == []

    async def test_skips_when_no_unit_has_info_control(self, env):
        sf, doc = env
        threat = {**IC, "mechanism": "threat"}
        ids = await seed_book(sf, doc, s1b={n: s1b_with(threat) for n in S1B})
        report, deep, cons = await go(sf, doc, ids)
        assert report is None and deep.calls == [] and cons.calls == []
        assert await evidence_rows(sf) == []

    async def test_non_mystery_genre_sends_no_mystery_extension(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc, profile={**PROFILE, "primary": "adventure"})

        def reply(messages, _n):
            return {"hidden_truth": [], "reveal": []}

        deep, cons = Llm(reply), Llm(consolidate_reply(ids))
        report = await run_s4(
            sf, doc.id, deep_llm=deep, consolidate_llm=cons, retry_delay=0, concurrency=1
        )
        system = deep.calls[0][0].content
        assert "clue_points_to" not in system and "detective story" not in system
        assert report.mystery_extension is False and cons.calls == []  # 沒有候選就不叫 S4b
        assert await evidence_rows(sf) == []

    async def first_system(self, sf, doc, ids) -> str:
        """清掉 S4a 的斷點後重跑，取第一個單位送出的 system prompt。"""
        async with sf() as session, session.begin():
            for row in await session.scalars(
                select(IngestUnitRow).where(IngestUnitRow.stage == "s4a")
            ):
                row.status = "pending"
        deep = Llm(deep_reply(ids))
        cons = Llm(consolidate_reply(ids))
        await run_s4(sf, doc.id, deep_llm=deep, consolidate_llm=cons, retry_delay=0, concurrency=1)
        return deep.calls[0][0].content

    async def test_extension_follows_override_and_mixed(self, env):
        sf, doc = env
        marker = "This book is (at least partly) a detective story."
        ids = await seed_book(sf, doc, profile={**PROFILE, "primary": "adventure"})

        # 非推理：S4a 的回應沒有 clue_points_to／trick 也算完整，所以假 llm 要回簡版。
        plain = Llm(lambda *_: {"hidden_truth": [], "reveal": []})
        await run_s4(
            sf,
            doc.id,
            deep_llm=plain,
            consolidate_llm=Llm(consolidate_reply(ids)),
            retry_delay=0,
            concurrency=1,
        )
        assert marker not in plain.calls[0][0].content

        async with sf() as session, session.begin():
            await set_genre_override(session, doc.id, "mystery")  # override 優先
        assert marker in await self.first_system(sf, doc, ids)

        async with sf() as session, session.begin():
            await set_genre_override(session, doc.id, "horror")
            await set_genre_profile(
                session,
                doc.id,
                {
                    **PROFILE,
                    "primary": "adventure",
                    "mixed": [{"genre": "mystery", "score": 0.3, "chapters": [1]}],
                },
            )
        assert marker in await self.first_system(sf, doc, ids)  # 混入元素含推理

    async def test_failed_unit_does_not_stop_the_rest(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        inner = deep_reply(ids)

        def reply(messages, n):
            if PARAS[2] in messages[1].content:
                return "不是 JSON"
            return inner(messages, n)

        cons = Llm(consolidate_reply(ids))
        report = await run_s4(
            sf, doc.id, deep_llm=Llm(reply), consolidate_llm=cons, retry_delay=0, concurrency=1
        )
        assert report.failed_units == [f"{BOOK_ID}:2:0"] and report.units_extracted == 2
        assert report.written["clue_points_to"] == 1

    async def test_unverifiable_quote_is_not_stored_and_counted(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        inner = deep_reply(ids)

        def reply(messages, n):
            out = inner(messages, n)
            if PARAS[2] in messages[1].content:
                out["clue_points_to"][0]["quote"] = "原文裡沒有這句話"
            return out

        report = await run_s4(
            sf,
            doc.id,
            deep_llm=Llm(reply),
            consolidate_llm=Llm(consolidate_reply(ids)),
            retry_delay=0,
            concurrency=1,
        )
        assert report.written["clue_points_to"] == 1
        assert report.dropped["quote_not_found"] == 1
        assert report.quotes_total == 5 and report.quotes_verified == 4

    async def test_dirty_s4b_response_does_not_fail_s4(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)

        def reply(messages, _n):
            return {
                "truths": [
                    {
                        "truth_id": "t1",
                        "statement": "真相",
                        "truth_kind": "???",
                        "concealed_from": "nobody",
                        "concealer_ids": "x",
                        "merged_candidate_ids": ["cand_1", "ghost"],
                        "reveal_candidate_ids": ["cand_4", "cand_1"],
                    },
                    7,
                ],
                "clues": [
                    {"candidate_id": "cand_2", "truth_id": "nope", "is_misdirection": "maybe"}
                ],
                "tricks": [{"candidate_id": "cand_5", "truth_id": "nope"}],
                "dropped": ["cand_3", 5],
            }

        report = await run_s4(
            sf,
            doc.id,
            deep_llm=Llm(deep_reply(ids)),
            consolidate_llm=Llm(reply),
            retry_delay=0,
            concurrency=1,
        )
        assert report.written == {"hidden_truth": 1, "reveal": 1, "clue_points_to": 1}
        (truth,) = await evidence_rows(sf, "hidden_truth")
        content = await content_of(sf, "hidden_truth", truth.id)
        assert content["truth_kind"] == "other" and content["raw_label"] == "???"
        assert content["concealed_from"] == "both"
        assert (
            report.dropped["consolidation_dropped"] == 1 and report.dropped["truth_unlinked"] == 1
        )

    async def test_batches_carry_earlier_truths_forward(self, env, monkeypatch):
        sf, doc = env
        ids = await seed_book(sf, doc)
        monkeypatch.setattr("storysphere.ingest.s4.runner.BATCH_SIZE", 3)

        def reply(messages, n):
            user = messages[1].content
            if n == 1:
                assert "prior_" not in user and "cand_4" not in user
                return {
                    "truths": [
                        {"truth_id": "t1", "statement": "問題", "merged_candidate_ids": ["cand_1"]}
                    ],
                    "clues": [
                        {"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": False},
                        {"candidate_id": "cand_3", "truth_id": "t1", "is_misdirection": False},
                    ],
                }
            assert '"id": "prior_T1"' in user and '"id": "cand_4"' in user
            return {
                "truths": [
                    {
                        "truth_id": "t9",
                        "statement": "答案",
                        "merged_candidate_ids": ["prior_T1"],
                        "reveal_candidate_ids": ["cand_4"],
                    }
                ],
                "clues": [],
                "tricks": [{"candidate_id": "cand_5", "truth_id": "t9"}],
            }

        cons = Llm(reply)
        report = await run_s4(
            sf,
            doc.id,
            deep_llm=Llm(deep_reply(ids)),
            consolidate_llm=cons,
            retry_delay=0,
            concurrency=1,
        )

        assert len(cons.calls) == 2 and report.batches == 2
        (truth,) = await evidence_rows(sf, "hidden_truth")
        assert (await content_of(sf, "hidden_truth", truth.id))["statement"] == "答案"
        (reveal,) = await evidence_rows(sf, "reveal")
        (trick,) = await evidence_rows(sf, "trick")
        assert (await content_of(sf, "reveal", reveal.id))["hidden_truth_id"] == truth.id
        assert (await content_of(sf, "trick", trick.id))["hidden_truth_id"] == truth.id
        assert (await content_of(sf, "hidden_truth", truth.id))["reveal_id"] == reveal.id
        assert report.written["clue_points_to"] == 2

    async def test_429_in_s4a_raises_quota_paused_and_keeps_done_units(self, env):
        sf, doc = env
        ids = await seed_book(sf, doc)
        inner = deep_reply(ids)

        def reply(messages, n):
            if PARAS[2] in messages[1].content:
                return RuntimeError("Error code: 429 - quota exceeded")
            return inner(messages, n)

        with pytest.raises(QuotaPaused):
            await run_s4(
                sf,
                doc.id,
                deep_llm=Llm(reply),
                consolidate_llm=Llm(consolidate_reply(ids)),
                retry_delay=0,
                concurrency=1,
            )
        async with sf() as session:
            statuses = {
                r.unit_id: r.status
                for r in await session.scalars(
                    select(IngestUnitRow).where(IngestUnitRow.stage == "s4a")
                )
            }
        assert statuses == {
            f"{BOOK_ID}:1:0": "done",
            f"{BOOK_ID}:2:0": "pending",
            f"{BOOK_ID}:3:0": "pending",
        }
        assert await evidence_rows(sf) == []


class S1Call:
    def __init__(self, stage: str) -> None:
        self.stage = stage

    async def __call__(self, unit):
        if self.stage == "s1a":
            return {"characters": [], "events": [], "relation_states": [], "utterances": []}
        return s1b_with({**IC, "quote": f"線索{unit.chapter}"})


GENRE_REPLY = json.dumps({"primary": "mystery", "mixed": [], "rationale": "r"})


class TestJob:
    async def run_job(self, tmp_path, deep_reply_fn, cons_reply_fn):
        engine = create_engine(tmp_path / "neo.db")
        await init_db(engine)
        sf = make_session_factory(engine)
        path = tmp_path / "七日.txt"
        path.write_text(BOOK_TEXT, encoding="utf-8")
        stages = [
            UnitStage(name=n, call=S1Call(n), model="m", prompt_version="1") for n in ("s1a", "s1b")
        ]
        genre, deep, cons = Llm(lambda *_: GENRE_REPLY), Llm(deep_reply_fn), Llm(cons_reply_fn)
        async with open_checkpointer(tmp_path / "ckpt.db") as saver:
            service = IngestService(
                sf,
                saver,
                stages=stages,
                retry_delay=0,
                concurrency=1,
                genre_llm=genre,
                deep_llm=deep,
                consolidate_llm=cons,
                method_engine=no_method_engine(sf),  # S5 不跑真的方法
            )
            job_id = await service.create_job(path)
            await service.run_to_review(job_id)
            async with sf() as session:
                job = await session.get(Job, job_id)
            await service.submit_review(job.book_id, {})
            yield service, sf, job_id, deep, cons
        await engine.dispose()

    @staticmethod
    def ok_deep(messages, _n):
        return {
            "hidden_truth": [
                {
                    "statement": "誰在隱瞞",
                    "truth_kind": "who",
                    "concealer_ids": [],
                    "concealed_from": "reader",
                    "quote": "大門敞開著",
                }
            ],
            "reveal": [],
            "clue_points_to": [],
            "trick": [],
        }

    @staticmethod
    def ok_cons(messages, _n):
        found = re.findall(r'"id": "(cand_\d+)"', messages[1].content)
        return {
            "truths": [
                {
                    "truth_id": "t1",
                    "statement": "整體真相",
                    "truth_kind": "who",
                    "concealer_ids": [],
                    "concealed_from": "reader",
                    "merged_candidate_ids": found,
                }
            ],
            "clues": [],
            "tricks": [],
            "dropped": [],
        }

    async def test_runs_s4_after_s3(self, tmp_path):
        async for _, sf, job_id, deep, cons in self.run_job(tmp_path, self.ok_deep, self.ok_cons):
            async with sf() as session:
                job = await session.get(Job, job_id)
            assert (job.status, job.stage) == ("done", "s4"), job.error
            assert len(deep.calls) == 7 and len(cons.calls) == 1
            assert job.result_json["s4"]["written"] == {"hidden_truth": 1}
            assert job.result_json["failedUnitCount"] == 0
            assert len(await evidence_rows(sf, "hidden_truth")) == 1

    async def test_s4a_429_pauses_and_resume_runs_only_the_rest_then_s4b(self, tmp_path):
        def deep(messages, n):
            if n == 3:
                return RuntimeError("Error code: 429 - quota exceeded")
            return self.ok_deep(messages, n)

        async for service, sf, job_id, deep_llm, cons in self.run_job(tmp_path, deep, self.ok_cons):
            async with sf() as session:
                job = await session.get(Job, job_id)
                rows = list(
                    await session.scalars(select(IngestUnitRow).where(IngestUnitRow.stage == "s4a"))
                )
            assert (job.status, job.stage) == ("paused_quota", "s4") and job.error is None
            assert sorted(r.status for r in rows) == ["done"] * 2 + ["pending"] * 5
            assert len(deep_llm.calls) == 3 and cons.calls == []

            await service.resume(job_id)

            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "done", job.error
            assert len(deep_llm.calls) == 3 + 5  # 只補剩下的 5 個單位
            assert len(cons.calls) == 1
            assert job.result_json["s4"]["units_extracted"] == 7

    async def test_s4b_429_pauses_and_resume_does_not_call_s4a_again(self, tmp_path):
        def cons(messages, n):
            if n == 1:
                return RuntimeError("Error code: 429 - quota exceeded")
            return self.ok_cons(messages, n)

        async for service, sf, job_id, deep, cons_llm in self.run_job(tmp_path, self.ok_deep, cons):
            async with sf() as session:
                job = await session.get(Job, job_id)
            assert (job.status, job.stage) == ("paused_quota", "s4")
            assert len(deep.calls) == 7 and len(cons_llm.calls) == 1
            assert await evidence_rows(sf) == []

            await service.resume(job_id)

            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "done", job.error
            assert len(deep.calls) == 7 and len(cons_llm.calls) == 2
            assert len(await evidence_rows(sf, "hidden_truth")) == 1

    async def test_failed_s4a_units_are_counted_in_the_job(self, tmp_path):
        def deep(messages, n):
            if "第3天" in messages[1].content:
                return "壞掉"
            return self.ok_deep(messages, n)

        async for _, sf, job_id, _, _ in self.run_job(tmp_path, deep, self.ok_cons):
            async with sf() as session:
                job = await session.get(Job, job_id)
            assert job.status == "done"
            assert job.result_json["failedUnitCount"] == 1
