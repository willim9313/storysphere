"""Integration tests for Neo4jKGService.

Run with Neo4j available:
    NEO4J_URL=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=xxx \\
    uv run pytest tests/services/test_kg_service_neo4j.py -v --neo4j

Requires the ``--neo4j`` flag (defined in conftest_neo4j below via
``pytest_configure``) so these tests are skipped in normal CI runs.
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from domain.temporal import TemporalRelation, TemporalRelationType


# ── Fixtures ─────────────────────────────────────────────────────────────────

NEO4J_URL = os.environ.get("NEO4J_URL", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")

_DOC_ID = "test-doc-migration"  # isolated document ID for teardown


@pytest_asyncio.fixture
async def service():
    from services.kg_service_neo4j import Neo4jKGService

    svc = Neo4jKGService(url=NEO4J_URL, user=NEO4J_USER, password=NEO4J_PASSWORD)
    await svc.verify_connectivity()
    yield svc
    # Teardown: remove all test data
    await svc.remove_by_document(_DOC_ID)
    await svc.close()


def _entity(name: str, etype: EntityType = EntityType.CHARACTER) -> Entity:
    return Entity(name=name, entity_type=etype, document_id=_DOC_ID)


def _event(title: str, chapter: int, participants: list[str]) -> Event:
    return Event(
        title=title,
        event_type=EventType.PLOT,
        description="Test event.",
        chapter=chapter,
        participants=participants,
        document_id=_DOC_ID,
    )


# ── Entity tests ─────────────────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jEntities:
    @pytest.mark.asyncio
    async def test_add_and_get_entity(self, service):
        e = _entity("Alice")
        await service.add_entity(e)
        found = await service.get_entity(e.id)
        assert found is not None
        assert found.name == "Alice"

    @pytest.mark.asyncio
    async def test_get_nonexistent_returns_none(self, service):
        assert await service.get_entity("nonexistent-xxx") is None

    @pytest.mark.asyncio
    async def test_get_entity_by_name_case_insensitive(self, service):
        e = _entity("Lord Voldemort")
        await service.add_entity(e)
        found = await service.get_entity_by_name("lord voldemort")
        assert found is not None
        assert found.id == e.id

    @pytest.mark.asyncio
    async def test_get_entity_by_alias(self, service):
        e = _entity("Lord Voldemort")
        e.aliases = ["Tom Riddle"]
        await service.add_entity(e)
        found = await service.get_entity_by_name("Tom Riddle")
        assert found is not None

    @pytest.mark.asyncio
    async def test_list_entities_filtered_by_type(self, service):
        await service.add_entity(_entity("Alice", EntityType.CHARACTER))
        await service.add_entity(_entity("London", EntityType.LOCATION))
        chars = await service.list_entities(
            entity_type=EntityType.CHARACTER, document_id=_DOC_ID
        )
        assert all(e.entity_type == EntityType.CHARACTER for e in chars)
        assert any(e.name == "Alice" for e in chars)

    @pytest.mark.asyncio
    async def test_list_entities_by_document(self, service):
        await service.add_entity(_entity("Alice"))
        result = await service.list_entities(document_id=_DOC_ID)
        assert len(result) >= 1


# ── Relation tests ────────────────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jRelations:
    @pytest.mark.asyncio
    async def test_add_and_get_relation(self, service):
        alice = _entity("Alice")
        bob = _entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
            document_id=_DOC_ID,
        )
        await service.add_relation(rel)

        rels = await service.get_relations(alice.id, direction="out")
        assert any(r.target_id == bob.id for r in rels)

    @pytest.mark.asyncio
    async def test_missing_node_is_skipped(self, service):
        rel = Relation(
            source_id="ghost-src",
            target_id="ghost-tgt",
            relation_type=RelationType.OTHER,
            document_id=_DOC_ID,
        )
        await service.add_relation(rel)  # should not raise

    @pytest.mark.asyncio
    async def test_bidirectional_incoming(self, service):
        alice = _entity("Alice")
        bob = _entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
            is_bidirectional=True,
            document_id=_DOC_ID,
        )
        await service.add_relation(rel)

        incoming = await service.get_relations(bob.id, direction="in")
        assert len(incoming) >= 1

    @pytest.mark.asyncio
    async def test_relation_stats(self, service):
        alice = _entity("Alice")
        bob = _entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)
        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FAMILY,
            document_id=_DOC_ID,
        )
        await service.add_relation(rel)
        stats = await service.get_relation_stats(alice.id)
        assert stats["total_relations"] >= 1
        assert "family" in stats["type_distribution"]


# ── Event tests ───────────────────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jEvents:
    @pytest.mark.asyncio
    async def test_add_and_get_event(self, service):
        alice = _entity("Alice")
        await service.add_entity(alice)

        ev = _event("The Battle", chapter=5, participants=[alice.id])
        await service.add_event(ev)

        events = await service.get_events(alice.id)
        assert any(e.title == "The Battle" for e in events)

    @pytest.mark.asyncio
    async def test_get_event_by_id(self, service):
        ev = _event("Lonely Event", chapter=1, participants=[])
        await service.add_event(ev)
        found = await service.get_event(ev.id)
        assert found is not None
        assert found.title == "Lonely Event"

    @pytest.mark.asyncio
    async def test_get_entity_timeline_sorted(self, service):
        alice = _entity("Alice")
        await service.add_entity(alice)

        await service.add_event(_event("Late Event", chapter=10, participants=[alice.id]))
        await service.add_event(_event("Early Event", chapter=2, participants=[alice.id]))

        timeline = await service.get_entity_timeline(alice.id, sort_by="narrative")
        chapters = [e.chapter for e in timeline]
        assert chapters == sorted(chapters)


# ── Temporal relation tests ───────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jTemporalRelations:
    @pytest.mark.asyncio
    async def test_add_and_get_temporal(self, service):
        ev1 = _event("Cause", chapter=1, participants=[])
        ev2 = _event("Effect", chapter=3, participants=[])
        await service.add_event(ev1)
        await service.add_event(ev2)

        tr = TemporalRelation(
            document_id=_DOC_ID,
            source_event_id=ev1.id,
            target_event_id=ev2.id,
            relation_type=TemporalRelationType.CAUSES,
            confidence=0.9,
            evidence="Directly mentioned.",
        )
        await service.add_temporal_relation(tr)

        trs = await service.get_temporal_relations(document_id=_DOC_ID)
        assert any(t.source_event_id == ev1.id for t in trs)

    @pytest.mark.asyncio
    async def test_remove_temporal_relations(self, service):
        ev1 = _event("A", chapter=1, participants=[])
        ev2 = _event("B", chapter=2, participants=[])
        await service.add_event(ev1)
        await service.add_event(ev2)

        tr = TemporalRelation(
            document_id=_DOC_ID,
            source_event_id=ev1.id,
            target_event_id=ev2.id,
            relation_type=TemporalRelationType.BEFORE,
        )
        await service.add_temporal_relation(tr)
        removed = await service.remove_temporal_relations(_DOC_ID)
        assert removed >= 1

        remaining = await service.get_temporal_relations(document_id=_DOC_ID)
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_update_event_rank(self, service):
        ev = _event("Ranked Event", chapter=5, participants=[])
        await service.add_event(ev)
        await service.update_event_rank(ev.id, 3.14)
        found = await service.get_event(ev.id)
        assert found is not None
        assert abs(found.chronological_rank - 3.14) < 0.001


# ── Graph query tests ─────────────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jGraphQueries:
    @pytest.mark.asyncio
    async def test_get_subgraph(self, service):
        alice = _entity("Alice")
        bob = _entity("Bob")
        carol = _entity("Carol")
        for e in [alice, bob, carol]:
            await service.add_entity(e)

        await service.add_relation(Relation(
            source_id=alice.id, target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP, document_id=_DOC_ID,
        ))
        await service.add_relation(Relation(
            source_id=bob.id, target_id=carol.id,
            relation_type=RelationType.ALLY, document_id=_DOC_ID,
        ))

        subgraph = await service.get_subgraph(alice.id, k_hops=2)
        node_ids = {n["entity_id"] for n in subgraph["nodes"]}
        assert alice.id in node_ids
        assert bob.id in node_ids

    @pytest.mark.asyncio
    async def test_get_relation_paths(self, service):
        alice = _entity("Alice")
        bob = _entity("Bob")
        carol = _entity("Carol")
        for e in [alice, bob, carol]:
            await service.add_entity(e)

        await service.add_relation(Relation(
            source_id=alice.id, target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP, document_id=_DOC_ID,
        ))
        await service.add_relation(Relation(
            source_id=bob.id, target_id=carol.id,
            relation_type=RelationType.ALLY, document_id=_DOC_ID,
        ))

        paths = await service.get_relation_paths(alice.id, carol.id, max_length=3)
        assert len(paths) >= 1
        # First and last node of any path should be alice and carol
        first_ids = {p[0]["entity_id"] for p in paths}
        last_ids = {p[-1]["entity_id"] for p in paths}
        assert alice.id in first_ids
        assert carol.id in last_ids


# ── Document removal test ─────────────────────────────────────────────────────


@pytest.mark.neo4j
class TestNeo4jRemoveByDocument:
    @pytest.mark.asyncio
    async def test_remove_by_document(self, service):
        alice = _entity("Alice")
        await service.add_entity(alice)
        ev = _event("Solo Event", chapter=1, participants=[alice.id])
        await service.add_event(ev)

        counts = await service.remove_by_document(_DOC_ID)
        assert counts["entities"] >= 1
        assert counts["events"] >= 1

        # After removal, entity should not be findable
        assert await service.get_entity(alice.id) is None
