"""Timeline endpoints for a book — split out of ``books.py``.

Covers the timeline configuration (#12a–#12c) and the assembled timeline
itself (#13a–#13b).  Shares the ``/books`` prefix with ``books.py``; the
endpoint paths are unchanged.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from storysphere.api.deps import (
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    TemporalPipelineDep,
)
from storysphere.api.schemas.books import (
    LocationRef,
    ParticipantRef,
    TaskIdResponse,
    TemporalDisplacementEntry,
    TemporalRelationEntry,
    TimelineConfigResponse,
    TimelineConfigUpdate,
    TimelineDetectionResponse,
    TimelineEventEntry,
    TimelineQuality,
    TimelineResponse,
)
from storysphere.api.store import task_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ── Timeline config endpoints ────────────────────────────────────────────────


@router.get("/{book_id}/timeline-config", response_model=TimelineConfigResponse)
async def get_timeline_config(book_id: str, doc: DocServiceDep) -> dict:
    """Get the timeline snapshot configuration for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    if document.timeline_config is None:
        raise HTTPException(
            status_code=404,
            detail="Timeline config not yet set. Run ingestion first.",
        )
    return document.timeline_config.model_dump()


@router.put("/{book_id}/timeline-config", response_model=TimelineConfigResponse)
async def update_timeline_config(
    book_id: str,
    body: TimelineConfigUpdate,
    doc: DocServiceDep,
) -> dict:
    """Update (confirm or change) the timeline snapshot configuration."""
    from datetime import datetime  # noqa: PLC0415

    from storysphere.domain.timeline import TimelineConfig  # noqa: PLC0415

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    cfg = document.timeline_config or TimelineConfig()
    update = body.model_dump(exclude_none=True)
    updated = cfg.model_copy(update={**update, "configured_at": datetime.utcnow()})
    document.timeline_config = updated
    await doc.save_document(document)
    return updated.model_dump()


@router.post("/{book_id}/detect-timeline", response_model=TimelineDetectionResponse)
async def detect_timeline(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> dict:
    """Re-run timeline structure detection for a book."""
    from storysphere.domain.timeline import TimelineConfig, TimelineDetectionResult  # noqa: PLC0415

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    events = await kg.get_events(document_id=book_id)
    distinct_chapters = {
        e.chapter for e in events if e.chapter and e.chapter > 0
    }
    ranked_count = sum(1 for e in events if e.chronological_rank is not None)
    chapter_count = len(distinct_chapters)

    result = TimelineDetectionResult(
        book_id=book_id,
        chapter_count=chapter_count,
        event_count=len(events),
        ranked_event_count=ranked_count,
        chapter_mode_viable=chapter_count > 1,
        story_mode_viable=ranked_count > 0,
    )

    # Update config, preserving any existing user choices
    existing = document.timeline_config
    document.timeline_config = TimelineConfig(
        chapter_mode_enabled=existing.chapter_mode_enabled if existing else False,
        story_mode_enabled=existing.story_mode_enabled if existing else False,
        default_mode=existing.default_mode if existing else "chapter",
        # Chapter-mode sliders run over the book's chapters, so the config
        # stores the story length — not how many chapters happen to carry an
        # event (a book whose last chapters have none would clamp too early).
        total_chapters=document.body_chapter_count,
        total_events=len(events),
        total_ranked_events=ranked_count,
        chapter_mode_configured=existing.chapter_mode_configured if existing else False,
        story_mode_configured=existing.story_mode_configured if existing else False,
    )
    await doc.save_document(document)
    return result.model_dump()


# ── Timeline endpoints ───────────────────────────────────────────────────────


def _read_temporal_analysis(
    cached: object,
) -> tuple[bool, str | None, dict[str, TemporalDisplacementEntry]]:
    """Unpack a cached ``TemporalAnalysis`` (#21h) for the timeline response.

    A cached run with ``coverage_sufficient`` false returned before calling the
    LLM and carries no verdicts, so it reads as *never analyzed* rather than as
    an analysis that found nothing — the two look identical downstream and only
    the first is honest.
    """
    if not isinstance(cached, dict) or not cached.get("coverage_sufficient"):
        return False, None, {}

    displacements: dict[str, TemporalDisplacementEntry] = {}
    for raw in cached.get("displacements") or []:
        try:
            displacements[raw["event_id"]] = TemporalDisplacementEntry(
                type=raw["displacement_type"],
                displacement=raw["displacement"],
                text_rank=raw["text_rank"],
                story_rank=raw["story_rank"],
            )
        except (KeyError, TypeError, ValueError):
            # A malformed entry loses its own verdict, not the whole analysis.
            continue

    return True, cached.get("story_time_structure"), displacements


@router.get("/{book_id}/timeline", response_model=TimelineResponse)
async def get_book_timeline(
    book_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    cache: AnalysisCacheDep,
    order: str = "chronological",
    event_type: str | None = None,
) -> dict:
    """Get the global event timeline for a book.

    Query params:
        order: "narrative" (chapter order) or "chronological".
        event_type: optional filter by event type.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found",
        )

    all_events = await kg.get_events(document_id=book_id)

    # Build chapter_title lookup from already-fetched document (zero extra I/O)
    chapter_title_map: dict[int, str | None] = {
        ch.number: ch.title for ch in document.chapters
    }

    # Compute EEP coverage; also extract event_importance from cache
    from storysphere.services.analysis_models import EventAnalysisResult  # noqa: PLC0415
    analyzed_count = 0
    event_importance_map: dict[str, str] = {}
    analyzed_ids: set[str] = set()
    for ev in all_events:
        cache_key = f"event:{book_id}:{ev.id}"
        # Presence alone counts as analysed here — an entry whose shape has
        # drifted still means the event was analysed, it just cannot supply an
        # importance. Reading via get_as would drop it from the coverage stats.
        cached = await cache.get(cache_key)
        if cached is not None:
            analyzed_count += 1
            analyzed_ids.add(ev.id)
            try:
                result = EventAnalysisResult.model_validate(cached)
                event_importance_map[ev.id] = result.eep.event_importance.name
            except Exception:
                pass

    total = len(all_events)
    has_ranks = any(
        e.chronological_rank is not None for e in all_events
    )
    quality = TimelineQuality(
        total_count=total,
        analyzed_count=analyzed_count,
        eep_coverage=(
            analyzed_count / total if total > 0 else 0.0
        ),
        has_chronological_ranks=has_ranks,
    )

    # Apply event_type filter after coverage calculation
    events = all_events
    if event_type:
        events = [
            e for e in events
            if e.event_type.value == event_type
        ]

    if order == "chronological":
        events.sort(
            key=lambda e: (
                e.chronological_rank
                if e.chronological_rank is not None
                else float("inf"),
                e.chapter,
            )
        )
    else:
        events.sort(key=lambda e: e.chapter)

    # Batch-fetch all participant + location entities
    participant_ids: set[str] = set()
    location_ids: set[str] = set()
    for ev in events:
        participant_ids.update(ev.participants)
        if ev.location_id is not None:
            location_ids.add(ev.location_id)

    all_entity_ids = list(participant_ids | location_ids)
    if all_entity_ids:
        entity_results = await asyncio.gather(
            *[kg.get_entity(eid) for eid in all_entity_ids],
        )
    else:
        entity_results = []
    entity_map = {
        eid: ent
        for eid, ent in zip(all_entity_ids, entity_results, strict=True)
        if ent is not None
    }

    temporal_relations = await kg.get_temporal_relations(
        document_id=book_id,
    )

    temporal_analyzed, temporal_structure, displacement_map = _read_temporal_analysis(
        await cache.get(f"temporal_analysis:{book_id}")
    )
    from storysphere.services.cache_invalidation import staleness  # noqa: PLC0415
    temporal_is_stale, temporal_stale_reason = await staleness(
        cache, f"temporal_analysis:{book_id}", document.pipeline_status
    )

    return TimelineResponse(
        book_id=book_id,
        order=order,
        temporal_is_stale=temporal_is_stale,
        temporal_stale_reason=temporal_stale_reason,
        events=[
            TimelineEventEntry(
                id=e.id,
                title=e.title,
                event_type=e.event_type.value,
                description=e.description,
                chapter=e.chapter,
                chapter_title=chapter_title_map.get(e.chapter),
                narrative_mode=e.narrative_mode.value,
                chronological_rank=e.chronological_rank,
                story_time_hint=e.story_time_hint,
                event_importance=event_importance_map.get(e.id),
                has_analysis=e.id in analyzed_ids,
                temporal_displacement=displacement_map.get(e.id),
                participants=[
                    ParticipantRef(
                        id=pid,
                        name=entity_map[pid].name if pid in entity_map else pid,
                        type=entity_map[pid].entity_type.value if pid in entity_map else "other",
                    )
                    for pid in e.participants
                ],
                location=(
                    LocationRef(
                        id=e.location_id,
                        name=entity_map[e.location_id].name,
                    )
                    if e.location_id and e.location_id in entity_map
                    else None
                ),
            )
            for e in events
        ],
        temporal_relations=[
            TemporalRelationEntry(
                source=tr.source_event_id,
                target=tr.target_event_id,
                type=tr.relation_type.value,
                confidence=tr.confidence,
            )
            for tr in temporal_relations
        ],
        quality=quality,
        temporal_analyzed=temporal_analyzed,
        temporal_structure=temporal_structure,
    ).model_dump(by_alias=True)


async def _run_temporal_pipeline(
    task_id: str,
    book_id: str,
    pipeline: Any,
    language: str,
) -> None:
    """Background task for temporal pipeline computation."""
    try:
        task_store.set_running(task_id)
        result = await pipeline.run(
            book_id,
            language=language,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
        )
        task_store.set_completed(
            task_id,
            result={
                "temporal_relations": result.temporal_relations,
                "events_ranked": result.events_ranked,
                "cycles_resolved": result.cycles_resolved,
                "errors": result.errors,
            },
        )
    except Exception as exc:
        logger.error("Temporal pipeline failed: %s", exc)
        task_store.set_failed(task_id, error=str(exc))


@router.post(
    "/{book_id}/timeline/compute",
    response_model=TaskIdResponse,
    status_code=202,
)
async def compute_book_timeline(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    pipeline: TemporalPipelineDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger temporal timeline computation for a book.

    Requires EEP (event analysis) to have been run first for best results.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    events = await kg.get_events(document_id=book_id)
    if not events:
        raise HTTPException(status_code=400, detail="No events found for this book")

    language = await doc.get_document_language(book_id)
    task_id = str(uuid4())
    task_store.create(task_id, kind="event", title="時間軸生成")
    background_tasks.add_task(
        _run_temporal_pipeline, task_id, book_id, pipeline, language
    )

    logger.info("Triggered temporal pipeline: book=%s, task=%s", book_id, task_id)
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)
