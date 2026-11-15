"""`event_role` content (docs/spec/01 §6.3, method EV1).

對應舊模型 `KernelSatelliteResult`。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from storysphere.domain.evidence.base import EvidenceContent


class EventRoleContent(EvidenceContent):
    claim_type: ClassVar[str] = "event_role"

    event_id: str
    weight: Literal["kernel", "satellite"]
    rationale: str = ""
