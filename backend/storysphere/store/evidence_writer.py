"""Evidence write path: the only place that fills shell system fields.

docs/spec/01 §3–§4。呼叫端（入庫、方法、API、MCP）只給 `EvidenceDraft`；層級、來源、
run、產生途徑等系統欄位由這裡依 `WriteContext` 與 `derived_from` 推得，不接受外部指定。
內容欄位依 `claim_type` 的 Pydantic model 驗證後寫進 `ev_<claim_type>`；引文是否對得上
原文也在這裡判定，呼叫端不能自己宣稱已驗證。
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.domain.evidence import CONTENT_MODELS, GENRE_EXT_MODELS, EvidenceContent
from storysphere.store.content_tables import insert_content
from storysphere.store.quotes import locate_quote
from storysphere.store.tables import (
    Evidence,
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    EvidenceSubject,
    Run,
)

Source = Literal["extraction", "method", "user", "agent"]
ProducedVia = Literal["pipeline", "ui", "agent"]
ReviewStatus = Literal["pending", "approved", "modified", "rejected"]

# docs/spec/04 §1.5：寫入請求不得出現的 key。API 用 camelCase、MCP 用 snake_case，兩種都擋。
_SYSTEM_FIELDS_SNAKE = (
    "id",
    "book_id",
    "claim_type",
    "level",
    "source",
    "run_id",
    "produced_via",
    "agent_backend",
    "review_status",
    "status",
    "basis_changed",
    "basis_changed_at",
    "derived_from",
    "methodology_trace",
    "methodology_run_id",
    "created_at",
    "updated_at",
)


def _to_camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


SYSTEM_FIELDS: frozenset[str] = frozenset(_SYSTEM_FIELDS_SNAKE) | frozenset(
    _to_camel(name) for name in _SYSTEM_FIELDS_SNAKE
)


class EvidenceWriteError(ValueError):
    """Base class for rejected writes."""


class SystemFieldForbiddenError(EvidenceWriteError):
    """A write payload carried system fields (API code `system_field_forbidden`)."""

    def __init__(self, fields: Iterable[str]) -> None:
        self.fields = sorted(fields)
        super().__init__(f"System fields are not writable: {', '.join(self.fields)}")


class UnknownUpstreamError(EvidenceWriteError):
    """`derived_from` names an id that is neither evidence nor a run of this book."""

    def __init__(self, ids: Iterable[str]) -> None:
        self.ids = sorted(ids)
        super().__init__(f"Unknown upstream ids: {', '.join(self.ids)}")


class UnknownClaimTypeError(EvidenceWriteError):
    """The claim type (or a genre extension for it) has no declared model."""


class ContentValidationError(EvidenceWriteError):
    """Content or genre-extension fields do not match the declared model."""


class NoVerifiedQuoteError(EvidenceWriteError):
    """Level 1 evidence without any quote found in the source text is not stored (01 §3)."""


# 引文對不上原文時，證據的信心打折（01 §3）。
UNVERIFIED_QUOTE_PENALTY = 0.5


class ParagraphSource(Protocol):
    """Where the writer reads paragraph text from to verify quotes."""

    async def get_texts(self, paragraph_ids: Iterable[str]) -> dict[str, str]:
        """Return {paragraph_id: text} for the ids that exist."""
        ...


def assert_no_system_fields(payload: Mapping[str, Any]) -> None:
    """Reject (not silently drop) external write payloads that carry system fields."""
    offending = SYSTEM_FIELDS & payload.keys()
    if offending:
        raise SystemFieldForbiddenError(offending)


class _Draft(BaseModel):
    # 多出來的 key（含系統欄位）一律拒絕，不默默忽略。
    model_config = ConfigDict(extra="forbid")


class SubjectRef(_Draft):
    subject_id: str
    role: str


class QuoteDraft(_Draft):
    # 偏移與 verified 由寫入層比對段落原文後填入，不由呼叫端提供。
    paragraph_id: str
    text: str


class GenreExtDraft(_Draft):
    genre: str
    system_tag: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


class KnownBy(_Draft):
    reader: bool | None = None
    characters: list[str] = Field(default_factory=list)


class EvidenceDraft(_Draft):
    """What a producer may say about a piece of evidence. No system fields."""

    claim_type: str
    summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    content: dict[str, Any] = Field(default_factory=dict)
    derived_from: list[str] = Field(default_factory=list)
    subjects: list[SubjectRef] = Field(default_factory=list)
    quotes: list[QuoteDraft] = Field(default_factory=list)
    genre_ext: list[GenreExtDraft] = Field(default_factory=list)
    discourse_chapter: int | None = None
    discourse_paragraph_id: str | None = None
    story_rank: float | None = None
    known_by: KnownBy | None = None


@dataclass(frozen=True)
class WriteContext:
    """Who is writing. Built by the backend (pipeline, run engine, gateway), never by a caller."""

    book_id: str
    source: Source
    produced_via: ProducedVia
    run_id: str | None = None
    agent_backend: str | None = None
    review_status: ReviewStatus = "pending"


async def _resolve_level(session: AsyncSession, ctx: WriteContext, draft: EvidenceDraft) -> int:
    """抽取＝1；其他＝derived_from 中最高層級＋1（01 §3）。"""
    upstream_ids = set(draft.derived_from)
    levels: dict[str, int] = {}
    if upstream_ids:
        rows = await session.execute(
            select(Evidence.id, Evidence.level).where(
                Evidence.id.in_(upstream_ids), Evidence.book_id == ctx.book_id
            )
        )
        levels = {row.id: row.level for row in rows}
        unresolved = upstream_ids - levels.keys()
        if unresolved:
            # 上游也可以是 run（01 §2 evidence_link）。
            runs = await session.execute(
                select(Run.id).where(Run.id.in_(unresolved), Run.book_id == ctx.book_id)
            )
            unresolved -= {row.id for row in runs}
        if unresolved:
            raise UnknownUpstreamError(unresolved)

    if ctx.source == "extraction":
        if levels:
            raise EvidenceWriteError("Extracted evidence cannot derive from other evidence.")
        return 1
    if not levels:
        raise EvidenceWriteError("Non-extraction evidence must derive from at least one evidence.")
    return max(levels.values()) + 1


def _validate_content(draft: EvidenceDraft) -> EvidenceContent:
    model = CONTENT_MODELS.get(draft.claim_type)
    if model is None:
        raise UnknownClaimTypeError(f"Claim type '{draft.claim_type}' is not declared.")
    try:
        return model.model_validate(draft.content)
    except ValidationError as exc:
        raise ContentValidationError(f"Invalid {draft.claim_type} content: {exc}") from exc


def _validate_genre_ext(draft: EvidenceDraft) -> list[tuple[GenreExtDraft, dict[str, Any]]]:
    validated = []
    for ext in draft.genre_ext:
        model = GENRE_EXT_MODELS.get((ext.genre, draft.claim_type))
        if model is None:
            raise UnknownClaimTypeError(
                f"No '{ext.genre}' extension is declared for '{draft.claim_type}'."
            )
        try:
            validated.append((ext, model.model_validate(ext.data).model_dump(mode="json")))
        except ValidationError as exc:
            raise ContentValidationError(
                f"Invalid {ext.genre} extension for {draft.claim_type}: {exc}"
            ) from exc
    return validated


async def _verify_quotes(
    draft: EvidenceDraft, paragraphs: ParagraphSource | None
) -> list[EvidenceQuote]:
    """比對每段引文與段落原文，回傳尚未掛上 evidence_id 的引文列。"""
    texts: dict[str, str] = {}
    if paragraphs is not None and draft.quotes:
        texts = await paragraphs.get_texts({quote.paragraph_id for quote in draft.quotes})
    rows = []
    for seq, quote in enumerate(draft.quotes, start=1):
        paragraph = texts.get(quote.paragraph_id)
        span = locate_quote(quote.text, paragraph) if paragraph is not None else None
        rows.append(
            EvidenceQuote(
                seq=seq,
                paragraph_id=quote.paragraph_id,
                start=span.start if span else None,
                end=span.end if span else None,
                text=quote.text,
                verified=span is not None,
            )
        )
    return rows


async def write_evidence(
    session: AsyncSession,
    ctx: WriteContext,
    draft: EvidenceDraft,
    paragraphs: ParagraphSource | None = None,
) -> Evidence:
    """Insert one evidence with its content, subjects, links, quotes and genre extensions.

    只 flush、不 commit：交易邊界由呼叫端決定（一個 run 的產出要一起成功或一起失敗）。
    """
    content = _validate_content(draft)
    genre_ext = _validate_genre_ext(draft)
    level = await _resolve_level(session, ctx, draft)
    if level == 1 and draft.story_rank is not None:
        # 第 1 層的故事時序一律由 NS2 的 anachrony 提供（01 §3）。
        raise EvidenceWriteError("Level 1 evidence cannot carry story_rank.")
    if level > 1 and draft.quotes:
        # 第 2 層以上的引文來自上游證據，不另抽（01 §3）。
        raise EvidenceWriteError("Only level 1 evidence carries its own quotes.")

    quotes = await _verify_quotes(draft, paragraphs)
    confidence = draft.confidence
    if level == 1 and not any(quote.verified for quote in quotes):
        raise NoVerifiedQuoteError(
            f"Level 1 {draft.claim_type} has no quote found in the source text."
        )
    if any(not quote.verified for quote in quotes):
        confidence *= UNVERIFIED_QUOTE_PENALTY

    evidence = Evidence(
        book_id=ctx.book_id,
        claim_type=draft.claim_type,
        level=level,
        summary=draft.summary,
        discourse_chapter=draft.discourse_chapter,
        discourse_paragraph_id=draft.discourse_paragraph_id,
        story_rank=draft.story_rank,
        known_by=draft.known_by.model_dump() if draft.known_by else None,
        source=ctx.source,
        confidence=confidence,
        review_status=ctx.review_status,
        run_id=ctx.run_id,
        produced_via=ctx.produced_via,
        agent_backend=ctx.agent_backend,
    )
    session.add(evidence)
    await session.flush()  # 取得 id，也讓 FTS trigger 先建好列

    await insert_content(session, evidence.id, content)
    session.add_all(
        EvidenceSubject(evidence_id=evidence.id, subject_id=ref.subject_id, role=ref.role)
        for ref in {(s.subject_id, s.role): s for s in draft.subjects}.values()
    )
    session.add_all(
        EvidenceLink(evidence_id=evidence.id, upstream_id=upstream_id)
        for upstream_id in dict.fromkeys(draft.derived_from)
    )
    for quote in quotes:
        quote.evidence_id = evidence.id
    session.add_all(quotes)
    session.add_all(
        EvidenceGenreExt(
            evidence_id=evidence.id, genre=ext.genre, system_tag=ext.system_tag, data_json=data
        )
        for ext, data in genre_ext
    )
    await session.flush()
    return evidence
