"""Metrics API — exposes MetricsCollector snapshot."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from core.metrics import get_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", summary="Current metrics snapshot")
async def metrics_snapshot() -> dict[str, Any]:
    """Return a point-in-time snapshot of all collected KPIs.

    Delegates to ``MetricsCollector.get_stats()``; never raises 404.
    """
    return get_metrics().get_stats()
