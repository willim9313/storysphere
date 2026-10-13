"""Narrative analysis endpoints — B-036/B-037.

POST /api/v1/narrative/classify               — start heuristic K/S classification (async)
GET  /api/v1/narrative/classify/{task_id}     — poll result
POST /api/v1/narrative/refine                 — start LLM refinement (async)
GET  /api/v1/narrative/refine/{task_id}       — poll result
POST /api/v1/narrative/hero-journey           — start Hero's Journey mapping (async)
GET  /api/v1/narrative/hero-journey/{task_id} — poll result
GET  /api/v1/narrative/running                — the narrative run going for a book (#21m)
POST /api/v1/narrative/temporal               — start Genette temporal analysis (async)
GET  /api/v1/narrative/temporal/{task_id}     — poll result
GET  /api/v1/narrative/temporal/coverage      — check story_time_hint coverage (sync)
GET  /api/v1/narrative/kernel-spine           — return kernel events (sync, read-only)
GET  /api/v1/narrative                        — return cached NarrativeStructure
PATCH /api/v1/narrative/{document_id}/review  — update review_status
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from storysphere.api import batch_guard, task_runner
from storysphere.api.deps import DocServiceDep, NarrativeServiceDep
from storysphere.api.llm_guard import primary_config_error, require_llm_provider
from storysphere.api.schemas.common import ErrorResponse, TaskStatus
from storysphere.api.schemas.narrative import (
    ClassifyNarrativeRequest,
    HeroJourneyRequest,
    KernelSpineEvent,
    NarrativeOp,
    NarrativeReviewRequest,
    NarrativeStructureResponse,
    RefineNarrativeRequest,
    RunningNarrativeResponse,
    TemporalAnalysisRequest,
)
from storysphere.api.store import get_task, task_store
from storysphere.domain.narrative import NarrativeStructure
from storysphere.services.query_models import TemporalCoverageStats

router = APIRouter(prefix="/narrative", tags=["narrative"])


# ── One narrative run per book ────────────────────────────────────────────────
#
# Classify, refine and hero-journey all read the book's cached
# NarrativeStructure, change part of it and write the whole thing back —
# classify and refine also rewrite the KG's narrative weights. Two of them
# running on one book overwrite each other, and a second hero-journey or refine
# pays the LLM twice. So the three share one lock per book: the op is held as
# batch_guard's item_id, and any live item blocks every op.

_GUARD_KIND = "narrative"


def _running_op(book_id: str) -> tuple[NarrativeOp, str] | None:
    """``(op, task_id)`` of the narrative run going for *book_id*, or None."""
    for op, task_id in batch_guard.running_items(_GUARD_KIND, book_id).items():
        return op, task_id  # type: ignore[return-value]
    return None


async def _require_book(doc_service, book_id: str) -> None:
    """404 for a book that does not exist — not an empty answer or a task
    that "succeeds" on nothing."""
    if await doc_service.get_document(book_id) is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")


async def _narrative_task(task_id: str) -> TaskStatus:
    """The task behind a narrative poll endpoint; 404 for an unknown id or a
    task of another kind (these endpoints used to hand back any task)."""
    task = await get_task(task_id)
    if task is None or task.kind != "narrative":
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


def _busy(book_id: str) -> JSONResponse | None:
    """409 ``batch_running`` when any narrative run is going for the book."""
    running = _running_op(book_id)
    if running is None:
        return None
    body = ErrorResponse(
        detail=f"A narrative {running[0]} run is already going for book '{book_id}'",
        code="batch_running",
    )
    return JSONResponse(status_code=409, content=body.model_dump())


# ── Background runners ────────────────────────────────────────────────────────


async def _classify(task_id: str, req: ClassifyNarrativeRequest, narrative_service) -> dict:
    structure = await narrative_service.classify_from_eep(
        req.document_id,
        progress_callback=task_runner.progress(task_id),
    )
    return structure.model_dump()


async def _refine(task_id: str, req: RefineNarrativeRequest, narrative_service) -> dict:
    structure = await narrative_service.refine_with_llm(
        document_id=req.document_id,
        event_ids=req.event_ids,
        language=req.language,
        force=req.force,
        progress_callback=task_runner.progress(task_id),
    )
    return structure.model_dump()


async def _hero_journey(task_id: str, req: HeroJourneyRequest, narrative_service) -> dict:
    progress = task_runner.progress(task_id)
    progress(10, "loading chapter summaries")
    progress(20, "calling LLM for hero journey mapping")
    stages = await narrative_service.map_hero_journey(
        document_id=req.document_id,
        language=req.language,
        force=req.force,
    )
    progress(90, "parsing hero journey stages")
    return {"stages": [s.model_dump() for s in stages]}


# ── Classify (async) ──────────────────────────────────────────────────────────


@router.post(
    "/classify",
    response_model=TaskStatus,
    status_code=202,
    responses={409: {"model": ErrorResponse}},
)
async def classify_narrative(
    req: ClassifyNarrativeRequest,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start heuristic Kernel/Satellite classification for a book.

    Returns 202 with ``task_id``. Poll ``GET /narrative/classify/{task_id}``.

    Returns 409 when not one event has an event-analysis (EEP) entry: the run
    has nothing to classify from and would do nothing at all. Since B-096 that
    is genuinely nothing — a run no longer resets weights it cannot reproduce —
    but a task that "succeeds" having done nothing is not an answer, so the
    caller is told instead of watching a no-op complete.

    Also 409 (``code: batch_running``) while another narrative run is going for
    the book — see ``_busy``. 404 for a book that does not exist.
    """
    await _require_book(doc_service, req.document_id)
    if (busy := _busy(req.document_id)) is not None:
        return busy
    hits, classified, total = await narrative_service.eep_coverage(req.document_id)
    if hits == 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Nothing to classify: none of the {total} events has an "
                f"event-analysis (EEP) entry, so this run would change nothing "
                f"({classified} events keep the weights they already have). "
                f"Run event analysis first."
            ),
        )

    # eep_coverage awaited: re-check, then claim with no await in between.
    if (busy := _busy(req.document_id)) is not None:
        return busy
    task_id = str(uuid4())
    task_store.create(task_id, kind="narrative", title="敘事模式標註")
    task_runner.launch(task_id, _classify(task_id, req, narrative_service))
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="classify")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/classify/{task_id}", response_model=TaskStatus)
async def get_classify_task(task_id: str) -> TaskStatus:
    return await _narrative_task(task_id)


# ── Refine (async) ────────────────────────────────────────────────────────────


@router.post(
    "/refine",
    response_model=TaskStatus,
    status_code=202,
    responses={409: {"model": ErrorResponse}},
)
async def refine_narrative(
    req: RefineNarrativeRequest,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start LLM refinement of Kernel/Satellite classification.

    By default refines all satellite events. Supply ``event_ids`` to target
    specific events. Requires heuristic classification to have run first.

    409 (``code: batch_running``) while another narrative run is going for the
    book; 404 for a book that does not exist.
    """
    await _require_book(doc_service, req.document_id)
    # No await between the check and the claim (see batch_guard).
    if (busy := _busy(req.document_id)) is not None:
        return busy
    require_llm_provider()
    task_id = str(uuid4())
    task_store.create(task_id, kind="narrative", title="敘事模式校正")
    task_runner.launch(task_id, _refine(task_id, req, narrative_service))
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="refine")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/refine/{task_id}", response_model=TaskStatus)
async def get_refine_task(task_id: str) -> TaskStatus:
    return await _narrative_task(task_id)


# ── Hero's Journey (async) ────────────────────────────────────────────────────


@router.post(
    "/hero-journey",
    response_model=TaskStatus,
    status_code=202,
    responses={409: {"model": ErrorResponse}},
)
async def map_hero_journey(
    req: HeroJourneyRequest,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start Campbell's Hero's Journey stage mapping for a book.

    Returns 202 with ``task_id``. Poll ``GET /narrative/hero-journey/{task_id}``.

    409 (``code: batch_running``) while another narrative run is going for the
    book; 404 for a book that does not exist.
    """
    await _require_book(doc_service, req.document_id)
    # No await between the check and the claim (see batch_guard).
    if (busy := _busy(req.document_id)) is not None:
        return busy
    require_llm_provider()
    task_id = str(uuid4())
    task_store.create(task_id, kind="narrative", title="英雄旅程對應")
    task_runner.launch(task_id, _hero_journey(task_id, req, narrative_service))
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="heroJourney")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/hero-journey/{task_id}", response_model=TaskStatus)
async def get_hero_journey_task(task_id: str) -> TaskStatus:
    return await _narrative_task(task_id)


# ── Running run (sync) ────────────────────────────────────────────────────────


@router.get("/running", response_model=RunningNarrativeResponse)
async def get_running_narrative(
    book_id: str = Query(..., description="Book identifier"),
) -> dict:
    """The classify / refine / hero-journey run going for this book (#21m).

    Read-only: lets the page pick a run back up after a remount (or from
    another tab) instead of offering to start one the POSTs would refuse with 409.
    """
    running = _running_op(book_id)
    if running is None:
        return RunningNarrativeResponse().model_dump(by_alias=True)
    op, task_id = running
    return RunningNarrativeResponse(op=op, task_id=task_id).model_dump(by_alias=True)


# ── Temporal analysis (async) ────────────────────────────────────────────────


async def _temporal(task_id: str, req: TemporalAnalysisRequest, narrative_service) -> dict:
    result = await narrative_service.analyze_temporal_order(
        document_id=req.document_id,
        language=req.language,
        force=req.force,
        progress_callback=task_runner.progress(task_id),
    )
    return result.model_dump()


@router.get("/temporal/coverage")
async def temporal_coverage(
    book_id: str,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> TemporalCoverageStats:
    """Check story_time_hint coverage for a book.

    Returns coverage fraction and whether it meets the 60% threshold
    required to run temporal analysis. 404 for a book that does not exist.
    """
    await _require_book(doc_service, book_id)
    return await narrative_service.check_temporal_coverage(book_id)


# #21h has its own lock, apart from the classify / refine / hero-journey one:
# it only writes its own ``temporal_analysis`` cache, so it cannot overwrite
# them — but a second run on the same book pays the LLM twice. The timeline
# page reads this lock back through ``GET /books/:id/timeline/running`` (#13c).
TEMPORAL_GUARD_KIND = "temporal"


@router.post(
    "/temporal",
    response_model=TaskStatus,
    status_code=202,
    responses={409: {"model": ErrorResponse}},
)
async def analyze_temporal(
    req: TemporalAnalysisRequest,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start Genette temporal order analysis for a book.

    Requires story_time_hint coverage ≥ 60% (check with GET /narrative/temporal/coverage).
    Returns 202 with ``task_id``. Poll ``GET /narrative/temporal/{task_id}``.
    404 for a book that does not exist; 409 (``code: batch_running``) while a
    temporal analysis is already going for the book.
    """
    await _require_book(doc_service, req.document_id)
    # 覆蓋率不足時 analyze_temporal_order 直接回 coverage_sufficient=False、不碰 LLM，
    # 這種情況不該因沒設 provider 而 503。只在 provider 未設定時才多查一次覆蓋率
    # （與 GET /temporal/coverage 同一個公開方法），一般路徑行為不變。
    if primary_config_error() is not None:
        coverage = await narrative_service.check_temporal_coverage(req.document_id)
        if coverage.coverage_sufficient:
            require_llm_provider()
    # No await between the check and the claim (see batch_guard).
    if (busy := batch_guard.conflict(TEMPORAL_GUARD_KIND, req.document_id)) is not None:
        return busy
    task_id = str(uuid4())
    task_store.create(task_id, kind="narrative", title="時序分析")
    task_runner.launch(task_id, _temporal(task_id, req, narrative_service))
    batch_guard.hold(TEMPORAL_GUARD_KIND, req.document_id, task_id)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/temporal/{task_id}", response_model=TaskStatus)
async def get_temporal_task(task_id: str) -> TaskStatus:
    return await _narrative_task(task_id)


# ── Sync queries ──────────────────────────────────────────────────────────────


@router.get("/kernel-spine", response_model=list[KernelSpineEvent])
async def get_kernel_spine(
    book_id: str,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> list:
    """Return kernel events (plot spine) sorted by chapter and narrative position.

    Read-only: a book nothing has classified yet gets ``[]`` — the page offers
    POST /narrative/classify for that. 404 for a book that does not exist.
    """
    await _require_book(doc_service, book_id)
    events = await narrative_service.get_kernel_events(book_id)
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


# A stage spans whole chapters, so a chapter dense with kernel events would
# otherwise flood the panel. The spine is chapter-ascending, so this keeps the
# earliest ones.
_MAX_REPRESENTATIVE_EVENTS = 4


def _with_representative_events(stages: list[dict], kernels: list) -> list[dict]:
    """Fill each stage's representative_event_ids from chapter_range ∩ kernel spine
    (the chapters actually listed, not the span between its ends).

    map_hero_journey never writes the field, so it arrives empty on every cached
    structure. Resolving it here rather than at generation time means existing
    caches benefit without a re-run, and nothing derived gets persisted — the
    same contract as is_stale.

    Stages sharing a chapter range legitimately resolve to the same events, and
    a stage past the last kernel event resolves to none: a stage is
    chapter-level while an event sits inside a chapter, so the two are not
    one-to-one.
    """
    resolved = []
    for stage in stages:
        if stage.get("representative_event_ids"):
            resolved.append(stage)  # already carries its own; leave it alone
            continue
        chapter_range = stage.get("chapter_range") or []
        ids: list[str] = []
        if chapter_range:
            # chapter_range is a discrete, unsorted, possibly duplicated list of
            # chapters (e.g. [1, 2, 5, 8]), not a min/max span — only events in
            # the chapters it actually names count.
            chapters = set(chapter_range)
            ids = [e.id for e in kernels if e.chapter in chapters][
                :_MAX_REPRESENTATIVE_EVENTS
            ]
        resolved.append({**stage, "representative_event_ids": ids})
    return resolved


@router.get("", response_model=NarrativeStructureResponse)
async def get_narrative_structure(
    book_id: str,
    narrative_service: NarrativeServiceDep,
    doc_service: DocServiceDep,
) -> dict:
    """Return the cached NarrativeStructure for a book.

    ``is_stale`` reports that a pipeline step the analysis derives from has
    been re-run since it was cached, so the result describes older data;
    ``stale_reason`` names that step. ``representative_event_ids`` on each
    Hero's Journey stage is resolved from the kernel spine. All three are
    derived per request and never persisted.

    Returns 404 for a book that does not exist, and 404 when neither classify
    nor hero-journey has been run yet (the page treats that as "not analyzed").
    """
    await _require_book(doc_service, book_id)
    structure = await narrative_service.get_cached_structure(book_id)
    if structure is None:
        raise HTTPException(
            status_code=404,
            detail="No narrative structure for this book yet. Run POST /narrative/classify first.",
        )
    is_stale, reason = await narrative_service.structure_staleness(book_id)
    payload = structure.model_dump()
    if payload.get("hero_journey_stages"):
        kernels = await narrative_service.get_kernel_events(book_id)
        payload["hero_journey_stages"] = _with_representative_events(
            payload["hero_journey_stages"], kernels
        )
    return {**payload, "is_stale": is_stale, "stale_reason": reason}


# ── HITL Review ───────────────────────────────────────────────────────────────


@router.patch("/{document_id}/review", response_model=NarrativeStructure)
async def review_narrative_structure(
    document_id: str,
    req: NarrativeReviewRequest,
    narrative_service: NarrativeServiceDep,
) -> dict:
    """Update the review_status of a NarrativeStructure.

    ``review_status``: "approved", "rejected", or "pending" (back to unreviewed).
    """
    structure = await narrative_service.update_review(document_id, req.review_status)
    if structure is None:
        raise HTTPException(status_code=404, detail=f"No narrative structure for document '{document_id}'")
    return structure.model_dump()
