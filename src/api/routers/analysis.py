"""Deep analysis endpoints.

POST /api/v1/analysis/character         — start character analysis (cache-first)
GET  /api/v1/analysis/character/{task_id} — poll result
POST /api/v1/analysis/event             — start event analysis
GET  /api/v1/analysis/event/{task_id}   — poll result
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from api.deps import AnalysisAgentDep
from api.schemas.analysis import CharacterAnalysisRequest, EventAnalysisRequest
from api.schemas.common import TaskStatus
from api.store import get_task, task_store
from api.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])


# ── Character ──────────────────────────────────────────────────────────────────


async def _run_character_analysis(task_id: str, req: CharacterAnalysisRequest, agent) -> None:
    task_store.set_running(task_id)
    await manager.push(task_id, {"task_id": task_id, "status": "running", "progress": 0, "stage": "", "result": None, "error": None})
    try:
        result = await agent.analyze_character(
            entity_name=req.entity_name,
            document_id=req.document_id,
            archetype_frameworks=req.archetype_frameworks,
            language=req.language,
            force_refresh=req.force_refresh,
        )
        task_store.set_completed(task_id, result=result.model_dump())
    except Exception as exc:
        logger.exception("Character analysis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post("/character", response_model=TaskStatus, status_code=202)
async def analyze_character(
    req: CharacterAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
) -> TaskStatus:
    """Start a deep character analysis.

    Returns 202 with ``task_id``.  Poll ``GET /analysis/character/{task_id}``
    until ``status`` is ``"completed"`` or ``"failed"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_character_analysis, task_id, req, agent)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/character/{task_id}", response_model=TaskStatus)
async def get_character_analysis(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Event ──────────────────────────────────────────────────────────────────────


async def _run_event_analysis(task_id: str, req: EventAnalysisRequest, agent) -> None:
    task_store.set_running(task_id)
    await manager.push(task_id, {"task_id": task_id, "status": "running", "progress": 0, "stage": "", "result": None, "error": None})
    try:
        result = await agent.analyze_event(
            event_id=req.event_id,
            document_id=req.document_id,
            language=req.language,
            force_refresh=req.force_refresh,
        )
        task_store.set_completed(task_id, result=result.model_dump())
    except Exception as exc:
        logger.exception("Event analysis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post("/event", response_model=TaskStatus, status_code=202)
async def analyze_event(
    req: EventAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
) -> TaskStatus:
    """Start a deep event analysis.  Returns 202 with ``task_id``."""
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_event_analysis, task_id, req, agent)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/event/{task_id}", response_model=TaskStatus)
async def get_event_analysis(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task
