from __future__ import annotations

import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    PLOT = "plot"
    CONFLICT = "conflict"
    REVELATION = "revelation"
    TURNING_POINT = "turning_point"
    MEETING = "meeting"
    BATTLE = "battle"
    DEATH = "death"
    ROMANCE = "romance"
    ALLIANCE = "alliance"
    OTHER = "other"


class Event(BaseModel):
    """A significant plot event extracted from a novel chapter."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: Optional[str] = None
    title: str
    event_type: EventType
    description: str
    chapter: int
    participants: list[str] = Field(default_factory=list, description="Entity IDs involved")
    location_id: Optional[str] = None
    significance: Optional[str] = None
    consequences: list[str] = Field(default_factory=list)
