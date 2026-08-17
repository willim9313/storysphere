"""Tests for ``core.concurrency.gather_bounded``.

The properties that matter to callers, in order of how badly a regression
would hurt:

1. results come back in input order (downstream entity linking depends on it)
2. no more than *limit* calls are ever in flight (the whole point)
3. the original exception propagates, not an ExceptionGroup
4. a failure cancels the siblings rather than leaving them running
"""

from __future__ import annotations

import asyncio

import pytest
from storysphere.core.concurrency import gather_bounded


async def _identity(x):
    return x


class TestOrdering:
    @pytest.mark.asyncio
    async def test_results_follow_input_order_not_completion_order(self):
        """Earlier items sleep longer, so completion order is reversed."""

        async def _slow_for_early_items(n: int) -> int:
            await asyncio.sleep((10 - n) / 1000)
            return n

        result = await gather_bounded(list(range(10)), _slow_for_early_items, limit=10)

        assert result == list(range(10))

    @pytest.mark.asyncio
    async def test_every_item_is_processed_once(self):
        seen: list[int] = []

        async def _record(n: int) -> int:
            seen.append(n)
            return n * 2

        result = await gather_bounded([1, 2, 3, 4, 5], _record, limit=2)

        assert sorted(seen) == [1, 2, 3, 4, 5]
        assert result == [2, 4, 6, 8, 10]

    @pytest.mark.asyncio
    async def test_empty_input_returns_empty_list(self):
        called = False

        async def _never(_):
            nonlocal called
            called = True

        assert await gather_bounded([], _never, limit=4) == []
        assert not called


class TestConcurrencyLimit:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("limit", [1, 2, 3, 5])
    async def test_never_exceeds_limit_in_flight(self, limit):
        in_flight = 0
        peak = 0

        async def _track(_):
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.001)
            in_flight -= 1

        await gather_bounded(list(range(20)), _track, limit=limit)

        assert peak <= limit

    @pytest.mark.asyncio
    async def test_limit_one_is_fully_sequential(self):
        """The documented rollback switch: limit=1 must serialise."""
        in_flight = 0
        peak = 0

        async def _track(_):
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.001)
            in_flight -= 1

        await gather_bounded(list(range(10)), _track, limit=1)

        assert peak == 1

    @pytest.mark.asyncio
    async def test_limit_larger_than_items_is_harmless(self):
        result = await gather_bounded([1, 2], _identity, limit=100)
        assert result == [1, 2]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("bad_limit", [0, -1])
    async def test_limit_below_one_is_rejected(self, bad_limit):
        with pytest.raises(ValueError, match="limit must be >= 1"):
            await gather_bounded([1], _identity, limit=bad_limit)


class TestFailure:
    @pytest.mark.asyncio
    async def test_original_exception_propagates_unwrapped(self):
        """run_step records str(exc); any wrapper type would change it."""

        class ProviderRateLimit(Exception):
            pass

        async def _boom(n: int):
            if n == 3:
                raise ProviderRateLimit("429 rate limit exceeded")
            await asyncio.sleep(0.001)
            return n

        with pytest.raises(ProviderRateLimit) as excinfo:
            await gather_bounded(list(range(10)), _boom, limit=3)

        assert type(excinfo.value) is ProviderRateLimit
        assert str(excinfo.value) == "429 rate limit exceeded"

    @pytest.mark.asyncio
    async def test_rate_limit_errors_stay_recognisable(self):
        """The unwrapped exception must still satisfy is_rate_limit_error."""
        from storysphere.core.error_handling import is_rate_limit_error

        class RateLimitError(Exception):
            pass

        async def _boom(_):
            raise RateLimitError("quota exhausted")

        with pytest.raises(RateLimitError) as excinfo:
            await gather_bounded([1, 2], _boom, limit=2)

        assert is_rate_limit_error(excinfo.value)

    @pytest.mark.asyncio
    async def test_failure_cancels_pending_siblings(self):
        """asyncio.gather would let these run on; TaskGroup must not."""
        finished: list[int] = []

        async def _slow_then_fail(n: int):
            if n == 0:
                await asyncio.sleep(0.01)
                raise RuntimeError("first task fails")
            await asyncio.sleep(0.5)  # long enough that cancellation is visible
            finished.append(n)

        with pytest.raises(RuntimeError, match="first task fails"):
            await gather_bounded(list(range(6)), _slow_then_fail, limit=6)

        assert finished == []

    @pytest.mark.asyncio
    async def test_first_error_wins_when_several_fail(self):
        async def _boom(n: int):
            raise ValueError(f"item {n}")

        with pytest.raises(ValueError):
            await gather_bounded([1, 2, 3], _boom, limit=3)


class TestProgress:
    @pytest.mark.asyncio
    async def test_reports_each_completion_up_to_total(self):
        seen: list[tuple[int, int]] = []

        await gather_bounded(
            list(range(5)), _identity, limit=2, on_done=lambda d, t: seen.append((d, t))
        )

        assert len(seen) == 5
        assert seen[-1] == (5, 5)
        assert all(total == 5 for _, total in seen)

    @pytest.mark.asyncio
    async def test_progress_is_monotonic_under_out_of_order_completion(self):
        """Concurrent tasks share one counter — it must never go backwards."""
        seen: list[int] = []

        async def _jittery(n: int):
            await asyncio.sleep((n % 3) / 1000)
            return n

        await gather_bounded(
            list(range(30)), _jittery, limit=8, on_done=lambda d, _t: seen.append(d)
        )

        assert seen == sorted(seen)
        assert seen == list(range(1, 31))

    @pytest.mark.asyncio
    async def test_no_callback_is_fine(self):
        assert await gather_bounded([1, 2, 3], _identity, limit=2) == [1, 2, 3]
