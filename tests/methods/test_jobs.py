"""`method_run` job：建立、去重（並發接到同一個 job）、狀態轉移、與入庫互斥。"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from storysphere.methods.engine import UnknownMethodError
from storysphere.methods.jobs import JobConflictError, MethodJobs
from storysphere.store.tables import Job, Run

from tests.methods.support import (
    BOOK,
    CountingLlm,
    FakeMethod,
    decl,
    make_engine,
    make_registry,
    seed,
)

A = decl("test.a", ["event"], "causal_link")
B = decl("test.b", ["causal_link"], "event_role")


async def all_jobs(sf) -> list[Job]:
    async with sf() as session:
        return list(await session.scalars(select(Job)))


async def make_jobs(sf, *methods, registry=None, llm=None):
    await seed(sf, "event")
    engine, llm = make_engine(sf, registry or make_registry(A, B), *methods, llm=llm)
    return MethodJobs(engine), llm


class TestDeduplication:
    async def test_concurrent_triggers_of_the_same_analysis_share_one_job(self, sf):
        """T13 完成標準：同一分析並發觸發接到同一個 job。"""
        method = FakeMethod(A)
        jobs, llm = await make_jobs(sf, method, llm=CountingLlm(delay=0.05))

        results = await asyncio.gather(
            *(jobs.trigger_method(BOOK, "test.a", triggered_by=who)
              for who in ("user", "agent", "user", "user"))
        )

        assert len({r.job_id for r in results}) == 1
        assert sorted(r.attached for r in results) == [False, True, True, True]
        await jobs.wait(results[0].job_id)
        assert len(await all_jobs(sf)) == 1
        assert method.run_calls == 1 and llm.calls == 1
        async with sf() as session:
            assert len(list(await session.scalars(select(Run)))) == 1

    async def test_different_params_or_scope_are_different_jobs(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A), llm=CountingLlm(delay=0.05))
        results = await asyncio.gather(
            jobs.trigger_method(BOOK, "test.a", triggered_by="user"),
            jobs.trigger_method(BOOK, "test.a", params={"k": 1}, triggered_by="user"),
            jobs.trigger_method(BOOK, "test.a", scope=["x"], triggered_by="user"),
            jobs.trigger_method(BOOK, "test.a", scope=["x"], triggered_by="user"),
            jobs.trigger_method(BOOK, "test.a", params={"k": 1}, triggered_by="agent"),
        )
        assert len({r.job_id for r in results}) == 3
        assert [r.attached for r in results] == [False, False, False, True, True]
        for r in results:
            await jobs.wait(r.job_id)

    async def test_same_analysis_in_another_book_is_another_job(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        await seed(sf, "event", book_id="other")
        one, two = await asyncio.gather(
            jobs.trigger_method(BOOK, "test.a", triggered_by="user"),
            jobs.trigger_method("other", "test.a", triggered_by="user"),
        )
        assert one.job_id != two.job_id
        await jobs.wait(one.job_id)
        await jobs.wait(two.job_id)

    async def test_after_the_job_ends_a_new_trigger_creates_a_new_job(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        first = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(first.job_id)
        second = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(second.job_id)
        assert first.job_id != second.job_id and not second.attached

    async def test_paused_job_still_counts_as_in_flight(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A), llm=CountingLlm(error=RuntimeError("429")))
        first = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(first.job_id)
        again = await jobs.trigger_method(BOOK, "test.a", triggered_by="user", start=False)
        assert (again.job_id, again.attached) == (first.job_id, True)


class TestJobLifecycle:
    async def test_runs_to_done_and_records_run_ids(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A), FakeMethod(B))
        trigger = await jobs.trigger_method(
            BOOK, "test.b", params={"k": 1}, triggered_by="user", agent_session_id=None
        )
        await jobs.wait(trigger.job_id)
        async with sf() as session:
            job = await session.get(Job, trigger.job_id)
            runs = list(await session.scalars(select(Run).order_by(Run.created_at)))
        assert (job.kind, job.status, job.progress, job.stage) == ("method_run", "done", 100, "test.b")
        assert job.book_id == BOOK and job.started_at and job.finished_at
        assert sorted(job.result_json["runIds"]) == sorted(r.id for r in runs)
        assert job.result_json["outcome"] == "done" and job.result_json["failedRunCount"] == 0
        assert {r.job_id for r in runs} == {job.id}

    async def test_not_applicable_still_ends_done(self, sf):
        jobs, llm = await make_jobs(sf, FakeMethod(B))  # 上游 A 沒有實作
        trigger = await jobs.trigger_method(BOOK, "test.b", triggered_by="user")
        await jobs.wait(trigger.job_id)
        async with sf() as session:
            job = await session.get(Job, trigger.job_id)
        assert job.status == "done"
        assert job.result_json["outcome"] == "not_applicable"
        assert job.result_json["notImplemented"] == ["test.a"]
        assert llm.calls == 0

    async def test_429_pauses_the_job_instead_of_failing_it(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A), llm=CountingLlm(error=RuntimeError("429 quota")))
        trigger = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(trigger.job_id)
        async with sf() as session:
            job = await session.get(Job, trigger.job_id)
        assert job.status == "paused_quota" and job.error is None and job.finished_at is None
        assert len(job.result_json["runIds"]) == 1

    async def test_other_failure_leaves_the_job_done_with_failed_count(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A), llm=CountingLlm(error=ValueError("bad")))
        trigger = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(trigger.job_id)
        async with sf() as session:
            job = await session.get(Job, trigger.job_id)
        assert job.status == "done" and job.result_json["failedRunCount"] == 1

    async def test_unknown_method_creates_no_job(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        with pytest.raises(UnknownMethodError):
            await jobs.trigger_method(BOOK, "nope", triggered_by="user")
        assert await all_jobs(sf) == []

    async def test_engine_exception_marks_the_job_error(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        trigger = await jobs.trigger_method(BOOK, "test.a", triggered_by="user", start=False)
        # params_json 是 JSON 欄位，原地改不會被偵測；整個換掉
        async with sf() as session, session.begin():
            job = await session.get(Job, trigger.job_id)
            job.params_json = {**job.params_json, "method_id": "gone"}
        await jobs.execute_job(trigger.job_id)
        async with sf() as session:
            job = await session.get(Job, trigger.job_id)
        assert (job.status, job.error_kind) == ("error", "unknown_ref")


class TestExclusion:
    @pytest.mark.parametrize("kind", ["ingest", "ingest_retry", "ingest_rerun", "genre_s4"])
    async def test_unfinished_ingestion_job_blocks_the_trigger(self, sf, kind):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        async with sf() as session, session.begin():
            session.add(Job(kind=kind, book_id=BOOK, status="running"))
        with pytest.raises(JobConflictError) as caught:
            await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        assert caught.value.job_id

    async def test_finished_or_other_book_ingestion_does_not_block(self, sf):
        jobs, _ = await make_jobs(sf, FakeMethod(A))
        async with sf() as session, session.begin():
            session.add(Job(kind="ingest", book_id=BOOK, status="done"))
            session.add(Job(kind="ingest", book_id="other", status="running"))
        trigger = await jobs.trigger_method(BOOK, "test.a", triggered_by="user")
        await jobs.wait(trigger.job_id)
