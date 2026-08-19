"""Tests for TokenUsageStore (src/core/token_store.py)."""

from __future__ import annotations

import time

import pytest
from storysphere.core.token_store import TokenUsageStore


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


# ---------------------------------------------------------------------------
# Per-book aggregation and filtering
# ---------------------------------------------------------------------------


async def _seed_two_books_and_one_orphan(store) -> None:
    """book-a: 2 calls (summary, keyword) — book-b: 1 — unattributed: 1."""
    for service, book_id, total in (
        ("summary", "book-a", 100),
        ("keyword", "book-a", 50),
        ("summary", "book-b", 400),
        ("chat", None, 7),
    ):
        await store.record(
            provider="gemini",
            model="gemini-2.0-flash",
            service=service,
            prompt_tokens=total,
            completion_tokens=0,
            total_tokens=total,
            book_id=book_id,
        )


class TestByBook:
    @pytest.mark.asyncio
    async def test_groups_by_book_ordered_by_spend(self, store):
        await _seed_two_books_and_one_orphan(store)
        by_book = (await store.get_usage())["byBook"]

        assert [r["bookId"] for r in by_book] == ["book-b", "book-a", None]
        assert [r["totalTokens"] for r in by_book] == [400, 150, 7]

    @pytest.mark.asyncio
    async def test_unattributed_rows_are_their_own_group(self, store):
        """Rows with no book are a real group, not a missing value."""
        await _seed_two_books_and_one_orphan(store)
        by_book = (await store.get_usage())["byBook"]

        orphan = [r for r in by_book if r["bookId"] is None]
        assert len(orphan) == 1
        assert orphan[0]["calls"] == 1

    @pytest.mark.asyncio
    async def test_book_rows_sum_to_the_overall_total(self, store):
        await _seed_two_books_and_one_orphan(store)
        usage = await store.get_usage()

        assert sum(r["totalTokens"] for r in usage["byBook"]) == (
            usage["summary"]["totalTokens"]
        )


class TestBookFilter:
    @pytest.mark.asyncio
    async def test_filter_narrows_every_section(self, store):
        """Filtering is what makes "what did this book spend it on" answerable."""
        await _seed_two_books_and_one_orphan(store)
        usage = await store.get_usage(book_id="book-a")

        assert usage["summary"]["totalTokens"] == 150
        assert set(usage["byService"]) == {"summary", "keyword"}
        assert [r["bookId"] for r in usage["byBook"]] == ["book-a"]

    @pytest.mark.asyncio
    async def test_filtered_summary_matches_the_unfiltered_book_row(self, store):
        await _seed_two_books_and_one_orphan(store)
        row = next(
            r for r in (await store.get_usage())["byBook"] if r["bookId"] == "book-b"
        )
        filtered = (await store.get_usage(book_id="book-b"))["summary"]

        assert filtered["totalTokens"] == row["totalTokens"]
        assert filtered["totalCalls"] == row["calls"]

    @pytest.mark.asyncio
    async def test_unattributed_sentinel_selects_the_null_rows(self, store):
        from storysphere.core.token_store import UNATTRIBUTED

        await _seed_two_books_and_one_orphan(store)
        usage = await store.get_usage(book_id=UNATTRIBUTED)

        assert usage["summary"]["totalTokens"] == 7
        assert set(usage["byService"]) == {"chat"}

    @pytest.mark.asyncio
    async def test_daily_usage_respects_the_filter(self, store):
        await _seed_two_books_and_one_orphan(store)
        daily = await store.get_daily_usage(book_id="book-a")

        assert len(daily) == 1
        assert daily[0]["totalTokens"] == 150

    @pytest.mark.asyncio
    async def test_unknown_book_yields_empty_aggregates(self, store):
        await _seed_two_books_and_one_orphan(store)
        usage = await store.get_usage(book_id="no-such-book")

        assert usage["summary"]["totalCalls"] == 0
        assert usage["byBook"] == []
