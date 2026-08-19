"""Deep analysis endpoints.

POST /api/v1/analysis/character         — start character analysis (cache-first)
GET  /api/v1/analysis/character/{task_id} — poll result
POST /api/v1/analysis/event             — start event analysis
GET  /api/v1/analysis/event/{task_id}   — poll result
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException

from storysphere.api import task_runner
from storysphere.api.deps import AnalysisAgentDep
from storysphere.api.schemas.analysis import CharacterAnalysisRequest, EventAnalysisRequest
from storysphere.api.schemas.common import TaskStatus
from storysphere.api.store import get_task, task_store

router = APIRouter(prefix="/analysis", tags=["analysis"])


# ── Character ──────────────────────────────────────────────────────────────────


async def _character_analysis(req: CharacterAnalysisRequest, agent) -> dict:
    result = await agent.analyze_character(
        entity_name=req.entity_name,
        document_id=req.document_id,
        archetype_frameworks=req.archetype_frameworks,
        language=req.language,
        force_refresh=req.force_refresh,
    )
    return result.model_dump()


@router.post("/character", response_model=TaskStatus, status_code=202)
async def analyze_character(
    req: CharacterAnalysisRequest,
    agent: AnalysisAgentDep,
) -> TaskStatus:
    """Start a deep character analysis.

    Returns 202 with ``task_id``.  Poll ``GET /analysis/character/{task_id}``
    until ``status`` is ``"completed"`` or ``"failed"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id, kind="character", title="角色深度分析")
    task_runner.launch(task_id, _character_analysis(req, agent))
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/character/{task_id}", response_model=TaskStatus)
async def get_character_analysis(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Event ──────────────────────────────────────────────────────────────────────


async def _event_analysis(req: EventAnalysisRequest, agent) -> dict:
    result = await agent.analyze_event(
        event_id=req.event_id,
        document_id=req.document_id,
        language=req.language,
        force_refresh=req.force_refresh,
    )
    return result.model_dump()


@router.post("/event", response_model=TaskStatus, status_code=202)
async def analyze_event(
    req: EventAnalysisRequest,
    agent: AnalysisAgentDep,
) -> TaskStatus:
    """Start a deep event analysis.  Returns 202 with ``task_id``."""
    task_id = str(uuid4())
    task_store.create(task_id, kind="event", title="事件分析")
    task_runner.launch(task_id, _event_analysis(req, agent))
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/event/{task_id}", response_model=TaskStatus)
async def get_event_analysis(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task
