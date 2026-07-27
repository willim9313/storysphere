"""Tests for the timeline endpoint (#13a)."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from .conftest import make_event

ANALYZED = make_event(title="Analyzed event", chapter=1)
PLAIN = make_event(title="Unanalyzed event", chapter=2)


def _eep_payload() -> dict:
    """Minimal cached EventAnalysisResult shape with a KERNEL importance."""
    return {
        "event_id": ANALYZED.id,
        "eep": {
            "event_importance": "KERNEL",
        },
    }


@pytest.fixture
def timeline_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """Client with kg.get_events + analysis cache wired for timeline tests.

    The shared ``client`` fixture leaves ``get_analysis_cache`` alone, and
    ``mock_kg.get_events`` returns a bare AsyncMock result that the endpoint
    cannot iterate — both are supplied here per the local-fixture convention.
    """
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    mock_kg.get_events = AsyncMock(return_value=[ANALYZED, PLAIN])
    mock_kg.get_temporal_relations = AsyncMock(return_value=[])

    cache = AsyncMock()

    async def _get(key):
        return _eep_payload() if key.endswith(ANALYZED.id) else None

    cache.get = AsyncMock(side_effect=_get)

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_analysis_cache] = lambda: cache

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


class TestTimelineHasAnalysis:
    def _events(self, timeline_client) -> dict:
        resp = timeline_client.get("/api/v1/books/doc-1/timeline")
        assert resp.status_code == 200
        return {e["title"]: e for e in resp.json()["events"]}

    def test_has_analysis_true_when_eep_cached(self, timeline_client):
        events = self._events(timeline_client)
        assert events["Analyzed event"]["hasAnalysis"] is True

    def test_has_analysis_false_when_no_cache_entry(self, timeline_client):
        events = self._events(timeline_client)
        assert events["Unanalyzed event"]["hasAnalysis"] is False

    def test_has_analysis_matches_analyzed_count(self, timeline_client):
        resp = timeline_client.get("/api/v1/books/doc-1/timeline")
        body = resp.json()
        flagged = sum(1 for e in body["events"] if e["hasAnalysis"])
        assert flagged == body["quality"]["analyzedCount"]

    def test_returns_404_for_unknown_book(self, timeline_client):
        resp = timeline_client.get("/api/v1/books/no-such-book/timeline")
        assert resp.status_code == 404
