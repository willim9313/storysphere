from __future__ import annotations

import uuid
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class EntityType(str, Enum):
    CHARACTER = "character"
    LOCATION = "location"
    ORGANIZATION = "organization"
    OBJECT = "object"
    CONCEPT = "concept"
    OTHER = "other"


class SpanRef(BaseModel):
    """A reference to a text span where a surface concept appears."""

    chunk_id: str
    start: int
    end: int
    text: str


class Entity(BaseModel):
    """A named entity extracted from a novel (character, location, org, …)."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    entity_type: EntityType
    aliases: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None
    document_id: Optional[str] = None
    first_appearance_chapter: Optional[int] = None
    mention_count: int = 0

    # --- Concept provenance fields (B-024) ---
    extraction_method: Literal["ner", "inferred"] = "ner"
    source_spans: Optional[list[SpanRef]] = None
    inferred_by: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Entity):
            return self.id == other.id
        return False
