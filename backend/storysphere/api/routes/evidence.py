"""N-05a–N-05d：證據列表、單筆、追溯樹、原文段落。"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import BookDep, PagingDep, RegistryDep, SessionDep
from storysphere.api.errors import not_found
from storysphere.api.queries.evidence import (
    FIRST_QUOTE_CHARS,
    EvidenceFilter,
    list_evidence,
    to_evidence,
    to_list_items,
)
from storysphere.api.schemas.common import next_cursor
from storysphere.api.schemas.evidence import (
    EvidenceDetail,
    EvidenceEditOut,
    EvidencePage,
    HighlightOut,
    ParagraphOut,
    ParagraphView,
    Trace,
    TraceEdge,
    TraceNode,
)
from storysphere.store.books import ChapterRow, ParagraphRow
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import EvidenceEdit, EvidenceLink, EvidenceQuote, Run

router = APIRouter(tags=["evidence"])

MAX_TRACE_DEPTH = 6
MAX_PARAGRAPH_CONTEXT = 3
_CHUNK = 500


async def evidence_or_404(session: AsyncSession, book_id: str, evidence_id: str) -> EvidenceRow:
    row = await session.get(EvidenceRow, evidence_id)
    if row is None or row.book_id != book_id:
        raise not_found("Evidence", evidence_id)
    return row


@router.get("/books/{book_id}/evidence", response_model=EvidencePage)
async def list_book_evidence(
    book: BookDep,
    session: SessionDep,
    paging: PagingDep,
    claim_type: Annotated[list[str] | None, Query(alias="claimType")] = None,
    min_level: Annotated[int | None, Query(alias="minLevel", ge=1)] = None,
    max_level: Annotated[int | None, Query(alias="maxLevel", ge=1)] = None,
    review_status: Annotated[
        Literal["pending", "approved", "modified", "rejected"] | None, Query(alias="reviewStatus")
    ] = None,
    status: Literal["current", "superseded"] = "current",
    basis_changed: Annotated[bool | None, Query(alias="basisChanged")] = None,
    chapter_from: Annotated[int | None, Query(alias="chapterFrom")] = None,
    chapter_to: Annotated[int | None, Query(alias="chapterTo")] = None,
    run_id: Annotated[str | None, Query(alias="runId")] = None,
    subject_id: Annotated[str | None, Query(alias="subjectId")] = None,
    source: str | None = None,
    q: str | None = None,
    include_l1: Annotated[bool, Query(alias="includeL1")] = False,
    with_content: Annotated[bool, Query(alias="withContent")] = False,
    sort: Literal["chapter", "level", "confidence", "createdAt"] | None = None,
) -> EvidencePage:
    """N-05a 證據列表。預設只回第 2 層以上、current、沒被拒絕的（04 §1.4）。

    `q` 有 3 個字以上走全文檢索，沒指定 `sort` 時依相關度排序；少於 3 個字改用子字串比對。
    """
    flt = EvidenceFilter(
        claim_types=claim_type or [],
        min_level=min_level,
        max_level=max_level,
        review_status=review_status,
        status=status,
        basis_changed=basis_changed,
        chapter_from=chapter_from,
        chapter_to=chapter_to,
        run_id=run_id,
        subject_id=subject_id,
        source=source,
        q=q,
        include_l1=include_l1,
        sort=sort,
    )
    rows, total = await list_evidence(
        session, book.id, flt, offset=paging.offset, limit=paging.limit
    )
    return EvidencePage(
        items=await to_list_items(session, rows, with_content=with_content),
        next_cursor=next_cursor(paging.offset, len(rows), total),
        total=total,
    )


@router.get("/books/{book_id}/evidence/{evidence_id}", response_model=EvidenceDetail)
async def get_evidence(book: BookDep, evidence_id: str, session: SessionDep) -> EvidenceDetail:
    """N-05b 單筆證據；第 1 層也能直接以 id 讀。"""
    row = await evidence_or_404(session, book.id, evidence_id)
    (evidence,) = await to_evidence(session, [row])
    edits = await session.scalars(
        select(EvidenceEdit)
        .where(EvidenceEdit.evidence_id == evidence_id)
        .order_by(EvidenceEdit.edited_at, EvidenceEdit.id)
    )
    return EvidenceDetail(
        **evidence.model_dump(),
        edits=[
            EvidenceEditOut(
                edited_at=edit.edited_at,
                action=edit.action,
                reason=edit.reason,
                before=edit.before_json,
            )
            for edit in edits
        ],
    )


async def _neighbours(
    session: AsyncSession, ids: list[str], direction: str
) -> list[tuple[str, str]]:
    """(downstream, upstream) pairs touching ``ids`` on the side given by ``direction``."""
    column = EvidenceLink.evidence_id if direction == "upstream" else EvidenceLink.upstream_id
    pairs: list[tuple[str, str]] = []
    for start in range(0, len(ids), _CHUNK):
        rows = await session.execute(
            select(EvidenceLink.evidence_id, EvidenceLink.upstream_id).where(
                column.in_(ids[start : start + _CHUNK])
            )
        )
        pairs.extend((row[0], row[1]) for row in rows)
    return pairs


@router.get("/books/{book_id}/evidence/{evidence_id}/trace", response_model=Trace)
async def get_trace(
    book: BookDep,
    evidence_id: str,
    session: SessionDep,
    registry: RegistryDep,
    depth: Annotated[int, Query(ge=1, le=MAX_TRACE_DEPTH)] = MAX_TRACE_DEPTH,
    direction: Literal["upstream", "downstream"] = "upstream",
) -> Trace:
    """N-05c 追溯樹：沿 `derived_from` 展開，一律含第 1 層。"""
    await evidence_or_404(session, book.id, evidence_id)
    seen = {evidence_id}
    edges: list[tuple[str, str]] = []
    frontier = [evidence_id]
    for _ in range(depth):
        if not frontier:
            break
        pairs = await _neighbours(session, frontier, direction)
        edges.extend(pairs)
        found = {(up if direction == "upstream" else down) for down, up in pairs}
        frontier = sorted(found - seen)
        seen.update(frontier)

    ids = sorted(seen)
    evidence_rows: dict[str, EvidenceRow] = {}
    run_rows: dict[str, Run] = {}
    quotes: dict[str, str] = {}  # 每筆證據的第一段引文
    for start in range(0, len(ids), _CHUNK):
        chunk = ids[start : start + _CHUNK]
        for row in await session.scalars(select(EvidenceRow).where(EvidenceRow.id.in_(chunk))):
            evidence_rows[row.id] = row
        for run in await session.scalars(select(Run).where(Run.id.in_(chunk))):
            run_rows[run.id] = run
        for quote in await session.scalars(
            select(EvidenceQuote)
            .where(EvidenceQuote.evidence_id.in_(chunk))
            .order_by(EvidenceQuote.evidence_id, EvidenceQuote.seq)
        ):
            quotes.setdefault(quote.evidence_id, quote.text)

    nodes: list[TraceNode] = []
    for node_id in ids:
        if row := evidence_rows.get(node_id):
            nodes.append(
                TraceNode(
                    id=row.id,
                    kind="evidence",
                    claim_type=row.claim_type,
                    level=row.level,
                    summary=row.summary,
                    review_status=row.review_status,
                    basis_changed=row.basis_changed,
                    discourse_chapter=row.discourse_chapter,
                    first_quote=quotes[row.id][:FIRST_QUOTE_CHARS] if row.id in quotes else None,
                )
            )
        elif run := run_rows.get(node_id):
            decl = registry.methods.get(run.ref_id) or registry.methodologies.get(run.ref_id)
            nodes.append(
                TraceNode(id=run.id, kind="run", ref_id=run.ref_id, code=decl.code if decl else None)
            )
    known = {node.id for node in nodes}
    return Trace(
        root=evidence_id,
        nodes=nodes,
        # 指到已經不存在的上游（被清掉的舊證據）的邊不回。
        edges=[
            TraceEdge(from_=down, to=up)
            for down, up in sorted(set(edges))
            if down in known and up in known
        ],
    )


def _paragraph_out(row: ParagraphRow, titles: dict[str, str | None]) -> ParagraphOut:
    return ParagraphOut(
        id=row.id,
        chapter_number=row.chapter_number,
        chapter_title=titles.get(row.chapter_id),
        position=row.position,
        text=row.text,
        role=row.role,
        title_span=row.title_span,
    )


@router.get("/books/{book_id}/paragraphs/{paragraph_id}", response_model=ParagraphView)
async def get_paragraph(
    book: BookDep,
    paragraph_id: str,
    session: SessionDep,
    context: Annotated[int, Query(ge=0, le=MAX_PARAGRAPH_CONTEXT)] = 0,
    highlight_evidence_id: Annotated[str | None, Query(alias="highlightEvidenceId")] = None,
) -> ParagraphView:
    """N-05d 原文段落。`highlights` 只回 `highlightEvidenceId` 那筆證據落在這一段的引文。"""
    paragraph = await session.get(ParagraphRow, paragraph_id)
    if paragraph is None or paragraph.book_id != book.id:
        raise not_found("Paragraph", paragraph_id)

    before: list[ParagraphRow] = []
    after: list[ParagraphRow] = []
    if context:
        # 前後文照全書順序取，會跨章。
        ordered = list(
            await session.scalars(
                select(ParagraphRow)
                .where(ParagraphRow.book_id == book.id)
                .order_by(ParagraphRow.chapter_number, ParagraphRow.position)
            )
        )
        index = next(i for i, row in enumerate(ordered) if row.id == paragraph_id)
        before = ordered[max(0, index - context) : index]
        after = ordered[index + 1 : index + 1 + context]

    chapter_ids = {row.chapter_id for row in [paragraph, *before, *after]}
    titles = dict(
        (
            await session.execute(
                select(ChapterRow.id, ChapterRow.title).where(ChapterRow.id.in_(chapter_ids))
            )
        ).all()
    )

    highlights: list[HighlightOut] = []
    if highlight_evidence_id is not None:
        quotes = await session.scalars(
            select(EvidenceQuote)
            .where(
                EvidenceQuote.evidence_id == highlight_evidence_id,
                EvidenceQuote.paragraph_id == paragraph_id,
            )
            .order_by(EvidenceQuote.seq)
        )
        highlights = [
            HighlightOut(
                evidence_id=quote.evidence_id,
                seq=quote.seq,
                start=quote.start,
                end=quote.end,
                verified=quote.verified,
            )
            for quote in quotes
        ]
    return ParagraphView(
        paragraph=_paragraph_out(paragraph, titles),
        before=[_paragraph_out(row, titles) for row in before],
        after=[_paragraph_out(row, titles) for row in after],
        highlights=highlights,
    )
