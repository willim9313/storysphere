"""N-09a、N-09b 工作中心（唯讀的部分）。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from storysphere.api.deps import SessionDep
from storysphere.api.errors import not_found
from storysphere.api.schemas.jobs import Job, job_out
from storysphere.store.tables import Job as JobRow

router = APIRouter(tags=["jobs"])

# 04 §3.2 的終態。
TERMINAL_STATUSES = ("done", "error", "cancelled")


@router.get("/jobs", response_model=list[Job])
async def list_jobs(
    session: SessionDep,
    book_id: Annotated[str | None, Query(alias="bookId")] = None,
    recent_limit: Annotated[int, Query(alias="recentLimit", ge=0, le=200)] = 20,
) -> list[Job]:
    """N-09a：所有非終態＋最近 `recentLimit` 筆終態，新到舊。"""
    base = select(JobRow)
    if book_id is not None:
        base = base.where(JobRow.book_id == book_id)
    newest_first = (JobRow.created_at.desc(), JobRow.id)
    active = list(
        await session.scalars(
            base.where(JobRow.status.not_in(TERMINAL_STATUSES)).order_by(*newest_first)
        )
    )
    finished = list(
        await session.scalars(
            base.where(JobRow.status.in_(TERMINAL_STATUSES))
            .order_by(*newest_first)
            .limit(recent_limit)
        )
    )
    rows = sorted(active + finished, key=lambda row: row.created_at, reverse=True)
    return [job_out(row) for row in rows]


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, session: SessionDep) -> Job:
    """N-09b 單一 job。"""
    row = await session.get(JobRow, job_id)
    if row is None:
        raise not_found("Job", job_id)
    return job_out(row)
