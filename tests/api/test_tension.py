"""API tests for tension endpoints."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.entities import EntityType
from storysphere.domain.tension import TEU, TensionLine, TensionPole

from tests.api.conftest import make_entity

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
