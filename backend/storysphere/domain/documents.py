from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, Field

from .timeline import TimelineConfig


class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    EPUB = "epub"


class StepStatus(str, Enum):
    pending = "pending"
    done = "done"
    failed = "failed"


class PipelineStatus(BaseModel):
    summarization: StepStatus = StepStatus.pending
    feature_extraction: StepStatus = StepStatus.pending
    knowledge_graph: StepStatus = StepStatus.pending
    symbol_discovery: StepStatus = StepStatus.pending

    # When each step last completed. Compared against an AnalysisCache entry's
    # ``created`` to tell whether a cached analysis predates the data it was
    # built from — see services/cache_invalidation.py. None means the step has
    # not finished since these fields were introduced, which reads as "cannot
    # tell", and staleness then reports fresh rather than guessing.
    summarization_at: datetime | None = None
    feature_extraction_at: datetime | None = None
    knowledge_graph_at: datetime | None = None
    symbol_discovery_at: datetime | None = None

    def mark_done(self, step_field: str, at: datetime | None = None) -> None:
        """Set a step to done and stamp when it finished."""
        setattr(self, step_field, StepStatus.done)
        setattr(self, f"{step_field}_at", at or datetime.now(UTC))


class ParagraphRole(str, Enum):
    body = "body"
    separator = "separator"
    section = "section"    # v2
    epigraph = "epigraph"  # v2
    preamble = "preamble"  # v2


class ChapterRole(str, Enum):
    """Chapter-level classification distinguishing narrative content from
    front/back matter (table of contents, prefaces, afterwords, ...).

    Roles are defined by FUNCTION, not by the heading text — a section titled
    "序"/"後記" whose content is actually story is ``body``. Authoritative
    definitions: ``docs/domain-glossary.md`` § 章節與段落角色 (keep the detector
    regex and the suggester prompt aligned with it).

    Unlike ``ParagraphRole``, this applies to a whole chapter. Non-body
    chapters are excluded from narrative processing — the embedding index,
    knowledge-graph extraction, and summarization all skip any chapter whose
    role is not ``body`` — but remain stored, so they can support a future
    cross-book front-matter lookup / info-page feature.
    """

    body = "body"
    toc = "toc"
    preface = "preface"
    afterword = "afterword"
    other = "other"


def assign_chapter_numbers(roles: Sequence[ChapterRole]) -> list[int]:
    """Map chapters (given in document order) to their chapter numbers.

    ``Chapter.number`` is the *story* chapter number: readers, event analysis
    and the timeline all render it as 「第 N 章」, so front/back matter must not
    consume numbers — otherwise a book opening with a preface + TOC reports its
    first real chapter as Ch.3.

    Numbering therefore is:

    - ``body`` chapters      → 1..N in document order
    - matter before the      → 0, -1, -2, … (assigned backwards so ascending
      first body chapter        numeric order still equals document order)
    - any other non-body     → N+1, N+2, … in document order

    Numbers stay unique within a document and ascending numeric order still
    matches document order — both relied on by ``DocumentService``, which
    orders chapters and paragraphs by number. The one exception is non-body
    matter sandwiched *between* body chapters, which sorts to the end; role
    detection only ever classifies leading/trailing matter, so that shape does
    not arise from the normal ingestion flow.

    Args:
        roles: Chapter roles in document order.

    Returns:
        Chapter numbers, aligned index-for-index with *roles*.
    """
    numbers: list[int | None] = [None] * len(roles)

    body_indices = [i for i, r in enumerate(roles) if r == ChapterRole.body]
    for n, i in enumerate(body_indices, start=1):
        numbers[i] = n

    first_body = body_indices[0] if body_indices else len(roles)

    # Leading matter, numbered backwards from the first body chapter: the
    # chapter closest to it gets 0, the one before that -1, and so on.
    for offset, i in enumerate(reversed(range(first_body))):
        numbers[i] = -offset

    next_number = len(body_indices) + 1
    for i in range(first_body, len(roles)):
        if numbers[i] is None:
            numbers[i] = next_number
            next_number += 1

    return [n for n in numbers if n is not None]


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
    def body_chapter_count(self) -> int:
        """Number of story chapters — the count readers see.

        ``total_chapters`` includes front/back matter, so it overstates the
        length of the story; anything user-facing (「共 N 章」, chapter axes,
        chapter sliders) wants this instead.
        """
        return sum(1 for c in self.chapters if c.role == ChapterRole.body)

    @property
    def total_paragraphs(self) -> int:
        return sum(len(c.paragraphs) for c in self.chapters)
