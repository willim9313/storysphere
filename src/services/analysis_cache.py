"""AnalysisCache — SQLite-backed cache with TTL for deep analysis results.

Default TTL is 7 days.  Cache keys follow the pattern:
    character:{document_id}:{entity_name}
"""

from __future__ import annotations

import json
import logging
import time

import aiosqlite

logger = logging.getLogger(__name__)

_DEFAULT_TTL = 7 * 86_400  # 7 days in seconds

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS analysis_cache (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    created   REAL NOT NULL
)
"""


class AnalysisCache:
    """Async SQLite cache for analysis results with TTL eviction."""

    def __init__(self, db_path: str = "./data/analysis_cache.db", ttl_seconds: int = _DEFAULT_TTL) -> None:
        self._db_path = db_path
        self._ttl = ttl_seconds
        self._initialised = False

    async def _ensure_table(self, db: aiosqlite.Connection) -> None:
        if not self._initialised:
            await db.execute(_CREATE_TABLE)
            await db.commit()
            self._initialised = True

    async def get(self, key: str) -> dict | None:
        """Return cached result or None if missing/expired."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            cursor = await db.execute(
                "SELECT value, created FROM analysis_cache WHERE key = ?", (key,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            value_str, created = row
            if time.time() - created > self._ttl:
                # Expired — delete and return None
                await db.execute("DELETE FROM analysis_cache WHERE key = ?", (key,))
                await db.commit()
                logger.debug("Cache expired for key=%s", key)
                return None
            return json.loads(value_str)

    async def set(self, key: str, result: dict) -> None:
        """Store a result in cache (upsert)."""
        value_str = json.dumps(result, ensure_ascii=False, default=str)
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            await db.execute(
                "INSERT OR REPLACE INTO analysis_cache (key, value, created) VALUES (?, ?, ?)",
                (key, value_str, time.time()),
            )
            await db.commit()
        logger.debug("Cache set for key=%s", key)

    async def invalidate(self, pattern: str) -> int:
        """Delete cache entries matching a LIKE pattern. Returns count deleted."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            cursor = await db.execute(
                "DELETE FROM analysis_cache WHERE key LIKE ?", (pattern,)
            )
            await db.commit()
            count = cursor.rowcount
        logger.info("Invalidated %d cache entries matching '%s'", count, pattern)
        return count

    @staticmethod
    def make_key(analysis_type: str, document_id: str, entity_name: str) -> str:
        """Build a cache key.

        Example: ``make_key("character", "doc-1", "Alice")`` → ``"character:doc-1:alice"``
        """
        return f"{analysis_type}:{document_id}:{entity_name.lower()}"
