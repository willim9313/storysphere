"""Reader endpoints for a book — split out of ``books.py``.

Chapter listing (#4), chapter chunks (#5) and per-entity chunks (#9b),
plus the paragraph/entity segmentation helpers they share.  Shares the
``/books`` prefix with ``books.py``; the endpoint paths are unchanged.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException

from storysphere.api.deps import (
    DocServiceDep,
    KGServiceDep,
)
from storysphere.api.schemas.books import (
    ChapterResponse,
    ChunkResponse,
    EntityChunkItem,
    EntityChunksResponse,
    Segment,
    SegmentEntity,
    TopEntity,
)
from storysphere.domain.documents import (
    ChapterRole,
    ParagraphEntity,
)

router = APIRouter(prefix="/books", tags=["books"])


# ── #4 GET /books/:bookId/chapters ───────────────────────────────────────────


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    book_id: str, doc: DocServiceDep, kg: KGServiceDep
) -> list[dict]:
    """List chapters for a book.

    Non-body chapters (table of contents, prefaces, afterwords) are front/
    back matter, not part of the reading flow — they're excluded here even
    though they remain stored (e.g. for a future cross-book lookup).
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    body_chapters = [ch for ch in document.chapters if ch.role == ChapterRole.body]

    # Check if stored entities are available (new data)
    has_stored = any(
        p.entities is not None
        for ch in body_chapters
        for p in ch.paragraphs
    )

    # Fallback to KG runtime matching only for old data
    all_entities = None
    if not has_stored:
        all_entities = await kg.list_entities(document_id=book_id)

    results: list[dict] = []
    for ch in body_chapters:
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
