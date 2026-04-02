"""Narrative analysis endpoints — B-036/B-037.

POST /api/v1/narrative/classify               — start heuristic K/S classification (async)
GET  /api/v1/narrative/classify/{task_id}     — poll result
POST /api/v1/narrative/refine                 — start LLM refinement (async)
GET  /api/v1/narrative/refine/{task_id}       — poll result
POST /api/v1/narrative/hero-journey           — start Hero's Journey mapping (async)
GET  /api/v1/narrative/hero-journey/{task_id} — poll result
POST /api/v1/narrative/temporal               — start Genette temporal analysis (async)
GET  /api/v1/narrative/temporal/{task_id}     — poll result
GET  /api/v1/narrative/temporal/coverage      — check story_time_hint coverage (sync)
GET  /api/v1/narrative/kernel-spine           — return kernel events (sync)
GET  /api/v1/narrative                        — return cached NarrativeStructure
PATCH /api/v1/narrative/{document_id}/review  — update review_status
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from api.deps import DocServiceDep, KGServiceDep, NarrativeServiceDep
from api.schemas.common import TaskStatus
from api.schemas.narrative import (
    ClassifyNarrativeRequest,
    HeroJourneyRequest,
    NarrativeReviewRequest,
    RefineNarrativeRequest,
    TemporalAnalysisRequest,
)
from api.store import get_task, task_store
from api.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/narrative", tags=["narrative"])


# ── Background runners ────────────────────────────────────────────────────────


async def _run_classify(task_id: str, req: ClassifyNarrativeRequest, narrative_service) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "heuristic_classify", "result": None, "error": None},
    )
    try:
        structure = await narrative_service.classify_by_heuristic(req.document_id)
        task_store.set_completed(task_id, result=structure.model_dump())
    except Exception as exc:
        logger.exception("Narrative classify task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


async def _run_refine(task_id: str, req: RefineNarrativeRequest, narrative_service) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "llm_refine", "result": None, "error": None},
    )
    try:
        structure = await narrative_service.refine_with_llm(
            document_id=req.document_id,
            event_ids=req.event_ids,
            language=req.language,
            force=req.force,
        )
        task_store.set_completed(task_id, result=structure.model_dump())
    except Exception as exc:
        logger.exception("Narrative refine task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


async def _run_hero_journey(task_id: str, req: HeroJourneyRequest, narrative_service) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "hero_journey", "result": None, "error": None},
    )
    try:
        stages = await narrative_service.map_hero_journey(
            document_id=req.document_id,
            language=req.language,
            force=req.force,
        )
        task_store.set_completed(task_id, result={"stages": [s.model_dump() for s in stages]})
    except Exception as exc:
        logger.exception("Hero journey task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


# ── Classify (async) ──────────────────────────────────────────────────────────


@router.post("/classify", response_model=TaskStatus, status_code=202)
async def classify_narrative(
    req: ClassifyNarrativeRequest,
    background_tasks: BackgroundTasks,
    narrative_service: NarrativeServiceDep,
) -> TaskStatus:
    """Start heuristic Kernel/Satellite classification for a book.

    Returns 202 with ``task_id``. Poll ``GET /narrative/classify/{task_id}``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_classify, task_id, req, narrative_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/classify/{task_id}", response_model=TaskStatus)
async def get_classify_task(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Refine (async) ────────────────────────────────────────────────────────────


@router.post("/refine", response_model=TaskStatus, status_code=202)
async def refine_narrative(
    req: RefineNarrativeRequest,
    background_tasks: BackgroundTasks,
    narrative_service: NarrativeServiceDep,
) -> TaskStatus:
    """Start LLM refinement of Kernel/Satellite classification.

    By default refines all satellite events. Supply ``event_ids`` to target
    specific events. Requires heuristic classification to have run first.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_refine, task_id, req, narrative_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/refine/{task_id}", response_model=TaskStatus)
async def get_refine_task(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Hero's Journey (async) ────────────────────────────────────────────────────


@router.post("/hero-journey", response_model=TaskStatus, status_code=202)
async def map_hero_journey(
    req: HeroJourneyRequest,
    background_tasks: BackgroundTasks,
    narrative_service: NarrativeServiceDep,
) -> TaskStatus:
    """Start Campbell's Hero's Journey stage mapping for a book.

    Returns 202 with ``task_id``. Poll ``GET /narrative/hero-journey/{task_id}``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_hero_journey, task_id, req, narrative_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/hero-journey/{task_id}", response_model=TaskStatus)
async def get_hero_journey_task(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Temporal analysis (async) ────────────────────────────────────────────────


async def _run_temporal(task_id: str, req: TemporalAnalysisRequest, narrative_service) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "temporal_analysis", "result": None, "error": None},
    )
    try:
        result = await narrative_service.analyze_temporal_order(
            document_id=req.document_id,
            language=req.language,
            force=req.force,
        )
        task_store.set_completed(task_id, result=result.model_dump())
    except Exception as exc:
        logger.exception("Temporal analysis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.get("/temporal/coverage")
async def temporal_coverage(
    book_id: str,
    narrative_service: NarrativeServiceDep,
) -> dict:
    """Check story_time_hint coverage for a book.

    Returns coverage fraction and whether it meets the 60% threshold
    required to run temporal analysis.
    """
    return await narrative_service.check_temporal_coverage(book_id)


@router.post("/temporal", response_model=TaskStatus, status_code=202)
async def analyze_temporal(
    req: TemporalAnalysisRequest,
    background_tasks: BackgroundTasks,
    narrative_service: NarrativeServiceDep,
) -> TaskStatus:
    """Start Genette temporal order analysis for a book.

    Requires story_time_hint coverage ≥ 60% (check with GET /narrative/temporal/coverage).
    Returns 202 with ``task_id``. Poll ``GET /narrative/temporal/{task_id}``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_temporal, task_id, req, narrative_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/temporal/{task_id}", response_model=TaskStatus)
async def get_temporal_task(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Sync queries ──────────────────────────────────────────────────────────────


@router.get("/kernel-spine")
async def get_kernel_spine(
    book_id: str,
    narrative_service: NarrativeServiceDep,
) -> list:
    """Return kernel events (plot spine) sorted by chapter and narrative position.

    Runs heuristic classification automatically if events have not been
    classified yet.
    """
    events = await narrative_service.get_kernel_spine(book_id)
    return [
        {
            "id": e.id,
            "title": e.title,
            "chapter": e.chapter,
            "event_type": e.event_type,
            "description": e.description,
            "significance": e.significance,
            "narrative_weight": e.narrative_weight,
            "narrative_weight_source": e.narrative_weight_source,
            "narrative_position": e.narrative_position,
        }
        for e in events
    ]


@router.get("")
async def get_narrative_structure(
    book_id: str,
    narrative_service: NarrativeServiceDep,
) -> dict:
    """Return the cached NarrativeStructure for a book.

    Returns 404 if neither classify nor hero-journey has been run yet.
    """
    structure = await narrative_service.get_cached_structure(book_id)
    if structure is None:
        raise HTTPException(
            status_code=404,
            detail="No narrative structure found. Run POST /narrative/classify first.",
        )
    return structure.model_dump()


# ── HITL Review ───────────────────────────────────────────────────────────────


@router.patch("/{document_id}/review")
async def review_narrative_structure(
    document_id: str,
    req: NarrativeReviewRequest,
    narrative_service: NarrativeServiceDep,
) -> dict:
    """Update the review_status of a NarrativeStructure.

    ``review_status``: "approved" or "rejected".
    """
    structure = await narrative_service.update_review(document_id, req.review_status)
    if structure is None:
        raise HTTPException(status_code=404, detail=f"No narrative structure for document '{document_id}'")
    return structure.model_dump()
