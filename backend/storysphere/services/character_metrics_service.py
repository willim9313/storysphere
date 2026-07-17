"""CharacterMetricsService — character centrality on the full entity graph.

Builds an undirected, unweighted NetworkX graph from *all* entities and
relations in a book (not just characters — degree must reflect a character's
connections to locations, organizations, etc.), runs ``nx.pagerank`` on the
full graph, and returns ``{pagerank, degree}`` for character-type entities
only.

Pure graph computation — no LLM calls. Mirrors ``FactionService`` (F-16).
"""

from __future__ import annotations

import logging

import networkx as nx

from storysphere.domain.character_metrics import CharacterMetric, CharacterMetricsAnalysis
from storysphere.domain.entities import EntityType

logger = logging.getLogger(__name__)


class CharacterMetricsService:
    def __init__(self, kg_service) -> None:
        self._kg = kg_service

    async def compute_metrics(self, book_id: str) -> CharacterMetricsAnalysis:
        """Return PageRank + degree for every character entity in a book.

        Degree is computed on the full entity-relation graph (characters,
        locations, organizations, …), so a character's connections to
        non-character entities are reflected — not just character-to-character
        edges (unlike ``FactionService``, which only considers character pairs).
        """
        entities = await self._kg.list_entities(document_id=book_id)
        relations = await self._kg.list_relations(document_id=book_id)

        entity_map = {e.id: e for e in entities}

        g: nx.Graph = nx.Graph()
        for e in entities:
            g.add_node(e.id)
        for r in relations:
            if r.source_id not in entity_map or r.target_id not in entity_map:
                continue
            if r.source_id == r.target_id:
                continue
            g.add_edge(r.source_id, r.target_id)

        pagerank: dict[str, float] = nx.pagerank(g) if g.number_of_nodes() else {}

        metrics = [
            CharacterMetric(
                entity_id=e.id,
                name=e.name,
                pagerank=round(pagerank.get(e.id, 0.0), 6),
                degree=g.degree(e.id) if e.id in g else 0,
            )
            for e in entities
            if e.entity_type == EntityType.CHARACTER
        ]

        logger.info(
            "CharacterMetricsService: book=%s → %d characters, %d total nodes, %d edges",
            book_id, len(metrics), g.number_of_nodes(), g.number_of_edges(),
        )

        return CharacterMetricsAnalysis(book_id=book_id, metrics=metrics)
