"""Narrative endpoints — representative-event resolution on GET /narrative."""

from __future__ import annotations

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
