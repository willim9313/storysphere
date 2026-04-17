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
