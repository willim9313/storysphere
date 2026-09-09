from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from storysphere.domain.entities import Entity, EntityType


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
    def from_domain(cls, e: Entity) -> EntityResponse:
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
