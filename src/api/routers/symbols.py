"""Symbolic imagery query endpoints.

GET   /api/v1/symbols                           — list imagery for a book
GET   /api/v1/symbols/{imagery_id}/timeline     — occurrences sorted by chapter/position
GET   /api/v1/symbols/{imagery_id}/co-occurrences — top-k co-occurring terms
GET   /api/v1/symbols/{imagery_id}/sep          — Symbol Evidence Profile (B-022)
POST  /api/v1/symbols/{imagery_id}/analyze      — start LLM symbol interpretation (B-040)
GET   /api/v1/symbols/{imagery_id}/analyze/{task_id} — poll interpretation task
GET   /api/v1/symbols/{imagery_id}/interpretation — cached SymbolInterpretation (B-040)
PATCH /api/v1/symbols/{imagery_id}/interpretation — HITL review of interpretation
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from api.deps import (
    AnalysisAgentDep,
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    SymbolAnalysisServiceDep,
    SymbolGraphServiceDep,
    SymbolServiceDep,
)
from api.schemas.analysis import (
    SymbolAnalysisRequest,
    SymbolInterpretationReviewRequest,
)
from api.schemas.common import TaskStatus
from api.schemas.symbols import (
    CoOccurrenceEntry,
    ImageryEntityResponse,
    ImageryListResponse,
    SymbolTimelineEntry,
)
from api.store import get_task, task_store
from api.ws_manager import manager
from domain.imagery import ImageryType
from domain.symbol_analysis import SEP, SymbolInterpretation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/symbols", tags=["symbols"])


@router.get("/", response_model=ImageryListResponse)
async def list_symbols(
    symbol_svc: SymbolServiceDep,
    book_id: str = Query(..., description="Book identifier"),
    imagery_type: str | None = Query(default=None, description="Filter by imagery type"),
    min_frequency: int = Query(default=1, ge=1, description="Minimum occurrence frequency"),
    limit: int = Query(default=100, ge=1, le=500),
) -> ImageryListResponse:
    """List all imagery entities for a book with optional filters."""
    entities = await symbol_svc.get_imagery_list(book_id)

    if imagery_type is not None:
        try:
            itype = ImageryType(imagery_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid imagery_type '{imagery_type}'. "
                f"Valid values: {[t.value for t in ImageryType]}",
            )
        entities = [e for e in entities if e.imagery_type == itype]

    entities = [e for e in entities if e.frequency >= min_frequency]
    entities = entities[:limit]

    return ImageryListResponse(
        items=[ImageryEntityResponse.from_domain(e) for e in entities],
        total=len(entities),
        book_id=book_id,
    )


@router.get("/{imagery_id}/timeline", response_model=list[SymbolTimelineEntry])
async def get_symbol_timeline(
    imagery_id: str,
    symbol_svc: SymbolServiceDep,
) -> list[SymbolTimelineEntry]:
    """Return all occurrences of an imagery entity sorted by chapter and position."""
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Imagery '{imagery_id}' not found")

    occurrences = await symbol_svc.get_occurrences(imagery_id)
    return [SymbolTimelineEntry.from_domain(occ) for occ in occurrences]


@router.get("/{imagery_id}/co-occurrences", response_model=list[CoOccurrenceEntry])
async def get_co_occurrences(
    imagery_id: str,
    symbol_svc: SymbolServiceDep,
    symbol_graph: SymbolGraphServiceDep,
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[CoOccurrenceEntry]:
    """Return top-k co-occurring imagery terms (graph must be built first)."""
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Imagery '{imagery_id}' not found")

    if not symbol_graph._ensure_graph(entity.book_id):
        # Auto-build graph on first request
        await symbol_graph.build_graph(entity.book_id, symbol_svc)

    co_pairs = await symbol_graph.get_co_occurrences(
        book_id=entity.book_id,
        term=entity.term,
        top_k=top_k,
    )

    # Enrich with imagery_id and type for each co-occurring term
    all_entities = await symbol_svc.get_imagery_list(entity.book_id)
    term_to_entity = {e.term: e for e in all_entities}
    result: list[CoOccurrenceEntry] = []
    for co_term, count in co_pairs:
        co_entity = term_to_entity.get(co_term)
        if co_entity is None:
            continue
        result.append(
            CoOccurrenceEntry(
                term=co_term,
                imagery_id=co_entity.id,
                co_occurrence_count=count,
                imagery_type=co_entity.imagery_type.value,
            )
        )

    return result


@router.get("/{imagery_id}/sep", response_model=SEP)
async def get_sep(
    imagery_id: str,
    symbol_svc: SymbolServiceDep,
    doc_service: DocServiceDep,
    kg_service: KGServiceDep,
    cache: AnalysisCacheDep,
    force: bool = Query(default=False, description="Bypass cache and re-assemble"),
) -> SEP:
    """Return the Symbol Evidence Profile (SEP) for an imagery entity.

    Pure data aggregation (no LLM). On cache miss the profile is assembled
    from SymbolService + DocumentService + KGService and persisted under
    ``sep:{book_id}:{imagery_id}``.
    """
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(
            status_code=404, detail=f"Imagery '{imagery_id}' not found"
        )

    return await symbol_svc.assemble_sep(
        imagery_id=imagery_id,
        book_id=entity.book_id,
        doc_service=doc_service,
        kg_service=kg_service,
        cache=cache,
        force=force,
    )


# ── Symbol Analysis (B-040) ───────────────────────────────────────────────────


async def _run_symbol_analysis(
    task_id: str,
    imagery_id: str,
    req: SymbolAnalysisRequest,
    agent,
) -> None:
    task_store.set_running(task_id)
    await manager.push(
        task_id,
        {"task_id": task_id, "status": "running", "progress": 0, "stage": "",
         "result": None, "error": None},
    )
    try:
        def _on_progress(pct: int, stage: str) -> None:
            task_store.set_progress(task_id, progress=pct, stage=stage)

        result = await agent.analyze_symbol(
            imagery_id=imagery_id,
            book_id=req.book_id,
            language=req.language,
            force_refresh=req.force_refresh,
            progress_callback=_on_progress,
        )
        task_store.set_completed(task_id, result=result.model_dump(mode="json"))
    except Exception as exc:
        logger.exception("Symbol analysis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        status = await get_task(task_id)
        if status:
            await manager.push(task_id, status.model_dump())


@router.post(
    "/{imagery_id}/analyze", response_model=TaskStatus, status_code=202
)
async def analyze_symbol(
    imagery_id: str,
    req: SymbolAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
    symbol_svc: SymbolServiceDep,
) -> TaskStatus:
    """Start LLM-based symbol interpretation (B-040).

    Returns 202 with ``task_id``. Poll
    ``GET /api/v1/symbols/{imagery_id}/analyze/{task_id}`` until
    ``status`` is ``"completed"`` or ``"failed"``.
    """
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(
            status_code=404, detail=f"Imagery '{imagery_id}' not found"
        )

    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_symbol_analysis, task_id, imagery_id, req, agent)
    return TaskStatus(task_id=task_id, status="pending")


@router.get(
    "/{imagery_id}/analyze/{task_id}", response_model=TaskStatus
)
async def get_symbol_analysis_task(imagery_id: str, task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


@router.get("/{imagery_id}/interpretation", response_model=SymbolInterpretation)
async def get_symbol_interpretation(
    imagery_id: str,
    symbol_analysis_svc: SymbolAnalysisServiceDep,
    symbol_svc: SymbolServiceDep,
    book_id: str = Query(..., description="Book identifier"),
) -> SymbolInterpretation:
    """Return the cached SymbolInterpretation for an imagery entity."""
    entity = await symbol_svc.get_imagery_by_id(imagery_id)
    if entity is None:
        raise HTTPException(
            status_code=404, detail=f"Imagery '{imagery_id}' not found"
        )

    interp = await symbol_analysis_svc.get_interpretation(imagery_id, book_id)
    if interp is None:
        raise HTTPException(
            status_code=404,
            detail=f"No interpretation cached for imagery '{imagery_id}'. "
            f"Run POST /symbols/{imagery_id}/analyze first.",
        )
    return interp


@router.patch("/{imagery_id}/interpretation", response_model=SymbolInterpretation)
async def review_symbol_interpretation(
    imagery_id: str,
    req: SymbolInterpretationReviewRequest,
    symbol_analysis_svc: SymbolAnalysisServiceDep,
) -> SymbolInterpretation:
    """Update the review_status (and optionally theme/polarity) of a SymbolInterpretation.

    Optionally override ``theme`` / ``polarity`` when
    ``review_status`` is ``"modified"``.
    """
    updated = await symbol_analysis_svc.update_interpretation_review(
        imagery_id=imagery_id,
        book_id=req.book_id,
        review_status=req.review_status,
        theme=req.theme,
        polarity=req.polarity,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"No interpretation found for imagery '{imagery_id}' "
            f"in book '{req.book_id}'",
        )
    return updated
