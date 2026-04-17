"""Document query endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.deps import DocServiceDep
from api.schemas.documents import (
    ChapterResponse,
    DocumentResponse,
    DocumentSummary,
    ParagraphResponse,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=list[DocumentSummary])
async def list_documents(doc: DocServiceDep) -> list[DocumentSummary]:
    """List all ingested documents (lightweight)."""
    items = await doc.list_documents()
    return [DocumentSummary(id=item.id, title=item.title, file_type=item.file_type) for item in items]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, doc: DocServiceDep) -> DocumentResponse:
    """Return full document details including chapter list."""
    document = await doc.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    return DocumentResponse(
        id=document.id,
        title=document.title,
        author=document.author,
        file_type=document.file_type.value,
        summary=document.summary,
        total_chapters=document.total_chapters,
        total_paragraphs=document.total_paragraphs,
        chapters=[
            ChapterResponse(
                id=ch.id,
                number=ch.number,
                title=ch.title,
                summary=ch.summary,
                word_count=ch.word_count,
                paragraph_count=len(ch.paragraphs),
            )
            for ch in document.chapters
        ],
    )


@router.get(
    "/{document_id}/chapters/{chapter_number}/paragraphs",
    response_model=list[ParagraphResponse],
)
async def get_chapter_paragraphs(
    document_id: str, chapter_number: int, doc: DocServiceDep
) -> list[ParagraphResponse]:
    """Return all paragraphs for a specific chapter."""
    paragraphs = await doc.get_paragraphs(document_id, chapter_number=chapter_number)
    if not paragraphs:
        raise HTTPException(status_code=404, detail="No paragraphs found")
    return [
        ParagraphResponse(
            id=p.id,
            text=p.text,
            chapter_number=p.chapter_number,
            position=p.position,
            keywords=p.keywords,
        )
        for p in paragraphs
    ]
