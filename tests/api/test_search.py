"""Tests for POST /api/v1/search/ endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.services.query_models import VectorSearchResult


def test_search_returns_results(client):
    # mode defaults to "fulltext"; this test exercises the semantic/vector path.
    resp = client.post("/api/v1/search/", json={"query": "Alice garden", "mode": "semantic"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["id"] == "p1"
    assert results[0]["score"] == 0.95
    assert "Alice" in results[0]["text"]


def test_search_limit(client, mock_vector):
    mock_vector.search = AsyncMock(return_value=[
        VectorSearchResult(id=f"p{i}", text=f"chunk {i}", score=0.9 - i * 0.01, document_id="doc-1", chapter_number=1, position=i)
        for i in range(5)
    ])
    resp = client.post("/api/v1/search/", json={"query": "test", "topK": 3})
    assert resp.status_code == 200


def test_search_missing_query(client):
    resp = client.post("/api/v1/search/", json={})
    assert resp.status_code == 422  # query is required


class TestSearchBookErrors:
    def test_fulltext_unknown_book_returns_404(self, client, mock_doc):
        mock_doc.search_paragraphs_by_text = AsyncMock(return_value=[])
        resp = client.post("/api/v1/search/", json={"query": "海", "bookId": "no-such-book"})
        assert resp.status_code == 404

    def test_fulltext_known_book_without_hits_returns_empty(self, client, mock_doc):
        mock_doc.search_paragraphs_by_text = AsyncMock(return_value=[])
        resp = client.post("/api/v1/search/", json={"query": "海", "bookId": "doc-1"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_semantic_unknown_book_returns_404(self, client, mock_vector):
        mock_vector.search = AsyncMock(side_effect=ValueError("Collection not found"))
        resp = client.post(
            "/api/v1/search/", json={"query": "海", "bookId": "no-such-book", "mode": "semantic"}
        )
        assert resp.status_code == 404

    def test_semantic_book_without_index_returns_409(self, client, mock_vector):
        mock_vector.search = AsyncMock(side_effect=ValueError("Collection not found"))
        mock_vector.has_collection = AsyncMock(return_value=False)
        resp = client.post(
            "/api/v1/search/", json={"query": "海", "bookId": "doc-1", "mode": "semantic"}
        )
        assert resp.status_code == 409

    def test_semantic_other_failure_is_reraised(self, client, mock_vector):
        # Book exists and is indexed: the original error propagates (→ 500), not a 404/409.
        mock_vector.search = AsyncMock(side_effect=RuntimeError("embedding failed"))
        mock_vector.has_collection = AsyncMock(return_value=True)
        with pytest.raises(RuntimeError, match="embedding failed"):
            client.post(
                "/api/v1/search/", json={"query": "海", "bookId": "doc-1", "mode": "semantic"}
            )
