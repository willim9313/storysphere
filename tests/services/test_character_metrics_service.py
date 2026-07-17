"""Unit tests for CharacterMetricsService (character-page-revamp #1 quadrant view)."""

from __future__ import annotations

import pytest

from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.relations import Relation, RelationType
from storysphere.services.character_metrics_service import CharacterMetricsService
from storysphere.services.kg_service import KGService

BOOK_ID = "book-1"


def _char(name: str, mention_count: int = 1) -> Entity:
    return Entity(
        name=name,
        entity_type=EntityType.CHARACTER,
        document_id=BOOK_ID,
        mention_count=mention_count,
    )


def _loc(name: str) -> Entity:
    return Entity(name=name, entity_type=EntityType.LOCATION, document_id=BOOK_ID)


def _rel(src: str, tgt: str, rtype: RelationType = RelationType.ALLY) -> Relation:
    return Relation(
        source_id=src, target_id=tgt, relation_type=rtype, document_id=BOOK_ID,
    )


@pytest.fixture
def kg(tmp_path):
    return KGService(persistence_path=str(tmp_path / "kg.json"))


@pytest.fixture
def service(kg):
    return CharacterMetricsService(kg_service=kg)


class TestCharacterMetrics:
    @pytest.mark.asyncio
    async def test_empty_book_returns_empty_metrics(self, service):
        result = await service.compute_metrics(BOOK_ID)
        assert result.book_id == BOOK_ID
        assert result.metrics == []

    @pytest.mark.asyncio
    async def test_characters_with_no_edges_get_zero_degree_and_equal_pagerank(
        self, service, kg,
    ):
        a, b = _char("Alice"), _char("Bob")
        await kg.add_entity(a)
        await kg.add_entity(b)

        result = await service.compute_metrics(BOOK_ID)
        assert len(result.metrics) == 2
        for m in result.metrics:
            assert m.degree == 0
            assert m.pagerank == pytest.approx(0.5, abs=1e-6)

    @pytest.mark.asyncio
    async def test_only_character_entities_are_returned(self, service, kg):
        alice = _char("Alice")
        castle = _loc("Castle")
        await kg.add_entity(alice)
        await kg.add_entity(castle)
        await kg.add_relation(_rel(alice.id, castle.id, RelationType.LOCATED_IN))

        result = await service.compute_metrics(BOOK_ID)
        names = {m.name for m in result.metrics}
        assert names == {"Alice"}

    @pytest.mark.asyncio
    async def test_degree_counts_non_character_edges(self, service, kg):
        """Degree reflects the FULL entity graph, not just character-character edges."""
        alice = _char("Alice")
        castle = _loc("Castle")
        forest = _loc("Forest")
        await kg.add_entity(alice)
        await kg.add_entity(castle)
        await kg.add_entity(forest)
        await kg.add_relation(_rel(alice.id, castle.id, RelationType.LOCATED_IN))
        await kg.add_relation(_rel(alice.id, forest.id, RelationType.LOCATED_IN))

        result = await service.compute_metrics(BOOK_ID)
        alice_metric = next(m for m in result.metrics if m.name == "Alice")
        assert alice_metric.degree == 2

    @pytest.mark.asyncio
    async def test_more_connected_character_has_higher_pagerank(self, service, kg):
        hub = _char("Hub")
        a, b, c = _char("A"), _char("B"), _char("C")
        for e in (hub, a, b, c):
            await kg.add_entity(e)
        await kg.add_relation(_rel(hub.id, a.id))
        await kg.add_relation(_rel(hub.id, b.id))
        await kg.add_relation(_rel(hub.id, c.id))

        result = await service.compute_metrics(BOOK_ID)
        by_name = {m.name: m for m in result.metrics}
        assert by_name["Hub"].pagerank > by_name["A"].pagerank
        assert by_name["Hub"].degree == 3
        assert by_name["A"].degree == 1

    @pytest.mark.asyncio
    async def test_self_loop_relation_is_ignored(self, service, kg):
        alice = _char("Alice")
        await kg.add_entity(alice)
        await kg.add_relation(_rel(alice.id, alice.id))

        result = await service.compute_metrics(BOOK_ID)
        alice_metric = next(m for m in result.metrics if m.name == "Alice")
        assert alice_metric.degree == 0
