"""Run one ingestion stage unit by unit, resumably (02 §7).

- 只跑 `status ≠ done` 的單位；每個單位做完就 commit，中斷後已完成的不必重跑。
- 429／額度用完 → 該單位退回 `pending`，丟 `QuotaPaused`（job 轉 `paused_quota`）。
- 被 provider 拒絕 → 不重試，標 `failed`。
- 其他錯誤 → 最多試 3 次，仍失敗標 `failed`，其餘單位照跑。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.units import IngestUnit
from storysphere.llm.errors import classify_step_failure, describe_exception
from storysphere.store.ingest_units import IngestUnitRow, list_units, save_output, seed_units

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3

UnitCall = Callable[[IngestUnit], Awaitable[Any]]


@dataclass(frozen=True)
class UnitStage:
    """One LLM call applied to every unit (`s1a`、`s1b`、`s4a`)."""

    name: str
    call: UnitCall
    model: str | None = None
    prompt_version: str | None = None


class QuotaPaused(Exception):
    """The provider is rate-limiting / out of quota; the job should pause, not fail."""


async def run_stage(
    session_factory: async_sessionmaker[AsyncSession],
    stage: UnitStage,
    units: Sequence[IngestUnit],
    *,
    retry_delay: float = 1.0,
) -> list[str]:
    """Run ``stage`` on every unit that is not `done`; return the ids of failed units."""
    if not units:
        return []
    book_id = units[0].book_id

    async with session_factory() as session, session.begin():
        await seed_units(session, stage.name, list(units))
        done = {
            row.unit_id
            for row in await list_units(session, book_id, stage.name)
            if row.status == "done"
        }

    failed: list[str] = []
    for unit in units:
        if unit.id in done:
            continue
        if not await _run_unit(session_factory, stage, unit, retry_delay=retry_delay):
            failed.append(unit.id)
    return failed


async def _run_unit(
    session_factory: async_sessionmaker[AsyncSession],
    stage: UnitStage,
    unit: IngestUnit,
    *,
    retry_delay: float,
) -> bool:
    key = (unit.book_id, stage.name, unit.id)
    error = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        async with session_factory() as session, session.begin():
            row = await session.get(IngestUnitRow, key)
            row.status = "running"
            row.attempts += 1
            row.model = stage.model
            row.prompt_version = stage.prompt_version
            row.error = None

        try:
            raw = await stage.call(unit)
        except Exception as exc:
            kind = classify_step_failure(exc)
            error = describe_exception(exc)
            if kind == "rate_limited":
                await _set_status(session_factory, key, "pending", error)
                raise QuotaPaused(error) from exc
            if kind == "llm_unconfigured":
                # 換單位也一樣跑不了：整個 job 停下來。
                await _set_status(session_factory, key, "pending", error)
                raise
            logger.warning("unit %s stage %s attempt %d failed: %s", unit.id, stage.name, attempt, error)
            if kind == "blocked":
                break
            if attempt < MAX_ATTEMPTS and retry_delay:
                await asyncio.sleep(retry_delay)
            continue

        async with session_factory() as session, session.begin():
            row = await session.get(IngestUnitRow, key)
            await save_output(
                session, row, raw, model=stage.model, prompt_version=stage.prompt_version
            )
            row.status = "done"
        return True

    await _set_status(session_factory, key, "failed", error)
    return False


async def _set_status(
    session_factory: async_sessionmaker[AsyncSession],
    key: tuple[str, str, str],
    status: str,
    error: str | None,
) -> None:
    async with session_factory() as session, session.begin():
        row = await session.get(IngestUnitRow, key)
        row.status = status
        row.error = error
