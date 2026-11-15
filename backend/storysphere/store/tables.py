"""SQLAlchemy table definitions for the evidence store.

欄位準據：`docs/spec/01_證據格式與儲存.md` §3（外殼與引文）、§8（runs、evidence_edits），
以及 `docs/spec/04_API.md` §2.3（jobs）。

這裡只放外殼與系統表；每種證據類型的內容表（`ev_<claim_type>`）、`books` 等不在本模組。
值域（`source`、`status`…）一律存成純字串，驗證在別處做。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    """現在時間（UTC，帶時區）。"""
    return datetime.now(UTC)


def _new_id() -> str:
    """uuid4 字串，當主鍵預設值。"""
    return str(uuid.uuid4())


# 選填的 json 欄位：Python 的 None 存成 SQL NULL，而不是 JSON 的 'null'。
_NullableJSON = JSON(none_as_null=True)

_EVIDENCE_FK = "evidence.id"


class Base(DeclarativeBase):
    pass


class Evidence(Base):
    """證據外殼，所有證據類型共用（01 §3）。"""

    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    # `books` 表在之後的任務才建，這裡先不設外鍵。
    book_id: Mapped[str] = mapped_column(String, index=True)
    claim_type: Mapped[str] = mapped_column(String, index=True)
    level: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)
    discourse_chapter: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discourse_paragraph_id: Mapped[str | None] = mapped_column(String, nullable=True)
    story_rank: Mapped[float | None] = mapped_column(Float, nullable=True)
    known_by: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    source: Mapped[str] = mapped_column(String)
    confidence: Mapped[float] = mapped_column(Float)
    review_status: Mapped[str] = mapped_column(String, default="pending")
    status: Mapped[str] = mapped_column(String, default="current")
    basis_changed: Mapped[bool] = mapped_column(Boolean, default=False)
    basis_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    produced_via: Mapped[str] = mapped_column(String)
    agent_backend: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class EvidenceSubject(Base):
    """外殼 `subjects` 的關聯表。"""

    __tablename__ = "evidence_subject"

    evidence_id: Mapped[str] = mapped_column(
        String, ForeignKey(_EVIDENCE_FK, ondelete="CASCADE"), primary_key=True
    )
    subject_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String, primary_key=True)


class EvidenceLink(Base):
    """外殼 `derived_from`：證據 → 上游。"""

    __tablename__ = "evidence_link"

    evidence_id: Mapped[str] = mapped_column(
        String, ForeignKey(_EVIDENCE_FK, ondelete="CASCADE"), primary_key=True
    )
    # 上游可以是證據 id 或 run id，所以不設外鍵。
    upstream_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)


class EvidenceQuote(Base):
    """外殼 `text_evidence`：一筆證據可有多段引文。"""

    __tablename__ = "evidence_quote"

    evidence_id: Mapped[str] = mapped_column(
        String, ForeignKey(_EVIDENCE_FK, ondelete="CASCADE"), primary_key=True
    )
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    paragraph_id: Mapped[str] = mapped_column(String, index=True)
    # 字元偏移。
    start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean)


class EvidenceGenreExt(Base):
    """題材擴充欄位。"""

    __tablename__ = "evidence_genre_ext"

    evidence_id: Mapped[str] = mapped_column(
        String, ForeignKey(_EVIDENCE_FK, ondelete="CASCADE"), primary_key=True
    )
    genre: Mapped[str] = mapped_column(String, primary_key=True)
    # 主鍵的一部分不能是 NULL，沒有 system tag 時用空字串。
    system_tag: Mapped[str] = mapped_column(String, primary_key=True, default="")
    data_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class EvidenceEdit(Base):
    """使用者修改或拒絕第 2 層以上證據時保留的原值（01 §7）。"""

    __tablename__ = "evidence_edits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evidence_id: Mapped[str] = mapped_column(
        String, ForeignKey(_EVIDENCE_FK, ondelete="CASCADE"), index=True
    )
    # modify / reject
    action: Mapped[str] = mapped_column(String)
    before_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Run(Base):
    """方法、方法論、入庫步驟每一次執行的紀錄（01 §8）。"""

    __tablename__ = "runs"
    # `(book_id, ref_id, scope_key)` 識別「同一個分析」（01 §4 的取代規則）。
    __table_args__ = (Index("ix_runs_book_ref_scope", "book_id", "ref_id", "scope_key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(String, index=True)
    ref_id: Mapped[str] = mapped_column(String)
    ref_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String, nullable=True)
    provider: Mapped[str | None] = mapped_column(String, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    params_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    scope_key: Mapped[str] = mapped_column(String, default="")
    input_evidence_ids: Mapped[list[str] | None] = mapped_column(_NullableJSON, nullable=True)
    status: Mapped[str] = mapped_column(String, default="queued")
    precheck_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    parent_run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    triggered_by: Mapped[str] = mapped_column(String, default="auto")
    agent_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_usage_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 01 §8 沒列這欄；排序 run（哪個較新）需要它。
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Job(Base):
    """背景工作狀態（04 §2.3）。"""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    kind: Mapped[str] = mapped_column(String)
    book_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    # 狀態機見 04 §3.2。
    status: Mapped[str] = mapped_column(String, default="pending")
    # 0–100
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str | None] = mapped_column(String, nullable=True)
    params_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    result_json: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_kind: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # 此 job 最後一個 SSE 事件的 seq。
    last_seq: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
