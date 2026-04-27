from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class InferenceStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class InferredRelationType(str, Enum):
    POTENTIAL_ALLY = "potential_ally"
    POTENTIAL_ENEMY = "potential_enemy"
    POTENTIAL_FRIENDSHIP = "potential_friendship"
    POTENTIAL_ASSOCIATE = "potential_associate"
    UNKNOWN = "unknown"


class InferredRelation(BaseModel):
    """A structurally inferred (not text-explicit) relation candidate between two entities."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    # source_id is always lexicographically <= target_id to prevent duplicates
    source_id: str
    target_id: str

    common_neighbor_count: int = 0
    adamic_adar_score: float = 0.0
    confidence: float = Field(ge=0.0, le=1.0)

    suggested_relation_type: InferredRelationType = InferredRelationType.UNKNOWN
    # Human-readable basis, e.g. "共同鄰居: 李四, 王五"
    reasoning: str = ""

    status: InferenceStatus = InferenceStatus.PENDING
    # Populated after user confirms and a Relation is written to the KG
    confirmed_relation_id: Optional[str] = None

    # Earliest chapter where both endpoints are present in the graph snapshot
    # = max(source.first_appearance_chapter, target.first_appearance_chapter)
    # None means no chapter constraint (show regardless of snapshot position)
    visible_from_chapter: Optional[int] = None

    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
