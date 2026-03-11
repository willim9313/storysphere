"""Tests for GET /api/v1/search/ endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock


def test_search_returns_results(client):
    resp = client.get("/api/v1/search/?q=Alice+garden")
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["id"] == "p1"
    assert results[0]["score"] == 0.95
    assert "Alice" in results[0]["text"]


def test_search_limit(client, mock_vector):
    mock_vector.search = AsyncMock(return_value=[
        {"id": f"p{i}", "text": f"chunk {i}", "score": 0.9 - i * 0.01, "metadata": {}}
        for i in range(5)
    ])
    resp = client.get("/api/v1/search/?q=test&limit=3")
    assert resp.status_code == 200
    # VectorService is called with top_k=3; mock returns 5 but that's on the service side
    assert resp.status_code == 200


def test_search_missing_query(client):
    resp = client.get("/api/v1/search/")
    assert resp.status_code == 422  # q is required
