"""Unraveling — data-layer transparency manifest for a single book.

GET /books/{book_id}/unraveling returns a DAG-shaped manifest that
surfaces counts and completion status for every data layer the system
builds for a book.  No LLM calls are made; all data comes from
existing services.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from storysphere.api.deps import (
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    SymbolServiceDep,
)
from storysphere.api.schemas.unraveling import (
    ChapterDistribution,
    EdgeData,
    UnravelingManifest,
)
from storysphere.api.unraveling_manifest import (
    EDGES,
    build_nodes,
    compute_chapter_distributions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["unraveling"])

# ── Private helpers ───────────────────────────────────────────────────────────


async def _key_exists(cache: Any, key: str) -> bool:
    return (await cache.get(key)) is not None


async def _count_teu_keys(cache: Any, event_ids: list[str]) -> int:
    """Count TEU cache entries for the given event IDs.

    TEU keys are ``teu:{event_id}`` — not scoped by document.
    We fan out one count_keys call per event then sum.
    """
    if not event_ids:
        return 0
    results = await asyncio.gather(
        *[cache.count_keys(f"teu:{eid}") for eid in event_ids]
    )
    return sum(results)


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.get(
    "/{book_id}/unraveling",
    response_model=UnravelingManifest,
    summary="Data-layer transparency manifest (Unraveling)",
)
async def get_unraveling(
    book_id: str,
    doc_service: DocServiceDep,
    kg_service: KGServiceDep,
    cache: AnalysisCacheDep,
    symbol_service: SymbolServiceDep,
) -> UnravelingManifest:
    """Return the Unraveling manifest for *book_id*.

    Aggregates counts from DocumentService, KGService, AnalysisCache,
    and SymbolService in two parallel rounds, then computes a status
    (complete / partial / empty) for each DAG node.

    All queries are read-only and involve no LLM calls.
    """
    # Round 1: parallel data fetch
    (
        doc,
        entities,
        events,
        temporal_rels,
        imagery,
    ) = await asyncio.gather(
        doc_service.get_document(book_id),
        kg_service.list_entities(document_id=book_id),
        kg_service.get_events(document_id=book_id),
        kg_service.get_temporal_relations(document_id=book_id),
        symbol_service.get_imagery_list(book_id),
    )

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found.",
        )

    # Round 2: cache key counts (requires event IDs from round 1)
    event_ids = [ev.id for ev in events]
    (
        cep_count,
        eep_count,
        temporal_analysis_present,
        narrative_present,
        hero_journey_present,
        tension_lines_present,
        tension_theme_present,
        teu_count,
        sep_count,
        symbol_analysis_count,
        voice_profile_count,
    ) = await asyncio.gather(
        cache.count_keys(f"character:{book_id}:%"),
        cache.count_keys(f"event:{book_id}:%"),
        _key_exists(cache, f"temporal_analysis:{book_id}"),
        _key_exists(cache, f"narrative_structure:{book_id}"),
        _key_exists(cache, f"hero_journey:{book_id}"),
        _key_exists(cache, f"tension_lines:{book_id}"),
        _key_exists(cache, f"tension_theme:{book_id}"),
        _count_teu_keys(cache, event_ids),
        cache.count_keys(f"sep:{book_id}:%"),
        cache.count_keys(f"symbol_analysis:{book_id}:%"),
        cache.count_keys(f"voice_profile:{book_id}:%"),
    )

    nodes = build_nodes(
        doc=doc,
        entities=entities,
        events=events,
        temporal_rels=temporal_rels,
        imagery=imagery,
        relation_count_global=kg_service.relation_count,
        cep_count=cep_count,
        eep_count=eep_count,
        temporal_analysis_present=temporal_analysis_present,
        narrative_present=narrative_present,
        hero_journey_present=hero_journey_present,
        tension_lines_present=tension_lines_present,
        tension_theme_present=tension_theme_present,
        teu_count=teu_count,
        sep_count=sep_count,
        symbol_analysis_count=symbol_analysis_count,
        voice_profile_count=voice_profile_count,
    )

    edges = [
        EdgeData(source=src, target=tgt) for src, tgt in EDGES
    ]

    return UnravelingManifest(
        book_id=book_id,
        nodes=nodes,
        edges=edges,
    )


# ── Chapter distribution endpoint ─────────────────────────────────────────────


@router.get(
    "/{book_id}/unraveling/chapter-distribution",
    response_model=ChapterDistribution,
    summary="Per-chapter distribution for chapter-aware DAG nodes",
)
async def get_chapter_distribution(
    book_id: str,
    doc_service: DocServiceDep,
    kg_service: KGServiceDep,
    symbol_service: SymbolServiceDep,
) -> ChapterDistribution:
    """Return per-chapter counts for the subset of unraveling nodes whose
    underlying data is naturally chapter-indexed.

    Supported nodeIds: ``paragraphs``, ``summaries``, ``keywords``,
    ``kg_event``, ``symbols``. Other nodes are omitted from the response.
    """
    doc, events, imagery = await asyncio.gather(
        doc_service.get_document(book_id),
        kg_service.get_events(document_id=book_id),
        symbol_service.get_imagery_list(book_id),
    )

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found.",
        )

    distributions = compute_chapter_distributions(
        doc=doc, events=events, imagery=imagery,
    )

    return ChapterDistribution(
        book_id=book_id,
        total_chapters=doc.body_chapter_count,
        distributions=distributions,
    )
