"""`_llm.gather_limited`：順序、上限、並行、失敗時取消其餘、rate limit 優先。"""

from __future__ import annotations

import asyncio

import pytest
from storysphere.methods.universal._llm import LLM_CONCURRENCY, gather_limited


class TestGatherLimited:
    async def test_default_limit_constant(self):
        assert LLM_CONCURRENCY == 6

    async def test_empty_input_returns_empty_list(self):
        assert await gather_limited([], 3) == []

    async def test_results_keep_input_order_even_when_later_ones_finish_first(self):
        gates = [asyncio.Event() for _ in range(3)]

        def make(i: int):
            async def call():
                await gates[i].wait()
                if i > 0:
                    gates[i - 1].set()  # 後面的先完成，再放行前一個
                return i

            return call

        gates[2].set()
        assert await gather_limited([make(0), make(1), make(2)], 3) == [0, 1, 2]

    async def test_runs_in_parallel_up_to_the_limit_and_no_further(self):
        limit, total = 3, 8
        active = max_active = 0
        reached = asyncio.Event()
        release = asyncio.Event()

        async def call():
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            if active == limit:
                reached.set()
            await release.wait()
            active -= 1

        task = asyncio.ensure_future(gather_limited([call] * total, limit))
        await reached.wait()  # 只有真的並行才會走到這裡
        assert active == limit
        release.set()
        await task
        assert max_active == limit

    async def test_limit_one_is_sequential(self):
        active = max_active = 0

        async def call():
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0)
            active -= 1

        await gather_limited([call] * 4, 1)
        assert max_active == 1

    async def test_a_failure_cancels_the_rest_waits_for_them_and_reraises(self):
        started = asyncio.Event()
        cleaned: list[str] = []

        async def slow():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cleaned.append("slow")

        async def boom():
            await started.wait()
            raise ValueError("boom")

        queued_ran = False

        async def queued():
            nonlocal queued_ran
            queued_ran = True

        with pytest.raises(ValueError, match="boom"):
            await gather_limited([slow, boom, queued], 2)
        assert cleaned == ["slow"]  # 例外往外丟之前，被取消的已經收尾
        assert not queued_ran  # 還在排隊的不會再開始

    async def test_rate_limit_error_wins_over_an_ordinary_one(self):
        both_ready = asyncio.Event()
        arrived = 0

        def make(exc: Exception):
            async def call():
                nonlocal arrived
                arrived += 1
                if arrived == 2:
                    both_ready.set()
                await both_ready.wait()  # 兩個同時失敗
                raise exc

            return call

        ordinary, limited = ValueError("bad"), RuntimeError("Error code: 429 - quota exceeded")
        with pytest.raises(RuntimeError, match="429"):
            await gather_limited([make(ordinary), make(limited)], 2)

    async def test_without_rate_limit_the_first_error_is_raised(self):
        both_ready = asyncio.Event()
        arrived = 0

        def make(exc: Exception):
            async def call():
                nonlocal arrived
                arrived += 1
                if arrived == 2:
                    both_ready.set()
                await both_ready.wait()
                raise exc

            return call

        with pytest.raises(ValueError, match="first"):
            await gather_limited([make(ValueError("first")), make(KeyError("second"))], 2)

    async def test_never_leaks_an_exception_group(self):
        async def boom():
            raise ValueError("x")

        with pytest.raises(ValueError):
            await gather_limited([boom, boom], 2)
