"""Unit tests for ExtractionService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from storysphere.domain.entities import Entity, EntityType
from storysphere.services.extraction_service import (
    ExtractionService,
    _parse_extraction_response,
    _parse_json_response,
)


@pytest.fixture
def mock_llm():
    return AsyncMock()


@pytest.fixture
def service(mock_llm):
    return ExtractionService(llm=mock_llm)


# -- Entity extraction -------------------------------------------------------


class TestExtractEntities:
    @pytest.mark.asyncio
    async def test_returns_entities(self, service, mock_llm):
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content='{"entities": [{"name": "Alice", "entity_type": "character"}]}'
            )
        )
        result = await service.extract_entities("Alice entered the garden.", 1)

        assert len(result) == 1
        assert result[0].name == "Alice"
        assert result[0].entity_type == EntityType.CHARACTER
        assert result[0].first_appearance_chapter == 1

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self, service):
        result = await service.extract_entities("   ", 1)
        assert result == []

    @pytest.mark.asyncio
    async def test_unknown_entity_type_defaults_to_other(self, service, mock_llm):
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content='{"entities": [{"name": "X", "entity_type": "unknown_type"}]}'
            )
        )
        result = await service.extract_entities("X appeared.", 1)
        assert result[0].entity_type == EntityType.OTHER


# -- Relation extraction -----------------------------------------------------


class TestExtractRelations:
    @pytest.mark.asyncio
    async def test_returns_relations_and_events(self, service, mock_llm):
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content="""{
                    "relations": [
                        {"source_name": "Alice", "target_name": "Bob",
                         "relation_type": "friendship"}
                    ],
                    "events": [
                        {"title": "Meeting", "event_type": "meeting",
                         "description": "They met."}
                    ]
                }"""
            )
        )
        entities = [
            Entity(id="e1", name="Alice", entity_type=EntityType.CHARACTER),
            Entity(id="e2", name="Bob", entity_type=EntityType.CHARACTER),
        ]
        relations, events = await service.extract_relations("Text.", entities, 1)

        assert len(relations) == 1
        assert relations[0].source_id == "e1"
        assert relations[0].target_id == "e2"
        assert len(events) == 1
        assert events[0].title == "Meeting"

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self, service):
        result = await service.extract_relations("", [], 1)
        assert result == ([], [])

    @pytest.mark.asyncio
    async def test_skips_unknown_entity_names(self, service, mock_llm):
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content="""{
                    "relations": [
                        {"source_name": "Alice", "target_name": "Unknown",
                         "relation_type": "friendship"}
                    ],
                    "events": []
                }"""
            )
        )
        entities = [
            Entity(id="e1", name="Alice", entity_type=EntityType.CHARACTER),
        ]
        relations, events = await service.extract_relations("Text.", entities, 1)
        assert len(relations) == 0


# -- JSON parsers ------------------------------------------------------------


class TestNarrativePosition:
    """B-106 — the field had five consumers sorting by it and no producer.

    Every one of them does ``sorted(key=lambda e: (e.chapter, e.narrative_position
    or 0))``, so an unfilled field does not fail loudly: it ties every event in a
    chapter and the order silently becomes arbitrary.
    """

    @staticmethod
    def _events_payload(*titles: str) -> str:
        items = ", ".join(
            f'{{"title": "{t}", "event_type": "other", "description": "d"}}'
            for t in titles
        )
        return f'{{"relations": [], "events": [{items}]}}'

    @pytest.fixture
    def entities(self):
        return [Entity(id="e1", name="Alice", entity_type=EntityType.CHARACTER)]

    @pytest.mark.asyncio
    async def test_events_are_numbered_in_response_order(
        self, service, mock_llm, entities
    ):
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content=self._events_payload("First", "Second", "Third")
            )
        )

        _, events = await service.extract_relations("Text.", entities, 3)

        assert [e.title for e in events] == ["First", "Second", "Third"]
        assert [e.narrative_position for e in events] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_every_event_gets_a_position(self, service, mock_llm, entities):
        """The guard against it becoming a zero-writer field again."""
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=self._events_payload("A", "B"))
        )

        _, events = await service.extract_relations("Text.", entities, 1)

        assert events
        assert all(e.narrative_position is not None for e in events)

    @pytest.mark.asyncio
    async def test_numbering_is_one_based(self, service, mock_llm, entities):
        """0 would be falsy, and the consumers' ``or 0`` cannot tell a real
        first-in-chapter position from a pre-B-106 event that has none."""
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=self._events_payload("Only"))
        )

        _, events = await service.extract_relations("Text.", entities, 1)

        assert events[0].narrative_position == 1

    @pytest.mark.asyncio
    async def test_positions_restart_each_chapter(self, service, mock_llm, entities):
        """Position is within-chapter; consumers always sort on (chapter, pos)."""
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=self._events_payload("A", "B"))
        )

        _, ch1 = await service.extract_relations("Text.", entities, 1)
        _, ch7 = await service.extract_relations("Text.", entities, 7)

        assert [e.narrative_position for e in ch1] == [1, 2]
        assert [e.narrative_position for e in ch7] == [1, 2]

    def test_the_prompt_asks_for_text_order(self):
        """The numbering is only meaningful if the model was told to order by
        the text — nothing downstream can detect a model that ranked by
        importance instead."""
        from storysphere.services.extraction_service import _RELATION_SYSTEM_PROMPT

        assert "where each event first appears in the chapter text" in _RELATION_SYSTEM_PROMPT

    def test_the_prompt_keeps_ordering_away_from_granularity(self):
        """Asking for order also asks the model to place each event on the
        chapter's timeline, and a passage that summarises a stretch of backstory
        has no single place on it — so it gets split into beats that do.

        The first wording shipped for B-106 raised ch7 of 名字的潮汐 from 5.4
        to 9.0 events on a ten-run average. Saying the instruction governs the
        list order alone brought that to 7.0. It does not remove the effect —
        nothing tested did — so this pins the half of the wording that is doing
        the work, which a later reword would otherwise drop as redundant.
        See docs/plans/20260910-event-granularity-ordering-experiments.md.
        """
        from storysphere.services.extraction_service import _RELATION_SYSTEM_PROMPT

        assert "governs the order of the list only" in _RELATION_SYSTEM_PROMPT


class TestParseJsonResponse:
    def test_valid_json(self):
        result = _parse_json_response(
            '{"entities": [{"name": "Alice", "entity_type": "character"}]}'
        )
        assert len(result.entities) == 1

    def test_markdown_fenced(self):
        result = _parse_json_response(
            '```json\n{"entities": [{"name": "Bob"}]}\n```'
        )
        assert result.entities[0].name == "Bob"

    def test_empty_list(self):
        result = _parse_json_response('{"entities": []}')
        assert result.entities == []


class TestParseExtractionResponse:
    def test_valid(self):
        result = _parse_extraction_response(
            '{"relations": [{"source_name": "A", "target_name": "B"}], "events": []}'
        )
        assert len(result.relations) == 1

    def test_empty(self):
        result = _parse_extraction_response('{"relations": [], "events": []}')
        assert result.relations == []
        assert result.events == []
