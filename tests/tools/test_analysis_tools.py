"""Unit tests for analysis tools."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.analysis_models import (
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
    ArchetypeResult,
    ArcSegment,
)
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


class TestAnalyzeCharacterTool:
    @staticmethod
    def _make_mock_agent():
        agent = AsyncMock()
        agent.analyze_character = AsyncMock(return_value=CharacterAnalysisResult(
            entity_id="ent-1",
            entity_name="Alice",
            document_id="doc-1",
            profile=CharacterProfile(summary="Alice is a brave hero."),
            cep=CEPResult(
                actions=["fought the dragon"],
                traits=["brave", "determined"],
                relations=[{"target": "Bob", "type": "ally", "description": "friend"}],
            ),
            archetypes=[ArchetypeResult(
                framework="jung", primary="hero", confidence=0.9, evidence=["fights bravely"],
            )],
            arc=[ArcSegment(chapter_range="1-5", phase="Setup", description="Intro")],
            coverage=CoverageMetrics(action_count=1, trait_count=2, relation_count=1),
        ))
        return agent

    @pytest.mark.asyncio
    async def test_returns_json_with_analysis(self):
        agent = self._make_mock_agent()
        tool = AnalyzeCharacterTool(analysis_agent=agent)
        raw = await tool._arun("Alice", document_id="doc-1")
        result = json.loads(raw)

        assert result["entity_name"] == "Alice"
        assert result["summary"] == "Alice is a brave hero."
        assert "brave" in result["traits"]
        assert len(result["archetypes"]) == 1
        assert result["archetypes"][0]["primary"] == "hero"

    @pytest.mark.asyncio
    async def test_no_agent_returns_error(self):
        tool = AnalyzeCharacterTool(analysis_agent=None)
        raw = await tool._arun("Alice")
        result = json.loads(raw)
        assert "error" in result

    def test_has_description_and_schema(self):
        tool = AnalyzeCharacterTool()
        assert "character analysis" in tool.description.lower()
        assert tool.args_schema is not None

    @pytest.mark.asyncio
    async def test_passes_frameworks_and_language(self):
        agent = self._make_mock_agent()
        tool = AnalyzeCharacterTool(analysis_agent=agent)
        await tool._arun("Alice", document_id="doc-1", archetype_frameworks=["schmidt"], language="zh")

        call_kwargs = agent.analyze_character.call_args[1]
        assert call_kwargs["archetype_frameworks"] == ["schmidt"]
        assert call_kwargs["language"] == "zh"


class TestAnalyzeEventTool:
    @pytest.mark.asyncio
    async def test_no_agent_returns_error_json(self):
        tool = AnalyzeEventTool(analysis_agent=None)
        raw = await tool._arun("event-1")
        result = json.loads(raw)
        assert "error" in result

    def test_has_description(self):
        tool = AnalyzeEventTool()
        assert "event analysis" in tool.description.lower()
        assert tool.args_schema is not None

    def test_sync_fallback_requires_analysis_agent(self):
        """_run() is a sync fallback; without analysis_agent it returns an error JSON."""
        tool = AnalyzeEventTool()
        result = json.loads(tool._run("event-1"))
        assert "error" in result
