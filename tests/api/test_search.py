"""Tests for POST /api/v1/search/ endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock

from services.query_models import VectorSearchResult


def test_search_returns_results(client):
    resp = client.post("/api/v1/search/", json={"query": "Alice garden"})
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
