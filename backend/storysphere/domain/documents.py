"""Book structure models: document, chapters and paragraphs.

入庫第一步（解析、切章、切段）的產物；`store/books.py` 負責存取。
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class FileType(StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    EPUB = "epub"


class ParagraphRole(StrEnum):
    body = "body"
    separator = "separator"
    section = "section"    # v2
    epigraph = "epigraph"  # v2
    preamble = "preamble"  # v2


# Separator detection lives here rather than in the ingestion pipeline because
# "what counts as a visual divider" is a rule about paragraphs, and two callers
# need it: ingestion, which turns such a line into a `separator` paragraph,
# and any reader that re-checks stored ones before trusting them.
_CONTENT_CHAR = re.compile(r"\w", re.UNICODE)
_MAX_SEP_LEN = 40

# Punctuation that belongs to running text rather than to a decorative rule.
# A line made of nothing but these is a line-wrap artifact — a PDF that breaks
# right before a closing quote emits a segment of just "。」" — and carries no
# `\w`, so the content-char test alone lets it through as a divider.
# Note the fix cannot be "require length ≥ n": the real separator "～" is one
# character, shorter than the "。」" this excludes.
_TEXT_PUNCT = frozenset('。．.！!？?，,、；;：:…⋯「」『』（）()【】《》〈〉〔〕｛｝[]{}“”‘’"\'')


def is_separator_segment(text: str) -> bool:
    """True if a raw segment looks like a visual divider (e.g. ***, ---, ◇◇◇)."""
    stripped = text.strip()
    if not stripped or len(stripped) > _MAX_SEP_LEN:
        return False
    if _CONTENT_CHAR.search(stripped):
        return False
    return not all(c in _TEXT_PUNCT or c.isspace() for c in stripped)


class ChapterRole(StrEnum):
    """Chapter-level classification distinguishing narrative content from
    front/back matter (table of contents, prefaces, afterwords, ...).

    Roles are defined by FUNCTION, not by the heading text — a section titled
    "序"/"後記" whose content is actually story is ``body``.

    Unlike ``ParagraphRole``, this applies to a whole chapter. Non-body
    chapters are excluded from narrative processing but remain stored.
    """

    body = "body"
    toc = "toc"
    preface = "preface"
    afterword = "afterword"
    other = "other"


def assign_chapter_numbers(roles: Sequence[ChapterRole]) -> list[int]:
    """Map chapters (given in document order) to their chapter numbers.

    ``Chapter.number`` is the *story* chapter number, rendered as 「第 N 章」,
    so front/back matter must not
    consume numbers — otherwise a book opening with a preface + TOC reports its
    first real chapter as Ch.3.

    Numbering therefore is:

    - ``body`` chapters      → 1..N in document order
    - matter before the      → 0, -1, -2, … (assigned backwards so ascending
      first body chapter        numeric order still equals document order)
    - any other non-body     → N+1, N+2, … in document order

    Numbers stay unique within a document and ascending numeric order still
    matches document order — both relied on by ``store.books``, which
    orders chapters by number. The one exception is non-body
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


class Paragraph(BaseModel):
    """A single text block within a chapter."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    chapter_number: int
    position: int = Field(description="0-indexed position within the chapter")
    role: ParagraphRole = ParagraphRole.body
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
    language: str = "en"  # ISO 639-1 code, auto-detected or user-specified
    # 題材判定的結果與使用者覆寫；入庫後續步驟才填。
    genre_profile: dict[str, Any] | None = None
    genre_override: str | None = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    processed_at: datetime | None = None

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
