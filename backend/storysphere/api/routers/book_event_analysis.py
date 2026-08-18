"""Event analysis endpoints for a book — split out of ``books.py``.

Event detail (#9a), the event analysis listing (#6b), per-event analysis
(#7d–#7e), source passages (#7i) and the batch run (#7f).  Shares the
``/books`` prefix with ``books.py``; the endpoint paths are unchanged.
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
)

from storysphere.api.deps import (
    AnalysisAgentDep,
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    VectorServiceDep,
)
from storysphere.api.routers._book_shared import now_iso
from storysphere.api.schemas.books import (
    AnalysisItem,
    AnalysisListResponse,
    AnalyzeTriggerRequest,
    BatchEventAnalysisRequest,
    EventAnalysisFullResponse,
    EventDetailResponse,
    EventLocation,
    EventParticipant,
    EventSourcePassage,
    EventSourceResponse,
    TaskIdResponse,
    UnanalyzedEntity,
)
from storysphere.api.store import task_store
from storysphere.core.error_handling import is_rate_limit_error as _is_rate_limit_error
from storysphere.core.utils.data_sanitizer import DataSanitizer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ── #9a GET /books/:bookId/events/:eventId ───────────────────────────────────


@router.get("/{book_id}/events/{event_id}", response_model=EventDetailResponse)
async def get_event_detail(
    book_id: str, event_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> dict:
    """Get event detail with resolved participant and location names."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    event = await kg.get_event(event_id)
    if event is None or event.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    # Resolve participant names
    participants: list[dict] = []
    for pid in event.participants:
        entity = await kg.get_entity(pid)
        if entity:
            participants.append(
                EventParticipant(
                    id=entity.id, name=entity.name, type=entity.entity_type.value
                ).model_dump(by_alias=True)
            )

    # Resolve location name
    location = None
    if event.location_id:
        loc_entity = await kg.get_entity(event.location_id)
        if loc_entity:
            location = EventLocation(
                id=loc_entity.id, name=loc_entity.name
            ).model_dump(by_alias=True)

    return EventDetailResponse(
        id=event.id,
        title=event.title,
        event_type=event.event_type.value,
        description=event.description,
        chapter=event.chapter,
        significance=event.significance,
        consequences=event.consequences,
        participants=participants,
        location=location,
    ).model_dump(by_alias=True)


# ── #6b GET /books/:bookId/analysis/events ───────────────────────────────────


@router.get("/{book_id}/analysis/events", response_model=AnalysisListResponse)
async def list_event_analyses(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep, cache: AnalysisCacheDep
) -> dict:
    """List event analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from storysphere.services.analysis_models import EventAnalysisResult  # noqa: PLC0415

    events = await kg.get_events(document_id=book_id)
    analyzed: list[dict] = []
    unanalyzed: list[dict] = []
    for ev in events:
        narrative_mode = (
            ev.narrative_mode.value
            if ev.narrative_mode is not None and hasattr(ev.narrative_mode, "value")
            else (ev.narrative_mode if isinstance(ev.narrative_mode, str) else None)
        )
        cache_key = f"event:{book_id}:{ev.id}"
        result = await cache.get_as(cache_key, EventAnalysisResult)
        if result is not None:
            try:
                importance = (
                    result.eep.event_importance.name
                    if result.eep and hasattr(result.eep.event_importance, "name")
                    else None
                )
                analyzed.append(
                    AnalysisItem(
                        id=ev.id,
                        entity_id=ev.id,
                        section="events",
                        title=ev.title,
                        content=result.summary.summary if result.summary else "",
                        status="partial" if result.failed_parts else "complete",
                        generated_at=(
                            result.analyzed_at.isoformat()
                            if result.analyzed_at
                            else now_iso()
                        ),
                        chapter=ev.chapter,
                        narrative_mode=narrative_mode,
                        importance=importance,
                    ).model_dump(by_alias=True)
                )
            except Exception:
                logger.warning("Failed to parse cached event analysis for %s", ev.id)
                unanalyzed.append(
                    UnanalyzedEntity(
                        id=ev.id,
                        name=ev.title,
                        type="event",
                        chapter_count=0,
                        chapter=ev.chapter,
                        narrative_mode=narrative_mode,
                    ).model_dump(by_alias=True)
                )
        else:
            unanalyzed.append(
                UnanalyzedEntity(
                    id=ev.id,
                    name=ev.title,
                    type="event",
                    chapter_count=0,
                    chapter=ev.chapter,
                    narrative_mode=narrative_mode,
                ).model_dump(by_alias=True)
            )

    return AnalysisListResponse(
        analyzed=analyzed,
        unanalyzed=unanalyzed,
    ).model_dump(by_alias=True)


# ── #7d POST /books/:bookId/events/:eventId/analyze ─────────────────────────


async def _run_event_analysis(
    task_id: str, event_id: str, document_id: str, agent, language: str = "en",
    retry_parts: list[str] | None = None, force_refresh: bool = False,
) -> None:
    logger.info("Event analysis task %s started: event=%s, doc=%s", task_id, event_id, document_id)
    task_store.set_running(task_id)
    try:
        result = await agent.analyze_event(
            event_id=event_id,
            document_id=document_id,
            language=language,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
            retry_parts=retry_parts,
            force_refresh=force_refresh,
        )
        task_store.set_completed(task_id, result=result.model_dump())
        logger.info("Event analysis task %s completed: event=%s", task_id, event_id)
    except Exception as exc:
        logger.exception("Event analysis task %s failed: event=%s", task_id, event_id)
        task_store.set_failed(task_id, error=str(exc))


@router.post(
    "/{book_id}/events/{event_id}/analyze",
    response_model=TaskIdResponse,
)
async def trigger_event_analysis(
    book_id: str,
    event_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    agent: AnalysisAgentDep,
    cache: AnalysisCacheDep,
    background_tasks: BackgroundTasks,
    body: AnalyzeTriggerRequest = AnalyzeTriggerRequest(),
) -> dict:
    """Trigger deep analysis for a single event.

    ``mode='retryFailed'`` re-runs only the cached result's failed parts;
    ``mode='full'`` forces a complete re-analysis.
    """
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    language = await doc.get_document_language(book_id)

    retry_parts: list[str] | None = None
    force_refresh = False
    if body.mode == "retryFailed":
        from storysphere.services.analysis_models import EventAnalysisResult  # noqa: PLC0415
        cached = await cache.get_as(f"event:{book_id}:{event_id}", EventAnalysisResult)
        if cached:
            retry_parts = cached.failed_parts
    else:
        force_refresh = True

    logger.info(
        "Triggering event analysis: event=%s (%s), book=%s, lang=%s, mode=%s",
        event.title, event_id, book_id, language, body.mode,
    )
    task_id = str(uuid4())
    task_store.create(task_id, kind="event", title="事件分析")
    background_tasks.add_task(
        _run_event_analysis, task_id, event_id, book_id, agent, language,
        retry_parts, force_refresh,
    )

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7d-get GET /books/:bookId/events/:eventId/analysis ──────────────────────


@router.get(
    "/{book_id}/events/{event_id}/analysis",
    response_model=EventAnalysisFullResponse,
)
async def get_event_analysis(
    book_id: str, event_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> EventAnalysisFullResponse:
    """Return cached EEP / causality / impact analysis for a single event."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    from storysphere.api.schemas.books import (  # noqa: PLC0415
        CausalityResponse,
        EepParticipantRole,
        EepResponse,
        ImpactResponse,
    )
    from storysphere.services.analysis_models import EventAnalysisResult  # noqa: PLC0415

    cache_key = f"event:{book_id}:{event_id}"
    result = await cache.get_as(cache_key, EventAnalysisResult)
    if result is None:
        raise HTTPException(status_code=404, detail="Event analysis not found. Run analysis first.")
    return EventAnalysisFullResponse(
        event_id=result.event_id,
        title=result.title,
        eep=EepResponse(
            state_before=result.eep.state_before,
            state_after=result.eep.state_after,
            causal_factors=result.eep.causal_factors,
            prior_event_ids=result.eep.prior_event_ids,
            subsequent_event_ids=result.eep.subsequent_event_ids,
            participant_roles=[
                EepParticipantRole(
                    entity_id=pr.entity_id,
                    entity_name=pr.entity_name,
                    role=pr.role.value,
                    impact_description=pr.impact_description,
                )
                for pr in result.eep.participant_roles
            ],
            consequences=result.eep.consequences,
            structural_role=result.eep.structural_role,
            event_importance=result.eep.event_importance.name,
            thematic_significance=result.eep.thematic_significance,
            text_evidence=result.eep.text_evidence,
            key_quotes=result.eep.key_quotes,
            top_terms=result.eep.top_terms,
        ),
        causality=CausalityResponse(
            root_cause=result.causality.root_cause,
            causal_chain=result.causality.causal_chain,
            trigger_event_ids=result.causality.trigger_event_ids,
            chain_summary=result.causality.chain_summary,
        ),
        impact=ImpactResponse(
            affected_participant_ids=result.impact.affected_participant_ids,
            participant_impacts=result.impact.participant_impacts,
            relation_changes=result.impact.relation_changes,
            subsequent_event_ids=result.impact.subsequent_event_ids,
            impact_summary=result.impact.impact_summary,
        ),
        summary={"summary": result.summary.summary if result.summary else ""},
        status="partial" if result.failed_parts else "complete",
        failed_parts=result.failed_parts,
        analyzed_at=result.analyzed_at.isoformat() if result.analyzed_at else None,
        chapter=event.chapter,
        chunk=event.narrative_position,
        narrative_mode=(
            event.narrative_mode.value
            if event.narrative_mode is not None and hasattr(event.narrative_mode, "value")
            else (event.narrative_mode if isinstance(event.narrative_mode, str) else None)
        ),
    )


# ── #7e DELETE /books/:bookId/events/:eventId/analysis ───────────────────────


@router.delete("/{book_id}/events/{event_id}/analysis", status_code=204)
async def delete_event_analysis(
    book_id: str, event_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> None:
    """Delete event analysis from cache."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    cache_key = f"event:{book_id}:{event_id}"
    await cache.invalidate(cache_key)
    logger.info("Deleted event analysis cache: key=%s", cache_key)


# ── #7i GET /books/:bookId/events/:eventId/source ────────────────────────────


@router.get(
    "/{book_id}/events/{event_id}/source",
    response_model=EventSourceResponse,
)
async def get_event_source_passages(
    book_id: str,
    event_id: str,
    kg: KGServiceDep,
    vector: VectorServiceDep,
    limit: int = 3,
) -> EventSourceResponse:
    """Return the source paragraphs most likely to describe this event.

    Events carry no chunk reference, so the passage is *retrieved*, not looked
    up: the same vector query the EEP builder uses for ``text_evidence``
    (``"{title} {description}"``). Callers must present the result as "most
    relevant passages", not as the event's canonical source text.
    """
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    if vector is None:
        return EventSourceResponse(event_id=event_id, passages=[])

    want = max(1, min(limit, 10))
    # Over-fetch, then keep only hits from the event's own chapter. Unfiltered
    # similarity on "{title} {description}" strays badly — measured on the
    # sample book, a third of events matched a passage from another chapter
    # entirely. The chapter is reliable metadata, so use it to constrain.
    results = await vector.search(
        query_text=f"{event.title} {event.description}",
        top_k=max(want * 4, 12),
        document_id=book_id,
    )
    field = DataSanitizer.result_field
    results = [r for r in results if field(r, "chapter_number") == event.chapter][:want]
    passages = [
        EventSourcePassage(
            id=str(field(r, "id", "")),
            text=DataSanitizer.sanitize_for_template(field(r, "text", "")),
            chapter_number=field(r, "chapter_number"),
            score=float(field(r, "score", 0.0)),
        )
        for r in results
        if field(r, "text")
    ]
    return EventSourceResponse(event_id=event_id, passages=passages)


# ── #7f POST /books/:bookId/events/analyze-all ───────────────────────────────


async def _run_batch_event_analysis(
    task_id: str,
    document_id: str,
    agent,
    kg_service,
    cache,
    language: str = "en",
    event_ids: list[str] | None = None,
) -> None:
    """Background task: analyze all unanalyzed events.

    ``event_ids``, when provided, restricts the run to that subset (any ids
    that don't match an existing event are silently excluded).
    """
    task_store.set_running(task_id)
    events = await kg_service.get_events(document_id=document_id)
    if event_ids is not None:
        wanted = set(event_ids)
        events = [ev for ev in events if ev.id in wanted]
    total = len(events)
    done = 0
    failed = 0
    skipped = 0

    def _report() -> None:
        task_store.set_progress(
            task_id,
            progress=int(done / total * 100) if total else 0,
            stage=f"分析事件 {done}/{total}",
            # The panel needs the item count, not just the percentage — it
            # renders "已分析 N/M" alongside the bar.
            sub_progress=done,
            sub_total=total,
        )

    for ev in events:
        cache_key = f"event:{document_id}:{ev.id}"
        if await cache.get(cache_key) is not None:
            skipped += 1
            done += 1
            # Report on the skip path too, or a re-run over mostly-cached
            # events looks frozen until it reaches the first uncached one.
            _report()
            continue
        try:
            await agent.analyze_event(
                event_id=ev.id,
                document_id=document_id,
                language=language,
            )
            done += 1
        except Exception as exc:
            if _is_rate_limit_error(exc):
                logger.warning("Batch event analysis aborted — rate limit: %s", exc)
                task_store.set_failed(
                    task_id,
                    error=f"API 配額已達上限，已處理 {done}/{total} 個事件。請稍後再試。",
                )
                return
            logger.warning(
                "Batch event analysis failed for %s: %s",
                ev.id, exc,
            )
            failed += 1
            done += 1

        _report()

    task_store.set_completed(
        task_id,
        result={
            "progress": total,
            "total": total,
            "failed": failed,
            "skipped": skipped,
        },
    )
    logger.info(
        "Batch event analysis complete: doc=%s, "
        "total=%d, skipped=%d, failed=%d",
        document_id, total, skipped, failed,
    )


@router.post(
    "/{book_id}/events/analyze-all",
    response_model=TaskIdResponse,
    status_code=202,
)
async def trigger_batch_event_analysis(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    cache: AnalysisCacheDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
    body: BatchEventAnalysisRequest = BatchEventAnalysisRequest(),
) -> dict:
    """Trigger deep analysis for ALL (or a subset of) events in a book.

    ``eventIds``, when provided, restricts the run to that subset (still
    skipping any that already have cached analysis); ids that don't match an
    existing event are silently excluded. Omitted → all events.
    Returns a task_id for progress tracking.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found",
        )

    events = await kg.get_events(document_id=book_id)
    if body.event_ids is not None:
        wanted = set(body.event_ids)
        events = [ev for ev in events if ev.id in wanted]
    if not events:
        raise HTTPException(
            status_code=400,
            detail="No events found for this book",
        )

    language = await doc.get_document_language(book_id)
    task_id = str(uuid4())
    task_store.create(task_id, kind="event", title="批次事件分析")
    background_tasks.add_task(
        _run_batch_event_analysis,
        task_id, book_id, agent, kg, cache, language, body.event_ids,
    )

    logger.info(
        "Triggered batch event analysis: book=%s, "
        "events=%d, task=%s",
        book_id, len(events), task_id,
    )
    return TaskIdResponse(task_id=task_id).model_dump(
        by_alias=True,
    )
