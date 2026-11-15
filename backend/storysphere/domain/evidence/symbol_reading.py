"""`symbol_reading` content (docs/spec/01 §6.3, method SY1).

對應舊模型 `SEP` ＋ interpretation。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class MeaningShift(ContentPart):
    chapter: int
    shift: str


class SymbolReadingContent(EvidenceContent):
    claim_type: ClassVar[str] = "symbol_reading"

    motif_id: str
    reading: str
    linked_event_ids: list[str] = Field(default_factory=list)
    meaning_shifts: list[MeaningShift] = Field(default_factory=list)
