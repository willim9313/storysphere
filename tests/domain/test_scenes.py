"""Tests for domain.scenes.group_scenes (B-068).

The two real chapters at the bottom are the hand-labelled cases the criterion
was chosen on (docs/plans/20260911-scene-grouping-criteria.md). They are here
rather than in the plan alone because the plan is a frozen snapshot and cannot
fail when the criterion drifts.
"""

from __future__ import annotations

from storysphere.domain.events import Event, EventType, NarrativeMode
from storysphere.domain.scenes import group_scenes


def _event(eid: str, chapter: int, position: int | None, mode: NarrativeMode) -> Event:
    return Event(
        id=eid,
        document_id="book-1",
        title=eid,
        event_type=EventType.PLOT,
        description="something happens",
        chapter=chapter,
        narrative_position=position,
        narrative_mode=mode,
    )


P = NarrativeMode.PRESENT
F = NarrativeMode.FLASHBACK


class TestGrouping:
    def test_consecutive_events_in_one_mode_are_one_scene(self):
        evs = [_event(f"e{i}", 1, i, P) for i in (1, 2, 3)]

        assert group_scenes(evs) == {"e1": 1, "e2": 1, "e3": 1}

    def test_a_mode_change_starts_a_new_scene(self):
        evs = [
            _event("e1", 1, 1, P),
            _event("e2", 1, 2, F),
            _event("e3", 1, 3, F),
            _event("e4", 1, 4, P),
        ]

        assert group_scenes(evs) == {"e1": 1, "e2": 2, "e3": 2, "e4": 3}

    def test_input_order_does_not_matter(self):
        evs = [_event("e3", 1, 3, P), _event("e1", 1, 1, P), _event("e2", 1, 2, F)]

        assert group_scenes(evs) == {"e1": 1, "e2": 2, "e3": 3}

    def test_ordinals_restart_each_chapter(self):
        evs = [
            _event("a1", 1, 1, P),
            _event("a2", 1, 2, F),
            _event("b1", 2, 1, P),
            _event("b2", 2, 2, P),
        ]

        assert group_scenes(evs) == {"a1": 1, "a2": 2, "b1": 1, "b2": 1}

    def test_every_event_is_assigned_exactly_once(self):
        evs = [_event(f"e{i}", 1 + i % 2, i, P) for i in range(1, 7)]

        scenes = group_scenes(evs)

        assert set(scenes) == {e.id for e in evs}

    def test_no_events_is_not_an_error(self):
        assert group_scenes([]) == {}


class TestWithoutOrdering:
    """Books ingested before B-106 carry no narrative_position at all."""

    def test_a_chapter_with_no_positions_gives_one_scene_per_event(self):
        evs = [_event(f"e{i}", 1, None, P) for i in (1, 2, 3)]

        assert group_scenes(evs) == {"e1": 1, "e2": 2, "e3": 3}

    def test_one_missing_position_ungroups_the_whole_chapter(self):
        """None sorts as if it came first, which would merge that beat into the
        opening scene — a false merge, the failure mode this must not have."""
        evs = [_event("e1", 1, 1, P), _event("e2", 1, None, P), _event("e3", 1, 3, P)]

        assert group_scenes(evs) == {"e1": 1, "e2": 2, "e3": 3}

    def test_duplicate_positions_ungroup_the_chapter(self):
        evs = [_event("e1", 1, 1, P), _event("e2", 1, 1, P), _event("e3", 1, 2, P)]

        assert group_scenes(evs) == {"e1": 1, "e2": 2, "e3": 3}

    def test_an_unordered_chapter_does_not_affect_an_ordered_one(self):
        evs = [
            _event("a1", 1, None, P),
            _event("a2", 1, None, P),
            _event("b1", 2, 1, P),
            _event("b2", 2, 2, P),
        ]

        assert group_scenes(evs) == {"a1": 1, "a2": 2, "b1": 1, "b2": 1}


class TestLabelledChapters:
    """The two chapters of 《名字的潮汐》 the criterion was chosen on."""

    def test_ch7_both_boundaries_and_nothing_else(self):
        """{1,2} on the mudflat, {3..7} the memory, {8..13} back at the shore."""
        modes = {3: F, 4: F, 5: F, 6: F, 7: F}
        evs = [_event(f"e{i}", 7, i, modes.get(i, P)) for i in range(1, 14)]

        scenes = group_scenes(evs)

        assert [scenes[f"e{i}"] for i in range(1, 14)] == [
            1, 1,              # 泥灘發現與讀取
            2, 2, 2, 2, 2,     # 回憶內容
            3, 3, 3, 3, 3, 3,  # 回到現場直到懷錶碎裂
        ]

    def test_ch3_boundary_inside_one_mode_is_missed(self):
        """Known limitation, pinned so it is a decision and not a surprise.

        Truth is {1} (the carriage arriving) and {2,3,4,5} (the well). Both
        sides are `present`, and the text cue — a paragraph break — is nowhere
        on the Event. Catching it needs the paragraph anchor of B-068 layer 2.
        """
        evs = [_event(f"e{i}", 3, i, P) for i in range(1, 6)]

        scenes = group_scenes(evs)

        assert set(scenes.values()) == {1}, "criterion claims one scene"
