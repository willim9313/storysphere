"""Heuristic chapter boundary detection.

Given a list of (index, text) raw segments, produces a list of
``ChapterSpan`` objects that group segments by chapter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Patterns that signal the start of a new chapter (case-insensitive).
# Ordered from most specific to least specific.
_CHAPTER_PATTERNS: list[re.Pattern[str]] = [
    # Compound volume + chapter: "Volume 1, Chapter 5", "Book 2, Act 3"
    re.compile(
        r"^(volume|vol|book|part)\s*\d{1,4},?\s*(chapter|ch\.?|act|scene)\s*\d{1,4}$",
        re.IGNORECASE,
    ),
    # Chapter/Ch + number/roman + separator + title:
    # "Chapter 3 - The Return", "Ch. 2: Title", "Chapter IV: The Quest"
    re.compile(
        r"^(chapter|chap\.?|ch\.?)\s+(\d+|[ivxlcdm]+)\s*[:\-\u2014\u2013\uFF1A]\s*.+",
        re.IGNORECASE,
    ),
    # "第1章：歸來", "第五章: 標題" (CJK chapter + separator + title)
    re.compile(r"^第\s*[\d一二三四五六七八九十百千萬零〇]+\s*[章節]\s*[:\-\u2014\u2013\uFF1A]\s*.+"),
    # "Chapter 1", "Chapter One", "CHAPTER I" …
    re.compile(
        r"^(chapter|chap\.?|ch\.?)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)",
        re.IGNORECASE,
    ),
    # "第一章", "第1章", "第零章" (CJK novels, extended character set)
    re.compile(r"^第\s*[\d一二三四五六七八九十百千萬零〇]+\s*[章節]"),
    # "Volume 1", "Book 2", "Part 3", "Act 1", "Scene 5"
    re.compile(
        r"^(volume|vol\.?|book|part|act|scene)\s+(\d+|[ivxlcdm]+)$",
        re.IGNORECASE,
    ),
    # "Prologue" / "Epilogue" / "Preface" / "Introduction"
    re.compile(
        r"^(prologue|epilogue|preface|introduction|foreword|afterword)$",
        re.IGNORECASE,
    ),
]


@dataclass
class ChapterSpan:
    """A contiguous range of raw segments belonging to one chapter."""

    chapter_number: int  # 1-indexed
    title: str | None
    segments: list[tuple[int, str]] = field(default_factory=list)


def detect_chapters(segments: list[tuple[int, str]]) -> list[ChapterSpan]:
    """Split raw segments into chapters using heuristic patterns.

    If no chapter headings are found the entire document is treated as
    a single un-titled chapter (number = 1).

    Args:
        segments: (index, text) pairs as returned by the loaders.

    Returns:
        Ordered list of ``ChapterSpan`` objects with 1-indexed numbers.
    """
    if not segments:
        return []

    chapters: list[ChapterSpan] = []
    current: ChapterSpan | None = None
    chapter_counter = 0

    for idx, text in segments:
        stripped = text.strip()
        heading = _match_heading(stripped)

        if heading is not None:
            # Flush the previous chapter
            if current is not None:
                chapters.append(current)
            chapter_counter += 1
            title = None if heading == stripped else heading
            current = ChapterSpan(chapter_number=chapter_counter, title=title, segments=[])
            # Don't add the heading line itself as a content segment
        else:
            if current is None:
                # Content before any heading → implicit first chapter
                chapter_counter += 1
                current = ChapterSpan(chapter_number=chapter_counter, title=None, segments=[])
            current.segments.append((idx, text))

    if current is not None:
        chapters.append(current)

    # Drop chapters that have no content segments (e.g. TOC entries where a
    # heading is immediately followed by another heading with no body text).
    chapters = [c for c in chapters if c.segments]

    # Re-number remaining chapters sequentially starting from 1.
    for i, chapter in enumerate(chapters, start=1):
        chapter.chapter_number = i

    return chapters


# ── private helpers ─────────────────────────────────────────────────────────


def _match_heading(text: str) -> str | None:
    """Return the matched heading text, or None if not a chapter heading."""
    # Headings are typically short (≤80 chars) and on their own line
    if len(text) > 80:
        return None
    for pattern in _CHAPTER_PATTERNS:
        if pattern.match(text):
            return text
    return None
