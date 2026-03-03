"""Unit tests for ExtractionService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from domain.entities import Entity, EntityType
from services.extraction_service import (
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
