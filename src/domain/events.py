from __future__ import annotations

import uuid
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    PLOT = "plot"
    CONFLICT = "conflict"
    REVELATION = "revelation"
    TURNING_POINT = "turning_point"
    MEETING = "meeting"
    BATTLE = "battle"
    DEATH = "death"
    ROMANCE = "romance"
    ALLIANCE = "alliance"
    OTHER = "other"


class NarrativeMode(str, Enum):
    """Whether this event is presented as present action, flashback, etc."""

    PRESENT = "present"
    FLASHBACK = "flashback"
    FLASHFORWARD = "flashforward"
    PARALLEL = "parallel"
    UNKNOWN = "unknown"


class StoryTimeRef(BaseModel):
    """Structured story-world time reference.

    Populated by downstream classifiers (B-033/B-034), not by ingestion LLM.
    The raw-text source is kept in Event.story_time_hint.
    """

    relative_order: float | None = None
    time_anchor: str | None = None
    absolute_time: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class Event(BaseModel):
    """A significant plot event extracted from a novel chapter."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: Optional[str] = None
    title: str
    event_type: EventType
    description: str
    chapter: int
    participants: list[str] = Field(default_factory=list, description="Entity IDs involved")
    location_id: Optional[str] = None
    significance: Optional[str] = None
    consequences: list[str] = Field(default_factory=list)

    # --- Narrative position (fine-grained within-book ordering) ---
    narrative_position: Optional[int] = None

    # --- Story-world temporal fields ---
    narrative_mode: NarrativeMode = NarrativeMode.UNKNOWN
    story_time_hint: Optional[str] = None
    chronological_rank: Optional[float] = None
    chron_index: Optional[int] = None   # 1-based story-world order; set by TemporalPipeline

    # --- Tension / emotional fields (B-023) ---
    tension_signal: Literal["none", "potential", "explicit"] = "none"
    emotional_intensity: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    emotional_valence: Optional[
        Literal["positive", "negative", "mixed", "neutral"]
    ] = None

    # --- Narratology fields (B-031) ---
    narrative_weight: Literal["kernel", "satellite", "unclassified"] = "unclassified"
    narrative_weight_source: Optional[
        Literal["summary_heuristic", "llm_classified", "human_verified"]
    ] = None
    story_time: Optional[StoryTimeRef] = None

    # --- Epistemic visibility (F-03) ---
    # public  = information naturally known to all (public battles, announced deaths, spread gossip)
    # private = only direct participants know (closed meetings, personal letters)
    # secret  = actively concealed (staged accidents, deliberate lies, hidden alliances)
    visibility: Literal["public", "private", "secret"] = "public"
