"""Tests for inferred-relation confirm/reject endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from domain.inferred_relations import (
    INFERRED_TO_CANONICAL,
    InferredRelation,
    InferredRelationType,
    promote_inferred_type,
)
from domain.relations import Relation, RelationType


# ── promote_inferred_type — pure function tests ──────────────────────────────

class TestPromoteInferredType:
    def test_all_inferred_types_have_canonical_mapping(self):
        for inferred in InferredRelationType:
            assert inferred in INFERRED_TO_CANONICAL
            mapped = promote_inferred_type(inferred)
            assert isinstance(mapped, RelationType)

    def test_potential_ally_maps_to_ally(self):
        assert promote_inferred_type(InferredRelationType.POTENTIAL_ALLY) == RelationType.ALLY

    def test_potential_enemy_maps_to_enemy(self):
        assert promote_inferred_type(InferredRelationType.POTENTIAL_ENEMY) == RelationType.ENEMY

    def test_potential_friendship_maps_to_friendship(self):
        assert (
            promote_inferred_type(InferredRelationType.POTENTIAL_FRIENDSHIP)
            == RelationType.FRIENDSHIP
        )

    def test_potential_associate_falls_back_to_other(self):
        assert (
            promote_inferred_type(InferredRelationType.POTENTIAL_ASSOCIATE) == RelationType.OTHER
        )

    def test_unknown_falls_back_to_other(self):
        assert promote_inferred_type(InferredRelationType.UNKNOWN) == RelationType.OTHER


# ── Endpoint tests ────────────────────────────────────────────────────────────

BOOK_ID = "doc-1"  # matches mock_doc fixture's canonical book id
IR_ID = "ir-1"


def _make_ir(
    suggested: InferredRelationType = InferredRelationType.POTENTIAL_ALLY,
) -> InferredRelation:
    return InferredRelation(
        id=IR_ID,
        document_id=BOOK_ID,
        source_id="ent-a",
        target_id="ent-b",
        common_neighbor_count=2,
        adamic_adar_score=0.5,
        confidence=0.7,
        suggested_relation_type=suggested,
    )


def _make_relation(rtype: RelationType) -> Relation:
    return Relation(
        id="rel-1",
        document_id=BOOK_ID,
        source_id="ent-a",
        target_id="ent-b",
        relation_type=rtype,
    )


@pytest.fixture
def inferred_client(mock_doc):
    """TestClient with LinkPredictionService overridden by a local mock."""
    import sys
    from contextlib import asynccontextmanager

    sys.path.insert(0, "src")

    from api.main import create_app
    from api import deps

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_lp = AsyncMock()
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_link_prediction_service] = lambda: mock_lp

    with TestClient(app, raise_server_exceptions=True) as client:
        # Stash the mock so tests can configure it
        client.mock_lp = mock_lp  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


class TestConfirmInferredRelation:
    def test_confirm_without_body_uses_mapped_suggested_type(self, inferred_client):
        """Frontend sends no body → backend promotes POTENTIAL_ALLY → ALLY."""
        ir = _make_ir(suggested=InferredRelationType.POTENTIAL_ALLY)
        confirmed_relation = _make_relation(RelationType.ALLY)

        def _get(ir_id):
            return ir if ir_id == IR_ID else None

        inferred_client.mock_lp.get_inferred.side_effect = _get
        inferred_client.mock_lp.confirm.return_value = confirmed_relation

        resp = inferred_client.post(f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm")

        assert resp.status_code == 201
        assert resp.json() == {"relationId": "rel-1"}
        # confirm() was called with the promoted RelationType
        inferred_client.mock_lp.confirm.assert_awaited_once_with(IR_ID, RelationType.ALLY)

    def test_confirm_with_empty_body_uses_mapped_suggested_type(self, inferred_client):
        ir = _make_ir(suggested=InferredRelationType.POTENTIAL_ENEMY)
        confirmed_relation = _make_relation(RelationType.ENEMY)

        def _get(ir_id):
            return ir if ir_id == IR_ID else None

        inferred_client.mock_lp.get_inferred.side_effect = _get
        inferred_client.mock_lp.confirm.return_value = confirmed_relation

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm",
            json={},
        )

        assert resp.status_code == 201
        inferred_client.mock_lp.confirm.assert_awaited_once_with(IR_ID, RelationType.ENEMY)

    def test_confirm_with_override_uses_override(self, inferred_client):
        """When body specifies relationType, it wins over the suggested type."""
        ir = _make_ir(suggested=InferredRelationType.POTENTIAL_ALLY)
        confirmed_relation = _make_relation(RelationType.FAMILY)

        def _get(ir_id):
            return ir if ir_id == IR_ID else None

        inferred_client.mock_lp.get_inferred.side_effect = _get
        inferred_client.mock_lp.confirm.return_value = confirmed_relation

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm",
            json={"relationType": "family"},
        )

        assert resp.status_code == 201
        inferred_client.mock_lp.confirm.assert_awaited_once_with(IR_ID, RelationType.FAMILY)

    def test_confirm_with_invalid_override_returns_422(self, inferred_client):
        ir = _make_ir()

        def _get(ir_id):
            return ir if ir_id == IR_ID else None

        inferred_client.mock_lp.get_inferred.side_effect = _get

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm",
            json={"relationType": "not_a_real_type"},
        )

        assert resp.status_code == 422
        assert "not_a_real_type" in resp.json()["detail"]
        inferred_client.mock_lp.confirm.assert_not_awaited()

    def test_confirm_returns_404_when_book_not_found(self, inferred_client, mock_doc):
        mock_doc.get_document.side_effect = lambda _bid: None

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm"
        )

        assert resp.status_code == 404

    def test_confirm_returns_404_when_ir_not_found(self, inferred_client):
        inferred_client.mock_lp.get_inferred.side_effect = lambda _id: None

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm"
        )

        assert resp.status_code == 404

    def test_confirm_returns_404_when_ir_belongs_to_different_book(self, inferred_client):
        ir = _make_ir()
        ir.document_id = "different-book"
        inferred_client.mock_lp.get_inferred.side_effect = lambda _id: ir

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/confirm"
        )

        assert resp.status_code == 404


class TestRejectInferredRelation:
    def test_reject_returns_204(self, inferred_client):
        ir = _make_ir()

        def _get(ir_id):
            return ir if ir_id == IR_ID else None

        inferred_client.mock_lp.get_inferred.side_effect = _get
        inferred_client.mock_lp.reject.return_value = True

        resp = inferred_client.post(
            f"/api/v1/books/{BOOK_ID}/inferred-relations/{IR_ID}/reject"
        )

        assert resp.status_code == 204
        inferred_client.mock_lp.reject.assert_awaited_once_with(IR_ID)
