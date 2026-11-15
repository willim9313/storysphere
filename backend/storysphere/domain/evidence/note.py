"""`note` content (docs/spec/01 §5).

新增類型，沒有對應的舊模型。`methodology_trace` 的形狀見 docs/spec/04 §5.6。
"""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class NoteContent(EvidenceContent):
    claim_type: ClassVar[str] = "note"

    title: str
    # markdown
    conclusion: str
    # agent 筆記為 null
    methodology_run_id: str | None = None
    methodology_trace: dict[str, Any] = Field(default_factory=dict)
    # 觸發它的問句
    question: str | None = None
