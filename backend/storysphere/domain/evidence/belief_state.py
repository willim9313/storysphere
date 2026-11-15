"""`belief_state` content (docs/spec/01 §6.3, method CH5).

對應舊模型 `CharacterEpistemicState`（事件改存 id）。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class Misbelief(ContentPart):
    belief: str
    truth: str
    source_event_id: str
    confidence: float = Field(ge=0, le=1)


class BeliefStateContent(EvidenceContent):
    claim_type: ClassVar[str] = "belief_state"

    character_id: str
    up_to_chapter: int
    known_event_ids: list[str] = Field(default_factory=list)
    unknown_event_ids: list[str] = Field(default_factory=list)
    misbeliefs: list[Misbelief] = Field(default_factory=list)
