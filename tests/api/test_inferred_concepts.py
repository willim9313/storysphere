"""Tests for the inferred-concept review endpoints (B-092).

The service is a local mock — ``tests/services/test_concept_inference_service.py``
covers what it does; these cover the router's wiring, the book scoping, and the
404/422 edges.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.inferred_concepts import InferenceStatus, InferredConcept

BOOK_ID = "doc-1"  # matches the mock_doc fixture's canonical book id
CONCEPT_ID = "ic-1"


def _make_concept(
    concept_id: str = CONCEPT_ID,
    document_id: str = BOOK_ID,
    status: InferenceStatus = InferenceStatus.PENDING,
) -> InferredConcept:
    return InferredConcept(
        id=concept_id,
        document_id=document_id,
        name="power corrupts even well-intentioned people",
        description="because the passages say so",
        evidence=["a quote"],
        confidence=0.8,
        inferred_by="tension_pre_analysis_v1",
        status=status,
    )


@pytest.fixture
def concept_client(mock_doc):
    """TestClient with ConceptInferenceService overridden by a local mock."""
    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_ci = AsyncMock()
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_concept_inference_service] = lambda: mock_ci

    with TestClient(app, raise_server_exceptions=True) as client:
        client.mock_ci = mock_ci  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


class TestListInferredConcepts:
    def test_returns_the_candidates_for_the_book(self, concept_client):
        concept_client.mock_ci.list_concepts.return_value = [_make_concept()]

        resp = concept_client.get(f"/api/v1/books/{BOOK_ID}/inferred-concepts")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["name"] == "power corrupts even well-intentioned people"
        assert item["evidence"] == ["a quote"]
        assert item["confidence"] == 0.8
        assert item["status"] == "pending"

    def test_camel_case_keys_reach_the_client(self, concept_client):
        concept_client.mock_ci.list_concepts.return_value = [_make_concept()]

        item = concept_client.get(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts"
        ).json()["items"][0]

        assert "documentId" in item
        assert "inferredBy" in item
        assert "confirmedEntityId" in item

    def test_status_filter_is_passed_through(self, concept_client):
        concept_client.mock_ci.list_concepts.return_value = []

        resp = concept_client.get(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts?status=rejected"
        )

        assert resp.status_code == 200
        assert (
            concept_client.mock_ci.list_concepts.await_args.args[1]
            is InferenceStatus.REJECTED
        )

    def test_unknown_status_is_422(self, concept_client):
        resp = concept_client.get(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts?status=maybe"
        )

        assert resp.status_code == 422

    def test_unknown_book_is_404(self, concept_client):
        resp = concept_client.get("/api/v1/books/no-such-book/inferred-concepts")

        assert resp.status_code == 404


class TestRunConceptInference:
    def test_returns_202_with_a_task_id(self, concept_client):
        resp = concept_client.post(f"/api/v1/books/{BOOK_ID}/inferred-concepts/run")

        assert resp.status_code == 202
        assert resp.json()["taskId"]

    def test_unknown_book_is_404(self, concept_client):
        resp = concept_client.post("/api/v1/books/no-such-book/inferred-concepts/run")

        assert resp.status_code == 404


class TestConfirmInferredConcept:
    def test_returns_the_entity_it_became(self, concept_client):
        concept_client.mock_ci.get_concept.return_value = _make_concept()
        concept_client.mock_ci.confirm.return_value = Entity(
            id="ent-9",
            name="power corrupts even well-intentioned people",
            entity_type=EntityType.CONCEPT,
            document_id=BOOK_ID,
            extraction_method="inferred",
        )

        resp = concept_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts/{CONCEPT_ID}/confirm"
        )

        assert resp.status_code == 201
        assert resp.json() == {"entityId": "ent-9"}

    def test_unknown_concept_is_404(self, concept_client):
        concept_client.mock_ci.get_concept.return_value = None

        resp = concept_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts/nope/confirm"
        )

        assert resp.status_code == 404
        concept_client.mock_ci.confirm.assert_not_awaited()

    def test_a_concept_from_another_book_is_404(self, concept_client):
        """The id is a global uuid, so the book in the path has to be checked."""
        concept_client.mock_ci.get_concept.return_value = _make_concept(
            document_id="some-other-book"
        )

        resp = concept_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts/{CONCEPT_ID}/confirm"
        )

        assert resp.status_code == 404
        concept_client.mock_ci.confirm.assert_not_awaited()


class TestRejectInferredConcept:
    def test_returns_204(self, concept_client):
        concept_client.mock_ci.get_concept.return_value = _make_concept()

        resp = concept_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts/{CONCEPT_ID}/reject"
        )

        assert resp.status_code == 204
        concept_client.mock_ci.reject.assert_awaited_once_with(CONCEPT_ID)

    def test_a_concept_from_another_book_is_404(self, concept_client):
        concept_client.mock_ci.get_concept.return_value = _make_concept(
            document_id="some-other-book"
        )

        resp = concept_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-concepts/{CONCEPT_ID}/reject"
        )

        assert resp.status_code == 404
        concept_client.mock_ci.reject.assert_not_awaited()
