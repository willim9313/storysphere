"""Tests for the KG migration between the NetworkX and Neo4j backends.

``kg_migration.py`` is 302 lines of destructive data movement and had **zero**
mentions anywhere in ``tests/`` before this file: getting it wrong loses or
corrupts a book's whole knowledge graph, and nothing would have caught it.

Neo4j is replaced by an in-memory double that keeps the same store-by-id
semantics as ``MERGE``. That leaves the NetworkX side real — a genuine
``KGService`` writing and reading genuine JSON — so the round trip exercises
the serialisation contract the migration actually depends on, rather than a
mock of it.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.events import Event, EventType
from storysphere.domain.relations import Relation, RelationType
from storysphere.domain.temporal import TemporalRelation, TemporalRelationType
from storysphere.services.kg_migration import (
    migrate_neo4j_to_networkx,
    migrate_networkx_to_neo4j,
)
from storysphere.services.kg_service import KGService

# ── Neo4j double ─────────────────────────────────────────────────────────────


class FakeNeo4j:
    """In-memory stand-in for ``Neo4jKGService``.

    Two things it deliberately models:

    * **Store by id.** A second write of the same record replaces rather than
      duplicates it — what the real implementation gets from ``MERGE``, and
      what the migration's idempotence claim rests on.
    * **One shared database.** The stores are class-level, so a second
      connection sees what the first wrote. Per-instance state would make the
      Neo4j → NetworkX direction read an empty graph and every round-trip
      assertion would pass vacuously.
    """

    entities: dict[str, Entity] = {}
    events: dict[str, Event] = {}
    relations: dict[str, Relation] = {}
    temporal: dict[str, TemporalRelation] = {}
    instances: list[FakeNeo4j] = []

    def __init__(self, url: str, user: str, password: str) -> None:
        self.url = url
        self.closed = False
        self.connectivity_checked = False
        FakeNeo4j.instances.append(self)

    @classmethod
    def reset(cls) -> None:
        cls.entities = {}
        cls.events = {}
        cls.relations = {}
        cls.temporal = {}
        cls.instances = []

    async def verify_connectivity(self) -> None:
        self.connectivity_checked = True

    async def add_entity(self, entity: Entity) -> None:
        FakeNeo4j.entities[entity.id] = entity

    async def add_event(self, event: Event) -> None:
        FakeNeo4j.events[event.id] = event

    async def add_relation(self, relation: Relation) -> None:
        FakeNeo4j.relations[relation.id] = relation

    async def add_temporal_relation(self, tr: TemporalRelation) -> None:
        FakeNeo4j.temporal[tr.id] = tr

    async def close(self) -> None:
        self.closed = True

    async def list_entities(self, **_kw) -> list[Entity]:
        return list(FakeNeo4j.entities.values())

    async def get_events(self, **_kw) -> list[Event]:
        return list(FakeNeo4j.events.values())

    async def get_relations(self, entity_id: str, direction: str = "both") -> list[Relation]:
        if direction == "out":
            return [r for r in FakeNeo4j.relations.values() if r.source_id == entity_id]
        return [
            r
            for r in FakeNeo4j.relations.values()
            if entity_id in (r.source_id, r.target_id)
        ]

    async def get_temporal_relations(self, **_kw) -> list[TemporalRelation]:
        return list(FakeNeo4j.temporal.values())


@pytest.fixture(autouse=True)
def fake_neo4j():
    FakeNeo4j.reset()
    with patch("storysphere.services.kg_service_neo4j.Neo4jKGService", FakeNeo4j):
        yield FakeNeo4j


# ── Source graph ─────────────────────────────────────────────────────────────

DOC = "book-1"


def _entity(name: str, entity_type: EntityType = EntityType.CHARACTER) -> Entity:
    return Entity(name=name, entity_type=entity_type, document_id=DOC)


def _event(title: str, chapter: int) -> Event:
    return Event(
        document_id=DOC,
        title=title,
        event_type=EventType.OTHER,
        description=f"{title} happened.",
        chapter=chapter,
    )


async def _seed(path: Path) -> dict:
    """Build a small but non-trivial graph and save it as NetworkX JSON."""
    svc = KGService(persistence_path=str(path))

    alice = _entity("Alice")
    bob = _entity("Bob")
    sea = _entity("The Sea", EntityType.LOCATION)
    for e in (alice, bob, sea):
        await svc.add_entity(e)

    ev1 = _event("The Meeting", 1)
    ev2 = _event("The Parting", 3)
    for ev in (ev1, ev2):
        await svc.add_event(ev)

    # One directed and one bidirectional relation. The bidirectional one is the
    # interesting case: NetworkX stores it as two edges, the second keyed
    # ``<id>_rev``, and the migration must not import that as a second relation.
    directed = Relation(
        document_id=DOC,
        source_id=alice.id,
        target_id=sea.id,
        relation_type=RelationType.LOCATED_IN,
        description="Alice watches the sea",
        weight=0.8,
        chapters=[1, 2],
    )
    mutual = Relation(
        document_id=DOC,
        source_id=alice.id,
        target_id=bob.id,
        relation_type=RelationType.FRIENDSHIP,
        weight=1.0,
        chapters=[1],
        is_bidirectional=True,
    )
    await svc.add_relation(directed)
    await svc.add_relation(mutual)

    tr = TemporalRelation(
        document_id=DOC,
        source_event_id=ev1.id,
        target_event_id=ev2.id,
        relation_type=TemporalRelationType.BEFORE,
    )
    await svc.add_temporal_relation(tr)

    await svc.save()
    return {
        "entities": [alice, bob, sea],
        "events": [ev1, ev2],
        "directed": directed,
        "mutual": mutual,
        "temporal": tr,
    }


@pytest.fixture
async def source(tmp_path):
    path = tmp_path / "kg.json"
    seeded = await _seed(path)
    seeded["path"] = path
    return seeded


async def _to_neo4j(path: Path, **kw) -> dict[str, int]:
    return await migrate_networkx_to_neo4j(
        json_path=str(path),
        neo4j_url="bolt://test:7687",
        user="neo4j",
        password="pw",
        **kw,
    )


# ── NetworkX → Neo4j ─────────────────────────────────────────────────────────


class TestToNeo4j:
    async def test_missing_source_raises_before_touching_neo4j(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            await _to_neo4j(tmp_path / "no-such.json")

        assert FakeNeo4j.instances == [], "connected before checking the source exists"

    async def test_counts_every_record(self, source):
        counts = await _to_neo4j(source["path"])

        assert counts == {
            "entities": 3,
            "relations": 2,
            "events": 2,
            "temporal_relations": 1,
        }

    async def test_reverse_edges_are_not_imported_as_relations(self, source):
        """A bidirectional relation is two NetworkX edges but one relation.

        Counting the ``_rev`` edge would double every mutual relationship in
        the graph.
        """
        await _to_neo4j(source["path"])
        assert len(FakeNeo4j.relations) == 2
        assert not any(rid.endswith("_rev") for rid in FakeNeo4j.relations)

    async def test_entity_fields_survive(self, source):
        await _to_neo4j(source["path"])
        alice = FakeNeo4j.entities[source["entities"][0].id]
        assert alice.name == "Alice"
        assert alice.entity_type is EntityType.CHARACTER
        assert alice.document_id == DOC

    async def test_relation_fields_survive(self, source):
        await _to_neo4j(source["path"])
        directed = FakeNeo4j.relations[source["directed"].id]
        assert directed.source_id == source["entities"][0].id
        assert directed.target_id == source["entities"][2].id
        assert directed.relation_type is RelationType.LOCATED_IN
        assert directed.weight == 0.8
        assert directed.chapters == [1, 2]

        mutual = FakeNeo4j.relations[source["mutual"].id]
        assert mutual.is_bidirectional is True
        assert mutual.relation_type is RelationType.FRIENDSHIP

    async def test_event_and_temporal_fields_survive(self, source):
        await _to_neo4j(source["path"])
        ev = FakeNeo4j.events[source["events"][0].id]
        assert ev.title == "The Meeting"
        assert ev.chapter == 1

        tr = FakeNeo4j.temporal[source["temporal"].id]
        assert tr.source_event_id == source["events"][0].id
        assert tr.relation_type is TemporalRelationType.BEFORE

    async def test_connection_is_verified_and_closed(self, source):
        await _to_neo4j(source["path"])
        neo = FakeNeo4j.instances[0]

        assert neo.connectivity_checked is True
        assert neo.closed is True, "left the driver open"

    @pytest.mark.parametrize("batch_size", [1, 2, 100])
    async def test_batch_size_does_not_change_the_outcome(self, source, batch_size):
        """Batching is a transaction-size knob, not a filter."""
        counts = await _to_neo4j(source["path"], batch_size=batch_size)

        assert counts["entities"] == 3
        assert counts["events"] == 2
        assert counts["temporal_relations"] == 1

    async def test_running_twice_does_not_duplicate(self, source):
        """The module docstring promises idempotence; hold it to that."""
        await _to_neo4j(source["path"])
        await _to_neo4j(source["path"])

        assert len(FakeNeo4j.entities) == 3
        assert len(FakeNeo4j.relations) == 2


# ── Neo4j → NetworkX ─────────────────────────────────────────────────────────


class TestToNetworkX:
    async def _back(self, tmp_path, name: str = "out.json") -> tuple[dict[str, int], Path]:
        out = tmp_path / name
        counts = await migrate_neo4j_to_networkx(
            neo4j_url="bolt://test:7687",
            user="neo4j",
            password="pw",
            json_path=str(out),
        )
        return counts, out

    async def test_writes_a_loadable_json_file(self, source, tmp_path):
        await _to_neo4j(source["path"])

        _, out = await self._back(tmp_path)

        assert out.exists()
        payload = json.loads(out.read_text(encoding="utf-8"))
        assert set(payload) >= {"entities", "events", "temporal_relations", "edges"}

    async def test_counts_match_what_neo4j_held(self, source, tmp_path):
        await _to_neo4j(source["path"])

        counts, _ = await self._back(tmp_path)

        assert counts == {
            "entities": 3,
            "relations": 2,
            "events": 2,
            "temporal_relations": 1,
        }

    async def test_every_relation_is_written_exactly_once(self, source, tmp_path):
        """The walk visits every entity, but each relation must land once.

        Note on the ``seen_rel_ids`` guard in the implementation: it cannot
        actually fire. The walk asks for ``direction="out"``, whose Cypher is
        ``MATCH (e)-[r]->(other)`` — strictly source-filtered — so a relation
        is only ever returned under its own source entity. Verified by
        mutation: removing the guard leaves every test here green.

        It is defensive, not load-bearing. What this test pins is the property
        that matters either way — one relation in, one relation out.
        """
        await _to_neo4j(source["path"])

        counts, out = await self._back(tmp_path)

        assert counts["relations"] == 2
        payload = json.loads(out.read_text(encoding="utf-8"))
        keys = [e["key"] for e in payload["edges"] if not e["key"].endswith("_rev")]
        assert len(keys) == len(set(keys)), "a relation was written twice"

    async def test_empty_graph_produces_empty_counts(self, tmp_path):
        counts, out = await self._back(tmp_path, "empty.json")

        assert counts == {
            "entities": 0,
            "relations": 0,
            "events": 0,
            "temporal_relations": 0,
        }
        assert out.exists(), "no file written for an empty graph"


# ── Round trip ───────────────────────────────────────────────────────────────


class TestRoundTrip:
    """nx → neo4j → nx must return the graph it started with."""

    @pytest.fixture
    async def returned(self, source, tmp_path) -> KGService:
        await _to_neo4j(source["path"])
        out = tmp_path / "round-trip.json"
        await migrate_neo4j_to_networkx(
            neo4j_url="bolt://test:7687",
            user="neo4j",
            password="pw",
            json_path=str(out),
        )
        svc = KGService(persistence_path=str(out))
        await svc.load()
        return svc

    async def test_entities_survive(self, returned, source):
        names = {e.name for e in await returned.list_entities()}
        assert names == {"Alice", "Bob", "The Sea"}

    async def test_entity_types_survive(self, returned, source):
        sea = await returned.get_entity(source["entities"][2].id)
        assert sea is not None
        assert sea.entity_type is EntityType.LOCATION

    async def test_events_survive(self, returned):
        events = await returned.get_events()
        assert {e.title for e in events} == {"The Meeting", "The Parting"}
        assert {e.chapter for e in events} == {1, 3}

    async def test_relation_payload_survives(self, returned, source):
        rels = await returned.get_relations(source["entities"][0].id, direction="out")
        by_id = {r.id: r for r in rels}

        directed = by_id[source["directed"].id]
        assert directed.weight == 0.8
        assert directed.chapters == [1, 2]
        assert directed.description == "Alice watches the sea"

    async def test_bidirectional_flag_survives(self, returned, source):
        rels = await returned.get_relations(source["entities"][0].id, direction="out")
        mutual = {r.id: r for r in rels}[source["mutual"].id]

        assert mutual.is_bidirectional is True

    async def test_temporal_relations_survive(self, returned, source):
        trs = await returned.get_temporal_relations()

        assert len(trs) == 1
        assert trs[0].source_event_id == source["events"][0].id
        assert trs[0].relation_type is TemporalRelationType.BEFORE
