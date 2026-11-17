"""N-06a–e：筆記與詮釋（原型只做從結果卡建立、ui_run 重跑）。"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
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

    def test_draft_origin_is_not_supported_yet(self, ids, client):
        assert create(client, origin="draft", sessionId="s", draftId="d").status_code == 422

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
