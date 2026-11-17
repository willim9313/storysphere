"""N-09a、N-09b、N-09d、N-09e 工作中心。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import select

from storysphere.api.deps import (
    JobTasksDep,
    MethodJobsDep,
    SessionDep,
    get_ingest_service,
    require_llm_task,
)
from storysphere.api.errors import ApiError, not_found
from storysphere.api.schemas.jobs import Job, JobAccepted, job_out
from storysphere.api.tasks import stop
from storysphere.ingest.service import JobStateError, mark_cancelled
from storysphere.methods.jobs import METHOD_JOB_KIND
from storysphere.store.tables import Job as JobRow

router = APIRouter(tags=["jobs"])

# 04 §3.2 的終態。
TERMINAL_STATUSES = ("done", "error", "cancelled")
RESUMABLE_STATUSES = ("paused_quota", "interrupted")


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


@router.post("/jobs/{job_id}/cancel", status_code=204)
async def cancel_job(
    job_id: str,
    session: SessionDep,
    tasks: JobTasksDep,
    method_jobs: MethodJobsDep,
    request: Request,
) -> Response:
    """N-09d 取消。已完成的單位與已寫入的證據保留；入庫類 job 的 checkpoint 刪掉。"""
    row = await session.get(JobRow, job_id)
    if row is None:
        raise not_found("Job", job_id)
    if row.status in TERMINAL_STATUSES:
        raise ApiError(409, "invalid_state", f"Job '{job_id}' is already {row.status}.")
    await session.close()  # 等背景工作停下來的期間不要握著連線

    # 先讓背景工作真的停下來，它才不會在我們標 cancelled 之後又寫回別的狀態。
    await stop(tasks.get(job_id) or method_jobs.task(job_id))
    sf = request.app.state.session_factory
    try:
        await mark_cancelled(sf, request.app.state.checkpointer, job_id)
    except JobStateError as exc:  # 剛好在等的時候自己跑完了
        raise ApiError(409, "invalid_state", f"Job '{job_id}' is already {exc}.") from exc
    return Response(status_code=204)


@router.post("/jobs/{job_id}/resume", status_code=202, response_model=JobAccepted)
async def resume_job(
    job_id: str,
    session: SessionDep,
    tasks: JobTasksDep,
    method_jobs: MethodJobsDep,
    request: Request,
) -> JobAccepted:
    """N-09e 續跑 `paused_quota`／`interrupted` 的 job；同一個 job id 回到 `pending`。"""
    row = await session.get(JobRow, job_id)
    if row is None:
        raise not_found("Job", job_id)
    if row.status not in RESUMABLE_STATUSES:
        raise ApiError(409, "invalid_state", f"Job '{job_id}' is {row.status}, not paused.")
    kind = row.kind
    await session.close()

    if kind == METHOD_JOB_KIND:
        async with request.app.state.session_factory() as s, s.begin():
            job = await s.get(JobRow, job_id)
            if job.status not in RESUMABLE_STATUSES:
                raise ApiError(409, "invalid_state", f"Job '{job_id}' is {job.status}, not paused.")
            job.status = "pending"
        method_jobs.start(job_id)
        return JobAccepted(job_id=job_id)

    if kind != "ingest":
        raise ApiError(409, "invalid_state", f"Job kind '{kind}' cannot be resumed yet.")
    require_llm_task("core_extraction")
    service = get_ingest_service(request)
    try:
        await service.claim_resume(job_id)
    except JobStateError as exc:
        raise ApiError(409, "invalid_state", f"Job '{job_id}' is {exc}, not paused.") from exc
    tasks.spawn(job_id, service.continue_resumed(job_id))
    return JobAccepted(job_id=job_id)
