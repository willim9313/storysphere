"""`run_stage(concurrency=)`：同一 stage 內並行、429 時不留 running、續跑不重叫已完成的單位。"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select
from storysphere.ingest.unit_runner import QuotaPaused, UnitStage, run_stage
from storysphere.ingest.units import IngestUnit, UnitParagraph
from storysphere.llm.router import LlmUnconfigured
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow

BOOK = "book-c"


def make_units(n: int) -> list[IngestUnit]:
    return [
        IngestUnit(
            id=f"{BOOK}:{i}:0",
            book_id=BOOK,
            chapter=i,
            language="zh",
            paragraphs=(UnitParagraph(id=f"p{i}", text=f"第{i}章"),),
        )
        for i in range(1, n + 1)
    ]


@pytest.fixture
async def sf(tmp_path) -> AsyncIterator:
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    try:
        yield make_session_factory(engine)
    finally:
        await engine.dispose()


async def rows(sf) -> list[IngestUnitRow]:
    async with sf() as session:
        return list(await session.scalars(select(IngestUnitRow).order_by(IngestUnitRow.chapter)))


class Probe:
    """記下同時在跑的呼叫數與每個單位被叫的次數。"""

    def __init__(self, delay: float = 0.02) -> None:
        self.delay = delay
        self.active = 0
        self.max_active = 0
        self.calls: dict[str, int] = {}

    async def __call__(self, unit: IngestUnit) -> dict:
        self.calls[unit.id] = self.calls.get(unit.id, 0) + 1
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(self.delay)
        finally:
            self.active -= 1
        return {"unit": unit.id}


def stage_of(call) -> UnitStage:
    return UnitStage(name="s4a", call=call, model="m", prompt_version="1")


class TestConcurrency:
    async def test_runs_in_parallel_but_not_above_the_limit(self, sf):
        probe = Probe()
        failed = await run_stage(sf, stage_of(probe), make_units(9), concurrency=3)

        assert failed == []
        assert probe.max_active == 3
        assert all(r.status == "done" for r in await rows(sf))

    async def test_default_is_sequential(self, sf):
        probe = Probe()
        await run_stage(sf, stage_of(probe), make_units(4))
        assert probe.max_active == 1

    async def test_failed_ids_follow_unit_order(self, sf):
        async def call(unit):
            if unit.chapter in (2, 5):
                raise ValueError("bad output")
            await asyncio.sleep(0.05 if unit.chapter == 2 else 0)
            return {}

        units = make_units(6)
        failed = await run_stage(sf, stage_of(call), units, concurrency=4, retry_delay=0)

        assert failed == [units[1].id, units[4].id]
        assert [r.status for r in await rows(sf)] == [
            "done",
            "failed",
            "done",
            "done",
            "failed",
            "done",
        ]

    async def test_only_not_done_units_run(self, sf):
        units = make_units(4)
        first = Probe()
        await run_stage(sf, stage_of(first), units[:2], concurrency=2)
        second = Probe()
        await run_stage(sf, stage_of(second), units, concurrency=2)
        assert set(second.calls) == {units[2].id, units[3].id}

    async def test_429_leaves_nothing_running_and_resume_skips_done_units(self, sf):
        units = make_units(6)
        attempts: dict[str, int] = {}

        async def call(unit):
            attempts[unit.id] = attempts.get(unit.id, 0) + 1
            if unit.chapter == 1:
                return {"unit": unit.id}  # 立刻完成
            if unit.chapter == 2 and attempts[unit.id] == 1:
                await asyncio.sleep(0.02)
                raise RuntimeError("Error code: 429 - quota exceeded")
            await asyncio.sleep(0.5 if attempts[unit.id] == 1 else 0)  # 第一輪被取消
            return {"unit": unit.id}

        with pytest.raises(QuotaPaused):
            await run_stage(sf, stage_of(call), units, concurrency=4, retry_delay=0)

        statuses = [r.status for r in await rows(sf)]
        assert "running" not in statuses and statuses[0] == "done"
        assert statuses.count("done") < 6

        done_before = {r.unit_id for r in await rows(sf) if r.status == "done"}
        before = dict(attempts)
        failed = await run_stage(sf, stage_of(call), units, concurrency=4, retry_delay=0)

        assert failed == []
        assert all(r.status == "done" for r in await rows(sf))
        assert all(attempts[u] == before[u] for u in done_before)  # 已 done 的沒有再叫
        async with sf() as session:
            assert len(list(await session.scalars(select(IngestUnitOutputRow)))) == 6

    async def test_llm_unconfigured_aborts_the_stage(self, sf):
        async def call(unit):
            await asyncio.sleep(0.01)
            raise LlmUnconfigured("deep_extraction")

        with pytest.raises(LlmUnconfigured):
            await run_stage(sf, stage_of(call), make_units(4), concurrency=2, retry_delay=0)
        assert all(r.status in ("pending", "done") for r in await rows(sf))
