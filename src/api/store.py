"""Task store for background job status tracking.

Two backends are available, selected via ``Settings.task_store_backend``:

- ``"memory"`` (default): in-process dict, fast but lost on restart / not
  shared across worker processes.
- ``"sqlite"``: aiosqlite-backed store, survives restarts and works safely
  with multiple uvicorn workers (each worker gets its own connection but
  writes to the same file via SQLite's serialised WAL mode).

Usage::

    from api.store import task_store          # process-level singleton
    task_store.create("task-id")
    task_store.set_running("task-id")
    task_store.set_completed("task-id", result={...})
    task = task_store.get("task-id")          # TaskStatus | None
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from pathlib import Path
from typing import Any

from api.schemas.common import MurmurEvent, TaskStatus

logger = logging.getLogger(__name__)


# ── In-memory backend ─────────────────────────────────────────────────────────


class MemoryTaskStore:
    """Thread-safe in-memory store. Suitable for single-process / dev."""

    def __init__(self) -> None:
        self._store: dict[str, TaskStatus] = {}
        self._murmur: dict[str, list[MurmurEvent]] = {}
        self._lock = threading.Lock()

    def create(self, task_id: str) -> TaskStatus:
        task = TaskStatus(task_id=task_id, status="pending")
        with self._lock:
            self._store[task_id] = task
        return task

    def get(self, task_id: str) -> TaskStatus | None:
        with self._lock:
            return self._store.get(task_id)

    def set_running(self, task_id: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "running"}
                )

    def set_awaiting_review(self, task_id: str, book_id: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "awaiting_review", "stage": "章節審閱", "result": {"bookId": book_id}}
                )

    def set_completed(self, task_id: str, result: Any) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "done", "result": result, "progress": 100, "stage": "完成"}
                )

    def set_failed(self, task_id: str, error: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "error", "error": error, "stage": "失败"}
                )

    def set_progress(
        self,
        task_id: str,
        progress: int,
        stage: str,
        *,
        sub_progress: int | None = None,
        sub_total: int | None = None,
        sub_stage: str | None = None,
    ) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={
                        "progress": progress,
                        "stage": stage,
                        "sub_progress": sub_progress,
                        "sub_total": sub_total,
                        "sub_stage": sub_stage,
                    }
                )

    async def append_murmur(self, task_id: str, event: MurmurEvent) -> None:
        with self._lock:
            if task_id not in self._murmur:
                self._murmur[task_id] = []
            events = self._murmur[task_id]
            event = event.model_copy(update={"seq": len(events)})
            events.append(event)

    async def get_murmur_events(self, task_id: str, after: int = 0) -> list[MurmurEvent]:
        with self._lock:
            return list(self._murmur.get(task_id, [])[after:])

    def get_task_id_by_book_id(self, book_id: str) -> str | None:
        with self._lock:
            for task_id, status in self._store.items():
                if isinstance(status.result, dict) and status.result.get("bookId") == book_id:
                    return task_id
        return None


# ── SQLite backend ────────────────────────────────────────────────────────────

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS tasks (
    task_id      TEXT PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'pending',
    progress     INTEGER NOT NULL DEFAULT 0,
    stage        TEXT NOT NULL DEFAULT '',
    sub_progress INTEGER,
    sub_total    INTEGER,
    sub_stage    TEXT,
    result       TEXT,
    error        TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
)
"""

_ADD_CREATED_AT = """
ALTER TABLE tasks ADD COLUMN
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
"""

_ADD_SUB_PROGRESS = "ALTER TABLE tasks ADD COLUMN sub_progress INTEGER"
_ADD_SUB_TOTAL = "ALTER TABLE tasks ADD COLUMN sub_total INTEGER"
_ADD_SUB_STAGE = "ALTER TABLE tasks ADD COLUMN sub_stage TEXT"

_CREATE_MURMUR_TABLE = """
CREATE TABLE IF NOT EXISTS task_murmur_events (
    task_id   TEXT    NOT NULL,
    seq       INTEGER NOT NULL,
    step_key  TEXT    NOT NULL,
    type      TEXT    NOT NULL,
    content   TEXT    NOT NULL DEFAULT '',
    meta      TEXT,
    raw_content TEXT,
    PRIMARY KEY (task_id, seq)
)
"""


class SQLiteTaskStore:
    """Async SQLite-backed store. Works across multiple uvicorn workers."""

    def __init__(self, db_path: str = "./data/tasks.db") -> None:
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialised = False
        self._init_lock = asyncio.Lock()

    async def _ensure_init(self) -> None:
        if self._initialised:
            return
        async with self._init_lock:
            if self._initialised:
                return
            import aiosqlite  # noqa: PLC0415
            async with aiosqlite.connect(self._db_path) as db:
                await db.execute("PRAGMA journal_mode=WAL")
                await db.execute(_CREATE_TABLE)
                await db.execute(_CREATE_MURMUR_TABLE)
                # Migrate existing DBs that lack the created_at column
                try:
                    await db.execute(_ADD_CREATED_AT)
                except Exception:
                    pass  # column already exists
                try:
                    await db.execute(_ADD_SUB_PROGRESS)
                except Exception:
                    pass  # column already exists
                try:
                    await db.execute(_ADD_SUB_TOTAL)
                except Exception:
                    pass  # column already exists
                try:
                    await db.execute(_ADD_SUB_STAGE)
                except Exception:
                    pass  # column already exists
                await db.commit()
            self._initialised = True

    async def cleanup(self, older_than_days: int = 30) -> int:
        """Delete completed/failed tasks older than *older_than_days*.

        Returns the number of rows deleted.
        """
        import aiosqlite  # noqa: PLC0415

        await self._ensure_init()
        async with aiosqlite.connect(self._db_path) as db:
            # Cascade delete murmur events for old tasks in the same transaction
            await db.execute(
                """
                DELETE FROM task_murmur_events
                WHERE task_id IN (
                    SELECT task_id FROM tasks
                    WHERE status IN ('done', 'error')
                      AND created_at < strftime('%Y-%m-%dT%H:%M:%S',
                            datetime('now', ? || ' days'))
                )
                """,
                (f"-{older_than_days}",),
            )
            cursor = await db.execute(
                """
                DELETE FROM tasks
                WHERE status IN ('done', 'error')
                  AND created_at < strftime('%Y-%m-%dT%H:%M:%S',
                        datetime('now', ? || ' days'))
                """,
                (f"-{older_than_days}",),
            )
            await db.commit()
            deleted = cursor.rowcount
        if deleted:
            logger.info("TaskStore cleanup: removed %d tasks older than %d days", deleted, older_than_days)
        return deleted

    async def _execute(self, sql: str, params: tuple = ()) -> None:
        import aiosqlite  # noqa: PLC0415
        await self._ensure_init()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(sql, params)
            await db.commit()

    async def _fetchone(self, sql: str, params: tuple = ()) -> tuple | None:
        import aiosqlite  # noqa: PLC0415
        await self._ensure_init()
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(sql, params) as cursor:
                return await cursor.fetchone()

    def _run(self, coro):
        """Run an async method from sync context (background tasks call sync methods)."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(coro)
            else:
                loop.run_until_complete(coro)
        except RuntimeError:
            asyncio.run(coro)

    # ── Public sync interface (mirrors MemoryTaskStore) ───────────────────────

    def create(self, task_id: str) -> TaskStatus:
        self._run(self._execute(
            "INSERT OR IGNORE INTO tasks (task_id, status) VALUES (?, 'pending')",
            (task_id,),
        ))
        return TaskStatus(task_id=task_id, status="pending")

    def get(self, task_id: str) -> TaskStatus | None:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Can't block — schedule and return None (caller should await)
                future = asyncio.ensure_future(self._async_get(task_id))
                return None  # polling will pick it up shortly
            return loop.run_until_complete(self._async_get(task_id))
        except RuntimeError:
            return asyncio.run(self._async_get(task_id))

    async def _async_get(self, task_id: str) -> TaskStatus | None:
        row = await self._fetchone(
            "SELECT task_id, status, progress, stage, sub_progress, sub_total, sub_stage, result, error FROM tasks WHERE task_id = ?",
            (task_id,),
        )
        if row is None:
            return None
        return TaskStatus(
            task_id=row[0],
            status=row[1],
            progress=row[2],
            stage=row[3],
            sub_progress=row[4],
            sub_total=row[5],
            sub_stage=row[6],
            result=json.loads(row[7]) if row[7] else None,
            error=row[8],
        )

    def set_awaiting_review(self, task_id: str, book_id: str) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'awaiting_review', stage = '章節審閱', result = ? WHERE task_id = ?",
            (json.dumps({"bookId": book_id}), task_id),
        ))

    def set_running(self, task_id: str) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'running' WHERE task_id = ?", (task_id,)
        ))

    def set_completed(self, task_id: str, result: Any) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'done', progress = 100, stage = '完成', result = ? WHERE task_id = ?",
            (json.dumps(result), task_id),
        ))

    def set_failed(self, task_id: str, error: str) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'error', stage = '失败', error = ? WHERE task_id = ?",
            (error, task_id),
        ))

    def set_progress(
        self,
        task_id: str,
        progress: int,
        stage: str,
        *,
        sub_progress: int | None = None,
        sub_total: int | None = None,
        sub_stage: str | None = None,
    ) -> None:
        self._run(self._execute(
            "UPDATE tasks SET progress = ?, stage = ?, sub_progress = ?, sub_total = ?, sub_stage = ? WHERE task_id = ?",
            (progress, stage, sub_progress, sub_total, sub_stage, task_id),
        ))

    async def append_murmur(self, task_id: str, event: MurmurEvent) -> None:
        import aiosqlite  # noqa: PLC0415
        await self._ensure_init()
        async with aiosqlite.connect(self._db_path) as db:
            # Atomically assign seq = MAX(seq)+1 within the same transaction
            row = await (await db.execute(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM task_murmur_events WHERE task_id = ?",
                (task_id,),
            )).fetchone()
            seq = row[0] if row else 0
            await db.execute(
                "INSERT INTO task_murmur_events (task_id, seq, step_key, type, content, meta, raw_content) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    task_id,
                    seq,
                    event.step_key,
                    event.type,
                    event.content,
                    json.dumps(event.meta) if event.meta is not None else None,
                    event.raw_content,
                ),
            )
            await db.commit()

    async def get_murmur_events(self, task_id: str, after: int = 0) -> list[MurmurEvent]:
        import aiosqlite  # noqa: PLC0415
        await self._ensure_init()
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT seq, step_key, type, content, meta, raw_content FROM task_murmur_events WHERE task_id = ? AND seq >= ? ORDER BY seq",
                (task_id, after),
            ) as cursor:
                rows = await cursor.fetchall()
        return [
            MurmurEvent(
                seq=row[0],
                step_key=row[1],
                type=row[2],
                content=row[3],
                meta=json.loads(row[4]) if row[4] else None,
                raw_content=row[5],
            )
            for row in rows
        ]

    async def _async_get_task_id_by_book_id(self, book_id: str) -> str | None:
        row = await self._fetchone(
            "SELECT task_id FROM tasks WHERE json_extract(result, '$.bookId') = ? LIMIT 1",
            (book_id,),
        )
        return row[0] if row else None

    def get_task_id_by_book_id(self, book_id: str) -> str | None:
        """Sync interface — prefer the module-level async helper in router code."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                return None  # use async variant
            return loop.run_until_complete(self._async_get_task_id_by_book_id(book_id))
        except RuntimeError:
            return asyncio.run(self._async_get_task_id_by_book_id(book_id))


# ── Async-native GET for router use ──────────────────────────────────────────

async def get_task(task_id: str) -> TaskStatus | None:
    """Async-native task lookup — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_get(task_id)
    return task_store.get(task_id)


async def get_task_id_by_book_id(book_id: str) -> str | None:
    """Async-native book→task lookup — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_get_task_id_by_book_id(book_id)
    return task_store.get_task_id_by_book_id(book_id)


# ── Process-level singleton ───────────────────────────────────────────────────


def _build_store() -> MemoryTaskStore | SQLiteTaskStore:
    try:
        from config.settings import get_settings  # noqa: PLC0415
        settings = get_settings()
        backend = getattr(settings, "task_store_backend", "memory")
    except Exception:
        backend = "memory"
        settings = None

    if backend == "sqlite":
        logger.info("TaskStore: using SQLite backend")
        db_path = getattr(settings, "task_store_db_path", "./data/tasks.db") if settings else "./data/tasks.db"
        return SQLiteTaskStore(db_path=db_path)

    logger.info("TaskStore: using in-memory backend")
    return MemoryTaskStore()


task_store: MemoryTaskStore | SQLiteTaskStore = _build_store()
