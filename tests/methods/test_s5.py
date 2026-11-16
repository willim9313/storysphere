"""S5 預設觸發：依題材挑結果卡、跳過未實作的、接進入庫圖。用正式的 registry 宣告。"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from storysphere.ingest.service import IngestService, open_checkpointer
from storysphere.ingest.unit_runner import UnitStage
from storysphere.methods.engine import MethodEngine, default_registry
from storysphere.methods.implementations import MethodImplementations
from storysphere.methods.s5 import has_s5_input, run_s5, select_s5_cards
from storysphere.store.books import BookRow, set_genre_override
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.tables import Job, Run

from tests.ingest import test_s4_run as s4t
from tests.ingest.test_unit_runner import BOOK_TEXT
from tests.methods.support import BOOK, CountingLlm, FakeMethod, seed

UNIVERSAL_REFS = [
    "event.kernel_satellite",
    "character.arc",
    "character.network",
    "structure.narrative_time",
    "theme.tension_line",
    "builtin.theme_synthesis",
]
MYSTERY_REFS = ["info.two_story", "info.fair_play_audit", "info.suspect_matrix", "character.belief"]


@pytest.fixture(scope="module")
def registry():
    return default_registry()


async def add_book(sf, *, profile=None, override=None, book_id: str = BOOK) -> None:
    async with sf() as session, session.begin():
        session.add(
            BookRow(id=book_id, title="t", file_path="x", file_type="txt",
                    genre_profile=profile, genre_override=override)
        )


def engine_with(sf, registry, *method_ids):
    impls = MethodImplementations()
    for method_id in method_ids:
        impls.register(FakeMethod(registry.methods[method_id]))
    llm = CountingLlm()
    return MethodEngine(
        sf, registry, impls, llm_factory=lambda _t: llm, model_info=lambda _t: (None, None)
    ), llm


class TestSelectCards:
    def test_universal_first_then_the_genre_perspective(self, registry):
        refs = [c.ref for c in select_s5_cards(registry, "mystery")]
        assert refs == UNIVERSAL_REFS + MYSTERY_REFS

    @pytest.mark.parametrize("genre", [None, "romance", "universal"])
    def test_genre_without_a_perspective_gets_the_universal_cards_only(self, registry, genre):
        assert [c.ref for c in select_s5_cards(registry, genre)] == UNIVERSAL_REFS

    def test_a_ref_in_both_perspectives_runs_once(self, registry):
        from storysphere.registry.models import Card

        perspective = registry.perspectives["mystery"]
        extra = Card(ref="character.arc", question="重複")
        try:
            perspective.cards.append(extra)
            refs = [c.ref for c in select_s5_cards(registry, "mystery")]
        finally:
            perspective.cards.remove(extra)
        assert refs.count("character.arc") == 1


class TestRunS5:
    async def test_genre_override_wins_over_the_profile(self, sf, registry):
        await add_book(sf, profile={"primary": "romance"}, override="mystery")
        engine, _ = engine_with(sf, registry)
        report = await run_s5(engine, BOOK)
        assert report.genre == "mystery"
        assert [c.ref for c in report.cards] == UNIVERSAL_REFS + MYSTERY_REFS

    async def test_profile_is_used_without_an_override(self, sf, registry):
        await add_book(sf, profile={"primary": "mystery"})
        engine, _ = engine_with(sf, registry)
        assert (await run_s5(engine, BOOK)).genre == "mystery"

    async def test_no_profile_runs_the_universal_cards_only(self, sf, registry):
        await add_book(sf)
        engine, _ = engine_with(sf, registry)
        report = await run_s5(engine, BOOK)
        assert report.genre is None and [c.ref for c in report.cards] == UNIVERSAL_REFS

    async def test_unimplemented_methods_are_skipped_and_recorded(self, sf, registry):
        await add_book(sf, profile={"primary": "mystery"})
        await seed(sf, "event")
        engine, llm = engine_with(sf, registry)
        report = await run_s5(engine, BOOK)
        assert {c.status for c in report.cards} == {"skipped"}
        reasons = {c.ref: c.reason for c in report.cards}
        assert reasons["builtin.theme_synthesis"] == "methodology"
        assert reasons["character.arc"] == "not_implemented"
        assert llm.calls == 0
        async with sf() as session:
            assert list(await session.scalars(select(Run))) == []

    async def test_implemented_card_runs_with_auto_trigger_and_the_rest_are_skipped(self, sf, registry):
        await add_book(sf, profile={"primary": "mystery"})
        await seed(sf, "relation_state")
        await seed(sf, "utterance")
        engine, llm = engine_with(sf, registry, "character.network")
        report = await run_s5(engine, BOOK, job_id="ingest-job")
        by_ref = {c.ref: c for c in report.cards}
        assert by_ref["character.network"].status == "done"
        assert sum(c.status == "skipped" for c in report.cards) == len(report.cards) - 1
        async with sf() as session:
            (run,) = list(await session.scalars(select(Run)))
        assert (run.ref_id, run.triggered_by, run.job_id) == ("character.network", "auto", "ingest-job")
        assert by_ref["character.network"].run_ids == [run.id] and llm.calls == 1

    async def test_a_card_whose_premise_fails_does_not_stop_the_others(self, sf, registry):
        await add_book(sf)
        await seed(sf, "relation_state")  # 缺 utterance → character.network 不適用
        engine, _ = engine_with(sf, registry, "character.network", "character.arc")
        report = await run_s5(engine, BOOK)
        by_ref = {c.ref: c.status for c in report.cards}
        assert by_ref["character.network"] == "not_applicable"
        assert by_ref["character.arc"] == "not_applicable"
        assert by_ref["theme.tension_line"] == "skipped"

    async def test_429_stops_and_flags_the_report(self, sf, registry):
        await add_book(sf)
        await seed(sf, "relation_state")
        await seed(sf, "utterance")
        impls = MethodImplementations()
        impls.register(FakeMethod(registry.methods["character.network"]))
        engine = MethodEngine(
            sf, registry, impls,
            llm_factory=lambda _t: CountingLlm(error=RuntimeError("429 quota")),
            model_info=lambda _t: (None, None),
        )
        report = await run_s5(engine, BOOK, job_id="j")
        assert report.quota_paused
        assert report.cards[-1].ref == "character.network"

    async def test_cards_already_done_in_this_job_are_not_rerun_on_resume(self, sf, registry):
        await add_book(sf)
        await seed(sf, "relation_state")
        await seed(sf, "utterance")
        engine, llm = engine_with(sf, registry, "character.network")
        await run_s5(engine, BOOK, job_id="j")
        report = await run_s5(engine, BOOK, job_id="j")
        assert {c.ref: c.reason for c in report.cards}["character.network"] == "already_done"
        assert llm.calls == 1


class TestHasInput:
    async def test_needs_some_current_evidence(self, sf):
        assert not await has_s5_input(sf, BOOK)
        await seed(sf, "event")
        assert await has_s5_input(sf, BOOK)


class TestIngestGraph:
    async def test_ingest_still_finishes_with_s5_and_records_the_skips(self, tmp_path):
        """入庫圖帶 S5：現在沒有任何真方法，S5 全部跳過，入庫照常完成。"""
        engine = create_engine(tmp_path / "neo.db")
        await init_db(engine)
        sf = make_session_factory(engine)
        path = tmp_path / "七日.txt"
        path.write_text(BOOK_TEXT, encoding="utf-8")
        stages = [
            UnitStage(name=n, call=s4t.S1Call(n), model="m", prompt_version="1")
            for n in ("s1a", "s1b")
        ]
        async with open_checkpointer(tmp_path / "ckpt.db") as saver:
            service = IngestService(
                sf, saver, stages=stages, retry_delay=0, concurrency=1,
                genre_llm=s4t.Llm(lambda *_: s4t.GENRE_REPLY),
                deep_llm=s4t.Llm(s4t.TestJob.ok_deep),
                consolidate_llm=s4t.Llm(s4t.TestJob.ok_cons),
            )
            job_id = await service.create_job(path)
            await service.run_to_review(job_id)
            async with sf() as session:
                book_id = (await session.get(Job, job_id)).book_id
            await service.submit_review(book_id, {})
        async with sf() as session:
            job = await session.get(Job, job_id)
            runs = list(await session.scalars(select(Run).where(Run.ref_id.like("%.%"))))
        await engine.dispose()

        assert (job.status, job.stage) == ("done", "s4"), job.error  # 全跳過：stage 不動
        s5 = job.result_json["s5"]
        assert s5["genre"] == "mystery" and not s5["quotaPaused"]
        assert [c["ref"] for c in s5["cards"]] == UNIVERSAL_REFS + MYSTERY_REFS
        assert {c["status"] for c in s5["cards"]} == {"skipped"}
        assert job.result_json["failedUnitCount"] == 0
        assert [r for r in runs if not r.ref_id.startswith("ingest.")] == []

    async def test_override_set_after_s3_selects_the_cards(self, sf, registry):
        await add_book(sf, profile={"primary": "romance"})
        await seed(sf, "event")
        async with sf() as session, session.begin():
            await set_genre_override(session, BOOK, "mystery")
        report = await run_s5(engine_with(sf, registry)[0], BOOK)
        assert [c.ref for c in report.cards][-4:] == MYSTERY_REFS
