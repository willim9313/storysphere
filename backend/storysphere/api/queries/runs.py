"""Run → API form, including the fields derived at response time (docs/spec/04 §2.2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.schemas.common import camelize
from storysphere.registry.loader import Registry
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import Run as RunRow

INGEST_REF_PREFIX = "ingest."


def ref_kind(registry: Registry, ref_id: str) -> str:
    if ref_id in registry.methodologies:
        return "methodology"
    if ref_id.startswith(INGEST_REF_PREFIX):
        return "ingest_step"
    return "method"


async def latest_done(session: AsyncSession, book_id: str) -> dict[tuple[str, str], datetime]:
    """Newest `done` run of every (ref_id, scope_key) in the book."""
    rows = await session.execute(
        select(RunRow.ref_id, RunRow.scope_key, func.max(RunRow.created_at))
        .where(RunRow.book_id == book_id, RunRow.status == "done")
        .group_by(RunRow.ref_id, RunRow.scope_key)
    )
    return {(ref_id, scope_key): newest for ref_id, scope_key, newest in rows}


def is_superseded(run: RunRow, newest: dict[tuple[str, str], datetime]) -> bool:
    latest = newest.get((run.ref_id, run.scope_key))
    return latest is not None and latest > run.created_at


async def run_fields(
    session: AsyncSession,
    registry: Registry,
    runs: list[RunRow],
    newest: dict[tuple[str, str], datetime],
) -> list[dict[str, Any]]:
    """Keyword arguments for `schemas.runs.Run`, one dict per run, in order."""
    ids = [run.id for run in runs]
    stats: dict[str, tuple[int, int | None, int]] = {}
    steps: dict[str, list[str]] = {}
    if ids:
        for run_id, count, max_level, changed in await session.execute(
            select(
                EvidenceRow.run_id,
                func.count(),
                func.max(EvidenceRow.level),
                func.sum(EvidenceRow.basis_changed.cast(Integer)),
            )
            .where(EvidenceRow.run_id.in_(ids), EvidenceRow.status == "current")
            .group_by(EvidenceRow.run_id)
        ):
            stats[run_id] = (count, max_level, changed or 0)
        for step_id, parent_id in await session.execute(
            select(RunRow.id, RunRow.parent_run_id)
            .where(RunRow.parent_run_id.in_(ids))
            .order_by(RunRow.created_at, RunRow.id)
        ):
            steps.setdefault(parent_id, []).append(step_id)

    out = []
    for run in runs:
        decl = registry.methods.get(run.ref_id) or registry.methodologies.get(run.ref_id)
        count, max_level, changed = stats.get(run.id, (0, None, 0))
        out.append(
            {
                "id": run.id,
                "book_id": run.book_id,
                "ref_id": run.ref_id,
                "ref_kind": ref_kind(registry, run.ref_id),
                "code": decl.code if decl else None,
                "question": decl.question if decl else None,
                "grade": decl.grade if decl else None,
                "basis": decl.basis if decl else None,
                "scope_key": run.scope_key,
                "version": run.ref_version,
                "prompt_version": run.prompt_version,
                "model": run.model,
                "params": run.params_json,
                "input_evidence_ids": run.input_evidence_ids or [],
                "summary": camelize(run.summary_json),
                "status": run.status,
                "precheck": camelize(run.precheck_json),
                "parent_run_id": run.parent_run_id,
                "step_run_ids": steps.get(run.id, []),
                "job_id": run.job_id,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "created_at": run.created_at,
                "superseded": is_superseded(run, newest),
                "evidence_count": count,
                "max_level": max_level,
                "basis_changed_count": changed,
            }
        )
    return out
