"""Book-centric endpoints — aligned with API_CONTRACT.md.

Replaces the old /documents and /ingest routers for frontend-facing API.
"""

from __future__ import annotations

import asyncio
import logging
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Query, UploadFile

from api import task_registry
from api.deps import (
    AnalysisAgentDep,
    AnalysisCacheDep,
    DocServiceDep,
    EpistemicStateServiceDep,
    KGServiceDep,
    LinkPredictionServiceDep,
    TemporalPipelineDep,
    VectorServiceDep,
    VoiceProfilingServiceDep,
)
from api.schemas.books import (
    AnalysisItem,
    AnalysisListResponse,
    ArchetypeDetailResponse,
    ArcSegmentResponse,
    BookDetailResponse,
    BookResponse,
    CepResponse,
    ChapterResponse,
    CharacterAnalysisDetailResponse,
    ChunkResponse,
    ClassifyVisibilityResponse,
    ConfirmInferredRequest,
    EntityChunkItem,
    EntityChunksResponse,
    EntityStats,
    EpistemicStateResponse,
    EventAnalysisFullResponse,
    EventDetailResponse,
    EventLocation,
    EventParticipant,
    GraphDataResponse,
    GraphEdge,
    GraphNode,
    InferredRelationResponse,
    InferredRelationsResponse,
    LocationRef,
    MisbeliefItemSchema,
    ParticipantRef,
    ReviewChapterResponse,
    ReviewDataResponse,
    ReviewParagraphResponse,
    ReviewSubmitRequest,
    RunInferenceRequest,
    Segment,
    SegmentEntity,
    TaskIdResponse,
    TemporalRelationEntry,
    TimelineConfigResponse,
    TimelineConfigUpdate,
    TimelineDetectionResponse,
    TimelineEventEntry,
    TimelineQuality,
    TimelineResponse,
    TopEntity,
    UnanalyzedEntity,
    VoiceProfileResponse,
)
from api.store import task_store
from domain.documents import ParagraphEntity, PipelineStatus, StepStatus
from services.analysis_cache import AnalysisCache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pipeline_status_response(pipeline_status_json: str | None):
    from api.schemas.books import PipelineStatusResponse  # noqa: PLC0415
    if pipeline_status_json is None:
        return PipelineStatusResponse()
    ps = PipelineStatus.model_validate_json(pipeline_status_json)
    return _pipeline_status_response_from_domain(ps)


def _pipeline_status_response_from_domain(ps: PipelineStatus):
    from api.schemas.books import PipelineStatusResponse  # noqa: PLC0415
    return PipelineStatusResponse(
        summarization=ps.summarization.value,
        feature_extraction=ps.feature_extraction.value,
        knowledge_graph=ps.knowledge_graph.value,
        symbol_discovery=ps.symbol_discovery.value,
    )


# ── Background tasks ────────────────────────────────────────────────────────


async def _run_ingestion_graph(
    task_id: str,
    file_path: Path,
    title: str,
    author: str | None = None,
) -> None:
    from langgraph.errors import GraphInterrupt  # noqa: PLC0415

    from api.deps import get_ingestion_graph  # noqa: PLC0415

    task_store.set_running(task_id)
    task_store.set_progress(task_id, 5, "PDF 解析")

    config = {"configurable": {"thread_id": task_id}}
    initial_state = {
        "file_path": str(file_path),
        "title": title,
        "author": author,
        "language": None,
        "task_id": task_id,
        "doc_id": None,
        "errors": [],
        "chapters": 0,
        "paragraphs": 0,
        "paragraphs_embedded": 0,
        "keywords_extracted": 0,
        "chapters_summarized": 0,
        "book_summary_generated": False,
        "entities": 0,
        "relations": 0,
        "events": 0,
        "imagery_count": 0,
        "timeline_detection": None,
    }
    graph = get_ingestion_graph()
    try:
        await graph.ainvoke(initial_state, config=config)
    except GraphInterrupt:
        # Expected pause for chapter review — graph is checkpointed, not an error
        logger.info("Ingestion task %s paused for chapter review", task_id)
    except asyncio.CancelledError:
        logger.info("Ingestion task %s cancelled", task_id)
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        task_registry.unregister(task_id)
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass


async def _resume_ingestion_graph(task_id: str, chapters_data: list[dict]) -> None:
    from langgraph.types import Command  # noqa: PLC0415

    from api.deps import get_ingestion_graph  # noqa: PLC0415

    config = {"configurable": {"thread_id": task_id}}
    graph = get_ingestion_graph()
    try:
        await graph.ainvoke(Command(resume=chapters_data), config=config)
    except asyncio.CancelledError:
        logger.info("Resume of ingestion task %s cancelled", task_id)
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Resume of ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))


async def _run_entity_analysis(
    task_id: str, entity_name: str, document_id: str, agent, language: str = "en"
) -> None:
    logger.info("Entity analysis task %s started: entity=%s, doc=%s", task_id, entity_name, document_id)
    task_store.set_running(task_id)
    try:
        result = await agent.analyze_character(
            entity_name=entity_name,
            document_id=document_id,
            language=language,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
        )
        task_store.set_completed(task_id, result=result.model_dump())
        logger.info("Entity analysis task %s completed: entity=%s", task_id, entity_name)
    except Exception as exc:
        logger.exception("Entity analysis task %s failed: entity=%s", task_id, entity_name)
        task_store.set_failed(task_id, error=str(exc))


# ── #1 GET /books ────────────────────────────────────────────────────────────


@router.get("/", response_model=list[BookResponse])
async def list_books(doc: DocServiceDep, kg: KGServiceDep) -> list[dict]:
    """List all books.

    Books with an active ingestion task (pending / running / awaiting_review)
    are excluded — they are shown as ProcessingBookCard in the frontend instead.
    """
    from api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

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
    return [
        BookResponse(
            id=item.id,
            title=item.title,
            status="ready",
            chapter_count=item.chapter_count,
            entity_count=len(entities),
            uploaded_at="",
            pipeline_status=_pipeline_status_response(item.pipeline_status_json),
        ).model_dump(by_alias=True)
        for item, entities in zip(settled, entity_lists, strict=False)
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
        status="ready",
        summary=document.summary,
        chapter_count=document.total_chapters,
        chunk_count=document.total_paragraphs,
        entity_count=len(book_entities),
        relation_count=book_relation_count,
        entity_stats=stats,
        keywords=document.keywords,
        uploaded_at=(
            document.processed_at.isoformat() if document.processed_at else _now_iso()
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
) -> None:
    """Delete a book, its vector collection, KG data, analysis cache, and DB records."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    await vector.delete_collection(book_id)
    await kg.remove_by_document(book_id)
    await cache.invalidate(f"%:{book_id}:%")
    await lp.delete_by_document(book_id)
    await doc.delete_document(book_id)
    return None


# ── Rerun endpoints ──────────────────────────────────────────────────────────

_RERUN_STEPS = {
    "summarization",
    "feature-extraction",
    "knowledge-graph",
    "symbol-discovery",
}


async def _run_rerun_step(
    task_id: str,
    book_id: str,
    step: str,
    doc_service,
    kg_service,
) -> None:
    task_store.set_running(task_id)
    try:
        document = await doc_service.get_document(book_id)
        if document is None:
            task_store.set_failed(task_id, error=f"Book '{book_id}' not found")
            return

        from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415
        wf = IngestionWorkflow(kg_service=kg_service)

        if step == "summarization":
            try:
                await wf._summarization_pipeline.run(document)
                document.pipeline_status.summarization = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                document.pipeline_status.summarization = StepStatus.failed
                task_store.set_failed(task_id, error=str(exc))
                await doc_service.update_pipeline_status(book_id, document.pipeline_status)
                return

        elif step == "feature-extraction":
            try:
                await wf._feature_pipeline.run(document)
                document.pipeline_status.feature_extraction = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                document.pipeline_status.feature_extraction = StepStatus.failed
                task_store.set_failed(task_id, error=str(exc))
                await doc_service.update_pipeline_status(book_id, document.pipeline_status)
                return

        elif step == "knowledge-graph":
            try:
                await wf._kg_pipeline.run(document)
                await wf._kg_service.save()
                document.pipeline_status.knowledge_graph = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                document.pipeline_status.knowledge_graph = StepStatus.failed
                task_store.set_failed(task_id, error=str(exc))
                await doc_service.update_pipeline_status(book_id, document.pipeline_status)
                return

        elif step == "symbol-discovery":
            try:
                await wf._symbol_pipeline.run(document)
                document.pipeline_status.symbol_discovery = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                document.pipeline_status.symbol_discovery = StepStatus.failed
                task_store.set_failed(task_id, error=str(exc))
                await doc_service.update_pipeline_status(book_id, document.pipeline_status)
                return

        await doc_service.update_pipeline_status(book_id, document.pipeline_status)
        task_store.set_completed(task_id, result={"bookId": book_id, "step": step})

    except asyncio.CancelledError:
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Rerun task %s (%s) failed", task_id, step)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        task_registry.unregister(task_id)


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
    task_store.create(task_id)
    task = asyncio.create_task(_run_rerun_step(task_id, book_id, step, doc, kg))
    task_registry.register(task_id, task)
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #8d GET /books/:bookId/review-data ───────────────────────────────────────

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|(?<=[。！？])")


@router.get("/{book_id}/review-data", response_model=ReviewDataResponse)
async def get_review_data(
    book_id: str,
    doc: DocServiceDep,
) -> ReviewDataResponse:
    """Return chapter/paragraph data for review. Only available while awaiting_review."""
    from api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    global_idx = 0
    review_chapters: list[ReviewChapterResponse] = []
    for ch_idx, chapter in enumerate(document.chapters):
        paras: list[ReviewParagraphResponse] = []
        for para in chapter.paragraphs:
            sentences = [s for s in _SENTENCE_END.split(para.text) if s.strip()]
            if not sentences:
                sentences = [para.text]
            paras.append(
                ReviewParagraphResponse(
                    paragraph_index=global_idx,
                    text=para.text,
                    role=para.role.value,
                    title_span=list(para.title_span) if para.title_span else None,
                    sentences=sentences,
                )
            )
            global_idx += 1
        review_chapters.append(
            ReviewChapterResponse(
                chapter_idx=ch_idx,
                title=chapter.title,
                paragraphs=paras,
            )
        )

    return ReviewDataResponse(chapters=review_chapters)


# ── #8e POST /books/:bookId/review ───────────────────────────────────────────


@router.post("/{book_id}/review", status_code=204)
async def submit_review(
    book_id: str,
    body: ReviewSubmitRequest,
) -> None:
    """Submit reviewed chapter structure and resume the ingestion pipeline."""
    from api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Review window has already been closed",
        )

    resume_value = {
        "chapters": [ch.model_dump(by_alias=False) for ch in body.chapters],
        "role_overrides": body.role_overrides,
    }
    # Await the write so the frontend sees 'running' on its very next poll —
    # the sync fire-and-forget path would race with the immediately-following navigate.
    from api.store import set_task_running  # noqa: PLC0415
    await set_task_running(task_id)
    asyncio.create_task(_resume_ingestion_graph(task_id, resume_value))


# ── #2 POST /books/upload ────────────────────────────────────────────────────


@router.post("/upload", response_model=TaskIdResponse, status_code=202)
async def upload_book(
    file: UploadFile,
    title: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
) -> dict:
    """Upload a PDF/DOCX and start background ingestion."""
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise HTTPException(
            status_code=422, detail="Only .pdf and .docx files are supported"
        )

    # Use user-provided title if given, otherwise fall back to filename stem
    title = (title.strip() if title and title.strip() else None) or Path(file.filename or "Untitled").stem
    author = author.strip() if author and author.strip() else None

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            tmp.close()
            Path(tmp.name).unlink(missing_ok=True)
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)",
            )
        tmp.write(content)
        tmp.close()
    except HTTPException:
        raise
    except Exception as exc:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to save upload: {exc}"
        ) from exc

    task_id = str(uuid4())
    task_store.create(task_id)
    task = asyncio.create_task(_run_ingestion_graph(task_id, Path(tmp.name), title, author))
    task_registry.register(task_id, task)

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #4 GET /books/:bookId/chapters ───────────────────────────────────────────


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> list[dict]:
    """List chapters for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Check if stored entities are available (new data)
    has_stored = any(
        p.entities is not None
        for ch in document.chapters
        for p in ch.paragraphs
    )

    # Fallback to KG runtime matching only for old data
    all_entities = None
    if not has_stored:
        all_entities = await kg.list_entities(document_id=book_id)

    results: list[dict] = []
    for ch in document.chapters:
        if has_stored:
            # Aggregate unique entities from stored paragraph data
            seen_ids: dict[str, ParagraphEntity] = {}
            for p in ch.paragraphs:
                if p.entities:
                    for ent in p.entities:
                        if ent.entity_id not in seen_ids:
                            seen_ids[ent.entity_id] = ent
            unique_ents = list(seen_ids.values())
            entity_count = len(unique_ents)
            top = [
                TopEntity(id=e.entity_id, name=e.entity_name, type=e.entity_type)
                for e in unique_ents[:5]
            ]
        else:
            chapter_text = "\n\n".join(p.text for p in ch.paragraphs).lower()
            matched = [
                e for e in all_entities
                if e.name.lower() in chapter_text
                or any(a.lower() in chapter_text for a in e.aliases)
            ]
            entity_count = len(matched)
            top = [
                TopEntity(id=e.id, name=e.name, type=e.entity_type.value)
                for e in matched[:5]
            ]

        results.append(
            ChapterResponse(
                id=ch.id,
                book_id=book_id,
                title=ch.title or f"Chapter {ch.number}",
                order=ch.number,
                chunk_count=len(ch.paragraphs),
                entity_count=entity_count,
                summary=ch.summary,
                top_entities=top,
                keywords=ch.keywords,
            ).model_dump(by_alias=True)
        )
    return results


# ── Entity segmentation helper ───────────────────────────────────────────────


def _build_entity_segments(
    text: str,
    entities: list,
) -> list[Segment]:
    """Split *text* into Segments, tagging spans that match entity names/aliases."""
    if not entities:
        return [Segment(text=text)]

    # Build lookup: normalised surface form → (entity, original surface form)
    name_map: dict[str, tuple] = {}  # lowercase → (entity, display_name)
    for ent in entities:
        lower = ent.name.lower()
        if lower not in name_map or len(ent.name) > len(name_map[lower][1]):
            name_map[lower] = (ent, ent.name)
        for alias in getattr(ent, "aliases", []):
            a_lower = alias.lower()
            if a_lower not in name_map or len(alias) > len(name_map[a_lower][1]):
                name_map[a_lower] = (ent, alias)

    # Sort by length descending so longest matches win
    sorted_names = sorted(name_map.keys(), key=len, reverse=True)
    if not sorted_names:
        return [Segment(text=text)]

    # Build regex alternation (case-insensitive).
    # Use word-boundary for ASCII names; plain match for CJK/mixed names.
    _ASCII_RE = re.compile(r"^[\w\s]+$", re.ASCII)
    parts = []
    for n in sorted_names:
        esc = re.escape(n)
        if _ASCII_RE.match(n):
            parts.append(rf"(?<!\w){esc}(?!\w)")
        else:
            parts.append(esc)
    pattern = re.compile("(" + "|".join(parts) + ")", re.IGNORECASE)

    segments: list[Segment] = []
    last_end = 0
    for m in pattern.finditer(text):
        start, end = m.start(), m.end()
        # Non-entity text before this match
        if start > last_end:
            segments.append(Segment(text=text[last_end:start]))
        matched_text = m.group(0)
        ent, _display = name_map[matched_text.lower()]
        segments.append(
            Segment(
                text=matched_text,
                entity=SegmentEntity(
                    type=ent.entity_type.value,
                    entity_id=ent.id,
                    name=ent.name,
                ),
            )
        )
        last_end = end

    # Trailing text
    if last_end < len(text):
        segments.append(Segment(text=text[last_end:]))

    return segments if segments else [Segment(text=text)]


def _build_segments_from_stored(
    text: str, entities: list[ParagraphEntity]
) -> list[Segment]:
    """Build Segment list from pre-stored entity offsets — no regex needed."""
    if not entities:
        return [Segment(text=text)]

    sorted_ents = sorted(entities, key=lambda e: e.start)
    segments: list[Segment] = []
    last_end = 0
    for ent in sorted_ents:
        if ent.start > last_end:
            segments.append(Segment(text=text[last_end : ent.start]))
        segments.append(
            Segment(
                text=text[ent.start : ent.end],
                entity=SegmentEntity(
                    type=ent.entity_type,
                    entity_id=ent.entity_id,
                    name=ent.entity_name,
                ),
            )
        )
        last_end = ent.end
    if last_end < len(text):
        segments.append(Segment(text=text[last_end:]))
    return segments if segments else [Segment(text=text)]


# ── #5 GET /books/:bookId/chapters/:chapterId/chunks ────────────────────────


@router.get(
    "/{book_id}/chapters/{chapter_id}/chunks", response_model=list[ChunkResponse]
)
async def get_chapter_chunks(
    book_id: str,
    chapter_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> list[dict]:
    """Get chunks (paragraphs) for a chapter with entity segments."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Find chapter by id or by number
    chapter = None
    for ch in document.chapters:
        if ch.id == chapter_id or str(ch.number) == chapter_id:
            chapter = ch
            break

    if chapter is None:
        raise HTTPException(
            status_code=404, detail=f"Chapter '{chapter_id}' not found"
        )

    # Check if any paragraph has stored entities (new data)
    has_stored = any(p.entities is not None for p in chapter.paragraphs)

    # Fallback: fetch KG entities only if no stored entities exist
    all_entities = None
    if not has_stored:
        all_entities = await kg.list_entities(document_id=book_id)

    results: list[dict] = []
    for p in chapter.paragraphs:
        if p.entities is not None:
            segments = _build_segments_from_stored(p.text, p.entities)
        elif all_entities is not None:
            segments = _build_entity_segments(p.text, all_entities)
        else:
            segments = [Segment(text=p.text)]
        results.append(
            ChunkResponse(
                id=p.id,
                chapter_id=chapter.id,
                order=p.position,
                content=p.text,
                keywords=list(p.keywords.keys()) if p.keywords else [],
                segments=segments,
            ).model_dump(by_alias=True)
        )
    return results


# ── #9 GET /books/:bookId/graph ──────────────────────────────────────────────


@router.get("/{book_id}/graph", response_model=GraphDataResponse)
async def get_book_graph(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
    mode: str | None = None,
    position: int | None = None,
    include_inferred: bool = False,
) -> dict:
    """Get knowledge graph data for a book.

    Optional snapshot parameters:
    - mode: "chapter" (reading order) or "story" (chronological)
    - position: chapter number or chron_index depending on mode
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Snapshot mode: use get_snapshot() when mode+position provided
    if mode is not None and position is not None:
        if mode not in ("chapter", "story"):
            raise HTTPException(
                status_code=422,
                detail="mode must be 'chapter' or 'story'",
            )
        events, entities, relations = await kg.get_snapshot(book_id, mode, position)
    else:
        entities = await kg.list_entities(document_id=book_id)
        relations = await kg.list_relations(document_id=book_id)
        events = await kg.get_events(document_id=book_id)

    entity_ids = {e.id for e in entities}

    nodes = [
        GraphNode(
            id=e.id,
            name=e.name,
            type=e.entity_type.value,
            description=e.description,
            chunk_count=e.mention_count,
        ).model_dump(by_alias=True)
        for e in entities
    ]

    edges: list[dict] = [
        GraphEdge(
            id=rel.id,
            source=rel.source_id,
            target=rel.target_id,
            label=rel.relation_type.value,
        ).model_dump(by_alias=True)
        for rel in relations
        if rel.source_id in entity_ids and rel.target_id in entity_ids
    ]

    for event in events:
        nodes.append(
            GraphNode(
                id=event.id,
                name=event.title,
                type="event",
                description=event.description,
                chunk_count=len(event.participants),
                event_type=event.event_type.value,
                chapter=event.chapter,
            ).model_dump(by_alias=True)
        )
        for pid in event.participants:
            if pid in entity_ids:
                edges.append(
                    GraphEdge(
                        id=f"evt-{event.id}-{pid}",
                        source=event.id,
                        target=pid,
                        label="participates_in",
                    ).model_dump(by_alias=True)
                )
        if event.location_id and event.location_id in entity_ids:
            edges.append(
                GraphEdge(
                    id=f"evt-{event.id}-loc",
                    source=event.id,
                    target=event.location_id,
                    label="occurs_at",
                ).model_dump(by_alias=True)
            )

    if include_inferred:
        from domain.inferred_relations import InferenceStatus  # noqa: PLC0415
        inferred = await lp.list_inferred(book_id, status=InferenceStatus.PENDING)
        for ir in inferred:
            if ir.source_id not in entity_ids or ir.target_id not in entity_ids:
                continue
            if position is not None and ir.visible_from_chapter is not None:
                if ir.visible_from_chapter > position:
                    continue
            edges.append(
                GraphEdge(
                    id=f"ir-{ir.id}",
                    source=ir.source_id,
                    target=ir.target_id,
                    label=ir.suggested_relation_type.value,
                    confidence=ir.confidence,
                    inferred=True,
                    inferred_id=ir.id,
                ).model_dump(by_alias=True)
            )

    return GraphDataResponse(nodes=nodes, edges=edges).model_dump(by_alias=True)


# ── Link Prediction / Inferred Relations (F-01) ──────────────────────────────


@router.post("/{book_id}/inferred-relations/run", response_model=InferredRelationsResponse)
async def run_link_inference(
    book_id: str,
    body: RunInferenceRequest,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
) -> dict:
    """Run Common Neighbors + Adamic-Adar inference on the full book graph."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from config.settings import get_settings  # noqa: PLC0415
    settings = get_settings()
    entity_map = {e.id: e for e in await kg.list_entities(document_id=book_id)}
    items = await lp.run_inference(
        document_id=book_id,
        max_candidates=settings.link_prediction_max_candidates,
        min_common_neighbors=settings.link_prediction_min_common_neighbors,
        force_refresh=body.force_refresh,
    )
    responses = [_ir_to_response(ir, entity_map) for ir in items]
    return InferredRelationsResponse(items=responses, total=len(responses)).model_dump(by_alias=True)


@router.get("/{book_id}/inferred-relations", response_model=InferredRelationsResponse)
async def list_inferred_relations(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
    status: str | None = None,
) -> dict:
    """List inferred relation candidates for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from domain.inferred_relations import InferenceStatus  # noqa: PLC0415
    status_filter = None
    if status is not None:
        try:
            status_filter = InferenceStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status '{status}'")

    entity_map = {e.id: e for e in await kg.list_entities(document_id=book_id)}
    items = await lp.list_inferred(book_id, status=status_filter)
    responses = [_ir_to_response(ir, entity_map) for ir in items]
    return InferredRelationsResponse(items=responses, total=len(responses)).model_dump(by_alias=True)


@router.post("/{book_id}/inferred-relations/{ir_id}/confirm", status_code=201)
async def confirm_inferred_relation(
    book_id: str,
    ir_id: str,
    body: ConfirmInferredRequest,
    doc: DocServiceDep,
    lp: LinkPredictionServiceDep,
) -> dict:
    """Confirm an inferred relation; writes it as a real Relation to the KG."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from domain.relations import RelationType  # noqa: PLC0415
    try:
        relation_type = RelationType(body.relation_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid relation_type '{body.relation_type}'")

    ir = await lp.get_inferred(ir_id)
    if ir is None or ir.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")

    relation = await lp.confirm(ir_id, relation_type)
    if relation is None:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")
    return {"relationId": relation.id}


@router.post("/{book_id}/inferred-relations/{ir_id}/reject", status_code=204)
async def reject_inferred_relation(
    book_id: str,
    ir_id: str,
    doc: DocServiceDep,
    lp: LinkPredictionServiceDep,
) -> None:
    """Reject (dismiss) an inferred relation candidate."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    ir = await lp.get_inferred(ir_id)
    if ir is None or ir.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")

    await lp.reject(ir_id)
    return None


def _ir_to_response(ir: Any, entity_map: dict) -> InferredRelationResponse:
    src = entity_map.get(ir.source_id)
    tgt = entity_map.get(ir.target_id)
    return InferredRelationResponse(
        id=ir.id,
        document_id=ir.document_id,
        source_id=ir.source_id,
        target_id=ir.target_id,
        source_name=src.name if src else ir.source_id,
        target_name=tgt.name if tgt else ir.target_id,
        common_neighbor_count=ir.common_neighbor_count,
        adamic_adar_score=ir.adamic_adar_score,
        confidence=ir.confidence,
        suggested_relation_type=ir.suggested_relation_type.value,
        reasoning=ir.reasoning,
        status=ir.status.value,
        visible_from_chapter=ir.visible_from_chapter,
        confirmed_relation_id=ir.confirmed_relation_id,
        created_at=ir.created_at,
    )


# ── Timeline config endpoints ────────────────────────────────────────────────


@router.get("/{book_id}/timeline-config", response_model=TimelineConfigResponse)
async def get_timeline_config(book_id: str, doc: DocServiceDep) -> dict:
    """Get the timeline snapshot configuration for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    if document.timeline_config is None:
        raise HTTPException(
            status_code=404,
            detail="Timeline config not yet set. Run ingestion first.",
        )
    return document.timeline_config.model_dump()


@router.put("/{book_id}/timeline-config", response_model=TimelineConfigResponse)
async def update_timeline_config(
    book_id: str,
    body: TimelineConfigUpdate,
    doc: DocServiceDep,
) -> dict:
    """Update (confirm or change) the timeline snapshot configuration."""
    from datetime import datetime  # noqa: PLC0415

    from domain.timeline import TimelineConfig  # noqa: PLC0415

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    cfg = document.timeline_config or TimelineConfig()
    update = body.model_dump(exclude_none=True)
    updated = cfg.model_copy(update={**update, "configured_at": datetime.utcnow()})
    document.timeline_config = updated
    await doc.save_document(document)
    return updated.model_dump()


@router.post("/{book_id}/detect-timeline", response_model=TimelineDetectionResponse)
async def detect_timeline(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> dict:
    """Re-run timeline structure detection for a book."""
    from domain.timeline import TimelineConfig, TimelineDetectionResult  # noqa: PLC0415

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    events = await kg.get_events(document_id=book_id)
    distinct_chapters = {
        e.chapter for e in events if e.chapter and e.chapter > 0
    }
    ranked_count = sum(1 for e in events if e.chronological_rank is not None)
    chapter_count = len(distinct_chapters)

    result = TimelineDetectionResult(
        book_id=book_id,
        chapter_count=chapter_count,
        event_count=len(events),
        ranked_event_count=ranked_count,
        chapter_mode_viable=chapter_count > 1,
        story_mode_viable=ranked_count > 0,
    )

    # Update config, preserving any existing user choices
    existing = document.timeline_config
    document.timeline_config = TimelineConfig(
        chapter_mode_enabled=existing.chapter_mode_enabled if existing else False,
        story_mode_enabled=existing.story_mode_enabled if existing else False,
        default_mode=existing.default_mode if existing else "chapter",
        total_chapters=chapter_count,
        total_events=len(events),
        total_ranked_events=ranked_count,
        chapter_mode_configured=existing.chapter_mode_configured if existing else False,
        story_mode_configured=existing.story_mode_configured if existing else False,
    )
    await doc.save_document(document)
    return result.model_dump()


# ── #9a GET /books/:bookId/events/:eventId ───────────────────────────────────


@router.get("/{book_id}/events/{event_id}", response_model=EventDetailResponse)
async def get_event_detail(
    book_id: str, event_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> dict:
    """Get event detail with resolved participant and location names."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    event = await kg.get_event(event_id)
    if event is None or event.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    # Resolve participant names
    participants: list[dict] = []
    for pid in event.participants:
        entity = await kg.get_entity(pid)
        if entity:
            participants.append(
                EventParticipant(
                    id=entity.id, name=entity.name, type=entity.entity_type.value
                ).model_dump(by_alias=True)
            )

    # Resolve location name
    location = None
    if event.location_id:
        loc_entity = await kg.get_entity(event.location_id)
        if loc_entity:
            location = EventLocation(
                id=loc_entity.id, name=loc_entity.name
            ).model_dump(by_alias=True)

    return EventDetailResponse(
        id=event.id,
        title=event.title,
        event_type=event.event_type.value,
        description=event.description,
        chapter=event.chapter,
        significance=event.significance,
        consequences=event.consequences,
        participants=participants,
        location=location,
    ).model_dump(by_alias=True)


# ── #6 POST /books/:bookId/analyze ──────────────────────────────────────────


@router.post("/{book_id}/analyze", response_model=TaskIdResponse, status_code=200)
async def trigger_book_analysis(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger full-book analysis for all entities."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id)

    # For MVP: just mark as done (full batch analysis to be implemented)
    task_store.set_completed(task_id, result={"bookId": book_id})

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #6a GET /books/:bookId/analysis/characters ───────────────────────────────


@router.get("/{book_id}/analysis/characters", response_model=AnalysisListResponse)
async def list_character_analyses(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep, cache: AnalysisCacheDep
) -> dict:
    """List character analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from domain.entities import EntityType  # noqa: PLC0415
    from services.analysis_models import CharacterAnalysisResult  # noqa: PLC0415

    characters = await kg.list_entities(
        entity_type=EntityType.CHARACTER, document_id=book_id
    )
    analyzed: list[dict] = []
    unanalyzed: list[dict] = []
    for e in characters:
        cache_key = AnalysisCache.make_key("character", book_id, e.name)
        cached = await cache.get(cache_key)
        if cached is not None:
            try:
                result = CharacterAnalysisResult.model_validate(cached)
                archetype_type = (
                    result.archetypes[0].primary if result.archetypes else None
                )
                analyzed.append(
                    AnalysisItem(
                        id=e.id,
                        entity_id=e.id,
                        section="characters",
                        title=e.name,
                        archetype_type=archetype_type,
                        content=result.profile.summary if result.profile else "",
                        framework="jung",
                        generated_at=(
                            result.analyzed_at.isoformat()
                            if result.analyzed_at
                            else _now_iso()
                        ),
                    ).model_dump(by_alias=True)
                )
            except Exception:
                logger.exception("Failed to parse cached analysis for %s", e.name)
                unanalyzed.append(
                    UnanalyzedEntity(
                        id=e.id, name=e.name, type="character", chapter_count=0,
                    ).model_dump(by_alias=True)
                )
        else:
            unanalyzed.append(
                UnanalyzedEntity(
                    id=e.id, name=e.name, type="character", chapter_count=0,
                ).model_dump(by_alias=True)
            )

    return AnalysisListResponse(
        analyzed=analyzed,
        unanalyzed=unanalyzed,
    ).model_dump(by_alias=True)


# ── #6b GET /books/:bookId/analysis/events ───────────────────────────────────


@router.get("/{book_id}/analysis/events", response_model=AnalysisListResponse)
async def list_event_analyses(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep, cache: AnalysisCacheDep
) -> dict:
    """List event analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from services.analysis_models import EventAnalysisResult  # noqa: PLC0415

    events = await kg.get_events(document_id=book_id)
    analyzed: list[dict] = []
    unanalyzed: list[dict] = []
    for ev in events:
        cache_key = f"event:{book_id}:{ev.id}"
        cached = await cache.get(cache_key)
        if cached is not None:
            try:
                result = EventAnalysisResult.model_validate(cached)
                analyzed.append(
                    AnalysisItem(
                        id=ev.id,
                        entity_id=ev.id,
                        section="events",
                        title=ev.title,
                        content=result.summary.summary if result.summary else "",
                        framework="jung",
                        generated_at=(
                            result.analyzed_at.isoformat()
                            if result.analyzed_at
                            else _now_iso()
                        ),
                    ).model_dump(by_alias=True)
                )
            except Exception:
                logger.warning("Failed to parse cached event analysis for %s", ev.id)
                unanalyzed.append(
                    UnanalyzedEntity(
                        id=ev.id, name=ev.title, type="event", chapter_count=0,
                    ).model_dump(by_alias=True)
                )
        else:
            unanalyzed.append(
                UnanalyzedEntity(
                    id=ev.id, name=ev.title, type="event", chapter_count=0,
                ).model_dump(by_alias=True)
            )

    return AnalysisListResponse(
        analyzed=analyzed,
        unanalyzed=unanalyzed,
    ).model_dump(by_alias=True)


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
    background_tasks: BackgroundTasks,
) -> dict:
    """Regenerate a single analysis item."""
    task_id = str(uuid4())
    task_store.create(task_id)
    # TODO: dispatch to correct analysis agent based on section
    task_store.set_completed(task_id, result={})
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #9b GET /books/:bookId/entities/:entityId/chunks ─────────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/chunks",
    response_model=EntityChunksResponse,
)
async def get_entity_chunks(
    book_id: str,
    entity_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> dict:
    """Get all chunks (paragraphs) where a specific entity appears."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    rows = await doc.get_paragraphs_by_entity(book_id, entity_id)

    chunks: list[dict] = []
    for ch_id, ch_num, ch_title, p in rows:
        if p.entities is not None:
            segments = _build_segments_from_stored(p.text, p.entities)
        else:
            segments = [Segment(text=p.text)]
        chunks.append(
            EntityChunkItem(
                id=p.id,
                chapter_id=ch_id,
                chapter_title=ch_title,
                chapter_number=ch_num,
                order=p.position,
                content=p.text,
                segments=segments,
            ).model_dump(by_alias=True)
        )

    return EntityChunksResponse(
        entity_id=entity_id,
        entity_name=entity.name,
        total=len(chunks),
        chunks=chunks,
    ).model_dump(by_alias=True)


# ── #7a GET /books/:bookId/entities/:entityId/analysis ───────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/analysis",
    response_model=CharacterAnalysisDetailResponse,
)
async def get_entity_analysis(
    book_id: str,
    entity_id: str,
    cache: AnalysisCacheDep,
    kg: KGServiceDep,
) -> dict:
    """Get full analysis result for a specific character entity."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    cache_key = AnalysisCache.make_key("character", book_id, entity.name)
    try:
        cached = await cache.get(cache_key)
        if cached is not None:
            logger.info("Entity analysis cache HIT: key=%s", cache_key)
            from services.analysis_models import CharacterAnalysisResult
            result = CharacterAnalysisResult.model_validate(cached)
            return CharacterAnalysisDetailResponse(
                entity_id=entity_id,
                entity_name=entity.name,
                profile_summary=result.profile.summary if result.profile else "",
                archetypes=[
                    ArchetypeDetailResponse(
                        framework=a.framework,
                        primary=a.primary,
                        secondary=a.secondary,
                        confidence=a.confidence,
                        evidence=a.evidence,
                    )
                    for a in result.archetypes
                ],
                cep=CepResponse(
                    actions=result.cep.actions,
                    traits=result.cep.traits,
                    relations=result.cep.relations,
                    key_events=result.cep.key_events,
                    quotes=result.cep.quotes,
                    top_terms=result.cep.top_terms,
                ) if result.cep else None,
                arc=[
                    ArcSegmentResponse(
                        chapter_range=seg.chapter_range,
                        phase=seg.phase,
                        description=seg.description,
                    )
                    for seg in result.arc
                ],
                generated_at=(
                    result.analyzed_at.isoformat() if result.analyzed_at else _now_iso()
                ),
            ).model_dump(by_alias=True)
        logger.info("Entity analysis cache MISS: key=%s", cache_key)
    except Exception:
        logger.exception("Entity analysis cache read failed: key=%s", cache_key)

    raise HTTPException(status_code=404, detail="Analysis not found")


# ── #7b POST /books/:bookId/entities/:entityId/analyze ───────────────────────


@router.post(
    "/{book_id}/entities/{entity_id}/analyze",
    response_model=TaskIdResponse,
)
async def trigger_entity_analysis(
    book_id: str,
    entity_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger deep analysis for a single entity."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    language = await doc.get_document_language(book_id)
    logger.info(
        "Triggering entity analysis: entity=%s (%s), book=%s, lang=%s",
        entity.name, entity_id, book_id, language,
    )
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_entity_analysis, task_id, entity.name, book_id, agent, language
    )

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7c DELETE /books/:bookId/entities/:entityId/analysis ────────────────────


@router.delete("/{book_id}/entities/{entity_id}/analysis", status_code=204)
async def delete_entity_analysis(
    book_id: str, entity_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> None:
    """Delete entity analysis from cache."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    cache_key = AnalysisCache.make_key("character", book_id, entity.name)
    await cache.invalidate(cache_key)
    logger.info("Deleted entity analysis cache: key=%s", cache_key)


# ── F-03 GET /books/:bookId/entities/:entityId/epistemic-state ───────────────


@router.get(
    "/{book_id}/entities/{entity_id}/epistemic-state",
    response_model=EpistemicStateResponse,
)
async def get_entity_epistemic_state(
    book_id: str,
    entity_id: str,
    up_to_chapter: int = Query(..., ge=1),
    epistemic_svc: EpistemicStateServiceDep = None,
    doc: DocServiceDep = None,
    kg: KGServiceDep = None,
) -> dict:
    """Return what a character knows and doesn't know up to a given chapter."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    state = await epistemic_svc.get_character_knowledge(
        character_id=entity_id,
        document_id=book_id,
        up_to_chapter=up_to_chapter,
    )

    # data_complete = False when the book was ingested before F-03 added visibility.
    # Check ALL events in the book (not just the current chapter range) so that
    # chapters with legitimately all-public events don't produce false negatives.
    all_book_events = await kg.get_events(document_id=book_id)
    data_complete = any(ev.visibility != "public" for ev in all_book_events)

    return EpistemicStateResponse(
        character_id=state.character_id,
        character_name=state.character_name,
        up_to_chapter=state.up_to_chapter,
        known_events=[ev.model_dump() for ev in state.known_events],
        unknown_events=[ev.model_dump() for ev in state.unknown_events],
        misbeliefs=[
            MisbeliefItemSchema(
                character_belief=m.character_belief,
                actual_truth=m.actual_truth,
                source_event_id=m.source_event_id,
                confidence=m.confidence,
            )
            for m in state.misbeliefs
        ],
        data_complete=data_complete,
    ).model_dump(by_alias=True)


# ── F-03b POST /books/:bookId/classify-visibility (temporary) ───────────────
# TODO: replace with re-ingest pipeline once a per-book re-extraction endpoint exists


async def _run_classify_visibility(
    task_id: str, book_id: str, svc: Any
) -> None:
    task_store.set_running(task_id)
    try:
        counts = await svc.classify_event_visibility(
            document_id=book_id,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
        )
        task_store.set_completed(
            task_id,
            result=ClassifyVisibilityResponse(
                classified=counts["classified"],
                skipped=counts["skipped"],
                total=counts["classified"] + counts["skipped"],
            ).model_dump(by_alias=True),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("classify_visibility task %s failed: %s", task_id, exc)
        task_store.set_failed(task_id, error=str(exc))


@router.post(
    "/{book_id}/classify-visibility",
    response_model=TaskIdResponse,
    status_code=202,
)
async def classify_book_visibility(
    book_id: str,
    background_tasks: BackgroundTasks,
    epistemic_svc: EpistemicStateServiceDep = None,
    doc: DocServiceDep = None,
) -> dict:
    """Retroactively classify event visibility for a book using LLM.

    Temporary endpoint — may be replaced once a full re-ingest pipeline is available.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_classify_visibility, task_id, book_id, epistemic_svc)
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7d POST /books/:bookId/events/:eventId/analyze ─────────────────────────


async def _run_event_analysis(
    task_id: str, event_id: str, document_id: str, agent, language: str = "en"
) -> None:
    logger.info("Event analysis task %s started: event=%s, doc=%s", task_id, event_id, document_id)
    task_store.set_running(task_id)
    try:
        result = await agent.analyze_event(
            event_id=event_id,
            document_id=document_id,
            language=language,
            progress_callback=lambda pct, stage: task_store.set_progress(task_id, pct, stage),
        )
        task_store.set_completed(task_id, result=result.model_dump())
        logger.info("Event analysis task %s completed: event=%s", task_id, event_id)
    except Exception as exc:
        logger.exception("Event analysis task %s failed: event=%s", task_id, event_id)
        task_store.set_failed(task_id, error=str(exc))


@router.post(
    "/{book_id}/events/{event_id}/analyze",
    response_model=TaskIdResponse,
)
async def trigger_event_analysis(
    book_id: str,
    event_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger deep analysis for a single event."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    language = await doc.get_document_language(book_id)
    logger.info(
        "Triggering event analysis: event=%s (%s), book=%s, lang=%s",
        event.title, event_id, book_id, language,
    )
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_event_analysis, task_id, event_id, book_id, agent, language
    )

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7d-get GET /books/:bookId/events/:eventId/analysis ──────────────────────


@router.get(
    "/{book_id}/events/{event_id}/analysis",
    response_model=EventAnalysisFullResponse,
)
async def get_event_analysis(
    book_id: str, event_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> EventAnalysisFullResponse:
    """Return cached EEP / causality / impact analysis for a single event."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    cache_key = f"event:{book_id}:{event_id}"
    cached = await cache.get(cache_key)
    if cached is None:
        raise HTTPException(status_code=404, detail="Event analysis not found. Run analysis first.")

    from api.schemas.books import (  # noqa: PLC0415
        CausalityResponse,
        EepParticipantRole,
        EepResponse,
        ImpactResponse,
    )
    from services.analysis_models import EventAnalysisResult  # noqa: PLC0415

    result = EventAnalysisResult.model_validate(cached)
    return EventAnalysisFullResponse(
        event_id=result.event_id,
        title=result.title,
        eep=EepResponse(
            state_before=result.eep.state_before,
            state_after=result.eep.state_after,
            causal_factors=result.eep.causal_factors,
            prior_event_ids=result.eep.prior_event_ids,
            subsequent_event_ids=result.eep.subsequent_event_ids,
            participant_roles=[
                EepParticipantRole(
                    entity_id=pr.entity_id,
                    entity_name=pr.entity_name,
                    role=pr.role.value,
                    impact_description=pr.impact_description,
                )
                for pr in result.eep.participant_roles
            ],
            consequences=result.eep.consequences,
            structural_role=result.eep.structural_role,
            event_importance=result.eep.event_importance.value,
            thematic_significance=result.eep.thematic_significance,
            text_evidence=result.eep.text_evidence,
            key_quotes=result.eep.key_quotes,
            top_terms=result.eep.top_terms,
        ),
        causality=CausalityResponse(
            root_cause=result.causality.root_cause,
            causal_chain=result.causality.causal_chain,
            trigger_event_ids=result.causality.trigger_event_ids,
            chain_summary=result.causality.chain_summary,
        ),
        impact=ImpactResponse(
            affected_participant_ids=result.impact.affected_participant_ids,
            participant_impacts=result.impact.participant_impacts,
            relation_changes=result.impact.relation_changes,
            subsequent_event_ids=result.impact.subsequent_event_ids,
            impact_summary=result.impact.impact_summary,
        ),
        summary={"summary": result.summary.summary if result.summary else ""},
        analyzed_at=result.analyzed_at.isoformat() if result.analyzed_at else None,
    )


# ── #7e DELETE /books/:bookId/events/:eventId/analysis ───────────────────────


@router.delete("/{book_id}/events/{event_id}/analysis", status_code=204)
async def delete_event_analysis(
    book_id: str, event_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> None:
    """Delete event analysis from cache."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    cache_key = f"event:{book_id}:{event_id}"
    await cache.invalidate(cache_key)
    logger.info("Deleted event analysis cache: key=%s", cache_key)


# ── #7f POST /books/:bookId/events/analyze-all ───────────────────────────────


async def _run_batch_event_analysis(
    task_id: str,
    document_id: str,
    agent,
    kg_service,
    cache,
    language: str = "en",
) -> None:
    """Background task: analyze all unanalyzed events."""
    task_store.set_running(task_id)
    events = await kg_service.get_events(document_id=document_id)
    total = len(events)
    done = 0
    failed = 0
    skipped = 0

    for ev in events:
        cache_key = f"event:{document_id}:{ev.id}"
        if await cache.get(cache_key) is not None:
            skipped += 1
            done += 1
            continue
        try:
            await agent.analyze_event(
                event_id=ev.id,
                document_id=document_id,
                language=language,
            )
            done += 1
        except Exception as exc:
            logger.warning(
                "Batch event analysis failed for %s: %s",
                ev.id, exc,
            )
            failed += 1
            done += 1

        task_store.set_progress(
            task_id,
            progress=int(done / total * 100) if total else 0,
            stage=f"分析事件 {done}/{total}",
        )

    task_store.set_completed(
        task_id,
        result={
            "progress": total,
            "total": total,
            "failed": failed,
            "skipped": skipped,
        },
    )
    logger.info(
        "Batch event analysis complete: doc=%s, "
        "total=%d, skipped=%d, failed=%d",
        document_id, total, skipped, failed,
    )


@router.post(
    "/{book_id}/events/analyze-all",
    response_model=TaskIdResponse,
    status_code=202,
)
async def trigger_batch_event_analysis(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    cache: AnalysisCacheDep,
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger deep analysis for ALL events in a book.

    Skips events that already have cached analysis.
    Returns a task_id for progress tracking.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found",
        )

    events = await kg.get_events(document_id=book_id)
    if not events:
        raise HTTPException(
            status_code=400,
            detail="No events found for this book",
        )

    language = await doc.get_document_language(book_id)
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_batch_event_analysis,
        task_id, book_id, agent, kg, cache, language,
    )

    logger.info(
        "Triggered batch event analysis: book=%s, "
        "events=%d, task=%s",
        book_id, len(events), task_id,
    )
    return TaskIdResponse(task_id=task_id).model_dump(
        by_alias=True,
    )


# ── Timeline endpoints ───────────────────────────────────────────────────────


@router.get("/{book_id}/timeline", response_model=TimelineResponse)
async def get_book_timeline(
    book_id: str,
    kg: KGServiceDep,
    doc: DocServiceDep,
    cache: AnalysisCacheDep,
    order: str = "chronological",
    event_type: str | None = None,
) -> dict:
    """Get the global event timeline for a book.

    Query params:
        order: "narrative" (chapter order) or "chronological".
        event_type: optional filter by event type.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{book_id}' not found",
        )

    all_events = await kg.get_events(document_id=book_id)

    # Build chapter_title lookup from already-fetched document (zero extra I/O)
    chapter_title_map: dict[int, str | None] = {
        ch.number: ch.title for ch in document.chapters
    }

    # Compute EEP coverage; also extract event_importance from cache
    from services.analysis_models import EventAnalysisResult  # noqa: PLC0415
    analyzed_count = 0
    event_importance_map: dict[str, str] = {}
    for ev in all_events:
        cache_key = f"event:{book_id}:{ev.id}"
        cached = await cache.get(cache_key)
        if cached is not None:
            analyzed_count += 1
            try:
                result = EventAnalysisResult.model_validate(cached)
                event_importance_map[ev.id] = result.eep.event_importance.value
            except Exception:
                pass

    total = len(all_events)
    has_ranks = any(
        e.chronological_rank is not None for e in all_events
    )
    quality = TimelineQuality(
        total_count=total,
        analyzed_count=analyzed_count,
        eep_coverage=(
            analyzed_count / total if total > 0 else 0.0
        ),
        has_chronological_ranks=has_ranks,
    )

    # Apply event_type filter after coverage calculation
    events = all_events
    if event_type:
        events = [
            e for e in events
            if e.event_type.value == event_type
        ]

    if order == "chronological":
        events.sort(
            key=lambda e: (
                e.chronological_rank
                if e.chronological_rank is not None
                else float("inf"),
                e.chapter,
            )
        )
    else:
        events.sort(key=lambda e: e.chapter)

    # Batch-fetch all participant + location entities
    participant_ids: set[str] = set()
    location_ids: set[str] = set()
    for ev in events:
        participant_ids.update(ev.participants)
        if ev.location_id is not None:
            location_ids.add(ev.location_id)

    all_entity_ids = list(participant_ids | location_ids)
    if all_entity_ids:
        entity_results = await asyncio.gather(
            *[kg.get_entity(eid) for eid in all_entity_ids],
        )
    else:
        entity_results = []
    entity_map = {
        eid: ent
        for eid, ent in zip(all_entity_ids, entity_results)
        if ent is not None
    }

    temporal_relations = await kg.get_temporal_relations(
        document_id=book_id,
    )

    return TimelineResponse(
        book_id=book_id,
        order=order,
        events=[
            TimelineEventEntry(
                id=e.id,
                title=e.title,
                event_type=e.event_type.value,
                description=e.description,
                chapter=e.chapter,
                chapter_title=chapter_title_map.get(e.chapter),
                narrative_mode=e.narrative_mode.value,
                chronological_rank=e.chronological_rank,
                story_time_hint=e.story_time_hint,
                event_importance=event_importance_map.get(e.id),
                participants=[
                    ParticipantRef(
                        id=pid,
                        name=entity_map[pid].name if pid in entity_map else pid,
                        type=entity_map[pid].entity_type.value if pid in entity_map else "other",
                    )
                    for pid in e.participants
                ],
                location=(
                    LocationRef(
                        id=e.location_id,
                        name=entity_map[e.location_id].name,
                    )
                    if e.location_id and e.location_id in entity_map
                    else None
                ),
            )
            for e in events
        ],
        temporal_relations=[
            TemporalRelationEntry(
                source=tr.source_event_id,
                target=tr.target_event_id,
                type=tr.relation_type.value,
                confidence=tr.confidence,
            )
            for tr in temporal_relations
        ],
        quality=quality,
    ).model_dump(by_alias=True)


async def _run_temporal_pipeline(
    task_id: str,
    book_id: str,
    pipeline: Any,
    language: str,
) -> None:
    """Background task for temporal pipeline computation."""
    try:
        task_store.set_running(task_id)
        result = await pipeline.run(book_id, language=language)
        task_store.set_completed(
            task_id,
            result={
                "temporal_relations": result.temporal_relations,
                "events_ranked": result.events_ranked,
                "cycles_resolved": result.cycles_resolved,
                "errors": result.errors,
            },
        )
    except Exception as exc:
        logger.error("Temporal pipeline failed: %s", exc)
        task_store.set_failed(task_id, error=str(exc))


@router.post(
    "/{book_id}/timeline/compute",
    response_model=TaskIdResponse,
    status_code=202,
)
async def compute_book_timeline(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    pipeline: TemporalPipelineDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger temporal timeline computation for a book.

    Requires EEP (event analysis) to have been run first for best results.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    events = await kg.get_events(document_id=book_id)
    if not events:
        raise HTTPException(status_code=400, detail="No events found for this book")

    language = await doc.get_document_language(book_id)
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_temporal_pipeline, task_id, book_id, pipeline, language
    )

    logger.info("Triggered temporal pipeline: book=%s, task=%s", book_id, task_id)
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── F-04 GET /books/:bookId/entities/:entityId/voice ─────────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/voice",
    response_model=VoiceProfileResponse,
)
async def get_entity_voice_profile(
    book_id: str,
    entity_id: str,
    voice_svc: VoiceProfilingServiceDep,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> dict:
    """Return the voice profile for a character.

    Computes quantitative linguistic metrics and LLM qualitative description
    on first call; subsequent calls are served from SQLite cache.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    try:
        profile = await voice_svc.get_voice_profile(
            document_id=book_id,
            character_id=entity_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return VoiceProfileResponse(
        character_id=profile.character_id,
        character_name=profile.character_name,
        document_id=profile.document_id,
        avg_sentence_length=profile.avg_sentence_length,
        question_ratio=profile.question_ratio,
        exclamation_ratio=profile.exclamation_ratio,
        lexical_diversity=profile.lexical_diversity,
        paragraphs_analyzed=profile.paragraphs_analyzed,
        speech_style=profile.speech_style,
        distinctive_patterns=profile.distinctive_patterns,
        tone=profile.tone,
        representative_quotes=profile.representative_quotes,
        analyzed_at=profile.analyzed_at,
    ).model_dump(by_alias=True)


@router.delete("/{book_id}/entities/{entity_id}/voice", status_code=204)
async def delete_entity_voice_profile(
    book_id: str,
    entity_id: str,
    voice_svc: VoiceProfilingServiceDep,
    doc: DocServiceDep,
    kg: KGServiceDep,
) -> None:
    """Invalidate the cached voice profile so the next GET recomputes it."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    await voice_svc.invalidate(document_id=book_id, character_id=entity_id)
    logger.info("Invalidated voice profile cache: book=%s entity=%s", book_id, entity_id)
