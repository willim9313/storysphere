"""GlobalTimelineService — DAG-based chronological ranking of events.

Pure algorithm layer with no LLM dependency.  Given a set of
TemporalRelation edges, builds a directed acyclic graph (DAG),
resolves any cycles by removing the lowest-confidence edges, and
computes a normalised chronological rank (0.0–1.0) for each event
via topological sorting.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import networkx as nx

from domain.temporal import TemporalRelationType

if TYPE_CHECKING:
    from domain.events import Event
    from domain.temporal import TemporalRelation

logger = logging.getLogger(__name__)


class GlobalTimelineService:
    """Stateless service that computes chronological ranks from temporal edges."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build_and_rank(
        self,
        relations: list[TemporalRelation],
        events: dict[str, Event],
    ) -> dict[str, float]:
        """End-to-end: build DAG → resolve cycles → compute ranks.

        Returns a mapping ``{event_id: chronological_rank}`` where rank
        is normalised to 0.0 (earliest) – 1.0 (latest).  Events not
        reachable in the DAG are **omitted** from the result.
        """
        dag, simultaneous_pairs = self.build_temporal_dag(relations)
        dag, cycles_resolved = self.resolve_cycles(dag)
        if cycles_resolved:
            logger.info("Resolved %d cycle(s) in temporal DAG", cycles_resolved)
        ranks = self.compute_chronological_ranks(dag, events, simultaneous_pairs)
        return ranks

    # ------------------------------------------------------------------
    # DAG construction
    # ------------------------------------------------------------------

    @staticmethod
    def build_temporal_dag(
        relations: list[TemporalRelation],
    ) -> tuple[nx.DiGraph, list[tuple[str, str]]]:
        """Build a directed graph from temporal relations.

        * ``BEFORE`` / ``CAUSES`` / ``DURING`` → directed edge (source → target).
        * ``SIMULTANEOUS`` → recorded as constraint pairs (same rank later).
        * ``UNKNOWN`` → skipped.

        Returns ``(graph, simultaneous_pairs)``.
        """
        G = nx.DiGraph()
        simultaneous_pairs: list[tuple[str, str]] = []

        for rel in relations:
            if rel.relation_type in (
                TemporalRelationType.BEFORE,
                TemporalRelationType.CAUSES,
                TemporalRelationType.DURING,
            ):
                # If an edge already exists keep the higher-confidence one.
                if G.has_edge(rel.source_event_id, rel.target_event_id):
                    existing = G[rel.source_event_id][rel.target_event_id]
                    if rel.confidence > existing.get("confidence", 0.0):
                        G[rel.source_event_id][rel.target_event_id].update(
                            confidence=rel.confidence,
                            relation_type=rel.relation_type.value,
                        )
                else:
                    G.add_edge(
                        rel.source_event_id,
                        rel.target_event_id,
                        confidence=rel.confidence,
                        relation_type=rel.relation_type.value,
                    )
            elif rel.relation_type == TemporalRelationType.SIMULTANEOUS:
                simultaneous_pairs.append(
                    (rel.source_event_id, rel.target_event_id)
                )
            # UNKNOWN → skip

        return G, simultaneous_pairs

    # ------------------------------------------------------------------
    # Cycle resolution
    # ------------------------------------------------------------------

    @staticmethod
    def resolve_cycles(G: nx.DiGraph) -> tuple[nx.DiGraph, int]:
        """Remove lowest-confidence edges until the graph is acyclic.

        Returns ``(graph, number_of_edges_removed)``.
        """
        removed = 0
        while not nx.is_directed_acyclic_graph(G):
            try:
                cycle = nx.find_cycle(G, orientation="original")
            except nx.NetworkXNoCycle:
                break
            # Find the weakest edge in this cycle.
            weakest_u, weakest_v = cycle[0][0], cycle[0][1]
            weakest_conf = G[weakest_u][weakest_v].get("confidence", 0.0)
            for u, v, *_ in cycle:
                conf = G[u][v].get("confidence", 0.0)
                if conf < weakest_conf:
                    weakest_u, weakest_v = u, v
                    weakest_conf = conf
            logger.debug(
                "Removing cycle edge %s → %s (confidence=%.2f)",
                weakest_u,
                weakest_v,
                weakest_conf,
            )
            G.remove_edge(weakest_u, weakest_v)
            removed += 1
        return G, removed

    # ------------------------------------------------------------------
    # Rank computation
    # ------------------------------------------------------------------

    @staticmethod
    def compute_chronological_ranks(
        G: nx.DiGraph,
        events: dict[str, Event],
        simultaneous_pairs: list[tuple[str, str]] | None = None,
    ) -> dict[str, float]:
        """Compute normalised chronological ranks via topological layering.

        * Uses ``nx.topological_generations`` to assign layer indices.
        * Within each layer, events are sub-sorted by ``narrative_position``
          (falling back to ``chapter``).
        * ``SIMULTANEOUS`` pairs are forced to the same rank.
        * Final ranks are normalised to [0.0, 1.0].
        """
        if not G.nodes:
            return {}

        # Assign a layer index to each node.
        # topological_generations yields sets of nodes with no predecessors
        # in the remaining subgraph — i.e. nodes at the same depth.
        layer_of: dict[str, int] = {}
        for layer_idx, generation in enumerate(nx.topological_generations(G)):
            for node in generation:
                layer_of[node] = layer_idx

        # Also include isolated events that were added as nodes but have no edges.
        # (They remain at layer 0 but will get sorted by narrative position.)

        # Sub-sort within each layer by narrative_position / chapter.
        def _sort_key(event_id: str) -> tuple[int, int, int]:
            evt = events.get(event_id)
            if evt is None:
                return (layer_of.get(event_id, 0), 0, 0)
            return (
                layer_of.get(event_id, 0),
                evt.narrative_position if evt.narrative_position is not None else 0,
                evt.chapter,
            )

        sorted_ids = sorted(layer_of.keys(), key=_sort_key)

        # Build raw rank (sequential integer).
        raw_rank: dict[str, int] = {}
        for idx, eid in enumerate(sorted_ids):
            raw_rank[eid] = idx

        # Force SIMULTANEOUS pairs to share the lower rank.
        if simultaneous_pairs:
            for a, b in simultaneous_pairs:
                if a in raw_rank and b in raw_rank:
                    shared = min(raw_rank[a], raw_rank[b])
                    raw_rank[a] = shared
                    raw_rank[b] = shared

        # Normalise to [0.0, 1.0].
        max_rank = max(raw_rank.values()) if raw_rank else 0
        if max_rank == 0:
            return {eid: 0.0 for eid in raw_rank}

        return {eid: r / max_rank for eid, r in raw_rank.items()}
