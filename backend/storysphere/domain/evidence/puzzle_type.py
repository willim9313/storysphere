"""`puzzle_type` content (docs/spec/01 §6.4, method MY2).

新增類型，沒有對應的舊模型。謎題類型清單在 config。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class PuzzleTypeContent(EvidenceContent):
    claim_type: ClassVar[str] = "puzzle_type"

    puzzle_type: str
    sub_types: list[str] = Field(default_factory=list)
    rationale: str = ""
