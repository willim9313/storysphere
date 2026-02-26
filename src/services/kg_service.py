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

    async def get_events(self, entity_id: Optional[str] = None) -> list[Event]:
        """Return all events, optionally filtered to those involving an entity."""
        if entity_id is None:
            return list(self._events.values())
        node_data = self._graph.nodes.get(entity_id, {})
        event_ids: list[str] = node_data.get("event_ids", [])
        return [self._events[eid] for eid in event_ids if eid in self._events]

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
