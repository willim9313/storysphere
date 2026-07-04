from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from .timeline import TimelineConfig


class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"


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


class ChapterRole(str, Enum):
    """Chapter-level classification distinguishing narrative content from
    front/back matter (table of contents, prefaces, afterwords, ...).

    Unlike ``ParagraphRole``, this applies to a whole chapter. Non-body
    chapters are excluded from the chunk/embedding index but remain stored,
    so they can support a future cross-book front-matter lookup feature.
    """

    body = "body"
    toc = "toc"
    preface = "preface"
    afterword = "afterword"
    other = "other"


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
    embedding: list[float] | None = None
    keywords: dict[str, float] | None = None
    entities: list[ParagraphEntity] | None = None
    title_span: tuple[int, int] | None = Field(
        default=None,
        description="(start, end) char offsets of chapter title within text; None if no title",
    )


def extract_body_text(para: Paragraph) -> str | None:
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
    title: str | None = None
    role: ChapterRole = ChapterRole.body
    paragraphs: list[Paragraph] = Field(default_factory=list)
    summary: str | None = None
    keywords: dict[str, float] | None = None

    @property
    def word_count(self) -> int:
        return sum(len(p.text.split()) for p in self.paragraphs)


class Document(BaseModel):
    """A processed novel document (PDF or DOCX)."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    author: str | None = None
    file_path: str
    file_type: FileType
    chapters: list[Chapter] = Field(default_factory=list)
    summary: str | None = None  # book-level summary
    keywords: dict[str, float] | None = None
    language: str = "en"  # ISO 639-1 code, auto-detected or user-specified
    processed_at: datetime | None = None
    timeline_config: TimelineConfig | None = None
    pipeline_status: PipelineStatus = Field(default_factory=PipelineStatus)

    @property
    def total_chapters(self) -> int:
        return len(self.chapters)

    @property
    def total_paragraphs(self) -> int:
        return sum(len(c.paragraphs) for c in self.chapters)
