"""Unit tests for graph query tools (6 tools)."""

from __future__ import annotations

import json

import pytest

from tools.graph_tools import (
    GetEntityAttributesTool,
    GetEntityRelationsTool,
    GetEntityTimelineTool,
    GetRelationPathsTool,
    GetRelationStatsTool,
    GetSubgraphTool,
)


class TestGetEntityAttributesTool:
    @pytest.mark.asyncio
    async def test_by_id(self, mock_kg_service):
        tool = GetEntityAttributesTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("ent-alice"))
        assert result["name"] == "Alice"
        assert result["entity_type"] == "character"

    @pytest.mark.asyncio
    async def test_by_name(self, mock_kg_service):
        tool = GetEntityAttributesTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice"))
        assert result["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service):
        tool = GetEntityAttributesTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()


class TestGetEntityRelationsTool:
    @pytest.mark.asyncio
    async def test_returns_relations(self, mock_kg_service):
        tool = GetEntityRelationsTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("ent-alice"))
        assert isinstance(result, list)
        assert len(result) >= 1
        assert result[0]["relation_type"] == "friendship"

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service):
        tool = GetEntityRelationsTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()


class TestGetEntityTimelineTool:
    @pytest.mark.asyncio
    async def test_returns_timeline(self, mock_kg_service):
        tool = GetEntityTimelineTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("ent-alice"))
        assert isinstance(result, list)
        assert len(result) == 2
        # Should be sorted by chapter
        assert result[0]["chapter"] <= result[1]["chapter"]

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service):
        tool = GetEntityTimelineTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()


class TestGetRelationPathsTool:
    @pytest.mark.asyncio
    async def test_finds_paths(self, mock_kg_service):
        tool = GetRelationPathsTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("Alice", "Bob"))
        assert "paths" in result
        assert result["count"] == 1

    @pytest.mark.asyncio
    async def test_source_not_found(self, mock_kg_service):
        tool = GetRelationPathsTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent", "Bob")
        assert "not found" in result.lower()


class TestGetSubgraphTool:
    @pytest.mark.asyncio
    async def test_returns_subgraph(self, mock_kg_service):
        tool = GetSubgraphTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun("ent-alice", k_hops=2))
        assert result["center"] == "ent-alice"
        assert len(result["nodes"]) == 2
        assert len(result["edges"]) == 1

    @pytest.mark.asyncio
    async def test_not_found(self, mock_kg_service):
        tool = GetSubgraphTool(kg_service=mock_kg_service)
        result = await tool._arun("nonexistent")
        assert "not found" in result.lower()


class TestGetRelationStatsTool:
    @pytest.mark.asyncio
    async def test_global_stats(self, mock_kg_service):
        tool = GetRelationStatsTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun())
        assert result["total_relations"] == 1
        assert "friendship" in result["type_distribution"]

    @pytest.mark.asyncio
    async def test_entity_scoped(self, mock_kg_service):
        tool = GetRelationStatsTool(kg_service=mock_kg_service)
        result = json.loads(await tool._arun(entity_id="ent-alice"))
        assert "total_relations" in result
