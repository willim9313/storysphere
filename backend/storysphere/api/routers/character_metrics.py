"""Character centrality metrics endpoint.

GET /api/v1/books/{book_id}/analysis/character-metrics

Synchronous (pure graph computation, no LLM / background tasks). Mirrors the
faction-detection endpoint (F-16, see ``routers/factions.py``).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from storysphere.api.deps import CharacterMetricsServiceDep, DocServiceDep
from storysphere.api.schemas.character_metrics import CharacterMetricsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["character-metrics"])


@router.get(
    "/{book_id}/analysis/character-metrics",
    response_model=CharacterMetricsResponse,
)
async def get_character_metrics(
    book_id: str,
    doc: DocServiceDep,
    metrics_service: CharacterMetricsServiceDep,
) -> CharacterMetricsResponse:
    """Return PageRank + degree for every character in a book.

    Degree is computed on the full entity-relation graph (not just
    character-to-character edges). Empty book / no relations → `metrics: []`
    (200, not 500).
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    analysis = await metrics_service.compute_metrics(book_id)
    return CharacterMetricsResponse.model_validate(analysis.model_dump())
