"""`interpretation` content (docs/spec/01 §5).

新增類型，沒有對應的舊模型。作者記在外殼 `source`，不另設欄位。
"""

from __future__ import annotations

from typing import ClassVar

from storysphere.domain.evidence.base import EvidenceContent


class InterpretationContent(EvidenceContent):
    claim_type: ClassVar[str] = "interpretation"

    text: str
