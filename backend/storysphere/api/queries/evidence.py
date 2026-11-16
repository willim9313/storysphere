"""Read-only evidence queries behind N-05a–N-05c and N-04e.

T20 的 MCP 讀取工具共用這一層（04 §6.2）。回傳的是 `api/schemas` 的 model。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.schemas.common import camelize
from storysphere.api.schemas.evidence import (
    Evidence,
    EvidenceListItem,
    GenreExtOut,
    QuoteOut,
    SubjectOut,
    UpstreamOut,
)
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import (
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    EvidenceSubject,
    Run,
)

FIRST_QUOTE_CHARS = 120
# FTS5 用 trigram，少於 3 個字搜不到，改用 LIKE。
FTS_MIN_CHARS = 3
_CHUNK = 500

# 以資料當 key 的欄位：底下的 key 是 id、章號或自由文字，不轉 camelCase（04 §1.1）。
RAW_KEY_FIELDS = frozenset(
    {"centrality", "chapter_distribution", "intensity_by_chapter", "attributes"}
)

SORTS = ("chapter", "level", "confidence", "createdAt")


@dataclass
class EvidenceFilter:
    """N-05a 的查詢條件；預設值就是 04 §1.4 的可見範圍。"""

    claim_types: list[str] = field(default_factory=list)
    min_level: int | None = None
    max_level: int | None = None
    review_status: str | None = None  # 沒給＝排除 rejected
    status: str = "current"
    basis_changed: bool | None = None
    chapter_from: int | None = None
    chapter_to: int | None = None
    run_id: str | None = None
    subject_id: str | None = None
    source: str | None = None
    q: str | None = None
    include_l1: bool = False
    sort: str | None = None


def _chunks(ids: list[str]) -> list[list[str]]:
    return [ids[start : start + _CHUNK] for start in range(0, len(ids), _CHUNK)]


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _conditions(book_id: str, flt: EvidenceFilter) -> list[Any]:
    conds: list[Any] = [EvidenceRow.book_id == book_id, EvidenceRow.status == flt.status]
    if flt.claim_types:
        conds.append(EvidenceRow.claim_type.in_(flt.claim_types))
    if not flt.include_l1:
        conds.append(EvidenceRow.level >= 2)
    if flt.min_level is not None:
        conds.append(EvidenceRow.level >= flt.min_level)
    if flt.max_level is not None:
        conds.append(EvidenceRow.level <= flt.max_level)
    if flt.review_status is None:
        conds.append(EvidenceRow.review_status != "rejected")
    else:
        conds.append(EvidenceRow.review_status == flt.review_status)
    if flt.basis_changed is not None:
        conds.append(EvidenceRow.basis_changed.is_(flt.basis_changed))
    if flt.chapter_from is not None:
        conds.append(EvidenceRow.discourse_chapter >= flt.chapter_from)
    if flt.chapter_to is not None:
        conds.append(EvidenceRow.discourse_chapter <= flt.chapter_to)
    if flt.run_id is not None:
        conds.append(EvidenceRow.run_id == flt.run_id)
    if flt.source is not None:
        conds.append(EvidenceRow.source == flt.source)
    if flt.subject_id is not None:
        conds.append(
            EvidenceRow.id.in_(
                select(EvidenceSubject.evidence_id).where(
                    EvidenceSubject.subject_id == flt.subject_id
                )
            )
        )
    return conds


def _order(stmt: Select, sort: str | None) -> Select:
    tie = (EvidenceRow.created_at, EvidenceRow.id)
    if sort == "level":
        return stmt.order_by(EvidenceRow.level.desc(), *tie)
    if sort == "confidence":
        return stmt.order_by(EvidenceRow.confidence.desc(), *tie)
    if sort == "createdAt":
        return stmt.order_by(EvidenceRow.created_at.desc(), EvidenceRow.id)
    # chapter（預設）：沒有章號的（書層級）排最後。
    return stmt.order_by(
        EvidenceRow.discourse_chapter.is_(None), EvidenceRow.discourse_chapter, *tie
    )


async def _fts_ranked_ids(session: AsyncSession, book_id: str, q: str) -> list[str]:
    """Evidence ids matching ``q`` as one phrase, best match first."""
    # 整串包成一個 phrase，使用者輸入的 FTS5 語法字元就不會被解讀。
    phrase = '"' + q.replace('"', '""') + '"'
    rows = await session.execute(
        text(
            "SELECT evidence_id FROM evidence_fts "
            "WHERE evidence_fts MATCH :phrase AND book_id = :book_id ORDER BY rank"
        ),
        {"phrase": phrase, "book_id": book_id},
    )
    return [row[0] for row in rows]


async def list_evidence(
    session: AsyncSession, book_id: str, flt: EvidenceFilter, *, offset: int, limit: int
) -> tuple[list[EvidenceRow], int]:
    """One page of evidence rows and the total after filtering."""
    conds = _conditions(book_id, flt)
    q = (flt.q or "").strip()

    if q and len(q) >= FTS_MIN_CHARS:
        ranked = await _fts_ranked_ids(session, book_id, q)
        rank = {evidence_id: index for index, evidence_id in enumerate(ranked)}
        kept: list[str] = []
        for chunk in _chunks(ranked):
            kept.extend(
                await session.scalars(
                    select(EvidenceRow.id).where(*conds, EvidenceRow.id.in_(chunk))
                )
            )
        if flt.sort is None:  # 沒指定排序時依 FTS rank
            kept.sort(key=rank.__getitem__)
            page_ids = kept[offset : offset + limit]
            rows = list(
                await session.scalars(select(EvidenceRow).where(EvidenceRow.id.in_(page_ids)))
            )
            rows.sort(key=lambda row: rank[row.id])
            return rows, len(kept)
        conds.append(EvidenceRow.id.in_(kept))
    elif q:
        pattern = _like_pattern(q)
        conds.append(
            or_(
                EvidenceRow.summary.like(pattern, escape="\\"),
                EvidenceRow.id.in_(
                    select(EvidenceQuote.evidence_id).where(
                        EvidenceQuote.text.like(pattern, escape="\\")
                    )
                ),
            )
        )

    total = await session.scalar(select(func.count()).select_from(EvidenceRow).where(*conds))
    stmt = _order(select(EvidenceRow).where(*conds), flt.sort).offset(offset).limit(limit)
    return list(await session.scalars(stmt)), total or 0


@dataclass
class _Parts:
    subjects: dict[str, list[SubjectOut]] = field(default_factory=dict)
    quotes: dict[str, list[QuoteOut]] = field(default_factory=dict)
    links: dict[str, list[str]] = field(default_factory=dict)
    exts: dict[str, list[GenreExtOut]] = field(default_factory=dict)
    content: dict[str, dict[str, Any]] = field(default_factory=dict)
    run_ids: set[str] = field(default_factory=set)


async def _load_parts(
    session: AsyncSession, rows: list[EvidenceRow], *, content: bool, detail: bool
) -> _Parts:
    parts = _Parts()
    ids = [row.id for row in rows]
    for chunk in _chunks(ids):
        for s in await session.scalars(
            select(EvidenceSubject)
            .where(EvidenceSubject.evidence_id.in_(chunk))
            .order_by(EvidenceSubject.role, EvidenceSubject.subject_id)
        ):
            parts.subjects.setdefault(s.evidence_id, []).append(
                SubjectOut(subject_id=s.subject_id, role=s.role)
            )
        for q in await session.scalars(
            select(EvidenceQuote)
            .where(EvidenceQuote.evidence_id.in_(chunk))
            .order_by(EvidenceQuote.evidence_id, EvidenceQuote.seq)
        ):
            parts.quotes.setdefault(q.evidence_id, []).append(
                QuoteOut(
                    seq=q.seq,
                    paragraph_id=q.paragraph_id,
                    start=q.start,
                    end=q.end,
                    text=q.text,
                    verified=q.verified,
                )
            )
        if not detail:
            continue
        for link in await session.scalars(
            select(EvidenceLink)
            .where(EvidenceLink.evidence_id.in_(chunk))
            .order_by(EvidenceLink.upstream_id)
        ):
            parts.links.setdefault(link.evidence_id, []).append(link.upstream_id)
        for ext in await session.scalars(
            select(EvidenceGenreExt).where(EvidenceGenreExt.evidence_id.in_(chunk))
        ):
            parts.exts.setdefault(ext.evidence_id, []).append(
                GenreExtOut(
                    genre=ext.genre,
                    system_tag=ext.system_tag or None,
                    data=camelize(ext.data_json, RAW_KEY_FIELDS),
                )
            )
    if content:
        by_type: dict[str, list[str]] = {}
        for row in rows:
            by_type.setdefault(row.claim_type, []).append(row.id)
        for claim_type, type_ids in by_type.items():
            table = CONTENT_TABLES[claim_type]
            for chunk in _chunks(type_ids):
                for r in (
                    await session.execute(select(table).where(table.c.evidence_id.in_(chunk)))
                ).mappings():
                    parts.content[r["evidence_id"]] = content_out(dict(r))
    if detail:
        upstream = sorted({up for ups in parts.links.values() for up in ups})
        for chunk in _chunks(upstream):
            parts.run_ids.update(await session.scalars(select(Run.id).where(Run.id.in_(chunk))))
    return parts


def content_out(row: dict[str, Any]) -> dict[str, Any]:
    """Content row → API form: drop `evidence_id`, drop an empty `raw_label`, camelCase keys."""
    row = {key: value for key, value in row.items() if key != "evidence_id"}
    if row.get("raw_label") is None:
        row.pop("raw_label", None)
    return camelize(row, RAW_KEY_FIELDS)


def _shell(row: EvidenceRow, parts: _Parts) -> dict[str, Any]:
    return {
        "id": row.id,
        "book_id": row.book_id,
        "claim_type": row.claim_type,
        "level": row.level,
        "summary": row.summary,
        "discourse_chapter": row.discourse_chapter,
        "discourse_paragraph_id": row.discourse_paragraph_id,
        "story_rank": row.story_rank,
        "known_by": row.known_by,
        "source": row.source,
        "confidence": row.confidence,
        "review_status": row.review_status,
        "status": row.status,
        "basis_changed": row.basis_changed,
        "basis_changed_at": row.basis_changed_at,
        "run_id": row.run_id,
        "produced_via": row.produced_via,
        "agent_backend": row.agent_backend,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "subjects": parts.subjects.get(row.id, []),
    }


def first_quote(quotes: list[QuoteOut]) -> str | None:
    return quotes[0].text[:FIRST_QUOTE_CHARS] if quotes else None


async def to_list_items(
    session: AsyncSession, rows: list[EvidenceRow], *, with_content: bool = False
) -> list[EvidenceListItem]:
    parts = await _load_parts(session, rows, content=with_content, detail=False)
    items = []
    for row in rows:
        quotes = parts.quotes.get(row.id, [])
        items.append(
            EvidenceListItem(
                **_shell(row, parts),
                quote_count=len(quotes),
                first_quote=first_quote(quotes),
                content=parts.content.get(row.id, {}) if with_content else None,
            )
        )
    return items


async def to_evidence(session: AsyncSession, rows: list[EvidenceRow]) -> list[Evidence]:
    """Full `Evidence` objects (04 §2.1), in the order of ``rows``."""
    parts = await _load_parts(session, rows, content=True, detail=True)
    return [
        Evidence(
            **_shell(row, parts),
            derived_from=[
                UpstreamOut(
                    upstream_id=upstream_id,
                    upstream_kind="run" if upstream_id in parts.run_ids else "evidence",
                )
                for upstream_id in parts.links.get(row.id, [])
            ],
            quotes=parts.quotes.get(row.id, []),
            genre_ext=parts.exts.get(row.id, []),
            content=parts.content.get(row.id, {}),
        )
        for row in rows
    ]
