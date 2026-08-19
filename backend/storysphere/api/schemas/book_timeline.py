"""Request/response schemas for the timeline endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


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
    configured_at: datetime | None = None


class TimelineConfigUpdate(BaseModel):
    model_config = _CAMEL

    chapter_mode_enabled: bool | None = None
    story_mode_enabled: bool | None = None
    default_mode: Literal["chapter", "story"] | None = None
    chapter_mode_configured: bool | None = None
    story_mode_configured: bool | None = None


class ParticipantRef(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str


class LocationRef(BaseModel):
    model_config = _CAMEL

    id: str
    name: str


class TemporalDisplacementEntry(BaseModel):
    """Per-event verdict from the Genette temporal analysis (#21h).

    Not the same thing as the deviation the timeline page derives from
    ``chronological_rank``: that is geometry available for every ranked event,
    this is the LLM's judgement and is absent until the analysis has run with
    sufficient ``story_time_hint`` coverage.
    """

    model_config = _CAMEL

    type: str
    """analepsis (flashback) | prolepsis (flash-forward) | linear."""
    displacement: float
    """story_rank - text_rank; negative = told later than it happened."""
    text_rank: int
    story_rank: float


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
    has_analysis: bool = False
    temporal_displacement: TemporalDisplacementEntry | None = None
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
    temporal_analyzed: bool = False
    """True when a temporal analysis with sufficient coverage is cached."""
    temporal_structure: str | None = None
    """linear | partially_linear | non_linear | unknown; None when never run."""
    temporal_is_stale: bool = False
    """True when a pipeline step re-ran after the temporal analysis was cached."""
    temporal_stale_reason: str | None = None
    """Pipeline step whose rerun overtook the cached temporal analysis."""
