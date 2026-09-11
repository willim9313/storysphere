"""Grouping consecutive events into runs of one narrative layer (B-068).

**This is not scene detection, and it was mis-named as such when first written.**
The criterion is "consecutive events whose ``narrative_mode`` does not change",
which finds the boundary between present-tense narration and an embedded
flashback. A scene change *inside* one layer is invisible to it, so a chapter
with no flashback collapses into a single run however many scenes it contains —
on the seeded books that is 5 of 10 chapters for 《名字的潮汐》 and 5 of 5 for
Age of Fire, one of which folds sixteen events into one.

It is still worth having: the three runs of 《名字的潮汐》 ch7 (mudflat → the
memory → back at the shore) are real, and a run is the unit a true scene
criterion would subdivide rather than cross. But a run must not be presented as
a scene count, and must not drive anything shaped like a density chart — see
B-068 for what that looked like.

Everything it needs is already on the Event (chapter, narrative_position,
narrative_mode), so the grouping is computed, never stored: no field to add, no
re-extraction to run, and no migration when the criterion improves.
"""

from __future__ import annotations

from collections.abc import Iterable

from storysphere.domain.events import Event

__all__ = ["group_narrative_runs"]


def group_narrative_runs(events: Iterable[Event]) -> dict[str, int]:
    """Map each event id to a 1-based run ordinal within its chapter.

    Consecutive events belong to the same run while ``narrative_mode`` does not
    change. On the hand-labelled chapters this caught both boundaries of
    《名字的潮汐》 ch7 without splitting anything that belonged together.

    **It merges by default.** Only a mode change starts a new run, so ch3's
    carriage arrival and the meeting at the well — two scenes, both ``present``
    — come back as one. The text cue that separates them is a paragraph break,
    which is nowhere on the Event. Anything reading this as "how many scenes are
    in this chapter" will understate, often to 1.

    A chapter is only grouped when every event in it carries a distinct
    ``narrative_position``. Without an order there is no "consecutive" to speak
    of, and a missing position sorts as if it were first — which would fold
    whichever event happens to be unnumbered into the opening run. Books
    ingested before B-106 have no positions at all and degrade to one run per
    event, i.e. to the behaviour that was there before.

    Args:
        events: Events from one book. Order does not matter; they are grouped
            per chapter internally.

    Returns:
        ``{event_id: run_ordinal}``, where the ordinal restarts at 1 in each
        chapter. Every event appears exactly once.
    """
    by_chapter: dict[int, list[Event]] = {}
    for event in events:
        by_chapter.setdefault(event.chapter, []).append(event)

    runs: dict[str, int] = {}
    for chapter_events in by_chapter.values():
        runs.update(_group_one_chapter(chapter_events))
    return runs


def _group_one_chapter(events: list[Event]) -> dict[str, int]:
    positions = [e.narrative_position for e in events]
    ordered = None not in positions and len(set(positions)) == len(positions)
    if not ordered:
        return {e.id: i for i, e in enumerate(events, start=1)}

    ordinal = 0
    previous: Event | None = None
    runs: dict[str, int] = {}
    for event in sorted(events, key=lambda e: e.narrative_position):
        if previous is None or event.narrative_mode is not previous.narrative_mode:
            ordinal += 1
        runs[event.id] = ordinal
        previous = event
    return runs
