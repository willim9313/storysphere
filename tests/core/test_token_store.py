"""Tests for TokenUsageStore (src/core/token_store.py)."""

from __future__ import annotations

import time

import pytest

from core.token_store import TokenUsageStore


@pytest.fixture
async def store(tmp_path):
    """Fresh store using a temp DB file."""
    return TokenUsageStore(db_path=str(tmp_path / "test_tokens.db"))


@pytest.mark.asyncio
async def test_record_and_get_usage(store):
    await store.record(
        provider="gemini",
        model="gemini-2.0-flash",
        service="summary",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        latency_ms=200.5,
        success=True,
    )
    usage = await store.get_usage()
    assert usage["summary"]["totalPromptTokens"] == 100
    assert usage["summary"]["totalCompletionTokens"] == 50
    assert usage["summary"]["totalTokens"] == 150
    assert usage["summary"]["totalCalls"] == 1
    assert "summary" in usage["byService"]
    assert "gemini-2.0-flash" in usage["byModel"]


@pytest.mark.asyncio
async def test_multiple_records_aggregate(store):
    for _ in range(3):
        await store.record(
            provider="openai",
            model="gpt-4o-mini",
            service="chat",
            prompt_tokens=200,
            completion_tokens=100,
            total_tokens=300,
        )
    usage = await store.get_usage()
    assert usage["summary"]["totalCalls"] == 3
    assert usage["summary"]["totalTokens"] == 900
    assert usage["byService"]["chat"]["calls"] == 3


@pytest.mark.asyncio
async def test_get_usage_with_time_filter(store):
    # Record one in the past (well before "since")
    await store.record(
        provider="gemini",
        model="gemini-2.0-flash",
        service="extraction",
        prompt_tokens=50,
        completion_tokens=25,
        total_tokens=75,
    )
    usage_all = await store.get_usage()
    assert usage_all["summary"]["totalCalls"] == 1

    # Filter to future — should find nothing
    future = time.time() + 86400
    usage_filtered = await store.get_usage(since=future)
    assert usage_filtered["summary"]["totalCalls"] == 0


@pytest.mark.asyncio
async def test_get_daily_usage(store):
    await store.record(
        provider="gemini",
        model="gemini-2.0-flash",
        service="analysis",
        prompt_tokens=500,
        completion_tokens=200,
        total_tokens=700,
    )
    daily = await store.get_daily_usage()
    assert len(daily) == 1
    assert daily[0]["totalTokens"] == 700
    assert daily[0]["date"]  # should be a date string


@pytest.mark.asyncio
async def test_empty_database_returns_zeros(store):
    usage = await store.get_usage()
    assert usage["summary"]["totalCalls"] == 0
    assert usage["summary"]["totalTokens"] == 0
    assert usage["byService"] == {}
    assert usage["byModel"] == {}


@pytest.mark.asyncio
async def test_empty_database_daily(store):
    daily = await store.get_daily_usage()
    assert daily == []


@pytest.mark.asyncio
async def test_record_failure(store):
    await store.record(
        provider="anthropic",
        model="claude-3-5-haiku-latest",
        service="analysis",
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        success=False,
        error="RateLimitError",
    )
    usage = await store.get_usage()
    assert usage["summary"]["totalCalls"] == 1


@pytest.mark.asyncio
async def test_range_to_timestamps():
    since, until = TokenUsageStore.range_to_timestamps("all")
    assert since is None and until is None

    since, until = TokenUsageStore.range_to_timestamps("today")
    assert since is not None and until is None

    since, until = TokenUsageStore.range_to_timestamps("7d")
    assert since is not None
    assert time.time() - since < 7.1 * 86400

    since, until = TokenUsageStore.range_to_timestamps("30d")
    assert since is not None
    assert time.time() - since < 30.1 * 86400
