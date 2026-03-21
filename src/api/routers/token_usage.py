"""Token Usage API — exposes LLM token consumption statistics."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from api.deps import get_token_store

router = APIRouter(prefix="/token-usage", tags=["token-usage"])


@router.get("", summary="Token usage statistics")
async def get_token_usage(
    store=Depends(get_token_store),
    range: str = Query(  # noqa: A002
        default="7d",
        description="Time range: today | 7d | 30d | all",
        pattern=r"^(today|7d|30d|all)$",
    ),
) -> dict[str, Any]:
    """Return aggregated token usage with daily breakdown.

    Query params:
        range: ``today`` | ``7d`` | ``30d`` | ``all``
    """
    from core.token_store import TokenUsageStore  # noqa: PLC0415

    since, until = TokenUsageStore.range_to_timestamps(range)
    usage = await store.get_usage(since=since, until=until)
    daily = await store.get_daily_usage(since=since, until=until)
    return {**usage, "daily": daily}
