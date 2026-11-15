"""`causal_link` content (docs/spec/01 §6.3, method EV2).

對應舊模型 `EventEvidenceProfile.causal_factors／prior_event_ids`。
`link_type` 依 Trabasso & van den Broek。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class CausalLinkContent(EvidenceContent):
    claim_type: ClassVar[str] = "causal_link"

    cause_event_id: str
    effect_event_id: str
    link_type: Literal["physical", "motivational", "psychological", "enablement"]
    strength: float = Field(ge=0, le=1)
    rationale: str = ""
