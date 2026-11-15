"""`focalization_pattern` content (docs/spec/01 §6.3, method NS3).

每段一筆。新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class FocalizationShift(ContentPart):
    chapter: int
    # null＝零聚焦（沒有聚焦角色）
    from_id: str | None = None
    to_id: str | None = None


class FocalizationPatternContent(EvidenceContent):
    claim_type: ClassVar[str] = "focalization_pattern"

    chapter_start: int
    chapter_end: int
    dominant_type: Literal["zero", "internal", "external"]
    focalizer_ids: list[str] = Field(default_factory=list)
    shifts: list[FocalizationShift] = Field(default_factory=list)
    description: str = ""
