"""`agent_sessions`／`trace_calls`: agent sessions and MCP tool-call trace (01 §8, 04 §5.6).

session 由 T25 的 Gateway 建立（N-10a）；T20 的 MCP server 只讀它來認 token、寫 trace。
函式只 flush，不 commit。
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from storysphere.store.tables import Base, Evidence, Run, _new_id, _utcnow

# 還能接受工具呼叫的 session 狀態。
OPEN_STATUSES = ("starting", "ready", "busy")


class AgentSessionRow(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(String, index=True)
    backend: Mapped[str] = mapped_column(String)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    genre: Mapped[str | None] = mapped_column(String, nullable=True)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_tools: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 只存 sha256；token 本身只在建立時回給 Gateway 一次。
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    # starting／ready／busy／closed／error
    status: Mapped[str] = mapped_column(String, default="ready")
    messages_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    drafts_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TraceCallRow(Base):
    __tablename__ = "trace_calls"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_id)
    session_id: Mapped[str] = mapped_column(String, index=True)
    # session 內遞增，也是 AgentEvent 的 callId。
    seq: Mapped[int] = mapped_column(Integer)
    turn_id: Mapped[str | None] = mapped_column(String, nullable=True)
    tool: Mapped[str] = mapped_column(String)
    args_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # running（呼叫中，原型補充）／ok／error／denied／pending_approval
    status: Mapped[str] = mapped_column(String, default="running")
    result_evidence_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    result_run_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    approval_request_id: Mapped[str | None] = mapped_column(String, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(
    session: AsyncSession,
    *,
    book_id: str,
    backend: str,
    model: str | None = None,
    genre: str | None = None,
    skills: list[str] | None = None,
    allowed_tools: list[str] | None = None,
) -> tuple[AgentSessionRow, str]:
    """Insert a session; return it with the plaintext token (shown once)."""
    token = secrets.token_urlsafe(32)
    row = AgentSessionRow(
        book_id=book_id,
        backend=backend,
        model=model,
        genre=genre,
        skills=list(skills or []),
        allowed_tools=list(allowed_tools or []),
        token_hash=hash_token(token),
    )
    session.add(row)
    await session.flush()
    return row, token


async def session_by_token(session: AsyncSession, token: str) -> AgentSessionRow | None:
    """The open session that owns ``token``; None when unknown or closed."""
    return await session.scalar(
        select(AgentSessionRow).where(
            AgentSessionRow.token_hash == hash_token(token),
            AgentSessionRow.status.in_(OPEN_STATUSES),
        )
    )


async def start_call(
    session: AsyncSession,
    *,
    session_id: str,
    turn_id: str | None,
    tool: str,
    args: dict[str, Any],
) -> TraceCallRow:
    """Write the trace row for a call as it arrives (status `running`, next seq)."""
    last = await session.scalar(
        select(func.max(TraceCallRow.seq)).where(TraceCallRow.session_id == session_id)
    )
    row = TraceCallRow(
        session_id=session_id, seq=(last or 0) + 1, turn_id=turn_id, tool=tool, args_json=args
    )
    session.add(row)
    await session.flush()
    return row


async def traced_evidence_ids(session: AsyncSession, session_id: str) -> set[str]:
    """Evidence ids this session may cite (04 §5.5 rule 1).

    先前 `ok` 呼叫回傳過的證據，加上本 session 觸發的 run（`runs.agent_session_id`）產出的證據。
    """
    found: set[str] = set()
    for ids in await session.scalars(
        select(TraceCallRow.result_evidence_ids).where(
            TraceCallRow.session_id == session_id, TraceCallRow.status == "ok"
        )
    ):
        found.update(ids or [])
    run_ids = select(Run.id).where(Run.agent_session_id == session_id)
    found.update(await session.scalars(select(Evidence.id).where(Evidence.run_id.in_(run_ids))))
    return found
