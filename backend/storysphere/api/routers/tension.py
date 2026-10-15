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
GET  /api/v1/tension/running?book_id={id}  — the tension run going for a book (#14k)
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from storysphere.api import batch_guard, task_runner
from storysphere.api.deps import DocServiceDep, KGServiceDep, TensionServiceDep
from storysphere.api.llm_guard import require_llm_provider
from storysphere.api.schemas.common import ErrorResponse, TaskStatus
from storysphere.api.schemas.tension import (
    AnalyzeBookTensionsRequest,
    AssignTEURequest,
    Carrier,
    GroupTensionLinesRequest,
    RunningTensionResponse,
    SynthesizeThemeRequest,
    TensionLineDetail,
    TensionLineReviewRequest,
    TensionOp,
    TensionThemeResponse,
    TensionThemeReviewRequest,
    TEUDetail,
    TEUSummary,
)
from storysphere.api.store import get_task, task_store
from storysphere.domain.narrative_runs import group_narrative_runs
from storysphere.domain.scene_groups import group_scenes
from storysphere.domain.tension import TensionLine, TensionTheme

router = APIRouter(prefix="/tension", tags=["tension"])


# ── One tension run per book ──────────────────────────────────────────────────
#
# Assembly writes the TEUs grouping reads, and grouping writes the lines
# synthesis reads. Two runs on one book either pay the LLM twice for the same
# step or build on the other's half-written output (a theme synthesised from the
# lines a regroup is about to replace). So the three share one lock per book:
# the op is held as batch_guard's item_id, and any live item blocks every op.

_GUARD_KIND = "tension"


def _running_op(book_id: str) -> tuple[TensionOp, str] | None:
    """``(op, task_id)`` of the tension run going for *book_id*, or None."""
    for op, task_id in batch_guard.running_items(_GUARD_KIND, book_id).items():
        return op, task_id  # type: ignore[return-value]
    return None


def _busy(book_id: str) -> JSONResponse | None:
    """409 ``batch_running`` when any tension run is going for the book."""
    running = _running_op(book_id)
    if running is None:
        return None
    body = ErrorResponse(
        detail=f"A tension {running[0]} run is already going for book '{book_id}'",
        code="batch_running",
    )
    return JSONResponse(status_code=409, content=body.model_dump())


async def _require_book(doc_service, book_id: str) -> None:
    """404 for a book that does not exist — not an empty answer or a task
    that "succeeds" on nothing."""
    if await doc_service.get_document(book_id) is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")


async def _tension_task(task_id: str) -> TaskStatus:
    """The task behind a tension poll endpoint; 404 for an unknown id or a
    task of another kind (these endpoints used to hand back any task)."""
    task = await get_task(task_id)
    if task is None or task.kind != "tension":
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


# ── Grouping (async) ───────────────────────────────────────────────────────────


async def _group_lines(task_id: str, req, tension_service, kg_service) -> dict:
    grouped = await tension_service.group_teus(
        document_id=req.document_id,
        kg_service=kg_service,
        language=req.language,
        force=req.force,
        progress_callback=task_runner.progress(task_id),
    )
    return {
        "lines": [line.model_dump() for line in grouped["lines"]],
        "coverage": grouped["coverage"],
    }


@router.post("/lines/group", response_model=TaskStatus, status_code=202)
async def group_tension_lines(
    req: GroupTensionLinesRequest,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start TensionLine grouping for a book.

    Returns 202 with ``task_id``.  Poll ``GET /tension/lines/group/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.

    404 for an unknown book; 409 (``code: batch_running``) while another tension
    run is going for the book (#14k).
    """
    await _require_book(doc_service, req.document_id)
    # No await between the check and the claim (see batch_guard).
    if (busy := _busy(req.document_id)) is not None:
        return busy
    require_llm_provider()
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力線分組")
    task_runner.launch(task_id, _group_lines(task_id, req, tension_service, kg_service))
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="group")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/lines/group/{task_id}", response_model=TaskStatus)
async def get_group_tension_lines(task_id: str) -> TaskStatus:
    return await _tension_task(task_id)


# ── Carrier resolution ─────────────────────────────────────────────────────────


async def _entity_types(kg_service, book_id: str) -> dict[str, str]:
    """Map entity id → entity type for one book, in a single KG pass."""
    entities = await kg_service.list_entities(document_id=book_id)
    return {
        e.id: (e.entity_type.value if hasattr(e.entity_type, "value") else str(e.entity_type))
        for e in entities
    }


def _carriers(pole: dict, types_by_id: dict[str, str]) -> list[Carrier]:
    """Zip a pole's carrier names with their ids and KG types.

    ``carrier_ids`` and ``carrier_names`` are parallel only as far as the
    assembler could resolve names to entities, so names beyond the id list — and
    ids the KG no longer knows — degrade to a null type rather than dropping the
    carrier.
    """
    names = list(pole.get("carrier_names") or [])
    ids = list(pole.get("carrier_ids") or [])
    out: list[Carrier] = []
    for idx, name in enumerate(names):
        cid = ids[idx] if idx < len(ids) else None
        out.append(Carrier(id=cid, name=name, entity_type=types_by_id.get(cid) if cid else None))
    return out


# ── Cached TensionLines ────────────────────────────────────────────────────────


@router.get("/lines", response_model=list[TensionLineDetail])
async def list_tension_lines(
    book_id: str,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
    doc_service: DocServiceDep,
) -> list[TensionLineDetail]:
    """Return cached TensionLines for a book, with constituent TEUs embedded.

    Each line includes a ``teus`` list (chapter, intensity, description, evidence,
    typed carriers and stance per pole) so the UI can render evidence inline
    without a second request. Returns an empty list if grouping has not been run
    yet — trigger grouping first with ``POST /tension/lines/group``; 404 for an
    unknown book.
    """
    await _require_book(doc_service, book_id)
    rows = await tension_service.get_lines_with_teus(book_id)
    types_by_id = await _entity_types(kg_service, book_id)
    result: list[TensionLineDetail] = []
    for r in rows:
        teus_payload: list[TEUSummary] = []
        for teu in r.get("teus", []):
            pole_a = teu.get("pole_a") or {}
            pole_b = teu.get("pole_b") or {}
            teus_payload.append(
                TEUSummary(
                    id=teu.get("id", ""),
                    chapter=int(teu.get("chapter", 0)),
                    intensity=float(teu.get("intensity", 0.0)),
                    tension_description=teu.get("tension_description", ""),
                    evidence=list(teu.get("evidence") or []),
                    pole_a_carriers=_carriers(pole_a, types_by_id),
                    pole_b_carriers=_carriers(pole_b, types_by_id),
                    pole_a_stance=pole_a.get("stance"),
                    pole_b_stance=pole_b.get("stance"),
                    flipped=bool(teu.get("flipped", False)),
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
                assembled_by=r.get("assembled_by", "tension_grouper_v1"),
                assembled_at=r.get("assembled_at"),
                edit=r.get("edit"),
                teus=teus_payload,
            )
        )
    return result


# ── Cached TEUs ────────────────────────────────────────────────────────────────


@router.get("/teus", response_model=list[TEUDetail])
async def list_teus(
    book_id: str,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
    doc_service: DocServiceDep,
) -> list[TEUDetail]:
    """Return every assembled TEU for a book, ordered by chapter.

    ``line_id`` is null when no TensionLine claims the TEU. Grouping runs as a
    single LLM call that may silently omit TEUs, so this is the only way to see
    what Step 1 produced but Step 2 dropped. Returns an empty list if TEU
    assembly has not been run yet; 404 for an unknown book.
    """
    await _require_book(doc_service, book_id)
    teus = await tension_service.get_teus(book_id)
    lines = await tension_service.get_lines(book_id)
    types_by_id = await _entity_types(kg_service, book_id)
    line_by_teu = {tid: line.id for line in lines for tid in line.teu_ids}
    # Which stretch of continuous narration each TEU belongs to. Derived here
    # rather than stored on the TEU: it is a property of the events as they
    # stand now, and a TEU cached weeks ago should not carry a stale answer.
    events = await kg_service.get_events(document_id=book_id)
    runs = group_narrative_runs(events)
    # Scenes come from the paragraphs, so they are derived here for the same
    # reason as runs: a TEU cached weeks ago must not carry a stale answer.
    # A chapter with no divider is absent from `scenes`, and `.get` turning
    # that into None is the intended reading — "not known", not "one scene".
    scenes = group_scenes(events, await doc_service.get_paragraphs(book_id))
    return [
        TEUDetail(
            id=teu.id,
            chapter=teu.chapter,
            intensity=teu.intensity,
            tension_description=teu.tension_description,
            evidence=list(teu.evidence or []),
            pole_a_concept=teu.pole_a.concept_name,
            pole_b_concept=teu.pole_b.concept_name,
            pole_a_carriers=_carriers(teu.pole_a.model_dump(), types_by_id),
            pole_b_carriers=_carriers(teu.pole_b.model_dump(), types_by_id),
            pole_a_stance=teu.pole_a.stance,
            pole_b_stance=teu.pole_b.stance,
            narrative_run_index=runs.get(teu.event_id),
            scene_index=scenes.get(teu.event_id),
            line_id=line_by_teu.get(teu.id),
        )
        for teu in teus
    ]


@router.patch("/teus/{teu_id}/assign", response_model=TensionLine)
async def assign_teu(
    teu_id: str,
    req: AssignTEURequest,
    tension_service: TensionServiceDep,
) -> dict:
    """Attach a TEU that grouping left out to a TensionLine.

    Repairs the shortfall reported by ``coverage`` / a null ``line_id``. The
    line's ``chapter_range`` and ``intensity_summary`` are recomputed, so the
    result is shaped exactly like a line grouping produced on its own.

    Re-assigning a TEU to the line it already sits on is a no-op; moving one
    between lines is rejected with 409 rather than silently rewriting both.
    """
    outcome, line = await tension_service.assign_teu_to_line(
        teu_id=teu_id,
        document_id=req.document_id,
        line_id=req.line_id,
    )
    if outcome == "teu_not_found":
        raise HTTPException(
            status_code=404,
            detail=f"TEU '{teu_id}' not found for document '{req.document_id}'",
        )
    if outcome == "line_not_found":
        raise HTTPException(
            status_code=404,
            detail=f"TensionLine '{req.line_id}' not found for document '{req.document_id}'",
        )
    if outcome == "claimed":
        raise HTTPException(
            status_code=409,
            detail=f"TEU '{teu_id}' is already grouped into TensionLine '{line.id}'",
        )
    return line.model_dump()


# ── HITL Review ────────────────────────────────────────────────────────────────


@router.patch("/lines/{line_id}/review", response_model=TensionLine)
async def review_tension_line(
    line_id: str,
    req: TensionLineReviewRequest,
    tension_service: TensionServiceDep,
) -> dict:
    """Update the review status of a TensionLine.

    Optionally override ``canonical_pole_a`` / ``canonical_pole_b`` when
    ``review_status`` is ``"modified"``, with ``note`` recording why. Overriding
    replaces the labels in place but preserves grouping's originals under
    ``edit`` — see ``#14f`` in the API contract.
    """
    updated = await tension_service.update_line_review(
        line_id=line_id,
        document_id=req.document_id,
        review_status=req.review_status,
        canonical_pole_a=req.canonical_pole_a,
        canonical_pole_b=req.canonical_pole_b,
        note=req.note,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"TensionLine '{line_id}' not found for document '{req.document_id}'",
        )
    return updated.model_dump()


# ── Mode A: Full-book batch TEU assembly (B-028) ───────────────────────────────


async def _analyze_book(
    task_id: str,
    req: AnalyzeBookTensionsRequest,
    tension_service,
    kg_service,
    doc_service,
) -> dict:
    report = task_runner.progress(task_id)

    def _on_progress(done: int, total: int) -> None:
        pct = int(done / total * 100) if total else 0
        report(pct, f"組裝 TEU {done}/{total}")

    return await tension_service.analyze_book_tensions(
        document_id=req.document_id,
        kg_service=kg_service,
        doc_service=doc_service,
        language=req.language,
        force=req.force,
        concurrency=req.concurrency,
        progress_callback=_on_progress,
    )


@router.post("/analyze", response_model=TaskStatus, status_code=202)
async def analyze_book_tensions(
    req: AnalyzeBookTensionsRequest,
    tension_service: TensionServiceDep,
    kg_service: KGServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start full-book TEU assembly (Mode A).

    Assembles TEUs for all events with ``tension_signal != "none"``.
    Returns 202 with ``task_id``.  Poll ``GET /tension/analyze/{task_id}``
    for progress and final result.

    404 for an unknown book; 409 (``code: batch_running``) while another tension
    run is going for the book (#14k).
    """
    await _require_book(doc_service, req.document_id)
    # No await between the check and the claim (see batch_guard).
    if (busy := _busy(req.document_id)) is not None:
        return busy
    require_llm_provider()
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力曲線分析")
    task_runner.launch(
        task_id, _analyze_book(task_id, req, tension_service, kg_service, doc_service)
    )
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="analyze")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/analyze/{task_id}", response_model=TaskStatus)
async def get_analyze_book_tensions(task_id: str) -> TaskStatus:
    return await _tension_task(task_id)


# ── TensionTheme synthesis (B-029) ────────────────────────────────────────────


async def _synthesize_theme(task_id: str, req: SynthesizeThemeRequest, tension_service) -> dict:
    progress = task_runner.progress(task_id)
    progress(15, "loading tension lines")
    progress(25, "calling LLM for theme synthesis")
    theme = await tension_service.synthesize_theme(
        document_id=req.document_id,
        language=req.language,
        force=req.force,
    )
    progress(90, "saving theme result")
    await tension_service.save_theme(theme)
    return theme.model_dump()


@router.post("/theme/synthesize", response_model=TaskStatus, status_code=202)
async def synthesize_tension_theme(
    req: SynthesizeThemeRequest,
    tension_service: TensionServiceDep,
    doc_service: DocServiceDep,
) -> TaskStatus | JSONResponse:
    """Start TensionTheme synthesis for a book.

    Requires TensionLines to be generated first (``POST /tension/lines/group``).
    Returns 202 with ``task_id``.  Poll ``GET /tension/theme/synthesize/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.

    404 for an unknown book; 409 (``code: batch_running``) while another tension
    run is going for the book (#14k).
    """
    await _require_book(doc_service, req.document_id)
    # No await between the check and the claim (see batch_guard).
    if (busy := _busy(req.document_id)) is not None:
        return busy
    require_llm_provider()
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力主題綜合")
    task_runner.launch(task_id, _synthesize_theme(task_id, req, tension_service))
    batch_guard.hold(_GUARD_KIND, req.document_id, task_id, item_id="synthesize")
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/theme/synthesize/{task_id}", response_model=TaskStatus)
async def get_synthesize_tension_theme(task_id: str) -> TaskStatus:
    return await _tension_task(task_id)


@router.get("/theme", response_model=TensionThemeResponse)
async def get_tension_theme(
    book_id: str,
    tension_service: TensionServiceDep,
    doc_service: DocServiceDep,
) -> TensionThemeResponse:
    """Return the cached TensionTheme for a book.

    ``is_stale`` reports whether the theme still reflects the current
    TensionLines — re-grouping or subsequent review decisions leave it built on
    inputs that no longer apply, and re-running synthesis needs ``force=true``
    to get past the cache.

    ``stale_reason="pipeline_rerun"`` outranks the others: if the events were
    re-extracted, the lines the theme was built from describe a book that no
    longer exists.

    Returns 404 if synthesis has not been run yet (or the book does not exist —
    the two differ only in ``detail``).
    Trigger synthesis first with ``POST /tension/theme/synthesize``.
    """
    doc = await doc_service.get_document(book_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    theme = await tension_service.get_theme(book_id)
    if theme is None:
        raise HTTPException(
            status_code=404,
            detail=f"No TensionTheme found for book '{book_id}'. Run synthesis first.",
        )
    is_stale, stale_reason = await tension_service.theme_staleness(
        book_id, theme, pipeline_status=doc.pipeline_status
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
        is_stale=is_stale,
        stale_reason=stale_reason,
        reviewed_line_count=theme.reviewed_line_count,
        total_line_count=theme.total_line_count,
    )


@router.patch("/theme/{theme_id}/review", response_model=TensionTheme)
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


# ── Running run (sync) ────────────────────────────────────────────────────────


@router.get("/running", response_model=RunningTensionResponse)
async def get_running_tension(
    book_id: str = Query(..., description="Book identifier"),
) -> dict:
    """The assembly / grouping / synthesis run going for this book (#14k).

    Read-only: lets the page pick a run back up after a remount (or from
    another tab) instead of offering to start one the POSTs would refuse with 409.
    """
    running = _running_op(book_id)
    if running is None:
        return RunningTensionResponse().model_dump(by_alias=True)
    op, task_id = running
    return RunningTensionResponse(op=op, task_id=task_id).model_dump(by_alias=True)
