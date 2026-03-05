"""Unit tests for composite tools (4 tools)."""

from __future__ import annotations

import json

import pytest

from tools.composite_tools import (
    CompareCharactersTool,
    GetCharacterArcTool,
    GetEntityProfileTool,
    GetEntityRelationshipTool,
)


class TestGetEntityProfileTool:
    @pytest.mark.asyncio
    async def test_returns_profile(self, mock_kg_service, mock_doc_service, mock_vector_service):
        tool = GetEntityProfileTool(
            kg_service=mock_kg_service,
            doc_service=mock_doc_service,
            vector_service=mock_vector_service,
        )
        result = json.loads(await tool._arun("Alice"))
        assert result["entity"]["name"] == "Alice"
        assert "relation_count" in result

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service, mock_doc_service, mock_vector_service):
        tool = GetEntityProfileTool(
            kg_service=mock_kg_service,
            doc_service=mock_doc_service,
            vector_service=mock_vector_service,
        )
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()

    @pytest.mark.asyncio
    async def test_partial_services(self, mock_kg_service):
        """Works with only kg_service (doc/vector None)."""
        tool = GetEntityProfileTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice"))
        assert result["entity"]["name"] == "Alice"


class TestGetEntityRelationshipTool:
    @pytest.mark.asyncio
    async def test_returns_relationship(self, mock_kg_service, mock_vector_service):
        tool = GetEntityRelationshipTool(
            kg_service=mock_kg_service,
            vector_service=mock_vector_service,
        )
        result = json.loads(await tool._arun("Alice", "Bob"))
        assert result["entity_a"]["name"] == "Alice"
        assert result["entity_b"]["name"] == "Bob"
        assert "paths" in result

    @pytest.mark.asyncio
    async def test_entity_not_found(self, mock_kg_service, mock_vector_service):
        tool = GetEntityRelationshipTool(
            kg_service=mock_kg_service,
            vector_service=mock_vector_service,
        )
        result = json.loads(await tool._arun("Alice", "nonexistent"))
        assert "error" in result

    @pytest.mark.asyncio
    async def test_both_not_found(self, mock_kg_service):
        tool = GetEntityRelationshipTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("xxx", "yyy"))
        assert "error" in result


class TestGetCharacterArcTool:
    @pytest.mark.asyncio
    async def test_returns_arc(self, mock_kg_service, mock_vector_service, mock_llm):
        from unittest.mock import AsyncMock, MagicMock

        analysis = AsyncMock()
        analysis.generate_insight = AsyncMock(return_value="Alice grows from naive to wise.")

        tool = GetCharacterArcTool(
            kg_service=mock_kg_service,
            vector_service=mock_vector_service,
            analysis_service=analysis,
        )
        result = json.loads(await tool._arun("Alice"))
        assert result["entity"]["name"] == "Alice"
        assert "timeline" in result
        assert result["insight"] == "Alice grows from naive to wise."

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service):
        tool = GetCharacterArcTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()

    @pytest.mark.asyncio
    async def test_without_analysis(self, mock_kg_service):
        tool = GetCharacterArcTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice"))
        assert result["entity"]["name"] == "Alice"
        assert "insight" not in result


class TestCompareCharactersTool:
    @pytest.mark.asyncio
    async def test_returns_comparison(self, mock_kg_service):
        from unittest.mock import AsyncMock

        analysis = AsyncMock()
        analysis.generate_insight = AsyncMock(return_value="Alice is brave, Bob is cautious.")

        tool = CompareCharactersTool(
            kg_service=mock_kg_service,
            analysis_service=analysis,
        )
        result = json.loads(await tool._arun("Alice", "Bob"))
        assert result["character_a"]["name"] == "Alice"
        assert result["character_b"]["name"] == "Bob"
        assert result["comparison_insight"] == "Alice is brave, Bob is cautious."

    @pytest.mark.asyncio
    async def test_entity_not_found(self, mock_kg_service):
        tool = CompareCharactersTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice", "nonexistent"))
        assert "error" in result

    @pytest.mark.asyncio
    async def test_without_analysis(self, mock_kg_service):
        tool = CompareCharactersTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice", "Bob"))
        assert result["character_a"]["name"] == "Alice"
        assert "comparison_insight" not in result
