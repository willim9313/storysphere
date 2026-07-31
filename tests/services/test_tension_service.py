"""Unit tests for TensionService coverage, mythos normalization and staleness."""

from __future__ import annotations

import pytest
from storysphere.domain.tension import TEU, TensionLine, TensionPole, TensionTheme
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


def _make_line(teu_ids: list[str], status: str = "pending", **kw) -> TensionLine:
    return TensionLine(document_id=DOC, teu_ids=teu_ids, review_status=status, **kw)


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


class TestNormalizedMythos:
    def _norm(self, framework: str, value):
        return TensionService._normalized_mythos(framework, value)

    def test_canonical_id_passes_through(self):
        assert self._norm("frye", "tragedy") == "tragedy"

    def test_display_name_is_coerced_to_id(self):
        assert self._norm("frye", "悲劇") == "tragedy"

    def test_unrecognised_value_becomes_none(self):
        assert self._norm("frye", "autumn_tragedy") is None

    def test_none_stays_none(self):
        assert self._norm("booker", None) is None


class TestThemeInputLines:
    def test_uses_reviewed_lines_when_any_are_reviewed(self):
        lines = [
            _make_line(["t1"], status="approved"),
            _make_line(["t2"], status="pending"),
            _make_line(["t3"], status="rejected"),
            _make_line(["t4"], status="modified"),
        ]
        picked = TensionService.theme_input_lines(lines)
        assert {line.review_status for line in picked} == {"approved", "modified"}

    def test_falls_back_to_all_lines_when_none_reviewed(self):
        """Pressing Step 3 before reviewing still has to produce something."""
        lines = [_make_line(["t1"]), _make_line(["t2"])]
        assert TensionService.theme_input_lines(lines) == lines

    def test_rejected_only_still_falls_back_to_all(self):
        lines = [_make_line(["t1"], status="rejected")]
        assert TensionService.theme_input_lines(lines) == lines


class TestThemeStaleness:
    """Integration-style: real SQLite cache in tmp_path, no LLM involved."""

    @pytest.fixture
    def service(self, tmp_path):
        from storysphere.services.analysis_cache import AnalysisCache

        return TensionService(cache=AnalysisCache(db_path=str(tmp_path / "cache.db")))

    def _theme(self, line_ids: list[str]) -> TensionTheme:
        return TensionTheme(document_id=DOC, tension_line_ids=line_ids)

    @pytest.mark.asyncio
    async def test_fresh_when_theme_matches_the_current_input_set(self, service):
        lines = [_make_line(["t1"], status="approved"), _make_line(["t2"], status="approved")]
        await service.save_lines(lines, DOC)
        theme = self._theme([line.id for line in lines])
        assert await service.theme_staleness(DOC, theme) == (False, None)

    @pytest.mark.asyncio
    async def test_stale_when_lines_were_regrouped(self, service):
        """Re-running Step 2 mints new line ids, orphaning every reference."""
        await service.save_lines([_make_line(["t1"])], DOC)
        theme = self._theme(["line-from-a-previous-run"])
        assert await service.theme_staleness(DOC, theme) == (True, "lines_regrouped")

    @pytest.mark.asyncio
    async def test_stale_when_a_review_narrowed_the_input_set(self, service):
        """Theme built from all lines; approving a subset changes what synthesis
        would now use."""
        a = _make_line(["t1"], status="approved")
        b = _make_line(["t2"], status="pending")
        await service.save_lines([a, b], DOC)
        theme = self._theme([a.id, b.id])
        assert await service.theme_staleness(DOC, theme) == (True, "review_changed")

    @pytest.mark.asyncio
    async def test_stale_when_no_lines_exist(self, service):
        theme = self._theme(["line-1"])
        assert await service.theme_staleness(DOC, theme) == (True, "no_lines")

    @pytest.mark.asyncio
    async def test_matches_synthesis_fallback_when_nothing_reviewed(self, service):
        """With no reviewed lines synthesis uses all of them, so a theme built
        from all of them is fresh."""
        lines = [_make_line(["t1"]), _make_line(["t2"])]
        await service.save_lines(lines, DOC)
        theme = self._theme([line.id for line in lines])
        assert await service.theme_staleness(DOC, theme) == (False, None)
