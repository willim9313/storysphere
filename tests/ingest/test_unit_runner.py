"""單位斷點續跑（02 §7）：額度暫停、續跑、重試 3 次、被拒不重試、重啟後標 interrupted。

真實 SQLite 與 checkpoint 檔（tmp_path）；LLM 呼叫用假的 `UnitStage.call`。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from sqlalchemy import select
from storysphere.ingest.service import (
    IngestService,
    JobStateError,
    mark_interrupted_jobs,
    open_checkpointer,
)
from storysphere.ingest.unit_runner import UnitStage
from storysphere.ingest.units import IngestUnit
from storysphere.llm.errors import LLMResponseBlocked
from storysphere.llm.router import LlmUnconfigured
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.tables import Job

CHAPTER_COUNT = 7
_BODY = (
    "偵探在清晨抵達了莊園，大門敞開著，沒有人出來迎接他。他站在門廊下等了很久，"
    "只聽見遠處的鐘聲一下一下地敲著，霧氣慢慢散開，第{n}天就這樣開始了。"
)
# 合成文本：7 章、每章一段 → 7 個單位（每章一個）。
BOOK_TEXT = "".join(
    f"第{'一二三四五六七'[i]}章 第{i + 1}日\n\n{_BODY.format(n=i + 1)}\n\n" for i in range(CHAPTER_COUNT)
)


class FakeCall:
    """記下每次呼叫的單位；`plan` 指定第幾次呼叫（從 1 起算）要丟什麼例外。"""

    def __init__(self, plan: dict[int, Exception] | None = None) -> None:
        self.plan = plan or {}
        self.calls: list[str] = []

    async def __call__(self, unit: IngestUnit) -> dict:
        self.calls.append(unit.id)
        exc = self.plan.get(len(self.calls))
        if exc is not None:
            raise exc
        return {"unit": unit.id, "chapter": unit.chapter}

    def chapters(self) -> list[int]:
        return [int(unit_id.split(":")[1]) for unit_id in self.calls]


@asynccontextmanager
async def open_service(tmp_path: Path, call: FakeCall) -> AsyncIterator[tuple[IngestService, object]]:
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    session_factory = make_session_factory(engine)
    stage = UnitStage(name="s1a", call=call, model="fake:model", prompt_version="1")
    try:
        async with open_checkpointer(tmp_path / "ckpt.db") as saver:
            service = IngestService(session_factory, saver, stages=[stage], retry_delay=0)
            yield service, session_factory
    finally:
        await engine.dispose()


@pytest.fixture
def book_file(tmp_path: Path) -> Path:
    path = tmp_path / "七日.txt"
    path.write_text(BOOK_TEXT, encoding="utf-8")
    return path


async def ingest(service: IngestService, sf, book_file: Path) -> Job:
    """建 job、跑到審閱、照原樣送出；回傳送出後的 job。"""
    job_id = await service.create_job(book_file)
    await service.run_to_review(job_id)
    job = await load_job(sf, job_id)
    assert job.status == "awaiting_review", job.error
    await service.submit_review(job.book_id, {})
    return await load_job(sf, job_id)


async def load_job(sf, job_id: str) -> Job:
    async with sf() as session:
        return await session.get(Job, job_id)


async def unit_rows(sf) -> list[IngestUnitRow]:
    async with sf() as session:
        return list(await session.scalars(select(IngestUnitRow).order_by(IngestUnitRow.chapter)))


async def output_rows(sf) -> list[IngestUnitOutputRow]:
    async with sf() as session:
        return list(await session.scalars(select(IngestUnitOutputRow)))


class TestAllUnitsSucceed:
    async def test_every_unit_done_with_output(self, tmp_path, book_file):
        call = FakeCall()
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert job.status == "done", job.error
            assert job.stage == "s1"
            assert job.result_json["failedUnitCount"] == 0
            assert call.chapters() == [1, 2, 3, 4, 5, 6, 7]

            rows = await unit_rows(sf)
            assert [(r.stage, r.status, r.attempts) for r in rows] == [("s1a", "done", 1)] * 7
            assert all(r.model == "fake:model" and r.prompt_version == "1" for r in rows)
            assert all(len(r.paragraph_ids) == 1 for r in rows)

            outputs = await output_rows(sf)
            assert {o.unit_id for o in outputs} == {r.unit_id for r in rows}
            assert all(o.raw_json["unit"] == o.unit_id for o in outputs)
            assert all(o.model == "fake:model" and o.prompt_version == "1" for o in outputs)


class TestQuotaPause:
    async def test_fifth_unit_429_pauses_then_resume_runs_only_the_rest(self, tmp_path, book_file):
        call = FakeCall({5: RuntimeError("Error code: 429 - quota exceeded")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert job.status == "paused_quota"
            assert job.error is None and job.error_kind is None
            assert job.finished_at is None
            assert [r.status for r in await unit_rows(sf)] == ["done"] * 4 + ["pending"] * 3
            assert len(await output_rows(sf)) == 4

            call.calls.clear()
            call.plan.clear()
            await service.resume(job.id)

            job = await load_job(sf, job.id)
            assert job.status == "done", job.error
            assert call.chapters() == [5, 6, 7]
            assert [r.status for r in await unit_rows(sf)] == ["done"] * 7
            assert len(await output_rows(sf)) == 7

    async def test_quota_still_exhausted_pauses_again(self, tmp_path, book_file):
        call = FakeCall({5: RuntimeError("429"), 6: RuntimeError("429")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)
            await service.resume(job.id)

            job = await load_job(sf, job.id)
            assert job.status == "paused_quota"
            assert call.chapters() == [1, 2, 3, 4, 5, 5]


class TestRetry:
    async def test_three_failures_mark_failed_and_the_rest_still_run(self, tmp_path, book_file):
        boom = ValueError("bad json")
        call = FakeCall({2: boom, 3: boom, 4: boom})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert job.status == "done", job.error
            assert job.result_json["failedUnitCount"] == 1
            assert call.chapters() == [1, 2, 2, 2, 3, 4, 5, 6, 7]

            rows = await unit_rows(sf)
            assert [r.status for r in rows] == ["done", "failed"] + ["done"] * 5
            assert (rows[1].attempts, rows[1].error) == (3, "bad json")
            assert len(await output_rows(sf)) == 6

    async def test_second_attempt_succeeds(self, tmp_path, book_file):
        call = FakeCall({2: ValueError("bad json")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert job.result_json["failedUnitCount"] == 0
            rows = await unit_rows(sf)
            assert (rows[1].status, rows[1].attempts, rows[1].error) == ("done", 2, None)

    async def test_blocked_is_not_retried(self, tmp_path, book_file):
        call = FakeCall({2: LLMResponseBlocked("provider_blocked", "SAFETY")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert job.status == "done", job.error
            assert job.result_json["failedUnitCount"] == 1
            assert call.chapters() == [1, 2, 3, 4, 5, 6, 7]
            rows = await unit_rows(sf)
            assert (rows[1].status, rows[1].attempts) == ("failed", 1)
            assert "SAFETY" in rows[1].error

    async def test_llm_unconfigured_fails_the_job(self, tmp_path, book_file):
        call = FakeCall({3: LlmUnconfigured("core_extraction")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)

            assert (job.status, job.error_kind) == ("error", "llm_unconfigured")
            assert call.chapters() == [1, 2, 3]


class TestInterrupted:
    async def test_running_job_becomes_interrupted_and_is_not_resumed(self, tmp_path, book_file):
        # 第一次啟動：跑到第 5 個單位停下，再把狀態改成「重啟當下還在跑」的樣子。
        call = FakeCall({5: RuntimeError("429")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)
            async with sf() as session, session.begin():
                (await session.get(Job, job.id)).status = "running"
                rows = await session.scalars(
                    select(IngestUnitRow).where(IngestUnitRow.chapter == 5)
                )
                rows.one().status = "running"
        job_id = job.id

        # 第二次啟動：新的 engine、checkpointer、服務。
        call = FakeCall()
        async with open_service(tmp_path, call) as (service, sf):
            assert await mark_interrupted_jobs(sf) == 1

            job = await load_job(sf, job_id)
            assert job.status == "interrupted"
            assert call.calls == []
            assert [r.status for r in await unit_rows(sf)] == ["done"] * 4 + ["pending"] * 3

            await service.resume(job_id)

            job = await load_job(sf, job_id)
            assert job.status == "done", job.error
            assert call.chapters() == [5, 6, 7]

    async def test_other_states_are_left_alone(self, tmp_path, book_file):
        call = FakeCall({5: RuntimeError("429")})
        async with open_service(tmp_path, call) as (service, sf):
            job = await ingest(service, sf, book_file)
            assert await mark_interrupted_jobs(sf) == 0
            assert (await load_job(sf, job.id)).status == "paused_quota"


class TestResumeState:
    async def test_done_job_cannot_be_resumed(self, tmp_path, book_file):
        async with open_service(tmp_path, FakeCall()) as (service, sf):
            job = await ingest(service, sf, book_file)
            with pytest.raises(JobStateError):
                await service.resume(job.id)

    async def test_unknown_job(self, tmp_path):
        async with open_service(tmp_path, FakeCall()) as (service, _sf):
            with pytest.raises(LookupError):
                await service.resume("nope")

    async def test_interrupted_before_first_checkpoint_starts_over(self, tmp_path, book_file):
        async with open_service(tmp_path, FakeCall()) as (service, sf):
            job_id = await service.create_job(book_file)
            async with sf() as session, session.begin():
                (await session.get(Job, job_id)).status = "interrupted"

            await service.resume(job_id)
            assert (await load_job(sf, job_id)).status == "awaiting_review"
