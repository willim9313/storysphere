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


def _carrier_teu(teu_id: str, a_names: list[str], b_names: list[str]) -> TEU:
    """A TEU whose poles differ only by which carriers sit on which side."""
    return TEU(
        id=teu_id,
        event_id=f"event-{teu_id}",
        document_id=DOC,
        chapter=1,
        pole_a=TensionPole(concept_name="A", carrier_names=a_names),
        pole_b=TensionPole(concept_name="B", carrier_names=b_names),
        tension_description="…",
    )


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


class TestOrientationFlips:
    def _flips(self, teus: list[TEU]) -> dict[str, bool]:
        return TensionService._orientation_flips(teus)

    def test_no_teus(self):
        assert self._flips([]) == {}

    def test_single_teu_has_nothing_to_disagree_with(self):
        assert self._flips([_carrier_teu("t1", ["X"], ["Y"])]) == {"t1": False}

    def test_consistent_line_flags_nothing(self):
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["X"], ["Y"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": False}

    def test_lone_dissenter_is_flagged(self):
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["X"], ["Y"]),
            _carrier_teu("t3", ["X"], ["Y"]),
            _carrier_teu("t4", ["Y"], ["X"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": False, "t3": False, "t4": True}

    def test_majority_wins_over_the_first_teu(self):
        """The first TEU is not privileged: outnumbered, it is the flipped one."""
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["Y"], ["X"]),
            _carrier_teu("t3", ["Y"], ["X"]),
            _carrier_teu("t4", ["Y"], ["X"]),
        ]
        assert self._flips(teus) == {"t1": True, "t2": False, "t3": False, "t4": False}

    def test_teus_sharing_no_carriers_are_undecidable(self):
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["P"], ["Q"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": False}

    def test_same_carriers_on_both_poles_is_undecidable(self):
        """The real P2-1 shape: one TEU names the same entities on both sides."""
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["X"], ["Y"]),
            _carrier_teu("t3", ["X", "Y"], ["X", "Y"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": False, "t3": False}

    def test_carrierless_teu_is_not_used_as_the_reference(self):
        """A TEU with no carriers would decide nothing for anyone else."""
        teus = [
            _carrier_teu("t1", [], []),
            _carrier_teu("t2", ["X"], ["Y"]),
            _carrier_teu("t3", ["Y"], ["X"]),
            _carrier_teu("t4", ["Y"], ["X"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": True, "t3": False, "t4": False}

    def test_even_split_resolves_towards_the_reference(self):
        """Deterministic tie-break rather than an arbitrary one: with 2 v 2 the
        reference TEU's own orientation is treated as the majority."""
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["X"], ["Y"]),
            _carrier_teu("t3", ["Y"], ["X"]),
            _carrier_teu("t4", ["Y"], ["X"]),
        ]
        assert self._flips(teus) == {"t1": False, "t2": False, "t3": True, "t4": True}


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


class TestLinesWithTeus:
    """Integration-style: real SQLite cache in tmp_path, no LLM involved."""

    @pytest.fixture
    def service(self, tmp_path):
        from storysphere.services.analysis_cache import AnalysisCache

        return TensionService(cache=AnalysisCache(db_path=str(tmp_path / "cache.db")))

    @pytest.mark.asyncio
    async def test_embedded_teus_carry_their_flip_flag(self, service):
        teus = [
            _carrier_teu("t1", ["X"], ["Y"]),
            _carrier_teu("t2", ["X"], ["Y"]),
            _carrier_teu("t3", ["Y"], ["X"]),
        ]
        for teu in teus:
            await service.save_teu(teu)
        await service.save_lines([_make_line(["t1", "t2", "t3"])], DOC)

        rows = await service.get_lines_with_teus(DOC)
        flags = {t["id"]: t["flipped"] for t in rows[0]["teus"]}
        assert flags == {"t1": False, "t2": False, "t3": True}

    @pytest.mark.asyncio
    async def test_flips_are_scoped_per_line(self, service):
        """Each line votes on its own TEUs; one line's dissenter must not turn
        a consistent neighbouring line inside out."""
        for teu in [
            _carrier_teu("a1", ["X"], ["Y"]),
            _carrier_teu("a2", ["X"], ["Y"]),
            _carrier_teu("b1", ["Y"], ["X"]),
            _carrier_teu("b2", ["Y"], ["X"]),
        ]:
            await service.save_teu(teu)
        await service.save_lines([_make_line(["a1", "a2"]), _make_line(["b1", "b2"])], DOC)

        rows = await service.get_lines_with_teus(DOC)
        assert all(not t["flipped"] for row in rows for t in row["teus"])

    @pytest.mark.asyncio
    async def test_line_provenance_round_trips(self, service):
        line = _make_line(["t1"], assembled_by="tension_grouper_v1")
        await service.save_lines([line], DOC)
        rows = await service.get_lines_with_teus(DOC)
        assert rows[0]["assembled_by"] == "tension_grouper_v1"

    @pytest.mark.asyncio
    async def test_pre_provenance_lines_report_no_timestamp(self, service):
        """Lines cached before provenance existed must read back as null rather
        than being relabelled with the time they happened to be fetched."""
        await service.save_lines([_make_line(["t1"])], DOC)
        rows = await service.get_lines_with_teus(DOC)
        assert rows[0]["assembled_at"] is None


class TestAssignTeuToLine:
    """Integration-style: real SQLite cache in tmp_path, no LLM involved."""

    @pytest.fixture
    def service(self, tmp_path):
        from storysphere.services.analysis_cache import AnalysisCache

        return TensionService(cache=AnalysisCache(db_path=str(tmp_path / "cache.db")))

    async def _seed(self, service, teus: list[TEU], lines: list[TensionLine]):
        for teu in teus:
            await service.save_teu(teu)
        await service.save_lines(lines, DOC)

    def _teu(self, teu_id: str, chapter: int, intensity: float) -> TEU:
        teu = _make_teu(teu_id, chapter)
        return teu.model_copy(update={"intensity": intensity})

    @pytest.mark.asyncio
    async def test_orphan_joins_the_line(self, service):
        line = _make_line(["t1"])
        await self._seed(service, [self._teu("t1", 1, 0.8), self._teu("t2", 4, 0.6)], [line])

        outcome, updated = await service.assign_teu_to_line("t2", DOC, line.id)
        assert outcome == "ok"
        assert updated.teu_ids == ["t1", "t2"]

    @pytest.mark.asyncio
    async def test_rollups_are_recomputed(self, service):
        """A repaired line must look like one grouping got right first time."""
        line = _make_line(["t1"], chapter_range=[1, 1], intensity_summary=0.8)
        await self._seed(service, [self._teu("t1", 1, 0.8), self._teu("t2", 4, 0.6)], [line])

        _, updated = await service.assign_teu_to_line("t2", DOC, line.id)
        assert updated.chapter_range == [1, 4]
        assert updated.intensity_summary == pytest.approx(0.7)

    @pytest.mark.asyncio
    async def test_assignment_survives_a_reload(self, service):
        line = _make_line(["t1"])
        await self._seed(service, [self._teu("t1", 1, 0.8), self._teu("t2", 4, 0.6)], [line])

        await service.assign_teu_to_line("t2", DOC, line.id)
        reloaded = await service.get_lines(DOC)
        assert reloaded[0].teu_ids == ["t1", "t2"]
        assert reloaded[0].chapter_range == [1, 4]

    @pytest.mark.asyncio
    async def test_reassigning_to_the_same_line_is_a_noop(self, service):
        line = _make_line(["t1"])
        await self._seed(service, [self._teu("t1", 1, 0.8)], [line])

        outcome, updated = await service.assign_teu_to_line("t1", DOC, line.id)
        assert outcome == "ok"
        assert updated.teu_ids == ["t1"]

    @pytest.mark.asyncio
    async def test_teu_held_by_another_line_is_refused(self, service):
        holder = _make_line(["t1"])
        target = _make_line(["t2"])
        await self._seed(service, [self._teu("t1", 1, 0.8), self._teu("t2", 2, 0.6)], [holder, target])

        outcome, conflicting = await service.assign_teu_to_line("t1", DOC, target.id)
        assert outcome == "claimed"
        assert conflicting.id == holder.id

    @pytest.mark.asyncio
    async def test_refused_assignment_changes_nothing(self, service):
        holder = _make_line(["t1"])
        target = _make_line(["t2"])
        await self._seed(service, [self._teu("t1", 1, 0.8), self._teu("t2", 2, 0.6)], [holder, target])

        await service.assign_teu_to_line("t1", DOC, target.id)
        reloaded = {ln.id: ln.teu_ids for ln in await service.get_lines(DOC)}
        assert reloaded == {holder.id: ["t1"], target.id: ["t2"]}

    @pytest.mark.asyncio
    async def test_unknown_teu(self, service):
        line = _make_line(["t1"])
        await self._seed(service, [self._teu("t1", 1, 0.8)], [line])
        assert await service.assign_teu_to_line("nope", DOC, line.id) == ("teu_not_found", None)

    @pytest.mark.asyncio
    async def test_unknown_line(self, service):
        await self._seed(service, [self._teu("t1", 1, 0.8)], [_make_line(["t1"])])
        assert await service.assign_teu_to_line("t1", DOC, "no-such-line") == ("line_not_found", None)

    @pytest.mark.asyncio
    async def test_expired_siblings_do_not_shrink_the_range(self, service):
        """Siblings have aged out of the cache, so the range must widen to cover
        the new TEU rather than collapse onto the only one still resolvable."""
        line = _make_line(["gone-1", "gone-2"], chapter_range=[1, 3], intensity_summary=0.9)
        await self._seed(service, [self._teu("t2", 9, 0.6)], [line])

        _, updated = await service.assign_teu_to_line("t2", DOC, line.id)
        assert updated.teu_ids == ["gone-1", "gone-2", "t2"]
        assert updated.chapter_range == [1, 9]

    @pytest.mark.asyncio
    async def test_expired_siblings_leave_intensity_untouched(self, service):
        """A mean over the survivors would be a different number presented with
        the same authority, so the stored one stands."""
        line = _make_line(["gone-1"], chapter_range=[1, 3], intensity_summary=0.9)
        await self._seed(service, [self._teu("t2", 2, 0.1)], [line])

        _, updated = await service.assign_teu_to_line("t2", DOC, line.id)
        assert updated.intensity_summary == pytest.approx(0.9)


class TestUpdateLineReview:
    """Integration-style: real SQLite cache in tmp_path, no LLM involved."""

    @pytest.fixture
    def service(self, tmp_path):
        from storysphere.services.analysis_cache import AnalysisCache

        return TensionService(cache=AnalysisCache(db_path=str(tmp_path / "cache.db")))

    async def _seed(self, service) -> TensionLine:
        line = _make_line(["t1"], canonical_pole_a="自由", canonical_pole_b="命運")
        await service.save_lines([line], DOC)
        return line

    @pytest.mark.asyncio
    async def test_approve_records_no_edit(self, service):
        line = await self._seed(service)
        updated = await service.update_line_review(line.id, DOC, "approved")
        assert updated.review_status == "approved"
        assert updated.edit is None

    @pytest.mark.asyncio
    async def test_rewriting_labels_preserves_the_originals(self, service):
        line = await self._seed(service)
        updated = await service.update_line_review(
            line.id, DOC, "modified", canonical_pole_a="個人選擇", note="原標籤把載體當成概念"
        )
        assert updated.canonical_pole_a == "個人選擇"
        assert updated.edit.original_pole_a == "自由"
        assert updated.edit.original_pole_b == "命運"
        assert updated.edit.note == "原標籤把載體當成概念"

    @pytest.mark.asyncio
    async def test_second_edit_keeps_the_models_wording_as_original(self, service):
        """'Original' means what grouping proposed, not the previous edit."""
        line = await self._seed(service)
        await service.update_line_review(line.id, DOC, "modified", canonical_pole_a="個人選擇")
        updated = await service.update_line_review(
            line.id, DOC, "modified", canonical_pole_a="自主性"
        )
        assert updated.canonical_pole_a == "自主性"
        assert updated.edit.original_pole_a == "自由"

    @pytest.mark.asyncio
    async def test_a_new_edit_does_not_inherit_the_previous_note(self, service):
        """A stale reason would be attached to labels it never explained."""
        line = await self._seed(service)
        await service.update_line_review(line.id, DOC, "modified", canonical_pole_a="個人選擇", note="第一次")
        updated = await service.update_line_review(
            line.id, DOC, "modified", canonical_pole_a="自主性"
        )
        assert updated.edit.note is None

    @pytest.mark.asyncio
    async def test_modified_without_any_change_records_no_edit(self, service):
        """Otherwise the drawer would show a meaningless 原始：自由 vs 自由."""
        line = await self._seed(service)
        updated = await service.update_line_review(
            line.id, DOC, "modified", canonical_pole_a="自由", canonical_pole_b="命運"
        )
        assert updated.edit is None

    @pytest.mark.asyncio
    async def test_note_alone_counts_as_an_edit(self, service):
        line = await self._seed(service)
        updated = await service.update_line_review(line.id, DOC, "modified", note="標籤沒問題，補個說明")
        assert updated.edit is not None
        assert updated.edit.note == "標籤沒問題，補個說明"

    @pytest.mark.asyncio
    async def test_note_on_an_approval_is_not_recorded(self, service):
        """The edit record is about rewritten labels; approvals have none."""
        line = await self._seed(service)
        updated = await service.update_line_review(line.id, DOC, "approved", note="看起來沒問題")
        assert updated.edit is None

    @pytest.mark.asyncio
    async def test_edit_survives_a_reload(self, service):
        line = await self._seed(service)
        await service.update_line_review(line.id, DOC, "modified", canonical_pole_a="個人選擇", note="理由")
        reloaded = (await service.get_lines(DOC))[0]
        assert reloaded.edit.original_pole_a == "自由"
        assert reloaded.edit.note == "理由"

    @pytest.mark.asyncio
    async def test_unknown_line(self, service):
        await self._seed(service)
        assert await service.update_line_review("no-such-line", DOC, "approved") is None


class TestSynthesisReviewCounts:
    """Integration-style: the LLM call itself is stubbed, the counts are not."""

    @pytest.fixture
    def service(self, tmp_path, monkeypatch):
        from storysphere.services.analysis_cache import AnalysisCache

        svc = TensionService(cache=AnalysisCache(db_path=str(tmp_path / "cache.db")))

        # async because synthesize_theme awaits it — this is a real method being
        # replaced, not an AsyncMock.side_effect.
        async def _fake_llm(lines, document_id, language):
            return TensionTheme(document_id=document_id, proposition="…")

        monkeypatch.setattr(svc, "_call_theme_llm", _fake_llm)
        return svc

    @pytest.mark.asyncio
    async def test_counts_all_lines_not_just_the_ones_used(self, service):
        """Synthesis falls back to reviewed lines only; the warning is about how
        many of the whole set were still outstanding."""
        await service.save_lines(
            [
                _make_line(["t1"], status="approved"),
                _make_line(["t2"], status="modified"),
                _make_line(["t3"], status="pending"),
                _make_line(["t4"], status="rejected"),
            ],
            DOC,
        )
        theme = await service.synthesize_theme(DOC, force=True)
        assert theme.reviewed_line_count == 2
        assert theme.total_line_count == 4

    @pytest.mark.asyncio
    async def test_fully_reviewed_book(self, service):
        await service.save_lines(
            [_make_line(["t1"], status="approved"), _make_line(["t2"], status="approved")], DOC
        )
        theme = await service.synthesize_theme(DOC, force=True)
        assert theme.reviewed_line_count == theme.total_line_count == 2

    @pytest.mark.asyncio
    async def test_nothing_reviewed(self, service):
        await service.save_lines([_make_line(["t1"]), _make_line(["t2"])], DOC)
        theme = await service.synthesize_theme(DOC, force=True)
        assert theme.reviewed_line_count == 0
        assert theme.total_line_count == 2

    @pytest.mark.asyncio
    async def test_counts_are_frozen_against_later_reviewing(self, service):
        """The whole point: reviewing after synthesis must not retroactively
        make the theme look like it was built from reviewed lines."""
        line = _make_line(["t1"])
        await service.save_lines([line], DOC)
        theme = await service.synthesize_theme(DOC, force=True)
        await service.save_theme(theme)

        await service.update_line_review(line.id, DOC, "approved")
        reloaded = await service.get_theme(DOC)
        assert reloaded.reviewed_line_count == 0


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
