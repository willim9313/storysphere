"""TokenUsageStore — SQLite-backed persistent storage for LLM token usage.

Each LLM call is recorded as a row with provider, model, service, token counts,
and latency.  Aggregation queries support the ``/api/v1/token-usage`` endpoint.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import aiosqlite

logger = logging.getLogger(__name__)

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS token_usage (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                 REAL    NOT NULL,
    provider           TEXT    NOT NULL,
    model              TEXT    NOT NULL,
    service            TEXT    NOT NULL,
    prompt_tokens      INTEGER NOT NULL DEFAULT 0,
    completion_tokens  INTEGER NOT NULL DEFAULT 0,
    total_tokens       INTEGER NOT NULL DEFAULT 0,
    latency_ms         REAL    NOT NULL DEFAULT 0,
    success            INTEGER NOT NULL DEFAULT 1,
    book_id            TEXT,
    error              TEXT
)
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_service ON token_usage(service)",
]


class TokenUsageStore:
    """Async SQLite store for token usage records."""

    def __init__(self, db_path: str = "./data/token_usage.db") -> None:
        self._db_path = db_path
        self._initialised = False

    async def _ensure_table(self, db: aiosqlite.Connection) -> None:
        if self._initialised:
            return
        await db.execute(_CREATE_TABLE)
        for idx_sql in _CREATE_INDEXES:
            await db.execute(idx_sql)
        await db.commit()
        self._initialised = True

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def record(
        self,
        *,
        provider: str,
        model: str,
        service: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        latency_ms: float = 0.0,
        success: bool = True,
        book_id: str | None = None,
        error: str | None = None,
    ) -> None:
        """Insert a single token-usage row."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_table(db)
            await db.execute(
                """INSERT INTO token_usage
                   (ts, provider, model, service, prompt_tokens, completion_tokens,
                    total_tokens, latency_ms, success, book_id, error)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    time.time(),
                    provider,
                    model,
                    service,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    round(latency_ms, 2),
                    1 if success else 0,
                    book_id,
                    error,
                ),
            )
            await db.commit()

    # ------------------------------------------------------------------
    # Read — aggregated
    # ------------------------------------------------------------------

    async def get_usage(
        self,
        since: float | None = None,
        until: float | None = None,
    ) -> dict:
        """Return aggregated usage: summary + by_service + by_model."""
        where, params = self._time_filter(since, until)

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await self._ensure_table(db)

            # Summary
            cur = await db.execute(
                f"""SELECT
                        COALESCE(SUM(prompt_tokens), 0)     AS total_prompt_tokens,
                        COALESCE(SUM(completion_tokens), 0)  AS total_completion_tokens,
                        COALESCE(SUM(total_tokens), 0)       AS total_tokens,
                        COUNT(*)                             AS total_calls
                    FROM token_usage {where}""",
                params,
            )
            row = await cur.fetchone()
            summary = {
                "totalPromptTokens": row["total_prompt_tokens"],
                "totalCompletionTokens": row["total_completion_tokens"],
                "totalTokens": row["total_tokens"],
                "totalCalls": row["total_calls"],
            }

            # By service
            cur = await db.execute(
                f"""SELECT service,
                        SUM(prompt_tokens)     AS prompt_tokens,
                        SUM(completion_tokens)  AS completion_tokens,
                        SUM(total_tokens)       AS total_tokens,
                        COUNT(*)               AS calls
                    FROM token_usage {where}
                    GROUP BY service
                    ORDER BY total_tokens DESC""",
                params,
            )
            by_service = {
                r["service"]: {
                    "promptTokens": r["prompt_tokens"],
                    "completionTokens": r["completion_tokens"],
                    "totalTokens": r["total_tokens"],
                    "calls": r["calls"],
                }
                async for r in cur
            }

            # By model
            cur = await db.execute(
                f"""SELECT model,
                        SUM(prompt_tokens)     AS prompt_tokens,
                        SUM(completion_tokens)  AS completion_tokens,
                        SUM(total_tokens)       AS total_tokens,
                        COUNT(*)               AS calls
                    FROM token_usage {where}
                    GROUP BY model
                    ORDER BY total_tokens DESC""",
                params,
            )
            by_model = {
                r["model"]: {
                    "promptTokens": r["prompt_tokens"],
                    "completionTokens": r["completion_tokens"],
                    "totalTokens": r["total_tokens"],
                    "calls": r["calls"],
                }
                async for r in cur
            }

        return {
            "summary": summary,
            "byService": by_service,
            "byModel": by_model,
        }

    async def get_daily_usage(
        self,
        since: float | None = None,
        until: float | None = None,
    ) -> list[dict]:
        """Return per-day aggregated usage."""
        where, params = self._time_filter(since, until)

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await self._ensure_table(db)
            cur = await db.execute(
                f"""SELECT DATE(ts, 'unixepoch', 'localtime') AS date,
                        SUM(prompt_tokens)     AS prompt_tokens,
                        SUM(completion_tokens)  AS completion_tokens,
                        SUM(total_tokens)       AS total_tokens,
                        COUNT(*)               AS calls
                    FROM token_usage {where}
                    GROUP BY date
                    ORDER BY date""",
                params,
            )
            return [
                {
                    "date": r["date"],
                    "promptTokens": r["prompt_tokens"],
                    "completionTokens": r["completion_tokens"],
                    "totalTokens": r["total_tokens"],
                    "calls": r["calls"],
                }
                async for r in cur
            ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _time_filter(
        since: float | None,
        until: float | None,
    ) -> tuple[str, list[float]]:
        """Build a WHERE clause for time-range filtering."""
        conditions: list[str] = []
        params: list[float] = []
        if since is not None:
            conditions.append("ts >= ?")
            params.append(since)
        if until is not None:
            conditions.append("ts < ?")
            params.append(until)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        return where, params

    @staticmethod
    def range_to_timestamps(range_str: str) -> tuple[float | None, float | None]:
        """Convert a range string ('today', '7d', '30d', 'all') to (since, until)."""
        if range_str == "all":
            return None, None
        now = time.time()
        if range_str == "today":
            today_start = datetime.now(tz=timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            return today_start.timestamp(), None
        days_map = {"7d": 7, "30d": 30}
        days = days_map.get(range_str, 7)
        return now - days * 86_400, None
