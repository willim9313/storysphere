"""Request/response schemas for narrative analysis endpoints — B-036."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ClassifyNarrativeRequest(BaseModel):
    document_id: str
    force: bool = False


class RefineNarrativeRequest(BaseModel):
    document_id: str
    event_ids: Optional[list[str]] = Field(
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
