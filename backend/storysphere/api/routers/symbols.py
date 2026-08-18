"""Symbolic imagery query endpoints.

GET   /api/v1/symbols                           — list imagery for a book
GET   /api/v1/symbols/overview                  — book-wide behavioural signals (#15i)
GET   /api/v1/symbols/{imagery_id}/timeline     — occurrences sorted by chapter/position
GET   /api/v1/symbols/{imagery_id}/co-occurrences — top-k co-occurring terms
GET   /api/v1/symbols/{imagery_id}/sep          — Symbol Evidence Profile (B-022)
POST  /api/v1/symbols/analyze-all               — batch LLM symbol interpretation (#15j)
POST  /api/v1/symbols/{imagery_id}/analyze      — start LLM symbol interpretation (B-040)
GET   /api/v1/symbols/{imagery_id}/analyze/{task_id} — poll interpretation task
GET   /api/v1/symbols/{imagery_id}/interpretation — cached SymbolInterpretation (B-040)
PATCH /api/v1/symbols/{imagery_id}/interpretation — HITL review of interpretation
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from storysphere.api.deps import (
    AnalysisAgentDep,
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    SymbolAnalysisServiceDep,
    SymbolGraphServiceDep,
    SymbolServiceDep,
)
from storysphere.api.schemas.analysis import (
    SymbolAnalysisRequest,
    SymbolBatchAnalysisRequest,
    SymbolInterpretationReviewRequest,
)
from storysphere.api.schemas.common import TaskStatus
from storysphere.api.schemas.symbols import (
    CoOccurrenceEntry,
    ImageryEntityResponse,
    ImageryListResponse,
    SymbolTimelineEntry,
)
from storysphere.api.store import get_task, task_store
from storysphere.domain.imagery import ImageryType
from storysphere.domain.symbol_analysis import (
    SEP,
    InterpretationBlockStatus,
    InterpretationStatus,
    SymbolInterpretation,
    SymbolOverview,
)

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
            ) from None
        entities = [e for e in entities if e.imagery_type == itype]

    entities = [e for e in entities if e.frequency >= min_frequency]
    entities = entities[:limit]

    return ImageryListResponse(
        items=[ImageryEntityResponse.from_domain(e) for e in entities],
        total=len(entities),
        book_id=book_id,
    )


@router.get("/overview", response_model=SymbolOverview)
async def get_symbol_overview(
    symbol_svc: SymbolServiceDep,
    symbol_analysis_svc: SymbolAnalysisServiceDep,
    symbol_graph: SymbolGraphServiceDep,
    doc_service: DocServiceDep,
    kg_service: KGServiceDep,
    cache: AnalysisCacheDep,
    book_id: str = Query(..., description="Book identifier"),
    force: bool = Query(default=False, description="Bypass cache and re-assemble"),
) -> SymbolOverview:
    """Return every imagery entity with its zero-LLM behavioural signals.

    The symbols page ranks symbols by how they behave, so it needs co-occurring
    entities, event counts, allies and review status for *all* of them before it
    can draw the first screen. Composing that from the per-symbol endpoints took
    one #15a + one #15d per symbol + a graph fetch + one #15g per symbol, and
    each #15d re-loads the whole document and event list.

    Interpretation status is overlaid here rather than cached with the structural
    aggregate, because HITL review changes it without invalidating anything else.
    """
    overview = await symbol_svc.assemble_overview(
        book_id=book_id,
        doc_service=doc_service,
        kg_service=kg_service,
        symbol_graph=symbol_graph,
        cache=cache,
        force=force,
    )

    interpretations, blocks = await asyncio.gather(
        symbol_analysis_svc.list_interpretations(book_id),
        symbol_analysis_svc.list_blocks(book_id),
    )
    if not interpretations and not blocks:
        return overview

    items = []
    for item in overview.items:
        update: dict[str, Any] = {}
        interp = interpretations.get(item.id)
        if interp is not None:
            update["interpretation"] = InterpretationStatus(
                review_status=interp.review_status,
                polarity=interp.polarity,
                confidence=interp.confidence,
            )
        block = blocks.get(item.id)
        if block is not None:
            update["interpretation_block"] = InterpretationBlockStatus(
                reason=block.reason,
                detail=block.detail,
                blocked_at=block.blocked_at,
            )
        items.append(item.model_copy(update=update) if update else item)
    return overview.model_copy(update={"items": items})


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


@router.post(
    "/{imagery_id}/analyze", response_model=TaskStatus, status_code=202
)
async def analyze_symbol(
    imagery_id: str,
    req: SymbolAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
    symbol_svc: SymbolServiceDep,
    doc: DocServiceDep,
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

    language = await doc.get_document_language(req.book_id)
    req = req.model_copy(update={"language": language})

    task_id = str(uuid4())
    task_store.create(task_id, kind="symbol", title="符號意象抽取")
    background_tasks.add_task(_run_symbol_analysis, task_id, imagery_id, req, agent)
    return TaskStatus(task_id=task_id, status="pending")


async def _run_batch_symbol_analysis(
    task_id: str,
    book_id: str,
    imagery_ids: list[str],
    language: str,
    force_refresh: bool,
    skip_ids: set[str],
    agent,
) -> None:
    """Background task: drive the batch sweep and mirror it into the task store.

    Progress mirrors the character and event batches (``sub_progress`` /
    ``sub_total``) so BatchEepPanel can render item counts rather than a
    percentage. The sweep itself — ordering, skip and rate-limit policy — lives
    on the agent; what stays here is the task-store wiring and the wording the
    user sees.
    """
    task_store.set_running(task_id)
    total = len(imagery_ids)

    def _report(done: int, item_total: int) -> None:
        task_store.set_progress(
            task_id,
            progress=int(done / item_total * 100) if item_total else 0,
            stage=f"詮釋意象 {done}/{item_total}",
            sub_progress=done,
            sub_total=item_total,
        )

    summary = await agent.analyze_symbols_batch(
        book_id,
        imagery_ids,
        language=language,
        force_refresh=force_refresh,
        skip_ids=skip_ids,
        progress_callback=_report,
    )

    if summary.pop("aborted", False):
        task_store.set_failed(
            task_id,
            error=(
                f"API 配額已達上限，已處理 {summary['progress']}/{total} 個意象。"
                "請稍後再試。"
            ),
        )
        return

    task_store.set_completed(task_id, result=summary)


@router.post("/analyze-all", response_model=TaskStatus, status_code=202)
async def analyze_all_symbols(
    req: SymbolBatchAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
    symbol_svc: SymbolServiceDep,
    symbol_analysis_svc: SymbolAnalysisServiceDep,
    doc: DocServiceDep,
) -> TaskStatus:
    """Trigger LLM interpretation for many imagery entities in one task (#15j).

    Default scope is every imagery entity occurring more than once — the same set
    the page lists. Single-occurrence terms are the majority of a book's imagery
    and have no behaviour to interpret, so spending the budget on them is the one
    thing "interpret everything" must not mean.

    Returns 202; poll ``GET /api/v1/tasks/{task_id}/status`` (#8).
    """
    entities = await symbol_svc.get_imagery_list(req.book_id)
    if req.imagery_ids is not None:
        wanted = set(req.imagery_ids)
        entities = [e for e in entities if e.id in wanted]
    else:
        entities = [e for e in entities if e.frequency > 1]

    if not entities:
        raise HTTPException(
            status_code=400,
            detail=f"No imagery to analyze for book '{req.book_id}'",
        )

    # Refused symbols are skipped alongside interpreted ones. A refusal is
    # deterministic, so a sweep that re-attempts them spends a call per symbol to
    # be told again what is already recorded. `force_refresh` still re-attempts
    # everything — that is the escape hatch for when a second provider appears.
    interpreted, blocked = await asyncio.gather(
        symbol_analysis_svc.list_interpretations(req.book_id),
        symbol_analysis_svc.list_blocks(req.book_id),
    )
    skip_ids = set(interpreted) | set(blocked)
    language = await doc.get_document_language(req.book_id)

    task_id = str(uuid4())
    task_store.create(task_id, kind="symbol", title="批次象徵詮釋")
    background_tasks.add_task(
        _run_batch_symbol_analysis,
        task_id,
        req.book_id,
        [e.id for e in entities],
        language,
        req.force_refresh,
        skip_ids,
        agent,
    )
    logger.info(
        "Triggered batch symbol analysis: book=%s imagery=%d task=%s",
        req.book_id,
        len(entities),
        task_id,
    )
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
