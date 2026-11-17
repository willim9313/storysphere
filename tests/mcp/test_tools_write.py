"""寫入與呈現工具（04 §5.5）：引用驗證、草稿、確認流程、view 事件。"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from storysphere.store.agent import AgentSessionRow, start_call
from storysphere.store.tables import Evidence, EvidenceLink, Run

from tests.mcp.conftest import call, error_of, payload
from tests.store.conftest import Store


async def _evidence(agent) -> dict[str, str]:
    """第 1 層事件、第 2 層（引用它）、被拒絕的第 2 層、一個 run。"""
    async with agent.env.session_factory() as db, db.begin():
        store = Store(db)
        run = await store.run("event.kernel_satellite")
        l1 = await store.extracted()
        l2 = await store.derived("causal_link", [l1], run=run)
        rejected = await store.derived("causal_link", [l1])
        rejected.status = "rejected"
        other = await store.derived("causal_link", [l1])
        return {"l1": l1.id, "l2": l2.id, "rejected": rejected.id, "other": other.id,
                "run": run.id}  # fmt: skip


async def _read(agent, *ids: str) -> None:
    """模擬大腦先前讀過這些證據（一筆 ok 的 trace）。"""
    async with agent.env.session_factory() as db, db.begin():
        row = await start_call(
            db, session_id=agent.session.session_id, turn_id=None, tool="get_evidence", args={}
        )
        row.status, row.result_evidence_ids = "ok", list(ids)


async def _drafts(agent) -> list[dict]:
    async with agent.env.session_factory() as db:
        return (await db.get(AgentSessionRow, agent.session.session_id)).drafts_json


def _events(agent, kind: str) -> list[dict]:
    return [data["data"] for event_type, data in agent.events() if event_type == kind]


class TestCreateNote:
    async def test_draft_is_stored_with_the_turns_question(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l2"])
        agent.env.sessions.set_turn(agent.session.session_id, "t1", "線索公平嗎？")
        out = payload(await call(agent, "create_note", {
            "title": "結論", "conclusion": "**是**", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        assert out["check"] == {"ok": True, "problems": []}
        (draft,) = await _drafts(agent)
        assert draft["draft_id"] == out["draft_id"]
        assert (draft["question"], draft["state"]) == ("線索公平嗎？", "open")
        (event,) = _events(agent, "note_draft")
        assert event["op"] == "created"
        assert event["draft"]["citedEvidenceIds"] == [ids["l2"]]

    async def test_no_evidence_is_written(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l2"])
        await call(agent, "create_note",
                   {"title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]]})  # fmt: skip
        async with agent.env.session_factory() as db:
            claim_types = set(await db.scalars(select(Evidence.claim_type)))
        assert "note" not in claim_types

    async def test_unread_evidence_is_not_in_trace(self, agent):
        ids = await _evidence(agent)
        err = error_of(await call(agent, "create_note",
                                  {"title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        assert err["code"] == "not_in_trace"
        assert err["hint"]
        assert await _drafts(agent) == []

    async def test_level1_and_rejected_become_problems_not_errors(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l1"], ids["rejected"])
        out = payload(await call(agent, "create_note", {
            "title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l1"], ids["rejected"]]}))  # fmt: skip
        assert out["check"]["ok"] is False
        codes = [p["code"] for p in out["check"]["problems"]]
        assert codes == ["note_cites_level1", "note_cites_rejected"]

    async def test_system_field_is_refused(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l2"])
        err = error_of(await call(agent, "create_note", {
            "title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]], "level": 5}))  # fmt: skip
        assert err["code"] == "system_field_forbidden"
        assert await _drafts(agent) == []

    async def test_ids_produced_by_this_sessions_run_count_as_read(self, agent):
        ids = await _evidence(agent)
        async with agent.env.session_factory() as db, db.begin():
            run = await db.get(Run, ids["run"])
            run.agent_session_id = agent.session.session_id
        out = payload(await call(agent, "create_note",
                                 {"title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        assert out["check"]["ok"] is True


class TestLinkEvidence:
    async def _draft(self, agent, ids) -> str:
        await _read(agent, ids["l2"], ids["other"])
        out = payload(await call(agent, "create_note",
                                 {"title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        return out["draft_id"]

    async def test_add_and_remove_update_the_draft(self, agent):
        ids = await _evidence(agent)
        draft_id = await self._draft(agent, ids)
        out = payload(await call(agent, "link_evidence", {
            "draft_id": draft_id, "add_ids": [ids["other"]], "remove_ids": [ids["l2"]]}))  # fmt: skip
        assert out["cited_evidence_ids"] == [ids["other"]]
        (draft,) = await _drafts(agent)
        assert draft["cited_evidence_ids"] == [ids["other"]]
        assert _events(agent, "note_draft")[-1]["op"] == "updated"

    async def test_removing_everything_is_a_problem(self, agent):
        ids = await _evidence(agent)
        draft_id = await self._draft(agent, ids)
        out = payload(await call(agent, "link_evidence",
                                 {"draft_id": draft_id, "remove_ids": [ids["l2"]]}))  # fmt: skip
        assert out["check"]["problems"][0]["code"] == "no_citation"

    async def test_adding_unread_evidence_is_not_in_trace(self, agent):
        ids = await _evidence(agent)
        draft_id = await self._draft(agent, ids)
        err = error_of(await call(agent, "link_evidence",
                                  {"draft_id": draft_id, "add_ids": [ids["rejected"]]}))  # fmt: skip
        assert err["code"] == "not_in_trace"

    async def test_unknown_draft_is_not_found(self, agent):
        err = error_of(await call(agent, "link_evidence", {"draft_id": "nope"}))
        assert err["code"] == "not_found"


class TestAddInterpretation:
    async def _call_and_answer(self, agent, cited: list[str], allow: bool):
        task = asyncio.create_task(call(agent, "add_interpretation",
                                        {"text": "華生其實早就懷疑", "cited_evidence_ids": cited}))  # fmt: skip
        for _ in range(200):
            if pending := agent.env.approvals.pending():
                break
            await asyncio.sleep(0.01)
        (request_id,) = pending
        (trace,) = [t for t in await agent.traces() if t.tool == "add_interpretation"]
        assert (trace.status, trace.approval_request_id) == ("pending_approval", request_id)
        (request,) = _events(agent, "approval_request")
        assert (request["requestId"], request["origin"]) == (request_id, "mcp")
        assert agent.env.approvals.resolve(request_id, allow)
        return await task

    async def test_approved_interpretation_is_written_with_system_fields(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l2"])
        out = payload(await self._call_and_answer(agent, [ids["l2"]], allow=True))
        assert out["level"] == 3
        async with agent.env.session_factory() as db:
            row = await db.get(Evidence, out["evidence_id"])
            upstream = list(await db.scalars(
                select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id == row.id)))  # fmt: skip
        assert (row.claim_type, row.source, row.produced_via) == ("interpretation", "agent", "agent")
        assert (row.agent_backend, row.review_status, row.run_id) == ("deepagents", "approved", None)
        assert upstream == [ids["l2"]]
        (trace,) = [t for t in await agent.traces() if t.tool == "add_interpretation"]
        assert trace.status == "ok"
        assert trace.result_evidence_ids == [out["evidence_id"]]

    async def test_denied_interpretation_writes_nothing(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l2"])
        err = error_of(await self._call_and_answer(agent, [ids["l2"]], allow=False))
        assert err["code"] == "approval_denied"
        (trace,) = [t for t in await agent.traces() if t.tool == "add_interpretation"]
        assert trace.status == "denied"
        async with agent.env.session_factory() as db:
            assert "interpretation" not in set(await db.scalars(select(Evidence.claim_type)))

    async def test_level1_citation_is_refused_before_asking(self, agent):
        ids = await _evidence(agent)
        await _read(agent, ids["l1"])
        err = error_of(await call(agent, "add_interpretation",
                                  {"text": "x", "cited_evidence_ids": [ids["l1"]]}))  # fmt: skip
        assert err["code"] == "note_cites_level1"
        assert _events(agent, "approval_request") == []

    async def test_unread_citation_is_not_in_trace(self, agent):
        ids = await _evidence(agent)
        err = error_of(await call(agent, "add_interpretation",
                                  {"text": "x", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        assert err["code"] == "not_in_trace"


class TestShowView:
    async def test_run_ref_emits_a_view_event(self, agent):
        ids = await _evidence(agent)
        out = payload(await call(agent, "show_view",
                                 {"view_type": "causal_graph", "data_ref": {"run_id": ids["run"]}}))  # fmt: skip
        (event,) = _events(agent, "view")
        assert event == {"viewId": out["view_id"], "viewType": "causal_graph",
                         "dataRef": {"runId": ids["run"]}}  # fmt: skip

    async def test_evidence_ref_does_not_count_as_read(self, agent):
        ids = await _evidence(agent)
        payload(await call(agent, "show_view", {
            "view_type": "evidence_list", "data_ref": {"evidence_ids": [ids["l2"]]}}))  # fmt: skip
        err = error_of(await call(agent, "create_note",
                                  {"title": "t", "conclusion": "c", "cited_evidence_ids": [ids["l2"]]}))  # fmt: skip
        assert err["code"] == "not_in_trace"

    async def test_unknown_view_type_lists_the_valid_ones(self, agent):
        ids = await _evidence(agent)
        err = error_of(await call(agent, "show_view",
                                  {"view_type": "pie", "data_ref": {"run_id": ids["run"]}}))  # fmt: skip
        assert err["code"] == "unknown_view"
        assert "causal_graph" in err["hint"]

    async def test_bad_data_ref_is_a_validation_error(self, agent):
        err = error_of(await call(agent, "show_view",
                                  {"view_type": "causal_graph", "data_ref": {"foo": 1}}))  # fmt: skip
        assert err["code"] == "validation_error"
