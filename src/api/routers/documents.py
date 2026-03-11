"""Document query endpoints."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.deps import DocServiceDep

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentSummary(BaseModel):
    """Lightweight document entry for list responses."""
    id: str
    title: str
    file_type: str


class ChapterResponse(BaseModel):
    id: str
    number: int
    title: Optional[str]
    summary: Optional[str]
    word_count: int
    paragraph_count: int


class DocumentResponse(BaseModel):
    id: str
    title: str
    author: Optional[str]
    file_type: str
    summary: Optional[str]
    total_chapters: int
    total_paragraphs: int
    chapters: list[ChapterResponse]


@router.get("/", response_model=list[DocumentSummary])
async def list_documents(doc: DocServiceDep) -> list[DocumentSummary]:
    """List all ingested documents (lightweight)."""
    items = await doc.list_documents()
    return [DocumentSummary(**item) for item in items]


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
