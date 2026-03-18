"""Book-centric endpoints — aligned with API_CONTRACT.md.

Replaces the old /documents and /ingest routers for frontend-facing API.
"""

from __future__ import annotations

import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from api.deps import AnalysisAgentDep, DocServiceDep, KGServiceDep
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
    concept: int = 0
    event: int = 0


class BookDetailResponse(BookResponse):
    summary: str | None = None
    chunk_count: int = 0
    entity_count: int = 0
    relation_count: int = 0
    entity_stats: EntityStats = EntityStats()


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


# ── Helpers ──────────────────────────────────────────────────────────────────


def _entity_type_counts(kg) -> EntityStats:
    """Count entities by type from KGService."""
    counts: dict[str, int] = {}
    for entity in kg._entities.values():
        t = entity.entity_type.value
        counts[t] = counts.get(t, 0) + 1
    return EntityStats(
        character=counts.get("character", 0),
        location=counts.get("location", 0),
        concept=counts.get("concept", 0),
        event=counts.get("event", 0),
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Background tasks ────────────────────────────────────────────────────────


async def _run_ingestion(task_id: str, file_path: Path, title: str) -> None:
    task_store.set_running(task_id)
    task_store.set_progress(task_id, 10, "解析文件中")
    try:
        from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

        workflow = IngestionWorkflow()
        result = await workflow.run(file_path)
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
    task_store.set_running(task_id)
    try:
        result = await agent.analyze_character(
            entity_name=entity_name,
            document_id=document_id,
            language=language,
        )
        task_store.set_completed(task_id, result=result.model_dump())
    except Exception as exc:
        logger.exception("Entity analysis task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))


# ── #1 GET /books ────────────────────────────────────────────────────────────


@router.get("/", response_model=list[BookResponse])
async def list_books(doc: DocServiceDep, kg: KGServiceDep) -> list[dict]:
    """List all books."""
    items = await doc.list_documents()
    results = []
    for item in items:
        results.append(
            BookResponse(
                id=item["id"],
                title=item["title"],
                status="ready",
                chapter_count=0,
                entity_count=kg.entity_count,
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

    stats = _entity_type_counts(kg)
    return BookDetailResponse(
        id=document.id,
        title=document.title,
        author=document.author,
        status="ready",
        summary=document.summary,
        chapter_count=document.total_chapters,
        chunk_count=document.total_paragraphs,
        entity_count=kg.entity_count,
        relation_count=kg.relation_count,
        entity_stats=stats,
        uploaded_at=(
            document.processed_at.isoformat() if document.processed_at else _now_iso()
        ),
    ).model_dump(by_alias=True)


# ── #2-b DELETE /books/:bookId ───────────────────────────────────────────────


@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: str, doc: DocServiceDep) -> None:
    """Delete a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    # TODO: implement doc_service.delete_document + KG cleanup
    return None


# ── #2 POST /books/upload ────────────────────────────────────────────────────


@router.post("/upload", response_model=TaskIdResponse, status_code=202)
async def upload_book(
    background_tasks: BackgroundTasks,
    file: UploadFile,
) -> dict:
    """Upload a PDF/DOCX and start background ingestion."""
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise HTTPException(
            status_code=422, detail="Only .pdf and .docx files are supported"
        )

    # Extract title from filename
    title = Path(file.filename or "Untitled").stem

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
    background_tasks.add_task(_run_ingestion, task_id, Path(tmp.name), title)

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #4 GET /books/:bookId/chapters ───────────────────────────────────────────


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(book_id: str, doc: DocServiceDep) -> list[dict]:
    """List chapters for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    return [
        ChapterResponse(
            id=ch.id,
            book_id=book_id,
            title=ch.title or f"Chapter {ch.number}",
            order=ch.number,
            chunk_count=len(ch.paragraphs),
            entity_count=0,
            summary=ch.summary,
        ).model_dump(by_alias=True)
        for ch in document.chapters
    ]


# ── #5 GET /books/:bookId/chapters/:chapterId/chunks ────────────────────────


@router.get(
    "/{book_id}/chapters/{chapter_id}/chunks", response_model=list[ChunkResponse]
)
async def get_chapter_chunks(
    book_id: str, chapter_id: str, doc: DocServiceDep
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

    return [
        ChunkResponse(
            id=p.id,
            chapter_id=chapter.id,
            order=p.position,
            content=p.text,
            keywords=list(p.keywords.keys()) if p.keywords else [],
            segments=[Segment(text=p.text)],
        ).model_dump(by_alias=True)
        for p in chapter.paragraphs
    ]


# ── #9 GET /books/:bookId/graph ──────────────────────────────────────────────


@router.get("/{book_id}/graph", response_model=GraphDataResponse)
async def get_book_graph(book_id: str, doc: DocServiceDep, kg: KGServiceDep) -> dict:
    """Get knowledge graph data for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Build nodes from all entities (MVP: not document-scoped)
    entities = await kg.list_entities()
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

    # Build edges from graph
    edges: list[dict] = []
    seen_keys: set[str] = set()
    for u, v, key, data in kg._graph.edges(keys=True, data=True):
        base_key = key[:-4] if key.endswith("_rev") else key
        if base_key in seen_keys:
            continue
        seen_keys.add(base_key)
        edges.append(
            GraphEdge(
                id=base_key,
                source=u,
                target=v,
                label=data.get("relation_type"),
            ).model_dump(by_alias=True)
        )

    return GraphDataResponse(nodes=nodes, edges=edges).model_dump(by_alias=True)


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
    book_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> dict:
    """List character analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from domain.entities import EntityType  # noqa: PLC0415

    characters = await kg.list_entities(entity_type=EntityType.CHARACTER)
    unanalyzed = [
        UnanalyzedEntity(
            id=e.id,
            name=e.name,
            type="character",
            chapter_count=0,
        ).model_dump(by_alias=True)
        for e in characters
    ]

    return AnalysisListResponse(
        analyzed=[],
        unanalyzed=unanalyzed,
    ).model_dump(by_alias=True)


# ── #6b GET /books/:bookId/analysis/events ───────────────────────────────────


@router.get("/{book_id}/analysis/events", response_model=AnalysisListResponse)
async def list_event_analyses(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> dict:
    """List event analyses (analyzed + unanalyzed)."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    events = await kg.get_events()
    unanalyzed = [
        UnanalyzedEntity(
            id=ev.id,
            name=ev.title,
            type="event",
            chapter_count=0,
        ).model_dump(by_alias=True)
        for ev in events
    ]

    return AnalysisListResponse(
        analyzed=[],
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


# ── #7a GET /books/:bookId/entities/:entityId/analysis ───────────────────────


@router.get(
    "/{book_id}/entities/{entity_id}/analysis",
    response_model=EntityAnalysisResponse,
)
async def get_entity_analysis(
    book_id: str, entity_id: str, agent: AnalysisAgentDep
) -> dict:
    """Get analysis result for a specific entity."""
    # Try to get from analysis cache
    try:
        cached = await agent.cache.get(entity_id)
        if cached is not None:
            return EntityAnalysisResponse(
                entity_id=cached.entity_id,
                entity_name=cached.entity_name,
                content=cached.profile.summary if cached.profile else "",
                generated_at=(
                    cached.analyzed_at.isoformat() if cached.analyzed_at else _now_iso()
                ),
            ).model_dump(by_alias=True)
    except Exception:
        pass

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
    agent: AnalysisAgentDep,
    background_tasks: BackgroundTasks,
    language: str = "en",
) -> dict:
    """Trigger deep analysis for a single entity."""
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(
        _run_entity_analysis, task_id, entity.name, book_id, agent, language
    )

    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)


# ── #7c DELETE /books/:bookId/entities/:entityId/analysis ────────────────────


@router.delete("/{book_id}/entities/{entity_id}/analysis", status_code=204)
async def delete_entity_analysis(
    book_id: str, entity_id: str, agent: AnalysisAgentDep
) -> None:
    """Delete entity analysis from cache."""
    # TODO: implement cache.delete(entity_id)
    return None
