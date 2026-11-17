"""N-10 Agent Gateway 的 API 形狀（04 §4.10、§2.5）。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict

from storysphere.api.schemas.common import ApiModel, UtcDatetime

Backend = Literal["deepagents", "claude-code"]


class SessionIn(ApiModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    backend: Backend
    book_id: str
    genre: str | None = None
    model: str | None = None


class SessionOut(ApiModel):
    session_id: str
    backend: str
    book_id: str
    genre: str | None
    model: str | None
    skills: list[str]
    allowed_tools: list[str]
    permission_level: str
    status: str


class Message(ApiModel):
    turn_id: str
    role: str
    text: str
    created_at: str


class SessionDetail(SessionOut):
    messages: list[Message]
    last_seq: int


class SessionListItem(ApiModel):
    session_id: str
    backend: str
    model: str | None
    status: str
    created_at: UtcDatetime
    open_draft_count: int


class MessageIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    text: str


class TurnOut(ApiModel):
    turn_id: str


class ApprovalIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    allow: bool


class TraceItem(ApiModel):
    seq: int
    turn_id: str | None
    tool: str
    args: dict[str, Any]
    status: str
    result_evidence_ids: list[str]
    result_run_ids: list[str]
    job_id: str | None
    approval_request_id: str | None
    error_code: str | None
    started_at: UtcDatetime
    duration_ms: int | None


class TracePage(ApiModel):
    items: list[TraceItem]
    next_cursor: str | None
    total: int


class NoteDraft(ApiModel):
    """§2.5；`agent_sessions.drafts_json` 的一筆。"""

    draft_id: str
    session_id: str
    title: str
    conclusion: str
    cited_evidence_ids: list[str]
    question: str | None
    state: Literal["open", "confirmed", "discarded"]
    check: dict[str, Any]
    note_id: str | None
    created_at: str
    updated_at: str
