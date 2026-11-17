"""N-06a–e：筆記與詮釋（從結果卡或 agent 草稿建立；重跑只做 ui_run）。"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from storysphere.store.agent import TraceCallRow, create_session
from storysphere.store.tables import Run

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK


@dataclass
class Ids:
    run: str
    event: str
    network: str
    rejected: str


async def _book(store) -> Ids:
    """CH4 跑過一次：character、relation_state、utterance（L1）→ relation_network（L2）。"""
    await add_book(store.session)
    await store.extracted("relation_state")
    await store.extracted("utterance")
    run = Run(book_id=BOOK, ref_id="character.network", status="done", ref_version=1,
              prompt_version="v1", model="gemini:x")  # fmt: skip
    store.session.add(run)
    await store.session.flush()
    event = await store.extracted("character")
    network = await store.derived("relation_network", [event], run=run)
    rejected = await store.derived("relation_network", [event])
    rejected.status = "rejected"
    return Ids(run.id, event.id, network.id, rejected.id)


@pytest.fixture
def ids(db_file) -> Ids:
    return seed(db_file, _book)


def create(client, **body):
    return client.post(f"{P}/books/{BOOK}/notes", json=body)


def note_body(ids: Ids, **overrides):
    body = {"origin": "run", "fromRunId": ids.run, "title": "陣營分明",
            "conclusion": "**福爾摩斯**一派最大。", "citedEvidenceIds": [ids.network]}  # fmt: skip
    return body | overrides


class TestCreate:
    def test_note_from_run_gets_system_fields(self, ids, client):
        response = create(client, **note_body(ids))
        assert response.status_code == 201
        note = response.json()["note"]
        assert (note["claimType"], note["level"], note["source"]) == ("note", 3, "method")
        assert (note["producedVia"], note["reviewStatus"], note["runId"]) == ("ui", "approved", None)
        assert [d["upstreamId"] for d in note["derivedFrom"]] == [ids.network]
        content = note["content"]
        assert content["title"] == "陣營分明" and content["methodologyRunId"] == ids.run
        assert content["question"] == "角色分成哪些陣營？"
        (traced,) = content["methodologyTrace"]["runs"]
        assert content["methodologyTrace"]["kind"] == "ui_run"
        assert traced["runId"] == ids.run and traced["promptVersion"] == "v1"

    def test_level1_citation_is_refused(self, ids, client):
        response = create(client, **note_body(ids, citedEvidenceIds=[ids.event]))
        assert response.status_code == 422 and response.json()["code"] == "note_cites_level1"

    def test_rejected_citation_is_refused(self, ids, client):
        response = create(client, **note_body(ids, citedEvidenceIds=[ids.rejected]))
        assert response.status_code == 422 and response.json()["code"] == "note_cites_rejected"

    def test_no_citation_is_refused(self, ids, client):
        assert create(client, **note_body(ids, citedEvidenceIds=[])).status_code == 422

    def test_system_field_is_refused(self, ids, client):
        response = create(client, **note_body(ids, level=9))
        assert response.status_code == 422 and response.json()["code"] == "system_field_forbidden"

    def test_unknown_run_is_404(self, ids, client):
        assert create(client, **note_body(ids, fromRunId="nope")).status_code == 404


class TestRead:
    def test_list_and_detail(self, ids, client):
        note_id = create(client, **note_body(ids)).json()["note"]["id"]
        page = client.get(f"{P}/books/{BOOK}/notes").json()
        (item,) = page["items"]
        assert item["id"] == note_id and item["title"] == "陣營分明"
        assert item["citedCount"] == 1 and item["producedVia"] == "ui" and page["total"] == 1

        detail = client.get(f"{P}/books/{BOOK}/notes/{note_id}").json()
        assert [c["id"] for c in detail["cited"]] == [ids.network]
        assert detail["interpretations"] == []

    def test_unknown_note_is_404(self, ids, client):
        assert client.get(f"{P}/books/{BOOK}/notes/{ids.network}").status_code == 404


class TestInterpretation:
    def test_user_interpretation_of_a_note(self, ids, client):
        note_id = create(client, **note_body(ids)).json()["note"]["id"]
        response = client.post(f"{P}/books/{BOOK}/interpretations",
                               json={"text": "其實瓊斯也自成一派。", "citedEvidenceIds": [note_id]})  # fmt: skip
        assert response.status_code == 201
        interp = response.json()["interpretation"]
        assert (interp["claimType"], interp["source"], interp["level"]) == ("interpretation", "user", 4)
        detail = client.get(f"{P}/books/{BOOK}/notes/{note_id}").json()
        assert [i["id"] for i in detail["interpretations"]] == [interp["id"]]

    def test_level1_is_refused(self, ids, client):
        response = client.post(f"{P}/books/{BOOK}/interpretations",
                               json={"text": "x", "citedEvidenceIds": [ids.event]})  # fmt: skip
        assert response.status_code == 422 and response.json()["code"] == "note_cites_level1"


class TestRerun:
    @pytest.fixture
    def started(self, client, monkeypatch) -> list[str]:
        jobs: list[str] = []
        monkeypatch.setattr(client.app.state.method_jobs, "start", jobs.append)
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")
        return jobs

    def test_rerun_queues_the_run_the_note_came_from(self, ids, client, started):
        note_id = create(client, **note_body(ids)).json()["note"]["id"]
        response = client.post(f"{P}/books/{BOOK}/notes/{note_id}/rerun", json={})
        assert response.status_code == 202 and response.json()["status"] == "queued"
        job = client.get(f"{P}/jobs/{response.json()['jobId']}").json()
        assert job["params"]["method_id"] == "character.network"
        assert started == [response.json()["jobId"]]
        # 筆記本身不變。
        assert client.get(f"{P}/books/{BOOK}/notes/{note_id}").json()["status"] == "current"


@dataclass
class DraftIds:
    ids: Ids
    session: str


def _draft(sid: str, cited: list[str], **overrides) -> dict:
    return {
        "draft_id": "d1", "session_id": sid, "title": "陣營", "conclusion": "兩派。",
        "cited_evidence_ids": cited, "question": "誰和誰一夥？", "turn_id": "t1",
        "call_seq": 3, "state": "open", "check": {"ok": True, "problems": []},
        "note_id": None, "created_at": "2026-11-17T00:00:00Z", "updated_at": "x",
    } | overrides  # fmt: skip


@pytest.fixture
def drafted(db_file) -> DraftIds:
    """agent session：get_run 拿到 CH4 的 run（seq 1）、搜尋沒用到的證據（seq 2）、create_note（seq 3）。"""

    async def fill(store) -> DraftIds:
        ids = await _book(store)
        row, _ = await create_session(store.session, book_id=BOOK, backend="claude-code")
        calls = [
            (1, "get_run", [], [ids.run]),
            (2, "search_evidence", [ids.event], []),
            (3, "create_note", [], []),
            (4, "get_entity", [ids.network], []),  # 在 create_note 之後，不算
        ]
        for seq, tool, evidence, runs in calls:
            store.session.add(TraceCallRow(session_id=row.id, seq=seq, turn_id="t1", tool=tool,
                                           args_json={"q": seq}, status="ok",
                                           result_evidence_ids=evidence, result_run_ids=runs))  # fmt: skip
        row.drafts_json = [_draft(row.id, [ids.network])]
        return DraftIds(ids, row.id)

    return seed(db_file, fill)


def confirm(client, d: DraftIds, **overrides):
    return create(client, origin="draft", sessionId=d.session, draftId="d1", **overrides)


class TestCreateFromDraft:
    def test_unedited_draft_becomes_approved_agent_note(self, drafted, client):
        response = confirm(client, drafted)
        assert response.status_code == 201, response.text
        note = response.json()["note"]
        assert (note["level"], note["source"], note["producedVia"]) == (3, "agent", "agent")
        assert (note["agentBackend"], note["reviewStatus"]) == ("claude-code", "approved")
        content = note["content"]
        assert content["title"] == "陣營" and content["question"] == "誰和誰一夥？"
        assert content["methodologyRunId"] is None
        trace = content["methodologyTrace"]
        assert (trace["kind"], trace["sessionId"], trace["agentBackend"]) == (
            "mcp", drafted.session, "claude-code")  # fmt: skip
        calls = trace["calls"]
        assert [c["tool"] for c in calls] == ["get_run", "search_evidence"]
        # get_run 回傳的 run 產出了被引用的 network；search_evidence 回傳的 event 沒被引用。
        assert [c["contributing"] for c in calls] == [True, False]

    def test_draft_marked_confirmed_and_event_sent(self, drafted, client):
        note_id = confirm(client, drafted).json()["note"]["id"]
        (draft,) = client.get(f"{P}/agent/sessions/{drafted.session}/drafts").json()
        assert (draft["state"], draft["noteId"], draft["turnId"]) == ("confirmed", note_id, "t1")
        events = client.app.state.event_bus.replay(f"session:{drafted.session}", 0)
        assert events[-1].type == "note_draft"
        assert events[-1].data["data"]["op"] == "confirmed"
        assert events[-1].data["data"]["draft"]["noteId"] == note_id

    def test_edited_draft_is_modified(self, drafted, client):
        note = confirm(client, drafted, conclusion="改過").json()["note"]
        assert note["reviewStatus"] == "modified" and note["content"]["conclusion"] == "改過"
        assert note["content"]["title"] == "陣營"

    def test_level1_citation_is_refused(self, drafted, client):
        response = confirm(client, drafted, citedEvidenceIds=[drafted.ids.event])
        assert response.status_code == 422 and response.json()["code"] == "note_cites_level1"

    def test_confirmed_twice_is_409(self, drafted, client):
        assert confirm(client, drafted).status_code == 201
        response = confirm(client, drafted)
        assert response.status_code == 409 and response.json()["code"] == "invalid_state"

    def test_unknown_session_or_draft_is_404(self, drafted, client):
        assert create(client, origin="draft", sessionId="zz", draftId="d1").status_code == 404
        assert create(client, origin="draft", sessionId=drafted.session, draftId="zz").status_code == 404

    def test_system_field_is_refused(self, drafted, client):
        response = confirm(client, drafted, agentBackend="x")
        assert response.status_code == 422 and response.json()["code"] == "system_field_forbidden"


class TestDraftTraceFallback:
    @pytest.mark.parametrize(("created_at", "tools"), [
        ("2999-01-01T00:00:00Z", ["get_run"]), ("2000-01-01T00:00:00Z", [])])  # fmt: skip
    def test_old_draft_without_call_seq_cuts_by_created_at(self, db_file, client, created_at, tools):
        """T27 之前的草稿沒有 call_seq：用建立時間切 trace。"""

        async def fill(store) -> str:
            ids = await _book(store)
            row, _ = await create_session(store.session, book_id=BOOK, backend="deepagents")
            store.session.add(TraceCallRow(session_id=row.id, seq=1, turn_id="t1", tool="get_run",
                                           status="ok", result_run_ids=[ids.run]))  # fmt: skip
            draft = _draft(row.id, [ids.network], created_at=created_at)
            del draft["call_seq"], draft["turn_id"]
            row.drafts_json = [draft]
            return row.id

        sid = seed(db_file, fill)
        note = create(client, origin="draft", sessionId=sid, draftId="d1").json()["note"]
        assert [c["tool"] for c in note["content"]["methodologyTrace"]["calls"]] == tools
