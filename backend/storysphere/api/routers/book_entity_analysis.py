"""Character analysis endpoints for a book — split out of ``books.py``.

The character analysis listing (#6a), per-entity analysis (#7a–#7c), the
batch run (#7h) and voice profiling (F-04).  Shares the ``/books`` prefix
with ``books.py``; the endpoint paths are unchanged.
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
    VoiceProfilingServiceDep,
)
from storysphere.api.routers._book_shared import now_iso
from storysphere.api.schemas.books import (
    AnalysisItem,
    AnalysisListResponse,
    AnalyzeTriggerRequest,
    ArchetypeDetailResponse,
    ArcSegmentResponse,
    BatchAnalysisRequest,
    CepResponse,
    CharacterAnalysisDetailResponse,
    TaskIdResponse,
    UnanalyzedEntity,
    VoiceProfileResponse,
)
from storysphere.api.store import task_store
from storysphere.core.error_handling import is_rate_limit_error as _is_rate_limit_error
from storysphere.services.analysis_cache import AnalysisCache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


async def _run_entity_analysis(
    task_id: str, entity_name: str, document_id: str, agent, language: str = "en",
    retry_parts: list[str] | None = None, force_refresh: bool = False,
    entity_id: str | None = None,
) -> None:
    logger.info("Entity analysis task %s started: entity=%s, doc=%s", task_id, entity_name, document_id)
    task_store.set_running(task_id)
    try:
        result = await agent.analyze_character(
            entity_name=entity_name,
            entity_id=entity_id,
            document_id=document_id,
            archetype_frameworks=["jung", "schmidt"],
            language=language,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
            retry_parts=retry_parts,
            force_refresh=force_refresh,
        )
        task_store.set_completed(task_id, result=result.model_dump())
        logger.info("Entity analysis task %s completed: entity=%s", task_id, entity_name)
    except Exception as exc:
        logger.exception("Entity analysis task %s failed: entity=%s", task_id, entity_name)
        task_store.set_failed(task_id, error=str(exc))


# ── #6a GET /books/:bookId/analysis/characters ───────────────────────────────


@router.get("/{book_id}/analysis/characters", response_model=AnalysisListResponse)
async def list_character_analyses(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep, cache: AnalysisCacheDep
) -> dict:
    """List character analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from storysphere.domain.entities import EntityType  # noqa: PLC0415
    from storysphere.services.analysis_models import CharacterAnalysisResult  # noqa: PLC0415

    characters = await kg.list_entities(
        entity_type=EntityType.CHARACTER, document_id=book_id
    )
    analyzed: list[dict] = []
    unanalyzed: list[dict] = []
    for e in characters:
        cache_key = AnalysisCache.make_key("character", book_id, e.id)
        result = await cache.get_as(cache_key, CharacterAnalysisResult)
        if result is not None:
            try:
                archetypes = {a.framework: a.primary for a in result.archetypes}
                analyzed.append(
                    AnalysisItem(
                        id=e.id,
                        entity_id=e.id,
                        section="characters",
                        title=e.name,
                        archetypes=archetypes,
                        mention_count=e.mention_count,
                        content=result.profile.summary if result.profile else "",
                        status="partial" if result.failed_parts else "complete",
                        generated_at=(
                            result.analyzed_at.isoformat()
                            if result.analyzed_at
                            else now_iso()
                        ),
                    ).model_dump(by_alias=True)
                )
            except Exception:
                logger.exception("Failed to parse cached analysis for %s", e.name)
                unanalyzed.append(
                    UnanalyzedEntity(
                        id=e.id, name=e.name, type="character", chapter_count=0,
                        mention_count=e.mention_count,
                    ).model_dump(by_alias=True)
                )
        else:
            unanalyzed.append(
                UnanalyzedEntity(
                    id=e.id, name=e.name, type="character", chapter_count=0,
                    mention_count=e.mention_count,
                ).model_dump(by_alias=True)
            )

    return AnalysisListResponse(
        analyzed=analyzed,
        unanalyzed=unanalyzed,
    ).model_dump(by_alias=True)


# ── #7a GET /books/:bookId/entities/:entityId/analysis ───────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/analysis",
    response_model=CharacterAnalysisDetailResponse,
)
async def get_entity_analysis(
    book_id: str,
    entity_id: str,
    cache: AnalysisCacheDep,
    kg: KGServiceDep,
) -> dict:
    """Get full analysis result for a specific character entity."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    cache_key = AnalysisCache.make_key("character", book_id, entity.id)
    try:
        from storysphere.services.analysis_models import CharacterAnalysisResult
        result = await cache.get_as(cache_key, CharacterAnalysisResult)
        if result is not None:
            logger.info("Entity analysis cache HIT: key=%s", cache_key)
            return CharacterAnalysisDetailResponse(
                entity_id=entity_id,
                entity_name=entity.name,
                profile_summary=result.profile.summary if result.profile else "",
                archetypes=[
                    ArchetypeDetailResponse(
                        framework=a.framework,
                        primary=a.primary,
                        secondary=a.secondary,
                        confidence=a.confidence,
                        evidence=a.evidence,
                    )
                    for a in result.archetypes
                ],
                cep=CepResponse(
                    actions=result.cep.actions,
                    traits=result.cep.traits,
                    relations=result.cep.relations,
                    key_events=result.cep.key_events,
                    quotes=result.cep.quotes,
                    top_terms=result.cep.top_terms,
                ) if result.cep else None,
                arc=[
                    ArcSegmentResponse(
                        chapter_range=seg.chapter_range,
                        phase=seg.phase,
                        description=seg.description,
                    )
                    for seg in result.arc
                ],
                status="partial" if result.failed_parts else "complete",
                failed_parts=result.failed_parts,
                generated_at=(
                    result.analyzed_at.isoformat() if result.analyzed_at else now_iso()
                ),
            ).model_dump(by_alias=True)
        logger.info("Entity analysis cache MISS: key=%s", cache_key)
    except Exception:
        logger.exception("Entity analysis cache read failed: key=%s", cache_key)

    raise HTTPException(status_code=404, detail="Analysis not found")


# ── #7b POST /books/:bookId/entities/:entityId/analyze ───────────────────────


@router.post(
    "/{book_id}/entities/{entity_id}/analyze",
    response_model=TaskIdResponse,
)
async def trigger_entity_analysis(
    book_id: str,
    entity_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    agent: AnalysisAgentDep,
    cache: AnalysisCacheDep,
    background_tasks: BackgroundTasks,
    body: AnalyzeTriggerRequest = AnalyzeTriggerRequest(),
) -> dict:
    """Trigger deep analysis for a single entity.

    ``mode='retryFailed'`` re-runs only the cached result's failed parts
    (reusing the cached CEP); ``mode='full'`` forces a complete re-analysis.
    """
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    language = await doc.get_document_language(book_id)

    retry_parts: list[str] | None = None
    force_refresh = False
    if body.mode == "retryFailed":
        from storysphere.services.analysis_models import CharacterAnalysisResult  # noqa: PLC0415
        cache_key = AnalysisCache.make_key("character", book_id, entity.id)
        cached = await cache.get_as(cache_key, CharacterAnalysisResult)
        if cached:
            retry_parts = cached.failed_parts
    else:
        force_refresh = True

    logger.info(
        "Triggering entity analysis: entity=%s (%s), book=%s, lang=%s, mode=%s",
        entity.name, entity_id, book_id, language, body.mode,
    )
    task_id = str(uuid4())
    task_store.create(task_id, kind="character", title=f"角色深度分析 — {entity.name}")
    background_tasks.add_task(
        _run_entity_analysis, task_id, entity.name, book_id, agent, language,
        retry_parts, force_refresh, entity.id,
    )

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7c DELETE /books/:bookId/entities/:entityId/analysis ────────────────────


@router.delete("/{book_id}/entities/{entity_id}/analysis", status_code=204)
async def delete_entity_analysis(
    book_id: str, entity_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> None:
    """Delete entity analysis from cache."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    cache_key = AnalysisCache.make_key("character", book_id, entity.id)
    await cache.invalidate(cache_key)
    logger.info("Deleted entity analysis cache: key=%s", cache_key)


# ── #7h POST /books/:bookId/entities/analyze-all ─────────────────────────────


async def _run_batch_entity_analysis(
    task_id: str,
    document_id: str,
    agent,
    kg_service,
    cache,
    language: str = "en",
    entity_ids: list[str] | None = None,
) -> None:
    """Background task: analyze all unanalyzed character entities.

    ``entity_ids``, when provided, restricts the run to that subset (any ids
    that don't match an existing character entity are silently excluded).
    """
    from storysphere.domain.entities import EntityType  # noqa: PLC0415

    task_store.set_running(task_id)
    characters = await kg_service.list_entities(
        entity_type=EntityType.CHARACTER, document_id=document_id
    )
    if entity_ids is not None:
        wanted = set(entity_ids)
        characters = [c for c in characters if c.id in wanted]
    total = len(characters)
    done = 0
    failed = 0
    skipped = 0

    def _report() -> None:
        task_store.set_progress(
            task_id,
            progress=int(done / total * 100) if total else 0,
            stage=f"分析角色 {done}/{total}",
            # Shared with the event batch: BatchEepPanel renders the item
            # count, not the percentage.
            sub_progress=done,
            sub_total=total,
        )

    for entity in characters:
        cache_key = AnalysisCache.make_key("character", document_id, entity.id)
        if await cache.get(cache_key) is not None:
            skipped += 1
            done += 1
            _report()
            continue
        try:
            await agent.analyze_character(
                entity_name=entity.name,
                entity_id=entity.id,
                document_id=document_id,
                archetype_frameworks=["jung", "schmidt"],
                language=language,
            )
            done += 1
        except Exception as exc:
            if _is_rate_limit_error(exc):
                logger.warning("Batch character analysis aborted — rate limit: %s", exc)
                task_store.set_failed(
                    task_id,
                    error=f"API 配額已達上限，已處理 {done}/{total} 個角色。請稍後再試。",
                )
                return
            logger.warning(
                "Batch character analysis failed for %s: %s",
                entity.name, exc,
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
        "Batch character analysis complete: doc=%s, "
        "total=%d, skipped=%d, failed=%d",
        document_id, total, skipped, failed,
    )


@router.post(
    "/{book_id}/entities/analyze-all",
    response_model=TaskIdResponse,
    status_code=202,
)
async def trigger_batch_entity_analysis(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    cache: AnalysisCacheDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
    body: BatchAnalysisRequest = BatchAnalysisRequest(),
) -> dict:
    """Trigger deep analysis for ALL (or a subset of) character entities in a book.

    ``entityIds``, when provided, restricts the run to that subset (still
    skipping any that already have cached analysis); ids that don't match an
    existing character entity are silently excluded. Omitted → all characters.
    Returns a task_id for progress tracking.
    """
    from storysphere.domain.entities import EntityType  # noqa: PLC0415

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found",
        )

    characters = await kg.list_entities(
        entity_type=EntityType.CHARACTER, document_id=book_id
    )
    if body.entity_ids is not None:
        wanted = set(body.entity_ids)
        characters = [c for c in characters if c.id in wanted]
    if not characters:
        raise HTTPException(
            status_code=400,
            detail="No characters found for this book",
        )

    language = await doc.get_document_language(book_id)
    task_id = str(uuid4())
    task_store.create(task_id, kind="character", title="批次角色分析")
    background_tasks.add_task(
        _run_batch_entity_analysis,
        task_id, book_id, agent, kg, cache, language, body.entity_ids,
    )

    logger.info(
        "Triggered batch character analysis: book=%s, "
        "characters=%d, task=%s",
        book_id, len(characters), task_id,
    )
    return TaskIdResponse(task_id=task_id).model_dump(
        by_alias=True,
    )


# ── F-04 GET /books/:bookId/entities/:entityId/voice ─────────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/voice",
    response_model=VoiceProfileResponse,
)
async def get_entity_voice_profile(
    book_id: str,
    entity_id: str,
    voice_svc: VoiceProfilingServiceDep,
    doc: DocServiceDep,
    kg: KGServiceDep,
    cached_only: bool = False,
) -> dict:
    """Return the voice profile for a character.

    Computes quantitative linguistic metrics and LLM qualitative description
    on first call; subsequent calls are served from SQLite cache.

    ``cached_only=true``: only reads the cache, never triggers generation —
    404 if no cached profile exists yet.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    language = await doc.get_document_language(book_id)
    try:
        profile = await voice_svc.get_voice_profile(
            document_id=book_id,
            character_id=entity_id,
            language=language,
            cached_only=cached_only,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if profile is None:
        raise HTTPException(status_code=404, detail="Voice profile not cached yet")

    return VoiceProfileResponse(
        character_id=profile.character_id,
        character_name=profile.character_name,
        document_id=profile.document_id,
        avg_sentence_length=profile.avg_sentence_length,
        question_ratio=profile.question_ratio,
        exclamation_ratio=profile.exclamation_ratio,
        lexical_diversity=profile.lexical_diversity,
        paragraphs_analyzed=profile.paragraphs_analyzed,
        tone_distribution=[
            {"label": seg.label, "value": seg.value}
            for seg in profile.tone_distribution
        ],
        sentence_length_histogram=[
            {"bucket": b.bucket, "value": b.value}
            for b in profile.sentence_length_histogram
        ],
        speech_style=profile.speech_style,
        distinctive_patterns=profile.distinctive_patterns,
        tone=profile.tone,
        representative_quotes=profile.representative_quotes,
        analyzed_at=profile.analyzed_at,
    ).model_dump(by_alias=True)


@router.delete("/{book_id}/entities/{entity_id}/voice", status_code=204)
async def delete_entity_voice_profile(
    book_id: str,
    entity_id: str,
    voice_svc: VoiceProfilingServiceDep,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> None:
    """Invalidate the cached voice profile so the next GET recomputes it."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    await voice_svc.invalidate(document_id=book_id, character_id=entity_id)
    logger.info("Invalidated voice profile cache: book=%s entity=%s", book_id, entity_id)
