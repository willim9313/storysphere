from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .timeline import TimelineConfig


class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"


class StepStatus(str, Enum):
    pending = "pending"
    done = "done"
    failed = "failed"


class PipelineStatus(BaseModel):
    summarization: StepStatus = StepStatus.pending
    feature_extraction: StepStatus = StepStatus.pending
    knowledge_graph: StepStatus = StepStatus.pending
    symbol_discovery: StepStatus = StepStatus.pending


class ParagraphRole(str, Enum):
    body = "body"
    separator = "separator"
    section = "section"    # v2
    epigraph = "epigraph"  # v2
    preamble = "preamble"  # v2


class ParagraphEntity(BaseModel):
    """An entity mention within a paragraph, with character offsets."""

    entity_id: str
    entity_name: str
    entity_type: str  # EntityType.value
    start: int  # character offset (inclusive)
    end: int  # character offset (exclusive)


class Paragraph(BaseModel):
    """A single text block within a chapter."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    chapter_number: int
    position: int = Field(description="0-indexed position within the chapter")
    role: ParagraphRole = ParagraphRole.body
    embedding: Optional[list[float]] = None
    keywords: Optional[dict[str, float]] = None
    entities: Optional[list[ParagraphEntity]] = None
    title_span: Optional[tuple[int, int]] = Field(
        default=None,
        description="(start, end) char offsets of chapter title within text; None if no title",
    )


def extract_body_text(para: "Paragraph") -> str | None:
    """Return the narrative body text of a paragraph, or None for non-body paragraphs.

    - Non-body roles (separator, section, epigraph, preamble) → None
    - Body paragraphs with a title_span → strip the title prefix, return remaining text
    - Plain body paragraphs → return text as-is
    """
    if para.role != ParagraphRole.body:
        return None
    if para.title_span is not None:
        body = para.text[para.title_span[1]:].lstrip()
        return body if body else None
    return para.text


class Chapter(BaseModel):
    """A chapter parsed from a novel document."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int
    title: Optional[str] = None
    paragraphs: list[Paragraph] = Field(default_factory=list)
    summary: Optional[str] = None
    keywords: Optional[dict[str, float]] = None

    @property
    def word_count(self) -> int:
        return sum(len(p.text.split()) for p in self.paragraphs)


class Document(BaseModel):
    """A processed novel document (PDF or DOCX)."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    author: Optional[str] = None
    file_path: str
    file_type: FileType
    chapters: list[Chapter] = Field(default_factory=list)
    summary: Optional[str] = None  # book-level summary
    keywords: Optional[dict[str, float]] = None
    language: str = "en"  # ISO 639-1 code, auto-detected or user-specified
    processed_at: Optional[datetime] = None
    timeline_config: Optional[TimelineConfig] = None
    pipeline_status: PipelineStatus = Field(default_factory=PipelineStatus)

    @property
    def total_chapters(self) -> int:
        return len(self.chapters)

    @property
    def total_paragraphs(self) -> int:
        return sum(len(c.paragraphs) for c in self.chapters)
