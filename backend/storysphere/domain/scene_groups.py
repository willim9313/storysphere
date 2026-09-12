"""Grouping a chapter's events into scenes using typographic separators (B-068).

**This is the scene criterion; ``narrative_runs`` is not.** A narrative run is
"consecutive events whose ``narrative_mode`` does not change", which only finds
the seam between present-tense narration and an embedded flashback — on the
hand-annotated chapters of 《名字的潮汐》 it recovers 5 of 13 real boundaries
(recall 0.38) and folds five of ten chapters into a single run.

What actually marks a scene break in prose is the printed divider between
paragraph blocks — ``✦ ✦ ✦``, ``❦``, ``～``. Ingestion already finds those and
stores them as ``ParagraphRole.separator``, so no new field, no re-extraction
and no LLM call is involved here. Against the same annotation this reaches
precision 0.73 / recall 0.85 (F1 0.79).

**The union of the two signals was tried and rejected.** It reaches recall 0.92
but precision falls to 0.67, because a flashback quoted *inside* a conversation
(a character telling an old story) reads as a mode change while plainly staying
in one scene. B-068 settled that merging two scenes is worse than failing to
split one, so the criterion with fewer false boundaries wins. ``narrative_mode``
is kept as an auxiliary signal for callers that want it, never as a boundary.

**A book without separators gets no grouping at all.** Not one scene per
chapter — *nothing*. On a plain linear narrative both signals go silent (Age of
Fire: 46 events, every one ``present``, zero separators), and "one group per
chapter" is indistinguishable from "this chapter really is one scene" while
meaning the opposite. Chapters with no separator are therefore absent from the
returned mapping, and callers must render that absence as "not known" rather
than as a count. This is the same mistake the density chart made in B-068's
first layer, in a new place.

Like ``group_narrative_runs`` this is computed, never stored: no field to add,
no migration when the criterion improves.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence

from storysphere.core.utils.text_matching import squash_spacing
from storysphere.domain.documents import Paragraph, ParagraphRole, is_separator_segment
from storysphere.domain.events import Event

__all__ = ["group_scenes"]


def group_scenes(
    events: Iterable[Event],
    paragraphs: Sequence[Paragraph],
) -> dict[str, int]:
    """Map each event id to a 1-based scene ordinal within its chapter.

    Args:
        events: Events from one book.
        paragraphs: That book's paragraphs, any order. Only ``separator`` and
            ``body`` roles participate.

    Returns:
        ``{event_id: scene_ordinal}``, the ordinal restarting at 1 in each
        chapter. **Events from chapters with no usable separator are omitted**
        — absence means "no scene signal here", not "one scene".
    """
    paras_by_chapter: dict[int, list[Paragraph]] = {}
    for para in paragraphs:
        paras_by_chapter.setdefault(para.chapter_number, []).append(para)

    events_by_chapter: dict[int, list[Event]] = {}
    for event in events:
        events_by_chapter.setdefault(event.chapter, []).append(event)

    scenes: dict[str, int] = {}
    for chapter, chapter_events in events_by_chapter.items():
        blocks = _separator_blocks(paras_by_chapter.get(chapter, []))
        if len(blocks) < 2:
            continue  # no separator in this chapter — say nothing
        assignment = _align(chapter_events, blocks)
        if assignment is None:
            continue
        scenes.update(assignment)
    return scenes


def _separator_blocks(paragraphs: Sequence[Paragraph]) -> list[str]:
    """Body text between separators, in reading order.

    The separator predicate is re-applied rather than trusted from the stored
    role: a book ingested before B-115 has closing-quote fragments like "。」"
    saved as separators, and every one of them would become a phantom scene
    boundary here. Re-checking costs nothing and spares a re-ingest.
    """
    blocks: list[list[str]] = [[]]
    for para in sorted(paragraphs, key=lambda p: p.position):
        if para.role is ParagraphRole.separator and is_separator_segment(para.text):
            blocks.append([])
        elif para.role is not ParagraphRole.separator:
            blocks[-1].append(para.text)
    return [" ".join(b) for b in blocks if any(t.strip() for t in b)]


def _align(events: list[Event], blocks: list[str]) -> dict[str, int] | None:
    """Assign events to blocks, keeping both in reading order.

    Events carry no paragraph anchor, so the block has to be inferred from the
    text. That is far easier than free matching because both sequences are
    ordered: an event cannot land in an earlier block than its predecessor.
    Similarity is character-bigram overlap — event descriptions are LLM prose
    but reuse the source's proper nouns ("懷錶", "鹹水井", "莉莉安娜"), which is
    enough at this granularity, and unlike an embedding it stays inspectable
    when an assignment looks wrong.
    """
    positions = [e.narrative_position for e in events]
    if None in positions or len(set(positions)) != len(positions):
        return None  # no within-chapter order — "consecutive" is meaningless

    ordered = sorted(events, key=lambda e: e.narrative_position)
    texts = [squash_spacing(f"{e.title}{e.description}") for e in ordered]
    grids = [_bigrams(t) for t in texts]
    block_grams = [_bigrams(squash_spacing(b)) for b in blocks]

    n, m = len(ordered), len(blocks)
    scores = [
        [_similarity(grids[i], texts[i], block_grams[j]) for j in range(m)] for i in range(n)
    ]

    # Best monotone assignment: best[i][j] is the best total score for the first
    # i+1 events with event i in block j.
    best = [[float("-inf")] * m for _ in range(n)]
    back = [[-1] * m for _ in range(n)]
    for j in range(m):
        best[0][j] = scores[0][j]
    for i in range(1, n):
        for j in range(m):
            prev = max(range(j + 1), key=lambda k: best[i - 1][k])
            best[i][j] = best[i - 1][prev] + scores[i][j]
            back[i][j] = prev

    last = max(range(m), key=lambda j: best[n - 1][j])
    path = [last]
    for i in range(n - 1, 0, -1):
        last = back[i][last]
        path.append(last)
    path.reverse()

    # Renumber to consecutive ordinals: blocks nothing was assigned to are not
    # scenes as far as the events are concerned, and a gap in the numbering
    # would imply a scene the caller cannot show.
    seen: dict[int, int] = {}
    result: dict[str, int] = {}
    for event, block in zip(ordered, path, strict=True):
        if block not in seen:
            seen[block] = len(seen) + 1
        result[event.id] = seen[block]
    return result


def _bigrams(text: str) -> Counter[str]:
    return Counter(text[i : i + 2] for i in range(len(text) - 1))


def _similarity(event_grams: Counter[str], event_text: str, block_grams: Counter[str]) -> float:
    """Share of the event's bigrams that occur in the block.

    Normalised by the event, not by the block: blocks differ in length by an
    order of magnitude, and dividing by the longer side would make every event
    prefer the shortest block.
    """
    if not event_text or not event_grams or not block_grams:
        return 0.0
    return sum((event_grams & block_grams).values()) / len(event_text)
