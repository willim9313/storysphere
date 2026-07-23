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


class TestListCharacterAnalysesMentionCount:
    """GET /books/:bookId/analysis/characters — #0 fix: mentionCount from KG entity."""

    def test_analyzed_item_carries_entity_mention_count(self, jung_schmidt_client, mock_kg):
        """Alice (cached, analyzed) should report her real mention_count."""
        from storysphere.domain.entities import Entity, EntityType

        alice = Entity(
            id="ent-alice", name="Alice", entity_type=EntityType.CHARACTER,
            mention_count=1002,
        )
        bob = Entity(
            id="ent-bob", name="Bob", entity_type=EntityType.CHARACTER,
            mention_count=0,
        )
        mock_kg.list_entities = AsyncMock(return_value=[alice, bob])

        resp = jung_schmidt_client.get("/api/v1/books/doc-1/analysis/characters")
        assert resp.status_code == 200
        analyzed = resp.json()["analyzed"]
        alice_item = next(x for x in analyzed if x["entityId"] == "ent-alice")
        assert alice_item["mentionCount"] == 1002

    def test_unanalyzed_entity_carries_entity_mention_count(self, jung_schmidt_client, mock_kg):
        """Bob (no cache entry, unanalyzed) should still report his mention_count."""
        from storysphere.domain.entities import Entity, EntityType

        alice = Entity(
            id="ent-alice", name="Alice", entity_type=EntityType.CHARACTER,
            mention_count=1002,
        )
        bob = Entity(
            id="ent-bob", name="Bob", entity_type=EntityType.CHARACTER,
            mention_count=225,
        )
        mock_kg.list_entities = AsyncMock(return_value=[alice, bob])

        resp = jung_schmidt_client.get("/api/v1/books/doc-1/analysis/characters")
        assert resp.status_code == 200
        unanalyzed = resp.json()["unanalyzed"]
        bob_item = next(x for x in unanalyzed if x["id"] == "ent-bob")
        assert bob_item["mentionCount"] == 225


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

    def test_entity_ids_subset_only_analyzes_requested(
        self, batch_client, mock_analysis_agent, mock_doc,
    ):
        """entityIds restricts the run to that subset (ALICE + BOB from conftest)."""
        mock_doc.get_document_language = AsyncMock(return_value="en")

        resp = batch_client.post(
            "/api/v1/books/doc-1/entities/analyze-all",
            json={"entityIds": ["ent-bob"]},
        )
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
        assert result["total"] == 1  # only ent-bob requested
        assert result["skipped"] == 0
        names_analyzed = [
            call.kwargs.get("entity_name")
            for call in mock_analysis_agent.analyze_character.await_args_list
        ]
        assert names_analyzed == ["Bob"]

    def test_entity_ids_with_unknown_id_is_ignored(self, batch_client):
        """An entityId that doesn't match any character is silently excluded."""
        resp = batch_client.post(
            "/api/v1/books/doc-1/entities/analyze-all",
            json={"entityIds": ["ent-bob", "no-such-entity"]},
        )
        assert resp.status_code == 202

    def test_entity_ids_all_unknown_returns_400(self, batch_client):
        """If the subset matches nothing, behave like the empty-book case."""
        resp = batch_client.post(
            "/api/v1/books/doc-1/entities/analyze-all",
            json={"entityIds": ["no-such-entity"]},
        )
        assert resp.status_code == 400


# ── Batch event analysis ──────────────────────────────────────────────────────


def _make_events():
    """Two events with stable ids, for subset assertions."""
    from storysphere.domain.events import Event, EventType

    def _ev(eid, title):
        return Event(
            id=eid,
            title=title,
            event_type=EventType.MEETING,
            description=f"{title} happened.",
            chapter=1,
            document_id="doc-1",
        )

    return [_ev("evt-1", "The Meeting"), _ev("evt-2", "The Duel")]


@pytest.fixture
def event_batch_client(batch_client, mock_kg, mock_doc):
    """batch_client with mock_kg.get_events wired — conftest does not cover it."""
    mock_kg.get_events = AsyncMock(return_value=_make_events())
    mock_doc.get_document_language = AsyncMock(return_value="en")
    return batch_client


def _await_task(client, task_id):
    for _ in range(20):
        poll = client.get(f"/api/v1/tasks/{task_id}/status")
        if poll.status_code == 200 and poll.json()["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    return client.get(f"/api/v1/tasks/{task_id}/status").json()


class TestBatchEventAnalysis:
    """POST /books/:bookId/events/analyze-all — batch EEP analysis."""

    def test_returns_202_with_task_id(self, event_batch_client):
        resp = event_batch_client.post("/api/v1/books/doc-1/events/analyze-all")
        assert resp.status_code == 202
        assert "taskId" in resp.json()

    def test_returns_404_for_unknown_book(self, event_batch_client):
        resp = event_batch_client.post("/api/v1/books/no-such-book/events/analyze-all")
        assert resp.status_code == 404

    def test_returns_400_when_no_events(self, event_batch_client, mock_kg):
        mock_kg.get_events = AsyncMock(return_value=[])
        resp = event_batch_client.post("/api/v1/books/doc-1/events/analyze-all")
        assert resp.status_code == 400

    def test_no_body_analyzes_all_events(self, event_batch_client, mock_analysis_agent):
        resp = event_batch_client.post("/api/v1/books/doc-1/events/analyze-all")
        task_id = resp.json()["taskId"]

        final = _await_task(event_batch_client, task_id)
        assert final["status"] == "done"
        assert final["result"]["total"] == 2
        analyzed = [
            call.kwargs.get("event_id")
            for call in mock_analysis_agent.analyze_event.await_args_list
        ]
        assert sorted(analyzed) == ["evt-1", "evt-2"]

    def test_event_ids_subset_only_analyzes_requested(
        self, event_batch_client, mock_analysis_agent,
    ):
        """eventIds restricts the run to that subset."""
        resp = event_batch_client.post(
            "/api/v1/books/doc-1/events/analyze-all",
            json={"eventIds": ["evt-2"]},
        )
        assert resp.status_code == 202
        task_id = resp.json()["taskId"]

        final = _await_task(event_batch_client, task_id)
        assert final["status"] == "done"
        assert final["result"]["total"] == 1
        analyzed = [
            call.kwargs.get("event_id")
            for call in mock_analysis_agent.analyze_event.await_args_list
        ]
        assert analyzed == ["evt-2"]

    def test_event_ids_with_unknown_id_is_ignored(self, event_batch_client):
        """An eventId that doesn't match any event is silently excluded."""
        resp = event_batch_client.post(
            "/api/v1/books/doc-1/events/analyze-all",
            json={"eventIds": ["evt-2", "no-such-event"]},
        )
        assert resp.status_code == 202

    def test_event_ids_all_unknown_returns_400(self, event_batch_client):
        """If the subset matches nothing, behave like the empty-book case."""
        resp = event_batch_client.post(
            "/api/v1/books/doc-1/events/analyze-all",
            json={"eventIds": ["no-such-event"]},
        )
        assert resp.status_code == 400

    def test_cached_events_are_skipped(self, event_batch_client):
        """Events with a cache hit are skipped, not re-analyzed."""
        event_batch_client._cache_store["event:doc-1:evt-1"] = {"any": "value"}  # noqa: SLF001

        resp = event_batch_client.post("/api/v1/books/doc-1/events/analyze-all")
        task_id = resp.json()["taskId"]

        final = _await_task(event_batch_client, task_id)
        assert final["status"] == "done"
        assert final["result"]["total"] == 2
        assert final["result"]["skipped"] == 1


# ── Event source passages (#7i) ───────────────────────────────────────────────


@pytest.fixture
def source_client(client, mock_kg):
    """client with mock_kg.get_event wired — conftest does not cover it."""
    from tests.api.conftest import MEETING

    async def _get_event(eid):
        return MEETING if eid == "evt-1" else None

    mock_kg.get_event = AsyncMock(side_effect=_get_event)
    return client


class TestEventSourcePassages:
    """GET /books/:bookId/events/:eventId/source — retrieved source paragraphs."""

    def test_returns_passages(self, source_client):
        resp = source_client.get("/api/v1/books/doc-1/events/evt-1/source")
        assert resp.status_code == 200
        body = resp.json()
        assert body["eventId"] == "evt-1"
        assert len(body["passages"]) == 1
        p = body["passages"][0]
        assert p["text"] == "Alice entered the garden."
        assert p["chapterNumber"] == 1
        assert p["score"] == pytest.approx(0.95)

    def test_returns_404_for_unknown_event(self, source_client):
        resp = source_client.get("/api/v1/books/doc-1/events/no-such-event/source")
        assert resp.status_code == 404

    def test_queries_vector_with_title_and_description(self, source_client, mock_vector):
        source_client.get("/api/v1/books/doc-1/events/evt-1/source")
        kwargs = mock_vector.search.await_args.kwargs
        assert "The Meeting" in kwargs["query_text"]
        assert kwargs["document_id"] == "doc-1"

    def test_limit_is_clamped(self, source_client, mock_vector):
        """`limit` clamps the returned count; the vector query over-fetches so
        the chapter filter still has candidates to work with."""
        resp = source_client.get("/api/v1/books/doc-1/events/evt-1/source?limit=99")
        assert len(resp.json()["passages"]) <= 10
        assert mock_vector.search.await_args.kwargs["top_k"] >= 10

        source_client.get("/api/v1/books/doc-1/events/evt-1/source?limit=0")
        assert mock_vector.search.await_args.kwargs["top_k"] >= 1

    def test_skips_results_without_text(self, source_client, mock_vector):
        mock_vector.search = AsyncMock(return_value=[
            {"id": "p1", "text": "", "score": 0.9, "chapter_number": 1},
            {"id": "p2", "text": "Real prose.", "score": 0.8, "chapter_number": 1},
        ])
        resp = source_client.get("/api/v1/books/doc-1/events/evt-1/source")
        passages = resp.json()["passages"]
        assert [p["id"] for p in passages] == ["p2"]

    def test_only_returns_passages_from_the_events_chapter(self, source_client, mock_vector):
        """Unconstrained similarity strays to other chapters; the event's own
        chapter is reliable metadata, so hits elsewhere are dropped."""
        mock_vector.search = AsyncMock(return_value=[
            {"id": "other", "text": "Wrong chapter.", "score": 0.99, "chapter_number": 7},
            {"id": "same", "text": "Right chapter.", "score": 0.40, "chapter_number": 1},
        ])
        resp = source_client.get("/api/v1/books/doc-1/events/evt-1/source")
        assert [p["id"] for p in resp.json()["passages"]] == ["same"]

    def test_returns_empty_when_chapter_has_no_hits(self, source_client, mock_vector):
        mock_vector.search = AsyncMock(return_value=[
            {"id": "other", "text": "Wrong chapter.", "score": 0.99, "chapter_number": 7},
        ])
        resp = source_client.get("/api/v1/books/doc-1/events/evt-1/source")
        assert resp.status_code == 200
        assert resp.json()["passages"] == []
