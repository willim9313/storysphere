"""Tests for typographic-separator scene grouping (B-068).

The behaviour that matters most here is the *absence* of an answer: a chapter
with no separator must be left out of the mapping entirely rather than reported
as one scene. Those two look identical in the data and mean the opposite.
"""

from __future__ import annotations

import pytest
from storysphere.domain.documents import Paragraph, ParagraphRole
from storysphere.domain.events import Event
from storysphere.domain.scene_groups import group_scenes

DOC = "book-1"


def _event(event_id: str, chapter: int, position: int, title: str, description: str = "") -> Event:
    return Event(
        id=event_id,
        document_id=DOC,
        title=title,
        event_type="meeting",
        description=description or title,
        chapter=chapter,
        narrative_position=position,
    )


def _body(chapter: int, position: int, text: str) -> Paragraph:
    return Paragraph(
        text=text, chapter_number=chapter, position=position, role=ParagraphRole.body
    )


def _sep(chapter: int, position: int, text: str = "✦ ✦ ✦") -> Paragraph:
    return Paragraph(
        text=text, chapter_number=chapter, position=position, role=ParagraphRole.separator
    )


class TestNoSignal:
    """A chapter with no separator yields nothing — not one scene."""

    def test_chapter_without_separator_is_omitted(self):
        events = [_event("e1", 1, 1, "抵達"), _event("e2", 1, 2, "離開")]
        paras = [_body(1, 0, "抵達之後他們談了很久。離開時天已經黑了。")]

        assert group_scenes(events, paras) == {}

    def test_omission_is_total_not_partial(self):
        """No event of an ungrouped chapter leaks into the result."""
        events = [_event(f"e{i}", 1, i, f"事件{i}") for i in range(1, 6)]
        paras = [_body(1, 0, "".join(f"事件{i}" for i in range(1, 6)))]

        assert group_scenes(events, paras) == {}

    def test_one_chapter_grouped_does_not_group_another(self):
        events = [
            _event("a1", 1, 1, "鹹水井邊相遇"),
            _event("a2", 1, 2, "泥灘上的懷錶"),
            _event("b1", 2, 1, "母親補襯衫"),
        ]
        paras = [
            _body(1, 0, "鹹水井邊相遇"),
            _sep(1, 1),
            _body(1, 2, "泥灘上的懷錶"),
            _body(2, 0, "母親補襯衫，針腳細密。"),
        ]
        result = group_scenes(events, paras)

        assert set(result) == {"a1", "a2"}
        assert "b1" not in result


class TestGrouping:
    def test_separator_splits_events_into_two_scenes(self):
        events = [_event("e1", 1, 1, "鹹水井邊相遇"), _event("e2", 1, 2, "泥灘上的懷錶")]
        paras = [_body(1, 0, "鹹水井邊相遇"), _sep(1, 1), _body(1, 2, "泥灘上的懷錶")]

        assert group_scenes(events, paras) == {"e1": 1, "e2": 2}

    def test_consecutive_events_share_a_scene(self):
        events = [
            _event("e1", 1, 1, "鹹水井邊相遇"),
            _event("e2", 1, 2, "鹹水井邊的請求"),
            _event("e3", 1, 3, "泥灘上的懷錶"),
        ]
        paras = [
            _body(1, 0, "鹹水井邊相遇，接著是鹹水井邊的請求。"),
            _sep(1, 1),
            _body(1, 2, "泥灘上的懷錶"),
        ]
        result = group_scenes(events, paras)

        assert result["e1"] == result["e2"] == 1
        assert result["e3"] == 2

    def test_ordinals_restart_each_chapter(self):
        events = [
            _event("a1", 1, 1, "鹹水井"),
            _event("a2", 1, 2, "泥灘"),
            _event("b1", 2, 1, "礁石"),
            _event("b2", 2, 2, "爐火"),
        ]
        paras = [
            _body(1, 0, "鹹水井"), _sep(1, 1), _body(1, 2, "泥灘"),
            _body(2, 0, "礁石"), _sep(2, 1), _body(2, 2, "爐火"),
        ]
        result = group_scenes(events, paras)

        assert (result["a1"], result["a2"]) == (1, 2)
        assert (result["b1"], result["b2"]) == (1, 2)

    def test_ordinals_have_no_gaps_when_a_block_gets_no_event(self):
        """A block no event matched is not a scene the caller could show."""
        events = [_event("e1", 1, 1, "鹹水井邊相遇"), _event("e2", 1, 2, "泥灘上的懷錶")]
        paras = [
            _body(1, 0, "鹹水井邊相遇"),
            _sep(1, 1),
            _body(1, 2, "完全無關的一段文字"),
            _sep(1, 3),
            _body(1, 4, "泥灘上的懷錶"),
        ]
        result = group_scenes(events, paras)

        assert sorted(result.values()) == [1, 2]

    def test_events_stay_in_reading_order(self):
        """Assignment is monotone: a later event never lands in an earlier scene."""
        events = [
            _event("e1", 1, 1, "泥灘上的懷錶"),   # wording echoes the *second* block
            _event("e2", 1, 2, "泥灘上的懷錶"),
        ]
        paras = [_body(1, 0, "鹹水井邊"), _sep(1, 1), _body(1, 2, "泥灘上的懷錶")]
        result = group_scenes(events, paras)

        assert result["e1"] <= result["e2"]


class TestStaleSeparators:
    """B-115: books ingested before the fix carry bogus separator paragraphs."""

    @pytest.mark.parametrize("text", ["。」", "？」", "。"])
    def test_punctuation_only_separator_is_not_a_boundary(self, text):
        events = [_event("e1", 1, 1, "鹹水井邊相遇"), _event("e2", 1, 2, "泥灘上的懷錶")]
        paras = [_body(1, 0, "鹹水井邊相遇"), _sep(1, 1, text), _body(1, 2, "泥灘上的懷錶")]

        # The only "separator" is bogus, so the chapter has no signal at all.
        assert group_scenes(events, paras) == {}

    def test_real_separator_still_counts_alongside_a_stale_one(self):
        events = [_event("e1", 1, 1, "鹹水井邊相遇"), _event("e2", 1, 3, "泥灘上的懷錶")]
        paras = [
            _body(1, 0, "鹹水井邊相遇"),
            _sep(1, 1, "。」"),
            _sep(1, 2, "✦ ✦ ✦"),
            _body(1, 3, "泥灘上的懷錶"),
        ]

        assert group_scenes(events, paras) == {"e1": 1, "e2": 2}


class TestOrderRequirement:
    def test_missing_narrative_position_leaves_chapter_ungrouped(self):
        events = [_event("e1", 1, 1, "鹹水井"), _event("e2", 1, 2, "泥灘")]
        events[1].narrative_position = None
        paras = [_body(1, 0, "鹹水井"), _sep(1, 1), _body(1, 2, "泥灘")]

        assert group_scenes(events, paras) == {}

    def test_duplicate_positions_leave_chapter_ungrouped(self):
        events = [_event("e1", 1, 1, "鹹水井"), _event("e2", 1, 1, "泥灘")]
        paras = [_body(1, 0, "鹹水井"), _sep(1, 1), _body(1, 2, "泥灘")]

        assert group_scenes(events, paras) == {}


class TestPdfSpacing:
    def test_intraword_spaces_do_not_break_matching(self):
        """pypdf splits CJK words with spaces (B-083); both sides are squashed."""
        events = [_event("e1", 1, 1, "鹹水井邊相遇"), _event("e2", 1, 2, "泥灘上的懷錶")]
        paras = [
            _body(1, 0, "鹹 水 井 邊 相 遇"),
            _sep(1, 1),
            _body(1, 2, "泥 灘 上 的 懷 錶"),
        ]

        assert group_scenes(events, paras) == {"e1": 1, "e2": 2}


class TestEmptyInputs:
    def test_no_events(self):
        assert group_scenes([], [_body(1, 0, "text"), _sep(1, 1)]) == {}

    def test_no_paragraphs(self):
        assert group_scenes([_event("e1", 1, 1, "x")], []) == {}
