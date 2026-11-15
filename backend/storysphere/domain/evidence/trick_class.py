"""`trick_class` content (docs/spec/01 §6.4, method MY3).

新增類型，沒有對應的舊模型。亂步細項與 Carr 密室類型的清單在 config。
"""

from __future__ import annotations

from typing import ClassVar

from storysphere.domain.evidence.base import EvidenceContent


class TrickClassContent(EvidenceContent):
    claim_type: ClassVar[str] = "trick_class"

    trick_id: str
    rampo_category: str
    rampo_subcategory: str | None = None
    # `trick_category≠entry_exit` 時為 null
    carr_locked_room_type: str | None = None
    rationale: str = ""
