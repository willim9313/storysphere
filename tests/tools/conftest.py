"""Shared fixtures for tool-layer tests.

All tools receive mock services so that tests remain fast and
do not require real databases, Qdrant instances, or LLM API keys.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType


# ── Test data factories ───────────────────────────────────────────────────────


def make_entity(
    name: str = "Alice",
    eid: str = "ent-1",
    etype: EntityType = EntityType.CHARACTER,
    **kwargs,
) -> Entity:
    return Entity(id=eid, name=name, entity_type=etype, **kwargs)


def make_relation(
    source_id: str = "ent-1",
    target_id: str = "ent-2",
    rtype: RelationType = RelationType.FRIENDSHIP,
    **kwargs,
) -> Relation:
    return Relation(
        source_id=source_id,
        target_id=target_id,
        relation_type=rtype,
        **kwargs,
    )


def make_event(
    title: str = "The Battle",
    chapter: int = 3,
    participants: list[str] | None = None,
    **kwargs,
) -> Event:
    return Event(
        title=title,
        event_type=EventType.BATTLE,
        description="A fierce battle.",
        chapter=chapter,
        participants=participants or ["ent-1"],
        **kwargs,
    )


# ── Sample entities & relations used across multiple tests ────────────────────

ALICE = make_entity("Alice", "ent-alice", EntityType.CHARACTER, aliases=["A"], description="The protagonist")
BOB = make_entity("Bob", "ent-bob", EntityType.CHARACTER, description="The sidekick")
LONDON = make_entity("London", "ent-london", EntityType.LOCATION, description="A city")

ALICE_BOB_REL = make_relation(
    source_id="ent-alice",
    target_id="ent-bob",
    rtype=RelationType.FRIENDSHIP,
    weight=0.9,
    chapters=[1, 3],
)


# ── Mock KGService ────────────────────────────────────────────────────────────


@pytest.fixture
def mock_kg_service():
    """Mock KGService with pre-populated return values."""
    svc = AsyncMock()

    # Entity lookups
    async def _get_entity(eid):
        entities = {"ent-alice": ALICE, "ent-bob": BOB, "ent-london": LONDON}
        return entities.get(eid)

    async def _get_entity_by_name(name):
        lookup = {"alice": ALICE, "bob": BOB, "london": LONDON}
        return lookup.get(name.lower())

    svc.get_entity = AsyncMock(side_effect=_get_entity)
    svc.get_entity_by_name = AsyncMock(side_effect=_get_entity_by_name)
    svc.list_entities = AsyncMock(return_value=[ALICE, BOB, LONDON])

    # Relations
    svc.get_relations = AsyncMock(return_value=[ALICE_BOB_REL])

    # Events / timeline
    battle = make_event("The Battle", chapter=3, participants=["ent-alice"], id="evt-battle")
    meeting = make_event("The Meeting", chapter=1, participants=["ent-alice", "ent-bob"], id="evt-meeting")
    svc.get_events = AsyncMock(return_value=[battle, meeting])
    svc.get_entity_timeline = AsyncMock(return_value=[meeting, battle])

    # Event lookup by ID
    async def _get_event(eid):
        events = {"evt-battle": battle, "evt-meeting": meeting}
        return events.get(eid)

    svc.get_event = AsyncMock(side_effect=_get_event)

    # Paths
    svc.get_relation_paths = AsyncMock(
        return_value=[
            [
                {"entity_id": "ent-alice", "name": "Alice"},
                {"entity_id": "ent-bob", "name": "Bob", "relation_from_prev": {"relation_type": "friendship"}},
            ]
        ]
    )

    # Subgraph
    svc.get_subgraph = AsyncMock(
        return_value={
            "center": "ent-alice",
            "nodes": [
                {"entity_id": "ent-alice", "name": "Alice", "entity_type": "character"},
                {"entity_id": "ent-bob", "name": "Bob", "entity_type": "character"},
            ],
            "edges": [
                {"source": "ent-alice", "target": "ent-bob", "relation_type": "friendship", "weight": 0.9},
            ],
        }
    )

    # Stats
    svc.get_relation_stats = AsyncMock(
        return_value={
            "total_relations": 1,
            "type_distribution": {"friendship": 1},
            "weight_avg": 0.9,
            "weight_min": 0.9,
            "weight_max": 0.9,
        }
    )

    return svc


# ── Mock DocumentService ──────────────────────────────────────────────────────


@pytest.fixture
def mock_doc_service():
    """Mock DocumentService with pre-populated return values."""
    svc = AsyncMock()

    paras = [
        Paragraph(id="p1", text="Alice entered the garden.", chapter_number=1, position=0),
        Paragraph(id="p2", text="Bob followed closely.", chapter_number=1, position=1),
        Paragraph(id="p3", text="The storm arrived.", chapter_number=2, position=0),
    ]
    svc.get_paragraphs = AsyncMock(return_value=paras)

    svc.get_chapter_summary = AsyncMock(return_value="Alice and Bob explore the garden together.")
    svc.get_book_summary = AsyncMock(return_value="A tale of Alice and Bob navigating adventures together.")
    svc.save_chapter_summary = AsyncMock()
    svc.save_book_summary = AsyncMock()

    doc = Document(
        id="doc-1",
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                title="The Beginning",
                summary="Alice and Bob explore the garden together.",
                paragraphs=paras[:2],
            ),
            Chapter(
                number=2,
                title="The Storm",
                summary="A storm disrupts their plans.",
                paragraphs=paras[2:],
            ),
        ],
        summary="A tale of Alice and Bob navigating adventures together.",
    )
    svc.get_document = AsyncMock(return_value=doc)
    svc.list_documents = AsyncMock(return_value=[{"id": "doc-1", "title": "Test Novel", "file_type": "pdf"}])

    return svc


# ── Mock VectorService ────────────────────────────────────────────────────────


@pytest.fixture
def mock_vector_service():
    """Mock VectorService with pre-populated search results."""
    svc = AsyncMock()
    svc.search = AsyncMock(
        return_value=[
            {
                "id": "p1",
                "score": 0.95,
                "text": "Alice entered the garden.",
                "document_id": "doc-1",
                "chapter_number": 1,
                "position": 0,
            },
            {
                "id": "p3",
                "score": 0.72,
                "text": "The storm arrived.",
                "document_id": "doc-1",
                "chapter_number": 2,
                "position": 0,
            },
        ]
    )
    svc.ensure_collection = AsyncMock()
    return svc


# ── Mock LLMClient ────────────────────────────────────────────────────────────


@pytest.fixture
def mock_llm():
    """Mock LangChain LLM that returns a canned response."""
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="This is a generated insight about the topic.")
    )
    return llm
