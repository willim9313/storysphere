from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CharacterAnalysisRequest(BaseModel):
    entity_name: str = Field(description="Character name (must match KG entity name)")
    document_id: str = Field(description="Source document ID")
    archetype_frameworks: list[str] = Field(
        default=["jung"],
        description="Archetype frameworks to apply: 'jung', 'schmidt'",
    )
    language: str = Field(default="en", description="Output language")
    force_refresh: bool = Field(
        default=False, description="Bypass cache and re-run analysis"
    )


class EventAnalysisRequest(BaseModel):
    event_id: str = Field(description="Event ID from KG")
    document_id: str = Field(description="Source document ID")
    language: str = Field(default="en", description="Output language")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class SymbolAnalysisRequest(BaseModel):
    book_id: str = Field(description="Book document ID")
    language: str = Field(default="en", description="Output language")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class SymbolInterpretationReviewRequest(BaseModel):
    book_id: str = Field(description="Book document ID")
    review_status: Literal["approved", "modified", "rejected"]
    theme: str | None = None
    polarity: Literal["positive", "negative", "neutral", "mixed"] | None = None
