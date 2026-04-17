"""Symbolic imagery query endpoints.

GET /api/v1/symbols                         — list imagery for a book
GET /api/v1/symbols/{imagery_id}/timeline   — occurrences sorted by chapter/position
GET /api/v1/symbols/{imagery_id}/co-occurrences — top-k co-occurring terms
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api.deps import SymbolGraphServiceDep, SymbolServiceDep
from api.schemas.symbols import (
    CoOccurrenceEntry,
    ImageryEntityResponse,
    ImageryListResponse,
    SymbolTimelineEntry,
)
from domain.imagery import ImageryType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/symbols", tags=["symbols"])


@router.get("/", response_model=ImageryListResponse)
async def list_symbols(
    symbol_svc: SymbolServiceDep,
    book_id: str = Query(..., description="Book identifier"),
    imagery_type: str | None = Query(default=None, description="Filter by imagery type"),
    min_frequency: int = Query(default=1, ge=1, description="Minimum occurrence frequency"),
    limit: int = Query(default=100, ge=1, le=500),
) -> ImageryListResponse:
    """List all imagery entities for a book with optional filters."""
    entities = await symbol_svc.get_imagery_list(book_id)

    if imagery_type is not None:
        try:
            itype = ImageryType(imagery_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid imagery_type '{imagery_type}'. "
                f"Valid values: {[t.value for t in ImageryType]}",
            )
        entities = [e for e in entities if e.imagery_type == itype]

    entities = [e for e in entities if e.frequency >= min_frequency]
    entities = entities[:limit]

    return ImageryListResponse(
        items=[ImageryEntityResponse.from_domain(e) for e in entities],
        total=len(entities),
        book_id=book_id,
    )


@router.get("/{imagery_id}/timeline", response_model=list[SymbolTimelineEntry])
async def get_symbol_timeline(
    imagery_id: str,
    symbol_svc: SymbolServiceDep,
) -> list[SymbolTimelineEntry]:
    """Return all occurrences of an imagery entity sorted by chapter and position."""
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Imagery '{imagery_id}' not found")

    occurrences = await symbol_svc.get_occurrences(imagery_id)
    return [SymbolTimelineEntry.from_domain(occ) for occ in occurrences]


@router.get("/{imagery_id}/co-occurrences", response_model=list[CoOccurrenceEntry])
async def get_co_occurrences(
    imagery_id: str,
    symbol_svc: SymbolServiceDep,
    symbol_graph: SymbolGraphServiceDep,
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[CoOccurrenceEntry]:
    """Return top-k co-occurring imagery terms (graph must be built first)."""
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Imagery '{imagery_id}' not found")

    if not symbol_graph._ensure_graph(entity.book_id):
        # Auto-build graph on first request
        await symbol_graph.build_graph(entity.book_id, symbol_svc)

    co_pairs = await symbol_graph.get_co_occurrences(
        book_id=entity.book_id,
        term=entity.term,
        top_k=top_k,
    )

    # Enrich with imagery_id and type for each co-occurring term
    all_entities = await symbol_svc.get_imagery_list(entity.book_id)
    term_to_entity = {e.term: e for e in all_entities}
    result: list[CoOccurrenceEntry] = []
    for co_term, count in co_pairs:
        co_entity = term_to_entity.get(co_term)
        if co_entity is None:
            continue
        result.append(
            CoOccurrenceEntry(
                term=co_term,
                imagery_id=co_entity.id,
                co_occurrence_count=count,
                imagery_type=co_entity.imagery_type.value,
            )
        )

    return result
