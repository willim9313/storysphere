"""Tests for SQLiteTaskStore under the condition production actually runs in.

Every test here is an ``async def``.  That is the whole point.

The three existing SQLite store test files (``test_task_store_list.py``,
``test_murmur.py``, ``test_chapter_review.py``) are synchronous and drive the
store with ``asyncio.run(...)``, which means:

  * writes take the "no running loop" branch and complete synchronously
  * reads call the private ``_async_get`` directly, bypassing ``get()``

Neither is what happens under uvicorn, where a loop is always running.  This
file covers that gap: a store used from inside a running event loop must
still write what it was told and read back what it wrote.
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def store(tmp_path):
    from storysphere.api.store import SQLiteTaskStore

    return SQLiteTaskStore(str(tmp_path / "tasks.db"))


class TestReadBack:
    async def test_created_task_is_readable(self, store):
        store.create("t1", kind="tension", title="張力線分組")

        task = store.get("t1")
        assert task is not None, "get() returned None while an event loop is running"
        assert task.kind == "tension"
        assert task.title == "張力線分組"

    async def test_unknown_task_is_none(self, store):
        assert store.get("no-such-task") is None

    async def test_listing_includes_the_task(self, store):
        store.create("t1")

        assert [t.task_id for t in store.list()] == ["t1"]


class TestWritesLand:
    async def test_set_running_lands(self, store):
        store.create("t1")
        store.set_running("t1")

        assert store.get("t1").status == "running"

    async def test_set_completed_lands_with_its_result(self, store):
        store.create("t1")
        store.set_completed("t1", result={"bookId": "book-1"})

        task = store.get("t1")
        assert task.status == "done"
        assert task.result == {"bookId": "book-1"}
        assert task.progress == 100

    async def test_set_failed_lands_with_its_message(self, store):
        store.create("t1")
        store.set_failed("t1", error="配額用盡")

        task = store.get("t1")
        assert task.status == "error"
        assert task.error == "配額用盡"

    async def test_set_progress_lands_with_item_counts(self, store):
        store.create("t1")
        store.set_progress("t1", 50, "分析事件 5/10", sub_progress=5, sub_total=10)

        task = store.get("t1")
        assert task.progress == 50
        assert task.stage == "分析事件 5/10"
        assert task.sub_progress == 5
        assert task.sub_total == 10

    async def test_awaiting_review_lands(self, store):
        store.create("t1")
        store.set_awaiting_review("t1", "book-1")

        task = store.get("t1")
        assert task.status == "awaiting_review"
        assert task.result == {"bookId": "book-1"}


class TestOrdering:
    async def test_consecutive_writes_apply_in_order(self, store):
        """Fire-and-forget writes have no ordering guarantee between them."""
        store.create("t1")
        store.set_running("t1")
        store.set_progress("t1", 30, "抽取實體")
        store.set_completed("t1", result={"ok": True})

        task = store.get("t1")
        assert task.status == "done"
        assert task.result == {"ok": True}

    async def test_write_is_visible_to_the_very_next_read(self, store):
        """No yielding to the loop in between — the endpoint pattern."""
        store.create("t1")
        store.set_running("t1")
        assert store.get("t1").status == "running"
        store.set_failed("t1", error="boom")
        assert store.get("t1").status == "error"


class TestBookLookup:
    async def test_finds_the_task_that_owns_a_book(self, store):
        store.create("t1")
        store.set_completed("t1", result={"bookId": "book-42"})

        assert store.get_task_id_by_book_id("book-42") == "t1"

    async def test_unknown_book_is_none(self, store):
        assert store.get_task_id_by_book_id("no-such-book") is None


class TestAsyncCallersStillWork:
    """The router-facing helpers must keep behaving as they do today."""

    async def test_async_get_matches_sync_get(self, store):
        store.create("t1", kind="symbol")
        store.set_running("t1")

        via_async = await store._async_get("t1")
        assert via_async.status == "running"
        assert via_async.kind == "symbol"

    async def test_murmur_round_trips(self, store):
        from storysphere.api.schemas.common import MurmurEvent

        def _ev(content: str) -> MurmurEvent:
            return MurmurEvent(
                seq=0, step_key="knowledgeGraph", type="character", content=content
            )

        store.create("t1")
        await store.append_murmur("t1", _ev("a"))
        await store.append_murmur("t1", _ev("b"))

        events = await store.get_murmur_events("t1")
        assert [e.content for e in events] == ["a", "b"]
        assert [e.seq for e in events] == [0, 1]


class TestConcurrentUse:
    async def test_parallel_writers_all_land(self, store):
        """Batch runners report progress from several coroutines at once."""
        for i in range(10):
            store.create(f"t{i}")

        async def _write(i: int) -> None:
            store.set_completed(f"t{i}", result={"i": i})

        await asyncio.gather(*(_write(i) for i in range(10)))

        for i in range(10):
            task = store.get(f"t{i}")
            assert task.status == "done"
            assert task.result == {"i": i}
