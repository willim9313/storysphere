"""N-06 筆記與詮釋的 API 形狀（04 §4.6）。"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from storysphere.api.schemas.common import ApiModel, UtcDatetime
from storysphere.api.schemas.evidence import Evidence, EvidenceListItem


class NoteListItem(ApiModel):
    id: str
    title: str
    question: str | None
    level: int
    basis_changed: bool
    produced_via: str
    agent_backend: str | None
    cited_count: int
    created_at: UtcDatetime


class NotePage(ApiModel):
    items: list[NoteListItem]
    next_cursor: str | None
    total: int


class NoteDetail(Evidence):
    """N-06b：筆記本身＋引用的證據（展開一層）＋引用它的詮釋。"""

    cited: list[EvidenceListItem]
    interpretations: list[EvidenceListItem]


class NoteFromRunIn(ApiModel):
    """N-06c 從結果卡建立（`origin=run`）；`origin=draft` 在 T25／T27。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    origin: str
    from_run_id: str
    title: str = Field(min_length=1)
    conclusion: str
    cited_evidence_ids: list[str]


class NoteCreated(ApiModel):
    note: Evidence


class InterpretationIn(ApiModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    text: str = Field(min_length=1)
    cited_evidence_ids: list[str]


class InterpretationCreated(ApiModel):
    interpretation: Evidence
