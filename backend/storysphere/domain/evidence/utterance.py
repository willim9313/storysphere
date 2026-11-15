"""`utterance` content (docs/spec/01 §6.1).

新增類型，沒有對應的舊模型（舊 CH3 直接讀段落）。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class UtteranceContent(EvidenceContent):
    claim_type: ClassVar[str] = "utterance"

    speaker_id: str
    kind: Literal["dialogue", "monologue", "letter"]
    # 原文
    text: str
    addressee_ids: list[str] = Field(default_factory=list)
