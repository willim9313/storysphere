"""`suspect_matrix` content (docs/spec/01 §6.4, method MY5).

書層級一筆。新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class SuspectClueCell(ContentPart):
    suspect_id: str
    clue_id: str
    relation: Literal["implicates", "exonerates", "neutral"]
    misdirection: bool = False


class SuspicionPoint(ContentPart):
    chapter: int
    suspect_id: str
    score: float


class SuspectMatrixContent(EvidenceContent):
    claim_type: ClassVar[str] = "suspect_matrix"

    suspect_ids: list[str] = Field(default_factory=list)
    clue_ids: list[str] = Field(default_factory=list)
    cells: list[SuspectClueCell] = Field(default_factory=list)
    suspicion_by_chapter: list[SuspicionPoint] = Field(default_factory=list)
