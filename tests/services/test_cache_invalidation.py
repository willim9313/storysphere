"""Tests for services.cache_invalidation — pipeline step → cache mapping."""

from unittest.mock import AsyncMock

from storysphere.services.cache_invalidation import (
    ALL_STEPS,
    invalidate_for_steps,
    patterns_for,
    teu_keys_for,
)


class TestPatternsFor:
    def test_book_id_is_substituted(self):
        assert patterns_for("summarization", "book-1") == ["hero_journey:book-1"]

    def test_unknown_step_yields_nothing(self):
        assert patterns_for("no-such-step", "book-1") == []

    def test_per_entity_families_keep_their_wildcard(self):
        patterns = patterns_for("symbol-discovery", "book-1")
        assert set(patterns) == {"sep:book-1:%", "symbol_analysis:book-1:%"}

    def test_feature_extraction_covers_event_derived_analyses(self):
        """Re-extracting events invalidates everything keyed by an event."""
        patterns = patterns_for("feature-extraction", "book-1")
        assert "event:book-1:%" in patterns
        assert "narrative_structure:book-1" in patterns
        assert "tension_lines:book-1" in patterns


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
            "hero_journey",
            "event",
            "character",
            "epistemic",
            "narrative_structure",
            "temporal_analysis",
            "tension_lines",
            "tension_theme",
            "voice_profile",
            "sep",
            "symbol_analysis",
        }
