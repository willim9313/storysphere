"""AnalysisCache — SQLite-backed store for deep analysis results.

Entries never expire on their own; ``created`` records when each one was
written, and stale entries are dropped explicitly via ``invalidate()`` when
the upstream data is re-analysed.  Cache keys follow the pattern:
    character:{document_id}:{entity_name}
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, TypeVar

import aiosqlite
from pydantic import TypeAdapter, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T")

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS analysis_cache (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    created   REAL NOT NULL
)
"""


class AnalysisCache:
    """Async SQLite store for analysis results; entries are kept until invalidated."""

    def __init__(self, db_path: str = "./var/analysis_cache.db") -> None:
        self._db_path = db_path
        self._initialised = False

    async def _ensure_table(self, db: aiosqlite.Connection) -> None:
        await db.execute(_CREATE_TABLE)
        await db.commit()
        self._initialised = True

    async def get(self, key: str) -> dict | None:
        """Return cached result, or None if the key was never written."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            cursor = await db.execute(
                "SELECT value FROM analysis_cache WHERE key = ?", (key,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return json.loads(row[0])

    async def get_as(self, key: str, model: Any) -> T | None:
        """Return the cached value parsed as ``model``, or None.

        ``model`` is anything pydantic can validate against, including a
        container such as ``list[HeroJourneyStage]``.

        A stored value that no longer matches — typically after a field was
        renamed or removed — is reported as a miss instead of raising, so a
        model change degrades to a recompute rather than a 500. Entries no
        longer expire on their own, so without this a stale-shaped row would
        keep failing every read until someone invalidated it by hand. The row
        is left in place; use ``invalidate()`` to drop it deliberately.
        """
        raw = await self.get(key)
        if raw is None:
            return None
        try:
            return TypeAdapter(model).validate_python(raw)
        except ValidationError:
            logger.warning(
                "Cache entry key=%s no longer matches %s; treating as a miss",
                key,
                getattr(model, "__name__", model),
            )
            return None

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

    async def count_keys(self, pattern: str) -> int:
        """Count cache entries matching a LIKE pattern.

        Uses SQLite LIKE syntax (``%`` wildcard).  Mirrors ``invalidate()``
        but uses ``SELECT COUNT`` instead of ``DELETE``, so it is safe to call
        at any time without side-effects.

        Args:
            pattern: SQLite LIKE pattern, e.g. ``"character:doc-1:%"``

        Returns:
            Number of entries matching the pattern.
        """
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            cursor = await db.execute(
                "SELECT COUNT(*) FROM analysis_cache WHERE key LIKE ?",
                (pattern,),
            )
            row = await cursor.fetchone()
        return row[0] if row else 0

    async def list_by_prefix(self, prefix: str) -> list[dict]:
        """Return all cache values whose key starts with ``prefix``.

        Used when a consumer needs to bulk-load entries that share a key family
        without round-tripping a separate index (e.g. all TEUs for a document).
        """
        like_pattern = prefix + "%"
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            cursor = await db.execute(
                "SELECT value FROM analysis_cache WHERE key LIKE ?",
                (like_pattern,),
            )
            rows = await cursor.fetchall()
        return [json.loads(r[0]) for r in rows]

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
