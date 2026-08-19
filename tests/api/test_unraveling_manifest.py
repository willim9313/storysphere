"""Direct tests for the extracted Unraveling manifest builders.

``tests/api/test_unraveling.py`` covers these through the endpoints and stays
the primary net. This file adds the cases that are awkward to set up from
outside — chiefly the chapter-number lookup, whose whole point is books whose
body chapters are neither contiguous nor in order once front matter is
stripped.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from storysphere.api.unraveling_manifest import (
    compute_chapter_distributions,
    status_of,
)
from storysphere.domain.documents import Chapter, ChapterRole, Paragraph
from storysphere.domain.events import Event, EventType

DOC = "book-1"


def _paragraph(chapter_number: int, position: int) -> Paragraph:
    return Paragraph(text="…", chapter_number=chapter_number, position=position)


def _chapter(
    number: int,
    *,
    role: ChapterRole = ChapterRole.body,
    paragraphs: int = 0,
    summary: str | None = None,
    keywords: dict[str, float] | None = None,
) -> Chapter:
    return Chapter(
        number=number,
        role=role,
        paragraphs=[_paragraph(number, i) for i in range(paragraphs)],
        summary=summary,
        keywords=keywords,
    )


def _doc(*chapters: Chapter) -> SimpleNamespace:
    return SimpleNamespace(chapters=list(chapters))


def _event(chapter: int) -> Event:
    return Event(
        document_id=DOC,
        title=f"ch{chapter}",
        event_type=EventType.OTHER,
        description="…",
        chapter=chapter,
    )


def _imagery(distribution: dict[int, int]) -> SimpleNamespace:
    return SimpleNamespace(chapter_distribution=distribution)


# ── status_of ────────────────────────────────────────────────────────────────


class TestStatusOf:
    def test_complete_wins_over_partial(self):
        assert status_of(complete=True, partial=True) == "complete"

    def test_partial_when_not_complete(self):
        assert status_of(complete=False, partial=True) == "partial"

    def test_empty_when_neither(self):
        assert status_of(complete=False, partial=False) == "empty"


# ── compute_chapter_distributions ────────────────────────────────────────────


class TestBodyChaptersOnly:
    @pytest.mark.parametrize(
        "role", [r for r in ChapterRole if r is not ChapterRole.body]
    )
    def test_non_body_chapters_get_no_slot(self, role):
        """Front/back matter has no story chapter number, so no axis position."""
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1, role=role, paragraphs=4), _chapter(2, paragraphs=3)),
            events=[],
            imagery=[],
        )

        assert result["paragraphs"] == [3], "non-body chapter took a slot"

    def test_a_book_with_no_body_chapters_returns_nothing(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1, role=ChapterRole.preface, paragraphs=2)),
            events=[_event(1)],
            imagery=[_imagery({1: 5})],
        )

        assert result == {}

    def test_an_empty_document_returns_nothing(self):
        assert compute_chapter_distributions(doc=_doc(), events=[], imagery=[]) == {}


class TestChapterNumberLookup:
    """The axis is built from body chapters; everything else is looked up by
    chapter *number*, never by assuming the number equals the position."""

    def test_output_is_ordered_by_chapter_number(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(3, paragraphs=3), _chapter(1, paragraphs=1)),
            events=[],
            imagery=[],
        )

        assert result["paragraphs"] == [1, 3]

    def test_events_land_on_their_chapter_not_their_index(self):
        """Body chapters 5 and 9: an event in ch.9 belongs in slot 1, not 9."""
        result = compute_chapter_distributions(
            doc=_doc(_chapter(5), _chapter(9)),
            events=[_event(9), _event(9), _event(5)],
            imagery=[],
        )

        assert result["kg_event"] == [1, 2]

    def test_events_in_a_non_body_chapter_are_dropped(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1, role=ChapterRole.preface), _chapter(2)),
            events=[_event(1), _event(2)],
            imagery=[],
        )

        assert result["kg_event"] == [1]

    def test_symbol_counts_are_summed_per_chapter(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1), _chapter(2)),
            events=[],
            imagery=[_imagery({1: 2, 2: 1}), _imagery({1: 3})],
        )

        assert result["symbols"] == [5, 1]

    def test_symbol_counts_outside_the_body_are_dropped(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(2)),
            events=[],
            imagery=[_imagery({1: 9, 2: 4})],
        )

        assert result["symbols"] == [4]

    def test_imagery_without_a_distribution_is_tolerated(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1)), events=[], imagery=[_imagery(None)]
        )

        assert result["symbols"] == [0]


class TestPerChapterPresence:
    def test_summaries_and_keywords_are_presence_flags(self):
        result = compute_chapter_distributions(
            doc=_doc(
                _chapter(1, summary="s", keywords={"a": 1.0}),
                _chapter(2, summary=None, keywords=None),
            ),
            events=[],
            imagery=[],
        )

        assert result["summaries"] == [1, 0]
        assert result["keywords"] == [1, 0]

    def test_empty_keywords_count_as_absent(self):
        """``{}`` means the step ran and found nothing — still nothing to show."""
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1, keywords={})), events=[], imagery=[]
        )

        assert result["keywords"] == [0]

    def test_every_series_has_one_slot_per_body_chapter(self):
        result = compute_chapter_distributions(
            doc=_doc(_chapter(1), _chapter(2), _chapter(3)),
            events=[_event(2)],
            imagery=[_imagery({3: 1})],
        )

        assert {k: len(v) for k, v in result.items()} == {
            "paragraphs": 3,
            "summaries": 3,
            "keywords": 3,
            "kg_event": 3,
            "symbols": 3,
        }
