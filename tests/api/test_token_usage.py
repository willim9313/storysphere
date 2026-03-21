"""Tests for GET /api/v1/token-usage endpoint."""

from __future__ import annotations

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

    from api.main import create_app
    from api import deps

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
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
