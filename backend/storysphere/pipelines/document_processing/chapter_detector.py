"""Heuristic chapter boundary detection.

Given a list of (index, text) raw segments, produces a list of
``ChapterSpan`` objects that group segments by chapter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from storysphere.domain.documents import ChapterRole

# ── Heading patterns ──────────────────────────────────────────────────────────

# Headings that include an explicit title after a separator character.
# Each pattern must capture the title text in group 1.
_HEADING_WITH_TITLE: list[re.Pattern[str]] = [
    # "Chapter 3 - The Return", "Ch. 2: Title", "Chapter IV: The Quest"
    re.compile(
        r"^(?:chapter|chap\.?|ch\.?)\s+(?:\d+|[ivxlcdm]+)\s*[:\-—–：]\s*(.+)",
        re.IGNORECASE,
    ),
    # "第1章：歸來", "第五章: 標題", "第三節-啟程"
    re.compile(
        r"^第\s*[\d一二三四五六七八九十百千萬零〇]+\s*[章節]\s*[:\-—–：－]\s*(.+)"
    ),
    # "第一章 茅草、木頭" (space / full-width space after number, no separator char)
    re.compile(
        r"^第\s*[\d一二三四五六七八九十百千萬零〇]+\s*[章節][\s　]+(.+)$"
    ),
]

# Headings that contain ONLY a chapter number / structural label (no inline title).
_HEADING_NO_TITLE: list[re.Pattern[str]] = [
    # "Volume 1, Chapter 5", "Book 2, Act 3", "Part 1 Chapter 1"
    re.compile(
        r"^(?:volume|vol|book|part)\s*\d{1,4},?\s*(?:chapter|ch\.?|act|scene)\s*\d{1,4}$",
        re.IGNORECASE,
    ),
    # "Chapter 1", "Chapter One", "CHAPTER I"
    re.compile(
        r"^(?:chapter|chap\.?|ch\.?)\s+"
        r"(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)$",
        re.IGNORECASE,
    ),
    # "第一章", "第1章", "第零章"
    re.compile(r"^第\s*[\d一二三四五六七八九十百千萬零〇]+\s*[章節]$"),
    # "Volume 1", "Part 3", "Act 1", "Scene 5"
    re.compile(
        r"^(?:volume|vol\.?|book|part|act|scene)\s+(?:\d+|[ivxlcdm]+)$",
        re.IGNORECASE,
    ),
    # Standalone uppercase roman numerals (I, II, III, IV … MMMCMXCIX)
    re.compile(
        r"^(?=[MDCLXVI])M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$"
    ),
    # "Prologue", "Epilogue" — narrative content, kept as ChapterRole.body.
    # (Preface/Introduction/Foreword/Afterword are front/back matter, not
    # story content — they're matched and classified separately below.)
    re.compile(
        r"^(?:prologue|epilogue)$",
        re.IGNORECASE,
    ),
]

# ── Chapter-level role classification ─────────────────────────────────────────
#
# Best-effort hints from the heading text alone — the human-in-the-loop
# chapter review step is the final authority. "Prologue"/"Epilogue" are NOT
# included here: they're narrative content (ChapterRole.body), unlike a
# preface/afterword which is meta-content about the book itself. An optional
# separator + trailing text is allowed so headings like "推薦序：一位讀者的告白"
# still classify correctly.
_TOC_HEADING_RE = re.compile(
    r"^(?:目錄|目次|table of contents|contents)(?:[:\-—–：].*)?$", re.IGNORECASE
)
_PREFACE_HEADING_RE = re.compile(
    r"^(?:自序|作者序|譯者序|推薦序|序言|前言|序|preface|foreword|introduction)"
    r"(?:[:\-—–：].*)?$",
    re.IGNORECASE,
)
_AFTERWORD_HEADING_RE = re.compile(
    r"^(?:後記|跋|afterword)(?:[:\-—–：].*)?$", re.IGNORECASE
)


def _classify_chapter_role(heading_text: str) -> ChapterRole:
    """Best-effort ``ChapterRole`` guess from a matched heading's raw text."""
    if _TOC_HEADING_RE.match(heading_text):
        return ChapterRole.toc
    if _PREFACE_HEADING_RE.match(heading_text):
        return ChapterRole.preface
    if _AFTERWORD_HEADING_RE.match(heading_text):
        return ChapterRole.afterword
    return ChapterRole.body


# ── Content-level table-of-contents detection ─────────────────────────────────
#
# Heading-based classification only inspects a chapter's first line, which
# misses front matter that EPUBs cram into a single spine item (e.g. blurb +
# preface + TOC in one XHTML file, with the "目錄" marker buried mid-chapter).
# A table of contents has a distinctive body signature — a contents keyword
# plus several standalone page-number tokens — that ordinary prose does not,
# so it is a strong, low-false-positive signal to scan the whole chapter for.

_TOC_KEYWORD_RE = re.compile(
    r"目\s*[錄録次]|table\s+of\s+contents|(?<![a-z])contents(?![a-z])",
    re.IGNORECASE,
)
# Standalone runs of 1–4 digits (page numbers), not embedded in a longer number.
_PAGE_NUMBER_RE = re.compile(r"(?<!\d)\d{1,4}(?!\d)")
_MIN_TOC_PAGE_NUMBERS = 2


def _looks_like_toc(chapter_text: str) -> bool:
    """True if a chapter's combined body text has a table-of-contents signature.

    Requires BOTH a contents keyword (目錄/目次/table of contents/…) AND at
    least ``_MIN_TOC_PAGE_NUMBERS`` standalone page-number tokens — prose that
    merely mentions a keyword, or lists a couple of numbers, won't match.
    """
    if not _TOC_KEYWORD_RE.search(chapter_text):
        return False
    return len(_PAGE_NUMBER_RE.findall(chapter_text)) >= _MIN_TOC_PAGE_NUMBERS


# ── Inline title heuristic ────────────────────────────────────────────────────

_MAX_INLINE_TITLE_CHARS = 30
_STARTS_WITH_WORD = re.compile(r"^\w", re.UNICODE)
_SENTENCE_END_PUNCT = re.compile(r"[。！？.!?]")


def _is_inline_title(text: str) -> bool:
    """Return True if a segment looks like a chapter subtitle rather than body prose.

    Criteria:
    - Non-empty and ≤ _MAX_INLINE_TITLE_CHARS characters
    - Starts with a word character (not a separator or decorative line)
    - Contains NO sentence-ending punctuation (。！？.!?) — prose sentences do
    """
    stripped = text.strip()
    if not stripped or len(stripped) > _MAX_INLINE_TITLE_CHARS:
        return False
    if not _STARTS_WITH_WORD.match(stripped):
        return False
    if _SENTENCE_END_PUNCT.search(stripped):
        return False
    return True


@dataclass
class ChapterSpan:
    """A contiguous range of raw segments belonging to one chapter."""

    chapter_number: int  # 1-indexed
    title: str | None
    segments: list[tuple[int, str]] = field(default_factory=list)
    role: ChapterRole = ChapterRole.body


def detect_chapters(
    segments: list[tuple[int, str]],
    styled_heading_indices: set[int] | None = None,
    styled_heading_roles: dict[int, ChapterRole] | None = None,
) -> list[ChapterSpan]:
    """Split raw segments into chapters using heuristic patterns.

    Title extraction:
    - If the heading line includes a title (e.g. "第三章：歸來" or
      "Chapter 3 - The Return"), that title is stored in ``ChapterSpan.title``.
    - If the heading contains only a chapter number (e.g. "第二章") and the
      very next segment is short and title-like, that segment is promoted to
      ``ChapterSpan.title`` and removed from the body segments.

    If no chapter headings are found the entire document is treated as a
    single un-titled chapter (number = 1).

    Args:
        segments: (index, text) pairs as returned by the loaders.
        styled_heading_indices: Indices the source format already marked as
            a heading via its own structure (e.g. DOCX "Heading N" styles,
            EPUB spine boundaries). These are trusted over the regex
            patterns, which only run as a fallback for segments without
            such a signal.
        styled_heading_roles: Authoritative ``ChapterRole`` for specific
            heading indices (e.g. from an EPUB's guide/landmarks metadata).
            When an index has an entry here, it overrides whatever role
            ``_classify_chapter_role`` would have guessed from the heading
            text — no guessing needed when the source format already knows.

    Returns:
        Ordered list of ``ChapterSpan`` objects with 1-indexed numbers.
    """
    if not segments:
        return []

    styled_heading_indices = styled_heading_indices or set()
    styled_heading_roles = styled_heading_roles or {}
    chapters: list[ChapterSpan] = []
    current: ChapterSpan | None = None
    chapter_counter = 0
    peek_for_inline_title = False  # True right after a no-title heading

    for idx, text in segments:
        stripped = text.strip()
        if idx in styled_heading_indices:
            is_heading = True
            _, title, role = _match_heading(stripped)
            if idx in styled_heading_roles:
                role = styled_heading_roles[idx]
            if title is None and not any(pat.match(stripped) for pat in _HEADING_NO_TITLE):
                # A styled heading whose text isn't a bare chapter-number
                # label (e.g. "楔子") — trust the whole line as the title.
                title = stripped or None
        else:
            is_heading, title, role = _match_heading(stripped)

        if is_heading:
            if current is not None:
                chapters.append(current)
            chapter_counter += 1
            current = ChapterSpan(
                chapter_number=chapter_counter,
                title=title,
                segments=[],
                role=role,
            )
            peek_for_inline_title = (title is None)
        else:
            # Peek: first segment after a title-less heading may be the chapter title.
            if peek_for_inline_title and current is not None and _is_inline_title(stripped):
                current.title = stripped
                peek_for_inline_title = False
                continue  # don't add to body segments
            peek_for_inline_title = False
            if current is None:
                # Content before any heading → implicit first chapter
                chapter_counter += 1
                current = ChapterSpan(chapter_number=chapter_counter, title=None, segments=[])
            current.segments.append((idx, text))

    if current is not None:
        chapters.append(current)

    # Drop chapters with no body content (e.g. headings immediately followed by
    # another heading with no text between them).
    chapters = [c for c in chapters if c.segments]

    # Content-level front-matter detection: a chapter still classified as body
    # whose full text has a table-of-contents signature (contents keyword +
    # page numbers) is front matter the heading-based pass missed — common in
    # EPUBs that pack a whole TOC into one spine item.
    for chapter in chapters:
        if chapter.role == ChapterRole.body:
            body_text = "\n".join(text for _, text in chapter.segments)
            if _looks_like_toc(body_text):
                chapter.role = ChapterRole.toc

    # Re-number remaining chapters sequentially starting from 1.
    for i, chapter in enumerate(chapters, start=1):
        chapter.chapter_number = i

    return chapters


# ── private helpers ─────────────────────────────────────────────────────────


def _match_heading(text: str) -> tuple[bool, str | None, ChapterRole]:
    """Return ``(is_heading, title_part, role)`` for the given text.

    ``title_part`` is the chapter title extracted from the heading line, or
    ``None`` if the heading contains only a chapter number / label.
    Headings longer than 80 characters are never matched. A toc/preface/
    afterword marker (e.g. "目錄", "推薦序：一位讀者的告白") is also matched as
    a heading here, in addition to being classified via ``role`` — otherwise
    it would never be recognized as a chapter boundary at all.
    """
    if len(text) > 80:
        return False, None, ChapterRole.body

    for pat in _HEADING_WITH_TITLE:
        m = pat.match(text)
        if m:
            title = m.group(1).strip()
            return True, title or None, ChapterRole.body

    for pat in _HEADING_NO_TITLE:
        if pat.match(text):
            return True, None, ChapterRole.body

    role = _classify_chapter_role(text)
    if role != ChapterRole.body:
        return True, text or None, role

    return False, None, ChapterRole.body
