"""`clue_points_to` content (docs/spec/01 §6.2).

推理專屬類型，欄位都在內容表；沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class CluePointsToContent(EvidenceContent):
    claim_type: ClassVar[str] = "clue_points_to"

    clue_summary: str
    # 指向的角色
    points_to_ids: list[str] = Field(default_factory=list)
    points_to_truth_id: str | None = None
    reader_visible: bool = True
    is_misdirection: bool = False
    noticed_by_ids: list[str] = Field(default_factory=list)
