"""Narrative endpoints — representative-event resolution on GET /narrative."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.events import Event, EventType
from storysphere.domain.narrative import HeroJourneyStage, NarrativeStructure


def _kernel(eid: str, chapter: int, title: str = "Event") -> Event:
    return Event(
        id=eid,
        title=title,
        event_type=EventType.PLOT,
        description="…",
        chapter=chapter,
        narrative_weight="kernel",
    )


def _stage(stage_id: str, chapter_range: list[int], **kw) -> dict:
    return HeroJourneyStage(
        stage_id=stage_id,
        stage_name=stage_id,
        chapter_range=chapter_range,
        confidence=0.9,
        **kw,
    ).model_dump()


class TestWithRepresentativeEvents:
    """Pure resolution logic: chapter_range ∩ kernel spine."""

    def _resolve(self, stages, kernels):
        from storysphere.api.routers.narrative import _with_representative_events

        return _with_representative_events(stages, kernels)

    def test_picks_events_inside_the_chapter_range(self):
        kernels = [_kernel("a", 1), _kernel("b", 2), _kernel("c", 5)]
        out = self._resolve([_stage("ordinary_world", [1, 2])], kernels)
        assert out[0]["representative_event_ids"] == ["a", "b"]

    def test_range_is_a_span_not_a_membership_list(self):
        # [2, 4] means chapters 2 through 4 — chapter 3 counts.
        kernels = [_kernel("a", 2), _kernel("b", 3), _kernel("c", 4), _kernel("d", 5)]
        out = self._resolve([_stage("refusal_of_call", [2, 4])], kernels)
        assert out[0]["representative_event_ids"] == ["a", "b", "c"]

    def test_caps_at_four_keeping_the_earliest(self):
        kernels = [_kernel(f"e{i}", 1) for i in range(7)]
        out = self._resolve([_stage("ordinary_world", [1])], kernels)
        assert out[0]["representative_event_ids"] == ["e0", "e1", "e2", "e3"]

    def test_absent_stage_resolves_to_no_events(self):
        out = self._resolve([_stage("reward", [])], [_kernel("a", 1)])
        assert out[0]["representative_event_ids"] == []

    def test_stage_past_the_last_kernel_event_resolves_to_no_events(self):
        # Real shape: the journey reaches ch10, kernel events stop at ch9.
        out = self._resolve([_stage("return_with_elixir", [10])], [_kernel("a", 9)])
        assert out[0]["representative_event_ids"] == []

    def test_stages_sharing_a_range_get_the_same_events(self):
        kernels = [_kernel("a", 1), _kernel("b", 2)]
        out = self._resolve(
            [_stage("ordinary_world", [1, 2]), _stage("meeting_the_mentor", [1, 2])],
            kernels,
        )
        assert out[0]["representative_event_ids"] == ["a", "b"]
        assert out[1]["representative_event_ids"] == ["a", "b"]

    def test_existing_ids_are_left_alone(self):
        stage = _stage("ordinary_world", [1, 2], representative_event_ids=["kept"])
        out = self._resolve([stage], [_kernel("a", 1)])
        assert out[0]["representative_event_ids"] == ["kept"]

    def test_no_kernels_resolves_to_no_events(self):
        out = self._resolve([_stage("ordinary_world", [1, 2])], [])
        assert out[0]["representative_event_ids"] == []

    def test_is_stable_across_repeated_calls(self):
        kernels = [_kernel("a", 1), _kernel("b", 2)]
        stages = [_stage("ordinary_world", [1, 2])]
        assert self._resolve(stages, kernels) == self._resolve(stages, kernels)


# ── Endpoint ─────────────────────────────────────────────────────────────────


@pytest.fixture
def narrative_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """client fixture extended with a mocked NarrativeService.

    conftest does not cover this dependency, so it is built locally per the
    testing guide rather than added to the shared fixtures.
    """
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_narrative = AsyncMock()
    mock_narrative.structure_staleness.return_value = (False, None)
    # Concrete, so the background classify task has a real structure to dump.
    mock_narrative.classify_from_eep.return_value = NarrativeStructure(document_id="book-1")
    mock_narrative.get_kernel_events.return_value = [
        _kernel("ev-1", 1),
        _kernel("ev-2", 2),
        _kernel("ev-3", 9),
    ]
    mock_narrative.get_cached_structure.return_value = NarrativeStructure(
        document_id="book-1",
        hero_journey_stages=[
            HeroJourneyStage(
                stage_id="ordinary_world",
                stage_name="Ordinary World",
                chapter_range=[1, 2],
                confidence=0.9,
            ),
            HeroJourneyStage(
                stage_id="reward",
                stage_name="Reward",
                chapter_range=[],
                confidence=0.0,
            ),
        ],
    )

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_narrative_service] = lambda: mock_narrative

    with TestClient(app) as c:
        c.mock_narrative = mock_narrative
        yield c

    app.dependency_overrides.clear()


class TestGetNarrativeStructure:
    def test_resolves_representative_events(self, narrative_client):
        resp = narrative_client.get("/api/v1/narrative?book_id=book-1")
        assert resp.status_code == 200
        stages = resp.json()["hero_journey_stages"]
        assert stages[0]["representative_event_ids"] == ["ev-1", "ev-2"]
        assert stages[1]["representative_event_ids"] == []

    def test_reads_kernels_without_the_auto_classify_path(self, narrative_client):
        narrative_client.get("/api/v1/narrative?book_id=book-1")
        # get_kernel_spine() can write to the KG; a read must not reach it.
        narrative_client.mock_narrative.get_kernel_events.assert_awaited_once()
        narrative_client.mock_narrative.get_kernel_spine.assert_not_awaited()

    def test_skips_the_kernel_lookup_when_there_are_no_stages(self, narrative_client):
        narrative_client.mock_narrative.get_cached_structure.return_value = (
            NarrativeStructure(document_id="book-1", hero_journey_stages=[])
        )
        resp = narrative_client.get("/api/v1/narrative?book_id=book-1")
        assert resp.status_code == 200
        narrative_client.mock_narrative.get_kernel_events.assert_not_awaited()

    def test_returns_404_when_nothing_is_cached(self, narrative_client):
        narrative_client.mock_narrative.get_cached_structure.return_value = None
        resp = narrative_client.get("/api/v1/narrative?book_id=no-such-book")
        assert resp.status_code == 404

    def test_keeps_the_derived_staleness_fields(self, narrative_client):
        narrative_client.mock_narrative.structure_staleness.return_value = (
            True,
            "event_analysis",
        )
        body = narrative_client.get("/api/v1/narrative?book_id=book-1").json()
        assert body["is_stale"] is True
        assert body["stale_reason"] == "event_analysis"


# ── Classify guard ───────────────────────────────────────────────────────────


def _event(eid: str, weight: str) -> Event:
    return Event(
        id=eid,
        title=eid,
        event_type=EventType.PLOT,
        description="…",
        chapter=1,
        narrative_weight=weight,
    )


class TestClassifyWouldWipe:
    """The service refuses a run whose only effect would be losing classifications."""

    def _service(self, events, cached_hits):
        from storysphere.services.narrative_service import NarrativeService

        kg = AsyncMock()
        kg.get_events.return_value = events
        cache = AsyncMock()

        def _get_as(key, _model):
            if key.startswith("event:"):
                return object() if key.split(":")[-1] in cached_hits else None
            return None

        cache.get_as.side_effect = _get_as
        cache.get.side_effect = lambda _key: None
        return NarrativeService(kg, AsyncMock(), cache), cache

    @pytest.mark.asyncio
    async def test_reports_hits_classified_and_total(self):
        svc, _ = self._service(
            [_event("a", "kernel"), _event("b", "satellite"), _event("c", "unclassified")],
            cached_hits={"a"},
        )
        assert await svc.eep_coverage("book-1") == (1, 2, 3)

    @pytest.mark.asyncio
    async def test_aborts_without_writing_when_cache_is_gone(self):
        events = [_event("a", "kernel"), _event("b", "satellite")]
        svc, cache = self._service(events, cached_hits=set())
        await svc.classify_from_eep("book-1")
        # Nothing written, and the KG weights are left as they were.
        cache.set.assert_not_awaited()
        assert [e.narrative_weight for e in events] == ["kernel", "satellite"]

    @pytest.mark.asyncio
    async def test_runs_on_a_book_that_has_nothing_classified_yet(self):
        # Overwriting "unclassified" with "unclassified" loses nothing, so a
        # first run on a fresh book must not be blocked.
        events = [_event("a", "unclassified"), _event("b", "unclassified")]
        svc, cache = self._service(events, cached_hits=set())
        await svc.classify_from_eep("book-1")
        cache.set.assert_awaited()

    @pytest.mark.asyncio
    async def test_runs_when_at_least_one_cache_entry_survives(self):
        events = [_event("a", "kernel"), _event("b", "kernel")]
        svc, cache = self._service(events, cached_hits={"a"})
        await svc.classify_from_eep("book-1")
        cache.set.assert_awaited()


class TestClassifyEndpointGuard:
    def test_409_when_a_run_would_wipe_classifications(self, narrative_client):
        narrative_client.mock_narrative.eep_coverage.return_value = (0, 38, 47)
        resp = narrative_client.post(
            "/api/v1/narrative/classify", json={"document_id": "book-1"}
        )
        assert resp.status_code == 409
        assert "38" in resp.json()["detail"]

    def test_202_when_nothing_is_classified_yet(self, narrative_client):
        narrative_client.mock_narrative.eep_coverage.return_value = (0, 0, 47)
        resp = narrative_client.post(
            "/api/v1/narrative/classify", json={"document_id": "book-1"}
        )
        assert resp.status_code == 202

    def test_202_when_the_cache_still_has_entries(self, narrative_client):
        narrative_client.mock_narrative.eep_coverage.return_value = (12, 38, 47)
        resp = narrative_client.post(
            "/api/v1/narrative/classify", json={"document_id": "book-1"}
        )
        assert resp.status_code == 202


# ── Review advances the classification source ────────────────────────────────


class TestUpdateReview:
    """Approving is the only thing that ever writes "human_verified"."""

    def _service(self, source, event_sources):
        from storysphere.services.narrative_service import NarrativeService

        structure = NarrativeStructure(document_id="book-1", classification_source=source)
        kg = AsyncMock()
        kg.get_events.return_value = [
            Event(
                id=f"e{i}",
                title=f"e{i}",
                event_type=EventType.PLOT,
                description="…",
                chapter=1,
                narrative_weight="kernel",
                narrative_weight_source=src,
            )
            for i, src in enumerate(event_sources)
        ]
        cache = AsyncMock()
        cache.get_as.return_value = structure
        return NarrativeService(kg, AsyncMock(), cache)

    @pytest.mark.asyncio
    async def test_approving_marks_the_classification_human_verified(self):
        svc = self._service("llm_classified", ["llm_classified"])
        result = await svc.update_review("book-1", "approved")
        assert result.review_status == "approved"
        assert result.classification_source == "human_verified"

    @pytest.mark.asyncio
    async def test_withdrawing_an_approval_restores_the_llm_source(self):
        svc = self._service("human_verified", ["llm_classified", "summary_heuristic"])
        result = await svc.update_review("book-1", "rejected")
        assert result.classification_source == "llm_classified"

    @pytest.mark.asyncio
    async def test_withdrawing_an_approval_falls_back_to_the_heuristic(self):
        svc = self._service("human_verified", ["summary_heuristic"])
        result = await svc.update_review("book-1", "rejected")
        assert result.classification_source == "summary_heuristic"

    @pytest.mark.asyncio
    async def test_rejecting_something_never_approved_leaves_the_source_alone(self):
        svc = self._service("llm_classified", ["llm_classified"])
        result = await svc.update_review("book-1", "rejected")
        assert result.classification_source == "llm_classified"

    @pytest.mark.asyncio
    async def test_returns_none_when_nothing_is_cached(self):
        from storysphere.services.narrative_service import NarrativeService

        cache = AsyncMock()
        cache.get_as.return_value = None
        svc = NarrativeService(AsyncMock(), AsyncMock(), cache)
        assert await svc.update_review("no-such-book", "approved") is None


# ── Background tasks are cancellable ─────────────────────────────────────────


def _poll_until_terminal(client, task_id: str, attempts: int = 20) -> dict:
    """Poll the status endpoint until the task settles.

    Each request drives the app's event loop, which is what lets the background
    task make progress under TestClient.
    """
    body: dict = {}
    for _ in range(attempts):
        body = client.get(f"/api/v1/tasks/{task_id}/status").json()
        if body["status"] in ("done", "error"):
            return body
    raise AssertionError(f"task {task_id} never settled: {body}")


class TestCancellation:
    """The point of moving these runners onto ``task_runner``.

    Before the migration all four narrative runners went through
    ``BackgroundTasks.add_task``, which hands back no task handle — so
    ``POST /tasks/:id/cancel`` could only ever answer 409 "not cancellable".
    """

    @staticmethod
    def _hang():
        """An awaited call that never finishes, so the task is still running."""

        async def _never(*_a, **_kw):
            await asyncio.sleep(30)

        return _never

    def _start_classify(self, client) -> str:
        client.mock_narrative.eep_coverage.return_value = (12, 38, 47)
        resp = client.post("/api/v1/narrative/classify", json={"document_id": "book-1"})
        assert resp.status_code == 202
        return resp.json()["taskId"]

    def test_running_task_can_be_cancelled(self, narrative_client):
        narrative_client.mock_narrative.classify_from_eep.side_effect = self._hang()

        task_id = self._start_classify(narrative_client)

        resp = narrative_client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 204, "runner was not registered as cancellable"

    def test_cancelled_task_ends_up_failed(self, narrative_client):
        narrative_client.mock_narrative.classify_from_eep.side_effect = self._hang()

        task_id = self._start_classify(narrative_client)
        narrative_client.post(f"/api/v1/tasks/{task_id}/cancel")

        status = _poll_until_terminal(narrative_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "cancelled"

    def test_completion_still_works(self, narrative_client):
        """The migration must not cost the ordinary path."""
        task_id = self._start_classify(narrative_client)

        status = _poll_until_terminal(narrative_client, task_id)
        assert status["status"] == "done"
        assert status["result"]["document_id"] == "book-1"

    def test_failure_still_reaches_the_task(self, narrative_client):
        narrative_client.mock_narrative.eep_coverage.return_value = (12, 38, 47)
        narrative_client.mock_narrative.classify_from_eep.side_effect = RuntimeError("KG 掛了")

        resp = narrative_client.post("/api/v1/narrative/classify", json={"document_id": "book-1"})
        task_id = resp.json()["taskId"]

        status = _poll_until_terminal(narrative_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "KG 掛了"

