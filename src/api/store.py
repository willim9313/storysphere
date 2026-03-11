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

from api.schemas.common import TaskStatus

logger = logging.getLogger(__name__)


# ── In-memory backend ─────────────────────────────────────────────────────────


class MemoryTaskStore:
    """Thread-safe in-memory store. Suitable for single-process / dev."""

    def __init__(self) -> None:
        self._store: dict[str, TaskStatus] = {}
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

    def set_completed(self, task_id: str, result: Any) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "completed", "result": result}
                )

    def set_failed(self, task_id: str, error: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "failed", "error": error}
                )


# ── SQLite backend ────────────────────────────────────────────────────────────

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS tasks (
    task_id   TEXT PRIMARY KEY,
    status    TEXT NOT NULL DEFAULT 'pending',
    result    TEXT,
    error     TEXT
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
                await db.commit()
            self._initialised = True

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
            "SELECT task_id, status, result, error FROM tasks WHERE task_id = ?",
            (task_id,),
        )
        if row is None:
            return None
        return TaskStatus(
            task_id=row[0],
            status=row[1],
            result=json.loads(row[2]) if row[2] else None,
            error=row[3],
        )

    def set_running(self, task_id: str) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'running' WHERE task_id = ?", (task_id,)
        ))

    def set_completed(self, task_id: str, result: Any) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'completed', result = ? WHERE task_id = ?",
            (json.dumps(result), task_id),
        ))

    def set_failed(self, task_id: str, error: str) -> None:
        self._run(self._execute(
            "UPDATE tasks SET status = 'failed', error = ? WHERE task_id = ?",
            (error, task_id),
        ))


# ── Async-native GET for router use ──────────────────────────────────────────

async def get_task(task_id: str) -> TaskStatus | None:
    """Async-native task lookup — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_get(task_id)
    return task_store.get(task_id)


# ── Process-level singleton ───────────────────────────────────────────────────


def _build_store() -> MemoryTaskStore | SQLiteTaskStore:
    try:
        from config.settings import get_settings  # noqa: PLC0415
        settings = get_settings()
        backend = getattr(settings, "task_store_backend", "memory")
    except Exception:
        backend = "memory"

    if backend == "sqlite":
        logger.info("TaskStore: using SQLite backend")
        try:
            from config.settings import get_settings  # noqa: PLC0415
            db_path = getattr(get_settings(), "task_store_db_path", "./data/tasks.db")
        except Exception:
            db_path = "./data/tasks.db"
        return SQLiteTaskStore(db_path=db_path)

    logger.info("TaskStore: using in-memory backend")
    return MemoryTaskStore()


task_store: MemoryTaskStore | SQLiteTaskStore = _build_store()
