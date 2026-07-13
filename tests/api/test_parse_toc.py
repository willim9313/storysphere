"""Tests for POST /books/:bookId/parse-toc (目錄對照提示).

Coverage:
  - 409 when the book is not awaiting review
  - 404 when the book is not found
  - happy path: parsed entries returned, camelCase isBody surfaced
  - empty entries when there is no toc chapter (no LLM call)
  - 503 when the LLM provider is unavailable
"""

from __future__ import annotations

import sys
import uuid
from unittest.mock import AsyncMock, patch

sys.path.insert(0, "src")


def _setup_awaiting(book_id: str) -> str:
    from storysphere.api.store import task_store

    task_id = f"test-toc-{uuid.uuid4()}"
    task_store.create(task_id)
    task_store.set_awaiting_review(task_id, book_id)
    return task_id


def _toc_doc(doc_id: str):
    from storysphere.domain.documents import Chapter, ChapterRole, Document, FileType, Paragraph

    return Document(
        id=doc_id,
        title="T",
        file_path="/tmp/t.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                role=ChapterRole.toc,
                paragraphs=[Paragraph(id="t0", text="目錄 第一章 …… 15", chapter_number=1, position=0)],
            ),
        ],
    )


class TestParseTocEndpoint:
    def test_returns_409_when_not_waiting(self, client):
        resp = client.post("/api/v1/books/no-task-book/parse-toc")
        assert resp.status_code == 409

    def test_returns_404_when_book_not_found(self, client):
        _setup_awaiting("toc-missing-book")
        resp = client.post("/api/v1/books/toc-missing-book/parse-toc")
        assert resp.status_code == 404

    def test_happy_path_returns_entries(self, client, mock_doc):
        from storysphere.services.toc_parser import TocEntry

        doc_id = f"doc-toc-{uuid.uuid4()}"
        doc = _toc_doc(doc_id)

        async def _get_doc(did):
            return doc if did == doc_id else None

        mock_doc.get_document.side_effect = _get_doc
        _setup_awaiting(doc_id)

        entries = [
            TocEntry(title="第一章 開端", page=15, level=0, is_body=True),
            TocEntry(title="跋", page=86, level=0, is_body=False),
        ]
        with patch(
            "storysphere.services.toc_parser.parse_toc_entries",
            new=AsyncMock(return_value=entries),
        ):
            resp = client.post(f"/api/v1/books/{doc_id}/parse-toc")

        assert resp.status_code == 200
        data = resp.json()
        assert [e["title"] for e in data["entries"]] == ["第一章 開端", "跋"]
        assert data["entries"][0]["isBody"] is True
        assert data["entries"][1]["isBody"] is False
        assert data["entries"][0]["page"] == 15

    def test_empty_entries_when_no_toc_chapter(self, client, mock_doc):
        """A book with no toc chapter parses to [] without invoking the LLM."""
        from storysphere.domain.documents import Chapter, ChapterRole, Document, FileType, Paragraph

        doc_id = f"doc-notoc-{uuid.uuid4()}"
        doc = Document(
            id=doc_id,
            title="T",
            file_path="/tmp/t.pdf",
            file_type=FileType.PDF,
            chapters=[
                Chapter(
                    number=1,
                    role=ChapterRole.body,
                    paragraphs=[Paragraph(id="b0", text="正文。", chapter_number=1, position=0)],
                ),
            ],
        )

        async def _get_doc(did):
            return doc if did == doc_id else None

        mock_doc.get_document.side_effect = _get_doc
        _setup_awaiting(doc_id)

        resp = client.post(f"/api/v1/books/{doc_id}/parse-toc")
        assert resp.status_code == 200
        assert resp.json()["entries"] == []

    def test_returns_503_when_llm_unavailable(self, client, mock_doc):
        doc_id = f"doc-toc503-{uuid.uuid4()}"
        doc = _toc_doc(doc_id)

        async def _get_doc(did):
            return doc if did == doc_id else None

        mock_doc.get_document.side_effect = _get_doc
        _setup_awaiting(doc_id)

        with patch(
            "storysphere.services.toc_parser.parse_toc_entries",
            new=AsyncMock(side_effect=RuntimeError("no LLM configured")),
        ):
            resp = client.post(f"/api/v1/books/{doc_id}/parse-toc")
        assert resp.status_code == 503
