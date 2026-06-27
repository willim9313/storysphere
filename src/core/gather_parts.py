"""Run named sub-step coroutines, tolerating individual failures.

Single source of truth for the "gather but remember which parts failed"
pattern used by gather-based analyses (character, event, future modules).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable

logger = logging.getLogger(__name__)


async def gather_parts(
    parts: dict[str, Awaitable],
) -> tuple[dict[str, Any], list[str]]:
    """Await each part; return (succeeded results by name, failed names).

    Failures are swallowed (logged) so one bad part doesn't sink the rest.
    ``failed`` preserves ``parts`` insertion order.
    """
    names = list(parts.keys())
    outcomes = await asyncio.gather(*parts.values(), return_exceptions=True)
    results: dict[str, Any] = {}
    failed: list[str] = []
    for name, outcome in zip(names, outcomes):
        if isinstance(outcome, Exception):
            logger.warning("gather_parts: part %s failed: %s", name, outcome)
            failed.append(name)
        else:
            results[name] = outcome
    return results, failed
