"""`Evidence` and its list form (docs/spec/04 §2.1), plus trace and paragraph shapes (§4.5)."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from storysphere.api.schemas.common import ApiModel, UtcDatetime


class SubjectOut(ApiModel):
    subject_id: str
    role: str


class UpstreamOut(ApiModel):
    upstream_id: str
    upstream_kind: str  # evidence／run（推得：id 在哪張表）


class QuoteOut(ApiModel):
    seq: int
    paragraph_id: str
    start: int | None
    end: int | None
    text: str
    verified: bool


class GenreExtOut(ApiModel):
    genre: str
    system_tag: str | None
    data: dict[str, Any]  # 01 §6.1／§6.2 的擴充欄位，key 轉 camelCase


class _Shell(ApiModel):
    """外殼欄位（01 §3），列表與單筆共用。"""

    id: str
    book_id: str
    claim_type: str
    level: int
    summary: str
    discourse_chapter: int | None
    discourse_paragraph_id: str | None
    story_rank: float | None
    known_by: dict[str, Any] | None  # {reader, characters[]}
    source: str
    confidence: float
    review_status: str
    status: str
    basis_changed: bool
    basis_changed_at: UtcDatetime | None
    run_id: str | None
    produced_via: str
    agent_backend: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    subjects: list[SubjectOut]


class EvidenceListItem(_Shell):
    quote_count: int
    first_quote: str | None  # 第一段引文，截短 120 字
    # 帶 withContent=true 才有；內容欄位見 01 §6，key 轉 camelCase。
    content: dict[str, Any] | None = None


class Evidence(_Shell):
    derived_from: list[UpstreamOut]
    quotes: list[QuoteOut]
    genre_ext: list[GenreExtOut]
    content: dict[str, Any]


class EvidenceEditOut(ApiModel):
    edited_at: UtcDatetime
    action: str  # modify／reject
    reason: str | None
    before: dict[str, Any] | None


class EvidenceDetail(Evidence):
    """N-05b。"""

    edits: list[EvidenceEditOut]


class EvidencePage(ApiModel):
    items: list[EvidenceListItem]
    next_cursor: str | None
    total: int


class TraceNode(ApiModel):
    id: str
    kind: str  # evidence／run
    # evidence 節點
    claim_type: str | None = None
    level: int | None = None
    summary: str | None = None
    review_status: str | None = None
    basis_changed: bool | None = None
    discourse_chapter: int | None = None
    first_quote: str | None = None
    # run 節點
    ref_id: str | None = None
    code: str | None = None


class TraceEdge(ApiModel):
    """`from` 是下游（引用者），`to` 是它的上游。"""

    from_: str = Field(alias="from")
    to: str


class Trace(ApiModel):
    root: str
    nodes: list[TraceNode]
    edges: list[TraceEdge]


class ParagraphOut(ApiModel):
    id: str
    chapter_number: int
    chapter_title: str | None
    position: int
    text: str
    role: str
    title_span: list[int] | None


class HighlightOut(ApiModel):
    evidence_id: str
    seq: int
    start: int | None
    end: int | None
    verified: bool


class ParagraphView(ApiModel):
    """N-05d。"""

    paragraph: ParagraphOut
    before: list[ParagraphOut]
    after: list[ParagraphOut]
    highlights: list[HighlightOut]


class Propagation(ApiModel):
    evidence_count: int  # 被標「依據已變動」的下游證據（含筆記）
    note_count: int


class ReviewResult(ApiModel):
    """N-05e。"""

    evidence: Evidence
    propagation: Propagation | None = None
