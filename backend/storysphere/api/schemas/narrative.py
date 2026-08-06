"""Request/response schemas for narrative analysis endpoints — B-036."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from storysphere.domain.narrative import NarrativeStructure


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
    narrative_weight_source: str | None = None
    narrative_position: int | None = None


class NarrativeStructureResponse(NarrativeStructure):
    """NarrativeStructure plus derived staleness.

    Subclasses the domain model so every existing field keeps its name and
    the two additions are purely additive for consumers. Staleness is never
    persisted — the service writes the plain NarrativeStructure to cache.
    """

    is_stale: bool = Field(
        default=False,
        description="Cached analysis predates a pipeline step it derives from",
    )
    stale_reason: str | None = Field(
        default=None,
        description="Pipeline step whose rerun overtook the cached analysis",
    )
