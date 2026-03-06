"""Tests for agents.analysis_agent — cache-first orchestrator."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from agents.analysis_agent import AnalysisAgent
from services.analysis_cache import AnalysisCache
from services.analysis_models import (
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)


def _make_result(**overrides) -> CharacterAnalysisResult:
    defaults = dict(
        entity_id="ent-1",
        entity_name="Alice",
        document_id="doc-1",
        profile=CharacterProfile(summary="Alice is brave."),
        cep=CEPResult(actions=["fought"]),
        archetypes=[],
        arc=[],
        coverage=CoverageMetrics(action_count=1),
    )
    defaults.update(overrides)
    return CharacterAnalysisResult(**defaults)


@pytest.fixture
def mock_service():
    svc = AsyncMock()
    svc.analyze_character = AsyncMock(return_value=_make_result())
    return svc


@pytest.fixture
def cache(tmp_path):
    return AnalysisCache(db_path=str(tmp_path / "agent_cache.db"), ttl_seconds=3600)


class TestAnalysisAgent:
    async def test_cache_miss_calls_service(self, mock_service, cache):
        agent = AnalysisAgent(analysis_service=mock_service, cache=cache)
        result = await agent.analyze_character("Alice", "doc-1")

        assert isinstance(result, CharacterAnalysisResult)
        assert result.entity_name == "Alice"
        mock_service.analyze_character.assert_awaited_once()

    async def test_cache_hit_skips_service(self, mock_service, cache):
        agent = AnalysisAgent(analysis_service=mock_service, cache=cache)

        # First call populates cache
        await agent.analyze_character("Alice", "doc-1")
        mock_service.analyze_character.assert_awaited_once()

        # Second call should use cache
        result = await agent.analyze_character("Alice", "doc-1")
        assert result.entity_name == "Alice"
        # Still only 1 call to service
        assert mock_service.analyze_character.await_count == 1

    async def test_force_refresh_bypasses_cache(self, mock_service, cache):
        agent = AnalysisAgent(analysis_service=mock_service, cache=cache)

        await agent.analyze_character("Alice", "doc-1")
        await agent.analyze_character("Alice", "doc-1", force_refresh=True)

        assert mock_service.analyze_character.await_count == 2

    async def test_no_cache_always_calls_service(self, mock_service):
        agent = AnalysisAgent(analysis_service=mock_service, cache=None)

        await agent.analyze_character("Alice", "doc-1")
        await agent.analyze_character("Alice", "doc-1")

        assert mock_service.analyze_character.await_count == 2

    async def test_passes_archetype_frameworks(self, mock_service, cache):
        agent = AnalysisAgent(analysis_service=mock_service, cache=cache)
        await agent.analyze_character("Alice", "doc-1", archetype_frameworks=["jung", "schmidt"])

        call_kwargs = mock_service.analyze_character.call_args[1]
        assert call_kwargs["archetype_frameworks"] == ["jung", "schmidt"]

    async def test_different_entities_different_cache(self, mock_service, cache):
        agent = AnalysisAgent(analysis_service=mock_service, cache=cache)

        mock_service.analyze_character = AsyncMock(
            side_effect=[_make_result(entity_name="Alice"), _make_result(entity_name="Bob")]
        )
        r1 = await agent.analyze_character("Alice", "doc-1")
        r2 = await agent.analyze_character("Bob", "doc-1")

        assert r1.entity_name == "Alice"
        assert r2.entity_name == "Bob"
        assert mock_service.analyze_character.await_count == 2
