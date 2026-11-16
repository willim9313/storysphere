from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from storysphere.store.evidence_writer import QuoteDraft, WriteContext, write_evidence
from storysphere.store.tables import Run

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK, FakeParagraphs, make_draft


@dataclass
class Ids:
    old: str
    new: str
    step: str
    ingest: str
    event: str
    role: str


def _at(hour: int) -> datetime:
    return datetime(2026, 11, 16, hour, tzinfo=UTC)


async def _runs(store) -> Ids:
    await add_book(store.session)
    ingest = Run(book_id=BOOK, ref_id="ingest.s2", status="done", created_at=_at(1))
    old = Run(book_id=BOOK, ref_id="event.kernel_satellite", status="done", created_at=_at(2))
    new = Run(
        book_id=BOOK, ref_id="event.kernel_satellite", status="done", created_at=_at(3),
        ref_version=1, prompt_version="1", model="google_genai:gemini-2.5-flash",
        params_json={"x": 1}, input_evidence_ids=["a"], summary_json={"kernel_count": 3},
    )  # fmt: skip
    store.session.add_all([ingest, old, new])
    await store.session.flush()
    step = Run(
        book_id=BOOK, ref_id="event.causal_network", status="not_applicable",
        parent_run_id=new.id, created_at=_at(4),
        precheck_json={"missing": ["event"], "how_to_fix": "先入庫"},
    )  # fmt: skip
    store.session.add(step)
    await store.session.flush()

    ctx = WriteContext(book_id=BOOK, source="extraction", produced_via="pipeline", run_id=ingest.id)
    event = await write_evidence(
        store.session, ctx,
        make_draft("event", discourse_chapter=1, quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯")]),
        FakeParagraphs(),
    )  # fmt: skip
    ctx = WriteContext(book_id=BOOK, source="method", produced_via="pipeline", run_id=new.id)
    role = await write_evidence(
        store.session, ctx,
        make_draft("event_role", discourse_chapter=1,
                   content={"event_id": event.id, "weight": "kernel"}, derived_from=[event.id]),
    )  # fmt: skip
    role.basis_changed = True
    await store.session.flush()
    return Ids(old.id, new.id, step.id, ingest.id, event.id, role.id)


@pytest.fixture
def ids(db_file) -> Ids:
    return seed(db_file, _runs)


class TestListRuns:
    def test_default_hides_superseded_and_ingest_runs(self, ids, client):
        page = client.get(f"{P}/books/{BOOK}/runs").json()
        assert [run["id"] for run in page["items"]] == [ids.step, ids.new] and page["total"] == 2
        newest = page["items"][1]
        assert (newest["refKind"], newest["code"], newest["question"]) == (
            "method", "EV1", "哪些事件撐起整個故事？",
        )  # fmt: skip
        assert newest["evidenceCount"] == 1 and newest["maxLevel"] == 2
        assert newest["basisChangedCount"] == 1 and newest["stepRunIds"] == [ids.step]
        assert newest["summary"] == {"kernelCount": 3}
        assert "params" not in newest and "inputEvidenceIds" not in newest

    def test_include_superseded_and_ingest(self, ids, client):
        page = client.get(f"{P}/books/{BOOK}/runs?includeSuperseded=true&includeIngest=true").json()
        by_id = {run["id"]: run for run in page["items"]}
        assert set(by_id) == {ids.old, ids.new, ids.step, ids.ingest}
        assert by_id[ids.old]["superseded"] is True and by_id[ids.new]["superseded"] is False
        assert by_id[ids.ingest]["refKind"] == "ingest_step" and by_id[ids.ingest]["code"] is None

    def test_filter_by_ref_and_status(self, ids, client):
        page = client.get(f"{P}/books/{BOOK}/runs?status=not_applicable").json()
        assert [run["id"] for run in page["items"]] == [ids.step]
        page = client.get(f"{P}/books/{BOOK}/runs?refId=event.kernel_satellite&includeSuperseded=true").json()
        assert page["total"] == 2


class TestGetRun:
    def test_full_run_with_step_runs(self, ids, client):
        run = client.get(f"{P}/books/{BOOK}/runs/{ids.new}").json()
        assert run["params"] == {"x": 1} and run["inputEvidenceIds"] == ["a"]
        assert (run["version"], run["promptVersion"], run["model"]) == (
            1, "1", "google_genai:gemini-2.5-flash",
        )  # fmt: skip
        (step,) = run["stepRuns"]
        assert step["id"] == ids.step and step["status"] == "not_applicable"
        assert step["precheck"] == {"missing": ["event"], "howToFix": "先入庫"}

    def test_run_of_another_book_is_404(self, ids, client):
        assert client.get(f"{P}/books/{BOOK}/runs/nope").status_code == 404


class TestViewData:
    def test_by_run_with_referenced_labels(self, ids, client):
        data = client.get(f"{P}/books/{BOOK}/view-data?viewType=causal_graph&runId={ids.new}").json()
        assert data["viewType"] == "causal_graph"
        assert [e["id"] for e in data["primary"]] == [ids.role]
        assert data["primary"][0]["derivedFrom"][0]["upstreamId"] == ids.event
        # 被引用的第 1 層事件：只回標籤欄位，標籤取 event.title
        assert data["referenced"] == [
            {"id": ids.event, "claimType": "event", "level": 1,
             "label": "The body is found", "discourseChapter": 1},
        ]  # fmt: skip
        assert [c["number"] for c in data["chapters"]] == [0, 1]

    def test_by_evidence_ids_respects_include_l1(self, ids, client):
        url = f"{P}/books/{BOOK}/view-data?viewType=evidence_list&evidenceIds={ids.event},{ids.role}"
        assert [e["id"] for e in client.get(url).json()["primary"]] == [ids.role]
        primary = client.get(url + "&includeL1=true").json()["primary"]
        assert [e["id"] for e in primary] == [ids.event, ids.role]  # 照請求的順序

    @pytest.mark.parametrize(
        "query",
        [
            "viewType=nope&runId=x",  # view 不在目錄
            "viewType=network",  # 兩個都沒給
            "viewType=network&runId=x&evidenceIds=y",  # 兩個都給
            "viewType=network&evidenceIds=" + ",".join(f"e{i}" for i in range(201)),
        ],
    )
    def test_bad_requests_are_422(self, ids, client, query):
        response = client.get(f"{P}/books/{BOOK}/view-data?{query}")
        assert response.status_code == 422 and response.json()["code"] == "validation_error"

    def test_unknown_run_is_404(self, ids, client):
        assert client.get(f"{P}/books/{BOOK}/view-data?viewType=network&runId=nope").status_code == 404
