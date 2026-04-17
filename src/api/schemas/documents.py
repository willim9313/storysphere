"""Response schemas for document query endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class DocumentSummary(BaseModel):
    """Lightweight document entry for list responses."""

    id: str
    title: str
    file_type: str


class ChapterResponse(BaseModel):
    id: str
    number: int
    title: str | None
    summary: str | None
    word_count: int
    paragraph_count: int


class DocumentResponse(BaseModel):
    id: str
    title: str
    author: str | None
    file_type: str
    summary: str | None
    total_chapters: int
    total_paragraphs: int
    chapters: list[ChapterResponse]


class ParagraphResponse(BaseModel):
    """Single paragraph within a chapter."""

    id: str
    text: str
    chapter_number: int
    position: int
    keywords: dict[str, float] | None = None
