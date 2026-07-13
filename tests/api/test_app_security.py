"""Tests for API network exposure hardening (loopback bind, CORS allowlist, docs gating).

Coverage:
  - create_app(): docs_url/redoc_url disabled outside development
  - create_app(): CORS allow_origins is an explicit whitelist in development
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

sys.path.insert(0, "src")

from storysphere.config.settings import Settings  # noqa: E402


@pytest.fixture
def make_app_client():
    """Build a TestClient for create_app() with a given app_env, lifespan stubbed out."""

    def _make(app_env: str) -> TestClient:
        settings = Settings(app_env=app_env)
        with patch("storysphere.config.settings.get_settings", return_value=settings):
            from storysphere.api.main import create_app  # noqa: PLC0415

            app = create_app()

        @asynccontextmanager
        async def _noop_lifespan(app):
            yield

        app.router.lifespan_context = _noop_lifespan
        return TestClient(app)

    return _make


class TestDocsGating:
    def test_production_disables_docs_and_redoc(self, make_app_client):
        with make_app_client("production") as client:
            assert client.get("/docs").status_code == 404
            assert client.get("/redoc").status_code == 404

    def test_development_enables_docs_and_redoc(self, make_app_client):
        with make_app_client("development") as client:
            assert client.get("/docs").status_code == 200
            assert client.get("/redoc").status_code == 200


class TestCorsAllowlist:
    def test_development_cors_uses_explicit_whitelist(self, make_app_client):
        with make_app_client("development") as client:
            cors_entry = next(
                m for m in client.app.user_middleware if m.cls is CORSMiddleware
            )
            assert cors_entry.kwargs["allow_origins"] == [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]

    def test_production_cors_allows_no_origins(self, make_app_client):
        with make_app_client("production") as client:
            cors_entry = next(
                m for m in client.app.user_middleware if m.cls is CORSMiddleware
            )
            assert cors_entry.kwargs["allow_origins"] == []
