"""Paragraph chunker.

Converts raw text segments (from a ChapterSpan) into ``Paragraph`` objects.
Segments that are too long are split on sentence boundaries; segments that are
too short are merged with their neighbours.
"""

from __future__ import annotations

import re

from domain.documents import Paragraph

# Minimum / maximum character counts per paragraph chunk.
MIN_CHARS = 50
MAX_CHARS = 1_200

# Sentence splitter — splits after ASCII (.!?) or CJK (。！？) sentence-ending
# punctuation.  For CJK, the punctuation itself is kept at the end of the
# preceding sentence (lookbehind), and we split on any following whitespace
# OR directly at the next non-space character (zero-width split after 。！？).
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|(?<=[。！？])")


def chunk_segments(
    segments: list[tuple[int, str]],
    chapter_number: int,
    *,
    min_chars: int = MIN_CHARS,
    max_chars: int = MAX_CHARS,
) -> list[Paragraph]:
    """Turn raw segments into ``Paragraph`` objects.

    Strategy:
    1. Split segments that exceed ``max_chars`` on sentence boundaries.
    2. Merge consecutive segments that are below ``min_chars``.
    3. Assign 0-indexed positions within the chapter.

    Args:
        segments: (raw_index, text) pairs from a ``ChapterSpan``.
        chapter_number: The chapter these paragraphs belong to.
        min_chars: Minimum chars for a stand-alone paragraph chunk.
        max_chars: Maximum chars before splitting on sentences.

    Returns:
        Ordered list of ``Paragraph`` objects (no embeddings yet).
    """
    # Step 1: join all lines into one text block, then split on sentence boundaries.
    # This is necessary because the PDF loader emits one segment per line (~60-100
    # chars each); merging line-by-line with a 50-char threshold would produce
    # one chunk per line.  Joining first lets the sentence splitter produce
    # properly-sized chunks regardless of how the loader segmented the file.
    full_text = " ".join(text.strip() for _, text in segments if text.strip())
    if not full_text:
        return []

    merged = _split_long(full_text, max_chars)

    # Drop chunks that are too short to be useful (e.g. stray punctuation lines)
    merged = [c for c in merged if len(c) >= min_chars]

    # Step 3: build Paragraph objects
    paragraphs = [
        Paragraph(text=text, chapter_number=chapter_number, position=pos)
        for pos, text in enumerate(merged)
        if text.strip()
    ]
    return paragraphs


# ── private helpers ──────────────────────────────────────────────────────────


def _split_long(text: str, max_chars: int) -> list[str]:
    """Split text on sentence boundaries so each chunk ≤ max_chars."""
    sentences = _SENTENCE_END.split(text)
    chunks: list[str] = []
    buffer = ""
    for sentence in sentences:
        candidate = (buffer + " " + sentence).strip() if buffer else sentence
        if len(candidate) <= max_chars:
            buffer = candidate
        else:
            if buffer:
                chunks.append(buffer)
            # If a single sentence exceeds max_chars, keep it as-is
            buffer = sentence
    if buffer:
        chunks.append(buffer)
    return chunks
