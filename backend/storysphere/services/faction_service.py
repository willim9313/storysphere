"""FactionService — F-16 character faction detection via modularity clustering.

Builds an undirected weighted graph of positive character-to-character relations
(ALLY, FAMILY, FRIENDSHIP, MEMBER_OF, ROMANCE), runs NetworkX
``greedy_modularity_communities``, and aggregates inter-faction cooperation /
rivalry. Pure graph computation — no LLM calls.
"""

from __future__ import annotations

import logging

import networkx as nx

from storysphere.domain.entities import EntityType
from storysphere.domain.faction import Faction, FactionAnalysis, FactionRelation
from storysphere.domain.relations import RelationType

logger = logging.getLogger(__name__)

POSITIVE_TYPES = {
    RelationType.ALLY,
    RelationType.FAMILY,
    RelationType.FRIENDSHIP,
    RelationType.MEMBER_OF,
    RelationType.ROMANCE,
}
ENEMY_TYPES = {RelationType.ENEMY}


class FactionService:
    def __init__(self, kg_service) -> None:
        self._kg = kg_service

    async def detect_factions(
        self,
        book_id: str,
        chapter: int | None = None,
        resolution: float = 1.0,
        min_cluster_size: int = 2,
    ) -> FactionAnalysis:
        """Run faction detection on a book (optionally a chapter snapshot).

        Args:
            book_id: Document ID.
            chapter: Optional chapter snapshot (reading order).
            resolution: ``greedy_modularity_communities`` resolution parameter.
                Higher → more, smaller communities; lower → fewer, larger ones.
            min_cluster_size: Communities smaller than this go to unaffiliated.
                Must be ≥ 2 (a faction by definition has ≥ 2 members).
        """
        if min_cluster_size < 2:
            min_cluster_size = 2
        if chapter is not None:
            _, snap_entities, snap_relations = await self._kg.get_snapshot(
                book_id, "chapter", chapter
            )
            char_ids = {
                e.id for e in snap_entities if e.entity_type == EntityType.CHARACTER
            }
            entity_map = {e.id: e for e in snap_entities if e.id in char_ids}
            relations = snap_relations
        else:
            all_entities = await self._kg.list_entities(document_id=book_id)
            char_ids = {
                e.id for e in all_entities if e.entity_type == EntityType.CHARACTER
            }
            entity_map = {e.id: e for e in all_entities if e.id in char_ids}
            relations = await self._kg.list_relations(document_id=book_id)

        # Build undirected weighted graph; collect enemy edges separately.
        g: nx.Graph = nx.Graph()
        for eid in char_ids:
            g.add_node(eid)
        enemy_edges: list[tuple[str, str, float]] = []
        for r in relations:
            if r.source_id not in char_ids or r.target_id not in char_ids:
                continue
            if r.source_id == r.target_id:
                continue
            if r.relation_type in POSITIVE_TYPES:
                if g.has_edge(r.source_id, r.target_id):
                    g[r.source_id][r.target_id]["weight"] += r.weight
                else:
                    g.add_edge(r.source_id, r.target_id, weight=r.weight)
            elif r.relation_type in ENEMY_TYPES:
                enemy_edges.append((r.source_id, r.target_id, r.weight))

        if g.number_of_nodes() == 0:
            return FactionAnalysis(
                book_id=book_id,
                chapter=chapter,
                factions=[],
                relations=[],
                unaffiliated_entity_ids=[],
                unaffiliated_names=[],
            )

        # greedy_modularity_communities requires at least one edge; otherwise
        # treat every isolated node as unaffiliated.
        if g.number_of_edges() == 0:
            unaffiliated_ids = list(char_ids)
            return FactionAnalysis(
                book_id=book_id,
                chapter=chapter,
                factions=[],
                relations=[],
                unaffiliated_entity_ids=unaffiliated_ids,
                unaffiliated_names=[
                    entity_map[e].name for e in unaffiliated_ids if e in entity_map
                ],
            )

        communities = list(
            nx.algorithms.community.greedy_modularity_communities(
                g, weight="weight", resolution=resolution
            )
        )

        factions: list[Faction] = []
        unaffiliated_ids: list[str] = []
        for i, community in enumerate(communities):
            members = list(community)
            if len(members) < min_cluster_size:
                unaffiliated_ids.extend(members)
                continue
            member_set = set(members)
            intra_w = sum(
                data.get("weight", 1.0)
                for u, v, data in g.edges(data=True)
                if u in member_set and v in member_set
            )
            members_sorted = sorted(
                members,
                key=lambda eid: (
                    entity_map[eid].mention_count if eid in entity_map else 0
                ),
                reverse=True,
            )
            factions.append(
                Faction(
                    id=f"faction:{i}",
                    label=f"Faction {i + 1}",
                    member_ids=members,
                    cohesion_score=round(intra_w / len(members), 3),
                    top_member_names=[
                        entity_map[e].name
                        for e in members_sorted[:3]
                        if e in entity_map
                    ],
                )
            )

        faction_of = {eid: f.id for f in factions for eid in f.member_ids}
        sizes = {f.id: len(f.member_ids) for f in factions}

        coop: dict[tuple[str, str], float] = {}
        riv: dict[tuple[str, str], float] = {}

        for u, v, data in g.edges(data=True):
            fu, fv = faction_of.get(u), faction_of.get(v)
            if fu and fv and fu != fv:
                key = tuple(sorted([fu, fv]))
                coop[key] = coop.get(key, 0.0) + data.get("weight", 1.0)

        for u, v, w in enemy_edges:
            fu, fv = faction_of.get(u), faction_of.get(v)
            if fu and fv and fu != fv:
                key = tuple(sorted([fu, fv]))
                riv[key] = riv.get(key, 0.0) + w

        def _norm(val: float, k: tuple[str, str]) -> float:
            denom = sizes.get(k[0], 1) * sizes.get(k[1], 1)
            if denom <= 0:
                return 0.0
            return round(min(val / denom, 1.0), 3)

        faction_relations = [
            FactionRelation(
                source_faction_id=k[0],
                target_faction_id=k[1],
                cooperation=_norm(coop.get(k, 0.0), k),
                rivalry=_norm(riv.get(k, 0.0), k),
            )
            for k in set(coop) | set(riv)
        ]

        logger.info(
            "FactionService: book=%s chapter=%s → %d factions, %d unaffiliated, %d relations",
            book_id,
            chapter,
            len(factions),
            len(unaffiliated_ids),
            len(faction_relations),
        )

        return FactionAnalysis(
            book_id=book_id,
            chapter=chapter,
            factions=factions,
            relations=faction_relations,
            unaffiliated_entity_ids=unaffiliated_ids,
            unaffiliated_names=[
                entity_map[e].name for e in unaffiliated_ids if e in entity_map
            ],
        )
