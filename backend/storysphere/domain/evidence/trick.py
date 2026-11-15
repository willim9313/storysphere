"""`trick` content (docs/spec/01 §6.2).

推理專屬類型，欄位都在內容表；沒有對應的舊模型。
`trick_category` 依江戸川亂步〈類別トリック集成〉的大類。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from storysphere.domain.evidence.base import EvidenceContent


class TrickContent(EvidenceContent):
    claim_type: ClassVar[str] = "trick"

    description: str
    hidden_truth_id: str
    trick_category: Literal[
        "person",
        "entry_exit",
        "time",
        "weapon_poison",
        "concealment",
        "other",
    ]
