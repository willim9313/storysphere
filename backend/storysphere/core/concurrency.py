"""Bounded-concurrency fan-out for LLM-backed work.

``core/gather_parts.py`` covers the other shape: a small fixed set of *named,
heterogeneous* sub-steps launched all at once, tolerating individual failures.
This module covers the opposite — one operation applied to *many homogeneous*
items, where launching all of them would flood the provider and earn a 429.

Why not plain ``asyncio.gather``: it propagates the first exception but leaves
the remaining tasks running. For LLM work that means continuing to pay for
calls whose results are already being discarded. ``asyncio.wait`` with
``FIRST_EXCEPTION`` lets us cancel them instead.

``asyncio.TaskGroup`` would do the same in one construct, but it is 3.11+ and
``pyproject.toml`` still declares ``requires-python = ">=3.10"``. It would also
wrap the failure in an ``ExceptionGroup``, which callers matching on provider
error types would have to unwrap.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


async def gather_bounded(
    items: Sequence[T],
    fn: Callable[[T], Awaitable[R]],
    *,
    limit: int,
    on_done: Callable[[int, int], None] | None = None,
) -> list[R]:
    """Apply *fn* to every item with at most *limit* calls in flight.

    Returns results in **input order**, regardless of completion order — the
    callers here feed order-sensitive downstream steps (entity linking picks a
    canonical name partly by position), so completion order must not leak out.

    Failure behaviour matches the sequential ``for`` loop this replaces: the
    first exception cancels the remaining work and propagates unchanged, so
    callers keep matching on provider error types and messages (see
    ``core.error_handling.is_rate_limit_error``).

    Args:
        items: The work items. An empty sequence does nothing and returns [].
        fn: Coroutine function applied to each item.
        limit: Maximum concurrent calls. ``1`` degrades to sequential
            execution, which is the intended rollback switch.
        on_done: Called as ``(completed, total)`` after each item finishes.
            Monotonic: *completed* only ever increases, so a progress bar fed
            from it cannot jump backwards when tasks finish out of order.

    Raises:
        ValueError: *limit* is less than 1.
    """
    if limit < 1:
        raise ValueError(f"limit must be >= 1, got {limit}")
    if not items:
        return []

    total = len(items)
    results: list[R] = [None] * total  # type: ignore[list-item]
    semaphore = asyncio.Semaphore(limit)
    completed = 0

    async def _run_one(index: int, item: T) -> None:
        nonlocal completed
        async with semaphore:
            results[index] = await fn(item)
        # Single-threaded event loop and no await between read and write, so
        # this stays a plain counter rather than needing a lock.
        completed += 1
        if on_done is not None:
            on_done(completed, total)

    tasks = [
        asyncio.ensure_future(_run_one(index, item))
        for index, item in enumerate(items)
    ]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)

    # Something failed while others were still queued or in flight — stop them
    # rather than paying for results that are about to be thrown away.
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)

    for task in done:
        if not task.cancelled() and task.exception() is not None:
            raise task.exception()

    return results
