"""Tests for POST/GET /api/v1/analysis/* endpoints."""

from __future__ import annotations

import sys
import time
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, "src")


# ── Character analysis ─────────────────────────────────────────────────────────

def test_analyze_character_returns_202(client):
    resp = client.post("/api/v1/analysis/character", json={
        "entity_name": "Alice",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data
    assert data["status"] == "pending"


def test_analyze_character_missing_fields(client):
    resp = client.post("/api/v1/analysis/character", json={"entity_name": "Alice"})
    assert resp.status_code == 422  # document_id is required


def test_analyze_character_poll_not_found(client):
    resp = client.get("/api/v1/analysis/character/nonexistent-id")
    assert resp.status_code == 404


def test_analyze_character_background_completes(client):
    """After the background task runs, polling returns done status."""
    resp = client.post("/api/v1/analysis/character", json={
        "entity_name": "Alice",
        "document_id": "doc-1",
        "archetype_frameworks": ["jung"],
        "language": "en",
    })
    assert resp.status_code == 202
    task_id = resp.json()["taskId"]

    # TestClient runs background tasks before context exits;
    # poll a few times to account for async scheduling
    for _ in range(5):
        poll = client.get(f"/api/v1/analysis/character/{task_id}")
        assert poll.status_code == 200
        if poll.json()["status"] in ("done", "error"):
            break
        time.sleep(0.05)

    final = client.get(f"/api/v1/analysis/character/{task_id}").json()
    assert final["status"] == "done"
    assert final["result"]["entity_name"] == "Alice"


# ── Event analysis ─────────────────────────────────────────────────────────────

def test_analyze_event_returns_202(client):
    resp = client.post("/api/v1/analysis/event", json={
        "event_id": "evt-1",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data
    assert data["status"] == "pending"


def test_analyze_event_missing_fields(client):
    resp = client.post("/api/v1/analysis/event", json={"event_id": "evt-1"})
    assert resp.status_code == 422


def test_analyze_event_poll_not_found(client):
    resp = client.get("/api/v1/analysis/event/nonexistent-id")
    assert resp.status_code == 404


def test_analyze_event_background_completes(client):
    resp = client.post("/api/v1/analysis/event", json={
        "event_id": "evt-1",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    task_id = resp.json()["taskId"]

    for _ in range(5):
        poll = client.get(f"/api/v1/analysis/event/{task_id}")
        assert poll.status_code == 200
        if poll.json()["status"] in ("done", "error"):
            break
        time.sleep(0.05)

    final = client.get(f"/api/v1/analysis/event/{task_id}").json()
    assert final["status"] == "done"
    assert final["result"]["event_id"] == "evt-1"


# ── Jung/Schmidt framework wiring (e9c3a98) ──────────────────────────────────


def _make_cached_character_result():
    """Cached analysis result with BOTH frameworks classified."""
    from storysphere.services.analysis_models import (
        ArchetypeResult,
        CEPResult,
        CharacterAnalysisResult,
        CharacterProfile,
        CoverageMetrics,
    )

    return CharacterAnalysisResult(
        entity_id="ent-alice",
        entity_name="Alice",
        document_id="doc-1",
        profile=CharacterProfile(summary="Alice is brave."),
        cep=CEPResult(actions=["fights"], traits=["brave"]),
        archetypes=[
            ArchetypeResult(framework="jung", primary="hero", confidence=0.9, evidence=["e1"]),
            ArchetypeResult(framework="schmidt", primary="warrior", confidence=0.8, evidence=["e2"]),
        ],
        arc=[],
        coverage=CoverageMetrics(),
        analyzed_at=datetime(2026, 1, 1),
    )


@pytest.fixture
def jung_schmidt_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """TestClient with analysis cache pre-populated for ent-alice with both frameworks."""
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app
    from storysphere.services.analysis_cache import AnalysisCache

    cached = _make_cached_character_result().model_dump()
    cache_key = AnalysisCache.make_key("character", "doc-1", "Alice")

    mock_cache = AsyncMock()

    def _get(key):
        return cached if key == cache_key else None

    mock_cache.get.side_effect = _get
    mock_cache.set = AsyncMock()
    mock_cache.invalidate = AsyncMock()

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
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


class TestListCharacterAnalysesArchetypes:
    """GET /books/:bookId/analysis/characters — archetypes is dict of all frameworks."""

    def test_analyzed_item_carries_both_frameworks_in_archetypes_dict(self, jung_schmidt_client):
        resp = jung_schmidt_client.get("/api/v1/books/doc-1/analysis/characters")
        assert resp.status_code == 200
        body = resp.json()
        analyzed = body["analyzed"]
        alice = next((x for x in analyzed if x["entityId"] == "ent-alice"), None)
        assert alice is not None, "Alice should appear in analyzed list (cache hit)"

        # The key contract: archetypes is now a dict[framework -> primary], not hardcoded jung
        archetypes = alice["archetypes"]
        assert isinstance(archetypes, dict)
        assert archetypes == {"jung": "hero", "schmidt": "warrior"}

    def test_unanalyzed_entities_have_no_archetypes(self, jung_schmidt_client):
        """Bob has no cache entry → goes to unanalyzed."""
        resp = jung_schmidt_client.get("/api/v1/books/doc-1/analysis/characters")
        body = resp.json()
        unanalyzed_ids = {x["id"] for x in body["unanalyzed"]}
        assert "ent-bob" in unanalyzed_ids


class TestEntityAnalysisDetailArchetypes:
    """GET /books/:bookId/entities/:entityId/analysis — archetypes list preserves both frameworks."""

    def test_detail_returns_both_framework_archetypes(self, jung_schmidt_client):
        resp = jung_schmidt_client.get("/api/v1/books/doc-1/entities/ent-alice/analysis")
        assert resp.status_code == 200
        body = resp.json()
        archetypes = body["archetypes"]
        frameworks = {a["framework"] for a in archetypes}
        assert frameworks == {"jung", "schmidt"}

        jung = next(a for a in archetypes if a["framework"] == "jung")
        schmidt = next(a for a in archetypes if a["framework"] == "schmidt")
        assert jung["primary"] == "hero"
        assert schmidt["primary"] == "warrior"
        # Confidence and evidence preserved
        assert jung["confidence"] == 0.9
        assert schmidt["evidence"] == ["e2"]


class TestRunEntityAnalysisFrameworks:
    """POST /books/:bookId/entities/:entityId/analyze always uses both frameworks.

    Contract from e9c3a98: UI path hardcodes ["jung", "schmidt"] regardless of
    request input, so the cache lookup in list_character_analyses (which keys
    on entity name only) consistently sees both frameworks.
    """

    def test_agent_called_with_both_frameworks(self, client, mock_analysis_agent, mock_doc):
        mock_doc.get_document_language = AsyncMock(return_value="en")

        resp = client.post("/api/v1/books/doc-1/entities/ent-alice/analyze")
        assert resp.status_code == 200
        assert "taskId" in resp.json()

        for _ in range(20):
            if mock_analysis_agent.analyze_character.await_count > 0:
                break
            time.sleep(0.05)

        mock_analysis_agent.analyze_character.assert_awaited()
        kwargs = mock_analysis_agent.analyze_character.await_args.kwargs
        assert kwargs.get("archetype_frameworks") == ["jung", "schmidt"]
        assert kwargs.get("entity_name") == "Alice"
        assert kwargs.get("document_id") == "doc-1"


# ── Batch character analysis (#7h) ────────────────────────────────────────────


@pytest.fixture
def batch_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """TestClient with a mock analysis cache so batch skip logic is controllable."""
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    cache_store: dict = {}
    mock_cache = AsyncMock()

    def _get(key):
        return cache_store.get(key)

    def _invalidate(key):
        cache_store.pop(key, None)

    mock_cache.get.side_effect = _get
    mock_cache.set = AsyncMock()
    mock_cache.invalidate.side_effect = _invalidate

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
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache

    with TestClient(app, raise_server_exceptions=True) as c:
        c._cache_store = cache_store  # noqa: SLF001 — expose for test setup
        yield c

    app.dependency_overrides.clear()


class TestBatchEntityAnalysis:
    """POST /books/:bookId/entities/analyze-all — batch character analysis."""

    def test_returns_202_with_task_id(self, batch_client):
        resp = batch_client.post("/api/v1/books/doc-1/entities/analyze-all")
        assert resp.status_code == 202
        assert "taskId" in resp.json()

    def test_returns_404_for_unknown_book(self, batch_client):
        resp = batch_client.post("/api/v1/books/no-such-book/entities/analyze-all")
        assert resp.status_code == 404

    def test_returns_400_when_no_characters(self, batch_client, mock_kg):
        mock_kg.list_entities = AsyncMock(return_value=[])
        resp = batch_client.post("/api/v1/books/doc-1/entities/analyze-all")
        assert resp.status_code == 400

    def test_skips_cached_characters(self, batch_client, mock_analysis_agent, mock_doc):
        """Characters with cache hits should be skipped, not re-analyzed."""
        from storysphere.services.analysis_cache import AnalysisCache

        mock_doc.get_document_language = AsyncMock(return_value="en")
        # Pre-populate cache for Alice → should be skipped
        batch_client._cache_store[  # noqa: SLF001
            AnalysisCache.make_key("character", "doc-1", "Alice")
        ] = {"any": "value"}

        resp = batch_client.post("/api/v1/books/doc-1/entities/analyze-all")
        assert resp.status_code == 202
        task_id = resp.json()["taskId"]

        for _ in range(20):
            poll = batch_client.get(f"/api/v1/tasks/{task_id}/status")
            if poll.status_code == 200 and poll.json()["status"] in ("done", "error"):
                break
            time.sleep(0.05)

        final = batch_client.get(f"/api/v1/tasks/{task_id}/status").json()
        assert final["status"] == "done"
        result = final["result"]
        assert result["total"] == 2  # ALICE + BOB from conftest
        assert result["skipped"] == 1  # Alice cached
        assert result["failed"] == 0
        # Only Bob should have been analyzed
        names_analyzed = [
            call.kwargs.get("entity_name")
            for call in mock_analysis_agent.analyze_character.await_args_list
        ]
        assert names_analyzed == ["Bob"]
