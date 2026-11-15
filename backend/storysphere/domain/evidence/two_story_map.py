"""`two_story_map` content (docs/spec/01 §6.4, method MY1).

書層級一筆。新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class StoryLink(ContentPart):
    investigation_event_id: str
    crime_event_id: str
    via: Literal["clue", "reveal", "testimony"]


class RevealPoint(ContentPart):
    chapter: int
    hidden_truth_id: str


class TwoStoryMapContent(EvidenceContent):
    claim_type: ClassVar[str] = "two_story_map"

    # 故事時序
    crime_story_event_ids: list[str] = Field(default_factory=list)
    investigation_story_event_ids: list[str] = Field(default_factory=list)
    links: list[StoryLink] = Field(default_factory=list)
    reveal_points: list[RevealPoint] = Field(default_factory=list)
