"""Tests for GET /api/v1/token-usage endpoint."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_token_store():
    store = AsyncMock()
    store.get_usage = AsyncMock(return_value={
        "summary": {
            "totalPromptTokens": 1000,
            "totalCompletionTokens": 500,
            "totalTokens": 1500,
            "totalCalls": 10,
        },
        "byService": {
            "chat": {
                "promptTokens": 600,
                "completionTokens": 300,
                "totalTokens": 900,
                "calls": 6,
            },
        },
        "byModel": {
            "gemini-2.0-flash": {
                "promptTokens": 1000,
                "completionTokens": 500,
                "totalTokens": 1500,
                "calls": 10,
            },
        },
    })
    store.get_usage.return_value["byBook"] = [
        {
            "bookId": "book-1",
            "promptTokens": 400,
            "completionTokens": 200,
            "totalTokens": 600,
            "calls": 4,
        },
        {
            "bookId": "book-deleted",
            "promptTokens": 300,
            "completionTokens": 100,
            "totalTokens": 400,
            "calls": 3,
        },
        {
            "bookId": None,
            "promptTokens": 300,
            "completionTokens": 200,
            "totalTokens": 500,
            "calls": 3,
        },
    ]
    store.get_daily_usage = AsyncMock(return_value=[
        {
            "date": "2026-03-21",
            "promptTokens": 1000,
            "completionTokens": 500,
            "totalTokens": 1500,
            "calls": 10,
        },
    ])
    return store


@pytest.fixture
def token_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent, mock_token_store):
    """TestClient with token store mock added."""
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    mock_doc.list_documents.return_value = [
        SimpleNamespace(id="book-1", title="The Tide of Names")
    ]
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_token_store] = lambda: mock_token_store

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


class TestTokenUsageEndpoint:
    def test_default_range(self, token_client):
        resp = token_client.get("/api/v1/token-usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["totalTokens"] == 1500
        assert data["summary"]["totalCalls"] == 10
        assert "byService" in data
        assert "byModel" in data
        assert "daily" in data
        assert len(data["daily"]) == 1

    def test_all_range(self, token_client):
        resp = token_client.get("/api/v1/token-usage?range=all")
        assert resp.status_code == 200

    def test_today_range(self, token_client):
        resp = token_client.get("/api/v1/token-usage?range=today")
        assert resp.status_code == 200

    def test_invalid_range(self, token_client):
        resp = token_client.get("/api/v1/token-usage?range=invalid")
        assert resp.status_code == 422


class TestByBookSection:
    def test_titles_are_joined_in(self, token_client):
        rows = token_client.get("/api/v1/token-usage").json()["byBook"]
        named = next(r for r in rows if r["bookId"] == "book-1")

        assert named["title"] == "The Tide of Names"
        assert named["totalTokens"] == 600

    def test_deleted_book_keeps_its_row_without_a_title(self, token_client):
        """Deleting a book does not un-spend what it cost."""
        rows = token_client.get("/api/v1/token-usage").json()["byBook"]
        gone = next(r for r in rows if r["bookId"] == "book-deleted")

        assert gone["title"] is None
        assert gone["totalTokens"] == 400

    def test_unattributed_row_survives_the_join(self, token_client):
        rows = token_client.get("/api/v1/token-usage").json()["byBook"]
        orphan = [r for r in rows if r["bookId"] is None]

        assert len(orphan) == 1
        assert orphan[0]["title"] is None


class TestBookFilterParam:
    def test_book_id_reaches_both_queries(self, token_client, mock_token_store):
        resp = token_client.get("/api/v1/token-usage?range=all&bookId=book-1")

        assert resp.status_code == 200
        assert mock_token_store.get_usage.await_args.kwargs["book_id"] == "book-1"
        assert mock_token_store.get_daily_usage.await_args.kwargs["book_id"] == "book-1"

    def test_omitting_book_id_leaves_the_query_unnarrowed(
        self, token_client, mock_token_store
    ):
        token_client.get("/api/v1/token-usage")

        assert mock_token_store.get_usage.await_args.kwargs["book_id"] is None

    def test_unattributed_sentinel_is_passed_through(
        self, token_client, mock_token_store
    ):
        token_client.get("/api/v1/token-usage?bookId=__unattributed__")

        assert (
            mock_token_store.get_usage.await_args.kwargs["book_id"]
            == "__unattributed__"
        )
