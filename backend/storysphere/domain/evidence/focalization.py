"""`focalization` content (docs/spec/01 §6.1).

新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class FocalizationContent(EvidenceContent):
    claim_type: ClassVar[str] = "focalization"

    chapter: int
    focalization_type: Literal["zero", "internal", "external"]
    grammatical_person: Literal["first", "second", "third"]
    paragraph_ids: list[str] = Field(default_factory=list)
    # null＝零聚焦
    focalizer_id: str | None = None
