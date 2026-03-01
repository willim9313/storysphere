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
    """Input for retrieving a chapter or document summary."""

    document_id: str = Field(description="The document ID.")
    chapter_number: Optional[int] = Field(
        default=None,
        description="Specific chapter number. If omitted, returns all chapter summaries.",
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
    """Input for deep character analysis (stub — Phase 5)."""

    entity_id: str = Field(description="Character entity ID or name.")
    aspects: list[str] = Field(
        default_factory=lambda: ["personality", "relationships", "arc"],
        description="Analysis aspects: personality, relationships, arc, motivations.",
    )


class AnalyzeEventInput(BaseModel):
    """Input for deep event analysis (stub — Phase 5)."""

    event_id: str = Field(description="Event ID to analyze.")
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


class GetChapterSummaryInput(BaseModel):
    """Input for retrieving a specific chapter summary."""

    document_id: str = Field(description="The document ID.")
    chapter_number: int = Field(description="The chapter number.")


# ── Analysis Output Schemas (documentation / Phase 5 validation) ─────────


class CharacterAnalysisOutput(BaseModel):
    """Expected output schema for AnalyzeCharacterTool (Phase 5)."""

    entity_id: str
    name: str
    personality_traits: list[str] = Field(default_factory=list)
    key_relationships: list[dict[str, Any]] = Field(default_factory=list)
    character_arc: str = ""
    motivations: list[str] = Field(default_factory=list)
    summary: str = ""


class EventAnalysisOutput(BaseModel):
    """Expected output schema for AnalyzeEventTool (Phase 5)."""

    event_id: str
    title: str
    significance_analysis: str = ""
    cause_chain: list[str] = Field(default_factory=list)
    consequence_chain: list[str] = Field(default_factory=list)
    affected_characters: list[str] = Field(default_factory=list)
    summary: str = ""
