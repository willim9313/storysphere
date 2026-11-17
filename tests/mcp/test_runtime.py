"""run_tool 的共用行為：trace、AgentEvent、錯誤格式（04 §5.2、§5.6）。"""

from __future__ import annotations

from storysphere.methods.jobs import MethodJobs
from storysphere.store.agent import traced_evidence_ids
from storysphere.store.tables import Job

from tests.mcp.conftest import call, error_of, payload
from tests.store.conftest import BOOK


async def _job(agent, book_id: str = BOOK) -> str:
    async with agent.env.session_factory() as db, db.begin():
        job = Job(kind="method_run", book_id=book_id, status="running", progress=40, stage="EV1")
        db.add(job)
        await db.flush()
        return job.id


class TestTrace:
    async def test_ok_call_is_recorded_with_seq_and_result(self, agent):
        job_id = await _job(agent)
        agent.env.sessions.set_turn(agent.session.session_id, "turn-1", "線索公平嗎？")
        payload(await call(agent, "get_job_status", {"job_id": job_id}))
        payload(await call(agent, "get_job_status", {"job_id": job_id}))

        traces = await agent.traces()
        assert [t.seq for t in traces] == [1, 2]
        assert traces[0].status == "ok"
        assert traces[0].turn_id == "turn-1"
        assert traces[0].tool == "get_job_status"
        assert traces[0].args_json == {"job_id": job_id}
        assert traces[0].job_id == job_id
        assert traces[0].duration_ms is not None

    async def test_error_call_is_recorded_with_code(self, agent):
        err = error_of(await call(agent, "get_job_status", {"job_id": "nope"}))
        assert err["code"] == "not_found"
        assert set(err) == {"code", "message", "hint"}
        (trace,) = await agent.traces()
        assert trace.status == "error"
        assert trace.error_code == "not_found"

    async def test_other_books_job_is_not_visible(self, agent):
        job_id = await _job(agent, book_id="other-book")
        assert error_of(await call(agent, "get_job_status", {"job_id": job_id}))["code"] == (
            "not_found"
        )


class TestEvents:
    async def test_tool_call_and_result_events_share_the_call_id(self, agent):
        job_id = await _job(agent)
        await call(agent, "get_job_status", {"job_id": job_id})
        (call_type, called), (result_type, result) = agent.events()
        assert (call_type, result_type) == ("tool_call", "tool_result")
        assert called["sessionId"] == agent.session.session_id
        assert called["data"] == {"callId": 1, "tool": "get_job_status", "args": {"job_id": job_id}}
        assert result["data"]["callId"] == 1
        assert result["data"]["ok"] is True
        assert result["data"]["jobId"] == job_id

    async def test_failed_call_reports_error_code(self, agent):
        await call(agent, "get_job_status", {"job_id": "nope"})
        _, (_, result) = agent.events()
        assert result["data"]["ok"] is False
        assert result["data"]["errorCode"] == "not_found"


class TestTracedEvidence:
    async def test_only_ok_calls_and_own_runs_count(self, agent):
        from storysphere.store.agent import start_call

        from tests.store.conftest import Store

        sid = agent.session.session_id
        async with agent.env.session_factory() as db, db.begin():
            store = Store(db)
            read = await store.extracted()
            failed = await store.extracted()
            run = await store.run("event.kernel_satellite")
            run.agent_session_id = sid
            produced = await store.extracted(run=run)
            ok = await start_call(db, session_id=sid, turn_id=None, tool="t", args={})
            ok.status, ok.result_evidence_ids = "ok", [read.id]
            bad = await start_call(db, session_id=sid, turn_id=None, tool="t", args={})
            bad.status, bad.result_evidence_ids = "error", [failed.id]
        async with agent.env.session_factory() as db:
            assert await traced_evidence_ids(db, sid) == {read.id, produced.id}


def test_method_jobs_is_shared(agent):
    assert isinstance(agent.env.method_jobs, MethodJobs)
