"""Tests for services.narrative_service — NarrativeStructure cache recovery."""

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.events import Event, EventType
from storysphere.services.analysis_cache import AnalysisCache
from storysphere.services.narrative_service import NarrativeService


def _make_event(event_id: str, weight: str, source: str | None = "llm_classified") -> Event:
    return Event(
        id=event_id,
        document_id="doc-1",
        title=f"Event {event_id}",
        event_type=EventType.PLOT,
        description="Something happens.",
        chapter=1,
        narrative_weight=weight,
        narrative_weight_source=source if weight != "unclassified" else None,
    )


def _stage(stage_id: str = "ordinary_world") -> dict:
    return {
        "stage_id": stage_id,
        "stage_name": "平凡世界",
        "chapter_range": [1, 2],
        "representative_event_ids": [],
        "confidence": 0.9,
        "notes": None,
    }


@pytest.fixture
def cache(tmp_path):
    return AnalysisCache(db_path=str(tmp_path / "cache.db"))


@pytest.fixture
def mock_kg():
    kg = AsyncMock()
    kg.get_events.return_value = []
    return kg


@pytest.fixture
def service(mock_kg, cache):
    return NarrativeService(kg_service=mock_kg, document_service=AsyncMock(), cache=cache)


class TestGetCachedStructureRecovery:
    """A NarrativeStructure lost from the cache is rebuilt from the KG."""

    async def test_returns_none_when_no_events_classified(self, service, mock_kg):
        mock_kg.get_events.return_value = [_make_event("e1", "unclassified", None)]
        assert await service.get_cached_structure("doc-1") is None

    async def test_returns_none_when_book_has_no_events(self, service):
        assert await service.get_cached_structure("doc-1") is None

    async def test_rebuilds_from_kg_event_weights(self, service, mock_kg):
        mock_kg.get_events.return_value = [
            _make_event("e1", "kernel"),
            _make_event("e2", "satellite"),
            _make_event("e3", "unclassified", None),
        ]

        structure = await service.get_cached_structure("doc-1")

        assert structure is not None
        assert structure.document_id == "doc-1"
        assert structure.kernel_event_ids == ["e1"]
        assert structure.satellite_event_ids == ["e2"]
        assert structure.unclassified_event_ids == ["e3"]

    async def test_rebuild_attaches_hero_journey_stages(self, service, mock_kg, cache):
        mock_kg.get_events.return_value = [_make_event("e1", "kernel")]
        await cache.set("hero_journey:doc-1", [_stage(), _stage("call_to_adventure")])

        structure = await service.get_cached_structure("doc-1")

        assert [s.stage_id for s in structure.hero_journey_stages] == [
            "ordinary_world",
            "call_to_adventure",
        ]

    async def test_rebuild_is_persisted_to_cache(self, service, mock_kg, cache):
        mock_kg.get_events.return_value = [_make_event("e1", "kernel")]

        await service.get_cached_structure("doc-1")

        assert await cache.get("narrative_structure:doc-1") is not None

    async def test_rebuild_never_reports_summary_heuristic(self, service, mock_kg):
        """summary_heuristic would re-trigger migration through a removed classifier."""
        mock_kg.get_events.return_value = [_make_event("e1", "kernel", "summary_heuristic")]

        structure = await service.get_cached_structure("doc-1")

        assert structure.classification_source == "llm_classified"

    async def test_rebuild_keeps_human_verified(self, service, mock_kg):
        mock_kg.get_events.return_value = [_make_event("e1", "kernel", "human_verified")]

        structure = await service.get_cached_structure("doc-1")

        assert structure.classification_source == "human_verified"

    async def test_existing_cache_entry_wins_over_rebuild(self, service, mock_kg, cache):
        mock_kg.get_events.return_value = [_make_event("e1", "kernel")]
        await cache.set(
            "narrative_structure:doc-1",
            {
                "document_id": "doc-1",
                "kernel_event_ids": ["cached-1", "cached-2"],
                "classification_source": "llm_classified",
                "review_status": "approved",
            },
        )

        structure = await service.get_cached_structure("doc-1")

        assert structure.kernel_event_ids == ["cached-1", "cached-2"]
        assert structure.review_status == "approved"
        mock_kg.get_events.assert_not_called()
