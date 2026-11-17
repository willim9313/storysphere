"""MCP 工具的共用執行框架（04 §5.2、§5.6）。

每個工具都經 `run_tool`：認 session → 寫一筆 `trace_calls`（`running`）→ 發 `tool_call` →
執行工具本體 → 補完 trace → 發 `tool_result`。trace 是唯一來源（架構文件原則 4），工具本體
不自己記。工具本體回 `ToolResult`，明確列出回傳了哪些證據與 run（寫入驗證靠它）。

`SessionContext` 放記憶體：目前的 `turn_id` 與該輪使用者訊息由 T25 的 Gateway 用 `set_turn`
更新（原型決定，見 `docs/plans/20261117-t20-mcp-server.md`）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from mcp.server.mcpserver import Context
from mcp.types import CallToolResult, TextContent
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.api.errors import ApiError
from storysphere.api.events import EventBus
from storysphere.methods.engine import MethodEngine
from storysphere.methods.jobs import MethodJobs
from storysphere.registry.loader import Registry
from storysphere.store.agent import AgentSessionRow, TraceCallRow, session_by_token, start_call

logger = logging.getLogger(__name__)


def session_stream(session_id: str) -> str:
    """EventBus 上 agent session 的串流（T25 的 N-10 SSE 端點讀它）。"""
    return f"session:{session_id}"


@dataclass
class SessionContext:
    session_id: str
    book_id: str
    backend: str
    turn_id: str | None = None
    # 觸發本輪的使用者訊息；`create_note` 草稿的 `question`。
    question: str | None = None


class SessionRegistry:
    """In-memory contexts of the sessions the MCP server has seen."""

    def __init__(self) -> None:
        self._by_id: dict[str, SessionContext] = {}

    def get(self, session_id: str) -> SessionContext | None:
        return self._by_id.get(session_id)

    def ensure(self, row: AgentSessionRow) -> SessionContext:
        ctx = self._by_id.get(row.id)
        if ctx is None:
            ctx = self._by_id[row.id] = SessionContext(row.id, row.book_id, row.backend)
        return ctx

    def set_turn(self, session_id: str, turn_id: str, question: str | None) -> None:
        """Gateway 每收到一則使用者訊息呼叫一次（T25）。"""
        ctx = self._by_id.get(session_id)
        if ctx is None:
            raise KeyError(session_id)
        ctx.turn_id, ctx.question = turn_id, question


class McpToolError(Exception):
    """A tool failure returned to the brain as `{code, message, hint}` (04 §5.2)."""

    def __init__(self, code: str, message: str, hint: str = "", *, status: str = "error") -> None:
        super().__init__(message)
        self.code, self.message, self.hint, self.status = code, message, hint, status

    def payload(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message, "hint": self.hint}


@dataclass
class ToolResult:
    payload: dict[str, Any]
    evidence_ids: list[str] = field(default_factory=list)
    run_ids: list[str] = field(default_factory=list)
    job_id: str | None = None
    # 一行人看的摘要，進 `tool_result` 事件（例「找到 12 筆」）。
    summary: str = ""


class Approvals:
    """`approval_request` 的等待點（04 §5.1）。

    寫入工具發出請求後 `await wait(request_id)`；使用者在 UI 回應時，T25 的端點呼叫
    `resolve(request_id, allow)`。原型決定：不設逾時，session 關閉時由 Gateway 呼叫 `cancel_all`。
    """

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[bool]] = {}

    def open(self, request_id: str) -> None:
        self._pending[request_id] = asyncio.get_running_loop().create_future()

    async def wait(self, request_id: str) -> bool:
        try:
            return await self._pending[request_id]
        finally:
            self._pending.pop(request_id, None)

    def pending(self) -> list[str]:
        return list(self._pending)

    def resolve(self, request_id: str, allow: bool) -> bool:
        """False when no such request is waiting (already answered or unknown)."""
        future = self._pending.get(request_id)
        if future is None or future.done():
            return False
        future.set_result(allow)
        return True

    def cancel_all(self) -> None:
        for future in self._pending.values():
            if not future.done():
                future.set_result(False)


Resolver = Callable[[Context, "ToolEnv"], Awaitable[SessionContext]]


async def header_resolver(ctx: Context, env: ToolEnv) -> SessionContext:
    """Production resolver: the request's `Authorization: Bearer <token>`."""
    headers = ctx.headers or {}
    auth = headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    if token:
        async with env.session_factory() as db:
            row = await session_by_token(db, token)
        if row is not None:
            return env.sessions.ensure(row)
    raise McpToolError("unauthorized", "Unknown or closed agent session.")


@dataclass
class ToolEnv:
    session_factory: async_sessionmaker[AsyncSession]
    method_engine: MethodEngine
    method_jobs: MethodJobs
    bus: EventBus
    sessions: SessionRegistry = field(default_factory=SessionRegistry)
    approvals: Approvals = field(default_factory=Approvals)
    resolve: Resolver = header_resolver

    @property
    def registry(self) -> Registry:
        return self.method_engine.registry

    def emit(self, sctx: SessionContext, event_type: str, data: dict[str, Any]) -> None:
        """Append an AgentEvent (04 §5.1) to the session stream."""
        self.bus.append(
            session_stream(sctx.session_id),
            event_type,
            {
                "sessionId": sctx.session_id,
                "turnId": sctx.turn_id,
                "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "data": data,
            },
        )


@dataclass
class Call:
    """What a tool body gets: its env, the session, its trace row and an open DB session."""

    env: ToolEnv
    session: SessionContext
    trace: TraceCallRow
    db: AsyncSession


ToolBody = Callable[[Call], Awaitable[ToolResult]]


def _text(value: dict[str, Any]) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(value, ensure_ascii=False, default=str))]


def _tool_error(err: McpToolError) -> CallToolResult:
    """MCP tool error whose text is exactly `{code, message, hint}` (04 §5.2).

    不用 SDK 的 `ToolError`：它會在訊息前加「Error executing tool …」，大腦就解析不到 JSON。
    """
    return CallToolResult(is_error=True, content=_text(err.payload()))


async def run_tool(
    ctx: Context, env: ToolEnv, tool: str, args: dict[str, Any], body: ToolBody
) -> CallToolResult:
    try:
        sctx = await env.resolve(ctx, env)
    except McpToolError as err:
        return _tool_error(err)
    args = {key: value for key, value in args.items() if value is not None}
    async with env.session_factory() as db:
        trace = await start_call(
            db, session_id=sctx.session_id, turn_id=sctx.turn_id, tool=tool, args=args
        )
        await db.commit()
    env.emit(sctx, "tool_call", {"callId": trace.seq, "tool": tool, "args": args})

    started = time.monotonic()
    result: ToolResult | None = None
    failure: McpToolError | None = None
    async with env.session_factory() as db:
        try:
            result = await body(Call(env, sctx, trace, db))
        except McpToolError as err:
            failure = err
        except ApiError as err:  # 共用的 REST 服務層丟的錯（404、409、503…）
            failure = McpToolError(err.code, err.detail)
        except Exception:
            logger.exception("MCP tool %s crashed", tool)
            failure = McpToolError("internal", f"Tool {tool} failed unexpectedly.")
        finally:
            await db.rollback()

    values: dict[str, Any] = {"duration_ms": int((time.monotonic() - started) * 1000)}
    if result is not None:
        values |= {
            "status": "ok",
            "result_evidence_ids": result.evidence_ids,
            "result_run_ids": result.run_ids,
            "job_id": result.job_id,
        }
    else:
        assert failure is not None
        values |= {"status": failure.status, "error_code": failure.code, "error": failure.message}
    async with env.session_factory() as db:
        await db.execute(update(TraceCallRow).where(TraceCallRow.id == trace.id).values(**values))
        await db.commit()

    event: dict[str, Any] = {"callId": trace.seq, "ok": result is not None}
    if result is not None:
        event |= {
            "evidenceIds": result.evidence_ids,
            "runIds": result.run_ids,
            "summary": result.summary,
        }
        if result.job_id:
            event["jobId"] = result.job_id
    else:
        assert failure is not None
        event |= {"evidenceIds": [], "runIds": [], "summary": failure.message}
        event["errorCode"] = failure.code
    env.emit(sctx, "tool_result", event)

    if failure is not None:
        return _tool_error(failure)
    assert result is not None
    return CallToolResult(content=_text(result.payload), structured_content=result.payload)
