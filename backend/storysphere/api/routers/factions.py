"""Faction detection endpoint (F-16).

GET /api/v1/books/{book_id}/analysis/factions?chapter=<int>

Synchronous (pure graph computation, no LLM / background tasks).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from storysphere.api.deps import FactionServiceDep
from storysphere.api.schemas.factions import FactionAnalysisResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["factions"])


@router.get(
    "/{book_id}/analysis/factions",
    response_model=FactionAnalysisResponse,
)
async def get_faction_analysis(
    book_id: str,
    faction_service: FactionServiceDep,
    chapter: int | None = Query(default=None, ge=1),
    resolution: float = Query(default=1.0, ge=0.1, le=4.0),
    min_cluster_size: int = Query(default=2, ge=2, le=20),
) -> FactionAnalysisResponse:
    """Return faction structure for a book, optionally at a chapter snapshot.

    Query params:
        chapter: chapter snapshot (reading order); omit for full book.
        resolution: modularity resolution (0.1–4.0, default 1.0). Higher → more,
            smaller factions; lower → fewer, larger ones.
        min_cluster_size: communities smaller than this go to unaffiliated (≥ 2).

    Empty book / no characters → empty factions list (200, not 404).
    """
    analysis = await faction_service.detect_factions(
        book_id=book_id,
        chapter=chapter,
        resolution=resolution,
        min_cluster_size=min_cluster_size,
    )
    return FactionAnalysisResponse.model_validate(analysis.model_dump())
