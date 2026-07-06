"""LLM-assisted boundary detection for chapter review ("邊界輔助辨識").

User-triggered, review-time helper that finds front/back matter fused into the
edges of a book's *body* text — copyright pages, tables of contents, prefaces,
afterwords, author/translator bios, blurbs, publisher catalogs — and returns the
boundaries so the review UI can split them off into their own non-body chapters.

Design (see docs/plans/20260706-boundary-role-suggester.md):
- Front/back matter sits at the *physical ends* of the text, at paragraph
  granularity — often fused into the head of the first body chapter or the TAIL
  of the last body chapter, NOT aligned to chapter boundaries. So we walk the
  body paragraphs inward from each end, classify ONE paragraph per LLM call, and
  stop at the first real story paragraph. The continuous body middle is never
  sent, and cost scales with how much matter there actually is.
- Only ``ChapterRole.body`` chapters are walked: chapters the detector already
  classified as non-body (e.g. a 目錄 chapter) are front/back matter already —
  re-marking their paragraphs would be redundant and clutter the review.
- Language-agnostic: the LLM judges paragraph *content*, so there are no
  per-language keyword tables to maintain.
- Output is a pair of book-global paragraph boundaries. The frontend splits the
  affected body chapter(s) there and marks the peeled-off pieces non-body, so
  the chapter list updates. Persisted via the existing ``POST /review`` flow.

Detection in the ingest pipeline stays deterministic; this never runs there.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from storysphere.core.token_callback import set_llm_service_context
from storysphere.core.utils.output_extractor import extract_json_from_text
from storysphere.domain.documents import Chapter, ChapterRole, ParagraphRole

logger = logging.getLogger(__name__)

# ── Tunable knobs ─────────────────────────────────────────────────────────────
DEFAULT_SNIPPET_CHARS = 500  # chars of each paragraph sent to the LLM
DEFAULT_MAX_SCAN = 30        # max paragraphs classified per edge before stopping

# Valid classifications = ChapterRole values. A matter block (front or back) may
# mix kinds (copyright + bio + afterword); it collapses to ONE chapter role by
# this priority — the most specific/informative kind present wins, else "other".
_ROLES = {r.value for r in ChapterRole}
_ROLE_PRIORITY = (
    ChapterRole.preface.value,
    ChapterRole.afterword.value,
    ChapterRole.toc.value,
    ChapterRole.other.value,
)

_SYSTEM_PROMPT = """You classify ONE paragraph, located near the {edge} of a book, into exactly one role.

Roles:
- body: actual STORY NARRATIVE (scenes, dialogue, description), including a prologue or epilogue.
- toc: table of contents — a list of section titles, often with page numbers.
- preface: front matter before the story — preface/foreword/introduction/自序/推薦序, an author's or editor's note.
- afterword: back matter after the story — afterword/acknowledgements/後記/跋/致謝.
- other: copyright/publisher page, ISBN/price, author or translator biography, review blurbs, publisher catalog, or any non-story matter not above.

Respond with ONLY a JSON object, no prose:
{{"role": "<body|toc|preface|afterword|other>"}}
"""


def _aggregate_role(roles: list[str]) -> str:
    """Collapse a matter block's per-paragraph roles into one chapter role."""
    for candidate in _ROLE_PRIORITY:
        if candidate in roles:
            return candidate
    return ChapterRole.other.value


@dataclass
class BoundaryResult:
    """Book-global paragraph boundaries of edge front/back matter.

    ``front_matter_end`` is exclusive: body-chapter paragraphs with a global
    index < it are front matter. ``back_matter_start`` is inclusive: body-chapter
    paragraphs with a global index >= it are back matter. ``None`` on either side
    means no matter was found there.
    """

    front_matter_end: int | None = None
    back_matter_start: int | None = None
    front_role: str | None = None
    back_role: str | None = None


async def _classify_role(llm, text: str, edge: str) -> str | None:
    """Classify one paragraph into a ChapterRole value (body/toc/preface/…).

    Returns ``None`` when the LLM response can't be parsed into a valid role —
    callers treat that as a conservative stop (never over-mark real story).
    """
    from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

    where = "beginning" if edge == "front" else "end"
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT.format(edge=where)),
        HumanMessage(content=f"Paragraph:\n\n{text}"),
    ]
    response = await llm.ainvoke(messages)
    raw = response.content if hasattr(response, "content") else str(response)

    parsed, err = extract_json_from_text(raw)
    if err or not isinstance(parsed, dict):
        logger.warning("boundary suggester: parse failed (%s)", err)
        return None
    role = str(parsed.get("role", "")).strip().lower()
    return role if role in _ROLES else None


async def suggest_boundary_roles(
    chapters: list[Chapter],
    *,
    snippet_chars: int = DEFAULT_SNIPPET_CHARS,
    max_scan: int = DEFAULT_MAX_SCAN,
    llm=None,
) -> BoundaryResult:
    """Find the front/back matter boundaries at the edges of a book's body text.

    Walks the body-chapter body paragraphs inward from each end, one LLM call per
    paragraph, stopping each walk at the first story-body paragraph. Returns the
    boundaries (book-global paragraph indices) for the reviewer to accept.

    Raises ``RuntimeError`` (from the LLM client) if no LLM is configured.
    """
    # Flatten to book-global order; only body paragraphs of body chapters are
    # candidates. ``gidx`` counts EVERY paragraph so indices match review-data.
    flat: list[tuple[int, str]] = []
    gidx = 0
    for chapter in chapters:
        body_chapter = chapter.role == ChapterRole.body
        for para in chapter.paragraphs:
            if body_chapter and para.role == ParagraphRole.body:
                flat.append((gidx, para.text))
            gidx += 1
    if not flat:
        return BoundaryResult()

    if llm is None:
        from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

        llm = get_llm_client().get_with_local_fallback(temperature=0.0)
    set_llm_service_context("ingestion")

    n = len(flat)
    _BODY = ChapterRole.body.value

    # Front walk: positions 0,1,… until the first story paragraph.
    front_end: int | None = None
    front_roles: list[str] = []
    front_stop = 0  # position where the front walk halted (exclusive lower bound)
    for k in range(min(max_scan, n)):
        front_stop = k
        snippet = flat[k][1].strip()[:snippet_chars]
        if not snippet:
            continue
        role = await _classify_role(llm, snippet, "front")
        if role is None or role == _BODY:
            if front_roles:
                front_end = flat[k][0]  # first story paragraph's global index
            break
        front_roles.append(role)

    # Back walk: positions n-1,… until the first story paragraph, never crossing
    # into the region the front walk already consumed.
    back_start: int | None = None
    back_roles: list[str] = []
    scanned = 0
    for k in range(n - 1, front_stop, -1):
        if scanned >= max_scan:
            break
        snippet = flat[k][1].strip()[:snippet_chars]
        if not snippet:
            continue
        role = await _classify_role(llm, snippet, "back")
        scanned += 1
        if role is None or role == _BODY:
            break
        back_start = flat[k][0]  # keeps lowering → smallest matter index
        back_roles.append(role)

    return BoundaryResult(
        front_matter_end=front_end,
        back_matter_start=back_start,
        front_role=_aggregate_role(front_roles) if front_end is not None else None,
        back_role=_aggregate_role(back_roles) if back_start is not None else None,
    )
