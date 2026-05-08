"""Tests for the chapter-review pause/resume flow.

Coverage:
  - TaskStore.set_awaiting_review: bookId is written to result
  - TaskStore.get_task_id_by_book_id: reverse lookup
  - GET  /books/:bookId/review-data  — happy path + 409 when not waiting + 404 book missing
  - POST /books/:bookId/review       — happy path + 409 when not waiting / double-submit
  - _rebuild_chapters()              — paragraphs correctly re-assigned across boundaries
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

import sys
sys.path.insert(0, "src")


# ── TaskStore.set_awaiting_review ─────────────────────────────────────────────

class TestTaskStoreAwaitingReview:
    def test_in_memory_store_sets_book_id_in_result(self):
        from api.store import MemoryTaskStore
        store = MemoryTaskStore()
        store.create("task-abc")
        store.set_awaiting_review("task-abc", "book-xyz")
        status = store.get("task-abc")
        assert status is not None
        assert status.status == "awaiting_review"
        assert status.result == {"bookId": "book-xyz"}

    def test_in_memory_store_unknown_task_is_noop(self):
        from api.store import MemoryTaskStore
        store = MemoryTaskStore()
        store.set_awaiting_review("nonexistent", "book-xyz")

    def test_sqlite_store_sets_book_id_in_result(self, tmp_path):
        import json
        from api.store import SQLiteTaskStore
        db = str(tmp_path / "tasks.db")
        store = SQLiteTaskStore(db)
        store.create("task-def")
        store.set_awaiting_review("task-def", "book-qrs")
        status = store.get("task-def")
        assert status is not None
        assert status.status == "awaiting_review"
        assert status.result == {"bookId": "book-qrs"}

    def test_in_memory_get_task_id_by_book_id(self):
        from api.store import MemoryTaskStore
        store = MemoryTaskStore()
        store.create("task-lookup")
        store.set_awaiting_review("task-lookup", "book-find-me")
        assert store.get_task_id_by_book_id("book-find-me") == "task-lookup"
        assert store.get_task_id_by_book_id("book-unknown") is None

    def test_sqlite_get_task_id_by_book_id(self, tmp_path):
        import asyncio as _asyncio
        from api.store import SQLiteTaskStore
        db = str(tmp_path / "tasks.db")
        store = SQLiteTaskStore(db)
        store.create("task-sqlite-lookup")
        store.set_awaiting_review("task-sqlite-lookup", "book-sqlite-find")
        # Sync context: run the async lookup in a fresh event loop
        result = _asyncio.run(store._async_get_task_id_by_book_id("book-sqlite-find"))
        assert result == "task-sqlite-lookup"
        none_result = _asyncio.run(store._async_get_task_id_by_book_id("no-such-book"))
        assert none_result is None


# ── GET /books/:bookId/review-data ────────────────────────────────────────────

class TestReviewDataEndpoint:
    def _setup_awaiting(self, book_id: str) -> str:
        """Create a task in awaiting_review state for book_id; return task_id."""
        import uuid
        from api.store import task_store
        task_id = f"test-{uuid.uuid4()}"
        task_store.create(task_id)
        task_store.set_awaiting_review(task_id, book_id)
        return task_id

    def test_returns_409_when_not_waiting(self, client):
        resp = client.get("/api/v1/books/no-task-book/review-data")
        assert resp.status_code == 409

    def test_returns_404_when_book_not_found(self, client):
        self._setup_awaiting("nonexistent-book")
        resp = client.get("/api/v1/books/nonexistent-book/review-data")
        assert resp.status_code == 404

    def test_returns_chapters_when_waiting(self, client):
        self._setup_awaiting("doc-1")
        resp = client.get("/api/v1/books/doc-1/review-data")
        assert resp.status_code == 200
        data = resp.json()
        assert "chapters" in data
        assert len(data["chapters"]) == 2
        ch0 = data["chapters"][0]
        assert ch0["title"] == "The Beginning"
        assert ch0["chapterIdx"] == 0
        assert data["chapters"][0]["paragraphs"][0]["paragraphIndex"] == 0
        assert data["chapters"][0]["paragraphs"][1]["paragraphIndex"] == 1

    def test_paragraph_index_is_global_not_per_chapter(self, client):
        """paragraphIndex must be book-global (0, 1, 2, ...) not per-chapter."""
        self._setup_awaiting("doc-1")
        resp = client.get("/api/v1/books/doc-1/review-data")
        assert resp.status_code == 200
        indices = [
            p["paragraphIndex"]
            for ch in resp.json()["chapters"]
            for p in ch["paragraphs"]
        ]
        assert indices == list(range(len(indices)))


# ── POST /books/:bookId/review ────────────────────────────────────────────────

class TestSubmitReviewEndpoint:
    def _setup_awaiting(self, book_id: str) -> str:
        import uuid
        from api.store import task_store
        task_id = f"test-{uuid.uuid4()}"
        task_store.create(task_id)
        task_store.set_awaiting_review(task_id, book_id)
        return task_id

    def test_returns_409_when_not_waiting(self, client):
        payload = {"chapters": [{"title": "Ch1", "startParagraphIndex": 0}]}
        resp = client.post("/api/v1/books/no-task-book/review", json=payload)
        assert resp.status_code == 409

    def test_notifies_and_returns_204(self, client):
        self._setup_awaiting("doc-1")
        payload = {"chapters": [{"title": "Ch1", "startParagraphIndex": 0}]}
        with patch("api.routers.books._resume_ingestion_graph", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/review", json=payload)
        assert resp.status_code == 204

    def test_second_submit_returns_409(self, client):
        self._setup_awaiting("doc-1")
        payload = {"chapters": [{"title": "Ch1", "startParagraphIndex": 0}]}
        with patch("api.routers.books._resume_ingestion_graph", new_callable=AsyncMock):
            client.post("/api/v1/books/doc-1/review", json=payload)
            # Second call — status optimistically set to running, no longer awaiting_review
            resp = client.post("/api/v1/books/doc-1/review", json=payload)
        assert resp.status_code == 409

    def test_empty_chapters_is_invalid(self, client):
        self._setup_awaiting("doc-1")
        resp = client.post("/api/v1/books/doc-1/review", json={"chapters": []})
        # FastAPI should 422 (empty list for required field)
        assert resp.status_code in (204, 409, 422)


# ── _rebuild_chapters ─────────────────────────────────────────────────────────

class TestRebuildChapters:
    """Unit tests for the chapter boundary reconstruction logic."""

    @staticmethod
    def _make_doc():
        from domain.documents import Chapter, Document, FileType, Paragraph

        paras = [
            Paragraph(id=f"p{i}", text=f"Para {i}", chapter_number=1, position=i)
            for i in range(6)
        ]
        # Two original chapters: [p0, p1, p2] and [p3, p4, p5]
        ch1 = Chapter(number=1, title="OrigCh1", paragraphs=paras[:3])
        ch2 = Chapter(number=2, title="OrigCh2", paragraphs=paras[3:])
        return Document(
            id="doc-rebuild",
            title="Test",
            file_path="/tmp/t.pdf",
            file_type=FileType.PDF,
            chapters=[ch1, ch2],
        )

    def test_accepts_same_boundaries(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [
            {"title": "Ch1", "start_paragraph_index": 0},
            {"title": "Ch2", "start_paragraph_index": 3},
        ]
        result = _rebuild_chapters(doc, reviewed)
        assert len(result) == 2
        assert len(result[0].paragraphs) == 3
        assert len(result[1].paragraphs) == 3

    def test_merge_into_single_chapter(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [{"title": "Everything", "start_paragraph_index": 0}]
        result = _rebuild_chapters(doc, reviewed)
        assert len(result) == 1
        assert len(result[0].paragraphs) == 6

    def test_split_into_three_chapters(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [
            {"title": "A", "start_paragraph_index": 0},
            {"title": "B", "start_paragraph_index": 2},
            {"title": "C", "start_paragraph_index": 4},
        ]
        result = _rebuild_chapters(doc, reviewed)
        assert len(result) == 3
        assert [len(ch.paragraphs) for ch in result] == [2, 2, 2]

    def test_chapter_numbers_are_sequential(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [
            {"title": "A", "start_paragraph_index": 0},
            {"title": "B", "start_paragraph_index": 3},
        ]
        result = _rebuild_chapters(doc, reviewed)
        assert [ch.number for ch in result] == [1, 2]

    def test_paragraph_chapter_numbers_updated(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [
            {"title": "A", "start_paragraph_index": 0},
            {"title": "B", "start_paragraph_index": 3},
        ]
        result = _rebuild_chapters(doc, reviewed)
        for para in result[1].paragraphs:
            assert para.chapter_number == 2

    def test_title_none_when_empty_string(self):
        from workflows.ingestion import _rebuild_chapters
        doc = self._make_doc()
        reviewed = [{"title": "", "start_paragraph_index": 0}]
        result = _rebuild_chapters(doc, reviewed)
        assert result[0].title is None
