"""Tests for services.analysis_cache — SQLite cache with TTL."""

import time
from unittest.mock import patch

import pytest

from services.analysis_cache import AnalysisCache


@pytest.fixture
def cache(tmp_path):
    db_path = str(tmp_path / "test_cache.db")
    return AnalysisCache(db_path=db_path, ttl_seconds=60)


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

    async def test_expired_returns_none(self, tmp_path):
        db_path = str(tmp_path / "ttl_cache.db")
        cache = AnalysisCache(db_path=db_path, ttl_seconds=1)
        await cache.set("k1", {"v": 1})

        with patch("services.analysis_cache.time") as mock_time:
            # Simulate time passing beyond TTL
            mock_time.time.return_value = time.time() + 10
            result = await cache.get("k1")
        assert result is None


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
