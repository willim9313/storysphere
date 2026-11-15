"""`hidden_truth` content (docs/spec/01 §6.2).

新增類型，沒有對應的舊模型。推理擴充欄位（`case_type` 等）不在這裡，見 `genre_ext.py`。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class HiddenTruthContent(EvidenceContent):
    claim_type: ClassVar[str] = "hidden_truth"

    # 被隱藏的事實
    statement: str
    truth_kind: Literal["who", "how", "why", "where", "when", "other"]
    concealed_from: Literal["reader", "characters", "both"]
    concealer_ids: list[str] = Field(default_factory=list)
    # 整併階段填
    reveal_id: str | None = None
