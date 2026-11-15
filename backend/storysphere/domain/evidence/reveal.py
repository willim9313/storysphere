"""`reveal` content (docs/spec/01 §6.2).

新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from storysphere.domain.evidence.base import EvidenceContent


class RevealContent(EvidenceContent):
    claim_type: ClassVar[str] = "reveal"

    hidden_truth_id: str
    revealer_id: str
    audience: Literal["reader", "characters", "both"]
    reveal_method: Literal["confession", "deduction", "discovery", "testimony", "other"]
