"""Pydantic models for deep character and event analysis results.

Used by AnalysisService, AnalysisAgent, AnalyzeCharacterTool, and AnalyzeEventTool.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class CEPResult(BaseModel):
    """Character Evidence Profile — structured evidence extracted from KG + text."""

    actions: list[str] = Field(default_factory=list, description="Key actions the character takes")
    traits: list[str] = Field(default_factory=list, description="Personality traits with evidence")
    relations: list[dict[str, str]] = Field(
        default_factory=list, description="Key relationships [{target, type, description}]"
    )
    key_events: list[dict[str, Any]] = Field(
        default_factory=list, description="Important events involving the character"
    )
    quotes: list[str] = Field(default_factory=list, description="Notable quotes or dialogue")
    top_terms: dict[str, float] = Field(
        default_factory=dict, description="Top keywords associated with this character"
    )


class CoverageMetrics(BaseModel):
    """Measures how much evidence was gathered for the analysis."""

    action_count: int = 0
    trait_count: int = 0
    relation_count: int = 0
    event_count: int = 0
    quote_count: int = 0
    gaps: list[str] = Field(default_factory=list, description="Areas with insufficient data")
    source_chunk_ids: list[str] = Field(default_factory=list, description="IDs of source chunks used")


class ArchetypeResult(BaseModel):
    """Archetype classification result for one framework."""

    framework: str = Field(description="'jung' or 'schmidt'")
    primary: str = Field(description="Primary archetype ID")
    secondary: str | None = Field(default=None, description="Secondary archetype ID")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Classification confidence")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence for classification")


class ArcSegment(BaseModel):
    """One phase of a character's development arc."""

    chapter_range: str = Field(description="e.g. '1-5' or '12-15'")
    phase: str = Field(description="Arc phase label (e.g. 'Setup', 'Crisis', 'Transformation')")
    description: str = Field(description="What happens in this arc segment")


class CharacterProfile(BaseModel):
    """Short narrative summary of a character (~120 words)."""

    summary: str = Field(description="120-word character summary")


class CharacterAnalysisResult(BaseModel):
    """Complete deep analysis result for a single character."""

    entity_id: str = Field(description="Entity ID from KG")
    entity_name: str = Field(description="Character name")
    document_id: str = Field(description="Source document ID")
    profile: CharacterProfile = Field(description="Narrative summary")
    cep: CEPResult = Field(description="Character Evidence Profile")
    archetypes: list[ArchetypeResult] = Field(
        default_factory=list, description="Archetype classifications (one per framework)"
    )
    arc: list[ArcSegment] = Field(default_factory=list, description="Character development arc")
    coverage: CoverageMetrics = Field(
        default_factory=CoverageMetrics, description="Evidence coverage metrics"
    )
    analyzed_at: datetime = Field(default_factory=datetime.utcnow, description="Analysis timestamp")


# ── Event Analysis Models ──────────────────────────────────────────────────────


class ParticipantRoleType(str, Enum):
    INITIATOR = "initiator"
    ACTOR = "actor"
    REACTOR = "reactor"
    VICTIM = "victim"
    BENEFICIARY = "beneficiary"


class EventImportance(str, Enum):
    KERNEL = "kernel"
    SATELLITE = "satellite"


class ParticipantRole(BaseModel):
    entity_id: str
    entity_name: str
    role: ParticipantRoleType
    impact_description: str


class EventEvidenceProfile(BaseModel):
    state_before: str
    state_after: str
    causal_factors: list[str] = Field(default_factory=list)
    prior_event_ids: list[str] = Field(default_factory=list)
    participant_roles: list[ParticipantRole] = Field(default_factory=list)
    consequences: list[str] = Field(default_factory=list)
    subsequent_event_ids: list[str] = Field(default_factory=list)
    structural_role: str = ""
    event_importance: EventImportance = EventImportance.SATELLITE
    thematic_significance: str = ""
    text_evidence: list[str] = Field(default_factory=list)
    top_terms: dict[str, float] = Field(default_factory=dict)


class CausalityAnalysis(BaseModel):
    root_cause: str = ""
    causal_chain: list[str] = Field(default_factory=list)
    trigger_event_ids: list[str] = Field(default_factory=list)
    chain_summary: str = ""


class ImpactAnalysis(BaseModel):
    affected_participant_ids: list[str] = Field(default_factory=list)
    participant_impacts: list[str] = Field(default_factory=list)
    relation_changes: list[str] = Field(default_factory=list)
    subsequent_event_ids: list[str] = Field(default_factory=list)
    impact_summary: str = ""


class EventSummary(BaseModel):
    summary: str = ""


class EventCoverageMetrics(BaseModel):
    evidence_chunk_count: int = 0
    participant_count: int = 0
    causal_event_count: int = 0
    subsequent_event_count: int = 0
    gaps: list[str] = Field(default_factory=list)


class EventAnalysisResult(BaseModel):
    event_id: str
    title: str
    document_id: str
    eep: EventEvidenceProfile
    causality: CausalityAnalysis
    impact: ImpactAnalysis
    summary: EventSummary
    coverage: EventCoverageMetrics
    analyzed_at: datetime
