"""Read-only evidence access for methods (docs/spec/03 §6; CLAUDE.md 紅線).

方法只讀證據庫：這裡只回 `status=current` 且未被拒絕的證據，附內容、主體、引文與上游；
不接受 session 以外的來源，也**不提供段落原文**——要原文只能看上游證據的 `evidence_quote`。
讀取限制在方法宣告的 `requires`（與 `preconditions`）型別內，並記下讀過的 id。
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.tables import (
    Evidence,
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    EvidenceSubject,
)

_CHUNK = 500  # SQLite 綁定參數上限


class UndeclaredReadError(PermissionError):
    """A method tried to read a claim type it did not declare in `requires`."""


@dataclass(frozen=True)
class QuoteView:
    paragraph_id: str
    text: str
    verified: bool


@dataclass(frozen=True)
class EvidenceView:
    id: str
    claim_type: str
    level: int
    summary: str
    confidence: float
    chapter: int | None
    story_rank: float | None
    known_by: dict[str, Any] | None
    content: dict[str, Any]
    subjects: tuple[tuple[str, str], ...] = ()  # (subject_id, role)
    quotes: tuple[QuoteView, ...] = ()
    derived_from: tuple[str, ...] = ()
    genre_ext: dict[str, dict[str, Any]] = field(default_factory=dict)  # genre → data

    def subject_ids(self, role: str | None = None) -> list[str]:
        return [sid for sid, r in self.subjects if role is None or r == role]


def _chunks(ids: list[str]) -> Iterator[list[str]]:
    for start in range(0, len(ids), _CHUNK):
        yield ids[start : start + _CHUNK]


class EvidenceReader:
    def __init__(self, session: AsyncSession, book_id: str, allowed: Iterable[str]) -> None:
        self._session = session
        self._book_id = book_id
        self._allowed = frozenset(allowed)
        self._read: dict[str, None] = {}  # 有序集合

    @property
    def read_ids(self) -> list[str]:
        return list(self._read)

    def _guard(self, claim_type: str) -> None:
        if claim_type not in self._allowed:
            raise UndeclaredReadError(
                f"'{claim_type}' is not declared in this method's requires "
                f"(declared: {', '.join(sorted(self._allowed)) or 'none'})"
            )

    def _current(self, claim_type: str):
        return select(Evidence).where(
            Evidence.book_id == self._book_id,
            Evidence.claim_type == claim_type,
            Evidence.status == "current",
            Evidence.review_status != "rejected",
        )

    async def count(self, claim_type: str) -> int:
        """Number of current evidence of the type. Does not count as having read them."""
        self._guard(claim_type)
        query = select(func.count()).select_from(self._current(claim_type).subquery())
        return int(await self._session.scalar(query) or 0)

    async def list(
        self,
        claim_type: str,
        *,
        subject_id: str | None = None,
        role: str | None = None,
        chapter: int | None = None,
    ) -> list[EvidenceView]:
        """Current evidence of one type, oldest first; optionally by subject and/or chapter."""
        self._guard(claim_type)
        query = self._current(claim_type)
        if subject_id is not None:
            matched = select(EvidenceSubject.evidence_id).where(
                EvidenceSubject.subject_id == subject_id
            )
            if role is not None:
                matched = matched.where(EvidenceSubject.role == role)
            query = query.where(Evidence.id.in_(matched))
        if chapter is not None:
            query = query.where(Evidence.discourse_chapter == chapter)
        rows = list(await self._session.scalars(query.order_by(Evidence.created_at, Evidence.id)))
        return await self._views(claim_type, rows)

    async def get(self, evidence_id: str) -> EvidenceView | None:
        """One current evidence by id; None if missing, not current or of another book."""
        row = await self._session.get(Evidence, evidence_id)
        if row is None or row.book_id != self._book_id:
            return None
        self._guard(row.claim_type)
        if row.status != "current" or row.review_status == "rejected":
            return None
        return (await self._views(row.claim_type, [row]))[0]

    async def _views(self, claim_type: str, rows: list[Evidence]) -> list[EvidenceView]:
        ids = [row.id for row in rows]
        content: dict[str, dict[str, Any]] = {}
        subjects: dict[str, list[tuple[str, str]]] = {}
        quotes: dict[str, list[QuoteView]] = {}
        links: dict[str, list[str]] = {}
        exts: dict[str, dict[str, dict[str, Any]]] = {}
        table = CONTENT_TABLES[claim_type]
        for chunk in _chunks(ids):
            for r in (
                await self._session.execute(select(table).where(table.c.evidence_id.in_(chunk)))
            ).mappings():
                content[r["evidence_id"]] = {k: v for k, v in r.items() if k != "evidence_id"}
            for s in await self._session.scalars(
                select(EvidenceSubject).where(EvidenceSubject.evidence_id.in_(chunk))
            ):
                subjects.setdefault(s.evidence_id, []).append((s.subject_id, s.role))
            for q in await self._session.scalars(
                select(EvidenceQuote)
                .where(EvidenceQuote.evidence_id.in_(chunk))
                .order_by(EvidenceQuote.evidence_id, EvidenceQuote.seq)
            ):
                quotes.setdefault(q.evidence_id, []).append(
                    QuoteView(q.paragraph_id, q.text, q.verified)
                )
            for link in await self._session.scalars(
                select(EvidenceLink).where(EvidenceLink.evidence_id.in_(chunk))
            ):
                links.setdefault(link.evidence_id, []).append(link.upstream_id)
            for e in await self._session.scalars(
                select(EvidenceGenreExt).where(EvidenceGenreExt.evidence_id.in_(chunk))
            ):
                exts.setdefault(e.evidence_id, {})[e.genre] = e.data_json
        views = [
            EvidenceView(
                id=row.id,
                claim_type=row.claim_type,
                level=row.level,
                summary=row.summary,
                confidence=row.confidence,
                chapter=row.discourse_chapter,
                story_rank=row.story_rank,
                known_by=row.known_by,
                content=content.get(row.id, {}),
                subjects=tuple(subjects.get(row.id, ())),
                quotes=tuple(quotes.get(row.id, ())),
                derived_from=tuple(sorted(links.get(row.id, ()))),
                genre_ext=exts.get(row.id, {}),
            )
            for row in rows
        ]
        self._read.update(dict.fromkeys(v.id for v in views))
        return views
