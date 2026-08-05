"""Tests for services.analysis_cache — SQLite-backed analysis result store."""

import time

import aiosqlite
import pytest
from pydantic import BaseModel
from storysphere.services.analysis_cache import AnalysisCache


class _Sample(BaseModel):
    name: str
    score: float


async def _backdate(cache: AnalysisCache, key: str, days: int) -> None:
    """Rewrite an entry's ``created`` timestamp to ``days`` ago."""
    async with aiosqlite.connect(cache._db_path) as db:
        await db.execute(
            "UPDATE analysis_cache SET created = ? WHERE key = ?",
            (time.time() - days * 86_400, key),
        )
        await db.commit()


@pytest.fixture
def cache(tmp_path):
    db_path = str(tmp_path / "test_cache.db")
    return AnalysisCache(db_path=db_path)


class TestAnalysisCacheMakeKey:
    def test_make_key(self):
        key = AnalysisCache.make_key("character", "doc-1", "Alice")
        assert key == "character:doc-1:alice"

    def test_make_key_case_insensitive(self):
        key = AnalysisCache.make_key("character", "doc-1", "ALICE")
        assert key == "character:doc-1:alice"


class TestAnalysisCacheGetSet:
    async def test_set_and_get(self, cache):
        await cache.set("k1", {"name": "Alice", "score": 0.9})
        result = await cache.get("k1")
        assert result == {"name": "Alice", "score": 0.9}

    async def test_get_missing_returns_none(self, cache):
        result = await cache.get("nonexistent")
        assert result is None

    async def test_upsert_overwrites(self, cache):
        await cache.set("k1", {"v": 1})
        await cache.set("k1", {"v": 2})
        result = await cache.get("k1")
        assert result == {"v": 2}

    async def test_old_entry_still_returned(self, cache):
        """Entries never expire — only invalidate() removes them."""
        await cache.set("k1", {"v": 1})
        # Backdate the entry well beyond the TTL that used to apply (7 days)
        await _backdate(cache, "k1", days=400)

        assert await cache.get("k1") == {"v": 1}
        assert await cache.count_keys("k%") == 1
        assert await cache.list_by_prefix("k") == [{"v": 1}]


class TestAnalysisCacheGetAs:
    async def test_parses_into_model(self, cache):
        await cache.set("k1", {"name": "Alice", "score": 0.9})
        result = await cache.get_as("k1", _Sample)
        assert result == _Sample(name="Alice", score=0.9)

    async def test_missing_key_returns_none(self, cache):
        assert await cache.get_as("nonexistent", _Sample) is None

    async def test_shape_mismatch_is_a_miss_not_an_error(self, cache):
        """A model change must degrade to a recompute, not a 500."""
        await cache.set("k1", {"renamed_field": "Alice"})
        assert await cache.get_as("k1", _Sample) is None

    async def test_mismatched_row_is_left_in_place(self, cache):
        """get_as reports a miss; only invalidate() may delete."""
        await cache.set("k1", {"renamed_field": "Alice"})
        await cache.get_as("k1", _Sample)
        assert await cache.get("k1") == {"renamed_field": "Alice"}

    async def test_parses_container_types(self, cache):
        """hero_journey and tension_lines store lists, not a single object."""
        await cache.set("k1", [{"name": "Alice", "score": 0.9}, {"name": "Bob", "score": 0.1}])
        result = await cache.get_as("k1", list[_Sample])
        assert [s.name for s in result] == ["Alice", "Bob"]


class TestAnalysisCacheInvalidate:
    async def test_invalidate_pattern(self, cache):
        await cache.set("character:doc-1:alice", {"v": 1})
        await cache.set("character:doc-1:bob", {"v": 2})
        await cache.set("character:doc-2:alice", {"v": 3})

        count = await cache.invalidate("character:doc-1:%")
        assert count == 2

        # doc-2 should still exist
        assert await cache.get("character:doc-2:alice") is not None

    async def test_invalidate_no_match(self, cache):
        count = await cache.invalidate("nonexistent:%")
        assert count == 0
