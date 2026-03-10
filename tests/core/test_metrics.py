"""Tests for MetricsCollector (src/core/metrics.py).

Uses direct instantiation (MetricsCollector()) rather than the singleton
to ensure test isolation.
"""

from __future__ import annotations

import pytest

from core.metrics import MetricsCollector, get_metrics


# ---------------------------------------------------------------------------
# TestMetricsCollectorBasic
# ---------------------------------------------------------------------------


class TestMetricsCollectorBasic:
    def test_initial_stats_empty(self):
        m = MetricsCollector()
        stats = m.get_stats()
        assert stats["tool_selection"] == {}
        assert stats["tool_execution"] == {}
        assert stats["cache_events"] == {}
        assert stats["agent_query"]["all"]["total"] == 0

    def test_singleton(self):
        a = get_metrics()
        b = get_metrics()
        assert a is b

    def test_reset(self):
        m = MetricsCollector()
        m.record_tool_selection("my_tool", source="fast_route")
        m.reset()
        stats = m.get_stats()
        assert stats["tool_selection"] == {}


# ---------------------------------------------------------------------------
# TestRecordToolSelection
# ---------------------------------------------------------------------------


class TestRecordToolSelection:
    def test_increments_counters(self):
        m = MetricsCollector()
        m.record_tool_selection("get_entity_profile", source="fast_route")
        m.record_tool_selection("get_entity_profile", source="fast_route")
        stats = m.get_stats()
        entry = stats["tool_selection"]["get_entity_profile"]
        assert entry["total"] == 2
        assert entry["fast_route"] == 2
        assert entry["agent_loop"] == 0

    def test_tracks_source(self):
        m = MetricsCollector()
        m.record_tool_selection("get_entity_profile", source="fast_route")
        m.record_tool_selection("get_entity_profile", source="agent_loop")
        m.record_tool_selection("get_entity_profile", source="agent_loop")
        stats = m.get_stats()
        entry = stats["tool_selection"]["get_entity_profile"]
        assert entry["total"] == 3
        assert entry["fast_route"] == 1
        assert entry["agent_loop"] == 2


# ---------------------------------------------------------------------------
# TestRecordToolExecution
# ---------------------------------------------------------------------------


class TestRecordToolExecution:
    def test_success(self):
        m = MetricsCollector()
        m.record_tool_execution("my_tool", success=True, latency_ms=100.0)
        stats = m.get_stats()
        entry = stats["tool_execution"]["my_tool"]
        assert entry["total"] == 1
        assert entry["success"] == 1
        assert entry["failure"] == 0
        assert entry["success_rate"] == 1.0

    def test_failure(self):
        m = MetricsCollector()
        m.record_tool_execution("my_tool", success=False, latency_ms=50.0, error="ValueError")
        stats = m.get_stats()
        entry = stats["tool_execution"]["my_tool"]
        assert entry["total"] == 1
        assert entry["failure"] == 1
        assert entry["success_rate"] == 0.0

    def test_latency_percentiles(self):
        m = MetricsCollector()
        for latency in [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0]:
            m.record_tool_execution("my_tool", success=True, latency_ms=latency)
        stats = m.get_stats()
        entry = stats["tool_execution"]["my_tool"]
        assert entry["latency_p50_ms"] == pytest.approx(550.0, abs=1.0)
        assert entry["latency_p95_ms"] == pytest.approx(955.0, abs=1.0)
        assert entry["latency_p99_ms"] == pytest.approx(991.0, abs=1.0)


# ---------------------------------------------------------------------------
# TestRecordCacheEvent
# ---------------------------------------------------------------------------


class TestRecordCacheEvent:
    def test_hit_counter(self):
        m = MetricsCollector()
        m.record_cache_event("character", hit=True, cache_key="character:doc-1:alice")
        m.record_cache_event("character", hit=True)
        stats = m.get_stats()
        entry = stats["cache_events"]["character"]
        assert entry["hit"] == 2
        assert entry["miss"] == 0
        assert entry["total"] == 2
        assert entry["hit_rate"] == 1.0

    def test_miss_counter(self):
        m = MetricsCollector()
        m.record_cache_event("character", hit=False)
        stats = m.get_stats()
        entry = stats["cache_events"]["character"]
        assert entry["miss"] == 1
        assert entry["hit"] == 0
        assert entry["hit_rate"] == 0.0


# ---------------------------------------------------------------------------
# TestRecordAgentQuery
# ---------------------------------------------------------------------------


class TestRecordAgentQuery:
    def test_success_with_route_breakdown(self):
        m = MetricsCollector()
        m.record_agent_query(success=True, latency_ms=500.0, route="fast_route")
        m.record_agent_query(success=True, latency_ms=1800.0, route="agent_loop")
        stats = m.get_stats()
        entry = stats["agent_query"]["all"]
        assert entry["total"] == 2
        assert entry["success"] == 2
        assert entry["routes"]["fast_route"] == 1
        assert entry["routes"]["agent_loop"] == 1

    def test_failure_records_error(self):
        m = MetricsCollector()
        m.record_agent_query(success=False, latency_ms=100.0, route="agent_loop", error="RuntimeError")
        stats = m.get_stats()
        entry = stats["agent_query"]["all"]
        assert entry["failure"] == 1
        assert entry["errors"]["RuntimeError"] == 1
        assert entry["success_rate"] == 0.0


# ---------------------------------------------------------------------------
# TestGetStats
# ---------------------------------------------------------------------------


class TestGetStats:
    def test_success_rate(self):
        m = MetricsCollector()
        m.record_tool_execution("tool_a", success=True, latency_ms=100.0)
        m.record_tool_execution("tool_a", success=True, latency_ms=200.0)
        m.record_tool_execution("tool_a", success=False, latency_ms=50.0)
        stats = m.get_stats()
        rate = stats["tool_execution"]["tool_a"]["success_rate"]
        assert rate == pytest.approx(2 / 3, abs=0.001)

    def test_cache_hit_rate(self):
        m = MetricsCollector()
        for _ in range(3):
            m.record_cache_event("event", hit=True)
        for _ in range(1):
            m.record_cache_event("event", hit=False)
        stats = m.get_stats()
        rate = stats["cache_events"]["event"]["hit_rate"]
        assert rate == pytest.approx(0.75, abs=0.001)


# ---------------------------------------------------------------------------
# TestTimerContextManager
# ---------------------------------------------------------------------------


class TestTimerContextManager:
    def test_records_latency(self):
        m = MetricsCollector()
        with m.timer("tool_execution", "my_tool"):
            pass  # instant
        stats = m.get_stats()
        entry = stats["tool_execution"]["my_tool"]
        assert entry["total"] == 1
        assert entry["success"] == 1
        assert entry["latency_p50_ms"] >= 0.0

    def test_records_even_on_exception(self):
        m = MetricsCollector()
        with pytest.raises(ValueError):
            with m.timer("tool_execution", "failing_tool"):
                raise ValueError("boom")
        stats = m.get_stats()
        entry = stats["tool_execution"]["failing_tool"]
        assert entry["total"] == 1
        assert entry["failure"] == 1
        assert entry["success"] == 0
