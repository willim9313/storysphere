"""Tests for GET /api/v1/books/ — list_books with active-ingestion filter.

The fix in 9a55af7 filters out books whose ingestion task is still active
(pending / running / awaiting_review). Only books with no task or a settled
task (done / error) appear in the list — the frontend renders active ones
as ProcessingBookCard from sessionStorage instead.
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, "src")

from services.query_models import DocumentSummary  # noqa: E402


def _ds(book_id: str, title: str = "T") -> DocumentSummary:
    return DocumentSummary(id=book_id, title=title, file_type="pdf", chapter_count=1)


@pytest.fixture
def books_client(mock_kg, mock_vector, mock_analysis_agent, mock_chat_agent):
    """TestClient with a doc service that lists multiple books."""
    from api import deps
    from api.main import create_app

    doc_svc = AsyncMock()
    # Five books — caller sets task_store entries as needed
    doc_svc.list_documents = AsyncMock(
        return_value=[
            _ds("book-no-task"),
            _ds("book-done"),
            _ds("book-error"),
            _ds("book-running"),
            _ds("book-awaiting"),
        ]
    )

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: doc_svc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


def _attach_task(book_id: str, status: str) -> str:
    """Attach a task in `status` to `book_id` in the global task_store; return task_id."""
    from api.store import task_store

    task_id = f"task-{uuid4()}"
    task_store.create(task_id)
    if status == "running":
        task_store.set_running(task_id)
    elif status == "done":
        task_store.set_completed(task_id, result={"bookId": book_id})
    elif status == "error":
        task_store.set_failed(task_id, error="boom")
    elif status == "awaiting_review":
        task_store.set_awaiting_review(task_id, book_id)
    elif status == "pending":
        pass  # MemoryTaskStore.create() already leaves it in "pending"

    # For non-awaiting_review states the task_store needs to know the book
    # mapping. set_awaiting_review writes bookId to result; for done/error we
    # also wrote bookId via set_completed / via the lookup table fallback.
    # MemoryTaskStore.get_task_id_by_book_id scans `result.bookId`, so seed it
    # for cases that don't naturally set it.
    if status in ("running", "pending", "error"):
        # Force-write a bookId into the stored task so reverse lookup finds it
        task = task_store.get(task_id)
        if task is not None:
            updated = task.model_copy(update={"result": {"bookId": book_id}})
            with task_store._lock:
                task_store._store[task_id] = updated
    return task_id


class TestListBooksFiltering:
    def test_book_with_no_task_is_included(self, books_client):
        resp = books_client.get("/api/v1/books/")
        assert resp.status_code == 200
        ids = {b["id"] for b in resp.json()}
        assert "book-no-task" in ids

    def test_book_with_done_task_is_included(self, books_client):
        _attach_task("book-done", "done")
        resp = books_client.get("/api/v1/books/")
        ids = {b["id"] for b in resp.json()}
        assert "book-done" in ids

    def test_book_with_error_task_is_included(self, books_client):
        _attach_task("book-error", "error")
        resp = books_client.get("/api/v1/books/")
        ids = {b["id"] for b in resp.json()}
        assert "book-error" in ids

    def test_book_with_running_task_is_excluded(self, books_client):
        _attach_task("book-running", "running")
        resp = books_client.get("/api/v1/books/")
        ids = {b["id"] for b in resp.json()}
        assert "book-running" not in ids

    def test_book_with_awaiting_review_task_is_excluded(self, books_client):
        _attach_task("book-awaiting", "awaiting_review")
        resp = books_client.get("/api/v1/books/")
        ids = {b["id"] for b in resp.json()}
        assert "book-awaiting" not in ids

    def test_full_filter_behavior(self, books_client):
        """Set tasks for every book in one shot, then verify split."""
        _attach_task("book-done", "done")
        _attach_task("book-error", "error")
        _attach_task("book-running", "running")
        _attach_task("book-awaiting", "awaiting_review")

        resp = books_client.get("/api/v1/books/")
        ids = {b["id"] for b in resp.json()}
        assert ids == {"book-no-task", "book-done", "book-error"}
