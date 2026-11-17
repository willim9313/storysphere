"""N-04a 觸發的判斷流程，REST（N-04a、N-04d）與 MCP `run_method` 共用（04 §6.2）。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import require_llm_task
from storysphere.api.errors import ApiError
from storysphere.api.queries.cards import static_precheck
from storysphere.api.queries.runs import is_superseded, latest_done
from storysphere.api.schemas.common import camelize
from storysphere.api.schemas.runs import TriggerOut
from storysphere.methods.engine import MethodEngine
from storysphere.methods.jobs import (
    INGEST_JOB_KINDS,
    TERMINAL_STATUSES,
    JobConflictError,
    MethodJobs,
)
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import Job
from storysphere.store.tables import Run as RunRow


async def _ingest_conflict(session: AsyncSession, book_id: str) -> None:
    """409 while an ingestion job of the book is unfinished (04 §3.3)."""
    job_id = await session.scalar(
        select(Job.id).where(
            Job.book_id == book_id,
            Job.kind.in_(INGEST_JOB_KINDS),
            Job.status.not_in(TERMINAL_STATUSES),
        )
    )
    if job_id is not None:
        raise ApiError(
            409, "job_conflict", f"Ingestion job {job_id} is not finished.", jobId=job_id
        )


def _require_models(engine: MethodEngine, steps: list[str]) -> None:
    """503 when a method that would call an LLM has no usable model (04 §1.6)."""
    for method_id in steps:
        decl = engine.registry.methods.get(method_id)
        if decl is not None and decl.impl.llm_task:
            require_llm_task(decl.impl.llm_task)


async def _reusable_run(session: AsyncSession, book_id: str, ref_id: str) -> str | None:
    """Newest current `done` run of ``ref_id`` whose evidence has no 依據已變動; else None."""
    newest = await latest_done(session, book_id)
    runs = [
        run
        for run in await session.scalars(
            select(RunRow)
            .where(RunRow.book_id == book_id, RunRow.ref_id == ref_id, RunRow.status == "done")
            .order_by(RunRow.created_at.desc(), RunRow.id)
        )
        if not is_superseded(run, newest)
    ]
    if not runs:
        return None
    changed = await session.scalar(
        select(func.max(EvidenceRow.basis_changed.cast(Integer))).where(
            EvidenceRow.run_id.in_([run.id for run in runs]), EvidenceRow.status == "current"
        )
    )
    return None if changed else runs[0].id


async def trigger_method(
    session: AsyncSession,
    engine: MethodEngine,
    jobs: MethodJobs,
    book_id: str,
    ref_id: str,
    *,
    params: dict[str, Any],
    scope: list[str] | None,
    force: bool,
    dry_run: bool,
    triggered_by: str = "user",
    agent_session_id: str | None = None,
) -> tuple[int, TriggerOut]:
    """N-04a／N-04d／MCP `run_method` 共用：回 (HTTP 狀態碼, 回應)。"""
    registry = engine.registry
    if ref_id not in registry.methods and ref_id not in registry.methodologies:
        raise ApiError(422, "unknown_ref", f"'{ref_id}' is not a registered method or methodology.")
    plan = await engine.plan_method(book_id, ref_id)
    body = TriggerOut(status="planned", plan=plan.steps, not_implemented=plan.not_implemented)
    if dry_run:
        return 200, body
    if ref_id in plan.not_implemented:
        # 原型尚未支援：不是錯誤，UI 顯示「尚未支援」（範圍調整，見 STATUS）。
        body.status = "not_implemented"
        return 200, body
    if plan.blocked:
        body.status = "not_applicable"
        body.precheck = camelize(await static_precheck(engine, book_id, ref_id))
        return 200, body
    if not force and not scope and not params:
        run_id = await _reusable_run(session, book_id, ref_id)
        if run_id is not None:
            body.status, body.run_id = "reused", run_id
            return 200, body
    await _ingest_conflict(session, book_id)
    _require_models(engine, plan.steps)
    try:
        result = await jobs.trigger_method(
            book_id,
            ref_id,
            params=params,
            scope=scope,
            triggered_by=triggered_by,
            agent_session_id=agent_session_id,
        )
    except JobConflictError as exc:  # 檢查之後才剛建出來的入庫 job
        raise ApiError(409, "job_conflict", str(exc), jobId=exc.job_id) from exc
    body.job_id = result.job_id
    body.status = "attached" if result.attached else "queued"
    return (200 if result.attached else 202), body
