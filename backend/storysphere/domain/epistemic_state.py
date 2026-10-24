from __future__ import annotations

from pydantic import BaseModel, Field

from storysphere.domain.events import Event


class MisbeliefItem(BaseModel):
    """A false belief held by a character, inferred by LLM."""

    character_belief: str
    actual_truth: str
    source_event_id: str
    confidence: float = Field(ge=0.0, le=1.0)


class CharacterEpistemicState(BaseModel):
    """What a character knows and doesn't know up to a given chapter."""

    character_id: str
    character_name: str
    up_to_chapter: int
    known_events: list[Event] = Field(default_factory=list)
    unknown_events: list[Event] = Field(default_factory=list)
    misbeliefs: list[MisbeliefItem] = Field(default_factory=list)
    # False when the LLM misbelief step was skipped (cache-only read on a miss,
    # or no provider), so an empty ``misbeliefs`` means "not inferred" rather
    # than "none". Cached rows predate the field and were all inferred.
    misbeliefs_inferred: bool = True
