"""Unit tests for other tools (3 tools)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from domain.entities import Entity, EntityType
from tools.other_tools import CompareEntitiesTool, ExtractEntitiesFromTextTool, GetChapterSummaryTool


class TestExtractEntitiesFromTextTool:
    @pytest.mark.asyncio
    async def test_extracts_entities(self):
        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(
            return_value=[
                Entity(name="Alice", entity_type=EntityType.CHARACTER, description="The hero"),
                Entity(name="London", entity_type=EntityType.LOCATION, description="A city"),
            ]
        )
        tool = ExtractEntitiesFromTextTool(entity_extractor=mock_extractor)
        result = json.loads(await tool._arun("Alice walked through London."))
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["name"] == "Alice"
        assert result[1]["name"] == "London"

    @pytest.mark.asyncio
    async def test_empty_text(self):
        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value=[])
        tool = ExtractEntitiesFromTextTool(entity_extractor=mock_extractor)
        result = json.loads(await tool._arun(""))
        assert result == []


class TestCompareEntitiesTool:
    @pytest.mark.asyncio
    async def test_compares_entities(self, mock_kg_service):
        tool = CompareEntitiesTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice", "Bob"))
        assert result["entity_a"]["name"] == "Alice"
        assert result["entity_b"]["name"] == "Bob"
        assert "relations_a_count" in result
        assert "type_match" in result

    @pytest.mark.asyncio
    async def test_first_not_found(self, mock_kg_service):
        tool = CompareEntitiesTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent", "Bob")
        assert "not found" in result.lower()

    @pytest.mark.asyncio
    async def test_second_not_found(self, mock_kg_service):
        tool = CompareEntitiesTool(kg_service=mock_kg_service)
        result = await tool._arun("Alice", "nonexistent")
        assert "not found" in result.lower()


class TestGetChapterSummaryTool:
    @pytest.mark.asyncio
    async def test_returns_summary(self, mock_doc_service):
        tool = GetChapterSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1", chapter_number=1))
        assert result["chapter_number"] == 1
        assert "summary" in result

    @pytest.mark.asyncio
    async def test_not_found(self, mock_doc_service):
        mock_doc_service.get_chapter_summary.return_value = None
        tool = GetChapterSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1", chapter_number=99))
        assert "message" in result
