"""Response/request schemas for book-centric endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# ── Shared config ────────────────────────────────────────────────────────────

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


# ── Book list / detail ───────────────────────────────────────────────────────


class PipelineStatusResponse(BaseModel):
    model_config = _CAMEL

    summarization: str = "pending"
    feature_extraction: str = "pending"
    knowledge_graph: str = "pending"
    symbol_discovery: str = "pending"


class BookResponse(BaseModel):
    model_config = _CAMEL

    id: str
    title: str
    author: str | None = None
    status: str = "ready"
    chapter_count: int = 0
    entity_count: int | None = None
    uploaded_at: str = ""
    last_opened_at: str | None = None
    pipeline_status: PipelineStatusResponse = PipelineStatusResponse()


class EntityStats(BaseModel):
    model_config = _CAMEL

    character: int = 0
    location: int = 0
    organization: int = 0
    object: int = 0
    concept: int = 0
    other: int = 0


class BookDetailResponse(BookResponse):
    summary: str | None = None
    chunk_count: int = 0
    entity_count: int = 0
    relation_count: int = 0
    event_count: int = 0
    entity_stats: EntityStats = EntityStats()
    keywords: dict[str, float] | None = None


# ── Chapter review ───────────────────────────────────────────────────────────


class ReviewParagraphResponse(BaseModel):
    model_config = _CAMEL

    paragraph_index: int
    text: str
    role: str = "body"
    title_span: list[int] | None = None  # [start, end] char offsets, or null
    sentences: list[str]


class ReviewChapterResponse(BaseModel):
    model_config = _CAMEL

    chapter_idx: int
    title: str | None = None
    role: str = "body"
    paragraphs: list[ReviewParagraphResponse]


class ReviewDataResponse(BaseModel):
    model_config = _CAMEL

    chapters: list[ReviewChapterResponse]


class ReviewChapterInput(BaseModel):
    model_config = _CAMEL

    title: str = ""
    role: str = "body"
    start_paragraph_index: int


class ReviewSubmitRequest(BaseModel):
    model_config = _CAMEL

    # None (field omitted) = accept the detected structure as-is: the pipeline
    # resumes without rebuilding chapters, and role_overrides/paragraph_splits
    # are ignored. Spares the "接受系統判斷" path the round-trip of the full
    # book text.
    chapters: list[ReviewChapterInput] | None = None
    role_overrides: dict[str, str] = {}  # str(globalIdx) → role value
    # str(pre-split globalIdx) → ascending char offsets to split that paragraph
    # at. Splits are applied first; chapters/role_overrides use post-split
    # indices. Optional so old payloads keep working unchanged.
    paragraph_splits: dict[str, list[int]] = {}


class SuggestRolesResponse(BaseModel):
    """LLM-proposed front/back matter boundaries for the review UI to split on.

    ``frontMatterEnd`` is exclusive, ``backMatterStart`` inclusive, both in
    book-global paragraph index space (matching review-data). ``null`` on a side
    means no matter found there.
    """

    model_config = _CAMEL

    front_matter_end: int | None = None
    back_matter_start: int | None = None
    front_role: str | None = None
    back_role: str | None = None


class TocEntry(BaseModel):
    """One entry from the book's declared table of contents (display-only).

    ``level`` is 0 for a top-level chapter, deeper for nested part/section.
    ``isBody`` is false for front/back matter (序/跋/目錄/…) — the UI badges
    those "非正文" and excludes them from the chapter-count comparison.
    """

    model_config = _CAMEL

    title: str
    page: int | None = None
    level: int = 0
    is_body: bool = True


class ParseTocRequest(BaseModel):
    """Body for POST /books/:bookId/parse-toc (目錄對照提示).

    ``tocText`` is the reviewer's *currently edited* table-of-contents text
    (concatenated paragraphs of the chapters they have marked ``toc`` in the
    review UI). When provided, the backend parses it instead of the stale
    detected TOC in the persisted document, so re-parsing reflects live edits.
    When omitted/empty, the backend falls back to the persisted document.
    """

    model_config = _CAMEL

    toc_text: str | None = None


class ParseTocResponse(BaseModel):
    """LLM-parsed table-of-contents entries for the review cross-check drawer.

    Ordered as declared in the book. Empty ``entries`` = no TOC chapter, or the
    detected block could not be parsed (the UI shows a friendly fallback).
    """

    model_config = _CAMEL

    entries: list[TocEntry] = []


# ── Chapter / chunk ──────────────────────────────────────────────────────────


class TopEntity(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str


class ChapterResponse(BaseModel):
    model_config = _CAMEL

    id: str
    book_id: str
    title: str
    order: int
    chunk_count: int = 0
    entity_count: int = 0
    summary: str | None = None
    top_entities: list[TopEntity] | None = None
    keywords: dict[str, float] | None = None


class SegmentEntity(BaseModel):
    model_config = _CAMEL

    type: str
    entity_id: str
    name: str


class Segment(BaseModel):
    model_config = _CAMEL

    text: str
    entity: SegmentEntity | None = None




# ── Graph ────────────────────────────────────────────────────────────────────








# ── Timeline config ──────────────────────────────────────────────────────────






class TimelineDetectionResponse(BaseModel):
    model_config = _CAMEL

    book_id: str
    chapter_count: int
    event_count: int
    ranked_event_count: int
    chapter_mode_viable: bool
    story_mode_viable: bool


# ── Event detail ─────────────────────────────────────────────────────────────


class EventParticipant(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str


class EventLocation(BaseModel):
    model_config = _CAMEL

    id: str
    name: str


class EventDetailResponse(BaseModel):
    model_config = _CAMEL

    id: str
    title: str
    event_type: str
    description: str
    chapter: int
    significance: str | None = None
    consequences: list[str] = []
    participants: list[EventParticipant] = []
    location: EventLocation | None = None


# ── Event analysis (structured response instead of hand-rolled dict) ─────────


class EepParticipantRole(BaseModel):
    model_config = _CAMEL

    entity_id: str
    entity_name: str
    role: str
    impact_description: str


class EepResponse(BaseModel):
    model_config = _CAMEL

    state_before: str
    state_after: str
    causal_factors: list[str]
    prior_event_ids: list[str]
    subsequent_event_ids: list[str]
    participant_roles: list[EepParticipantRole]
    consequences: list[str]
    structural_role: str
    event_importance: str
    thematic_significance: str
    text_evidence: list[str]
    key_quotes: list[str]
    top_terms: dict[str, float]


class CausalityResponse(BaseModel):
    model_config = _CAMEL

    root_cause: str
    causal_chain: list[str]
    trigger_event_ids: list[str]
    chain_summary: str


class ImpactResponse(BaseModel):
    model_config = _CAMEL

    affected_participant_ids: list[str]
    participant_impacts: list[str]
    relation_changes: list[str]
    subsequent_event_ids: list[str]
    impact_summary: str


class EventAnalysisFullResponse(BaseModel):
    model_config = _CAMEL

    event_id: str
    title: str
    eep: EepResponse
    causality: CausalityResponse
    impact: ImpactResponse
    summary: dict[str, str]
    status: str = "complete"            # "complete" | "partial"
    failed_parts: list[str] = []
    analyzed_at: str | None = None
    chapter: int | None = None
    chunk: int | None = None
    narrative_mode: str | None = None


# ── Analysis list ────────────────────────────────────────────────────────────


class UnanalyzedEntity(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str
    chapter_count: int = 0  # deprecated: always 0, kept for backward compat
    mention_count: int = 0
    chapter: int | None = None
    narrative_mode: str | None = None
    importance: str | None = None


class AnalysisItem(BaseModel):
    model_config = _CAMEL

    id: str
    entity_id: str
    section: str
    title: str
    archetypes: dict[str, str] = {}
    chapter_count: int = 0  # deprecated: always 0, kept for backward compat
    mention_count: int = 0
    content: str = ""
    status: str = "complete"            # "complete" | "partial"
    generated_at: str = ""
    chapter: int | None = None
    narrative_mode: str | None = None
    importance: str | None = None


class AnalysisListResponse(BaseModel):
    model_config = _CAMEL

    analyzed: list[AnalysisItem] = []
    unanalyzed: list[UnanalyzedEntity] = []


class EntityAnalysisResponse(BaseModel):
    model_config = _CAMEL

    entity_id: str
    entity_name: str
    content: str
    generated_at: str


class CepResponse(BaseModel):
    model_config = _CAMEL

    actions: list[str] = []
    traits: list[str] = []
    relations: list[dict[str, str]] = []
    key_events: list[dict[str, Any]] = []
    quotes: list[str] = []
    top_terms: dict[str, float] = {}


class ArchetypeDetailResponse(BaseModel):
    model_config = _CAMEL

    framework: str
    primary: str
    secondary: str | None = None
    confidence: float = 0.0
    evidence: list[str] = []


class ArcSegmentResponse(BaseModel):
    model_config = _CAMEL

    chapter_range: str
    phase: str
    description: str


class CharacterAnalysisDetailResponse(BaseModel):
    model_config = _CAMEL

    entity_id: str
    entity_name: str
    profile_summary: str
    archetypes: list[ArchetypeDetailResponse] = []
    cep: CepResponse | None = None
    arc: list[ArcSegmentResponse] = []
    status: str = "complete"            # "complete" | "partial"
    failed_parts: list[str] = []
    generated_at: str


class AnalyzeTriggerRequest(BaseModel):
    model_config = _CAMEL

    mode: Literal["full", "retryFailed"] = "full"


class BatchAnalysisRequest(BaseModel):
    model_config = _CAMEL

    entity_ids: list[str] | None = None


class BatchEventAnalysisRequest(BaseModel):
    model_config = _CAMEL

    event_ids: list[str] | None = None


# ── Entity chunks ────────────────────────────────────────────────────────────






# ── Task / misc ──────────────────────────────────────────────────────────────


class TaskIdResponse(BaseModel):
    model_config = _CAMEL

    task_id: str


class UploadResponse(BaseModel):
    model_config = _CAMEL

    task_id: str
    duplicate_title: bool = False


class DetectLanguageResponse(BaseModel):
    model_config = _CAMEL

    language: str


# ── Timeline ─────────────────────────────────────────────────────────────────
















# ── Epistemic State (F-03) ───────────────────────────────────────────────────








# ── Link Prediction / Inferred Relations (F-01) ───────────────────────────────










# ── Voice Profile (F-04) ─────────────────────────────────────────────────────


class ToneSegmentResponse(BaseModel):
    model_config = _CAMEL

    label: str
    value: float


class HistogramBucketResponse(BaseModel):
    model_config = _CAMEL

    bucket: str
    value: int


class VoiceProfileResponse(BaseModel):
    model_config = _CAMEL

    character_id: str
    character_name: str
    document_id: str
    avg_sentence_length: float
    question_ratio: float
    exclamation_ratio: float
    lexical_diversity: float
    paragraphs_analyzed: int
    tone_distribution: list[ToneSegmentResponse] = Field(default_factory=list)
    sentence_length_histogram: list[HistogramBucketResponse] = Field(default_factory=list)
    speech_style: str
    distinctive_patterns: list[str]
    tone: str
    representative_quotes: list[str]
    analyzed_at: datetime



class EventSourcePassage(BaseModel):
    model_config = _CAMEL

    id: str
    text: str
    chapter_number: int | None = None
    score: float


class EventSourceResponse(BaseModel):
    model_config = _CAMEL

    event_id: str
    passages: list[EventSourcePassage] = Field(default_factory=list)
