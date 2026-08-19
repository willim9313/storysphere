"""Request/response schemas for character analysis endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


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


class BatchAnalysisRequest(BaseModel):
    model_config = _CAMEL

    entity_ids: list[str] | None = None


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
