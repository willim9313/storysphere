"""`event_impact` content (docs/spec/01 §6.3, method EV3).

對應舊模型 `ImpactAnalysis`。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class CharacterImpact(ContentPart):
    character_id: str
    description: str


class EventImpactContent(EvidenceContent):
    claim_type: ClassVar[str] = "event_impact"

    event_id: str
    impacts: list[CharacterImpact] = Field(default_factory=list)
    # 舊模型是文字描述的列表，沿用
    relation_changes: list[str] = Field(default_factory=list)
    impact_summary: str = ""
