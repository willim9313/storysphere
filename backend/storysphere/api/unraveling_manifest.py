"""Assembly of the Unraveling manifest — the DAG and its node statuses.

Lifted out of ``routers/unraveling.py``, where ``build_nodes`` alone was 338
lines and every new node in B-046 added to it. The router is left with what a
router is for: fetching, and handing the result to the response model.

It lives in ``api/`` rather than ``services/`` on purpose. ``build_nodes``
returns ``NodeData`` — an API schema — so moving it any deeper would point a
service at the API layer, the reverse dependency the workflows→api reporter
port was introduced to cut. ``compute_chapter_distributions`` is pure and
could sit in ``domain/``, but splitting the two halves of one manifest across
layers to satisfy that would cost more than it buys."""


from __future__ import annotations

from typing import Any

from storysphere.api.schemas.unraveling import NodeData, NodeStatus
from storysphere.domain.documents import ChapterRole
from storysphere.domain.entities import EntityType
from storysphere.domain.events import Event

# ── Static DAG edges ──────────────────────────────────────────────────────────

EDGES: list[tuple[str, str]] = [
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
    ("sep", "symbol_analysis_result"),
    ("kg_entity", "symbol_analysis_result"),
    ("kg_event", "symbol_analysis_result"),
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
    # ── Layer 3: voice profile ────────────────────────────────────────────────
    ("kg_entity", "voice_profile"),
    ("paragraphs", "voice_profile"),
    # ── Layer 4 ───────────────────────────────────────────────────────────────
    ("tension_lines", "tension_theme"),
    ("kg_temporal_relation", "chronological_rank"),
]


def status_of(complete: bool, partial: bool) -> NodeStatus:
    if complete:
        return "complete"
    if partial:
        return "partial"
    return "empty"


def build_nodes(
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
    symbol_analysis_count: int,
    voice_profile_count: int,
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

    # Everything on this page counts body chapters only. The pipeline never
    # summarises, indexes or extracts from front/back matter, so including it
    # would leave downstream nodes permanently short of their own total and
    # reading as "still running" long after ingestion finished.
    body_chapters = [ch for ch in doc.chapters if ch.role == ChapterRole.body]
    chapter_count = len(body_chapters)
    nodes.append(NodeData(
        node_id="chapters",
        layer=0,
        label="Chapters",
        status=status_of(complete=chapter_count > 0, partial=False),
        counts={"chapters": chapter_count},
    ))

    all_paras = [p for ch in body_chapters for p in ch.paragraphs]
    para_count = len(all_paras)
    nodes.append(NodeData(
        node_id="paragraphs",
        layer=0,
        label="Chunks",
        status=status_of(complete=para_count > 0, partial=False),
        counts={"paragraphs": para_count},
    ))

    # ── Layer 1: 知識抽取層 ────────────────────────────────────────────────────

    chapters_with_summary = sum(1 for ch in body_chapters if ch.summary)
    nodes.append(NodeData(
        node_id="summaries",
        layer=1,
        label="Summaries",
        status=status_of(
            complete=chapter_count > 0 and chapters_with_summary == chapter_count,
            partial=chapter_count > 0 and 0 < chapters_with_summary < chapter_count,
        ),
        counts={"generated": chapters_with_summary, "total": chapter_count},
    ))

    chapters_with_keywords = sum(1 for ch in body_chapters if ch.keywords)
    nodes.append(NodeData(
        node_id="keywords",
        layer=1,
        label="Keywords",
        status=status_of(
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
        status=status_of(complete=imagery_count > 0, partial=False),
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
        status=status_of(complete=entity_count > 0, partial=False),
        counts={"total": entity_count, **by_type},
        parent_id="kg_features",
    ))

    concept_ner = sum(1 for e in concept_entities if e.extraction_method == "ner")
    concept_inferred = sum(1 for e in concept_entities if e.extraction_method == "inferred")
    nodes.append(NodeData(
        node_id="kg_concept",
        layer=1,
        label="Concepts",
        # Two halves, two producers: NER fills `ner` during ingestion, while the
        # `inferred` half is a separate pre-analysis step (B-025) that nothing
        # currently triggers. Counting either half alone as complete let 27
        # surface concepts report this node as built while `inferred` had never
        # been anything but zero — on the one page whose job is to say what is
        # still missing.
        status=status_of(
            complete=concept_ner > 0 and concept_inferred > 0,
            partial=len(concept_entities) > 0,
        ),
        counts={"ner": concept_ner, "inferred": concept_inferred, "total": len(concept_entities)},
        parent_id="kg_features",
    ))

    nodes.append(NodeData(
        node_id="kg_relation",
        layer=1,
        label="Relations",
        status=status_of(complete=relation_count_global > 0, partial=False),
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
        status=status_of(
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
        status=status_of(
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
        status=status_of(
            complete=cep_count > 0 and total_chars > 0 and cep_count >= total_chars,
            partial=cep_count > 0 and cep_count < total_chars,
        ),
        counts={"analyzed": cep_count, "total_characters": total_chars},
    ))

    nodes.append(NodeData(
        node_id="eep",
        layer=2,
        label="EEP",
        status=status_of(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="teu",
        layer=2,
        label="TEU",
        status=status_of(
            complete=teu_count > 0 and event_count > 0 and teu_count >= event_count,
            partial=teu_count > 0 and teu_count < event_count,
        ),
        counts={"analyzed": teu_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="sep",
        layer=2,
        label="SEP",
        status=status_of(
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
        status=status_of(
            complete=cep_count > 0 and total_chars > 0 and cep_count >= total_chars,
            partial=cep_count > 0 and cep_count < total_chars,
        ),
        counts={"analyzed": cep_count, "total_characters": total_chars},
    ))

    # Voice profiles are built on-demand per character; no batch endpoint exists yet,
    # so "complete" is never set — partial once any profile exists.
    nodes.append(NodeData(
        node_id="voice_profile",
        layer=3,
        label="Voice\nProfile",
        status=status_of(
            complete=False,
            partial=voice_profile_count > 0,
        ),
        counts={"analyzed": voice_profile_count, "total_characters": total_chars},
    ))

    nodes.append(NodeData(
        node_id="symbol_analysis_result",
        layer=3,
        label="Symbol\nAnalysis",
        status=status_of(
            complete=(
                symbol_analysis_count > 0
                and imagery_count > 0
                and symbol_analysis_count >= imagery_count
            ),
            partial=symbol_analysis_count > 0 and symbol_analysis_count < imagery_count,
        ),
        counts={"analyzed": symbol_analysis_count, "total_imagery": imagery_count},
    ))

    nodes.append(NodeData(
        node_id="causality_analysis",
        layer=3,
        label="Causality\nAnalysis",
        status=status_of(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="impact_analysis",
        layer=3,
        label="Impact\nAnalysis",
        status=status_of(
            complete=eep_count > 0 and event_count > 0 and eep_count >= event_count,
            partial=eep_count > 0 and eep_count < event_count,
        ),
        counts={"analyzed": eep_count, "total_events": event_count},
    ))

    nodes.append(NodeData(
        node_id="tension_lines",
        layer=3,
        label="Tension Lines",
        status=status_of(complete=tension_lines_present, partial=False),
        counts={"built": int(tension_lines_present)},
    ))

    nodes.append(NodeData(
        node_id="narrative_structure",
        layer=3,
        label="Narrative\nStructure",
        status=status_of(complete=narrative_present, partial=False),
        counts={"has_ks_classification": int(narrative_present)},
    ))

    nodes.append(NodeData(
        node_id="hero_journey_stage",
        layer=3,
        label="Hero Journey",
        status=status_of(complete=hero_journey_present, partial=False),
        counts={"built": int(hero_journey_present)},
    ))

    nodes.append(NodeData(
        node_id="temporal_analysis",
        layer=3,
        label="Temporal\nAnalysis",
        status=status_of(complete=temporal_analysis_present, partial=False),
        counts={"built": int(temporal_analysis_present)},
    ))

    # ── Layer 4: 書籍層面合成 ─────────────────────────────────────────────────

    nodes.append(NodeData(
        node_id="tension_theme",
        layer=4,
        label="Tension Theme",
        status=status_of(complete=tension_theme_present, partial=False),
        counts={"built": int(tension_theme_present)},
    ))

    nodes.append(NodeData(
        node_id="chronological_rank",
        layer=4,
        label="Chronological\nRank",
        status=status_of(
            complete=event_count > 0 and events_ranked == event_count,
            partial=events_ranked > 0 and events_ranked < event_count,
        ),
        counts={"events_ranked": events_ranked, "total_events": event_count},
    ))

    return nodes


def compute_chapter_distributions(
    *,
    doc: Any,
    events: list[Event],
    imagery: list[Any],
) -> dict[str, list[int]]:
    """Build per-chapter counts for chapter-aware nodes.

    Only body chapters are emitted — front/back matter carries no story
    chapter number, so it has no slot on a chapter axis. Output lists are
    ordered by chapter number and their length is the book's body chapter
    count; positions are looked up by number rather than assumed.
    """
    chapters = sorted(
        (c for c in doc.chapters if c.role == ChapterRole.body),
        key=lambda c: c.number,
    )
    n = len(chapters)
    out: dict[str, list[int]] = {}

    if n == 0:
        return out

    # paragraphs / summaries / keywords — derived directly from chapters
    out["paragraphs"] = [len(ch.paragraphs) for ch in chapters]
    out["summaries"] = [1 if ch.summary else 0 for ch in chapters]
    out["keywords"] = [1 if ch.keywords else 0 for ch in chapters]

    # kg_event — count of events per chapter
    event_dist = [0] * n
    chapter_index_by_number = {ch.number: i for i, ch in enumerate(chapters)}
    for ev in events:
        idx = chapter_index_by_number.get(ev.chapter)
        if idx is not None:
            event_dist[idx] += 1
    out["kg_event"] = event_dist

    # symbols — sum chapter_distribution across all imagery entities
    sym_dist = [0] * n
    for img in imagery:
        for ch_num, count in (img.chapter_distribution or {}).items():
            idx = chapter_index_by_number.get(ch_num)
            if idx is not None:
                sym_dist[idx] += count
    out["symbols"] = sym_dist

    return out
