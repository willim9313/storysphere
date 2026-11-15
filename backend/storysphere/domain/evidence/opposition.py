"""`opposition` content (docs/spec/01 §6.3, method TM1).

每事件最多一筆。對應舊模型 `TEU`（重建，不沿用舊資料）。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class OppositionPole(ContentPart):
    concept: str
    carrier_ids: list[str] = Field(default_factory=list)
    stance: str | None = None


class OppositionContent(EvidenceContent):
    claim_type: ClassVar[str] = "opposition"

    event_id: str
    pole_a: OppositionPole
    pole_b: OppositionPole
    intensity: float = Field(default=0.5, ge=0, le=1)
    description: str
