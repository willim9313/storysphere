"""Tests for AnalysisAgent.analyze_event() cache behaviour."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.analysis_agent import AnalysisAgent
from services.analysis_models import (
    CausalityAnalysis,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventImportance,
    EventSummary,
    ImpactAnalysis,
)


def _make_event_result(event_id: str = "evt-1") -> EventAnalysisResult:
    return EventAnalysisResult(
        event_id=event_id,
        title="The Great Battle",
        document_id="doc-1",
        eep=EventEvidenceProfile(
            state_before="Peace",
            state_after="War",
            event_importance=EventImportance.KERNEL,
        ),
        causality=CausalityAnalysis(root_cause="Old feud", chain_summary="Feud led to war."),
        impact=ImpactAnalysis(impact_summary="Alliance shattered."),
        summary=EventSummary(summary="The battle changed everything."),
        coverage=EventCoverageMetrics(),
        analyzed_at=datetime.now(timezone.utc),
    )


# ── Test 7: Cache hit — LLM not called ────────────────────────────────────────


class TestAnalyzeEventCacheHit:
    @pytest.mark.asyncio
    async def test_cache_hit_skips_service(self):
        cached_result = _make_event_result()
        serialized = cached_result.model_dump(mode="json")

        cache = AsyncMock()
        cache.get = AsyncMock(return_value=serialized)
        cache.set = AsyncMock()

        service = AsyncMock()
        service.analyze_event = AsyncMock()

        agent = AnalysisAgent(analysis_service=service, cache=cache)
        result = await agent.analyze_event("evt-1", "doc-1")

        assert isinstance(result, EventAnalysisResult)
        assert result.event_id == "evt-1"
        service.analyze_event.assert_not_awaited()
        cache.set.assert_not_awaited()


# ── Test 8: Cache miss — LLM called, result stored ───────────────────────────


class TestAnalyzeEventCacheMiss:
    @pytest.mark.asyncio
    async def test_cache_miss_calls_service_and_stores(self):
        expected = _make_event_result()

        cache = AsyncMock()
        cache.get = AsyncMock(return_value=None)
        cache.set = AsyncMock()

        service = AsyncMock()
        service.analyze_event = AsyncMock(return_value=expected)

        agent = AnalysisAgent(analysis_service=service, cache=cache)
        result = await agent.analyze_event("evt-1", "doc-1")

        assert isinstance(result, EventAnalysisResult)
        assert result.event_id == "evt-1"
        service.analyze_event.assert_awaited_once_with(event_id="evt-1", document_id="doc-1")
        cache.set.assert_awaited_once()
        # Verify cache key format
        cache_key = cache.set.call_args[0][0]
        assert cache_key == "event:doc-1:evt-1"


# ── Test 9: force_refresh bypasses cache ─────────────────────────────────────


class TestAnalyzeEventForceRefresh:
    @pytest.mark.asyncio
    async def test_force_refresh_bypasses_cache(self):
        expected = _make_event_result()

        cache = AsyncMock()
        cache.get = AsyncMock()
        cache.set = AsyncMock()

        service = AsyncMock()
        service.analyze_event = AsyncMock(return_value=expected)

        agent = AnalysisAgent(analysis_service=service, cache=cache)
        result = await agent.analyze_event("evt-1", "doc-1", force_refresh=True)

        assert isinstance(result, EventAnalysisResult)
        # Cache.get must NOT be called when force_refresh=True
        cache.get.assert_not_awaited()
        service.analyze_event.assert_awaited_once()
        cache.set.assert_awaited_once()
