"""Tests for task_store.list() and create(kind=, title=) — LLM Task Center 子任務 A.

Coverage:
  - create(kind=, title=) round-trips through get()
  - legacy create(task_id) still works (kind/title default None)
  - list() returns all non-terminal tasks + recent N terminal tasks
  - list() orders newest-first and honours recent_limit
  - list() never carries murmur_events
  - both MemoryTaskStore and SQLiteTaskStore honour the same contract
"""

from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, "src")


# ── MemoryTaskStore ──────────────────────────────────────────────────────────


class TestMemoryStoreCreateMetadata:
    def test_create_with_kind_and_title_round_trips(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1", kind="tension", title="第3章 張力分析")

        task = store.get("t1")
        assert task.kind == "tension"
        assert task.title == "第3章 張力分析"

    def test_legacy_create_defaults_metadata_to_none(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")

        task = store.get("t1")
        assert task.kind is None
        assert task.title is None

    def test_create_records_created_at(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")

        assert store.get("t1").created_at is not None


class TestMemoryStoreList:
    def test_includes_active_tasks(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("active-1")
        store.set_running("active-1")

        ids = [t.task_id for t in store.list()]
        assert "active-1" in ids

    def test_includes_recent_terminal_tasks(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("done-1")
        store.set_completed("done-1", result={"ok": True})

        ids = [t.task_id for t in store.list()]
        assert "done-1" in ids

    def test_orders_newest_first(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("older")
        store.create("newer")

        ids = [t.task_id for t in store.list()]
        assert ids.index("newer") < ids.index("older")

    def test_recent_limit_caps_terminal_tasks_only(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        # 5 active tasks (must all appear regardless of limit)
        for i in range(5):
            tid = f"active-{i}"
            store.create(tid)
            store.set_running(tid)
        # 5 terminal tasks (capped by recent_limit)
        for i in range(5):
            tid = f"done-{i}"
            store.create(tid)
            store.set_completed(tid, result=None)

        listed = store.list(recent_limit=2)
        active = [t for t in listed if t.status not in ("done", "error")]
        terminal = [t for t in listed if t.status in ("done", "error")]
        assert len(active) == 5
        assert len(terminal) == 2

    def test_never_carries_murmur_events(self):
        from storysphere.api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")
        store.set_running("t1")

        assert all(t.murmur_events == [] for t in store.list())


# ── SQLiteTaskStore ──────────────────────────────────────────────────────────


class TestSQLiteStoreCreateMetadata:
    def test_create_with_kind_and_title_round_trips(self, tmp_path):
        from storysphere.api.store import SQLiteTaskStore

        store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
        store.create("t1", kind="symbol", title="符號意象生成")

        task = asyncio.run(store._async_get("t1"))
        assert task.kind == "symbol"
        assert task.title == "符號意象生成"

    def test_legacy_create_defaults_metadata_to_none(self, tmp_path):
        from storysphere.api.store import SQLiteTaskStore

        store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
        store.create("t1")

        task = asyncio.run(store._async_get("t1"))
        assert task.kind is None
        assert task.title is None


class TestSQLiteStoreList:
    def test_includes_active_and_recent_terminal(self, tmp_path):
        from storysphere.api.store import SQLiteTaskStore

        store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
        store.create("active-1")
        store.set_running("active-1")
        store.create("done-1")
        store.set_completed("done-1", result={"ok": True})

        ids = [t.task_id for t in asyncio.run(store._async_list())]
        assert "active-1" in ids
        assert "done-1" in ids

    def test_recent_limit_caps_terminal_tasks_only(self, tmp_path):
        from storysphere.api.store import SQLiteTaskStore

        store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
        for i in range(4):
            tid = f"active-{i}"
            store.create(tid)
            store.set_running(tid)
        for i in range(4):
            tid = f"done-{i}"
            store.create(tid)
            store.set_completed(tid, result=None)

        listed = asyncio.run(store._async_list(recent_limit=1))
        active = [t for t in listed if t.status not in ("done", "error")]
        terminal = [t for t in listed if t.status in ("done", "error")]
        assert len(active) == 4
        assert len(terminal) == 1

    def test_never_carries_murmur_events(self, tmp_path):
        from storysphere.api.store import SQLiteTaskStore

        store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
        store.create("t1")
        store.set_running("t1")

        assert all(t.murmur_events == [] for t in asyncio.run(store._async_list()))
