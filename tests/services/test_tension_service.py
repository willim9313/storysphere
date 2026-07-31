"""Unit tests for TensionService grouping-coverage reporting."""

from __future__ import annotations

from storysphere.domain.tension import TEU, TensionLine, TensionPole
from storysphere.services.tension_service import TensionService

DOC = "book-1"


def _make_teu(teu_id: str, chapter: int) -> TEU:
    return TEU(
        id=teu_id,
        event_id=f"event-{teu_id}",
        document_id=DOC,
        chapter=chapter,
        pole_a=TensionPole(concept_name="A"),
        pole_b=TensionPole(concept_name="B"),
        tension_description="…",
    )


def _make_line(teu_ids: list[str]) -> TensionLine:
    return TensionLine(document_id=DOC, teu_ids=teu_ids)


class TestGroupingCoverage:
    def _coverage(self, teus: list[TEU], lines: list[TensionLine]) -> dict:
        return TensionService._grouping_coverage(teus, lines)

    def test_no_teus_reports_zeroes(self):
        result = self._coverage([], [])
        assert result["total_teus"] == 0
        assert result["uncovered_teus"] == 0
        assert result["uncovered_teu_ids"] == []
        assert result["uncovered_chapters"] == []

    def test_all_teus_grouped_reports_no_shortfall(self):
        teus = [_make_teu("t1", 1), _make_teu("t2", 2)]
        lines = [_make_line(["t1", "t2"])]
        result = self._coverage(teus, lines)
        assert result["total_teus"] == 2
        assert result["covered_teus"] == 2
        assert result["uncovered_teus"] == 0
        assert result["uncovered_teu_ids"] == []

    def test_partially_grouped_lists_the_omitted_teus(self):
        teus = [_make_teu("t1", 1), _make_teu("t2", 2), _make_teu("t3", 3)]
        lines = [_make_line(["t1"])]
        result = self._coverage(teus, lines)
        assert result["total_teus"] == 3
        assert result["covered_teus"] == 1
        assert result["uncovered_teus"] == 2
        assert result["uncovered_teu_ids"] == ["t2", "t3"]

    def test_reports_chapters_that_vanish_entirely(self):
        """The real-world failure: every TEU in a chapter is dropped, so the
        chapter disappears from the analysis with no trace."""
        teus = [
            _make_teu("t1", 1),
            _make_teu("t2", 7),
            _make_teu("t3", 7),
            _make_teu("t4", 10),
        ]
        lines = [_make_line(["t1"])]
        result = self._coverage(teus, lines)
        assert result["uncovered_chapters"] == [7, 10]

    def test_no_lines_means_nothing_is_covered(self):
        teus = [_make_teu("t1", 1), _make_teu("t2", 2)]
        result = self._coverage(teus, [])
        assert result["covered_teus"] == 0
        assert result["uncovered_teus"] == 2

    def test_teu_claimed_by_two_lines_is_counted_once(self):
        teus = [_make_teu("t1", 1), _make_teu("t2", 2)]
        lines = [_make_line(["t1"]), _make_line(["t1", "t2"])]
        result = self._coverage(teus, lines)
        assert result["covered_teus"] == 2
        assert result["uncovered_teus"] == 0

    def test_ignores_line_references_to_unknown_teus(self):
        """A line may reference a TEU id that is not in the input set; that must
        not make coverage exceed the total."""
        teus = [_make_teu("t1", 1)]
        lines = [_make_line(["t1", "ghost"])]
        result = self._coverage(teus, lines)
        assert result["total_teus"] == 1
        assert result["covered_teus"] == 1
        assert result["uncovered_teus"] == 0
