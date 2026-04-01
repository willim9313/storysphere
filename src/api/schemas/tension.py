"""Request/response schemas for tension analysis endpoints — B-027/B-028."""

from __future__ import annotations

from typing import Literal, Optional

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
    canonical_pole_a: Optional[str] = None
    canonical_pole_b: Optional[str] = None
