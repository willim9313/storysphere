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
            "sep:book-1:%", "symbol_analysis:book-1:%"
        ]

    def test_summarization_deletes_nothing(self):
        """Its only derived cache is book-keyed, so it is staled, not deleted."""
        assert patterns_for("summarization", "book-1") == []

    def test_unknown_step_yields_nothing(self):
        assert patterns_for("no-such-step", "book-1") == []

    def test_per_entity_families_keep_their_wildcard(self):
        patterns = patterns_for("symbol-discovery", "book-1")
        assert set(patterns) == {"sep:book-1:%", "symbol_analysis:book-1:%"}

    def test_feature_extraction_deletes_only_id_keyed_families(self):
        """Book-keyed analyses survive the delete so they can be reported stale."""
        patterns = patterns_for("feature-extraction", "book-1")

        assert "event:book-1:%" in patterns
        assert "narrative_structure:book-1" not in patterns
        assert "tension_lines:book-1" not in patterns


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
        assert called == {"sep:book-1:%", "symbol_analysis:book-1:%"}

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
        }


class TestStaleSources:
    """Book-keyed families report the steps that can age them."""

    def test_narrative_structure_ages_with_event_extraction(self):
        assert stale_sources("narrative_structure:book-1") == ("feature-extraction",)

    def test_hero_journey_ages_with_both_its_inputs(self):
        """It reads chapter summaries and resolves events."""
        assert set(stale_sources("hero_journey:book-1")) == {
            "summarization", "feature-extraction",
        }

    def test_deleted_families_are_never_stale(self):
        """They are gone after a rerun, so there is nothing to date."""
        assert stale_sources("event:book-1:ev-1") == ()
        assert stale_sources("character:book-1:ent-1") == ()

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

    async def test_deleted_family_is_never_stale(self):
        """event: is removed on rerun, so it never has staleness to report."""
        from datetime import UTC, datetime, timedelta

        from storysphere.services.cache_invalidation import staleness

        created = datetime(2026, 8, 1, tzinfo=UTC)
        status = self._status(feature_extraction_at=created + timedelta(days=1))

        assert await staleness(
            self._cache(created.timestamp()), "event:b1:ev-1", status
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
