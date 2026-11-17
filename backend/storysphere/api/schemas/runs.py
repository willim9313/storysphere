"""`Run` (docs/spec/04 §2.2) and the view-data shape (N-04e)."""

from __future__ import annotations

from typing import Any

from storysphere.api.schemas.common import ApiModel, UtcDatetime
from storysphere.api.schemas.evidence import Evidence


class RunListItem(ApiModel):
    """N-04b 的一列：`Run` 去掉 `params`、`inputEvidenceIds`。"""

    id: str
    book_id: str
    ref_id: str
    ref_kind: str  # method／methodology／ingest_step（推得）
    # 以下四個從 registry 帶出；入庫步驟沒有。
    code: str | None
    question: str | None
    grade: str | None
    basis: str | None
    scope_key: str
    version: int | None
    prompt_version: str | None
    model: str | None
    summary: dict[str, Any] | None
    status: str
    precheck: dict[str, Any] | None
    parent_run_id: str | None
    step_run_ids: list[str]
    job_id: str | None
    started_at: UtcDatetime | None
    finished_at: UtcDatetime | None
    created_at: UtcDatetime
    superseded: bool  # 同 (bookId, refId, scopeKey) 有較新的 done run
    # 本 run 產出的 current 證據統計
    evidence_count: int
    max_level: int | None
    basis_changed_count: int


class Run(RunListItem):
    params: dict[str, Any] | None
    input_evidence_ids: list[str]


class RunDetail(Run):
    """N-04c。"""

    step_runs: list[Run]


class RunPage(ApiModel):
    items: list[RunListItem]
    next_cursor: str | None
    total: int


class ReferencedEvidence(ApiModel):
    """view 畫標籤要的最小欄位。"""

    id: str
    claim_type: str
    level: int
    label: str
    discourse_chapter: int | None


class ViewChapter(ApiModel):
    number: int
    title: str | None


class ViewData(ApiModel):
    """N-04e。"""

    view_type: str
    primary: list[Evidence]
    referenced: list[ReferencedEvidence]
    chapters: list[ViewChapter]


class TriggerIn(ApiModel):
    """N-04a。"""

    ref_id: str
    subject_ids: list[str] | None = None  # 覆寫宣告的 scope_selector
    params: dict[str, Any] | None = None
    force: bool = False  # true＝不重用既有結果
    dry_run: bool = False


class TriggerOut(ApiModel):
    # queued（202）／attached／reused／not_applicable／not_implemented／planned
    status: str
    job_id: str | None = None
    run_id: str | None = None
    plan: list[str]  # 要跑的方法 id，依 DAG 順序，含上游補跑
    precheck: dict[str, Any] | None = None
    not_implemented: list[str] = []  # 原型尚未支援、會被跳過的方法


class RerunIn(ApiModel):
    """N-04d。"""

    rerun_upstream: bool = False
