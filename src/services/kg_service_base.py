"""KGServiceBase — abstract interface for all knowledge-graph backends.

Both NetworkX (default) and Neo4j implementations must satisfy this contract.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from domain.entities import Entity, EntityType
from domain.events import Event
from domain.relations import Relation
from domain.temporal import TemporalRelation
from services.query_models import RelationPath, RelationStats, Subgraph


class KGServiceBase(ABC):
    """Abstract async interface for the StorySphere knowledge graph."""

    # ── Entity operations ────────────────────────────────────────────────────

    @abstractmethod
    async def add_entity(self, entity: Entity) -> None:
        """Add or replace an entity node."""

    @abstractmethod
    async def get_entity(self, entity_id: str) -> Entity | None:
        """Return the entity with the given ID, or None."""

    @abstractmethod
    async def get_entity_by_name(self, name: str) -> Entity | None:
        """Return the first entity whose name or alias matches (case-insensitive)."""

    @abstractmethod
    async def list_entities(
        self,
        entity_type: EntityType | None = None,
        document_id: str | None = None,
        extraction_method: str | None = None,
    ) -> list[Entity]:
        """Return entities, optionally filtered by type / document / extraction_method."""

    # ── Relation operations ──────────────────────────────────────────────────

    @abstractmethod
    async def add_relation(self, relation: Relation) -> None:
        """Add a directed relation edge."""

    @abstractmethod
    async def get_relations(
        self, entity_id: str, *, direction: str = "both"
    ) -> list[Relation]:
        """Return relations for an entity.  direction: "out" | "in" | "both"."""

    # ── Event operations ─────────────────────────────────────────────────────

    @abstractmethod
    async def add_event(self, event: Event) -> None:
        """Store an event and attach it to participating entities."""

    @abstractmethod
    async def get_event(self, event_id: str) -> Event | None:
        """Return the event with the given ID, or None."""

    @abstractmethod
    async def get_events(
        self,
        entity_id: str | None = None,
        document_id: str | None = None,
    ) -> list[Event]:
        """Return events, optionally filtered by entity and/or document."""

    # ── Temporal relation operations ──────────────────────────────────────────

    @abstractmethod
    async def add_temporal_relation(self, tr: TemporalRelation) -> None:
        """Store a temporal relation between two events."""

    @abstractmethod
    async def get_temporal_relations(
        self, document_id: str | None = None
    ) -> list[TemporalRelation]:
        """Return temporal relations, optionally filtered by document."""

    @abstractmethod
    async def remove_temporal_relations(self, document_id: str) -> int:
        """Remove all temporal relations for a document.  Returns count removed."""

    @abstractmethod
    async def update_event_rank(self, event_id: str, rank: float) -> None:
        """Set the chronological_rank on an existing event."""

    @abstractmethod
    async def update_event_chron_index(self, event_id: str, chron_index: int) -> None:
        """Set the chron_index on an existing event."""

    @abstractmethod
    async def update_entity_chron_index(
        self, entity_id: str, first_chron_index: int
    ) -> None:
        """Set the first_chron_index on an existing entity."""

    @abstractmethod
    async def list_relations(
        self, document_id: str | None = None
    ) -> list[Relation]:
        """Return all relations, optionally filtered by document."""

    @abstractmethod
    async def get_snapshot(
        self,
        book_id: str,
        mode: str,
        position: int,
    ) -> tuple[list[Event], list[Entity], list[Relation]]:
        """Return (events, entities, relations) visible at the given position."""

    # ── Timeline / Path / Subgraph queries ──────────────────────────────────

    @abstractmethod
    async def get_entity_timeline(
        self, entity_id: str, sort_by: str = "narrative"
    ) -> list[Event]:
        """Return events involving entity_id, sorted narratively or chronologically."""

    @abstractmethod
    async def get_relation_paths(
        self,
        source_id: str,
        target_id: str,
        max_length: int = 3,
    ) -> list[RelationPath]:
        """Find simple paths between two entities (up to max_length hops)."""

    @abstractmethod
    async def get_subgraph(self, entity_id: str, k_hops: int = 2) -> Subgraph:
        """Return the k-hop ego-graph around entity_id."""

    @abstractmethod
    async def get_relation_stats(self, entity_id: str | None = None) -> RelationStats:
        """Return relation-type distribution and weight statistics."""

    # ── Document-scoped removal ─────────────────────────────────────────────

    @abstractmethod
    async def remove_by_document(self, document_id: str) -> dict[str, int]:
        """Remove all entities, relations, and events for a document."""

    # ── Persistence ──────────────────────────────────────────────────────────

    @abstractmethod
    async def save(self) -> None:
        """Persist current state (no-op for always-online backends)."""

    @abstractmethod
    async def load(self) -> None:
        """Load state from storage (no-op for always-online backends)."""

    # ── Stats ────────────────────────────────────────────────────────────────

    @property
    @abstractmethod
    def entity_count(self) -> int:
        """Number of entity nodes."""

    @property
    @abstractmethod
    def relation_count(self) -> int:
        """Number of relation edges."""

    @property
    @abstractmethod
    def event_count(self) -> int:
        """Number of events."""
