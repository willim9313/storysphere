from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from domain.entities import Entity, EntityType
from domain.relations import Relation, RelationType


class EntityResponse(BaseModel):
    id: str
    name: str
    entity_type: EntityType
    aliases: list[str]
    attributes: dict[str, Any]
    description: str | None
    first_appearance_chapter: int | None
    mention_count: int

    @classmethod
    def from_domain(cls, e: Entity) -> "EntityResponse":
        return cls(
            id=e.id,
            name=e.name,
            entity_type=e.entity_type,
            aliases=e.aliases,
            attributes=e.attributes,
            description=e.description,
            first_appearance_chapter=e.first_appearance_chapter,
            mention_count=e.mention_count,
        )


class EntityListResponse(BaseModel):
    items: list[EntityResponse]
    total: int


class RelationResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: RelationType
    description: str | None
    weight: float
    chapters: list[int]
    is_bidirectional: bool

    @classmethod
    def from_domain(cls, r: Relation) -> "RelationResponse":
        return cls(
            id=r.id,
            source_id=r.source_id,
            target_id=r.target_id,
            relation_type=r.relation_type,
            description=r.description,
            weight=r.weight,
            chapters=r.chapters,
            is_bidirectional=r.is_bidirectional,
        )


class TimelineEntry(BaseModel):
    event_id: str
    title: str
    chapter: int | None
    description: str | None
    chronological_rank: float | None = None
    narrative_mode: str = "unknown"


class SubgraphResponse(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class RelationStatsResponse(BaseModel):
    stats: dict[str, Any]
