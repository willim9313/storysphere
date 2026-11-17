"""N-01b 上傳；N-02a–N-02e 入庫狀態、單位、章節審閱。"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import (
    BookDep,
    JobTasksDep,
    PagingDep,
    SessionDep,
    get_ingest_service,
    require_llm_task,
)
from storysphere.api.errors import ApiError, not_found, validation_error
from storysphere.api.routes.books import INGEST_KINDS
from storysphere.api.schemas.common import camelize, next_cursor
from storysphere.api.schemas.ingest import (
    FailedUnit,
    IngestStatus,
    IngestStep,
    ReviewData,
    ReviewIn,
    UnitCounts,
    UnitDetail,
    UnitItem,
    UnitPage,
    UploadAccepted,
)
from storysphere.ingest.service import ReviewStateError, open_review_job, review_data
from storysphere.store.books import BookRow
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.tables import Job, Run

router = APIRouter(tags=["ingest"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
SUPPORTED_SUFFIXES = (".pdf", ".docx", ".txt", ".epub")
_CHUNK_BYTES = 1024 * 1024
# 02 §1 的入庫步驟，依序。
STEPS = ("p1", "review", "s1", "s2", "s3", "s4", "s5")
UNIT_STAGES = ("s1a", "s1b", "s4a")
UnitStageName = Literal["s1a", "s1b", "s4a"]
# 做過但可能跳過的步驟：有 run（ingest.s2…）才算真的做了。
_STEPS_WITH_RUN = ("s2", "s3", "s4")


async def _save_upload(file: UploadFile, upload_dir: Path) -> Path:
    """Stream the upload to ``upload_dir/<uuid>/<name>``; 413 past the size limit."""
    target_dir = upload_dir / str(uuid.uuid4())
    target_dir.mkdir(parents=True)
    target = target_dir / Path(file.filename or "upload").name
    size = 0
    with target.open("wb") as out:
        while chunk := await file.read(_CHUNK_BYTES):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                break
            out.write(chunk)
    if size > MAX_UPLOAD_BYTES:
        # 只刪這次自己建的檔與資料夾。
        target.unlink()
        target_dir.rmdir()
        raise ApiError(413, "file_too_large", f"File is larger than {MAX_UPLOAD_BYTES} bytes.")
    return target


@router.post("/books/upload", status_code=202, response_model=UploadAccepted)
async def upload_book(
    request: Request,
    session: SessionDep,
    tasks: JobTasksDep,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
) -> UploadAccepted:
    """N-01b 上傳並建立 `ingest` job；P1 在背景跑，`bookId` 之後出現在 `job.result.bookId`。"""
    name = Path(file.filename or "")
    if name.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise validation_error(
            f"file: '{name.suffix or name.name}' is not one of {', '.join(SUPPORTED_SUFFIXES)}."
        )
    require_llm_task("core_extraction")
    service = get_ingest_service(request)

    path = await _save_upload(file, request.app.state.upload_dir)
    book_title = title or name.stem
    duplicate = await session.scalar(
        select(func.count()).select_from(BookRow).where(BookRow.title == book_title)
    )
    job_id = await service.create_job(path, title=title, author=author, language=language)
    tasks.spawn(job_id, service.run_to_review(job_id))
    return UploadAccepted(job_id=job_id, duplicate_title=bool(duplicate))


async def latest_ingest_job(session: AsyncSession, book_id: str) -> Job | None:
    return (
        await session.scalars(
            select(Job)
            .where(Job.book_id == book_id, Job.kind.in_(INGEST_KINDS))
            .order_by(Job.created_at.desc())
            .limit(1)
        )
    ).first()


def _step_state(step: str, index: int, job: Job | None, runs: dict[str, Run], units: list) -> str:
    if job is None:
        return "pending"
    current = STEPS.index(job.stage) if job.stage in STEPS else 0
    passed = index < current or job.status == "done"
    if passed:
        if step in _STEPS_WITH_RUN and f"ingest.{step}" not in runs:
            return "skipped"
        if step == "s1" and not any(u.stage in ("s1a", "s1b") for u in units):
            return "skipped"
        if step == "s5" and "s5" not in (job.result_json or {}):
            return "skipped"
        return "done"
    if index > current:
        return "pending"
    return {
        "paused_quota": "paused",
        "interrupted": "paused",
        "error": "failed",
        "cancelled": "failed",
    }.get(job.status, "running")


@router.get("/books/{book_id}/ingest", response_model=IngestStatus)
async def get_ingest(book: BookDep, session: SessionDep) -> IngestStatus:
    """N-02a 入庫步驟條與單位統計。"""
    job = await latest_ingest_job(session, book.id)
    runs: dict[str, Run] = {}
    for run in await session.scalars(
        select(Run)
        .where(Run.book_id == book.id, Run.ref_id.like("ingest.%"))
        .order_by(Run.created_at)
    ):
        runs[run.ref_id] = run  # 同一步驟跑過多次時留最新的
    units = list(
        await session.scalars(
            select(IngestUnitRow)
            .where(IngestUnitRow.book_id == book.id)
            .order_by(IngestUnitRow.chapter, IngestUnitRow.unit_id)
        )
    )

    steps = []
    for index, step in enumerate(STEPS):
        run = runs.get(f"ingest.{step}")
        steps.append(
            IngestStep(
                step=step,
                state=_step_state(step, index, job, runs, units),
                started_at=run.started_at if run else None,
                finished_at=run.finished_at if run else None,
                run_id=run.id if run else None,
            )
        )
    counts = {}
    for stage in UNIT_STAGES:
        rows = [u for u in units if u.stage == stage]
        done = sum(1 for u in rows if u.status == "done")
        failed = sum(1 for u in rows if u.status == "failed")
        counts[stage] = UnitCounts(
            total=len(rows), done=done, failed=failed, pending=len(rows) - done - failed
        )
    return IngestStatus(
        job_id=job.id if job else None,
        job_status=job.status if job else None,
        steps=steps,
        units=counts,
        failed_units=[
            FailedUnit(stage=u.stage, unit_id=u.unit_id, chapter=u.chapter, error=u.error)
            for u in units
            if u.status == "failed"
        ],
        genre_profile=camelize(book.genre_profile, frozenset({"mechanism_density"})),
    )


def _unit_position(unit_id: str) -> tuple[int, int]:
    """`{book_id}:{chapter}:{first_paragraph_position}` → (chapter, position)."""
    _book, chapter, position = unit_id.rsplit(":", 2)
    return int(chapter), int(position)


def _unit_item(row: IngestUnitRow) -> dict:
    return {
        "unit_id": row.unit_id,
        "stage": row.stage,
        "chapter": row.chapter,
        "first_paragraph_position": _unit_position(row.unit_id)[1],
        "status": row.status,
        "attempts": row.attempts,
        "model": row.model,
        "prompt_version": row.prompt_version,
        "error": row.error,
    }


async def _stage_units(session: AsyncSession, book_id: str, stage: str) -> list[IngestUnitRow]:
    """All units of one stage in book order (by chapter, then first paragraph)."""
    rows = list(
        await session.scalars(
            select(IngestUnitRow).where(
                IngestUnitRow.book_id == book_id, IngestUnitRow.stage == stage
            )
        )
    )
    rows.sort(key=lambda row: _unit_position(row.unit_id))
    return rows


@router.get("/books/{book_id}/ingest/units", response_model=UnitPage)
async def list_units(
    book: BookDep,
    session: SessionDep,
    paging: PagingDep,
    stage: UnitStageName,
    status: Literal["pending", "running", "done", "failed"] | None = None,
    chapter: int | None = None,
) -> UnitPage:
    """N-02b 單位格狀圖，依書中順序。"""
    rows = [
        row
        for row in await _stage_units(session, book.id, stage)
        if (status is None or row.status == status) and (chapter is None or row.chapter == chapter)
    ]
    page = rows[paging.offset : paging.offset + paging.limit]
    return UnitPage(
        items=[UnitItem(**_unit_item(row)) for row in page],
        next_cursor=next_cursor(paging.offset, len(page), len(rows)),
        total=len(rows),
    )


@router.get("/books/{book_id}/ingest/units/{unit_id}", response_model=UnitDetail)
async def get_unit(
    book: BookDep, unit_id: str, session: SessionDep, stage: UnitStageName
) -> UnitDetail:
    """N-02c 一個單位與它的原始 LLM 輸出（開發者檢視）。"""
    rows = await _stage_units(session, book.id, stage)
    index = next((i for i, row in enumerate(rows) if row.unit_id == unit_id), None)
    if index is None:
        raise not_found("Unit", unit_id)
    row = rows[index]
    raw = await session.scalar(
        select(IngestUnitOutputRow.raw_json).where(
            IngestUnitOutputRow.book_id == book.id,
            IngestUnitOutputRow.stage == stage,
            IngestUnitOutputRow.unit_id == unit_id,
        )
    )
    # 脈絡段＝全書前一個單位的最後一段（02 §2；會跨章）。
    previous = rows[index - 1] if index > 0 else None
    return UnitDetail(
        **_unit_item(row),
        paragraph_ids=row.paragraph_ids,
        context_paragraph_id=previous.paragraph_ids[-1] if previous else None,
        raw_output=raw,
    )


@router.get("/books/{book_id}/review-data", response_model=ReviewData)
async def get_review_data(book: BookDep, request: Request) -> ReviewData:
    """N-02d 章節審閱資料；只在 job 為 `awaiting_review` 時有效。"""
    try:
        data = await review_data(request.app.state.session_factory, book.id)
    except ReviewStateError as exc:
        raise ApiError(409, exc.code, f"Chapter review of book '{book.id}': {exc.code}.") from exc
    return ReviewData.model_validate(data)


@router.post("/books/{book_id}/review", status_code=204)
async def submit_review(
    book: BookDep, body: ReviewIn, request: Request, session: SessionDep, tasks: JobTasksDep
) -> Response:
    """N-02e 提交章節審閱；job 回到 `running`，S1 之後在背景跑。"""
    try:
        await open_review_job(session, book.id)
    except ReviewStateError as exc:
        raise ApiError(409, exc.code, f"Chapter review of book '{book.id}': {exc.code}.") from exc
    require_llm_task("core_extraction")
    service = get_ingest_service(request)
    try:
        job_id = await service.claim_review(book.id)
    except ReviewStateError as exc:  # 兩個請求同時送出時，後到的那個
        raise ApiError(409, exc.code, f"Chapter review of book '{book.id}': {exc.code}.") from exc
    payload = body.model_dump()
    if body.chapters is not None:
        payload["chapters"] = [chapter.model_dump() for chapter in body.chapters]
    tasks.spawn(job_id, service.continue_after_review(job_id, payload))
    return Response(status_code=204)
