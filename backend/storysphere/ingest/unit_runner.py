"""Run one ingestion stage unit by unit, resumably (02 §7).

- 只跑 `status ≠ done` 的單位；每個單位做完就 commit，中斷後已完成的不必重跑。
- 429／額度用完 → 該單位退回 `pending`，丟 `QuotaPaused`（job 轉 `paused_quota`）。
- 被 provider 拒絕 → 不重試，標 `failed`。
- 其他錯誤 → 最多試 3 次，仍失敗標 `failed`，其餘單位照跑。
- 被取消（同時跑的別的 stage 遇到 429）→ 該單位退回 `pending` 再往外丟。
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
    concurrency: int = 1,
) -> list[str]:
    """Run ``stage`` on every unit that is not `done`; return the ids of failed units.

    ``concurrency`` > 1 時同一 stage 內同時跑多個單位。任一單位遇 429（或 llm 未設定）
    → 其餘進行中的單位被取消並退回 `pending`，錯誤往外丟；失敗單位 id 依單位順序回傳。
    """
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

    todo = [unit for unit in units if unit.id not in done]
    if concurrency <= 1:
        failed: list[str] = []
        for unit in todo:
            if not await _run_unit(session_factory, stage, unit, retry_delay=retry_delay):
                failed.append(unit.id)
        return failed

    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(unit: IngestUnit) -> bool:
        async with semaphore:
            return await _run_unit(session_factory, stage, unit, retry_delay=retry_delay)

    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(guarded(unit)) for unit in todo]
    except BaseExceptionGroup as group_exc:
        errors = list(group_exc.exceptions)
        raise next((e for e in errors if isinstance(e, QuotaPaused)), errors[0]) from None
    return [unit.id for unit, task in zip(todo, tasks, strict=True) if not task.result()]


async def _run_unit(
    session_factory: async_sessionmaker[AsyncSession],
    stage: UnitStage,
    unit: IngestUnit,
    *,
    retry_delay: float,
) -> bool:
    try:
        return await _attempt_unit(session_factory, stage, unit, retry_delay=retry_delay)
    except asyncio.CancelledError:
        # 同時跑的另一個 stage 遇到 429 而把這個 stage 取消：單位退回 pending，不要卡在
        # running（取消可能落在呼叫中，也可能落在寫回中）。shield 讓這次寫回不被取消打斷。
        key = (unit.book_id, stage.name, unit.id)
        await asyncio.shield(_release_running(session_factory, key))
        raise


async def _attempt_unit(
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


async def _release_running(
    session_factory: async_sessionmaker[AsyncSession], key: tuple[str, str, str]
) -> None:
    """`running` → `pending`；已經 `done`／`failed` 的不動。"""
    async with session_factory() as session, session.begin():
        row = await session.get(IngestUnitRow, key)
        if row.status == "running":
            row.status = "pending"
