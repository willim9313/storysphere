"""Tension analysis endpoints — B-027/B-028/B-029.

POST /api/v1/tension/lines/group           — start TensionLine grouping (async)
GET  /api/v1/tension/lines/group/{task_id} — poll grouping result
GET  /api/v1/tension/lines?book_id={id}    — retrieve cached TensionLines
PATCH /api/v1/tension/lines/{id}/review    — update HITL review status
POST /api/v1/tension/analyze               — start full-book TEU assembly (async)
GET  /api/v1/tension/analyze/{task_id}     — poll assembly result
POST /api/v1/tension/theme/synthesize      — start TensionTheme synthesis (async)
GET  /api/v1/tension/theme/synthesize/{task_id} — poll synthesis result
GET  /api/v1/tension/theme?book_id={id}    — retrieve cached TensionTheme
PATCH /api/v1/tension/theme/{id}/review    — update HITL review status
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
    SynthesizeThemeRequest,
    TensionLineDetail,
    TensionLineReviewRequest,
    TensionThemeResponse,
    TensionThemeReviewRequest,
    TEUSummary,
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
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
        )
        task_store.set_completed(task_id, result={"lines": [line.model_dump() for line in lines]})
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
    task_store.create(task_id, kind="tension", title="張力線分組")
    background_tasks.add_task(_run_group_lines, task_id, req, tension_service, kg_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/lines/group/{task_id}", response_model=TaskStatus)
async def get_group_tension_lines(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Cached TensionLines ────────────────────────────────────────────────────────


@router.get("/lines", response_model=list[TensionLineDetail])
async def list_tension_lines(
    book_id: str,
    tension_service: TensionServiceDep,
) -> list[TensionLineDetail]:
    """Return cached TensionLines for a book, with constituent TEUs embedded.

    Each line includes a ``teus`` list (chapter, intensity, description, evidence,
    carrier names per pole) so the UI can render evidence inline without a second
    request. Returns an empty list if grouping has not been run yet — trigger
    grouping first with ``POST /tension/lines/group``.
    """
    rows = await tension_service.get_lines_with_teus(book_id)
    result: list[TensionLineDetail] = []
    for r in rows:
        teus_payload: list[TEUSummary] = []
        for teu in r.get("teus", []):
            teus_payload.append(
                TEUSummary(
                    id=teu.get("id", ""),
                    chapter=int(teu.get("chapter", 0)),
                    intensity=float(teu.get("intensity", 0.0)),
                    tension_description=teu.get("tension_description", ""),
                    evidence=list(teu.get("evidence") or []),
                    pole_a_carriers=list((teu.get("pole_a") or {}).get("carrier_names") or []),
                    pole_b_carriers=list((teu.get("pole_b") or {}).get("carrier_names") or []),
                )
            )
        result.append(
            TensionLineDetail(
                id=r["id"],
                document_id=r["document_id"],
                teu_ids=r.get("teu_ids", []),
                canonical_pole_a=r.get("canonical_pole_a", ""),
                canonical_pole_b=r.get("canonical_pole_b", ""),
                intensity_summary=float(r.get("intensity_summary", 0.0)),
                chapter_range=r.get("chapter_range", []),
                thematic_note=r.get("thematic_note"),
                review_status=r.get("review_status", "pending"),
                teus=teus_payload,
            )
        )
    return result


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
    task_store.create(task_id, kind="tension", title="張力曲線分析")
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


# ── TensionTheme synthesis (B-029) ────────────────────────────────────────────


async def _run_synthesize_theme(
    task_id: str,
    req: SynthesizeThemeRequest,
    tension_service,
) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "synthesizing", "result": None, "error": None},
    )
    try:
        task_store.set_progress(task_id, 15, "loading tension lines")
        task_store.set_progress(task_id, 25, "calling LLM for theme synthesis")
        theme = await tension_service.synthesize_theme(
            document_id=req.document_id,
            language=req.language,
            force=req.force,
        )
        task_store.set_progress(task_id, 90, "saving theme result")
        await tension_service.save_theme(theme)
        task_store.set_completed(task_id, result=theme.model_dump())
    except Exception as exc:
        logger.exception("TensionTheme synthesis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post("/theme/synthesize", response_model=TaskStatus, status_code=202)
async def synthesize_tension_theme(
    req: SynthesizeThemeRequest,
    background_tasks: BackgroundTasks,
    tension_service: TensionServiceDep,
) -> TaskStatus:
    """Start TensionTheme synthesis for a book.

    Requires TensionLines to be generated first (``POST /tension/lines/group``).
    Returns 202 with ``task_id``.  Poll ``GET /tension/theme/synthesize/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力主題綜合")
    background_tasks.add_task(_run_synthesize_theme, task_id, req, tension_service)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/theme/synthesize/{task_id}", response_model=TaskStatus)
async def get_synthesize_tension_theme(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


@router.get("/theme", response_model=TensionThemeResponse)
async def get_tension_theme(
    book_id: str,
    tension_service: TensionServiceDep,
) -> TensionThemeResponse:
    """Return the cached TensionTheme for a book.

    Returns 404 if synthesis has not been run yet.
    Trigger synthesis first with ``POST /tension/theme/synthesize``.
    """
    theme = await tension_service.get_theme(book_id)
    if theme is None:
        raise HTTPException(
            status_code=404,
            detail=f"No TensionTheme found for book '{book_id}'. Run synthesis first.",
        )
    return TensionThemeResponse(
        id=theme.id,
        document_id=theme.document_id,
        tension_line_ids=theme.tension_line_ids,
        proposition=theme.proposition,
        frye_mythos=theme.frye_mythos,
        booker_plot=theme.booker_plot,
        assembled_by=theme.assembled_by,
        assembled_at=theme.assembled_at.isoformat() if hasattr(theme.assembled_at, "isoformat") else str(theme.assembled_at),
        review_status=theme.review_status,
    )


@router.patch("/theme/{theme_id}/review")
async def review_tension_theme(
    theme_id: str,
    req: TensionThemeReviewRequest,
    tension_service: TensionServiceDep,
) -> dict:
    """Update the review status of a TensionTheme.

    Optionally override ``proposition`` when ``review_status`` is ``"modified"``.
    """
    updated = await tension_service.update_theme_review(
        theme_id=theme_id,
        document_id=req.document_id,
        review_status=req.review_status,
        proposition=req.proposition,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"TensionTheme '{theme_id}' not found for document '{req.document_id}'",
        )
    return updated.model_dump()
