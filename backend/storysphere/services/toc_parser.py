"""LLM-assisted table-of-contents parsing for chapter review ("目錄對照提示").

User-triggered, review-time helper that reads a detected table-of-contents block
and extracts the ordered chapter list the *book itself* declares — so the review
UI can show it side by side with the machine-detected chapter spine and let a
human eyeball the two for mis-splits (a chapter that was merged, or over-split).

Design (see docs/plans/20260712-toc-crosscheck-hint.md):
- Input is the concatenated text of the chapters the detector already classified
  as ``ChapterRole.toc``. A TOC's formatting is messy (dot leaders, nested
  part/chapter, multi-line entries, optional page numbers), so one LLM call
  extracts a structured, ordered entry list rather than a brittle regex.
- Output is display-only: the frontend renders the entries read-only and does the
  count comparison itself. This never mutates the document, drives splitting, or
  auto-aligns entries to detected chapters.
- Extraction only — the LLM preserves order and never invents entries. A block
  that isn't a real TOC yields an empty list (the UI shows a friendly fallback).

Detection in the ingest pipeline stays deterministic; this never runs there.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from storysphere.core.token_callback import set_llm_service_context
from storysphere.core.utils.output_extractor import extract_json_from_text
from storysphere.domain.documents import Chapter, ChapterRole

logger = logging.getLogger(__name__)

# Cap the text sent to the LLM: a TOC is short, and this bounds cost/tokens for a
# pathological block that got mis-classified as toc.
DEFAULT_MAX_CHARS = 6000


@dataclass
class TocEntry:
    """One entry parsed from a book's declared table of contents.

    ``level`` is 0 for a top-level chapter and increments for nested part/section
    structure. ``is_body`` is False for entries that are front/back matter
    (序/跋/目錄/版權/作者簡介) — the UI badges these "非正文" and excludes them
    from the chapter-count comparison.
    """

    title: str
    page: int | None = None
    level: int = 0
    is_body: bool = True


_SYSTEM_PROMPT = """You extract the entries from a book's TABLE OF CONTENTS into an ordered list.

The input is the raw text of a contents page. Entries may use dot leaders
(第一章 開端 …… 15), nest parts/chapters, span lines, or omit page numbers.

For each entry, in the order it appears, output:
- title: the entry title exactly as written, with any dot leaders and trailing
  page number stripped off.
- page: the page number as an integer, or null if none is shown.
- level: 0 for a top-level entry; 1, 2, … for nested part/section entries.
- isBody: true for a normal narrative chapter; false for front/back matter such
  as a preface/foreword (序/自序/推薦序), afterword (跋/後記/致謝), the table of
  contents itself, a copyright page, or an author/translator biography.

Extract only what is present — never invent, merge, or reorder entries. If the
text is not actually a table of contents, return an empty list.

Respond with ONLY a JSON object, no prose:
{"entries": [{"title": "<str>", "page": <int|null>, "level": <int>, "isBody": <bool>}]}
"""


def _coerce_entry(raw: object) -> TocEntry | None:
    """Turn one LLM-provided entry object into a TocEntry, or None if unusable."""
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title", "")).strip()
    if not title:
        return None
    page_raw = raw.get("page")
    page = int(page_raw) if isinstance(page_raw, (int, float)) else None
    level_raw = raw.get("level", 0)
    level = int(level_raw) if isinstance(level_raw, (int, float)) else 0
    return TocEntry(
        title=title,
        page=page,
        level=max(0, level),
        is_body=bool(raw.get("isBody", True)),
    )


async def parse_toc_entries(
    chapters: list[Chapter],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    llm=None,
) -> list[TocEntry]:
    """Parse the book's declared chapter list from its detected TOC chapters.

    Concatenates the text of every ``ChapterRole.toc`` chapter and sends it to the
    LLM for a single extraction call. Returns the ordered entries for the reviewer
    to eyeball; returns ``[]`` when there is no TOC chapter or none can be parsed.

    Raises ``RuntimeError`` (from the LLM client) if no LLM is configured.
    """
    toc_text = "\n".join(
        para.text
        for chapter in chapters
        if chapter.role == ChapterRole.toc
        for para in chapter.paragraphs
    ).strip()
    if not toc_text:
        return []

    if llm is None:
        from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

        llm = get_llm_client().get_with_local_fallback(temperature=0.0)
    set_llm_service_context("ingestion")

    from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=f"Table of contents:\n\n{toc_text[:max_chars]}"),
    ]
    response = await llm.ainvoke(messages)
    raw = response.content if hasattr(response, "content") else str(response)

    parsed, err = extract_json_from_text(raw)
    if err or not isinstance(parsed, dict):
        logger.warning("toc parser: parse failed (%s)", err)
        return []
    raw_entries = parsed.get("entries")
    if not isinstance(raw_entries, list):
        return []

    entries = [e for e in (_coerce_entry(r) for r in raw_entries) if e is not None]
    return entries
