"""Tests for the timeline endpoint (#13a)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from tests.conftest import attach_get_as

from .conftest import hanging_call, make_event, poll_until_terminal

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

    cache = attach_get_as(AsyncMock())

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


def _temporal_payload(coverage_sufficient=True, displacements=None) -> dict:
    """Cached TemporalAnalysis shape as NarrativeService writes it (#21h)."""
    return {
        "document_id": "doc-1",
        "total_events": 2,
        "events_with_hint": 2,
        "coverage": 1.0,
        "coverage_sufficient": coverage_sufficient,
        "story_time_structure": "non_linear",
        "displacements": displacements if displacements is not None else [
            {
                "event_id": ANALYZED.id,
                "title": ANALYZED.title,
                "chapter": 1,
                "text_rank": 1,
                "story_rank": 2.0,
                "displacement": 1.0,
                "displacement_type": "prolepsis",
            },
        ],
    }


@pytest.fixture
def temporal_client(request, mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """Timeline client whose cache also answers the temporal_analysis key.

    Parametrised via ``request.param`` with the cached payload (or None) so
    each case wires one cache state.
    """
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    mock_kg.get_events = AsyncMock(return_value=[ANALYZED, PLAIN])
    mock_kg.get_temporal_relations = AsyncMock(return_value=[])

    cached_temporal = request.param

    cache = attach_get_as(AsyncMock())

    async def _get(key):
        if key.startswith("temporal_analysis:"):
            return cached_temporal
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


class TestTimelineTemporalDisplacement:
    """#21h results surfaced on the timeline (see docs/plans/20260727-*)."""

    @pytest.mark.parametrize("temporal_client", [None], indirect=True)
    def test_never_run_reports_not_analyzed(self, temporal_client):
        body = temporal_client.get("/api/v1/books/doc-1/timeline").json()
        assert body["temporalAnalyzed"] is False
        assert body["temporalStructure"] is None
        assert all(e["temporalDisplacement"] is None for e in body["events"])

    @pytest.mark.parametrize(
        "temporal_client",
        [_temporal_payload(coverage_sufficient=False, displacements=[])],
        indirect=True,
    )
    def test_insufficient_coverage_counts_as_never_run(self, temporal_client):
        body = temporal_client.get("/api/v1/books/doc-1/timeline").json()
        assert body["temporalAnalyzed"] is False
        assert body["temporalStructure"] is None

    @pytest.mark.parametrize("temporal_client", [_temporal_payload()], indirect=True)
    def test_completed_run_attaches_verdict_per_event(self, temporal_client):
        body = temporal_client.get("/api/v1/books/doc-1/timeline").json()
        assert body["temporalAnalyzed"] is True
        assert body["temporalStructure"] == "non_linear"
        events = {e["title"]: e for e in body["events"]}
        verdict = events["Analyzed event"]["temporalDisplacement"]
        assert verdict["type"] == "prolepsis"
        assert verdict["textRank"] == 1
        assert verdict["storyRank"] == 2.0
        # An event the analysis had no verdict for stays null rather than
        # defaulting to "linear".
        assert events["Unanalyzed event"]["temporalDisplacement"] is None

    @pytest.mark.parametrize(
        "temporal_client",
        [_temporal_payload(displacements=[{"event_id": ANALYZED.id}])],
        indirect=True,
    )
    def test_malformed_entry_is_dropped_not_fatal(self, temporal_client):
        resp = temporal_client.get("/api/v1/books/doc-1/timeline")
        assert resp.status_code == 200
        body = resp.json()
        assert body["temporalAnalyzed"] is True
        assert all(e["temporalDisplacement"] is None for e in body["events"])


class TestTimelineTemporalStaleness:
    """A rerun after the temporal analysis was cached is reported, not hidden."""

    @pytest.mark.parametrize("temporal_client", [None], indirect=True)
    def test_fresh_when_no_step_timestamp(self, temporal_client):
        """Absent timestamps predate the field; flagging would stale everything."""
        body = temporal_client.get("/api/v1/books/doc-1/timeline").json()
        assert body["temporalIsStale"] is False
        assert body["temporalStaleReason"] is None


# ── Timeline computation is cancellable ──────────────────────────────────────


@pytest.fixture
def compute_client(timeline_client, mock_doc):
    """timeline_client with the temporal pipeline stubbed.

    ``get_temporal_pipeline`` is not covered by the shared fixtures, so it is
    extended here per the local-fixture convention. ``get_document`` is wired
    too — the endpoint 404s on a missing book before it ever reaches the task.
    """
    from storysphere.api import deps

    mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
    mock_doc.get_document_language = AsyncMock(return_value="zh-TW")

    pipeline = AsyncMock()
    pipeline.run = AsyncMock(return_value=SimpleNamespace(
        temporal_relations=3, events_ranked=2, cycles_resolved=0, errors=[],
    ))
    timeline_client.app.dependency_overrides[deps.get_temporal_pipeline] = lambda: pipeline
    timeline_client.pipeline = pipeline
    return timeline_client


class TestComputeCancellation:
    """Temporal computation walks every event in the book — long enough that
    stopping it has to work.

    Before the migration it went through ``BackgroundTasks.add_task``, which
    hands back no task handle, so ``POST /tasks/:id/cancel`` could only answer
    409 "not cancellable".
    """

    def _start(self, client) -> str:
        resp = client.post("/api/v1/books/book-1/timeline/compute")
        assert resp.status_code == 202
        return resp.json()["taskId"]

    def test_running_computation_can_be_cancelled(self, compute_client):
        compute_client.pipeline.run = AsyncMock(side_effect=hanging_call())

        task_id = self._start(compute_client)

        resp = compute_client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 204, "runner was not registered as cancellable"

    def test_cancelled_computation_ends_up_failed(self, compute_client):
        compute_client.pipeline.run = AsyncMock(side_effect=hanging_call())

        task_id = self._start(compute_client)
        compute_client.post(f"/api/v1/tasks/{task_id}/cancel")

        status = poll_until_terminal(compute_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "cancelled"

    def test_completion_carries_the_counts(self, compute_client):
        task_id = self._start(compute_client)

        status = poll_until_terminal(compute_client, task_id)
        assert status["status"] == "done"
        assert status["result"]["temporal_relations"] == 3
        assert status["result"]["events_ranked"] == 2

    def test_failure_reaches_the_task(self, compute_client):
        compute_client.pipeline.run = AsyncMock(side_effect=RuntimeError("KG 讀取失敗"))

        task_id = self._start(compute_client)

        status = poll_until_terminal(compute_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "KG 讀取失敗"
