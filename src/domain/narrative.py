"""Narrative analysis domain models — B-033/B-035.

Hierarchy (book-level):
  Event.narrative_weight  (kernel / satellite / unclassified)
       ↓ classified by NarrativeService
  NarrativeStructure  (book-level result: kernel spine + hero journey mapping)
"""

from __future__ import annotations

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field


class KernelSatelliteResult(BaseModel):
    """Classification result for a single Event (internal use by NarrativeService)."""

    event_id: str
    narrative_weight: Literal["kernel", "satellite", "unclassified"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: Optional[str] = None


class ProppFunctionRef(BaseModel):
    """Reference to a Propp narrative function mapped to an event.

    Only populated when B-034 LLM refinement runs Propp analysis.
    """

    function_id: str = Field(description="Propp function code, e.g. 'A' (villainy), 'D' (task)")
    function_name: str
    event_id: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class HeroJourneyStage(BaseModel):
    """One stage of Campbell's Hero's Journey, mapped to chapter ranges.

    Populated by NarrativeService.map_hero_journey() (B-035).
    Stages are defined in src/config/hero_journey.py.
    """

    stage_id: str = Field(description="Stage identifier, e.g. 'ordinary_world'")
    stage_name: str
    chapter_range: list[int] = Field(
        description="Chapters corresponding to this stage (may overlap adjacent stages)"
    )
    representative_event_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: Optional[str] = None


class TemporalDisplacement(BaseModel):
    """Displacement between text order and story-world time order for one Event.

    Negative displacement = analepsis (flashback): event appears later in text
    than its story-world position.
    Positive displacement = prolepsis (flash-forward): event appears earlier
    in text than its story-world position.
    Zero / near-zero = linear narration.
    """

    event_id: str
    title: str
    chapter: int
    text_rank: int = Field(description="Position in narrative/text order (1-based)")
    story_rank: float = Field(description="Position in story-world chronological order (1-based)")
    displacement: float = Field(description="story_rank - text_rank; negative = analepsis")
    displacement_type: Literal["analepsis", "prolepsis", "linear"]
    story_time_hint: Optional[str] = Field(
        default=None, description="Raw time hint from ingestion (e.g. '三年前')"
    )


class TemporalAnalysis(BaseModel):
    """Book-level Genette temporal structure analysis result.

    Populated by NarrativeService.analyze_temporal_order() (B-037).
    Persisted via AnalysisCache with key: temporal_analysis:{document_id}
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str

    # Coverage assessment
    total_events: int = 0
    events_with_hint: int = 0
    coverage: float = Field(
        default=0.0,
        description="Fraction of events with story_time_hint (0.0–1.0)",
    )
    coverage_sufficient: bool = Field(
        default=False,
        description="True when coverage >= threshold (default 0.60)",
    )

    # Structure classification (set by LLM or skipped if coverage insufficient)
    story_time_structure: Literal["linear", "partially_linear", "non_linear", "unknown"] = "unknown"

    # Displacement results (only populated if coverage_sufficient)
    displacements: list[TemporalDisplacement] = Field(default_factory=list)
    analepsis_event_ids: list[str] = Field(
        default_factory=list, description="Event IDs identified as flashbacks"
    )
    prolepsis_event_ids: list[str] = Field(
        default_factory=list, description="Event IDs identified as flash-forwards"
    )

    # HITL review
    review_status: Literal["pending", "approved", "rejected"] = "pending"


class NarrativeStructure(BaseModel):
    """Book-level narrative structure analysis result.

    Aggregates Kernel/Satellite classification and Hero's Journey mapping.
    Persisted via AnalysisCache with key: narrative_structure:{document_id}
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str

    # Kernel/Satellite classification (populated by classify_by_heuristic / refine_with_llm)
    kernel_event_ids: list[str] = Field(default_factory=list)
    satellite_event_ids: list[str] = Field(default_factory=list)
    unclassified_event_ids: list[str] = Field(default_factory=list)
    classification_source: Literal[
        "summary_heuristic", "llm_classified", "human_verified"
    ] = "summary_heuristic"

    # Hero's Journey mapping (populated by map_hero_journey, B-035)
    hero_journey_stages: list[HeroJourneyStage] = Field(default_factory=list)

    # Propp functions (populated by B-034 LLM refinement, optional)
    propp_functions: list[ProppFunctionRef] = Field(default_factory=list)

    # HITL review
    review_status: Literal["pending", "approved", "rejected"] = "pending"
