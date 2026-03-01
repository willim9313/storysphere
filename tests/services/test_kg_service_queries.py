"""Unit tests for KGService new query methods (Phase 3)."""

from __future__ import annotations

import pytest

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from services.kg_service import KGService


def _make_entity(name: str, etype: EntityType = EntityType.CHARACTER) -> Entity:
    return Entity(name=name, entity_type=etype)


@pytest.fixture
def service(tmp_path):
    return KGService(persistence_path=str(tmp_path / "kg.json"))


# ── get_entity_timeline ──────────────────────────────────────────────────────


class TestGetEntityTimeline:
    @pytest.mark.asyncio
    async def test_returns_sorted_events(self, service):
        alice = _make_entity("Alice")
        await service.add_entity(alice)

        e1 = Event(title="Battle", event_type=EventType.BATTLE, description="Fight", chapter=5, participants=[alice.id])
        e2 = Event(title="Meeting", event_type=EventType.MEETING, description="Meet", chapter=2, participants=[alice.id])
        e3 = Event(title="Alliance", event_type=EventType.ALLIANCE, description="Ally", chapter=8, participants=[alice.id])
        await service.add_event(e1)
        await service.add_event(e2)
        await service.add_event(e3)

        timeline = await service.get_entity_timeline(alice.id)
        assert len(timeline) == 3
        assert [e.chapter for e in timeline] == [2, 5, 8]

    @pytest.mark.asyncio
    async def test_empty_for_no_events(self, service):
        alice = _make_entity("Alice")
        await service.add_entity(alice)
        timeline = await service.get_entity_timeline(alice.id)
        assert timeline == []

    @pytest.mark.asyncio
    async def test_empty_for_nonexistent_entity(self, service):
        timeline = await service.get_entity_timeline("nonexistent")
        assert timeline == []


# ── get_relation_paths ───────────────────────────────────────────────────────


class TestGetRelationPaths:
    @pytest.mark.asyncio
    async def test_direct_path(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP))

        paths = await service.get_relation_paths(a.id, b.id)
        assert len(paths) == 1
        assert len(paths[0]) == 2
        assert paths[0][0]["name"] == "Alice"
        assert paths[0][1]["name"] == "Bob"

    @pytest.mark.asyncio
    async def test_indirect_path(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        c = _make_entity("Carol")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_entity(c)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP))
        await service.add_relation(Relation(source_id=b.id, target_id=c.id, relation_type=RelationType.ALLY))

        paths = await service.get_relation_paths(a.id, c.id, max_length=3)
        assert len(paths) >= 1
        # Path should go through Bob
        names = [node["name"] for node in paths[0]]
        assert names == ["Alice", "Bob", "Carol"]

    @pytest.mark.asyncio
    async def test_no_path(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        await service.add_entity(a)
        await service.add_entity(b)
        # No relation
        paths = await service.get_relation_paths(a.id, b.id)
        assert paths == []

    @pytest.mark.asyncio
    async def test_nonexistent_nodes(self, service):
        paths = await service.get_relation_paths("x", "y")
        assert paths == []


# ── get_subgraph ─────────────────────────────────────────────────────────────


class TestGetSubgraph:
    @pytest.mark.asyncio
    async def test_single_hop(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        c = _make_entity("Carol")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_entity(c)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP))
        await service.add_relation(Relation(source_id=b.id, target_id=c.id, relation_type=RelationType.ALLY))

        sub = await service.get_subgraph(a.id, k_hops=1)
        assert sub["center"] == a.id
        node_ids = {n["entity_id"] for n in sub["nodes"]}
        assert a.id in node_ids
        assert b.id in node_ids
        # Carol is 2 hops away, should NOT be in 1-hop subgraph
        assert c.id not in node_ids

    @pytest.mark.asyncio
    async def test_two_hops(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        c = _make_entity("Carol")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_entity(c)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP))
        await service.add_relation(Relation(source_id=b.id, target_id=c.id, relation_type=RelationType.ALLY))

        sub = await service.get_subgraph(a.id, k_hops=2)
        node_ids = {n["entity_id"] for n in sub["nodes"]}
        assert c.id in node_ids

    @pytest.mark.asyncio
    async def test_nonexistent_entity(self, service):
        sub = await service.get_subgraph("nonexistent", k_hops=1)
        assert sub["nodes"] == []
        assert sub["edges"] == []


# ── get_relation_stats ───────────────────────────────────────────────────────


class TestGetRelationStats:
    @pytest.mark.asyncio
    async def test_global_stats(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        c = _make_entity("Carol")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_entity(c)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP, weight=0.8))
        await service.add_relation(Relation(source_id=a.id, target_id=c.id, relation_type=RelationType.FRIENDSHIP, weight=0.6))
        await service.add_relation(Relation(source_id=b.id, target_id=c.id, relation_type=RelationType.ENEMY, weight=0.9))

        stats = await service.get_relation_stats()
        assert stats["total_relations"] == 3
        assert stats["type_distribution"]["friendship"] == 2
        assert stats["type_distribution"]["enemy"] == 1
        assert abs(stats["weight_avg"] - (0.8 + 0.6 + 0.9) / 3) < 1e-6
        assert stats["weight_min"] == 0.6
        assert stats["weight_max"] == 0.9

    @pytest.mark.asyncio
    async def test_entity_scoped_stats(self, service):
        a = _make_entity("Alice")
        b = _make_entity("Bob")
        c = _make_entity("Carol")
        await service.add_entity(a)
        await service.add_entity(b)
        await service.add_entity(c)
        await service.add_relation(Relation(source_id=a.id, target_id=b.id, relation_type=RelationType.FRIENDSHIP, weight=0.8))
        await service.add_relation(Relation(source_id=b.id, target_id=c.id, relation_type=RelationType.ENEMY, weight=0.5))

        stats = await service.get_relation_stats(entity_id=a.id)
        assert stats["total_relations"] == 1
        assert stats["type_distribution"]["friendship"] == 1

    @pytest.mark.asyncio
    async def test_empty_stats(self, service):
        stats = await service.get_relation_stats()
        assert stats["total_relations"] == 0
        assert stats["weight_avg"] == 0.0
