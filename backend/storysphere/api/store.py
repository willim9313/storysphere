"""Task store for background job status tracking.

Two backends are available, selected via ``Settings.task_store_backend``:

- ``"memory"``: in-process dict, fast but lost on restart / not shared across
  worker processes.
- ``"sqlite"`` (the default): survives restarts and works safely with multiple
  uvicorn workers (each worker opens its own connection but writes to the same
  file via SQLite's serialised WAL mode).

Both backends are **synchronous**, and deliberately so.  The SQLite one used
to wrap an async implementation (``aiosqlite`` behind ``_run()``), which meant
that under a running event loop — i.e. always, under uvicorn — writes became
fire-and-forget and ``get()`` returned ``None`` unconditionally.  A single-row
operation on a local SQLite file takes tens of microseconds, so doing it
inline costs less than the machinery needed to avoid it; that is the same
trade ``MemoryTaskStore`` makes with its ``threading.Lock``.

The ``_async_*`` methods and the module-level ``get_task`` / ``list_tasks``
helpers are kept as thin awaitable wrappers so router code reads naturally,
not because anything underneath needs awaiting.

Usage::

    from storysphere.api.store import task_store          # process-level singleton
    task_store.create("task-id")
    task_store.set_running("task-id")
    task_store.set_completed("task-id", result={...})
    task = task_store.get("task-id")          # TaskStatus | None
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from storysphere.api.schemas.common import MurmurEvent, TaskStatus

logger = logging.getLogger(__name__)


# ── In-memory backend ─────────────────────────────────────────────────────────


class MemoryTaskStore:
    """Thread-safe in-memory store. Suitable for single-process / dev."""

    def __init__(self) -> None:
        self._store: dict[str, TaskStatus] = {}
        self._murmur: dict[str, list[MurmurEvent]] = {}
        self._lock = threading.Lock()

    def create(
        self,
        task_id: str,
        *,
        kind: str | None = None,
        title: str | None = None,
    ) -> TaskStatus:
        task = TaskStatus(
            task_id=task_id,
            status="pending",
            kind=kind,
            title=title,
            created_at=datetime.now().isoformat(),
        )
        with self._lock:
            self._store[task_id] = task
        return task

    def list(self, *, recent_limit: int = 20) -> list[TaskStatus]:
        """Return all non-terminal tasks + the most recent terminal tasks.

        Ordered newest-first by ``created_at``. Never carries murmur_events.
        """
        terminal = {"done", "error"}
        with self._lock:
            # Insertion order reversed → newest-first; stable sort keeps that
            # order for equal created_at timestamps.
            tasks = list(reversed(list(self._store.values())))
        tasks.sort(key=lambda t: t.created_at or "", reverse=True)
        active = [t for t in tasks if t.status not in terminal]
        recent = [t for t in tasks if t.status in terminal][:recent_limit]
        return active + recent

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
                    update={"status": "error", "error": error, "stage": "失敗"}
                )

    def set_progress(
        self,
        task_id: str,
        progress: int,
        stage: str,
        *,
        step_key: str | None = None,
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
                        "step_key": step_key,
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
        """The book's most recent task, or None.

        Reverse insertion order rather than forward: a book processed more than
        once has several tasks pointing at it, and both callers are asking a
        present-tense question ("is it awaiting review *now*", "is ingestion
        *still* running"), so the newest is the only useful answer.  Insertion
        order tracks ``created_at``, which :meth:`create` stamps at insert.
        """
        with self._lock:
            items = list(self._store.items())
        for task_id, status in reversed(items):
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
_ADD_KIND = "ALTER TABLE tasks ADD COLUMN kind TEXT"
_ADD_TITLE = "ALTER TABLE tasks ADD COLUMN title TEXT"
_ADD_STEP_KEY = "ALTER TABLE tasks ADD COLUMN step_key TEXT"

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
    """SQLite-backed store. Works across multiple uvicorn workers."""

    def __init__(self, db_path: str = "./var/tasks.db") -> None:
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialised = False
        self._init_lock = threading.Lock()

    def _connect(self):
        import sqlite3  # noqa: PLC0415

        return sqlite3.connect(self._db_path)

    def _ensure_init(self) -> None:
        if self._initialised:
            return
        with self._init_lock:
            if self._initialised:
                return
            with self._connect() as db:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute(_CREATE_TABLE)
                db.execute(_CREATE_MURMUR_TABLE)
                # Migrate existing DBs that predate a column.
                for migration in (
                    _ADD_CREATED_AT,
                    _ADD_SUB_PROGRESS,
                    _ADD_SUB_TOTAL,
                    _ADD_SUB_STAGE,
                    _ADD_KIND,
                    _ADD_TITLE,
                    _ADD_STEP_KEY,
                ):
                    try:
                        db.execute(migration)
                    except Exception:
                        pass  # column already exists
                db.commit()
            self._initialised = True

    async def cleanup(self, older_than_days: int = 30) -> int:
        """Delete completed/failed tasks older than *older_than_days*.

        Returns the number of rows deleted.
        """
        self._ensure_init()
        with self._connect() as db:
            # Cascade delete murmur events for old tasks in the same transaction
            db.execute(
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
            cursor = db.execute(
                """
                DELETE FROM tasks
                WHERE status IN ('done', 'error')
                  AND created_at < strftime('%Y-%m-%dT%H:%M:%S',
                        datetime('now', ? || ' days'))
                """,
                (f"-{older_than_days}",),
            )
            db.commit()
            deleted = cursor.rowcount
        if deleted:
            logger.info("TaskStore cleanup: removed %d tasks older than %d days", deleted, older_than_days)
        return deleted

    def _execute(self, sql: str, params: tuple = ()) -> None:
        self._ensure_init()
        with self._connect() as db:
            db.execute(sql, params)
            db.commit()

    def _fetchone(self, sql: str, params: tuple = ()) -> tuple | None:
        self._ensure_init()
        with self._connect() as db:
            return db.execute(sql, params).fetchone()

    def _fetchall(self, sql: str, params: tuple = ()) -> list[tuple]:
        self._ensure_init()
        with self._connect() as db:
            return db.execute(sql, params).fetchall()

    # ── Public sync interface (mirrors MemoryTaskStore) ───────────────────────

    def create(
        self,
        task_id: str,
        *,
        kind: str | None = None,
        title: str | None = None,
    ) -> TaskStatus:
        self._execute(
            "INSERT OR IGNORE INTO tasks (task_id, status, kind, title) "
            "VALUES (?, 'pending', ?, ?)",
            (task_id, kind, title),
        )
        return TaskStatus(
            task_id=task_id, status="pending", kind=kind, title=title
        )

    def get(self, task_id: str) -> TaskStatus | None:
        row = self._fetchone(
            f"SELECT {self._SELECT_COLS} FROM tasks WHERE task_id = ?",
            (task_id,),
        )
        return self._row_to_task(row) if row else None

    _SELECT_COLS = (
        "task_id, status, progress, stage, sub_progress, sub_total, "
        "sub_stage, result, error, kind, title, created_at, step_key"
    )

    @staticmethod
    def _row_to_task(row: tuple) -> TaskStatus:
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
            kind=row[9],
            title=row[10],
            created_at=row[11],
            step_key=row[12],
        )

    async def _async_get(self, task_id: str) -> TaskStatus | None:
        """Awaitable alias for :meth:`get`, kept for router-side readability."""
        return self.get(task_id)

    async def _async_list(self, *, recent_limit: int = 20) -> list[TaskStatus]:
        """Awaitable alias for :meth:`list`, kept for router-side readability."""
        return self.list(recent_limit=recent_limit)

    def list(self, *, recent_limit: int = 20) -> list[TaskStatus]:
        """All non-terminal tasks + recent terminal tasks, newest-first."""
        active = self._fetchall(
            f"SELECT {self._SELECT_COLS} FROM tasks "
            "WHERE status NOT IN ('done', 'error') "
            "ORDER BY created_at DESC, rowid DESC"
        )
        recent = self._fetchall(
            f"SELECT {self._SELECT_COLS} FROM tasks "
            "WHERE status IN ('done', 'error') "
            "ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (recent_limit,),
        )
        return [self._row_to_task(r) for r in active] + [
            self._row_to_task(r) for r in recent
        ]

    def set_awaiting_review(self, task_id: str, book_id: str) -> None:
        self._execute(
            "UPDATE tasks SET status = 'awaiting_review', stage = '章節審閱', result = ? WHERE task_id = ?",
            (json.dumps({"bookId": book_id}), task_id),
        )

    def set_running(self, task_id: str) -> None:
        self._execute(
            "UPDATE tasks SET status = 'running' WHERE task_id = ?", (task_id,)
        )

    def set_completed(self, task_id: str, result: Any) -> None:
        self._execute(
            "UPDATE tasks SET status = 'done', progress = 100, stage = '完成', result = ? WHERE task_id = ?",
            (json.dumps(result), task_id),
        )

    def set_failed(self, task_id: str, error: str) -> None:
        self._execute(
            "UPDATE tasks SET status = 'error', stage = '失敗', error = ? WHERE task_id = ?",
            (error, task_id),
        )

    def set_progress(
        self,
        task_id: str,
        progress: int,
        stage: str,
        *,
        step_key: str | None = None,
        sub_progress: int | None = None,
        sub_total: int | None = None,
        sub_stage: str | None = None,
    ) -> None:
        self._execute(
            "UPDATE tasks SET progress = ?, stage = ?, step_key = ?, sub_progress = ?, sub_total = ?, sub_stage = ? WHERE task_id = ?",
            (progress, stage, step_key, sub_progress, sub_total, sub_stage, task_id),
        )

    async def append_murmur(self, task_id: str, event: MurmurEvent) -> None:
        self._ensure_init()
        with self._connect() as db:
            # Atomically assign seq = MAX(seq)+1 within the same transaction
            row = db.execute(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM task_murmur_events WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            seq = row[0] if row else 0
            db.execute(
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
            db.commit()

    async def get_murmur_events(self, task_id: str, after: int = 0) -> list[MurmurEvent]:
        rows = self._fetchall(
            "SELECT seq, step_key, type, content, meta, raw_content FROM task_murmur_events WHERE task_id = ? AND seq >= ? ORDER BY seq",
            (task_id, after),
        )
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
        """Awaitable alias for :meth:`get_task_id_by_book_id`."""
        return self.get_task_id_by_book_id(book_id)

    def get_task_id_by_book_id(self, book_id: str) -> str | None:
        """The book's most recent task, or None.

        ``LIMIT 1`` without ``ORDER BY`` left this to whichever row SQLite
        reached first — in practice the oldest, which is the one answer both
        callers must not get (see :meth:`MemoryTaskStore.get_task_id_by_book_id`).
        ``created_at`` has second precision here, so ``rowid`` breaks ties for
        tasks created within the same second; that is the ordering
        :meth:`list` already uses.
        """
        row = self._fetchone(
            "SELECT task_id FROM tasks WHERE json_extract(result, '$.bookId') = ? "
            "ORDER BY created_at DESC, rowid DESC LIMIT 1",
            (book_id,),
        )
        return row[0] if row else None


# ── Async-native GET for router use ──────────────────────────────────────────

async def get_task(task_id: str) -> TaskStatus | None:
    """Async-native task lookup — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_get(task_id)
    return task_store.get(task_id)


async def list_tasks(*, recent_limit: int = 20) -> list[TaskStatus]:
    """Async-native task listing — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_list(recent_limit=recent_limit)
    return task_store.list(recent_limit=recent_limit)


async def get_task_id_by_book_id(book_id: str) -> str | None:
    """Async-native book→task lookup — use this in router handlers."""
    if isinstance(task_store, SQLiteTaskStore):
        return await task_store._async_get_task_id_by_book_id(book_id)
    return task_store.get_task_id_by_book_id(book_id)


async def set_task_running(task_id: str) -> None:
    """Awaitable ``set_running`` for router handlers.

    Used to bypass the fire-and-forget sync path so the write landed before the
    HTTP response went out.  Writes are synchronous on both backends now, so
    that guarantee holds everywhere and this is a plain alias — kept so the
    call sites stay untouched.
    """
    task_store.set_running(task_id)


async def set_task_failed(task_id: str, error: str) -> None:
    """Awaitable ``set_failed`` for router handlers. See :func:`set_task_running`."""
    task_store.set_failed(task_id, error)


# ── Process-level singleton ───────────────────────────────────────────────────


def _build_store() -> MemoryTaskStore | SQLiteTaskStore:
    try:
        from storysphere.config.settings import get_settings  # noqa: PLC0415
        settings = get_settings()
        backend = getattr(settings, "task_store_backend", "memory")
    except Exception:
        backend = "memory"
        settings = None

    if backend == "sqlite":
        logger.info("TaskStore: using SQLite backend")
        db_path = getattr(settings, "task_store_db_path", "./var/tasks.db") if settings else "./var/tasks.db"
        return SQLiteTaskStore(db_path=db_path)

    logger.info("TaskStore: using in-memory backend")
    return MemoryTaskStore()


task_store: MemoryTaskStore | SQLiteTaskStore = _build_store()
