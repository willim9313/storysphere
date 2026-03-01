"""Unit tests for analysis tools (1 complete + 2 stubs)."""

from __future__ import annotations

import json

import pytest

from tools.analysis_tools import AnalyzeCharacterTool, AnalyzeEventTool, GenerateInsightTool


class TestGenerateInsightTool:
    @pytest.mark.asyncio
    async def test_generates_insight(self, mock_llm):
        tool = GenerateInsightTool(llm=mock_llm)
        result = json.loads(await tool._arun("theme of betrayal", context="Alice betrayed Bob in chapter 3."))
        assert result["topic"] == "theme of betrayal"
        assert "insight" in result
        assert len(result["insight"]) > 0

    @pytest.mark.asyncio
    async def test_without_context(self, mock_llm):
        tool = GenerateInsightTool(llm=mock_llm)
        result = json.loads(await tool._arun("love and loss"))
        assert result["topic"] == "love and loss"


class TestAnalyzeCharacterToolStub:
    @pytest.mark.asyncio
    async def test_raises_not_implemented(self, mock_kg_service):
        tool = AnalyzeCharacterTool(kg_service=mock_kg_service)
        with pytest.raises(NotImplementedError, match="Phase 5"):
            await tool._arun("ent-alice")

    def test_has_description(self):
        tool = AnalyzeCharacterTool()
        assert "character analysis" in tool.description.lower()
        assert tool.args_schema is not None

    def test_sync_raises_not_implemented(self):
        tool = AnalyzeCharacterTool()
        with pytest.raises(NotImplementedError, match="Phase 5"):
            tool._run("ent-alice")


class TestAnalyzeEventToolStub:
    @pytest.mark.asyncio
    async def test_raises_not_implemented(self, mock_kg_service):
        tool = AnalyzeEventTool(kg_service=mock_kg_service)
        with pytest.raises(NotImplementedError, match="Phase 5"):
            await tool._arun("event-1")

    def test_has_description(self):
        tool = AnalyzeEventTool()
        assert "event analysis" in tool.description.lower()
        assert tool.args_schema is not None

    def test_sync_raises_not_implemented(self):
        tool = AnalyzeEventTool()
        with pytest.raises(NotImplementedError, match="Phase 5"):
            tool._run("event-1")
