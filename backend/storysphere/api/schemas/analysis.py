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


class SymbolBatchAnalysisRequest(BaseModel):
    """Batch symbol interpretation — the symbols page's three batch buttons.

    Omitting ``imagery_ids`` runs every imagery entity that occurs more than once
    and has no interpretation yet. Single-occurrence terms are excluded by
    default: a word appearing once has no distribution, no allies and no
    attachment to interpret, and they are the majority of any book's imagery, so
    "everything" would spend most of the budget on them.
    """

    book_id: str = Field(description="Book document ID")
    imagery_ids: list[str] | None = Field(
        default=None,
        description=(
            "Restrict the run to this subset (top-N picks, checkbox selection). "
            "Unknown ids are silently excluded."
        ),
    )
    language: str = Field(default="en", description="Output language")
    force_refresh: bool = Field(
        default=False, description="Re-interpret symbols that already have one"
    )


class SymbolInterpretationReviewRequest(BaseModel):
    book_id: str = Field(description="Book document ID")
    review_status: Literal["approved", "modified", "rejected"]
    theme: str | None = None
    polarity: Literal["positive", "negative", "neutral", "mixed"] | None = None
