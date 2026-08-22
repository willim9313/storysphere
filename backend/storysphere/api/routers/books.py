"""Book-centric endpoints — aligned with API_CONTRACT.md.

Replaces the old /documents and /ingest routers for frontend-facing API.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from storysphere.api import task_registry, task_runner
from storysphere.api.deps import (
    AnalysisAgentDep,
    AnalysisCacheDep,
    DocServiceDep,
    KGServiceDep,
    LinkPredictionServiceDep,
    SymbolServiceDep,
    VectorServiceDep,
)
from storysphere.api.routers._book_shared import cleanup_ingestion_checkpoint, now_iso
from storysphere.api.schemas.books import (
    BookDetailResponse,
    BookResponse,
    EntityStats,
    TaskIdResponse,
)
from storysphere.api.store import task_store
from storysphere.domain.documents import PipelineStatus, StepStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _entity_type_counts(entities: list) -> EntityStats:
    """Count entities by type from a list of Entity objects."""
    counts: dict[str, int] = {}
    for entity in entities:
        t = entity.entity_type.value
        counts[t] = counts.get(t, 0) + 1
    return EntityStats(
        character=counts.get("character", 0),
        location=counts.get("location", 0),
        organization=counts.get("organization", 0),
        object=counts.get("object", 0),
        concept=counts.get("concept", 0),
        other=counts.get("other", 0),
    )


def _book_status(ps: PipelineStatus) -> str:
    """Collapse the four pipeline steps into the one badge the library shows.

    - ``error``    — a step failed; the book is readable but something went wrong
    - ``analyzed`` — every step ran; the deep analysis pages all have data
    - ``ready``    — parsed and readable, analysis not finished

    There is no ``processing``: ``GET /books`` filters out books whose ingestion
    task is still active (the frontend draws those as ProcessingBookCard), and
    ``StepStatus`` has no ``running`` — a step sitting at ``pending`` may be
    mid-flight or may never have been asked to run, and this function cannot
    tell the two apart. Reporting "processing" from ``pending`` would mark every
    partially-analysed book as busy forever.
    """
    steps = (
        ps.summarization,
        ps.feature_extraction,
        ps.knowledge_graph,
        ps.symbol_discovery,
    )
    if any(step == StepStatus.failed for step in steps):
        return "error"
    if all(step == StepStatus.done for step in steps):
        return "analyzed"
    return "ready"


def _parse_pipeline_status(pipeline_status_json: str | None) -> PipelineStatus:
    """Stored JSON → domain object. Absent JSON means nothing has run yet."""
    if pipeline_status_json is None:
        return PipelineStatus()
    return PipelineStatus.model_validate_json(pipeline_status_json)


def _pipeline_status_response_from_domain(ps: PipelineStatus):
    from storysphere.api.schemas.books import PipelineStatusResponse  # noqa: PLC0415
    return PipelineStatusResponse(
        summarization=ps.summarization.value,
        feature_extraction=ps.feature_extraction.value,
        knowledge_graph=ps.knowledge_graph.value,
        symbol_discovery=ps.symbol_discovery.value,
    )


# ── #1 GET /books ────────────────────────────────────────────────────────────


@router.get("/", response_model=list[BookResponse])
async def list_books(doc: DocServiceDep, kg: KGServiceDep) -> list[dict]:
    """List all books.

    Books with an active ingestion task (pending / running / awaiting_review)
    are excluded — they are shown as ProcessingBookCard in the frontend instead.
    """
    from storysphere.api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    items = await doc.list_documents()

    # Filter out books whose ingestion task is still active
    settled: list = []
    for item in items:
        task_id = await get_task_id_by_book_id(item.id)
        if task_id is None:
            settled.append(item)
        else:
            task = await get_task(task_id)
            if task is None or task.status in ("done", "error"):
                settled.append(item)

    # Parallel entity count fetch to avoid N+1
    entity_lists = await asyncio.gather(
        *[kg.list_entities(document_id=item.id) for item in settled]
    )
    # Parsed once per book: both the badge and the per-step breakdown need it.
    pipeline_statuses = [_parse_pipeline_status(item.pipeline_status_json) for item in settled]
    return [
        BookResponse(
            id=item.id,
            title=item.title,
            status=_book_status(ps),
            chapter_count=item.chapter_count,
            entity_count=len(entities),
            uploaded_at="",
            pipeline_status=_pipeline_status_response_from_domain(ps),
        ).model_dump(by_alias=True)
        for item, entities, ps in zip(settled, entity_lists, pipeline_statuses, strict=False)
    ]


# ── #2-a GET /books/:bookId ──────────────────────────────────────────────────


@router.get("/{book_id}", response_model=BookDetailResponse)
async def get_book(book_id: str, doc: DocServiceDep, kg: KGServiceDep) -> dict:
    """Get book detail."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    book_entities = await kg.list_entities(document_id=book_id)
    book_events = await kg.get_events(document_id=book_id)
    stats = _entity_type_counts(book_entities)
    # Count relations that connect entities of this book
    book_entity_ids = {e.id for e in book_entities}
    # Count unique outgoing relations whose both endpoints belong to this book.
    # Works for both NetworkX and Neo4j backends (uses the public API only).
    seen_rel_ids: set[str] = set()
    for entity in book_entities:
        for rel in await kg.get_relations(entity.id, direction="out"):
            if rel.target_id in book_entity_ids and rel.id not in seen_rel_ids:
                seen_rel_ids.add(rel.id)
    book_relation_count = len(seen_rel_ids)
    return BookDetailResponse(
        id=document.id,
        title=document.title,
        author=document.author,
        status=_book_status(document.pipeline_status),
        language=document.language,
        summary=document.summary,
        chapter_count=document.body_chapter_count,
        chunk_count=document.total_paragraphs,
        entity_count=len(book_entities),
        relation_count=book_relation_count,
        event_count=len(book_events),
        entity_stats=stats,
        keywords=document.keywords,
        uploaded_at=(
            document.processed_at.isoformat() if document.processed_at else now_iso()
        ),
        pipeline_status=_pipeline_status_response_from_domain(document.pipeline_status),
    ).model_dump(by_alias=True)


# ── #2-b DELETE /books/:bookId ───────────────────────────────────────────────


@router.delete("/{book_id}", status_code=204)
async def delete_book(
    book_id: str,
    doc: DocServiceDep,
    vector: VectorServiceDep,
    kg: KGServiceDep,
    cache: AnalysisCacheDep,
    lp: LinkPredictionServiceDep,
    symbols: SymbolServiceDep,
) -> None:
    """Delete a book and everything derived from it.

    Every store is book-scoped and cleaned by an explicit call — there is no
    transaction across them, so the order matters where one store's keys are
    read from another (see the TEU note below).
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Finalise any associated ingestion task first, so the pipeline can't keep
    # writing to a book that is being deleted, and the task doesn't linger
    # forever as a non-terminal zombie in the Task Center.
    from storysphere.api.store import (  # noqa: PLC0415
        get_task,
        get_task_id_by_book_id,
        set_task_failed,
    )

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is not None:
        status = await get_task(task_id)
        if status is not None and status.status not in ("done", "error"):
            # A live asyncio task (phase 2) gets cancelled — its handler marks
            # the task failed. A paused one (awaiting_review) has no asyncio
            # task, so mark it terminal directly.
            if not task_registry.cancel(task_id):
                await set_task_failed(task_id, error="cancelled")
            await cleanup_ingestion_checkpoint(task_id)

    # TEU keys carry only an event id, so collect them before the KG rows go.
    teu_keys = [f"teu:{e.id}" for e in await kg.get_events(document_id=book_id)]

    await vector.delete_collection(book_id)
    await kg.remove_by_document(book_id)
    # book_id sits in the middle of some keys (character:{book}:{entity}) and at
    # the end of others (narrative_structure:{book}); match both shapes.
    await cache.invalidate(f"%{book_id}%")
    if teu_keys:
        await asyncio.gather(*[cache.invalidate(k) for k in teu_keys])
    await lp.delete_by_document(book_id)
    # Imagery rows are keyed by book_id only, so nothing else would ever read
    # them again — but nothing would delete them either.
    await symbols.delete_by_book(book_id)
    await doc.delete_document(book_id)
    return None


# ── Rerun endpoints ──────────────────────────────────────────────────────────

# Kept as a literal so the endpoint's 422 message does not depend on importing
# the workflow at module load. Must stay in step with the workflow's step
# registry — test_books_rerun.py::TestRerunStepRegistry asserts they match.
_RERUN_STEPS = {
    "summarization",
    "feature-extraction",
    "knowledge-graph",
    "symbol-discovery",
}


async def _rerun_step(
    book_id: str,
    step: str,
    doc_service,
    kg_service,
) -> dict:
    """Background task: drive one rerun and hand its outcome back.

    The rerun's own policy — what a failed KG save means, and which analyses a
    successful step invalidates — lives on ``IngestionWorkflow.rerun_step``,
    next to the step contract it builds on.
    """
    from storysphere.workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

    # document_service is injected so the workflow persists through the
    # service the endpoint already resolved, rather than opening a second one.
    wf = IngestionWorkflow(kg_service=kg_service, document_service=doc_service)

    outcome = await wf.rerun_step(step, book_id)
    if not outcome.ok:
        # A refused step is a real outcome with a message for the user, not a
        # crash — and not a success either, which a bare return would make it.
        raise task_runner.TaskAborted(outcome.error)

    return {"bookId": book_id, "step": step}


@router.post("/{book_id}/rerun/{step}", response_model=TaskIdResponse, status_code=202)
async def rerun_pipeline_step(
    book_id: str,
    step: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> dict:
    """Trigger a rerun of a single failed pipeline step for a book."""
    if step not in _RERUN_STEPS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown step '{step}'. Valid steps: {sorted(_RERUN_STEPS)}",
        )
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id, kind="ingestion", title="重跑處理步驟")
    task_runner.launch(task_id, _rerun_step(book_id, step, doc, kg))
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #6 POST /books/:bookId/analyze ──────────────────────────────────────────


@router.post("/{book_id}/analyze", response_model=TaskIdResponse, status_code=200)
async def trigger_book_analysis(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    agent: AnalysisAgentDep,
) -> dict:
    """Trigger full-book analysis for all entities."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id, title="整本書深度分析")

    # For MVP: just mark as done (full batch analysis to be implemented)
    task_store.set_completed(task_id, result={"bookId": book_id})

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #6c POST /books/:bookId/analysis/:section/:itemId/regenerate ────────────


@router.post(
    "/{book_id}/analysis/{section}/{item_id}/regenerate",
    response_model=TaskIdResponse,
)
async def regenerate_analysis(
    book_id: str,
    section: str,
    item_id: str,
    agent: AnalysisAgentDep,
) -> dict:
    """Regenerate a single analysis item."""
    task_id = str(uuid4())
    task_store.create(task_id, title="條目重新生成")
    # TODO: dispatch to correct analysis agent based on section
    task_store.set_completed(task_id, result={})
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


