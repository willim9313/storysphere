"""`archetype` content (docs/spec/01 §6.3, method CH1).

對應舊模型 `ArchetypeResult`。原型清單在 config，`primary`／`secondary` 這裡只是字串。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from storysphere.domain.evidence.base import EvidenceContent


class ArchetypeContent(EvidenceContent):
    claim_type: ClassVar[str] = "archetype"

    character_id: str
    framework: Literal["jung", "schmidt"]
    primary: str
    secondary: str | None = None
    rationale: str = ""
