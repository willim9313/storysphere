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
    # "Chapter 1", "Chapter One", "CHAPTER I" …
    re.compile(
        r"^(chapter|chap\.?|ch\.?)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)",
        re.IGNORECASE,
    ),
    # "第一章", "第1章" (CJK novels)
    re.compile(r"^第\s*[\d一二三四五六七八九十百千]+\s*[章節]"),
    # Stand-alone roman numerals on their own line: "I", "II", "III" …
    re.compile(r"^[IVXLCDM]{1,6}$"),
    # Numeric-only heading: "1", "2" … on its own line (≤3 digits)
    re.compile(r"^\d{1,3}$"),
    # "Prologue" / "Epilogue" / "Preface" / "Introduction"
    re.compile(r"^(prologue|epilogue|preface|introduction|foreword|afterword)$", re.IGNORECASE),
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
