"""Request/response schemas for event analysis endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


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


class BatchEventAnalysisRequest(BaseModel):
    model_config = _CAMEL

    event_ids: list[str] | None = None


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
