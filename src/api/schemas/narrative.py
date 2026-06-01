"""Request/response schemas for narrative analysis endpoints — B-036."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ClassifyNarrativeRequest(BaseModel):
    document_id: str
    force: bool = False


class RefineNarrativeRequest(BaseModel):
    document_id: str
    event_ids: list[str] | None = Field(
        default=None,
        description="Specific event IDs to refine. If null, refines all satellite events.",
    )
    language: str = "en"
    force: bool = False


class HeroJourneyRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class NarrativeReviewRequest(BaseModel):
    review_status: Literal["approved", "rejected"]


class TemporalAnalysisRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class KernelSpineEvent(BaseModel):
    """One kernel event in the plot spine (response shape for #21j).

    Mirrors the dict assembled in ``get_kernel_spine``. Field names stay
    snake_case (no camel alias) to match the existing JSON contract.
    """

    id: str
    title: str
    chapter: int
    event_type: str
    description: str
    significance: str | None = None
    narrative_weight: str
    narrative_weight_source: str
    narrative_position: int
