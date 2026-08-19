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

from uuid import uuid4

from fastapi import APIRouter, HTTPException

from storysphere.api import task_runner
from storysphere.api.deps import DocServiceDep, KGServiceDep, TensionServiceDep
from storysphere.api.schemas.common import TaskStatus
from storysphere.api.schemas.tension import (
    AnalyzeBookTensionsRequest,
    AssignTEURequest,
    Carrier,
    GroupTensionLinesRequest,
    SynthesizeThemeRequest,
    TensionLineDetail,
    TensionLineReviewRequest,
    TensionThemeResponse,
    TensionThemeReviewRequest,
    TEUDetail,
    TEUSummary,
)
from storysphere.api.store import get_task, task_store

router = APIRouter(prefix="/tension", tags=["tension"])


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
) -> TaskStatus:
    """Start TensionLine grouping for a book.

    Returns 202 with ``task_id``.  Poll ``GET /tension/lines/group/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力線分組")
    task_runner.launch(task_id, _group_lines(task_id, req, tension_service, kg_service))
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/lines/group/{task_id}", response_model=TaskStatus)
async def get_group_tension_lines(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


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
) -> list[TensionLineDetail]:
    """Return cached TensionLines for a book, with constituent TEUs embedded.

    Each line includes a ``teus`` list (chapter, intensity, description, evidence,
    typed carriers and stance per pole) so the UI can render evidence inline
    without a second request. Returns an empty list if grouping has not been run
    yet — trigger grouping first with ``POST /tension/lines/group``.
    """
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
) -> list[TEUDetail]:
    """Return every assembled TEU for a book, ordered by chapter.

    ``line_id`` is null when no TensionLine claims the TEU. Grouping runs as a
    single LLM call that may silently omit TEUs, so this is the only way to see
    what Step 1 produced but Step 2 dropped. Returns an empty list if TEU
    assembly has not been run yet.
    """
    teus = await tension_service.get_teus(book_id)
    lines = await tension_service.get_lines(book_id)
    types_by_id = await _entity_types(kg_service, book_id)
    line_by_teu = {tid: line.id for line in lines for tid in line.teu_ids}
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
            line_id=line_by_teu.get(teu.id),
        )
        for teu in teus
    ]


@router.patch("/teus/{teu_id}/assign")
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


@router.patch("/lines/{line_id}/review")
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
) -> TaskStatus:
    """Start full-book TEU assembly (Mode A).

    Assembles TEUs for all events with ``tension_signal != "none"``.
    Returns 202 with ``task_id``.  Poll ``GET /tension/analyze/{task_id}``
    for progress and final result.
    """
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力曲線分析")
    task_runner.launch(
        task_id, _analyze_book(task_id, req, tension_service, kg_service, doc_service)
    )
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/analyze/{task_id}", response_model=TaskStatus)
async def get_analyze_book_tensions(task_id: str) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


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
) -> TaskStatus:
    """Start TensionTheme synthesis for a book.

    Requires TensionLines to be generated first (``POST /tension/lines/group``).
    Returns 202 with ``task_id``.  Poll ``GET /tension/theme/synthesize/{task_id}``
    until ``status`` is ``"done"`` or ``"error"``.
    """
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力主題綜合")
    task_runner.launch(task_id, _synthesize_theme(task_id, req, tension_service))
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

    Returns 404 if synthesis has not been run yet.
    Trigger synthesis first with ``POST /tension/theme/synthesize``.
    """
    theme = await tension_service.get_theme(book_id)
    if theme is None:
        raise HTTPException(
            status_code=404,
            detail=f"No TensionTheme found for book '{book_id}'. Run synthesis first.",
        )
    doc = await doc_service.get_document(book_id)
    is_stale, stale_reason = await tension_service.theme_staleness(
        book_id, theme, pipeline_status=doc.pipeline_status if doc else None
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
