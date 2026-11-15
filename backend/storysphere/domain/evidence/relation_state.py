"""`relation_state` content (docs/spec/01 §6.1).

對應舊模型 `Relation`。差別：一筆＝某段落當下的關係狀態，不是全書彙總。
`relation_type` 沿用 `RelationType`，去掉 `located_in`、`owns`。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class RelationStateContent(EvidenceContent):
    claim_type: ClassVar[str] = "relation_state"

    source_id: str
    target_id: str
    relation_type: Literal[
        "family",
        "friendship",
        "romance",
        "enemy",
        "ally",
        "subordinate",
        "member_of",
        "other",
    ]
    polarity: Literal["positive", "negative", "neutral"]
    weight: float = Field(default=1.0, ge=0, le=1)
    is_bidirectional: bool = False
    description: str | None = None
