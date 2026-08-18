"""Tests for DELETE /books/{book_id} — analysis cache cleanup coverage."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from .conftest import make_event


@pytest.fixture
def mock_cache():
    cache = AsyncMock()
    cache.invalidate = AsyncMock(return_value=0)
    return cache


@pytest.fixture
def mock_symbols():
    svc = AsyncMock()
    svc.delete_by_book = AsyncMock(return_value=0)
    return svc


@pytest.fixture
def delete_client(
    mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent, mock_cache,
    mock_symbols,
):
    """client fixture plus the extra deps the delete handler needs."""
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_kg.get_events = AsyncMock(return_value=[
        make_event(title="A", chapter=1, id="ev-1"),
        make_event(title="B", chapter=2, id="ev-2"),
    ])

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
    app.dependency_overrides[deps.get_link_prediction_service] = lambda: AsyncMock()
    app.dependency_overrides[deps.get_symbol_service] = lambda: mock_symbols

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


class TestDeleteBookCacheCleanup:
    def test_returns_404_for_unknown_book(self, delete_client):
        resp = delete_client.delete("/api/v1/books/no-such-book")
        assert resp.status_code == 404

    def test_pattern_matches_book_id_anywhere_in_key(self, delete_client, mock_cache):
        """book_id sits mid-key for character:, end-of-key for narrative_structure:."""
        resp = delete_client.delete("/api/v1/books/doc-1")

        assert resp.status_code == 204
        patterns = [c.args[0] for c in mock_cache.invalidate.call_args_list]
        assert "%doc-1%" in patterns

    def test_teu_keys_are_invalidated_by_event_id(self, delete_client, mock_cache):
        """teu: keys carry no book_id, so they need explicit per-event cleanup."""
        delete_client.delete("/api/v1/books/doc-1")

        patterns = [c.args[0] for c in mock_cache.invalidate.call_args_list]
        assert "teu:ev-1" in patterns
        assert "teu:ev-2" in patterns


class TestDeleteBookSymbolCleanup:
    """Imagery rows are book-scoped, so nothing reads them after the book goes —
    but nothing deleted them either, and they stayed behind taking up space.

    ``SymbolService.delete_by_book`` already existed; its only caller was the
    re-ingest path in ``symbol_discovery/pipeline.py``.
    """

    def test_deleting_a_book_drops_its_imagery(self, delete_client, mock_symbols):
        resp = delete_client.delete("/api/v1/books/doc-1")

        assert resp.status_code == 204
        mock_symbols.delete_by_book.assert_awaited_once_with("doc-1")

    def test_unknown_book_touches_nothing(self, delete_client, mock_symbols, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=None)

        resp = delete_client.delete("/api/v1/books/no-such-book")

        assert resp.status_code == 404
        mock_symbols.delete_by_book.assert_not_awaited()
