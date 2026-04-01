"""Tension analysis endpoints — B-027/B-028.

POST /api/v1/tension/lines/group           — start TensionLine grouping (async)
GET  /api/v1/tension/lines/group/{task_id} — poll grouping result
GET  /api/v1/tension/lines?book_id={id}    — retrieve cached TensionLines
PATCH /api/v1/tension/lines/{id}/review    — update HITL review status
POST /api/v1/tension/analyze               — start full-book TEU assembly (async)
GET  /api/v1/tension/analyze/{task_id}     — poll assembly result
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from api.deps import DocServiceDep, KGServiceDep, TensionServiceDep
from api.schemas.common import TaskStatus
from api.schemas.tension import (
    AnalyzeBookTensionsRequest,
    GroupTensionLinesRequest,
    TensionLineReviewRequest,
)
from api.store import get_task, task_store
from api.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tension", tags=["tension"])


# ── Grouping (async) ───────────────────────────────────────────────────────────


async def _run_group_lines(
    task_id: str,
    req: GroupTensionLinesRequest,
    tension_service,
    kg_service,
) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "grouping", "result": None, "error": None},
    )
    try:
        lines = await tension_service.group_teus(
            document_id=req.document_id,
            kg_service=kg_service,
            language=req.language,
            force=req.force,
        )
        task_store.set_completed(task_id, result={"lines": [l.model_dump() for l in lines]})
    except Exception as exc:
        logger.exception("TensionLine grouping task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post("/lines/group", response_model=TaskStatus, status_code=202)
async def group_tension_lines(
    req: GroupTensionLinesRequest,
    background_tasks: BackgroundTasks,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
) -> TaskStatus:
    """Start TensionLine grouping for a book.

    Returns 202 with ``task_id``.  Poll ``GET /tension/lines/group/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_group_lines, task_id, req, tension_service, kg_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/lines/group/{task_id}", response_model=TaskStatus)
async def get_group_tension_lines(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Cached TensionLines ────────────────────────────────────────────────────────


@router.get("/lines")
async def list_tension_lines(
    book_id: str,
    tension_service: TensionServiceDep,
) -> list:
    """Return cached TensionLines for a book.

    Returns an empty list if grouping has not been run yet.
    Trigger grouping first with ``POST /tension/lines/group``.
    """
    lines = await tension_service.get_lines(book_id)
    return [l.model_dump() for l in lines]


# ── HITL Review ────────────────────────────────────────────────────────────────


@router.patch("/lines/{line_id}/review")
async def review_tension_line(
    line_id: str,
    req: TensionLineReviewRequest,
    tension_service: TensionServiceDep,
) -> dict:
    """Update the review status of a TensionLine.

    Optionally override ``canonical_pole_a`` / ``canonical_pole_b`` when
    ``review_status`` is ``"modified"``.
    """
    updated = await tension_service.update_line_review(
        line_id=line_id,
        document_id=req.document_id,
        review_status=req.review_status,
        canonical_pole_a=req.canonical_pole_a,
        canonical_pole_b=req.canonical_pole_b,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"TensionLine '{line_id}' not found for document '{req.document_id}'",
        )
    return updated.model_dump()


# ── Mode A: Full-book batch TEU assembly (B-028) ───────────────────────────────


async def _run_analyze_book(
    task_id: str,
    req: AnalyzeBookTensionsRequest,
    tension_service,
    kg_service,
    doc_service,
) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "準備中", "result": None, "error": None},
    )
    try:
        def _on_progress(done: int, total: int) -> None:
            pct = int(done / total * 100) if total else 0
            task_store.set_progress(task_id, progress=pct, stage=f"組裝 TEU {done}/{total}")

        summary = await tension_service.analyze_book_tensions(
            document_id=req.document_id,
            kg_service=kg_service,
            doc_service=doc_service,
            language=req.language,
            force=req.force,
            concurrency=req.concurrency,
            progress_callback=_on_progress,
        )
        task_store.set_completed(task_id, result=summary)
    except Exception as exc:
        logger.exception("Batch TEU assembly task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post("/analyze", response_model=TaskStatus, status_code=202)
async def analyze_book_tensions(
    req: AnalyzeBookTensionsRequest,
    background_tasks: BackgroundTasks,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus:
    """Start full-book TEU assembly (Mode A).

    Assembles TEUs for all events with ``tension_signal != "none"``.
    Returns 202 with ``task_id``.  Poll ``GET /tension/analyze/{task_id}``
    for progress and final result.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_analyze_book, task_id, req, tension_service, kg_service, doc_service
    )
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/analyze/{task_id}", response_model=TaskStatus)
async def get_analyze_book_tensions(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task
