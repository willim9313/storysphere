"""Faction detection domain models — F-16.

Pure data containers used by FactionService. snake_case per domain convention.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Faction(BaseModel):
    """A community of characters discovered via modularity-based clustering."""

    id: str
    label: str
    member_ids: list[str] = Field(default_factory=list)
    cohesion_score: float = Field(ge=0.0, description="Intra-faction edge weight / member count")
    top_member_names: list[str] = Field(default_factory=list)


class FactionRelation(BaseModel):
    """Aggregated inter-faction cooperation / rivalry, normalised to [0, 1]."""

    source_faction_id: str
    target_faction_id: str
    cooperation: float = Field(ge=0.0, le=1.0)
    rivalry: float = Field(ge=0.0, le=1.0)


class FactionAnalysis(BaseModel):
    """Full faction-detection result for a book (optionally chapter snapshot)."""

    book_id: str
    chapter: int | None = None
    factions: list[Faction] = Field(default_factory=list)
    relations: list[FactionRelation] = Field(default_factory=list)
    unaffiliated_entity_ids: list[str] = Field(default_factory=list)
    unaffiliated_names: list[str] = Field(default_factory=list)
