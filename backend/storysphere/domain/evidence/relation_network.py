"""`relation_network` content (docs/spec/01 §6.3, method CH4).

書層級一筆。對應舊模型 `FactionAnalysis`。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class Faction(ContentPart):
    # 方法在這筆證據內自訂的陣營代號，不是 evidence id
    id: str
    label: str
    member_ids: list[str] = Field(default_factory=list)


class InterFactionRelation(ContentPart):
    # `a`、`b` 是同一筆證據內 `factions[].id`
    a: str
    b: str
    cooperation: float = Field(ge=0, le=1)
    rivalry: float = Field(ge=0, le=1)


class RelationNetworkContent(EvidenceContent):
    claim_type: ClassVar[str] = "relation_network"

    factions: list[Faction] = Field(default_factory=list)
    inter_faction: list[InterFactionRelation] = Field(default_factory=list)
    # {character_id: score}
    centrality: dict[str, float] = Field(default_factory=dict)
    modularity: float | None = None
