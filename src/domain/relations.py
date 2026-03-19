from __future__ import annotations

import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RelationType(str, Enum):
    FAMILY = "family"
    FRIENDSHIP = "friendship"
    ROMANCE = "romance"
    ENEMY = "enemy"
    ALLY = "ally"
    SUBORDINATE = "subordinate"
    LOCATED_IN = "located_in"
    MEMBER_OF = "member_of"
    OWNS = "owns"
    OTHER = "other"


class Relation(BaseModel):
    """A directed relationship between two entities in the knowledge graph."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: Optional[str] = None
    source_id: str
    target_id: str
    relation_type: RelationType
    description: Optional[str] = None
    weight: float = Field(default=1.0, ge=0.0, le=1.0, description="Relationship strength")
    chapters: list[int] = Field(default_factory=list, description="Chapters where this appears")
    is_bidirectional: bool = False
