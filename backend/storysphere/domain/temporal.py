from __future__ import annotations

import uuid
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class TemporalRelationType(str, Enum):
    BEFORE = "before"  # A is chronologically before B
    AFTER = "after"  # A is chronologically after B (normalized to BEFORE + swap)
    SIMULTANEOUS = "simultaneous"  # A and B occur at the same story time
    DURING = "during"  # A occurs during the span of B
    CAUSES = "causes"  # A causes B (implies BEFORE)
    UNKNOWN = "unknown"  # Mentioned together but temporal relation unclear


class TemporalRelation(BaseModel):
    """A directed temporal relationship between two events in the story world."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    source_event_id: str
    target_event_id: str
    relation_type: TemporalRelationType
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence: str = ""
    derived_from_eep: bool = False

    @model_validator(mode="after")
    def _normalize_after_to_before(self) -> TemporalRelation:
        """Standardize AFTER → BEFORE by swapping source/target.

        This ensures all directed edges point from earlier → later in story time.
        """
        if self.relation_type == TemporalRelationType.AFTER:
            self.source_event_id, self.target_event_id = (
                self.target_event_id,
                self.source_event_id,
            )
            self.relation_type = TemporalRelationType.BEFORE
        return self
