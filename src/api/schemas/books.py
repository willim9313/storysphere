"""Response/request schemas for book-centric endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict
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
    entity_stats: EntityStats = EntityStats()
    keywords: dict[str, float] | None = None


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


class ChunkResponse(BaseModel):
    model_config = _CAMEL

    id: str
    chapter_id: str
    order: int
    content: str
    keywords: list[str] = []
    segments: list[Segment] = []


# ── Graph ────────────────────────────────────────────────────────────────────


class GraphNode(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str
    description: str | None = None
    chunk_count: int = 0
    event_type: str | None = None
    chapter: int | None = None


class GraphEdge(BaseModel):
    model_config = _CAMEL

    id: str
    source: str
    target: str
    label: str | None = None
    weight: float | None = None
    # F-01 inferred relation fields
    inferred: bool = False
    confidence: float | None = None
    inferred_id: str | None = None


class GraphDataResponse(BaseModel):
    model_config = _CAMEL

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


# ── Timeline config ──────────────────────────────────────────────────────────


class TimelineConfigResponse(BaseModel):
    model_config = _CAMEL

    chapter_mode_enabled: bool = False
    story_mode_enabled: bool = False
    default_mode: Literal["chapter", "story"] = "chapter"
    total_chapters: int = 0
    total_events: int = 0
    total_ranked_events: int = 0
    chapter_mode_configured: bool = False
    story_mode_configured: bool = False
    configured_at: Optional[datetime] = None


class TimelineConfigUpdate(BaseModel):
    model_config = _CAMEL

    chapter_mode_enabled: Optional[bool] = None
    story_mode_enabled: Optional[bool] = None
    default_mode: Optional[Literal["chapter", "story"]] = None
    chapter_mode_configured: Optional[bool] = None
    story_mode_configured: Optional[bool] = None


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
    analyzed_at: str | None = None


# ── Analysis list ────────────────────────────────────────────────────────────


class UnanalyzedEntity(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str
    chapter_count: int = 0


class AnalysisItem(BaseModel):
    model_config = _CAMEL

    id: str
    entity_id: str
    section: str
    title: str
    archetype_type: str | None = None
    chapter_count: int = 0
    content: str = ""
    framework: str = "jung"
    generated_at: str = ""


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
    generated_at: str


# ── Entity chunks ────────────────────────────────────────────────────────────


class EntityChunkItem(BaseModel):
    model_config = _CAMEL

    id: str
    chapter_id: str
    chapter_title: str | None = None
    chapter_number: int
    order: int
    content: str
    segments: list[Segment] = []


class EntityChunksResponse(BaseModel):
    model_config = _CAMEL

    entity_id: str
    entity_name: str
    total: int
    chunks: list[EntityChunkItem] = []


# ── Task / misc ──────────────────────────────────────────────────────────────


class TaskIdResponse(BaseModel):
    model_config = _CAMEL

    task_id: str


# ── Timeline ─────────────────────────────────────────────────────────────────


class ParticipantRef(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str


class LocationRef(BaseModel):
    model_config = _CAMEL

    id: str
    name: str


class TimelineEventEntry(BaseModel):
    model_config = _CAMEL

    id: str
    title: str
    event_type: str
    description: str
    chapter: int
    chapter_title: str | None = None
    narrative_mode: str = "unknown"
    chronological_rank: float | None = None
    story_time_hint: str | None = None
    event_importance: str | None = None
    participants: list[ParticipantRef] = []
    location: LocationRef | None = None


class TemporalRelationEntry(BaseModel):
    model_config = _CAMEL

    source: str
    target: str
    type: str
    confidence: float


class TimelineQuality(BaseModel):
    model_config = _CAMEL

    total_count: int = 0
    analyzed_count: int = 0
    eep_coverage: float = 0.0
    has_chronological_ranks: bool = False
    last_computed: str | None = None


class TimelineResponse(BaseModel):
    model_config = _CAMEL

    book_id: str
    order: str
    events: list[TimelineEventEntry]
    temporal_relations: list[TemporalRelationEntry]
    quality: TimelineQuality


# ── Epistemic State (F-03) ───────────────────────────────────────────────────


class MisbeliefItemSchema(BaseModel):
    model_config = _CAMEL

    character_belief: str
    actual_truth: str
    source_event_id: str
    confidence: float


class EpistemicStateResponse(BaseModel):
    model_config = _CAMEL

    character_id: str
    character_name: str
    up_to_chapter: int
    known_events: list[dict[str, Any]]
    unknown_events: list[dict[str, Any]]
    misbeliefs: list[MisbeliefItemSchema]
    data_complete: bool


class ClassifyVisibilityResponse(BaseModel):
    """Result of retroactive visibility classification.

    Temporary feature — may be replaced by a dedicated re-ingest pipeline.
    """

    model_config = _CAMEL

    classified: int
    skipped: int
    total: int


# ── Link Prediction / Inferred Relations (F-01) ───────────────────────────────


class InferredRelationResponse(BaseModel):
    model_config = _CAMEL

    id: str
    document_id: str
    source_id: str
    target_id: str
    source_name: str
    target_name: str
    common_neighbor_count: int
    adamic_adar_score: float
    confidence: float
    suggested_relation_type: str
    reasoning: str
    status: str
    visible_from_chapter: Optional[int] = None
    confirmed_relation_id: Optional[str] = None
    created_at: float


class InferredRelationsResponse(BaseModel):
    model_config = _CAMEL

    items: list[InferredRelationResponse] = []
    total: int = 0


class RunInferenceRequest(BaseModel):
    model_config = _CAMEL

    force_refresh: bool = False


class ConfirmInferredRequest(BaseModel):
    model_config = _CAMEL

    relation_type: str


# ── Voice Profile (F-04) ─────────────────────────────────────────────────────


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
    speech_style: str
    distinctive_patterns: list[str]
    tone: str
    representative_quotes: list[str]
    analyzed_at: datetime

