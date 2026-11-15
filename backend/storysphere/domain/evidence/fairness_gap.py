"""`fairness_gap` content (docs/spec/01 §6.4, method MY4).

每個 hidden_truth 一筆。新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class FairnessViolation(ContentPart):
    rule_set: Literal["knox", "van_dine"]
    rule_no: int
    explanation: str


class FairnessGapContent(EvidenceContent):
    claim_type: ClassVar[str] = "fairness_gap"

    hidden_truth_id: str
    verdict: Literal["fair", "partially_fair", "unfair"]
    reveal_chapter: int | None = None
    clue_ids_before_reveal: list[str] = Field(default_factory=list)
    reader_visible_count: int = Field(default=0, ge=0)
    misdirection_count: int = Field(default=0, ge=0)
    violations: list[FairnessViolation] = Field(default_factory=list)
    gap_description: str = ""
