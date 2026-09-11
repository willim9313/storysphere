"""Grouping consecutive events back into scenes (B-068).

Event extraction produces *beats*, not scenes: 《名字的潮汐》 ch3 renders one
conversation at the well as three events (meeting → request → refusal), and a
reader of the tension page counts three pieces of evidence where there is one
scene. Deleting the extras would be wrong — every beat is real — so the beats
stay and this decides which of them belong together.

The grouping is **computed, never stored**. Everything it needs is already on
the Event (chapter, narrative_position, narrative_mode), so there is no field to
add and no re-extraction to run; when the criterion improves, every consumer
gets the better answer without a data migration.

The criterion was chosen by trying the candidates on hand-labelled chapters
rather than by argument — see
``docs/plans/20260911-scene-grouping-criteria.md``. Participant overlap, the
obvious candidate, is decisively out: same-scene beats reach a Jaccard of 0.00
(two beats of one memory with no shared participant) while a scene boundary
reaches 0.33 (the characters who were present stay present). Overlap measures
who is on stage; a scene boundary is about whether time and place are
continuous. They are not the same question.
"""

from __future__ import annotations

from collections.abc import Iterable

from storysphere.domain.events import Event

__all__ = ["group_scenes"]


def group_scenes(events: Iterable[Event]) -> dict[str, int]:
    """Map each event id to a 1-based scene ordinal within its chapter.

    Consecutive events belong to the same scene while ``narrative_mode`` does
    not change: a switch between present and flashback is a break in the
    narrative layer, and on the labelled data it caught both boundaries of
    《名字的潮汐》 ch7 with no false positive across twelve adjacent pairs.

    It is deliberately incomplete. A scene change *within* one narrative layer
    — ch3's carriage arrival followed by the meeting at the well, both
    ``present`` — is invisible here, and the text cue for it (a paragraph break)
    is not on the Event at all. Missing a break leaves the status quo; merging
    two real scenes would make the evidence look both thinner and misplaced, so
    this errs towards leaving beats apart.

    A chapter is only grouped when every event in it carries a distinct
    ``narrative_position``. Without an order there is no "consecutive" to speak
    of, and a missing position sorts as if it were first — which would merge
    whichever beat happens to be unnumbered into the opening scene. Books
    ingested before B-106 have no positions at all, so they degrade to one
    scene per event, i.e. to the behaviour that was there before.

    Args:
        events: Events from one book. Order does not matter; they are grouped
            per chapter internally.

    Returns:
        ``{event_id: scene_ordinal}``, where the ordinal restarts at 1 in each
        chapter. Every event appears exactly once.
    """
    by_chapter: dict[int, list[Event]] = {}
    for event in events:
        by_chapter.setdefault(event.chapter, []).append(event)

    scenes: dict[str, int] = {}
    for chapter_events in by_chapter.values():
        scenes.update(_group_one_chapter(chapter_events))
    return scenes


def _group_one_chapter(events: list[Event]) -> dict[str, int]:
    positions = [e.narrative_position for e in events]
    ordered = None not in positions and len(set(positions)) == len(positions)
    if not ordered:
        return {e.id: i for i, e in enumerate(events, start=1)}

    ordinal = 0
    previous: Event | None = None
    scenes: dict[str, int] = {}
    for event in sorted(events, key=lambda e: e.narrative_position):
        if previous is None or event.narrative_mode is not previous.narrative_mode:
            ordinal += 1
        scenes[event.id] = ordinal
        previous = event
    return scenes
