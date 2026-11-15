"""`book_setting` content (docs/spec/01 §6.1).

新增類型，沒有對應的舊模型。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from storysphere.domain.evidence.base import EvidenceContent


class BookSettingContent(EvidenceContent):
    claim_type: ClassVar[str] = "book_setting"

    aspect: Literal["era", "place", "social_norms", "world_type", "other"]
    value: str
    description: str = ""
