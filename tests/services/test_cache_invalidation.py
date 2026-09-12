"""Tests for services.cache_invalidation — pipeline step → cache mapping."""

from unittest.mock import AsyncMock

from storysphere.services.cache_invalidation import (
    ALL_STEPS,
    invalidate_for_steps,
    patterns_for,
    stale_sources,
    teu_keys_for,
)


class TestPatternsFor:
    def test_book_id_is_substituted(self):
        assert patterns_for("symbol-discovery", "book-1") == [
            "sep:book-1:%",
            "symbol_analysis:book-1:%",
            "symbol_analysis_block:book-1:%",
            "symbol_overview:book-1",
        ]

    def test_summarization_deletes_nothing(self):
        """Its only derived cache is book-keyed, so it is staled, not deleted."""
        assert patterns_for("summarization", "book-1") == []

    def test_unknown_step_yields_nothing(self):
        assert patterns_for("no-such-step", "book-1") == []

    def test_per_entity_families_keep_their_wildcard(self):
        patterns = patterns_for("symbol-discovery", "book-1")
        assert {p for p in patterns if p.endswith("%")} == {
            "sep:book-1:%",
            "symbol_analysis:book-1:%",
            "symbol_analysis_block:book-1:%",
        }

    def test_feature_extraction_deletes_only_the_projection(self):
        """B-111 — it regenerates no id, so it orphans nothing.

        This used to assert ``event:book-1:%`` was in the delete list. That is
        the bug: the step embeds paragraphs and extracts keywords, holding no
        reference to the KG, so every id in those keys survives it. The
        entries were reachable the whole time and deleting them threw away LLM
        output. Only ``symbol_overview:`` stays, and only because it is a
        cheap projection holding no human input.
        """
        assert patterns_for("feature-extraction", "book-1") == ["symbol_overview:book-1"]

    def test_feature_extraction_does_not_touch_epistemic(self):
        """EpistemicStateService takes only kg_service / llm / cache (B-111).

        Nothing it holds comes from this step, so the family belongs in
        neither map — not deleted here, and not stale here either.
        """
        assert "epistemic:book-1:%" not in patterns_for("feature-extraction", "book-1")
        assert stale_sources("epistemic:book-1:ent-1") == ()

    def test_knowledge_graph_still_orphans_the_id_keyed_families(self):
        """B-111 moved rules off feature-extraction; it must not disarm B-108."""
        patterns = patterns_for("knowledge-graph", "book-1")

        assert "event:book-1:%" in patterns
        assert "character:book-1:%" in patterns
        assert "epistemic:book-1:%" in patterns


class TestKnowledgeGraphRerun:
    """B-108 — the step that regenerates event ids must drop the keys holding them.

    Event-keyed caches (`event:{book}:{event_id}`, `teu:{event_id}`) do not go
    merely stale when the graph is re-extracted: the ids in the keys stop
    existing, so nothing can ever ask for those rows again. The rules for all of
    this were hung on "feature-extraction", which never touches an Event.
    """

    def test_eep_is_dropped_by_the_step_that_regenerates_event_ids(self):
        assert "event:book-1:%" in patterns_for("knowledge-graph", "book-1")

    def test_event_derived_analyses_are_reported_stale(self):
        for family in (
            "narrative_structure",
            "temporal_analysis",
            "tension_lines",
            "tension_theme",
        ):
            assert "knowledge-graph" in stale_sources(f"{family}:book-1"), family


class TestTeuKeysFor:
    def test_builds_keys_from_event_ids(self):
        assert teu_keys_for(["ev-1", "ev-2"]) == ["teu:ev-1", "teu:ev-2"]

    def test_no_events_yields_nothing(self):
        assert teu_keys_for([]) == []


class TestInvalidateForSteps:
    async def test_invalidates_each_pattern_once(self):
        cache = AsyncMock()
        await invalidate_for_steps(cache, "book-1", ["symbol-discovery"])

        called = {c.args[0] for c in cache.invalidate.call_args_list}
        assert called == {
            "sep:book-1:%",
            "symbol_analysis:book-1:%",
            "symbol_analysis_block:book-1:%",
            "symbol_overview:book-1",
        }

    async def test_overlapping_steps_are_deduplicated(self):
        """character: and epistemic: appear under more than one step."""
        cache = AsyncMock()
        await invalidate_for_steps(
            cache, "book-1", ["feature-extraction", "knowledge-graph"]
        )

        called = [c.args[0] for c in cache.invalidate.call_args_list]
        assert len(called) == len(set(called))
        assert "character:book-1:%" in called

    async def test_teu_keys_are_included(self):
        cache = AsyncMock()
        await invalidate_for_steps(
            cache, "book-1", ["feature-extraction"], teu_keys=["teu:ev-1"]
        )

        called = {c.args[0] for c in cache.invalidate.call_args_list}
        assert "teu:ev-1" in called

    async def test_unknown_step_touches_nothing(self):
        cache = AsyncMock()
        await invalidate_for_steps(cache, "book-1", ["no-such-step"])
        cache.invalidate.assert_not_called()

    async def test_cache_failure_does_not_propagate(self):
        """Losing a cache entry is recoverable; failing the user's rerun is not."""
        cache = AsyncMock()
        cache.invalidate = AsyncMock(side_effect=RuntimeError("disk gone"))

        await invalidate_for_steps(cache, "book-1", ["summarization"])

    async def test_all_steps_covers_every_family(self):
        cache = AsyncMock()
        await invalidate_for_steps(cache, "book-1", ALL_STEPS)

        called = {c.args[0] for c in cache.invalidate.call_args_list}
        families = {p.split(":")[0] for p in called}
        assert families == {
            "event",
            "character",
            "epistemic",
            "voice_profile",
            "sep",
            "symbol_analysis",
            "symbol_analysis_block",
            "symbol_overview",
        }

    async def test_symbol_overview_is_dropped_by_each_step_it_derives_from(self):
        """It projects symbols, entities and events — any of the three ages it."""
        for step in ("symbol-discovery", "feature-extraction", "knowledge-graph"):
            cache = AsyncMock()
            await invalidate_for_steps(cache, "book-1", [step])
            called = {c.args[0] for c in cache.invalidate.call_args_list}
            assert "symbol_overview:book-1" in called, step

    def test_symbol_overview_is_deleted_rather_than_reported_stale(self):
        # Book-keyed, but it holds no review state, so there is nothing to preserve.
        assert stale_sources("symbol_overview:book-1") == ()


class TestStaleSources:
    """Book-keyed families report the steps that can age them."""

    def test_narrative_structure_ages_with_the_step_that_extracts_events(self):
        """This used to name only "feature-extraction" (B-108).

        That step embeds paragraphs and extracts keywords; it never touches an
        Event. "knowledge-graph" is the one that re-extracts them, and it was
        the one missing.
        """
        assert "knowledge-graph" in stale_sources("narrative_structure:book-1")

    def test_hero_journey_ages_with_both_its_inputs(self):
        """It reads chapter summaries and resolves events."""
        sources = set(stale_sources("hero_journey:book-1"))
        assert "summarization" in sources
        assert "knowledge-graph" in sources

    def test_families_deleted_by_every_step_that_touches_them_are_never_stale(self):
        """Nothing dates an entry that no longer exists to be read."""
        assert stale_sources("voice_profile:book-1:ent-1") == ()
        assert stale_sources("sep:book-1:sym-1") == ()

    def test_eep_and_cep_age_with_the_step_that_feeds_their_evidence(self):
        """B-111 — they are id-keyed but not orphaned by feature-extraction.

        EEP text evidence comes from a vector search and CEP from a vector
        search plus ``get_entity_keywords`` — both are feature-extraction's
        output. The ids survive the step, so these report stale rather than
        being deleted. "knowledge-graph" is absent on purpose: there they are
        deleted, and a deleted entry has no staleness to report.
        """
        assert stale_sources("event:book-1:ev-1") == ("feature-extraction",)
        assert stale_sources("character:book-1:ent-1") == ("feature-extraction",)

    def test_unknown_family_is_never_stale(self):
        assert stale_sources("no_such_family:book-1") == ()


class TestStaleness:
    """A cached entry is stale when a step it derives from ran after it."""

    def _status(self, **stamps):
        from storysphere.domain.documents import PipelineStatus
        return PipelineStatus(**stamps)

    def _cache(self, created: float | None):
        cache = AsyncMock()
        cache.created_at = AsyncMock(return_value=created)
        return cache

    async def test_rerun_after_caching_is_stale(self):
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        status = self._status(feature_extraction_at=created + timedelta(days=1))

        stale, reason = await staleness(
            self._cache(created.timestamp()), "narrative_structure:b1", status
        )
        assert (stale, reason) == (True, "feature-extraction")

    async def test_rerun_before_caching_is_fresh(self):
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 2, tzinfo=UTC)
        status = self._status(feature_extraction_at=created - timedelta(days=1))

        assert await staleness(
            self._cache(created.timestamp()), "narrative_structure:b1", status
        ) == (False, None)

    async def test_unstamped_step_reads_fresh(self):
        """Absent timestamps predate the field; flagging would stale the library."""
        from datetime import UTC, datetime

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        assert await staleness(
            self._cache(created.timestamp()), "narrative_structure:b1", self._status()
        ) == (False, None)

    async def test_missing_entry_reads_fresh(self):
        from storysphere.services.cache_invalidation import staleness
        assert await staleness(
            self._cache(None), "narrative_structure:b1", self._status()
        ) == (False, None)

    async def test_eep_is_stale_after_the_step_that_feeds_its_evidence(self):
        """B-111 — this asserted ``(False, None)`` and was pinning the bug.

        A feature-extraction rerun postdating the entry means the vector
        evidence and keywords the EEP was built from have been replaced. The
        entry is still readable, so the honest answer is "stale", not "fresh".
        """
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        status = self._status(feature_extraction_at=created + timedelta(days=1))

        assert await staleness(
            self._cache(created.timestamp()), "event:b1:ev-1", status
        ) == (True, "feature-extraction")

    async def test_family_deleted_on_rerun_is_never_stale(self):
        """voice_profile: is dropped by the only step that touches it."""
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        status = self._status(feature_extraction_at=created + timedelta(days=1))

        assert await staleness(
            self._cache(created.timestamp()), "voice_profile:b1:ent-1", status
        ) == (False, None)

    async def test_any_source_step_can_stale_an_entry(self):
        """hero_journey derives from two steps; either one ageing it counts."""
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        status = self._status(summarization_at=created + timedelta(hours=1))

        stale, reason = await staleness(
            self._cache(created.timestamp()), "hero_journey:b1", status
        )
        assert (stale, reason) == (True, "summarization")
