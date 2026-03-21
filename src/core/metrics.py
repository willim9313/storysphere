"""MetricsCollector — lightweight stdlib-only observability layer.

Emits structured JSON-line logs to ``storysphere.metrics`` logger and
accumulates in-process counters for querying via ``get_stats()``.

Usage::

    from core.metrics import get_metrics

    metrics = get_metrics()
    metrics.record_tool_selection("get_entity_profile", source="fast_route")
    with metrics.timer("tool_execution", "get_entity_profile"):
        result = await tool.run(...)
"""

from __future__ import annotations

import collections
import contextlib
import json
import logging
import threading
import time
from collections.abc import Generator
from typing import Any

_metrics_logger = logging.getLogger("storysphere.metrics")


def _emit(event: dict[str, Any]) -> None:
    """Emit a JSON-line log entry to the metrics logger."""
    event.setdefault("ts", time.time())
    _metrics_logger.info(json.dumps(event, ensure_ascii=False))


def _percentile(sorted_values: list[float], p: float) -> float:
    """Return the p-th percentile (0-100) from a sorted list."""
    if not sorted_values:
        return 0.0
    idx = (p / 100) * (len(sorted_values) - 1)
    lo = int(idx)
    hi = lo + 1
    if hi >= len(sorted_values):
        return sorted_values[-1]
    frac = idx - lo
    return sorted_values[lo] + frac * (sorted_values[hi] - sorted_values[lo])


class MetricsCollector:
    """Thread-safe in-process metrics accumulator.

    All public ``record_*`` methods are thread-safe (single lock).
    ``get_stats()`` returns a snapshot dict with pre-computed rates and
    latency percentiles.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._reset_state()

    def _reset_state(self) -> None:
        # tool_selection: {tool_name: {"total": int, "fast_route": int, "agent_loop": int}}
        self._tool_selection: dict[str, dict[str, int]] = collections.defaultdict(
            lambda: {"total": 0, "fast_route": 0, "agent_loop": 0}
        )
        # tool_execution: {tool_name: {"total": int, "success": int, "failure": int, "latencies": [float]}}
        self._tool_execution: dict[str, dict[str, Any]] = collections.defaultdict(
            lambda: {"total": 0, "success": 0, "failure": 0, "latencies": []}
        )
        # cache_events: {cache_type: {"total": int, "hit": int, "miss": int}}
        self._cache_events: dict[str, dict[str, int]] = collections.defaultdict(
            lambda: {"total": 0, "hit": 0, "miss": 0}
        )
        # agent_query: {"total": int, "success": int, "failure": int,
        #               "latencies": [], "routes": {route: int}, "errors": {err: int}}
        self._agent_query: dict[str, Any] = {
            "total": 0,
            "success": 0,
            "failure": 0,
            "latencies": [],
            "routes": collections.defaultdict(int),
            "errors": collections.defaultdict(int),
        }
        # llm_calls: per-provider and per-service token accumulators
        self._llm_calls: dict[str, Any] = {
            "total": 0,
            "success": 0,
            "failure": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "by_provider": collections.defaultdict(
                lambda: {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            ),
            "by_service": collections.defaultdict(
                lambda: {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            ),
        }

    # ------------------------------------------------------------------
    # Public record_* methods
    # ------------------------------------------------------------------

    def record_tool_selection(
        self,
        tool_name: str,
        source: str,
        query_pattern: str | None = None,
    ) -> None:
        """Record that a tool was selected (either via fast-route or agent loop).

        Args:
            tool_name: Registered tool name (e.g. ``"get_entity_profile"``).
            source: ``"fast_route"`` or ``"agent_loop"``.
            query_pattern: Optional pattern name from QueryPatternRecognizer.
        """
        event: dict[str, Any] = {
            "event": "tool_selection",
            "tool_name": tool_name,
            "source": source,
        }
        if query_pattern is not None:
            event["query_pattern"] = query_pattern
        _emit(event)

        with self._lock:
            entry = self._tool_selection[tool_name]
            entry["total"] += 1
            if source == "fast_route":
                entry["fast_route"] += 1
            else:
                entry["agent_loop"] += 1

    def record_tool_execution(
        self,
        tool_name: str,
        success: bool,
        latency_ms: float,
        error: str | None = None,
    ) -> None:
        """Record a tool execution result.

        Args:
            tool_name: Registered tool name.
            success: Whether execution succeeded.
            latency_ms: Wall-clock milliseconds.
            error: Exception class name if failed.
        """
        event: dict[str, Any] = {
            "event": "tool_execution",
            "tool_name": tool_name,
            "success": success,
            "latency_ms": round(latency_ms, 2),
        }
        if error is not None:
            event["error"] = error
        _emit(event)

        with self._lock:
            entry = self._tool_execution[tool_name]
            entry["total"] += 1
            if success:
                entry["success"] += 1
            else:
                entry["failure"] += 1
            entry["latencies"].append(latency_ms)

    def record_cache_event(
        self,
        cache_type: str,
        hit: bool,
        cache_key: str | None = None,
    ) -> None:
        """Record a cache lookup result.

        Args:
            cache_type: Logical cache namespace (e.g. ``"character"``, ``"event"``).
            hit: True if cache hit, False if miss.
            cache_key: Optional full cache key for debugging.
        """
        event: dict[str, Any] = {
            "event": "cache_event",
            "cache_type": cache_type,
            "hit": hit,
        }
        if cache_key is not None:
            event["cache_key"] = cache_key
        _emit(event)

        with self._lock:
            entry = self._cache_events[cache_type]
            entry["total"] += 1
            if hit:
                entry["hit"] += 1
            else:
                entry["miss"] += 1

    def record_agent_query(
        self,
        success: bool,
        latency_ms: float,
        route: str,
        error: str | None = None,
    ) -> None:
        """Record a top-level chat agent query result.

        Args:
            success: Whether the query returned a valid response.
            latency_ms: End-to-end wall-clock milliseconds.
            route: ``"fast_route"`` or ``"agent_loop"``.
            error: Exception class name if failed.
        """
        event: dict[str, Any] = {
            "event": "agent_query",
            "success": success,
            "latency_ms": round(latency_ms, 2),
            "route": route,
        }
        if error is not None:
            event["error"] = error
        _emit(event)

        with self._lock:
            q = self._agent_query
            q["total"] += 1
            if success:
                q["success"] += 1
            else:
                q["failure"] += 1
            q["latencies"].append(latency_ms)
            q["routes"][route] += 1
            if error:
                q["errors"][error] += 1

    def record_llm_call(
        self,
        provider: str,
        success: bool,
        latency_ms: float,
        error: str | None = None,
        *,
        model: str = "",
        service: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
    ) -> None:
        """Record an LLM API call with token usage.

        Args:
            provider: LLM provider name (e.g. ``"gemini"``, ``"openai"``).
            success: Whether the call succeeded.
            latency_ms: Call latency in milliseconds.
            error: Exception class name if failed.
            model: Model identifier (e.g. ``"gemini-2.0-flash"``).
            service: Service that made the call (e.g. ``"summary"``).
            prompt_tokens: Number of prompt/input tokens.
            completion_tokens: Number of completion/output tokens.
            total_tokens: Total tokens consumed.
        """
        event: dict[str, Any] = {
            "event": "llm_call",
            "provider": provider,
            "model": model,
            "service": service,
            "success": success,
            "latency_ms": round(latency_ms, 2),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }
        if error is not None:
            event["error"] = error
        _emit(event)

        with self._lock:
            lc = self._llm_calls
            lc["total"] += 1
            if success:
                lc["success"] += 1
            else:
                lc["failure"] += 1
            lc["prompt_tokens"] += prompt_tokens
            lc["completion_tokens"] += completion_tokens
            lc["total_tokens"] += total_tokens

            bp = lc["by_provider"][provider]
            bp["calls"] += 1
            bp["prompt_tokens"] += prompt_tokens
            bp["completion_tokens"] += completion_tokens
            bp["total_tokens"] += total_tokens

            if service:
                bs = lc["by_service"][service]
                bs["calls"] += 1
                bs["prompt_tokens"] += prompt_tokens
                bs["completion_tokens"] += completion_tokens
                bs["total_tokens"] += total_tokens

    # ------------------------------------------------------------------
    # Stats snapshot
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        """Return a snapshot of all accumulated metrics.

        Returns a dict with pre-computed ``success_rate``, ``hit_rate``,
        and latency percentiles (P50/P95/P99) for easy comparison against
        ADR-006/007 thresholds.
        """
        with self._lock:
            stats: dict[str, Any] = {}

            # tool_selection
            ts: dict[str, Any] = {}
            for tool, cnt in self._tool_selection.items():
                ts[tool] = dict(cnt)
            stats["tool_selection"] = ts

            # tool_execution
            te: dict[str, Any] = {}
            for tool, cnt in self._tool_execution.items():
                latencies = sorted(cnt["latencies"])
                total = cnt["total"]
                te[tool] = {
                    "total": total,
                    "success": cnt["success"],
                    "failure": cnt["failure"],
                    "success_rate": cnt["success"] / total if total > 0 else 0.0,
                    "latency_p50_ms": _percentile(latencies, 50),
                    "latency_p95_ms": _percentile(latencies, 95),
                    "latency_p99_ms": _percentile(latencies, 99),
                }
            stats["tool_execution"] = te

            # cache_events
            ce: dict[str, Any] = {}
            for cache_type, cnt in self._cache_events.items():
                total = cnt["total"]
                ce[cache_type] = {
                    "total": total,
                    "hit": cnt["hit"],
                    "miss": cnt["miss"],
                    "hit_rate": cnt["hit"] / total if total > 0 else 0.0,
                }
            stats["cache_events"] = ce

            # agent_query
            q = self._agent_query
            latencies = sorted(q["latencies"])
            total = q["total"]
            stats["agent_query"] = {
                "all": {
                    "total": total,
                    "success": q["success"],
                    "failure": q["failure"],
                    "success_rate": q["success"] / total if total > 0 else 0.0,
                    "latency_p50_ms": _percentile(latencies, 50),
                    "latency_p95_ms": _percentile(latencies, 95),
                    "latency_p99_ms": _percentile(latencies, 99),
                    "routes": dict(q["routes"]),
                    "errors": dict(q["errors"]),
                }
            }

            # llm_calls
            lc = self._llm_calls
            stats["llm_calls"] = {
                "total": lc["total"],
                "success": lc["success"],
                "failure": lc["failure"],
                "prompt_tokens": lc["prompt_tokens"],
                "completion_tokens": lc["completion_tokens"],
                "total_tokens": lc["total_tokens"],
                "by_provider": {k: dict(v) for k, v in lc["by_provider"].items()},
                "by_service": {k: dict(v) for k, v in lc["by_service"].items()},
            }

        return stats

    def reset(self) -> None:
        """Reset all counters. Intended for use in tests."""
        with self._lock:
            self._reset_state()

    # ------------------------------------------------------------------
    # Timer context manager
    # ------------------------------------------------------------------

    @contextlib.contextmanager
    def timer(self, metric_family: str, label: str) -> Generator[None, None, None]:
        """Context manager that records latency for a block of code.

        Records via ``record_tool_execution`` (``metric_family="tool_execution"``)
        or ``record_agent_query`` (``metric_family="agent_query"``).
        Falls back to ``record_tool_execution`` for unknown families.

        Example::

            with metrics.timer("tool_execution", "get_entity_profile"):
                result = await tool.arun(...)
        """
        t0 = time.perf_counter()
        success = True
        error: str | None = None
        try:
            yield
        except Exception as exc:
            success = False
            error = type(exc).__name__
            raise
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000
            if metric_family == "agent_query":
                self.record_agent_query(
                    success=success,
                    latency_ms=latency_ms,
                    route=label,
                    error=error,
                )
            else:
                self.record_tool_execution(
                    tool_name=label,
                    success=success,
                    latency_ms=latency_ms,
                    error=error,
                )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_singleton: MetricsCollector | None = None
_singleton_lock = threading.Lock()


def get_metrics() -> MetricsCollector:
    """Return the process-wide MetricsCollector singleton.

    Uses double-checked locking (same pattern as ``get_settings()``).
    """
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = MetricsCollector()
    return _singleton
