"""Tests for the per-event analysis detail endpoint (#7d GET).

Written after the endpoint returned 500 for every analyzed event: the schema
classes it imports were moved to ``schemas.book_event_analysis`` (3c978af) but
this function-level import kept naming ``schemas.books``. A lazy import inside
a handler is invisible to both startup and ruff, so only a request reaches it —
and there was no test that made one.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
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

    # Own Document rather than conftest's: staleness dates an entry against
    # `pipeline_status`, so the tests need to set that field directly.
    from storysphere.domain.documents import Document, FileType

    document = Document(
        id=BOOK_ID,
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[],
    )
    mock_doc.get_document = AsyncMock(
        side_effect=lambda doc_id: document if doc_id == BOOK_ID else None
    )

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
        c.doc_fixture = document
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


class TestStaleReporting:
    """B-111 — a feature-extraction rerun ages an EEP instead of deleting it.

    The step replaces the vector evidence and keywords the analysis was built
    from but regenerates no id, so the entry stays readable. Saying so is the
    whole point of keeping it: a preserved analysis nobody flags as outdated is
    worse than a deleted one, because it looks current.
    """

    CREATED = datetime(2026, 8, 1, tzinfo=UTC)

    def _get(self, client):
        return client.get(f"/api/v1/books/{BOOK_ID}/events/{EVENT_ID}/analysis")

    def _arm(self, client, ran_at):
        client.cache.get_as.return_value = _make_result()
        client.cache.created_at = AsyncMock(return_value=self.CREATED.timestamp())
        client.doc_fixture.pipeline_status.feature_extraction_at = ran_at

    def test_rerun_after_the_analysis_reports_stale(self, cache_client):
        self._arm(cache_client, self.CREATED + timedelta(days=1))

        body = self._get(cache_client).json()

        assert body["isStale"] is True
        assert body["staleReason"] == "feature-extraction"

    def test_rerun_before_the_analysis_reports_fresh(self, cache_client):
        self._arm(cache_client, self.CREATED - timedelta(days=1))

        body = self._get(cache_client).json()

        assert body["isStale"] is False
        assert body["staleReason"] is None

    def test_step_never_run_reports_fresh(self, cache_client):
        """No recorded completion means the run predates these timestamps.

        Guessing "stale" there would flag the entire library at once.
        """
        self._arm(cache_client, None)

        assert self._get(cache_client).json()["isStale"] is False

    def test_a_failing_staleness_read_does_not_hide_the_analysis(self, cache_client):
        """The endpoint must still answer 200 with the payload.

        Reported fresh rather than raising — an exception here would surface as
        a 500 and take a perfectly readable analysis off screen.
        """
        self._arm(cache_client, self.CREATED + timedelta(days=1))
        cache_client.cache.created_at = AsyncMock(side_effect=RuntimeError("db gone"))

        resp = self._get(cache_client)

        assert resp.status_code == 200
        assert resp.json()["isStale"] is False

    def test_list_carries_the_flag_too(self, cache_client):
        """#6b is where the reader scans; the badge has to be visible there."""
        self._arm(cache_client, self.CREATED + timedelta(days=1))
        cache_client.kg.get_events = AsyncMock(return_value=[_make_event()])

        body = cache_client.get(f"/api/v1/books/{BOOK_ID}/analysis/events").json()

        assert len(body["analyzed"]) == 1
        assert body["analyzed"][0]["isStale"] is True
        assert body["analyzed"][0]["staleReason"] == "feature-extraction"
