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
from services.query_models import (
    DocumentSummary,
    PathNode,
    RelationPath,
    RelationStats,
    Subgraph,
    SubgraphEdge,
    SubgraphNode,
    VectorSearchResult,
)
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
    svc.get_subgraph = AsyncMock(return_value=Subgraph(
        center="ent-alice",
        nodes=[SubgraphNode(entity_id="ent-alice", name="Alice", entity_type="character")],
        edges=[],
    ))
    svc.get_relation_stats = AsyncMock(return_value=RelationStats(
        total_relations=1,
        type_distribution={"friendship": 1},
        weight_avg=0.9,
        weight_min=0.9,
        weight_max=0.9,
    ))
    svc.get_relation_paths = AsyncMock(return_value=[
        RelationPath(nodes=[
            PathNode(entity_id="ent-alice", name="Alice"),
            PathNode(entity_id="ent-bob", name="Bob"),
        ])
    ])
    return svc


@pytest.fixture
def mock_vector():
    svc = AsyncMock()
    svc.search = AsyncMock(return_value=[
        VectorSearchResult(id="p1", text="Alice entered the garden.", score=0.95, document_id="doc-1", chapter_number=1, position=0),
    ])
    return svc


@pytest.fixture
def mock_doc():
    from domain.documents import Chapter, Document, FileType, Paragraph  # noqa: PLC0415

    paras = [
        Paragraph(id="p1", text="Alice entered the garden.", chapter_number=1, position=0),
        Paragraph(id="p2", text="Bob followed closely.", chapter_number=1, position=1),
    ]
    doc = Document(
        id="doc-1",
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(number=1, title="The Beginning", summary="Alice and Bob.", paragraphs=paras),
            Chapter(number=2, title="The Storm", summary="A storm.", paragraphs=[]),
        ],
        summary="A tale of Alice and Bob.",
    )
    svc = AsyncMock()
    svc.list_documents = AsyncMock(return_value=[
        DocumentSummary(id="doc-1", title="Test Novel", file_type="pdf", chapter_count=2)
    ])
    async def _get_doc(doc_id):
        return doc if doc_id == "doc-1" else None

    svc.get_document = AsyncMock(side_effect=_get_doc)
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
    async def _astream(query, state, **kwargs):
        for chunk in ["Hello ", "world"]:
            yield chunk
    agent.astream = _astream
    return agent


# ── App client with overridden deps ──────────────────────────────────────────

@pytest.fixture
def client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
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
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
