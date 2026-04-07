"""Unraveling — data-layer transparency manifest for a single book.

GET /books/{book_id}/unraveling returns a DAG-shaped manifest that
surfaces counts and completion status for every data layer the system
builds for a book.  No LLM calls are made; all data comes from
existing services.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from api.deps import (
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    SymbolServiceDep,
)
from domain.entities import EntityType
from domain.events import Event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["unraveling"])

# ── Static DAG edges ──────────────────────────────────────────────────────────

_EDGES: list[tuple[str, str]] = [
    # ── Source text ───────────────────────────────────────────────────────────
    ("book_meta", "chapters"),
    ("book_meta", "paragraphs"),
    # ── Extraction (layer 1) ──────────────────────────────────────────────────
    ("chapters", "summaries"),
    ("chapters", "entities"),
    ("chapters", "relations"),
    ("chapters", "events"),
    ("chapters", "symbols"),
    ("paragraphs", "entities"),
    # ── Analysis intermediates (layer 2) ─────────────────────────────────────
    ("entities", "cep"),
    ("events", "eep"),
    ("events", "teu"),
    ("events", "timeline"),
    # ── Narrative track (layer 3) ─────────────────────────────────────────────
    ("events", "narrative_structure"),      # kernel/satellite classification
    ("summaries", "narrative_structure"),   # hero journey via chapter summaries
    ("timeline", "narrative_structure"),    # temporal ordering context
    ("events", "temporal_analysis"),        # Genette temporal displacement
    ("timeline", "temporal_analysis"),      # TemporalRelation edges
    # ── Tension track (layer 3 → 4) ──────────────────────────────────────────
    ("teu", "tension_lines"),
    ("tension_lines", "tension_theme"),
]

# ── Response schemas ──────────────────────────────────────────────────────────

NodeStatus = Literal["complete", "partial", "empty"]


class NodeData(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    node_id: str
    layer: int
    label: str
    status: NodeStatus
    counts: dict[str, int]
    meta: dict[str, Any] = {}


class EdgeData(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    source: str
    target: str


class UnravelingManifest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    book_id: str
    nodes: list[NodeData]
    edges: list[EdgeData]


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


def _status(complete: bool, partial: bool) -> NodeStatus:
    if complete:
        return "complete"
    if partial:
        return "partial"
    return "empty"


def _build_nodes(
    *,
    doc: Any,
    entities: list[Any],
    events: list[Event],
    temporal_rels: list[Any],
    imagery: list[Any],
    relation_count_global: int,
    cep_count: int,
    eep_count: int,
    temporal_analysis_present: bool,
    narrative_present: bool,
    hero_journey_present: bool,
    tension_lines_present: bool,
    tension_theme_present: bool,
    teu_count: int,
) -> list[NodeData]:
    nodes: list[NodeData] = []

    # ── Layer 0: 原生文本層 ────────────────────────────────────────────────────

    # book_meta
    nodes.append(NodeData(
        node_id="book_meta",
        layer=0,
        label="Book Meta",
        status="complete",
        counts={},
        meta={
            "title": doc.title or "",
            "author": doc.author or "",
            "language": doc.language or "",
        },
    ))

    # chapters
    chapter_count = len(doc.chapters)
    chapters_with_summary = sum(
        1 for ch in doc.chapters if ch.summary
    )
    nodes.append(NodeData(
        node_id="chapters",
        layer=0,
        label="Chapters",
        status=_status(
            complete=chapter_count > 0,
            partial=False,
        ),
        counts={"chapters": chapter_count},
    ))

    # summaries (derived from chapters — tracks chapter summary completion)
    nodes.append(NodeData(
        node_id="summaries",
        layer=1,
        label="Summaries",
        status=_status(
            complete=chapter_count > 0
            and chapters_with_summary == chapter_count,
            partial=chapter_count > 0
            and 0 < chapters_with_summary < chapter_count,
        ),
        counts={
            "generated": chapters_with_summary,
            "total": chapter_count,
        },
    ))

    # paragraphs
    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    para_count = len(all_paras)
    nodes.append(NodeData(
        node_id="paragraphs",
        layer=0,
        label="Paragraphs",
        status=_status(
            complete=para_count > 0,
            partial=False,
        ),
        counts={"paragraphs": para_count},
    ))

    # ── Layer 1: 知識圖譜層 ────────────────────────────────────────────────────

    # entities
    entity_count = len(entities)
    by_type: dict[str, int] = {t.value: 0 for t in EntityType}
    for e in entities:
        by_type[e.entity_type.value] = by_type.get(
            e.entity_type.value, 0
        ) + 1
    nodes.append(NodeData(
        node_id="entities",
        layer=1,
        label="Entities",
        status=_status(
            complete=entity_count > 0,
            partial=False,
        ),
        counts={"total": entity_count, **by_type},
    ))

    # relations (global count — KGService has no document_id filter)
    nodes.append(NodeData(
        node_id="relations",
        layer=1,
        label="Relations",
        status=_status(
            complete=relation_count_global > 0,
            partial=False,
        ),
        counts={"relations": relation_count_global},
        meta={"scope": "global"},
    ))

    # events
    event_count = len(events)
    events_ranked = sum(
        1 for ev in events if ev.chronological_rank is not None
    )
    events_classified = sum(
        1 for ev in events
        if ev.narrative_weight
        and ev.narrative_weight != "unclassified"
    )
    nodes.append(NodeData(
        node_id="events",
        layer=1,
        label="Events",
        status=_status(
            complete=event_count > 0
            and events_ranked == event_count
            and events_classified == event_count,
            partial=event_count > 0 and (
                events_ranked < event_count
                or events_classified < event_count
            ),
        ),
        counts={
            "events": event_count,
            "events_with_chronological_rank": events_ranked,
            "events_classified": events_classified,
        },
    ))

    # ── Layer 2: 深度分析層 ────────────────────────────────────────────────────

    # timeline (events ranked by chronological order + TemporalRelation KG edges)
    tr_count = len(temporal_rels)
    nodes.append(NodeData(
        node_id="timeline",
        layer=2,
        label="Timeline",
        status=_status(
            complete=event_count > 0 and events_ranked == event_count,
            partial=events_ranked > 0 and events_ranked < event_count,
        ),
        counts={
            "events_ranked": events_ranked,
            "total_events": event_count,
            "temporal_relations": tr_count,
        },
    ))

    # symbols
    imagery_count = len(imagery)
    occurrence_count = sum(img.frequency for img in imagery)
    nodes.append(NodeData(
        node_id="symbols",
        layer=2,
        label="Symbols",
        status=_status(
            complete=imagery_count > 0,
            partial=False,
        ),
        counts={
            "imagery_entities": imagery_count,
            "symbol_occurrences": occurrence_count,
        },
    ))

    # cep (Character Emotional Profile)
    total_chars = by_type.get(EntityType.CHARACTER.value, 0)
    nodes.append(NodeData(
        node_id="cep",
        layer=2,
        label="CEP",
        status=_status(
            complete=cep_count > 0
            and total_chars > 0
            and cep_count >= total_chars,
            partial=cep_count > 0
            and cep_count < total_chars,
        ),
        counts={
            "analyzed": cep_count,
            "total_characters": total_chars,
        },
    ))

    # eep (Event Emotional Profile)
    nodes.append(NodeData(
        node_id="eep",
        layer=2,
        label="EEP",
        status=_status(
            complete=eep_count > 0
            and event_count > 0
            and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={
            "analyzed": eep_count,
            "total_events": event_count,
        },
    ))

    # teu (Tension Evidence Unit — per-event tension score, layer 2)
    nodes.append(NodeData(
        node_id="teu",
        layer=2,
        label="TEU",
        status=_status(
            complete=teu_count > 0
            and event_count > 0
            and teu_count >= event_count,
            partial=teu_count > 0 and teu_count < event_count,
        ),
        counts={
            "analyzed": teu_count,
            "total_events": event_count,
        },
    ))

    # ── Layer 3: 合成層（三條平行分析線）────────────────────────────────────────

    # narrative_structure (敘事學) — K/S classification + Hero Journey (layer 3)
    nodes.append(NodeData(
        node_id="narrative_structure",
        layer=3,
        label="Narrative Structure",
        status=_status(
            complete=narrative_present and hero_journey_present,
            partial=narrative_present or hero_journey_present,
        ),
        counts={
            "has_ks_classification": int(narrative_present),
            "has_hero_journey": int(hero_journey_present),
        },
    ))

    # temporal_analysis (敘事學) — Genette temporal displacement (layer 3)
    nodes.append(NodeData(
        node_id="temporal_analysis",
        layer=3,
        label="Temporal Analysis",
        status=_status(
            complete=temporal_analysis_present,
            partial=False,
        ),
        counts={"built": int(temporal_analysis_present)},
    ))

    # tension_lines (張力學) — cross-scene tension patterns (layer 3)
    nodes.append(NodeData(
        node_id="tension_lines",
        layer=3,
        label="Tension Lines",
        status=_status(
            complete=tension_lines_present,
            partial=False,
        ),
        counts={"built": int(tension_lines_present)},
    ))

    # ── Layer 4: 書籍層面合成 ─────────────────────────────────────────────────

    # tension_theme (張力學) — book-level tension proposition (layer 4)
    nodes.append(NodeData(
        node_id="tension_theme",
        layer=4,
        label="Tension Theme",
        status=_status(
            complete=tension_theme_present,
            partial=False,
        ),
        counts={"built": int(tension_theme_present)},
    ))

    return nodes


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
    ) = await asyncio.gather(
        cache.count_keys(f"character:{book_id}:%"),
        cache.count_keys(f"event:{book_id}:%"),
        _key_exists(cache, f"temporal_analysis:{book_id}"),
        _key_exists(cache, f"narrative_structure:{book_id}"),
        _key_exists(cache, f"hero_journey:{book_id}"),
        _key_exists(cache, f"tension_lines:{book_id}"),
        _key_exists(cache, f"tension_theme:{book_id}"),
        _count_teu_keys(cache, event_ids),
    )

    nodes = _build_nodes(
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
    )

    edges = [
        EdgeData(source=src, target=tgt) for src, tgt in _EDGES
    ]

    return UnravelingManifest(
        book_id=book_id,
        nodes=nodes,
        edges=edges,
    )
