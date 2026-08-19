"""``get_task_id_by_book_id`` must return the book's *current* task.

Both call sites ask a present-tense question:

* ``GET /books/:id/review-data`` — "is this book awaiting review **right now**?"
* ``GET /books/`` — "is this book's ingestion **still** active?"

A book processed more than once has several tasks pointing at it, so
answering with a stale one is wrong in both places: the first turns a genuine
review pause into a 409, the second lists an actively-processing book as
settled.

The two backends are tested against the same contract on purpose — they used
to disagree, which is how the ambiguity survived.
"""

from __future__ import annotations

import pytest


@pytest.fixture(params=["memory", "sqlite"])
def store(request, tmp_path):
    from storysphere.api.store import MemoryTaskStore, SQLiteTaskStore

    if request.param == "memory":
        return MemoryTaskStore()
    return SQLiteTaskStore(str(tmp_path / "tasks.db"))


def _task_for(store, task_id: str, book_id: str, status: str) -> None:
    store.create(task_id)
    if status == "done":
        store.set_completed(task_id, result={"bookId": book_id})
    elif status == "error":
        store.set_failed(task_id, error="boom")
        # set_failed does not write a result, so the book link needs seeding
        # the same way a real ingestion would have left it.
        store.set_completed(task_id, result={"bookId": book_id})
        store.set_failed(task_id, error="boom")
    elif status == "awaiting_review":
        store.set_awaiting_review(task_id, book_id)


class TestReturnsTheNewestTask:
    def test_second_run_wins_over_the_first(self, store):
        _task_for(store, "old", "book-1", "done")
        _task_for(store, "new", "book-1", "done")

        assert store.get_task_id_by_book_id("book-1") == "new"

    def test_stale_finished_task_does_not_mask_the_live_one(self, store):
        """The production shape: a book reprocessed after an earlier failure."""
        _task_for(store, "failed-run", "book-1", "error")
        _task_for(store, "current-run", "book-1", "awaiting_review")

        assert store.get_task_id_by_book_id("book-1") == "current-run"

    def test_three_runs_return_the_last(self, store):
        for i in range(3):
            _task_for(store, f"run-{i}", "book-1", "done")

        assert store.get_task_id_by_book_id("book-1") == "run-2"


class TestUnchangedBehaviour:
    def test_single_task_is_still_found(self, store):
        _task_for(store, "only", "book-1", "done")

        assert store.get_task_id_by_book_id("book-1") == "only"

    def test_unknown_book_is_none(self, store):
        _task_for(store, "t1", "book-1", "done")

        assert store.get_task_id_by_book_id("no-such-book") is None

    def test_other_books_are_not_confused(self, store):
        _task_for(store, "a", "book-a", "done")
        _task_for(store, "b", "book-b", "done")

        assert store.get_task_id_by_book_id("book-a") == "a"
        assert store.get_task_id_by_book_id("book-b") == "b"


class TestBothBackendsAgree:
    def test_same_answer_from_either_backend(self, tmp_path):
        from storysphere.api.store import MemoryTaskStore, SQLiteTaskStore

        answers = []
        for backend in (MemoryTaskStore(), SQLiteTaskStore(str(tmp_path / "t.db"))):
            _task_for(backend, "old", "book-1", "done")
            _task_for(backend, "new", "book-1", "done")
            answers.append(backend.get_task_id_by_book_id("book-1"))

        assert answers[0] == answers[1] == "new"
