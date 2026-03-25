"""Pydantic schemas for tool inputs and outputs.

Each tool uses an explicit ``args_schema`` so that the LLM can correctly
populate parameters.  Output schemas are for documentation / validation
but are NOT enforced at runtime (tools return JSON strings).
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Graph Tool Inputs ─────────────────────────────────────────────────────────


class EntityIdInput(BaseModel):
    """Input requiring a single entity identifier (ID or name)."""

    entity_id: str = Field(
        description="The entity ID (UUID) or exact entity name."
    )


class EntityTimelineInput(BaseModel):
    """Input for entity timeline with optional sort order."""

    entity_id: str = Field(
        description="The entity ID (UUID) or exact entity name."
    )
    sort_by: str = Field(
        default="narrative",
        description="Sort order: 'narrative' (chapter order) or 'chronological' (story time).",
    )


class GlobalTimelineInput(BaseModel):
    """Input for querying the global book timeline."""

    document_id: str = Field(description="The book/document ID.")
    order: str = Field(
        default="chronological",
        description="Sort order: 'narrative' (chapter order) or 'chronological' (story time).",
    )


class EntityRelationsInput(BaseModel):
    """Input for querying entity relations with optional direction filter."""

    entity_id: str = Field(description="The entity ID (UUID) or exact entity name.")
    direction: str = Field(
        default="both",
        description="Relation direction: 'in', 'out', or 'both'.",
    )


class RelationPathsInput(BaseModel):
    """Input for finding paths between two entities."""

    source: str = Field(description="Source entity ID or name.")
    target: str = Field(description="Target entity ID or name.")
    max_length: int = Field(
        default=3,
        description="Maximum path length (number of hops). Range: 1–5.",
        ge=1,
        le=5,
    )


class SubgraphInput(BaseModel):
    """Input for extracting a k-hop neighbourhood subgraph."""

    entity_id: str = Field(description="Center entity ID or name.")
    k_hops: int = Field(
        default=2,
        description="Number of hops from center. Range: 1–3.",
        ge=1,
        le=3,
    )


class RelationStatsInput(BaseModel):
    """Input for relation statistics, optionally scoped to an entity."""

    entity_id: Optional[str] = Field(
        default=None,
        description="If provided, stats are scoped to this entity. Otherwise, global stats.",
    )


# ── Retrieval Tool Inputs ────────────────────────────────────────────────────


class VectorSearchInput(BaseModel):
    """Input for semantic vector search over paragraphs."""

    query: str = Field(description="Natural language search query.")
    top_k: int = Field(
        default=5,
        description="Number of results to return. Range: 1–20.",
        ge=1,
        le=20,
    )
    document_id: Optional[str] = Field(
        default=None,
        description="If provided, restrict search to this document.",
    )


class GetSummaryInput(BaseModel):
    """Input for retrieving a chapter or book summary."""

    document_id: str = Field(description="The document ID.")
    chapter_number: Optional[int] = Field(
        default=None,
        description="Specific chapter number. If omitted, returns the book-level summary.",
    )


class GetChapterSummaryInput(BaseModel):
    """Input for retrieving the pre-computed summary of a specific chapter."""

    document_id: str = Field(description="The document ID.")
    chapter_number: int = Field(
        description="The chapter number whose summary to retrieve.",
        ge=1,
    )


class GetParagraphsInput(BaseModel):
    """Input for retrieving raw paragraph texts."""

    document_id: str = Field(description="The document ID.")
    chapter_number: Optional[int] = Field(
        default=None,
        description="Specific chapter number. If omitted, returns all paragraphs.",
    )


# ── Analysis Tool Inputs ─────────────────────────────────────────────────────


class GenerateInsightInput(BaseModel):
    """Input for generating a single LLM-based insight."""

    topic: str = Field(description="The topic or question to generate an insight about.")
    context: str = Field(
        default="",
        description="Supporting context (e.g. entity data, relations) for the LLM.",
    )


class AnalyzeCharacterInput(BaseModel):
    """Input for deep character analysis."""

    entity_id: str = Field(description="Character entity ID or name.")
    document_id: str = Field(
        default="",
        description="Document ID to scope analysis to. If empty, uses default.",
    )
    archetype_frameworks: list[str] = Field(
        default_factory=lambda: ["jung"],
        description="Archetype frameworks to classify: 'jung', 'schmidt'.",
    )
    language: str = Field(
        default="en",
        description="Language for archetype configs: 'en' or 'zh'.",
    )


class AnalyzeEventInput(BaseModel):
    """Input for deep event analysis."""

    event_id: str = Field(description="Event ID to analyze.")
    document_id: str = Field(
        default="",
        description="Document ID for vector search scoping.",
    )
    include_consequences: bool = Field(
        default=True,
        description="Whether to include consequence chain analysis.",
    )


# ── Other Tool Inputs ────────────────────────────────────────────────────────


class ExtractEntitiesInput(BaseModel):
    """Input for extracting entities from free text."""

    text: str = Field(description="Free-form text to extract entities from.")


class CompareEntitiesInput(BaseModel):
    """Input for comparing two entities."""

    entity_a: str = Field(description="First entity ID or name.")
    entity_b: str = Field(description="Second entity ID or name.")


class GetKeywordsInput(BaseModel):
    """Input for retrieving keywords for a chapter or book."""

    document_id: str = Field(description="The document ID.")
    chapter_number: Optional[int] = Field(
        default=None,
        description="Specific chapter number. If omitted, returns book-level keywords.",
    )


class GenSummaryInput(BaseModel):
    """Input for (re)generating a chapter or book summary on demand."""

    document_id: str = Field(description="The document ID.")
    chapter_number: Optional[int] = Field(
        default=None,
        description="Chapter number to regenerate. If omitted, regenerates the book-level summary.",
    )


# ── Composite Tool Inputs ──────────────────────────────────────────────────


class GetEntityProfileInput(BaseModel):
    """Input for comprehensive entity profile (composite tool)."""

    entity_id: str = Field(
        description="The entity ID (UUID) or exact entity name."
    )


class GetRelationshipInput(BaseModel):
    """Input for complete relationship info between two entities."""

    entity_a: str = Field(description="First entity ID or name.")
    entity_b: str = Field(description="Second entity ID or name.")


class GetCharacterArcInput(BaseModel):
    """Input for character development arc analysis."""

    entity_id: str = Field(
        description="The character entity ID or name."
    )


class CompareCharactersInput(BaseModel):
    """Input for side-by-side character comparison."""

    entity_a: str = Field(description="First character entity ID or name.")
    entity_b: str = Field(description="Second character entity ID or name.")


class GetEventProfileInput(BaseModel):
    """Input for comprehensive event profile (composite tool)."""

    event_id: str = Field(description="The event ID (UUID).")


# ── Analysis Output Schemas (documentation / Phase 5 validation) ─────────


class CharacterAnalysisOutput(BaseModel):
    """Expected output schema for AnalyzeCharacterTool."""

    entity_id: str
    entity_name: str
    document_id: str
    summary: str = ""
    actions: list[str] = Field(default_factory=list)
    traits: list[str] = Field(default_factory=list)
    relations: list[dict[str, str]] = Field(default_factory=list)
    archetypes: list[dict[str, Any]] = Field(default_factory=list)
    arc: list[dict[str, str]] = Field(default_factory=list)
    coverage_gaps: list[str] = Field(default_factory=list)


class EventAnalysisOutput(BaseModel):
    """Expected output schema for AnalyzeEventTool."""

    event_id: str
    title: str
    document_id: str = ""
    state_before: str = ""
    state_after: str = ""
    structural_role: str = ""
    event_importance: str = ""
    causal_chain: list[str] = Field(default_factory=list)
    root_cause: str = ""
    chain_summary: str = ""
    impact_summary: str = ""
    relation_changes: list[str] = Field(default_factory=list)
    participant_roles: list[dict] = Field(default_factory=list)
    thematic_significance: str = ""
    summary: str = ""
    coverage_gaps: list[str] = Field(default_factory=list)
    analyzed_at: str = ""
