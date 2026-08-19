"""API tests for tension endpoints."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.entities import EntityType
from storysphere.domain.tension import TEU, TensionLine, TensionPole

from tests.api.conftest import hanging_call, make_entity, poll_until_terminal

BOOK = "book-1"


def _make_teu(teu_id: str, chapter: int, **kw) -> TEU:
    return TEU(
        id=teu_id,
        event_id=f"event-{teu_id}",
        document_id=BOOK,
        chapter=chapter,
        pole_a=TensionPole(
            concept_name=kw.get("pole_a", "記憶的自主"),
            carrier_names=kw.get("carriers_a", ["伊內絲"]),
            carrier_ids=kw.get("carrier_ids_a", []),
            stance=kw.get("stance_a"),
        ),
        pole_b=TensionPole(
            concept_name=kw.get("pole_b", "記憶的佔有"),
            carrier_names=kw.get("carriers_b", ["泰奧多爾"]),
            carrier_ids=kw.get("carrier_ids_b", []),
            stance=kw.get("stance_b"),
        ),
        tension_description=kw.get("desc", "記憶能否被交易。"),
        intensity=kw.get("intensity", 0.7),
        evidence=kw.get("evidence", ["「記憶不能買賣。」"]),
    )


@pytest.fixture
def mock_tension():
    """TensionService double; each test sets get_teus / get_lines as needed."""
    svc = AsyncMock()
    svc.get_teus.return_value = []
    svc.get_lines.return_value = []
    return svc


@pytest.fixture
def tension_client(mock_tension, mock_kg, mock_doc, mock_vector):
    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[deps.get_tension_service] = lambda: mock_tension
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


class TestReviewTensionLine:
    def test_note_reaches_the_service(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = TensionLine(
            id="line-1", document_id=BOOK, canonical_pole_a="個人選擇"
        )
        resp = tension_client.patch(
            "/api/v1/tension/lines/line-1/review",
            json={
                "document_id": BOOK,
                "review_status": "modified",
                "canonical_pole_a": "個人選擇",
                "note": "原標籤把載體當成概念",
            },
        )
        assert resp.status_code == 200
        assert mock_tension.update_line_review.await_args.kwargs["note"] == "原標籤把載體當成概念"

    def test_note_is_optional(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = TensionLine(id="line-1", document_id=BOOK)
        resp = tension_client.patch(
            "/api/v1/tension/lines/line-1/review",
            json={"document_id": BOOK, "review_status": "approved"},
        )
        assert resp.status_code == 200
        assert mock_tension.update_line_review.await_args.kwargs["note"] is None

    def test_unknown_line_is_404(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = None
        resp = tension_client.patch(
            "/api/v1/tension/lines/nope/review",
            json={"document_id": BOOK, "review_status": "approved"},
        )
        assert resp.status_code == 404


class TestAssignTEU:
    """The service decides the outcome; these pin the HTTP mapping."""

    def _assign(self, client, teu_id="t2", line_id="line-1"):
        return client.patch(
            f"/api/v1/tension/teus/{teu_id}/assign",
            json={"document_id": BOOK, "line_id": line_id},
        )

    def test_returns_the_updated_line(self, tension_client, mock_tension):
        line = TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1", "t2"], chapter_range=[1, 4])
        mock_tension.assign_teu_to_line.return_value = ("ok", line)

        resp = self._assign(tension_client)
        assert resp.status_code == 200
        assert resp.json()["teu_ids"] == ["t1", "t2"]
        assert resp.json()["chapter_range"] == [1, 4]

    def test_unknown_teu_is_404(self, tension_client, mock_tension):
        mock_tension.assign_teu_to_line.return_value = ("teu_not_found", None)
        assert self._assign(tension_client).status_code == 404

    def test_unknown_line_is_404(self, tension_client, mock_tension):
        mock_tension.assign_teu_to_line.return_value = ("line_not_found", None)
        assert self._assign(tension_client).status_code == 404

    def test_teu_already_grouped_is_409(self, tension_client, mock_tension):
        holder = TensionLine(id="line-9", document_id=BOOK, teu_ids=["t2"])
        mock_tension.assign_teu_to_line.return_value = ("claimed", holder)

        resp = self._assign(tension_client)
        assert resp.status_code == 409
        assert "line-9" in resp.json()["detail"]

    def test_requires_line_id(self, tension_client):
        resp = tension_client.patch(
            "/api/v1/tension/teus/t2/assign", json={"document_id": BOOK}
        )
        assert resp.status_code == 422


class TestListTEUs:
    def test_returns_empty_list_before_assembly(self, tension_client):
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_requires_book_id(self, tension_client):
        assert tension_client.get("/api/v1/tension/teus").status_code == 422

    def test_exposes_pole_concepts_and_carriers(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 3)]
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.status_code == 200
        item = resp.json()[0]
        assert item["pole_a_concept"] == "記憶的自主"
        assert item["pole_b_concept"] == "記憶的佔有"
        assert [c["name"] for c in item["pole_a_carriers"]] == ["伊內絲"]
        assert item["chapter"] == 3
        assert item["evidence"] == ["「記憶不能買賣。」"]

    def test_carrier_gets_its_kg_entity_type(self, tension_client, mock_tension, mock_kg):
        mock_kg.list_entities.return_value = [
            make_entity(name="伊內絲", eid="ent-1", etype=EntityType.CHARACTER),
            make_entity(name="退名之潮", eid="ent-2", etype=EntityType.CONCEPT),
        ]
        mock_tension.get_teus.return_value = [
            _make_teu(
                "t1",
                1,
                carriers_a=["伊內絲"],
                carrier_ids_a=["ent-1"],
                carriers_b=["退名之潮"],
                carrier_ids_b=["ent-2"],
            )
        ]
        item = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0]
        assert item["pole_a_carriers"][0]["entity_type"] == "character"
        assert item["pole_b_carriers"][0]["entity_type"] == "concept"

    def test_unresolved_carrier_keeps_name_with_null_type(
        self, tension_client, mock_tension, mock_kg
    ):
        """Roughly a fifth of carrier names have no entity id; they must still
        appear, just untyped."""
        mock_kg.list_entities.return_value = []
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1, carriers_a=["讀鹽人"], carrier_ids_a=[])
        ]
        carrier = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0][
            "pole_a_carriers"
        ][0]
        assert carrier["name"] == "讀鹽人"
        assert carrier["id"] is None
        assert carrier["entity_type"] is None

    def test_carrier_with_id_the_kg_no_longer_knows_is_untyped(
        self, tension_client, mock_tension, mock_kg
    ):
        mock_kg.list_entities.return_value = []
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1, carriers_a=["幽靈"], carrier_ids_a=["ent-gone"])
        ]
        carrier = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0][
            "pole_a_carriers"
        ][0]
        assert carrier["id"] == "ent-gone"
        assert carrier["entity_type"] is None

    def test_exposes_pole_stance(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 1, stance_a="她捍衛記憶的純粹性。")]
        item = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0]
        assert item["pole_a_stance"] == "她捍衛記憶的純粹性。"

    def test_grouped_teu_carries_its_line_id(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 1)]
        mock_tension.get_lines.return_value = [
            TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1"])
        ]
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.json()[0]["line_id"] == "line-1"

    def test_ungrouped_teu_has_null_line_id(self, tension_client, mock_tension):
        """The point of this endpoint: TEUs grouping dropped are visible here."""
        mock_tension.get_teus.return_value = [_make_teu("t1", 1), _make_teu("t2", 7)]
        mock_tension.get_lines.return_value = [
            TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1"])
        ]
        body = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()
        by_id = {t["id"]: t for t in body}
        assert by_id["t1"]["line_id"] == "line-1"
        assert by_id["t2"]["line_id"] is None

    def test_preserves_service_ordering(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1),
            _make_teu("t2", 4),
            _make_teu("t3", 9),
        ]
        body = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()
        assert [t["chapter"] for t in body] == [1, 4, 9]


# ── Background tasks are cancellable ─────────────────────────────────────────


class TestCancellation:
    """``POST /tension/analyze`` is the batch TEU assembly — the longest run
    on this router, and the one a user is most likely to want to stop.

    Before the migration it went through ``BackgroundTasks.add_task``, which
    hands back no task handle, so ``POST /tasks/:id/cancel`` could only answer
    409 "not cancellable".
    """

    def _start(self, client) -> str:
        resp = client.post("/api/v1/tension/analyze", json={"document_id": BOOK})
        assert resp.status_code == 202
        return resp.json()["taskId"]

    def test_running_batch_can_be_cancelled(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = hanging_call()

        task_id = self._start(tension_client)

        resp = tension_client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 204, "runner was not registered as cancellable"

    def test_cancelled_batch_ends_up_failed(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = hanging_call()

        task_id = self._start(tension_client)
        tension_client.post(f"/api/v1/tasks/{task_id}/cancel")

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "cancelled"

    def test_completion_carries_the_summary(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.return_value = {"assembled": 12, "failed": 0}

        task_id = self._start(tension_client)

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "done"
        assert status["result"] == {"assembled": 12, "failed": 0}

    def test_failure_reaches_the_task(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = RuntimeError("Qdrant 連不上")

        task_id = self._start(tension_client)

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "Qdrant 連不上"
