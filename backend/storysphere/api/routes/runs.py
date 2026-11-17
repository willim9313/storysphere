"""N-04b、N-04c run 的查詢；N-04e view 資料。"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import (
    BookDep,
    MethodEngineDep,
    MethodJobsDep,
    PagingDep,
    RegistryDep,
    SessionDep,
    require_llm_task,
)
from storysphere.api.errors import ApiError, not_found, validation_error
from storysphere.api.queries.cards import static_precheck
from storysphere.api.queries.evidence import to_evidence
from storysphere.api.queries.runs import INGEST_REF_PREFIX, is_superseded, latest_done, run_fields
from storysphere.api.schemas.common import camelize, next_cursor
from storysphere.api.schemas.evidence import Evidence
from storysphere.api.schemas.runs import (
    ReferencedEvidence,
    RerunIn,
    Run,
    RunDetail,
    RunListItem,
    RunPage,
    TriggerIn,
    TriggerOut,
    ViewChapter,
    ViewData,
)
from storysphere.methods.engine import MethodEngine
from storysphere.methods.jobs import (
    INGEST_JOB_KINDS,
    TERMINAL_STATUSES,
    JobConflictError,
    MethodJobs,
)
from storysphere.store.books import ChapterRow
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import Job
from storysphere.store.tables import Run as RunRow

router = APIRouter(tags=["runs"])

MAX_VIEW_EVIDENCE_IDS = 200
# `referenced` 的標籤取哪個內容欄位；其餘類型用 summary（04 N-04e）。
_LABEL_FIELDS = {"character": "canonical_name", "event": "title", "imagery_motif": "term"}
_CHUNK = 500


@router.get("/books/{book_id}/runs", response_model=RunPage)
async def list_runs(
    book: BookDep,
    session: SessionDep,
    registry: RegistryDep,
    paging: PagingDep,
    ref_id: Annotated[str | None, Query(alias="refId")] = None,
    status: str | None = None,
    include_superseded: Annotated[bool, Query(alias="includeSuperseded")] = False,
    include_ingest: Annotated[bool, Query(alias="includeIngest")] = False,
) -> RunPage:
    """N-04b run 列表，新到舊。預設不含被較新 run 取代的，也不含入庫步驟的 run。"""
    stmt = select(RunRow).where(RunRow.book_id == book.id)
    if ref_id is not None:
        stmt = stmt.where(RunRow.ref_id == ref_id)
    if status is not None:
        stmt = stmt.where(RunRow.status == status)
    if not include_ingest:
        stmt = stmt.where(RunRow.ref_id.not_like(f"{INGEST_REF_PREFIX}%"))
    runs = list(await session.scalars(stmt.order_by(RunRow.created_at.desc(), RunRow.id)))
    newest = await latest_done(session, book.id)
    if not include_superseded:
        runs = [run for run in runs if not is_superseded(run, newest)]
    page = runs[paging.offset : paging.offset + paging.limit]
    return RunPage(
        items=[
            RunListItem(**fields) for fields in await run_fields(session, registry, page, newest)
        ],
        next_cursor=next_cursor(paging.offset, len(page), len(runs)),
        total=len(runs),
    )


async def run_or_404(session: AsyncSession, book_id: str, run_id: str) -> RunRow:
    run = await session.get(RunRow, run_id)
    if run is None or run.book_id != book_id:
        raise not_found("Run", run_id)
    return run


@router.get("/books/{book_id}/runs/{run_id}", response_model=RunDetail)
async def get_run(book: BookDep, run_id: str, session: SessionDep, registry: RegistryDep) -> RunDetail:
    """N-04c 單一 run，含它的步驟與上游補跑。"""
    run = await run_or_404(session, book.id, run_id)
    step_rows = list(
        await session.scalars(
            select(RunRow)
            .where(RunRow.parent_run_id == run_id)
            .order_by(RunRow.created_at, RunRow.id)
        )
    )
    newest = await latest_done(session, book.id)
    fields, *step_fields = await run_fields(session, registry, [run, *step_rows], newest)
    return RunDetail(**fields, step_runs=[Run(**item) for item in step_fields])


def _referenced_ids(value: Any, found: set[str], *, is_ref: bool = False) -> None:
    """Collect the values of every `*Id`／`*Ids` key in a camelCased content tree."""
    if isinstance(value, dict):
        for key, item in value.items():
            _referenced_ids(item, found, is_ref=key.endswith(("Id", "Ids")))
    elif isinstance(value, list):
        for item in value:
            _referenced_ids(item, found, is_ref=is_ref)
    elif is_ref and isinstance(value, str):
        found.add(value)


async def _referenced(
    session: AsyncSession, book_id: str, primary: list[Evidence]
) -> list[ReferencedEvidence]:
    found: set[str] = set()
    for evidence in primary:
        _referenced_ids(evidence.content, found)
    ids = sorted(found - {evidence.id for evidence in primary})
    rows: list[EvidenceRow] = []
    for start in range(0, len(ids), _CHUNK):
        rows.extend(
            await session.scalars(
                select(EvidenceRow).where(
                    EvidenceRow.id.in_(ids[start : start + _CHUNK]),
                    EvidenceRow.book_id == book_id,
                )
            )
        )
    labels: dict[str, str] = {}
    for claim_type, column in _LABEL_FIELDS.items():
        type_ids = [row.id for row in rows if row.claim_type == claim_type]
        table = CONTENT_TABLES[claim_type]
        for start in range(0, len(type_ids), _CHUNK):
            result = await session.execute(
                select(table.c.evidence_id, table.c[column]).where(
                    table.c.evidence_id.in_(type_ids[start : start + _CHUNK])
                )
            )
            labels.update({evidence_id: label for evidence_id, label in result if label})
    return [
        ReferencedEvidence(
            id=row.id,
            claim_type=row.claim_type,
            level=row.level,
            label=labels.get(row.id, row.summary),
            discourse_chapter=row.discourse_chapter,
        )
        for row in rows
    ]


@router.get("/books/{book_id}/view-data", response_model=ViewData)
async def get_view_data(
    book: BookDep,
    session: SessionDep,
    registry: RegistryDep,
    view_type: Annotated[str, Query(alias="viewType")],
    run_id: Annotated[str | None, Query(alias="runId")] = None,
    evidence_ids: Annotated[str | None, Query(alias="evidenceIds")] = None,
    include_l1: Annotated[bool, Query(alias="includeL1")] = False,
) -> ViewData:
    """N-04e view 取資料：`runId` 或 `evidenceIds`（逗號分隔）二擇一。"""
    if (run_id is None) == (evidence_ids is None):
        raise validation_error("Give exactly one of runId and evidenceIds.")
    wanted = [item for item in (evidence_ids or "").split(",") if item]
    if len(wanted) > MAX_VIEW_EVIDENCE_IDS:
        raise validation_error(f"evidenceIds: at most {MAX_VIEW_EVIDENCE_IDS} ids.")
    if view_type not in registry.views:
        raise validation_error(f"viewType: '{view_type}' is not in the view catalog.")

    visible = [EvidenceRow.book_id == book.id]
    if not include_l1:
        visible.append(EvidenceRow.level >= 2)
    if run_id is not None:
        await run_or_404(session, book.id, run_id)
        rows = list(
            await session.scalars(
                select(EvidenceRow)
                .where(
                    *visible,
                    EvidenceRow.run_id == run_id,
                    EvidenceRow.status == "current",
                    EvidenceRow.review_status != "rejected",
                )
                .order_by(
                    EvidenceRow.discourse_chapter.is_(None),
                    EvidenceRow.discourse_chapter,
                    EvidenceRow.created_at,
                    EvidenceRow.id,
                )
            )
        )
    else:
        # 指名要的證據照實回（含 superseded、rejected，各自有標），順序同請求。
        found = {
            row.id: row
            for row in await session.scalars(
                select(EvidenceRow).where(*visible, EvidenceRow.id.in_(wanted))
            )
        }
        rows = [found[evidence_id] for evidence_id in dict.fromkeys(wanted) if evidence_id in found]

    primary = await to_evidence(session, rows)
    chapters = await session.execute(
        select(ChapterRow.number, ChapterRow.title)
        .where(ChapterRow.book_id == book.id)
        .order_by(ChapterRow.number)
    )
    return ViewData(
        view_type=view_type,
        primary=primary,
        referenced=await _referenced(session, book.id, primary),
        chapters=[ViewChapter(number=number, title=title) for number, title in chapters],
    )


# ── N-04a、N-04d 觸發 ──────────────────────────────────────────


def _out(status_code: int, body: TriggerOut) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json", by_alias=True))


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
        raise ApiError(409, "job_conflict", f"Ingestion job {job_id} is not finished.", jobId=job_id)


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


async def _trigger(
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
) -> JSONResponse:
    registry = engine.registry
    if ref_id not in registry.methods and ref_id not in registry.methodologies:
        raise ApiError(422, "unknown_ref", f"'{ref_id}' is not a registered method or methodology.")
    plan = await engine.plan_method(book_id, ref_id)
    body = TriggerOut(status="planned", plan=plan.steps, not_implemented=plan.not_implemented)
    if dry_run:
        return _out(200, body)
    if ref_id in plan.not_implemented:
        # 原型尚未支援：不是錯誤，UI 顯示「尚未支援」（範圍調整，見 STATUS）。
        body.status = "not_implemented"
        return _out(200, body)
    if plan.blocked:
        body.status = "not_applicable"
        body.precheck = camelize(await static_precheck(engine, book_id, ref_id))
        return _out(200, body)
    if not force and not scope and not params:
        run_id = await _reusable_run(session, book_id, ref_id)
        if run_id is not None:
            body.status, body.run_id = "reused", run_id
            return _out(200, body)
    await _ingest_conflict(session, book_id)
    _require_models(engine, plan.steps)
    try:
        result = await jobs.trigger_method(
            book_id, ref_id, params=params, scope=scope, triggered_by="user"
        )
    except JobConflictError as exc:  # 檢查之後才剛建出來的入庫 job
        raise ApiError(409, "job_conflict", str(exc), jobId=exc.job_id) from exc
    body.job_id = result.job_id
    body.status = "attached" if result.attached else "queued"
    return _out(200 if result.attached else 202, body)


@router.post("/books/{book_id}/runs", response_model=TriggerOut, status_code=202)
async def trigger_run(
    book: BookDep,
    body: TriggerIn,
    session: SessionDep,
    engine: MethodEngineDep,
    jobs: MethodJobsDep,
) -> JSONResponse:
    """N-04a 觸發一個方法或方法論。

    依序：`dryRun` → `planned`；尚未實作 → `not_implemented`；缺補不了的第 1 層類型 → `not_applicable`；
    有可重用的結果（沒帶 `force`、`subjectIds`、`params`）→ `reused`；否則建 job（202 `queued`）或
    接到同一分析的 job（200 `attached`）。
    """
    return await _trigger(
        session, engine, jobs, book.id, body.ref_id,
        params=dict(body.params or {}), scope=body.subject_ids,
        force=body.force, dry_run=body.dry_run,
    )  # fmt: skip


def _scope_of(run: RunRow) -> list[str] | None:
    """Subject ids in a run's scope key (`subject:<id>|chapter:<n>`); None＝全書。"""
    subjects = [part.split(":", 1)[1] for part in run.scope_key.split("|") if part.startswith("subject:")]
    return subjects or None


@router.post("/books/{book_id}/runs/{run_id}/rerun", response_model=TriggerOut, status_code=202)
async def rerun(
    book: BookDep,
    run_id: str,
    body: RerunIn,
    session: SessionDep,
    engine: MethodEngineDep,
    jobs: MethodJobsDep,
) -> JSONResponse:
    """N-04d 結果卡的「重跑」：同 refId、params、主體再跑一次，不重用舊結果。

    原型決定：只重跑這一個方法（上游已有結果就照用）；`rerunUpstream=true` 尚未支援，回 422。
    scope 依 run 的主體重跑：每章一筆的方法（CH5）會重跑該角色的所有章。
    """
    run = await run_or_404(session, book.id, run_id)
    if body.rerun_upstream:
        raise validation_error("rerunUpstream: not supported in the prototype yet.")
    return await _trigger(
        session, engine, jobs, book.id, run.ref_id,
        params=dict(run.params_json or {}), scope=_scope_of(run), force=True, dry_run=False,
    )  # fmt: skip
