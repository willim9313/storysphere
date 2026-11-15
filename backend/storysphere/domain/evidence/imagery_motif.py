"""`imagery_motif` content (docs/spec/01 §6.1).

對應舊模型 `ImageryEntity` ＋ `SymbolOccurrence`。每次出現是外殼的一段引文，不是內容欄位。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class ImageryMotifContent(EvidenceContent):
    claim_type: ClassVar[str] = "imagery_motif"

    # 原文語言的標準形
    term: str
    imagery_type: Literal["object", "nature", "spatial", "body", "color", "other"]
    aliases: list[str] = Field(default_factory=list)
    frequency: int = Field(default=0, ge=0)
    # {章號（字串）: 次數}
    chapter_distribution: dict[str, int] = Field(default_factory=dict)
