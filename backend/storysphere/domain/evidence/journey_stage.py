"""`journey_stage` content (docs/spec/01 §6.3, method NS1).

每階段一筆。對應舊模型 `HeroJourneyStage`。`stage_id` 是 Vogler 12 階段的代號，清單在 config。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class JourneyStageContent(EvidenceContent):
    claim_type: ClassVar[str] = "journey_stage"

    protagonist_id: str
    stage_id: str
    stage_name: str
    fit: Literal["strong", "weak", "absent"]
    # fit=absent 時沒有對應章節
    chapter_start: int | None = None
    chapter_end: int | None = None
    representative_event_ids: list[str] = Field(default_factory=list)
    notes: str | None = None
