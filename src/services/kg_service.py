"""KGService — NetworkX-backed in-memory knowledge graph.

Provides a thin async interface for adding and querying entities, relations,
and events.  The graph is persisted to a JSON file on save and loaded on
startup (if the file exists).

Neo4j is out of scope for Phase 2; the interface is designed to be compatible
with a future Neo4j backend swap (ADR-009).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import networkx as nx

from domain.entities import Entity, EntityType
from domain.events import Event
from domain.relations import Relation

logger = logging.getLogger(__name__)


class KGService:
    """NetworkX-backed knowledge graph service.

    The graph is a ``MultiDiGraph`` where:
    - Nodes represent entities (node id = Entity.id).
    - Edges represent relations (edge key = Relation.id).
    - Events are stored as node attributes on a special "_events" list.

    Thread-safety: All methods are async but internally synchronous.
    Do not share an instance across OS threads.
    """

    def __init__(self, persistence_path: Optional[str] = None) -> None:
        self._graph: nx.MultiDiGraph = nx.MultiDiGraph()
        self._events: dict[str, Event] = {}  # event_id → Event
        self._entities: dict[str, Entity] = {}  # entity_id → Entity

        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        self._persistence_path = Path(
            persistence_path or settings.kg_persistence_path
        )

    # ── Entity operations ────────────────────────────────────────────────────

    async def add_entity(self, entity: Entity) -> None:
        """Add or replace an entity node in the graph."""
        self._entities[entity.id] = entity
        self._graph.add_node(entity.id, **self._entity_attrs(entity))
        logger.debug("KGService.add_entity: %s (%s)", entity.name, entity.id)

    async def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Return the entity with the given ID, or None."""
        return self._entities.get(entity_id)

    async def get_entity_by_name(self, name: str) -> Optional[Entity]:
        """Return the first entity whose name or alias matches (case-insensitive)."""
        name_lower = name.lower()
        for entity in self._entities.values():
            if entity.name.lower() == name_lower:
                return entity
            if any(a.lower() == name_lower for a in entity.aliases):
                return entity
        return None

    async def list_entities(
        self, entity_type: Optional[EntityType] = None
    ) -> list[Entity]:
        """Return all entities, optionally filtered by type."""
        entities = list(self._entities.values())
        if entity_type is not None:
            entities = [e for e in entities if e.entity_type == entity_type]
        return entities

    # ── Relation operations ──────────────────────────────────────────────────

    async def add_relation(self, relation: Relation) -> None:
        """Add a directed edge for the relation."""
        if relation.source_id not in self._graph or relation.target_id not in self._graph:
            logger.warning(
                "KGService.add_relation: missing node(s) for relation %s. "
                "Ensure entities are added first.",
                relation.id,
            )
            return
        self._graph.add_edge(
            relation.source_id,
            relation.target_id,
            key=relation.id,
            **self._relation_attrs(relation),
        )
        if relation.is_bidirectional:
            self._graph.add_edge(
                relation.target_id,
                relation.source_id,
                key=f"{relation.id}_rev",
                **self._relation_attrs(relation),
            )
        logger.debug("KGService.add_relation: %s", relation.id)

    async def get_relations(
        self, entity_id: str, *, direction: str = "both"
    ) -> list[Relation]:
        """Return all relations for an entity.

        Args:
            entity_id: The entity node ID.
            direction: "out" (outgoing), "in" (incoming), or "both".

        Returns:
            List of ``Relation`` objects reconstructed from edge attributes.
        """
        if entity_id not in self._graph:
            return []
        relations: list[Relation] = []
        seen_ids: set[str] = set()

        def _add(rel: Relation) -> None:
            base = rel.id[:-4] if rel.id.endswith("_rev") else rel.id
            if base not in seen_ids:
                seen_ids.add(base)
                relations.append(rel)

        if direction in ("out", "both"):
            for _, tgt, key, data in self._graph.out_edges(entity_id, keys=True, data=True):
                if not key.endswith("_rev"):
                    _add(self._edge_to_relation(key, entity_id, tgt, data))
        if direction in ("in", "both"):
            for src, _, key, data in self._graph.in_edges(entity_id, keys=True, data=True):
                # Include _rev edges: they represent genuine incoming relations
                _add(self._edge_to_relation(key, src, entity_id, data))
        return relations

    # ── Event operations ─────────────────────────────────────────────────────

    async def add_event(self, event: Event) -> None:
        """Store an event and attach it to all participating entities."""
        self._events[event.id] = event
        for participant_id in event.participants:
            if participant_id in self._graph:
                node_data = self._graph.nodes[participant_id]
                node_events: list[str] = node_data.get("event_ids", [])
                if event.id not in node_events:
                    node_events.append(event.id)
                self._graph.nodes[participant_id]["event_ids"] = node_events
        logger.debug("KGService.add_event: %s", event.id)

    async def get_event(self, event_id: str) -> Optional[Event]:
        """Return the event with the given ID, or None."""
        return self._events.get(event_id)

    async def get_events(self, entity_id: Optional[str] = None) -> list[Event]:
        """Return all events, optionally filtered to those involving an entity."""
        if entity_id is None:
            return list(self._events.values())
        node_data = self._graph.nodes.get(entity_id, {})
        event_ids: list[str] = node_data.get("event_ids", [])
        return [self._events[eid] for eid in event_ids if eid in self._events]

    # ── Timeline / Path / Subgraph queries ──────────────────────────────────

    async def get_entity_timeline(self, entity_id: str) -> list[Event]:
        """Return events involving *entity_id*, sorted by chapter number."""
        events = await self.get_events(entity_id)
        return sorted(events, key=lambda e: e.chapter)

    async def get_relation_paths(
        self,
        source_id: str,
        target_id: str,
        max_length: int = 3,
    ) -> list[list[dict]]:
        """Find all simple paths between two entities (up to *max_length* hops).

        Returns a list of paths.  Each path is a list of dicts::

            [{"entity_id": "...", "name": "..."}, ...]

        with the connecting relation info between consecutive nodes.
        """
        if source_id not in self._graph or target_id not in self._graph:
            return []

        # Use the undirected view so direction doesn't block reachability.
        undirected = self._graph.to_undirected(as_view=True)
        raw_paths: list[list[str]] = list(
            nx.all_simple_paths(undirected, source_id, target_id, cutoff=max_length)
        )

        result: list[list[dict]] = []
        for node_path in raw_paths:
            path_repr: list[dict] = []
            for i, node_id in enumerate(node_path):
                entity = self._entities.get(node_id)
                node_info: dict = {
                    "entity_id": node_id,
                    "name": entity.name if entity else node_id,
                }
                # Attach the relation leading *to* this node (except for the first).
                if i > 0:
                    prev = node_path[i - 1]
                    edge_data = self._best_edge(prev, node_id)
                    node_info["relation_from_prev"] = edge_data
                path_repr.append(node_info)
            result.append(path_repr)
        return result

    async def get_subgraph(self, entity_id: str, k_hops: int = 2) -> dict:
        """Return the *k*-hop ego-graph around *entity_id*.

        Returns::

            {
                "center": entity_id,
                "nodes": [{"entity_id": "...", "name": "...", "entity_type": "..."}],
                "edges": [{"source": "...", "target": "...", "relation_type": "...", ...}],
            }
        """
        if entity_id not in self._graph:
            return {"center": entity_id, "nodes": [], "edges": []}

        ego: nx.MultiDiGraph = nx.ego_graph(
            self._graph, entity_id, radius=k_hops, undirected=True
        )
        nodes: list[dict] = []
        for nid in ego.nodes:
            entity = self._entities.get(nid)
            nodes.append(
                {
                    "entity_id": nid,
                    "name": entity.name if entity else nid,
                    "entity_type": entity.entity_type.value if entity else "unknown",
                }
            )
        edges: list[dict] = []
        seen_keys: set[str] = set()
        for u, v, key, data in ego.edges(keys=True, data=True):
            base_key = key[:-4] if key.endswith("_rev") else key
            if base_key in seen_keys:
                continue
            seen_keys.add(base_key)
            edges.append(
                {
                    "source": u,
                    "target": v,
                    "relation_type": data.get("relation_type", "unknown"),
                    "description": data.get("description"),
                    "weight": data.get("weight", 1.0),
                }
            )
        return {"center": entity_id, "nodes": nodes, "edges": edges}

    async def get_relation_stats(self, entity_id: str | None = None) -> dict:
        """Return relation-type distribution and weight statistics.

        If *entity_id* is given, scoped to that entity; otherwise global.

        Returns::

            {
                "total_relations": int,
                "type_distribution": {"family": 3, ...},
                "weight_avg": float,
                "weight_min": float,
                "weight_max": float,
            }
        """
        if entity_id is not None:
            relations = await self.get_relations(entity_id)
        else:
            # Collect all unique relations (skip _rev duplicates).
            relations = []
            seen: set[str] = set()
            for u, v, key, data in self._graph.edges(keys=True, data=True):
                base_key = key[:-4] if key.endswith("_rev") else key
                if base_key not in seen:
                    seen.add(base_key)
                    relations.append(self._edge_to_relation(key, u, v, data))

        type_dist: dict[str, int] = {}
        weights: list[float] = []
        for rel in relations:
            rtype = rel.relation_type.value
            type_dist[rtype] = type_dist.get(rtype, 0) + 1
            weights.append(rel.weight)

        return {
            "total_relations": len(relations),
            "type_distribution": type_dist,
            "weight_avg": sum(weights) / len(weights) if weights else 0.0,
            "weight_min": min(weights) if weights else 0.0,
            "weight_max": max(weights) if weights else 0.0,
        }

    # ── Private: edge lookup helper ───────────────────────────────────────────

    def _best_edge(self, source: str, target: str) -> dict:
        """Return data for the best (highest-weight) edge between two nodes."""
        # Try forward direction first, then reverse.
        edges = self._graph.get_edge_data(source, target)
        if not edges:
            edges = self._graph.get_edge_data(target, source)
        if not edges:
            return {}
        # edges is a dict keyed by edge-key → pick highest weight
        best = max(edges.values(), key=lambda d: d.get("weight", 0))
        return {
            "relation_type": best.get("relation_type", "unknown"),
            "description": best.get("description"),
            "weight": best.get("weight", 1.0),
        }

    # ── Graph stats ──────────────────────────────────────────────────────────

    @property
    def entity_count(self) -> int:
        return self._graph.number_of_nodes()

    @property
    def relation_count(self) -> int:
        return self._graph.number_of_edges()

    @property
    def event_count(self) -> int:
        return len(self._events)

    # ── Persistence ──────────────────────────────────────────────────────────

    async def save(self) -> None:
        """Persist the graph to JSON on disk."""
        self._persistence_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "entities": {eid: e.model_dump() for eid, e in self._entities.items()},
            "events": {evid: ev.model_dump() for evid, ev in self._events.items()},
            "edges": [
                {
                    "source": u,
                    "target": v,
                    "key": k,
                    **data,
                }
                for u, v, k, data in self._graph.edges(keys=True, data=True)
            ],
        }
        with open(self._persistence_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2, default=str)
        logger.info("KGService saved to %s", self._persistence_path)

    async def load(self) -> None:
        """Load the graph from JSON on disk (if the file exists)."""
        if not self._persistence_path.exists():
            logger.info("KGService: no existing graph at %s", self._persistence_path)
            return
        with open(self._persistence_path, encoding="utf-8") as fh:
            payload = json.load(fh)
        for eid, edata in payload.get("entities", {}).items():
            entity = Entity.model_validate(edata)
            self._entities[eid] = entity
            self._graph.add_node(eid, **self._entity_attrs(entity))
        for evid, evdata in payload.get("events", {}).items():
            self._events[evid] = Event.model_validate(evdata)
        for edge in payload.get("edges", []):
            src = edge.pop("source")
            tgt = edge.pop("target")
            key = edge.pop("key")
            self._graph.add_edge(src, tgt, key=key, **edge)
        logger.info(
            "KGService loaded from %s: %d entities, %d edges",
            self._persistence_path,
            self.entity_count,
            self.relation_count,
        )

    # ── Private helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _entity_attrs(entity: Entity) -> dict[str, Any]:
        return {
            "name": entity.name,
            "entity_type": entity.entity_type.value,
            "aliases": entity.aliases,
            "mention_count": entity.mention_count,
        }

    @staticmethod
    def _relation_attrs(relation: Relation) -> dict[str, Any]:
        return {
            "relation_type": relation.relation_type.value,
            "description": relation.description,
            "weight": relation.weight,
            "chapters": relation.chapters,
            "is_bidirectional": relation.is_bidirectional,
        }

    @staticmethod
    def _edge_to_relation(
        key: str,
        source_id: str,
        target_id: str,
        data: dict[str, Any],
    ) -> Relation:
        from domain.relations import RelationType  # noqa: PLC0415

        return Relation(
            id=key,
            source_id=source_id,
            target_id=target_id,
            relation_type=RelationType(data.get("relation_type", "other")),
            description=data.get("description"),
            weight=data.get("weight", 1.0),
            chapters=data.get("chapters", []),
            is_bidirectional=data.get("is_bidirectional", False),
        )
