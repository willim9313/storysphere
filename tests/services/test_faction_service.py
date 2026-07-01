"""Unit tests for FactionService (F-16)."""

from __future__ import annotations

import pytest

from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.relations import Relation, RelationType
from storysphere.services.faction_service import FactionService
from storysphere.services.kg_service import KGService

BOOK_ID = "book-1"


def _char(name: str, mention_count: int = 1) -> Entity:
    return Entity(
        name=name,
        entity_type=EntityType.CHARACTER,
        document_id=BOOK_ID,
        mention_count=mention_count,
    )


def _rel(
    src: str,
    tgt: str,
    rtype: RelationType,
    weight: float = 1.0,
    chapters: list[int] | None = None,
) -> Relation:
    return Relation(
        source_id=src,
        target_id=tgt,
        relation_type=rtype,
        weight=weight,
        document_id=BOOK_ID,
        chapters=chapters or [1],
    )


@pytest.fixture
def kg(tmp_path):
    return KGService(persistence_path=str(tmp_path / "kg.json"))


@pytest.fixture
def service(kg):
    return FactionService(kg_service=kg)


class TestFactionDetection:
    @pytest.mark.asyncio
    async def test_no_characters_returns_empty(self, service):
        result = await service.detect_factions(BOOK_ID)
        assert result.book_id == BOOK_ID
        assert result.factions == []
        assert result.unaffiliated_entity_ids == []

    @pytest.mark.asyncio
    async def test_isolated_characters_become_unaffiliated(self, service, kg):
        a = _char("Alice")
        b = _char("Bob")
        await kg.add_entity(a)
        await kg.add_entity(b)

        result = await service.detect_factions(BOOK_ID)
        assert result.factions == []
        assert set(result.unaffiliated_entity_ids) == {a.id, b.id}
        assert set(result.unaffiliated_names) == {"Alice", "Bob"}

    @pytest.mark.asyncio
    async def test_two_allies_form_one_faction(self, service, kg):
        a = _char("Alice", mention_count=10)
        b = _char("Bob", mention_count=5)
        await kg.add_entity(a)
        await kg.add_entity(b)
        await kg.add_relation(_rel(a.id, b.id, RelationType.ALLY, weight=0.8))

        result = await service.detect_factions(BOOK_ID)
        assert len(result.factions) == 1
        faction = result.factions[0]
        assert set(faction.member_ids) == {a.id, b.id}
        assert faction.cohesion_score > 0
        # Alice has higher mention_count → first in top_member_names
        assert faction.top_member_names[0] == "Alice"
        assert result.unaffiliated_entity_ids == []

    @pytest.mark.asyncio
    async def test_enemy_edge_produces_rivalry(self, service, kg):
        # Two clusters of allies + an enemy edge between them
        a, b = _char("Alice"), _char("Bob")
        c, d = _char("Carol"), _char("Dave")
        for e in (a, b, c, d):
            await kg.add_entity(e)
        await kg.add_relation(_rel(a.id, b.id, RelationType.ALLY))
        await kg.add_relation(_rel(c.id, d.id, RelationType.ALLY))
        await kg.add_relation(_rel(a.id, c.id, RelationType.ENEMY, weight=0.9))

        result = await service.detect_factions(BOOK_ID)
        assert len(result.factions) == 2
        assert len(result.relations) == 1
        rel = result.relations[0]
        assert rel.rivalry > 0
        assert rel.cooperation == 0

    @pytest.mark.asyncio
    async def test_non_character_relations_are_ignored(self, service, kg):
        # Character ↔ Location LOCATED_IN must not affect faction detection
        alice = _char("Alice")
        loc = Entity(
            name="Castle",
            entity_type=EntityType.LOCATION,
            document_id=BOOK_ID,
        )
        await kg.add_entity(alice)
        await kg.add_entity(loc)
        await kg.add_relation(_rel(alice.id, loc.id, RelationType.LOCATED_IN))

        result = await service.detect_factions(BOOK_ID)
        assert result.factions == []
        assert result.unaffiliated_entity_ids == [alice.id]

    @pytest.mark.asyncio
    async def test_min_cluster_size_pushes_small_factions_to_unaffiliated(
        self, service, kg
    ):
        # 2-member ally pair forms a faction by default (size=2), but with
        # min_cluster_size=3 it should be pushed to unaffiliated.
        a, b = _char("Alice"), _char("Bob")
        await kg.add_entity(a)
        await kg.add_entity(b)
        await kg.add_relation(_rel(a.id, b.id, RelationType.ALLY))

        default_result = await service.detect_factions(BOOK_ID)
        assert len(default_result.factions) == 1

        strict_result = await service.detect_factions(BOOK_ID, min_cluster_size=3)
        assert strict_result.factions == []
        assert set(strict_result.unaffiliated_entity_ids) == {a.id, b.id}

    @pytest.mark.asyncio
    async def test_resolution_param_is_accepted(self, service, kg):
        # Sanity: passing resolution should not crash and should return a
        # well-formed analysis. (Specific partition behaviour depends on
        # NetworkX internals; we just assert the call shape works.)
        a, b = _char("Alice"), _char("Bob")
        await kg.add_entity(a)
        await kg.add_entity(b)
        await kg.add_relation(_rel(a.id, b.id, RelationType.ALLY))

        result = await service.detect_factions(BOOK_ID, resolution=2.5)
        assert result.book_id == BOOK_ID
        assert isinstance(result.factions, list)

    @pytest.mark.asyncio
    async def test_subordinate_relation_excluded_from_positive(self, service, kg):
        # SUBORDINATE is intentionally excluded — two chars with only a
        # SUBORDINATE edge should NOT form a faction.
        a, b = _char("Alice"), _char("Bob")
        await kg.add_entity(a)
        await kg.add_entity(b)
        await kg.add_relation(_rel(a.id, b.id, RelationType.SUBORDINATE))

        result = await service.detect_factions(BOOK_ID)
        assert result.factions == []
        assert set(result.unaffiliated_entity_ids) == {a.id, b.id}
