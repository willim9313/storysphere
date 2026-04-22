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
    ("chapters", "paragraphs"),
    # ── Ingest outputs (layer 1) ──────────────────────────────────────────────
    ("chapters", "summaries"),
    ("paragraphs", "keywords"),
    ("paragraphs", "symbols"),
    ("paragraphs", "kg_entity"),
    ("paragraphs", "kg_concept"),
    ("paragraphs", "kg_relation"),
    ("paragraphs", "kg_event"),
    # ── KG on-demand sub-nodes ────────────────────────────────────────────────
    ("eep", "kg_temporal_relation"),
    ("kg_event", "kg_temporal_relation"),
    # ── Layer 2: analysis intermediates ──────────────────────────────────────
    ("kg_entity", "cep"),
    ("paragraphs", "cep"),
    ("keywords", "cep"),
    ("kg_event", "eep"),
    ("kg_entity", "eep"),
    ("paragraphs", "eep"),
    ("kg_event", "teu"),
    ("kg_concept", "teu"),
    ("summaries", "teu"),
    ("symbols", "sep"),
    ("kg_entity", "sep"),
    # ── Layer 3: derived results ──────────────────────────────────────────────
    ("cep", "character_analysis_result"),
    ("eep", "causality_analysis"),
    ("kg_event", "causality_analysis"),
    ("eep", "impact_analysis"),
    ("kg_event", "impact_analysis"),
    ("teu", "tension_lines"),
    ("summaries", "narrative_structure"),
    ("kg_event", "narrative_structure"),
    ("eep", "narrative_structure"),
    ("summaries", "hero_journey_stage"),
    ("eep", "temporal_analysis"),
    ("kg_event", "temporal_analysis"),
    # ── Layer 4 ───────────────────────────────────────────────────────────────
    ("tension_lines", "tension_theme"),
    ("kg_temporal_relation", "chronological_rank"),
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
    parent_id: str | None = None


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
    sep_count: int,
) -> list[NodeData]:
    nodes: list[NodeData] = []

    # ── Layer 0: 原生文本層 ────────────────────────────────────────────────────

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

    chapter_count = len(doc.chapters)
    nodes.append(NodeData(
        node_id="chapters",
        layer=0,
        label="Chapters",
        status=_status(complete=chapter_count > 0, partial=False),
        counts={"chapters": chapter_count},
    ))

    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    para_count = len(all_paras)
    nodes.append(NodeData(
        node_id="paragraphs",
        layer=0,
        label="Chunks",
        status=_status(complete=para_count > 0, partial=False),
        counts={"paragraphs": para_count},
    ))

    # ── Layer 1: 知識抽取層 ────────────────────────────────────────────────────

    chapters_with_summary = sum(1 for ch in doc.chapters if ch.summary)
    nodes.append(NodeData(
        node_id="summaries",
        layer=1,
        label="Summaries",
        status=_status(
            complete=chapter_count > 0 and chapters_with_summary == chapter_count,
            partial=chapter_count > 0 and 0 < chapters_with_summary < chapter_count,
        ),
        counts={"generated": chapters_with_summary, "total": chapter_count},
    ))

    chapters_with_keywords = sum(1 for ch in doc.chapters if ch.keywords)
    nodes.append(NodeData(
        node_id="keywords",
        layer=1,
        label="Keywords",
        status=_status(
            complete=chapter_count > 0 and chapters_with_keywords == chapter_count,
            partial=chapter_count > 0 and 0 < chapters_with_keywords < chapter_count,
        ),
        counts={"generated": chapters_with_keywords, "total": chapter_count},
    ))

    imagery_count = len(imagery)
    occurrence_count = sum(img.frequency for img in imagery)
    nodes.append(NodeData(
        node_id="symbols",
        layer=1,
        label="Symbols",
        status=_status(complete=imagery_count > 0, partial=False),
        counts={"imagery_entities": imagery_count, "symbol_occurrences": occurrence_count},
    ))

    # ── Layer 1: KG 子節點（compound group = kg_features）────────────────────

    # Partition entities: concepts vs non-concepts
    concept_entities = [e for e in entities if e.entity_type == EntityType.CONCEPT]
    non_concept_entities = [e for e in entities if e.entity_type != EntityType.CONCEPT]

    by_type: dict[str, int] = {t.value: 0 for t in EntityType if t != EntityType.CONCEPT}
    for e in non_concept_entities:
        by_type[e.entity_type.value] = by_type.get(e.entity_type.value, 0) + 1

    entity_count = len(non_concept_entities)
    nodes.append(NodeData(
        node_id="kg_entity",
        layer=1,
        label="Entities",
        status=_status(complete=entity_count > 0, partial=False),
        counts={"total": entity_count, **by_type},
        parent_id="kg_features",
    ))

    concept_ner = sum(1 for e in concept_entities if e.extraction_method == "ner")
    concept_inferred = sum(1 for e in concept_entities if e.extraction_method == "inferred")
    nodes.append(NodeData(
        node_id="kg_concept",
        layer=1,
        label="Concepts",
        status=_status(complete=len(concept_entities) > 0, partial=False),
        counts={"ner": concept_ner, "inferred": concept_inferred, "total": len(concept_entities)},
        parent_id="kg_features",
    ))

    nodes.append(NodeData(
        node_id="kg_relation",
        layer=1,
        label="Relations",
        status=_status(complete=relation_count_global > 0, partial=False),
        counts={"relations": relation_count_global},
        meta={"scope": "global"},
        parent_id="kg_features",
    ))

    event_count = len(events)
    events_classified = sum(
        1 for ev in events
        if ev.narrative_weight and ev.narrative_weight != "unclassified"
    )
    nodes.append(NodeData(
        node_id="kg_event",
        layer=1,
        label="Events",
        status=_status(
            complete=event_count > 0 and events_classified == event_count,
            partial=event_count > 0 and events_classified < event_count,
        ),
        counts={"events": event_count, "events_classified": events_classified},
        parent_id="kg_features",
    ))

    tr_count = len(temporal_rels)
    events_ranked = sum(1 for ev in events if ev.chronological_rank is not None)
    nodes.append(NodeData(
        node_id="kg_temporal_relation",
        layer=1,
        label="Temporal\nRelations",
        status=_status(
            complete=tr_count > 0 and events_ranked == event_count and event_count > 0,
            partial=tr_count > 0,
        ),
        counts={"temporal_relations": tr_count, "events_ranked": events_ranked},
        parent_id="kg_features",
    ))

    # ── Layer 2: 分析中間層 ────────────────────────────────────────────────────

    total_chars = by_type.get(EntityType.CHARACTER.value, 0)
    nodes.append(NodeData(
        node_id="cep",
        layer=2,
        label="CEP",
        status=_status(
            complete=cep_count > 0 and total_chars > 0 and cep_count >= total_chars,
            partial=cep_count > 0 and cep_count < total_chars,
        ),
        counts={"analyzed": cep_count, "total_characters": total_chars},
    ))

    nodes.append(NodeData(
        node_id="eep",
        layer=2,
        label="EEP",
        status=_status(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="teu",
        layer=2,
        label="TEU",
        status=_status(
            complete=teu_count > 0 and event_count > 0 and teu_count >= event_count,
            partial=teu_count > 0 and teu_count < event_count,
        ),
        counts={"analyzed": teu_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="sep",
        layer=2,
        label="SEP",
        status=_status(
            complete=sep_count > 0 and imagery_count > 0 and sep_count >= imagery_count,
            partial=sep_count > 0 and sep_count < imagery_count,
        ),
        counts={"analyzed": sep_count, "total_imagery": imagery_count},
    ))

    # ── Layer 3: 合成結果層 ────────────────────────────────────────────────────

    nodes.append(NodeData(
        node_id="character_analysis_result",
        layer=3,
        label="Character\nAnalysis",
        status=_status(
            complete=cep_count > 0 and total_chars > 0 and cep_count >= total_chars,
            partial=cep_count > 0 and cep_count < total_chars,
        ),
        counts={"analyzed": cep_count, "total_characters": total_chars},
    ))

    nodes.append(NodeData(
        node_id="causality_analysis",
        layer=3,
        label="Causality\nAnalysis",
        status=_status(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="impact_analysis",
        layer=3,
        label="Impact\nAnalysis",
        status=_status(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="tension_lines",
        layer=3,
        label="Tension Lines",
        status=_status(complete=tension_lines_present, partial=False),
        counts={"built": int(tension_lines_present)},
    ))

    nodes.append(NodeData(
        node_id="narrative_structure",
        layer=3,
        label="Narrative\nStructure",
        status=_status(complete=narrative_present, partial=False),
        counts={"has_ks_classification": int(narrative_present)},
    ))

    nodes.append(NodeData(
        node_id="hero_journey_stage",
        layer=3,
        label="Hero Journey",
        status=_status(complete=hero_journey_present, partial=False),
        counts={"built": int(hero_journey_present)},
    ))

    nodes.append(NodeData(
        node_id="temporal_analysis",
        layer=3,
        label="Temporal\nAnalysis",
        status=_status(complete=temporal_analysis_present, partial=False),
        counts={"built": int(temporal_analysis_present)},
    ))

    # ── Layer 4: 書籍層面合成 ─────────────────────────────────────────────────

    nodes.append(NodeData(
        node_id="tension_theme",
        layer=4,
        label="Tension Theme",
        status=_status(complete=tension_theme_present, partial=False),
        counts={"built": int(tension_theme_present)},
    ))

    nodes.append(NodeData(
        node_id="chronological_rank",
        layer=4,
        label="Chronological\nRank",
        status=_status(
            complete=event_count > 0 and events_ranked == event_count,
            partial=events_ranked > 0 and events_ranked < event_count,
        ),
        counts={"events_ranked": events_ranked, "total_events": event_count},
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
        sep_count,
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
        sep_count=sep_count,
    )

    edges = [
        EdgeData(source=src, target=tgt) for src, tgt in _EDGES
    ]

    return UnravelingManifest(
        book_id=book_id,
        nodes=nodes,
        edges=edges,
    )
