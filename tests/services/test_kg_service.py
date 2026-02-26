"""Unit tests for KGService (NetworkX backend)."""

from __future__ import annotations

import pytest

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from services.kg_service import KGService


def _make_kg_service(tmp_path) -> KGService:
    return KGService(persistence_path=str(tmp_path / "kg.json"))


def _make_entity(name: str, entity_type: EntityType = EntityType.CHARACTER) -> Entity:
    return Entity(name=name, entity_type=entity_type)


@pytest.fixture
def service(tmp_path):
    return _make_kg_service(tmp_path)


# ── Entity operations ────────────────────────────────────────────────────────


class TestKGServiceEntities:
    @pytest.mark.asyncio
    async def test_add_and_get_entity(self, service):
        entity = _make_entity("Alice")
        await service.add_entity(entity)
        result = await service.get_entity(entity.id)
        assert result is not None
        assert result.name == "Alice"

    @pytest.mark.asyncio
    async def test_get_nonexistent_entity_returns_none(self, service):
        result = await service.get_entity("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_entity_by_name(self, service):
        entity = _make_entity("Alice")
        await service.add_entity(entity)
        found = await service.get_entity_by_name("alice")  # case-insensitive
        assert found is not None
        assert found.id == entity.id

    @pytest.mark.asyncio
    async def test_get_entity_by_alias(self, service):
        entity = _make_entity("Lord Voldemort")
        entity.aliases = ["Tom Riddle"]
        await service.add_entity(entity)
        found = await service.get_entity_by_name("Tom Riddle")
        assert found is not None

    @pytest.mark.asyncio
    async def test_list_entities_all(self, service):
        await service.add_entity(_make_entity("Alice"))
        await service.add_entity(_make_entity("London", EntityType.LOCATION))
        all_entities = await service.list_entities()
        assert len(all_entities) == 2

    @pytest.mark.asyncio
    async def test_list_entities_filtered_by_type(self, service):
        await service.add_entity(_make_entity("Alice"))
        await service.add_entity(_make_entity("London", EntityType.LOCATION))
        chars = await service.list_entities(EntityType.CHARACTER)
        assert len(chars) == 1
        assert chars[0].name == "Alice"

    @pytest.mark.asyncio
    async def test_entity_count(self, service):
        assert service.entity_count == 0
        await service.add_entity(_make_entity("Alice"))
        assert service.entity_count == 1


# ── Relation operations ──────────────────────────────────────────────────────


class TestKGServiceRelations:
    @pytest.mark.asyncio
    async def test_add_relation(self, service):
        alice = _make_entity("Alice")
        bob = _make_entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
            chapters=[1],
        )
        await service.add_relation(rel)
        assert service.relation_count >= 1

    @pytest.mark.asyncio
    async def test_get_relations(self, service):
        alice = _make_entity("Alice")
        bob = _make_entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
        )
        await service.add_relation(rel)

        relations = await service.get_relations(alice.id, direction="out")
        assert len(relations) == 1
        assert relations[0].target_id == bob.id

    @pytest.mark.asyncio
    async def test_add_relation_with_missing_node_is_skipped(self, service):
        rel = Relation(
            source_id="missing-src",
            target_id="missing-tgt",
            relation_type=RelationType.OTHER,
        )
        await service.add_relation(rel)  # should not raise
        assert service.relation_count == 0

    @pytest.mark.asyncio
    async def test_bidirectional_relation_adds_reverse_edge(self, service):
        alice = _make_entity("Alice")
        bob = _make_entity("Bob")
        await service.add_entity(alice)
        await service.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
            is_bidirectional=True,
        )
        await service.add_relation(rel)
        # incoming edges to alice should exist
        incoming = await service.get_relations(alice.id, direction="in")
        assert len(incoming) >= 1


# ── Event operations ─────────────────────────────────────────────────────────


class TestKGServiceEvents:
    @pytest.mark.asyncio
    async def test_add_and_get_event(self, service):
        alice = _make_entity("Alice")
        await service.add_entity(alice)

        event = Event(
            title="The Battle",
            event_type=EventType.BATTLE,
            description="A fierce battle.",
            chapter=5,
            participants=[alice.id],
        )
        await service.add_event(event)

        events = await service.get_events(alice.id)
        assert len(events) == 1
        assert events[0].title == "The Battle"

    @pytest.mark.asyncio
    async def test_get_all_events(self, service):
        event = Event(
            title="Meeting",
            event_type=EventType.MEETING,
            description="They met.",
            chapter=1,
        )
        await service.add_event(event)
        all_events = await service.get_events()
        assert len(all_events) == 1


# ── Persistence ──────────────────────────────────────────────────────────────


class TestKGServicePersistence:
    @pytest.mark.asyncio
    async def test_save_and_load(self, tmp_path):
        svc = KGService(persistence_path=str(tmp_path / "kg.json"))
        alice = _make_entity("Alice")
        bob = _make_entity("Bob")
        await svc.add_entity(alice)
        await svc.add_entity(bob)

        rel = Relation(
            source_id=alice.id,
            target_id=bob.id,
            relation_type=RelationType.FRIENDSHIP,
        )
        await svc.add_relation(rel)
        await svc.save()

        # Load into a new instance
        svc2 = KGService(persistence_path=str(tmp_path / "kg.json"))
        await svc2.load()

        assert svc2.entity_count == 2
        assert svc2.relation_count >= 1
        found = await svc2.get_entity_by_name("Alice")
        assert found is not None

    @pytest.mark.asyncio
    async def test_load_nonexistent_file_is_noop(self, tmp_path):
        svc = KGService(persistence_path=str(tmp_path / "nonexistent.json"))
        await svc.load()  # should not raise
        assert svc.entity_count == 0
