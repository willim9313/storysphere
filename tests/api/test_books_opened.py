"""Tests for POST /api/v1/books/{book_id}/opened and the lastOpenedAt field.

The library's 「最近開啟」 rail reads `lastOpenedAt`; nothing wrote it until the
frontend started calling this endpoint once per book route entry.
"""

from __future__ import annotations

from storysphere.domain.documents import Chapter, Document, FileType
from storysphere.services.query_models import DocumentSummary

_STAMP = "2026-10-01T08:30:00Z"


class TestMarkBookOpened:
    def test_returns_204_and_stamps_the_book(self, client, mock_doc):
        resp = client.post("/api/v1/books/doc-1/opened")
        assert resp.status_code == 204
        assert resp.content == b""
        mock_doc.mark_opened.assert_awaited_once_with("doc-1")

    def test_returns_404_json_for_unknown_book(self, client, mock_doc):
        mock_doc.mark_opened.side_effect = lambda _book_id: False
        resp = client.post("/api/v1/books/no-such-book/opened")
        assert resp.status_code == 404
        assert "no-such-book" in resp.json()["detail"]


class TestLastOpenedAtInResponses:
    def test_list_contains_last_opened_at(self, client, mock_doc):
        mock_doc.list_documents.return_value = [
            DocumentSummary(
                id="doc-1", title="T", file_type="pdf", chapter_count=1, last_opened_at=_STAMP
            ),
            DocumentSummary(id="doc-2", title="U", file_type="pdf", chapter_count=1),
        ]
        items = {b["id"]: b for b in client.get("/api/v1/books/").json()}
        assert items["doc-1"]["lastOpenedAt"] == _STAMP
        assert items["doc-2"]["lastOpenedAt"] is None

    def test_detail_contains_last_opened_at(self, client, mock_doc):
        mock_doc.get_document.side_effect = lambda _id: Document(
            id="doc-1",
            title="T",
            file_path="/tmp/t.pdf",
            file_type=FileType.PDF,
            chapters=[Chapter(number=1, title="c", paragraphs=[])],
            last_opened_at=_STAMP,
        )
        assert client.get("/api/v1/books/doc-1").json()["lastOpenedAt"] == _STAMP

    def test_detail_null_when_never_opened(self, client):
        assert client.get("/api/v1/books/doc-1").json()["lastOpenedAt"] is None
