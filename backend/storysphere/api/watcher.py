"""Turn database state changes into SSE events (docs/spec/04 §3.5).

原型決定（04 §3.4）：入庫圖、單位執行、方法引擎都把狀態寫進資料庫，這裡每 ``interval`` 秒
比對一次非終態 job 的狀態、它的單位與 run，有變就丟進 `EventBus`。事件最多晚一個間隔；
一個間隔內發生又結束的中間狀態看不到（單位只報 done／failed，不受影響）。

同時寫回 `jobs.progress`（入庫圖在單位階段不更新它）與 `jobs.last_seq`。
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.api.events import EventBus
from storysphere.api.schemas.common import camelize
from storysphere.registry.loader import Registry
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.tables import Evidence, Job, Run

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = ("done", "error", "cancelled")
INGEST_KINDS = ("ingest", "ingest_retry", "ingest_rerun", "genre_s4")
PREVIEW_ITEMS = 5

# 入庫各步驟佔的進度區間（%）；s1、s4 依單位完成比例在區間內推進。
_STEP_RANGE = {
    "p1": (0, 5),
    "review": (5, 5),
    "s1": (5, 70),
    "s2": (70, 75),
    "s3": (75, 80),
    "s4": (80, 95),
    "s5": (95, 99),
}
_UNIT_STAGES_OF_STEP = {"s1": ("s1a", "s1b"), "s4": ("s4a",)}


@dataclass
class _JobSnap:
    status: str
    progress: int
    stage: str | None
    error_kind: str | None
    units: dict[tuple[str, str], str] = field(default_factory=dict)
    runs: dict[str, str] = field(default_factory=dict)


def ingest_progress(stage: str | None, units: list[IngestUnitRow]) -> int | None:
    """Progress of a running ingest job at ``stage``; None when the stage is unknown."""
    if stage not in _STEP_RANGE:
        return None
    low, high = _STEP_RANGE[stage]
    unit_stages = _UNIT_STAGES_OF_STEP.get(stage)
    if not unit_stages:
        return low
    rows = [row for row in units if row.stage in unit_stages]
    if not rows:
        return low
    finished = sum(1 for row in rows if row.status in ("done", "failed"))
    return low + (high - low) * finished // len(rows)


class JobWatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        bus: EventBus,
        registry: Registry,
        *,
        interval: float = 0.5,
    ) -> None:
        self._sf = session_factory
        self._bus = bus
        self._registry = registry
        self.interval = interval
        self._snaps: dict[str, _JobSnap] = {}

    async def run_forever(self) -> None:
        while True:
            try:
                await self.poll_once()
            except Exception:  # 監看失敗不能讓整個 app 掛掉；下一輪再試
                logger.exception("job watcher poll failed")
            await asyncio.sleep(self.interval)

    async def poll_once(self) -> None:
        writes: dict[str, dict[str, int]] = {}
        async with self._sf() as session:
            jobs = list(
                await session.scalars(
                    select(Job).where(
                        or_(Job.status.not_in(TERMINAL_STATUSES), Job.id.in_(list(self._snaps)))
                    )
                )
            )
            for job in jobs:
                values = await self._check(session, job)
                if values:
                    writes[job.id] = values
        if writes:
            async with self._sf() as session, session.begin():
                for job_id, values in writes.items():
                    await session.execute(update(Job).where(Job.id == job_id).values(**values))

    # ── 一個 job ──────────────────────────────────────────────

    async def _check(self, session: AsyncSession, job: Job) -> dict[str, int]:
        """Emit the events of one job; return the columns to write back."""
        is_ingest = job.kind in INGEST_KINDS and job.book_id is not None
        units = (
            list(await session.scalars(select(IngestUnitRow).where(IngestUnitRow.book_id == job.book_id)))
            if is_ingest
            else []
        )
        runs = list(await session.scalars(select(Run).where(Run.job_id == job.id)))
        terminal = job.status in TERMINAL_STATUSES

        progress = job.progress
        if is_ingest and not terminal:
            computed = ingest_progress(job.stage, units)
            if computed is not None and computed > progress:
                progress = computed

        last_seq = job.last_seq
        snap = self._snaps.get(job.id)

        def emit(event_type: str, data: dict[str, Any]) -> None:
            nonlocal last_seq
            seq = self._bus.publish(
                event_type, data, job_id=job.id, book_id=job.book_id, job_last_seq=job.last_seq
            )
            last_seq = seq or last_seq

        if snap is None:
            # 第一次看到：單位與 run 當成基準，不補發（重啟後不要把 35 個單位重報一次）。
            snap = _JobSnap(
                status=job.status,
                progress=progress,
                stage=job.stage,
                error_kind=job.error_kind,
                units={(u.stage, u.unit_id): u.status for u in units},
                runs={r.id: r.status for r in runs},
            )
            self._snaps[job.id] = snap
            emit("job.status", self._job_status(job, progress))
        else:
            if is_ingest:
                for event in self._step_events(job, snap):
                    emit("ingest.step", event)
                for unit in units:
                    key = (unit.stage, unit.unit_id)
                    before = snap.units.get(key)
                    snap.units[key] = unit.status
                    if unit.status in ("done", "failed") and before != unit.status:
                        emit("ingest.unit", await self._unit_event(session, job, unit))
            for run in runs:
                before = snap.runs.get(run.id)
                snap.runs[run.id] = run.status
                if before != run.status:
                    emit("run.status", await self._run_event(session, job, run))
            current = (job.status, progress, job.stage, job.error_kind)
            if current != (snap.status, snap.progress, snap.stage, snap.error_kind):
                emit("job.status", self._job_status(job, progress))
            snap.status, snap.progress, snap.stage, snap.error_kind = current

        if terminal:
            self._snaps.pop(job.id, None)
        values: dict[str, int] = {}
        if progress != job.progress:
            values["progress"] = progress
        if last_seq != job.last_seq:
            values["last_seq"] = last_seq
        return values

    def _step_events(self, job: Job, snap: _JobSnap) -> list[dict[str, Any]]:
        base = {"jobId": job.id, "bookId": job.book_id}
        events: list[dict[str, Any]] = []
        if job.stage != snap.stage:
            if snap.stage is not None:
                events.append({**base, "step": snap.stage, "state": "done"})
            if job.stage is not None and job.status not in TERMINAL_STATUSES:
                events.append({**base, "step": job.stage, "state": "running"})
        if job.status != snap.status and job.stage is not None:
            if job.status == "done":
                events.append({**base, "step": job.stage, "state": "done"})
            elif job.status == "error":
                events.append({**base, "step": job.stage, "state": "failed"})
        return events

    @staticmethod
    def _job_status(job: Job, progress: int) -> dict[str, Any]:
        return {
            "jobId": job.id,
            "kind": job.kind,
            "status": job.status,
            "progress": progress,
            "stage": job.stage,
            "errorKind": job.error_kind,
        }

    @staticmethod
    async def _unit_event(session: AsyncSession, job: Job, unit: IngestUnitRow) -> dict[str, Any]:
        preview: dict[str, list[str]] = {"characters": [], "events": []}
        if unit.status == "done":
            raw = await session.scalar(
                select(IngestUnitOutputRow.raw_json).where(
                    IngestUnitOutputRow.book_id == unit.book_id,
                    IngestUnitOutputRow.stage == unit.stage,
                    IngestUnitOutputRow.unit_id == unit.unit_id,
                )
            )
            if isinstance(raw, dict):
                preview["characters"] = _names(raw.get("characters"), "name")
                preview["events"] = _names(raw.get("events"), "title")
        return {
            "jobId": job.id,
            "bookId": job.book_id,
            "stage": unit.stage,
            "unitId": unit.unit_id,
            "chapter": unit.chapter,
            "status": unit.status,
            "attempts": unit.attempts,
            "preview": preview,
            "error": unit.error,
        }

    async def _run_event(self, session: AsyncSession, job: Job, run: Run) -> dict[str, Any]:
        decl = self._registry.methods.get(run.ref_id) or self._registry.methodologies.get(
            run.ref_id
        )
        count = await session.scalar(
            select(func.count())
            .select_from(Evidence)
            .where(Evidence.run_id == run.id, Evidence.status == "current")
        )
        return {
            "jobId": job.id,
            "bookId": run.book_id,
            "runId": run.id,
            "refId": run.ref_id,
            "code": decl.code if decl else None,
            "status": run.status,
            "evidenceCount": count or 0,
            "precheck": camelize(run.precheck_json),
        }


def _names(items: Any, key: str) -> list[str]:
    """抽取結果的預覽：前幾個名稱；LLM 輸出形狀不對時就是空的。"""
    if not isinstance(items, list):
        return []
    names = [item[key] for item in items if isinstance(item, dict) and isinstance(item.get(key), str)]
    return names[:PREVIEW_ITEMS]
