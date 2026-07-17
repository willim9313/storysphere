"""Tests for the character centrality metrics endpoint (character-page-revamp #1)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from storysphere.domain.character_metrics import CharacterMetric, CharacterMetricsAnalysis

BOOK_ID = "doc-1"


def _analysis(metrics: list[CharacterMetric] | None = None) -> CharacterMetricsAnalysis:
    return CharacterMetricsAnalysis(book_id=BOOK_ID, metrics=metrics or [])


@pytest.fixture
def metrics_client(mock_doc):
    """TestClient with CharacterMetricsService overridden by an AsyncMock.

    Reuses the shared ``mock_doc`` fixture (conftest.py) for book-existence
    checks — only ``get_character_metrics_service`` needs a local override.
    """
    import sys

    sys.path.insert(0, "src")

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_metrics = AsyncMock()
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_character_metrics_service] = lambda: mock_metrics

    with TestClient(app, raise_server_exceptions=True) as client:
        client.mock_metrics = mock_metrics  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


class TestCharacterMetricsEndpoint:
    def test_returns_404_for_unknown_book(self, metrics_client):
        resp = metrics_client.get(
            "/api/v1/books/no-such-book/analysis/character-metrics"
        )
        assert resp.status_code == 404

    def test_returns_200_with_metrics(self, metrics_client):
        metrics_client.mock_metrics.compute_metrics.return_value = _analysis(
            metrics=[
                CharacterMetric(
                    entity_id="ent-alice", name="Alice", pagerank=0.6, degree=3,
                ),
            ]
        )

        resp = metrics_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/character-metrics"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["bookId"] == BOOK_ID
        assert body["metrics"][0]["entityId"] == "ent-alice"
        assert body["metrics"][0]["pagerank"] == 0.6
        assert body["metrics"][0]["degree"] == 3

    def test_empty_book_returns_empty_metrics(self, metrics_client):
        metrics_client.mock_metrics.compute_metrics.return_value = _analysis()

        resp = metrics_client.get(
            f"/api/v1/books/{BOOK_ID}/analysis/character-metrics"
        )
        assert resp.status_code == 200
        assert resp.json()["metrics"] == []

    def test_service_called_with_book_id(self, metrics_client):
        metrics_client.mock_metrics.compute_metrics.return_value = _analysis()

        metrics_client.get(f"/api/v1/books/{BOOK_ID}/analysis/character-metrics")
        metrics_client.mock_metrics.compute_metrics.assert_awaited_once_with(BOOK_ID)
