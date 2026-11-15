"""`tension_line` content (docs/spec/01 §6.3, method TM2).

對應舊模型 `TensionLine`（`chapter_range` 改成兩個整數）。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class TensionLineContent(EvidenceContent):
    claim_type: ClassVar[str] = "tension_line"

    pole_a_label: str
    pole_b_label: str
    chapter_start: int
    chapter_end: int
    opposition_ids: list[str] = Field(default_factory=list)
    intensity_summary: float = Field(default=0.0, ge=0, le=1)
    # {章號（字串）: 強度}
    intensity_by_chapter: dict[str, float] = Field(default_factory=dict)
    thematic_note: str | None = None
