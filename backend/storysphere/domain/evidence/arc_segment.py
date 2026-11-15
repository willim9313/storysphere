"""`arc_segment` content (docs/spec/01 §6.3, method CH2).

對應舊模型 `ArcSegment`（`chapter_range` 字串改成兩個整數）。
"""

from __future__ import annotations

from typing import ClassVar

from storysphere.domain.evidence.base import EvidenceContent


class ArcSegmentContent(EvidenceContent):
    claim_type: ClassVar[str] = "arc_segment"

    character_id: str
    chapter_start: int
    chapter_end: int
    phase: str
    description: str
