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

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from api.deps import AnalysisCacheDep, AnalysisAgentDep, DocServiceDep, KGServiceDep, TemporalPipelineDep, VectorServiceDep
from services.analysis_cache import AnalysisCache
from domain.documents import ParagraphEntity
from api.schemas.common import TaskStatus
from api.store import get_task, task_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ── Response models (camelCase) ──────────────────────────────────────────────


class BookResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    title: str
    author: str | None = None
    status: str = "ready"
    chapter_count: int = 0
    entity_count: int | None = None
    uploaded_at: str = ""
    last_opened_at: str | None = None


class EntityStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    character: int = 0
    location: int = 0
    organization: int = 0
    object: int = 0
    concept: int = 0
    other: int = 0


class BookDetailResponse(BookResponse):
    summary: str | None = None
    chunk_count: int = 0
    entity_count: int = 0
    relation_count: int = 0
    entity_stats: EntityStats = EntityStats()
    keywords: dict[str, float] | None = None


class TopEntity(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    type: str


class ChapterResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    book_id: str
    title: str
    order: int
    chunk_count: int = 0
    entity_count: int = 0
    summary: str | None = None
    top_entities: list[TopEntity] | None = None
    keywords: dict[str, float] | None = None


class SegmentEntity(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    type: str
    entity_id: str
    name: str


class Segment(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    text: str
    entity: SegmentEntity | None = None


class ChunkResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    chapter_id: str
    order: int
    content: str
    keywords: list[str] = []
    segments: list[Segment] = []


class GraphNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    type: str
    description: str | None = None
    chunk_count: int = 0
    event_type: str | None = None
    chapter: int | None = None


class GraphEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    source: str
    target: str
    label: str | None = None


class GraphDataResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class UnanalyzedEntity(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    type: str
    chapter_count: int = 0


class AnalysisItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    entity_id: str
    section: str
    title: str
    archetype_type: str | None = None
    chapter_count: int = 0
    content: str = ""
    framework: str = "jung"
    generated_at: str = ""


class AnalysisListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    analyzed: list[AnalysisItem] = []
    unanalyzed: list[UnanalyzedEntity] = []


class EntityAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    entity_id: str
    entity_name: str
    content: str
    generated_at: str


class TaskIdResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    task_id: str


class EntityChunkItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    chapter_id: str
    chapter_title: str | None = None
    chapter_number: int
    order: int
    content: str
    segments: list[Segment] = []


class EntityChunksResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    entity_id: str
    entity_name: str
    total: int
    chunks: list[EntityChunkItem] = []


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


# ── Background tasks ────────────────────────────────────────────────────────


async def _run_ingestion(
    task_id: str,
    file_path: Path,
    title: str,
    author: str | None = None,
) -> None:
    task_store.set_running(task_id)
    task_store.set_progress(task_id, 5, "PDF 解析")
    try:
        from api.deps import get_kg_service  # noqa: PLC0415
        from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

        kg_service = get_kg_service()
        workflow = IngestionWorkflow(kg_service=kg_service)
        result = await workflow.run(
            file_path,
            title=title,
            author=author,
            progress_cb=lambda pct, stage, *, sub_progress=None, sub_total=None, sub_stage=None: task_store.set_progress(task_id, pct, stage, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage),
        )
        task_store.set_completed(
            task_id,
            result={"bookId": result.document_id},
        )
        logger.info(
            "Ingestion task %s completed: %s chapters, %s entities",
            task_id,
            result.chapters,
            result.entities,
        )
    except Exception as exc:
        logger.exception("Ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass


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
    """List all books."""
    items = await doc.list_documents()
    results = []
    for item in items:
        book_entities = await kg.list_entities(document_id=item.id)
        results.append(
            BookResponse(
                id=item.id,
                title=item.title,
                status="ready",
                chapter_count=item.chapter_count,
                entity_count=len(book_entities),
                uploaded_at=_now_iso(),
            ).model_dump(by_alias=True)
        )
    return results


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
    ).model_dump(by_alias=True)


# ── #2-b DELETE /books/:bookId ───────────────────────────────────────────────


@router.delete("/{book_id}", status_code=204)
async def delete_book(
    book_id: str,
    doc: DocServiceDep,
    vector: VectorServiceDep,
    kg: KGServiceDep,
    agent: AnalysisAgentDep,
) -> None:
    """Delete a book, its vector collection, KG data, analysis cache, and DB records."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    await vector.delete_collection(book_id)
    await kg.remove_by_document(book_id)
    if agent._cache is not None:
        await agent._cache.invalidate(f"%:{book_id}:%")
    await doc.delete_document(book_id)
    return None


# ── #2 POST /books/upload ────────────────────────────────────────────────────


@router.post("/upload", response_model=TaskIdResponse, status_code=202)
async def upload_book(
    background_tasks: BackgroundTasks,
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
        tmp.write(content)
        tmp.close()
    except Exception as exc:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to save upload: {exc}"
        ) from exc

    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_ingestion, task_id, Path(tmp.name), title, author)

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
async def get_book_graph(book_id: str, doc: DocServiceDep, kg: KGServiceDep) -> dict:
    """Get knowledge graph data for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Build nodes from entities belonging to this book
    entities = await kg.list_entities(document_id=book_id)
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

    # Build edges — only those connecting entities of this book
    edges: list[dict] = []
    seen_keys: set[str] = set()
    for entity in entities:
        for rel in await kg.get_relations(entity.id, direction="out"):
            if rel.target_id not in entity_ids or rel.id in seen_keys:
                continue
            seen_keys.add(rel.id)
            edges.append(
                GraphEdge(
                    id=rel.id,
                    source=rel.source_id,
                    target=rel.target_id,
                    label=rel.relation_type.value,
                ).model_dump(by_alias=True)
            )

    # Add event nodes + edges
    events = await kg.get_events(document_id=book_id)
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

    return GraphDataResponse(nodes=nodes, edges=edges).model_dump(by_alias=True)


# ── #9a GET /books/:bookId/events/:eventId ───────────────────────────────────


class EventParticipant(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    type: str


class EventLocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str


class EventDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    title: str
    event_type: str
    description: str
    chapter: int
    significance: str | None = None
    consequences: list[str] = []
    participants: list[EventParticipant] = []
    location: EventLocation | None = None


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
    response_model=EntityAnalysisResponse,
)
async def get_entity_analysis(
    book_id: str,
    entity_id: str,
    cache: AnalysisCacheDep,
    kg: KGServiceDep,
) -> dict:
    """Get analysis result for a specific entity."""
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
            return EntityAnalysisResponse(
                entity_id=entity_id,
                entity_name=entity.name,
                content=result.profile.summary if result.profile else "",
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


@router.get("/{book_id}/events/{event_id}/analysis")
async def get_event_analysis(
    book_id: str, event_id: str, cache: AnalysisCacheDep, kg: KGServiceDep
) -> dict:
    """Return cached EEP / causality / impact analysis for a single event."""
    event = await kg.get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    cache_key = f"event:{book_id}:{event_id}"
    cached = await cache.get(cache_key)
    if cached is None:
        raise HTTPException(status_code=404, detail="Event analysis not found. Run analysis first.")

    from services.analysis_models import EventAnalysisResult  # noqa: PLC0415

    result = EventAnalysisResult.model_validate(cached)
    return {
        "eventId": result.event_id,
        "title": result.title,
        "eep": {
            "stateBefore": result.eep.state_before,
            "stateAfter": result.eep.state_after,
            "causalFactors": result.eep.causal_factors,
            "priorEventIds": result.eep.prior_event_ids,
            "subsequentEventIds": result.eep.subsequent_event_ids,
            "participantRoles": [
                {
                    "entityId": pr.entity_id,
                    "entityName": pr.entity_name,
                    "role": pr.role.value,
                    "impactDescription": pr.impact_description,
                }
                for pr in result.eep.participant_roles
            ],
            "consequences": result.eep.consequences,
            "structuralRole": result.eep.structural_role,
            "eventImportance": result.eep.event_importance.value,
            "thematicSignificance": result.eep.thematic_significance,
            "textEvidence": result.eep.text_evidence,
            "keyQuotes": result.eep.key_quotes,
            "topTerms": result.eep.top_terms,
        },
        "causality": {
            "rootCause": result.causality.root_cause,
            "causalChain": result.causality.causal_chain,
            "triggerEventIds": result.causality.trigger_event_ids,
            "chainSummary": result.causality.chain_summary,
        },
        "impact": {
            "affectedParticipantIds": result.impact.affected_participant_ids,
            "participantImpacts": result.impact.participant_impacts,
            "relationChanges": result.impact.relation_changes,
            "subsequentEventIds": result.impact.subsequent_event_ids,
            "impactSummary": result.impact.impact_summary,
        },
        "summary": {"summary": result.summary.summary if result.summary else ""},
        "analyzedAt": result.analyzed_at.isoformat() if result.analyzed_at else None,
    }


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


class ParticipantRef(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    name: str
    type: str


class LocationRef(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    name: str


class TimelineEventEntry(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    title: str
    event_type: str
    description: str
    chapter: int
    chapter_title: str | None = None
    narrative_mode: str = "unknown"
    chronological_rank: float | None = None
    story_time_hint: str | None = None
    event_importance: str | None = None
    participants: list[ParticipantRef] = []
    location: LocationRef | None = None


class TemporalRelationEntry(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    source: str
    target: str
    type: str
    confidence: float


class TimelineQuality(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True,
    )
    total_count: int = 0
    analyzed_count: int = 0
    eep_coverage: float = 0.0
    has_chronological_ranks: bool = False
    last_computed: str | None = None


class TimelineResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    book_id: str
    order: str
    events: list[TimelineEventEntry]
    temporal_relations: list[TemporalRelationEntry]
    quality: TimelineQuality


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
        result = await pipeline.run(document_id=book_id, language=language)
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
