"""N-10a–k：Agent Gateway 的端點（後端換成假的，不叫 LLM）。"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from storysphere.gateway.base import BackendError, SessionConfig
from storysphere.store.agent import AgentSessionRow, TraceCallRow

from tests.api.support import add_book, seed
from tests.store.conftest import BOOK


class EchoBackend:
    def __init__(self, *, fail: bool = False, hang: bool = False) -> None:
        self.fail = fail
        self.hang = hang
        self.closed: list[str] = []

    async def start(self, cfg: SessionConfig) -> None:
        if self.fail:
            raise BackendError("backend_start_failed", "npx not found")

    async def send(self, session_id: str, text: str, on_text: Any) -> str:
        on_text("echo: ")
        if self.hang:
            await asyncio.sleep(3600)
        return f"echo: {text}"

    async def close(self, session_id: str) -> None:
        self.closed.append(session_id)


@pytest.fixture
def api(client, db_file):
    seed(db_file, lambda store: add_book(store.session))
    backends = client.app.state.gateway.backends
    backends.clear()
    backends["deepagents"] = EchoBackend()
    return client


def open_session(api, **body) -> dict:
    res = api.post("/api/v2/agent/sessions", json={"backend": "deepagents", "bookId": BOOK, **body})
    assert res.status_code == 201, res.text
    return res.json()


def wait_ready(api, session_id: str) -> dict:
    for _ in range(100):
        data = api.get(f"/api/v2/agent/sessions/{session_id}").json()
        if data["status"] != "busy":
            return data
        api.portal.call(asyncio.sleep, 0.01)
    raise AssertionError("turn did not finish")


class TestOpen:
    def test_open_returns_assembled_session_without_token(self, api):
        data = open_session(api, genre="mystery")
        assert data["status"] == "ready"
        assert data["skills"] == ["event-analysis", "character-analysis", "mystery-fair-play"]
        assert data["permissionLevel"] == "L0"
        assert "list_genre_elements" in data["allowedTools"]
        assert "token" not in data and "tokenHash" not in data

    def test_unknown_book_is_404(self, api):
        res = api.post("/api/v2/agent/sessions", json={"backend": "deepagents", "bookId": "nope"})
        assert res.status_code == 404

    def test_system_field_or_extra_key_is_422(self, api):
        res = api.post(
            "/api/v2/agent/sessions",
            json={"backend": "deepagents", "bookId": BOOK, "agentBackend": "x"},
        )
        assert res.status_code == 422

    def test_backend_start_failure_is_201_with_error_status(self, api):
        api.app.state.gateway.backends["claude-code"] = EchoBackend(fail=True)
        res = api.post("/api/v2/agent/sessions", json={"backend": "claude-code", "bookId": BOOK})
        assert res.status_code == 201
        assert res.json()["status"] == "error"

    def test_list_sessions_of_book(self, api):
        data = open_session(api)
        listed = api.get(f"/api/v2/books/{BOOK}/agent/sessions").json()
        assert [s["sessionId"] for s in listed] == [data["sessionId"]]
        assert listed[0]["openDraftCount"] == 0
        assert listed[0]["firstQuestion"] is None

    def test_list_sessions_first_question(self, api):
        sid = open_session(api)["sessionId"]
        for text in ["華生知道真相嗎？", "那讀者呢？"]:
            api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": text})
            wait_ready(api, sid)
        listed = api.get(f"/api/v2/books/{BOOK}/agent/sessions").json()
        assert listed[0]["firstQuestion"] == "華生知道真相嗎？"


class TestTurns:
    def test_message_turn_and_detail(self, api):
        sid = open_session(api)["sessionId"]
        res = api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": "hi"})
        assert res.status_code == 202
        turn_id = res.json()["turnId"]
        detail = wait_ready(api, sid)
        assert [(m["role"], m["text"]) for m in detail["messages"]] == [
            ("user", "hi"),
            ("assistant", "echo: hi"),
        ]
        assert detail["messages"][0]["turnId"] == turn_id
        assert detail["lastSeq"] == 2  # text_delta、done

    def test_events_replay_after_seq(self, api):
        sid = open_session(api)["sessionId"]
        api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": "hi"})
        wait_ready(api, sid)
        bus = api.app.state.event_bus
        events = bus.replay(f"session:{sid}", 0)
        assert [e.type for e in events] == ["text_delta", "done"]
        assert events[1].data["data"] == {"stopReason": "end_turn"}

    def test_busy_session_rejects_message_then_cancel(self, api):
        api.app.state.gateway.backends["deepagents"] = EchoBackend(hang=True)
        sid = open_session(api)["sessionId"]
        api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": "hi"})
        res = api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": "again"})
        assert res.status_code == 409
        assert res.json()["code"] == "invalid_state"
        assert api.post(f"/api/v2/agent/sessions/{sid}/cancel").status_code == 204
        assert wait_ready(api, sid)["status"] == "ready"
        assert api.post(f"/api/v2/agent/sessions/{sid}/cancel").status_code == 409

    def test_unknown_session_is_404(self, api):
        assert api.get("/api/v2/agent/sessions/nope").status_code == 404
        assert api.post("/api/v2/agent/sessions/nope/messages", json={"text": "x"}).status_code == 404


class TestCloseAndDrafts:
    def _with_draft(self, api, db_file, sid: str) -> None:
        async def fill(store):
            row = await store.session.get(AgentSessionRow, sid)
            row.drafts_json = [
                {
                    "draft_id": "d1", "session_id": sid, "title": "t", "conclusion": "c",
                    "cited_evidence_ids": [], "question": "q", "state": "open",
                    "check": {"ok": False, "problems": [{"code": "no_citation", "message": "m"}]},
                    "note_id": None, "created_at": "x", "updated_at": "x",
                }
            ]

        seed(db_file, fill)

    def test_drafts_list_and_discard(self, api, db_file):
        sid = open_session(api)["sessionId"]
        self._with_draft(api, db_file, sid)
        (draft,) = api.get(f"/api/v2/agent/sessions/{sid}/drafts").json()
        assert draft["draftId"] == "d1" and draft["state"] == "open"
        assert api.get(f"/api/v2/books/{BOOK}/agent/sessions").json()[0]["openDraftCount"] == 1
        assert api.delete(f"/api/v2/agent/sessions/{sid}/drafts/d1").status_code == 204
        assert api.get(f"/api/v2/agent/sessions/{sid}/drafts").json()[0]["state"] == "discarded"
        assert api.delete(f"/api/v2/agent/sessions/{sid}/drafts/zz").status_code == 404

    def test_close_marks_closed_and_rejects_messages(self, api, db_file):
        sid = open_session(api)["sessionId"]
        self._with_draft(api, db_file, sid)
        assert api.delete(f"/api/v2/agent/sessions/{sid}").status_code == 204
        detail = api.get(f"/api/v2/agent/sessions/{sid}").json()
        assert detail["status"] == "closed"
        assert api.get(f"/api/v2/agent/sessions/{sid}/drafts").json()[0]["state"] == "discarded"
        res = api.post(f"/api/v2/agent/sessions/{sid}/messages", json={"text": "x"})
        assert res.status_code == 409


class TestTraceAndApprovals:
    def test_trace_pages_by_seq(self, api, db_file):
        sid = open_session(api)["sessionId"]

        async def fill(store):
            for seq in (1, 2):
                store.session.add(
                    TraceCallRow(session_id=sid, seq=seq, tool="get_run", status="ok")
                )

        seed(db_file, fill)
        page = api.get(f"/api/v2/agent/sessions/{sid}/trace?limit=1").json()
        assert page["total"] == 2
        assert [i["seq"] for i in page["items"]] == [1]
        assert page["nextCursor"]

    def test_approval_flow(self, api, db_file):
        sid = open_session(api)["sessionId"]

        async def fill(store):
            store.session.add(
                TraceCallRow(
                    session_id=sid, seq=1, tool="add_interpretation",
                    status="pending_approval", approval_request_id="r1",
                )
            )

        seed(db_file, fill)
        approvals = api.app.state.mcp_env.approvals
        api.portal.call(_open, approvals, "r1")
        url = f"/api/v2/agent/sessions/{sid}/approvals/r1"
        assert api.post(url, json={"allow": True}).status_code == 204
        assert api.post(url, json={"allow": True}).status_code == 409
        missing = f"/api/v2/agent/sessions/{sid}/approvals/zz"
        assert api.post(missing, json={"allow": True}).status_code == 404


async def _open(approvals, request_id: str) -> None:
    approvals.open(request_id)
