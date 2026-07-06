"""Tests for POST /books/:bookId/suggest-roles ("邊界輔助辨識").

The suggester's LLM call is patched out — these cover the endpoint's guards
(awaiting_review / book existence / LLM unavailable) and response shaping.
"""

from __future__ import annotations

import sys
import uuid
from unittest.mock import AsyncMock, patch

sys.path.insert(0, "src")


def _setup_awaiting(book_id: str) -> str:
    from storysphere.api.store import task_store
    task_id = f"test-{uuid.uuid4()}"
    task_store.create(task_id)
    task_store.set_awaiting_review(task_id, book_id)
    return task_id


def _awaiting_doc(mock_doc) -> str:
    """Register a fresh awaiting-review book with a unique id (avoids task_store
    pollution on shared ids) and point mock_doc at a minimal Document for it."""
    from storysphere.domain.documents import Document, FileType

    book_id = f"sr-book-{uuid.uuid4()}"
    doc = Document(id=book_id, title="T", file_path="/tmp/t.txt", file_type=FileType.TXT)
    prev = mock_doc.get_document.side_effect

    def _get(did):
        return doc if did == book_id else (prev(did) if callable(prev) else None)

    mock_doc.get_document.side_effect = _get
    _setup_awaiting(book_id)
    return book_id


class TestSuggestRolesEndpoint:
    def test_returns_409_when_not_waiting(self, client):
        resp = client.post("/api/v1/books/no-task-book/suggest-roles")
        assert resp.status_code == 409

    def test_returns_404_when_book_not_found(self, client):
        # Awaiting review is set, but no Document exists for the id → 404.
        book_id = f"sr-missing-{uuid.uuid4()}"
        _setup_awaiting(book_id)
        resp = client.post(f"/api/v1/books/{book_id}/suggest-roles")
        assert resp.status_code == 404

    def test_returns_boundaries_when_waiting(self, client, mock_doc):
        from storysphere.services.chapter_role_suggester import BoundaryResult

        book_id = _awaiting_doc(mock_doc)
        fake = BoundaryResult(
            front_matter_end=None,
            back_matter_start=7,
            front_role=None,
            back_role="other",
        )
        with patch(
            "storysphere.services.chapter_role_suggester.suggest_boundary_roles",
            new=AsyncMock(return_value=fake),
        ):
            resp = client.post(f"/api/v1/books/{book_id}/suggest-roles")

        assert resp.status_code == 200
        data = resp.json()
        assert data["frontMatterEnd"] is None
        assert data["backMatterStart"] == 7
        assert data["backRole"] == "other"

    def test_no_boundaries_returns_200(self, client, mock_doc):
        from storysphere.services.chapter_role_suggester import BoundaryResult

        book_id = _awaiting_doc(mock_doc)
        with patch(
            "storysphere.services.chapter_role_suggester.suggest_boundary_roles",
            new=AsyncMock(return_value=BoundaryResult()),
        ):
            resp = client.post(f"/api/v1/books/{book_id}/suggest-roles")
        assert resp.status_code == 200
        assert resp.json()["backMatterStart"] is None

    def test_returns_503_when_llm_unavailable(self, client, mock_doc):
        book_id = _awaiting_doc(mock_doc)
        with patch(
            "storysphere.services.chapter_role_suggester.suggest_boundary_roles",
            new=AsyncMock(side_effect=RuntimeError("no key")),
        ):
            resp = client.post(f"/api/v1/books/{book_id}/suggest-roles")
        assert resp.status_code == 503
