"""Request/response schemas for tension analysis endpoints — B-027/B-028/B-029."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class GroupTensionLinesRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class AnalyzeBookTensionsRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False
    concurrency: int = Field(default=5, ge=1, le=20)


class TensionLineReviewRequest(BaseModel):
    document_id: str
    review_status: Literal["approved", "modified", "rejected"]
    canonical_pole_a: str | None = None
    canonical_pole_b: str | None = None


class SynthesizeThemeRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class TensionThemeReviewRequest(BaseModel):
    document_id: str
    review_status: Literal["approved", "modified", "rejected"]
    proposition: str | None = None  # Allow human to rewrite the thematic proposition


# ── Response models ──────────────────────────────────────────────────────────


class TEUSummary(BaseModel):
    """Per-line TEU rollup used by the tension page evidence section."""

    id: str
    chapter: int
    intensity: float = Field(ge=0.0, le=1.0)
    tension_description: str
    evidence: list[str] = Field(default_factory=list)
    pole_a_carriers: list[str] = Field(default_factory=list)
    pole_b_carriers: list[str] = Field(default_factory=list)


class TensionLineDetail(BaseModel):
    """A TensionLine with its constituent TEUs embedded for in-page review."""

    id: str
    document_id: str
    teu_ids: list[str] = Field(default_factory=list)
    canonical_pole_a: str
    canonical_pole_b: str
    intensity_summary: float = Field(ge=0.0, le=1.0)
    chapter_range: list[int] = Field(default_factory=list)
    thematic_note: str | None = None
    review_status: Literal["pending", "approved", "modified", "rejected"]
    teus: list[TEUSummary] = Field(default_factory=list)


class TensionThemeResponse(BaseModel):
    id: str
    document_id: str
    tension_line_ids: list[str] = Field(default_factory=list)
    proposition: str
    frye_mythos: str | None = None
    booker_plot: str | None = None
    assembled_by: str
    assembled_at: str
    review_status: Literal["pending", "approved", "modified", "rejected"]
