"""Shared fixtures for API layer tests.

All services and agents are mocked so tests are fast and don't need
real DBs, Qdrant, or LLM API keys.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from services.analysis_models import (
    ArcSegment,
    ArchetypeResult,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
    EventAnalysisResult,
    EventEvidenceProfile,
    CausalityAnalysis,
    ImpactAnalysis,
    EventSummary,
    EventCoverageMetrics,
)
from datetime import datetime


# ── Domain helpers ────────────────────────────────────────────────────────────

def make_entity(name="Alice", eid="ent-alice", etype=EntityType.CHARACTER, **kw) -> Entity:
    return Entity(id=eid, name=name, entity_type=etype, **kw)

def make_relation(src="ent-alice", tgt="ent-bob", rtype=RelationType.FRIENDSHIP, **kw) -> Relation:
    return Relation(source_id=src, target_id=tgt, relation_type=rtype, **kw)

def make_event(title="The Meeting", chapter=1, **kw) -> Event:
    return Event(
        title=title,
        event_type=EventType.MEETING,
        description="Alice met Bob.",
        chapter=chapter,
        participants=["ent-alice"],
        **kw,
    )


ALICE = make_entity("Alice", "ent-alice", EntityType.CHARACTER, description="The protagonist")
BOB = make_entity("Bob", "ent-bob", EntityType.CHARACTER, description="The sidekick")
ALICE_BOB_REL = make_relation(weight=0.9, chapters=[1, 3])
MEETING = make_event()


# ── Mock services ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_kg():
    svc = AsyncMock()
    async def _get(eid):
        return {"ent-alice": ALICE, "ent-bob": BOB}.get(eid)

    svc.get_entity = AsyncMock(side_effect=_get)
    svc.list_entities = AsyncMock(return_value=[ALICE, BOB])
    svc.get_relations = AsyncMock(return_value=[ALICE_BOB_REL])
    svc.get_entity_timeline = AsyncMock(return_value=[MEETING])
    svc.get_subgraph = AsyncMock(return_value={
        "nodes": [{"entity_id": "ent-alice", "name": "Alice"}],
        "edges": [],
    })
    svc.get_relation_stats = AsyncMock(return_value={"total_relations": 1})
    return svc


@pytest.fixture
def mock_vector():
    svc = AsyncMock()
    svc.search = AsyncMock(return_value=[
        {"id": "p1", "text": "Alice entered the garden.", "score": 0.95, "metadata": {}},
    ])
    return svc


@pytest.fixture
def mock_analysis_agent():
    agent = AsyncMock()
    agent.analyze_character = AsyncMock(return_value=CharacterAnalysisResult(
        entity_id="ent-alice",
        entity_name="Alice",
        document_id="doc-1",
        profile=CharacterProfile(summary="Alice is the brave protagonist."),
        cep=CEPResult(actions=["fights"], traits=["brave"]),
        archetypes=[ArchetypeResult(framework="jung", primary="hero", confidence=0.9, evidence=[])],
        arc=[ArcSegment(chapter_range="1-5", phase="Setup", description="Alice is introduced.")],
        coverage=CoverageMetrics(),
        analyzed_at=datetime(2026, 1, 1),
    ))
    agent.analyze_event = AsyncMock(return_value=EventAnalysisResult(
        event_id="evt-1",
        title="The Meeting",
        document_id="doc-1",
        eep=EventEvidenceProfile(state_before="Before", state_after="After"),
        causality=CausalityAnalysis(),
        impact=ImpactAnalysis(),
        summary=EventSummary(summary="A pivotal meeting."),
        coverage=EventCoverageMetrics(),
        analyzed_at=datetime(2026, 1, 1),
    ))
    return agent


@pytest.fixture
def mock_chat_agent():
    agent = MagicMock()
    async def _astream(query, state):
        for chunk in ["Hello ", "world"]:
            yield chunk
    agent.astream = _astream
    return agent


# ── App client with overridden deps ──────────────────────────────────────────

@pytest.fixture
def client(mock_kg, mock_vector, mock_analysis_agent, mock_chat_agent):
    """TestClient with all deps overridden by mocks.

    The lifespan warmup is replaced by a no-op so tests don't need
    real API keys, databases, or Qdrant connections.
    """
    import sys
    from contextlib import asynccontextmanager

    sys.path.insert(0, "src")

    from api.main import create_app
    from api import deps

    app = create_app()

    # Replace lifespan with a no-op so startup doesn't try to connect to real services
    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
