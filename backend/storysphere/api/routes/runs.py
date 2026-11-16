"""N-04b、N-04c run 的查詢；N-04e view 資料。"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import BookDep, PagingDep, RegistryDep, SessionDep
from storysphere.api.errors import not_found, validation_error
from storysphere.api.queries.evidence import to_evidence
from storysphere.api.queries.runs import INGEST_REF_PREFIX, is_superseded, latest_done, run_fields
from storysphere.api.schemas.common import next_cursor
from storysphere.api.schemas.evidence import Evidence
from storysphere.api.schemas.runs import (
    ReferencedEvidence,
    Run,
    RunDetail,
    RunListItem,
    RunPage,
    ViewChapter,
    ViewData,
)
from storysphere.store.books import ChapterRow
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.tables import Evidence as EvidenceRow
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
