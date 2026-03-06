"""Tests for config.archetypes — archetype config loader."""

import pytest

from config.archetypes import (
    get_archetype_summary,
    load_archetypes,
)


class TestLoadArchetypes:
    def setup_method(self):
        load_archetypes.cache_clear()

    def test_jung_en_loads_12(self):
        archetypes = load_archetypes("jung", "en")
        assert len(archetypes) == 12
        ids = {a["id"] for a in archetypes}
        assert "hero" in ids
        assert "sage" in ids

    def test_jung_zh_loads_12(self):
        archetypes = load_archetypes("jung", "zh")
        assert len(archetypes) == 12

    def test_schmidt_en_loads(self):
        archetypes = load_archetypes("schmidt", "en")
        assert len(archetypes) > 12  # Schmidt has ~45

    def test_unsupported_framework_raises(self):
        with pytest.raises(ValueError, match="Unsupported framework"):
            load_archetypes("freud", "en")

    def test_unsupported_language_raises(self):
        with pytest.raises(ValueError, match="Unsupported language"):
            load_archetypes("jung", "fr")


class TestGetArchetypeSummary:
    def setup_method(self):
        load_archetypes.cache_clear()

    def test_summary_contains_all_archetypes(self):
        summary = get_archetype_summary("jung", "en")
        assert "Hero" in summary
        assert "Sage" in summary
        # Each archetype gets one line
        lines = [l for l in summary.strip().split("\n") if l.strip()]
        assert len(lines) == 12
