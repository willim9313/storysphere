"""Tests for agents.analysis_agent — cache-first orchestrator."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from storysphere.agents.analysis_agent import AnalysisAgent
from storysphere.services.analysis_cache import AnalysisCache
from storysphere.services.analysis_models import (
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
    return AnalysisCache(db_path=str(tmp_path / "agent_cache.db"))


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


class TestCharacterCacheId:
    """The character cache key is built from the entity id, not the name."""

    def _agent(self, kg=None) -> AnalysisAgent:
        return AnalysisAgent(analysis_service=AsyncMock(), kg_service=kg)

    async def test_supplied_id_wins(self):
        agent = self._agent(kg=AsyncMock())
        result = await agent._character_cache_id("doc-1", "Alice", "ent-alice")
        assert result == "ent-alice"
        agent._kg_service.get_entity_by_name.assert_not_called()

    async def test_resolves_name_through_kg(self):
        kg = AsyncMock()
        kg.get_entity_by_name = AsyncMock(return_value=SimpleNamespace(id="ent-alice"))
        agent = self._agent(kg=kg)

        assert await agent._character_cache_id("doc-1", "Alice", None) == "ent-alice"

    async def test_falls_back_to_name_without_kg(self):
        agent = self._agent(kg=None)
        assert await agent._character_cache_id("doc-1", "Alice", None) == "Alice"

    async def test_falls_back_to_name_when_unknown(self):
        kg = AsyncMock()
        kg.get_entity_by_name = AsyncMock(return_value=None)
        agent = self._agent(kg=kg)

        assert await agent._character_cache_id("doc-1", "Nobody", None) == "Nobody"


class TestAnalyzeSymbolsBatch:
    """The sweep the symbols page's three buttons drive.

    These moved here from ``tests/api/test_symbols.py`` when the loop was
    lifted out of the router: the accounting is the agent's now, and the
    router only mirrors the summary into the task store.
    """

    @staticmethod
    def _agent() -> AnalysisAgent:
        agent = AnalysisAgent(analysis_service=AsyncMock())
        agent.analyze_symbol = AsyncMock()
        return agent

    async def test_skipped_ids_are_counted_not_analysed(self):
        """Covers both reasons to skip: already interpreted, and refused."""
        agent = self._agent()
        summary = await agent.analyze_symbols_batch(
            "book-1", ["img-1", "img-2"], skip_ids={"img-1"}
        )

        assert summary == {
            "progress": 2, "total": 2, "failed": 0, "skipped": 1, "aborted": False,
        }
        agent.analyze_symbol.assert_awaited_once()

    async def test_force_refresh_reinterprets_a_skipped_id(self):
        agent = self._agent()
        summary = await agent.analyze_symbols_batch(
            "book-1", ["img-1"], skip_ids={"img-1"}, force_refresh=True
        )

        assert summary["skipped"] == 0
        agent.analyze_symbol.assert_awaited_once()

    async def test_one_failure_does_not_stop_the_rest(self):
        agent = self._agent()

        def _analyze(imagery_id, **kw):
            if imagery_id == "img-1":
                raise RuntimeError("LLM returned garbage")
            return None

        agent.analyze_symbol.side_effect = _analyze
        summary = await agent.analyze_symbols_batch("book-1", ["img-1", "img-2"])

        assert summary["failed"] == 1
        assert summary["total"] == 2
        assert agent.analyze_symbol.await_count == 2

    async def test_rate_limit_aborts_the_whole_sweep(self):
        """Continuing past a quota wall just burns the remaining items."""
        agent = self._agent()
        agent.analyze_symbol.side_effect = RuntimeError("429 rate limit exceeded")
        summary = await agent.analyze_symbols_batch(
            "book-1", ["img-1", "img-2", "img-3"]
        )

        assert summary["aborted"] is True
        assert summary["progress"] == 0
        assert summary["total"] == 3
        assert agent.analyze_symbol.await_count == 1

    async def test_progress_is_reported_per_item(self):
        agent = self._agent()
        seen: list[tuple[int, int]] = []
        await agent.analyze_symbols_batch(
            "book-1",
            ["img-1", "img-2", "img-3"],
            progress_callback=lambda done, total: seen.append((done, total)),
        )

        assert seen == [(1, 3), (2, 3), (3, 3)]

    async def test_empty_list_completes_without_calling_the_llm(self):
        agent = self._agent()
        summary = await agent.analyze_symbols_batch("book-1", [])

        assert summary["total"] == 0
        assert summary["aborted"] is False
        agent.analyze_symbol.assert_not_awaited()
