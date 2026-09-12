"""Tests for the per-event analysis detail endpoint (#7d GET).

Written after the endpoint returned 500 for every analyzed event: the schema
classes it imports were moved to ``schemas.book_event_analysis`` (3c978af) but
this function-level import kept naming ``schemas.books``. A lazy import inside
a handler is invisible to both startup and ruff, so only a request reaches it —
and there was no test that made one.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.events import Event, EventType
from storysphere.services.analysis_models import (
    CausalityAnalysis,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventSummary,
    ImpactAnalysis,
)

BOOK_ID = "doc-1"
EVENT_ID = "evt-1"


def _make_event() -> Event:
    return Event(
        id=EVENT_ID,
        title="The Meeting",
        event_type=EventType.MEETING,
        description="Alice met Bob.",
        chapter=3,
        narrative_position=7,
    )


def _make_result(failed_parts: list[str] | None = None) -> EventAnalysisResult:
    return EventAnalysisResult(
        event_id=EVENT_ID,
        title="The Meeting",
        document_id=BOOK_ID,
        eep=EventEvidenceProfile(
            state_before="Strangers",
            state_after="Allies",
            thematic_significance="Trust is forged.",
        ),
        causality=CausalityAnalysis(root_cause="A shared enemy."),
        impact=ImpactAnalysis(impact_summary="The alliance holds."),
        summary=EventSummary(summary="A pivotal meeting."),
        coverage=EventCoverageMetrics(),
        failed_parts=failed_parts or [],
        analyzed_at=datetime(2026, 1, 1),
    )


@pytest.fixture
def cache_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """Client with the analysis cache overridden.

    ``conftest.py`` does not cover ``get_analysis_cache``, so it is extended
    here rather than in the shared fixture (see docs/guides/TESTING.md).
    """
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    cache = AsyncMock()
    cache.get_as = AsyncMock(return_value=None)

    mock_kg.get_event = AsyncMock(return_value=_make_event())

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_analysis_cache] = lambda: cache

    with TestClient(app, raise_server_exceptions=True) as c:
        c.cache = cache
        c.kg = mock_kg
        yield c

    app.dependency_overrides.clear()


class TestGetEventAnalysis:
    def _get(self, client, event_id: str = EVENT_ID):
        return client.get(f"/api/v1/books/{BOOK_ID}/events/{event_id}/analysis")

    def test_returns_cached_analysis(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result()

        resp = self._get(cache_client)

        assert resp.status_code == 200
        body = resp.json()
        assert body["eventId"] == EVENT_ID
        assert body["title"] == "The Meeting"
        assert body["eep"]["stateBefore"] == "Strangers"
        assert body["eep"]["eventImportance"] == "SATELLITE"
        assert body["causality"]["rootCause"] == "A shared enemy."
        assert body["impact"]["impactSummary"] == "The alliance holds."
        assert body["summary"]["summary"] == "A pivotal meeting."
        assert body["status"] == "complete"

    def test_reads_event_metadata_from_the_graph(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result()

        body = self._get(cache_client).json()

        # chapter / chunk come from the KG event, not from the cached result.
        assert body["chapter"] == 3
        assert body["chunk"] == 7

    def test_failed_parts_report_partial_status(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result(failed_parts=["impact"])

        body = self._get(cache_client).json()

        assert body["status"] == "partial"
        assert body["failedParts"] == ["impact"]

    def test_returns_404_when_no_analysis_cached(self, cache_client):
        cache_client.cache.get_as.return_value = None

        assert self._get(cache_client).status_code == 404

    def test_returns_404_for_unknown_event(self, cache_client):
        cache_client.kg.get_event = AsyncMock(return_value=None)

        assert self._get(cache_client, "no-such-event").status_code == 404
