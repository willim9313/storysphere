"""Tests for the faction-analysis endpoint (F-16)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from domain.faction import Faction, FactionAnalysis, FactionRelation

BOOK_ID = "doc-1"


def _analysis(
    factions: list[Faction] | None = None,
    relations: list[FactionRelation] | None = None,
    unaffiliated_ids: list[str] | None = None,
    unaffiliated_names: list[str] | None = None,
    chapter: int | None = None,
) -> FactionAnalysis:
    return FactionAnalysis(
        book_id=BOOK_ID,
        chapter=chapter,
        factions=factions or [],
        relations=relations or [],
        unaffiliated_entity_ids=unaffiliated_ids or [],
        unaffiliated_names=unaffiliated_names or [],
    )


@pytest.fixture
def faction_client():
    """TestClient with FactionService overridden by an AsyncMock."""
    import sys

    sys.path.insert(0, "src")

    from api import deps
    from api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_faction = AsyncMock()
    app.dependency_overrides[deps.get_faction_service] = lambda: mock_faction

    with TestClient(app, raise_server_exceptions=True) as client:
        client.mock_faction = mock_faction  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


class TestFactionAnalysisEndpoint:
    def test_returns_200_with_factions(self, faction_client):
        faction = Faction(
            id="faction:0",
            label="Faction 1",
            member_ids=["ent-a", "ent-b"],
            cohesion_score=0.8,
            top_member_names=["Alice", "Bob"],
        )
        faction_client.mock_faction.detect_factions.return_value = _analysis(
            factions=[faction]
        )

        resp = faction_client.get(f"/api/v1/books/{BOOK_ID}/analysis/factions")
        assert resp.status_code == 200
        body = resp.json()
        # camelCase aliases
        assert body["bookId"] == BOOK_ID
        assert body["factions"][0]["memberIds"] == ["ent-a", "ent-b"]
        assert body["factions"][0]["topMemberNames"] == ["Alice", "Bob"]
        assert body["factions"][0]["cohesionScore"] == 0.8
        assert body["unaffiliatedEntityIds"] == []

    def test_chapter_query_param_accepted(self, faction_client):
        faction_client.mock_faction.detect_factions.return_value = _analysis(
            chapter=3
        )

        resp = faction_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/factions?chapter=3"
        )
        assert resp.status_code == 200
        assert resp.json()["chapter"] == 3
        faction_client.mock_faction.detect_factions.assert_awaited_once_with(
            book_id=BOOK_ID,
            chapter=3,
            resolution=1.0,
            min_cluster_size=2,
        )

    def test_empty_book_returns_empty_factions(self, faction_client):
        faction_client.mock_faction.detect_factions.return_value = _analysis()

        resp = faction_client.get(f"/api/v1/books/{BOOK_ID}/analysis/factions")
        assert resp.status_code == 200
        body = resp.json()
        assert body["factions"] == []
        assert body["relations"] == []

    def test_returns_rivalry_in_relations(self, faction_client):
        rel = FactionRelation(
            source_faction_id="faction:0",
            target_faction_id="faction:1",
            cooperation=0.0,
            rivalry=0.5,
        )
        faction_client.mock_faction.detect_factions.return_value = _analysis(
            relations=[rel]
        )

        resp = faction_client.get(f"/api/v1/books/{BOOK_ID}/analysis/factions")
        assert resp.status_code == 200
        body = resp.json()
        assert body["relations"][0]["sourceFactionId"] == "faction:0"
        assert body["relations"][0]["targetFactionId"] == "faction:1"
        assert body["relations"][0]["rivalry"] == 0.5

    def test_chapter_must_be_positive(self, faction_client):
        resp = faction_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/factions?chapter=0"
        )
        assert resp.status_code == 422

    def test_resolution_and_min_cluster_size_forwarded(self, faction_client):
        faction_client.mock_faction.detect_factions.return_value = _analysis()

        resp = faction_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/factions"
            "?resolution=1.5&min_cluster_size=3"
        )
        assert resp.status_code == 200
        faction_client.mock_faction.detect_factions.assert_awaited_once_with(
            book_id=BOOK_ID,
            chapter=None,
            resolution=1.5,
            min_cluster_size=3,
        )

    def test_resolution_out_of_range_rejected(self, faction_client):
        resp = faction_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/factions?resolution=10"
        )
        assert resp.status_code == 422

    def test_min_cluster_size_must_be_at_least_2(self, faction_client):
        resp = faction_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/factions?min_cluster_size=1"
        )
        assert resp.status_code == 422
