"""Agent Gateway：組裝 session、跑輪次、確認、關閉（架構文件「Agent Gateway」、04 §4.10）。

- 組裝：依題材挑 skills 複製到 `<workspace_root>/<session_id>/skills/`；`create_session` 產生 token
  （只交給後端，不回給 UI）；L0 白名單＝StorySphere 的 MCP 工具。
- 輪次：每輪在背景 task 跑；開跑前 `SessionRegistry.set_turn`，讓 MCP server 發的事件與草稿帶上
  `turnId` 與使用者訊息。旁白存 `messages_json`（只為重新整理頁面）。
- 事件：`text_delta`、`done`、`error` 由這裡發到 `session:<id>`；其餘由 MCP server 發。
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.api.errors import ApiError, not_found
from storysphere.gateway.base import AgentBackend, BackendError, SessionConfig
from storysphere.mcp.runtime import SessionContext, ToolEnv
from storysphere.mcp.tools_write import draft_event
from storysphere.store.agent import OPEN_STATUSES, AgentSessionRow, TraceCallRow, create_session
from storysphere.store.books import BookRow

logger = logging.getLogger(__name__)

SKILLS_ROOT = Path(__file__).resolve().parents[3] / "skills"
PERMISSION_LEVEL = "L0"

# L0：只給 StorySphere 的 MCP 工具（04 §5.2 的 14 個）。
L0_TOOLS: tuple[str, ...] = (
    "search_evidence",
    "get_evidence",
    "get_entity",
    "get_events",
    "get_passage",
    "list_genre_elements",
    "list_methods",
    "get_run",
    "run_method",
    "get_job_status",
    "create_note",
    "add_interpretation",
    "link_evidence",
    "show_view",
)


def skills_for(genre: str | None) -> list[str]:
    """05 §5.3：事件分析、角色分析通用；推理題材加公平性。"""
    skills = ["event-analysis", "character-analysis"]
    if genre == "mystery":
        skills.append("mystery-fair-play")
    return skills


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def invalid_state(detail: str) -> ApiError:
    return ApiError(409, "invalid_state", detail)


class Gateway:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        env: ToolEnv,
        backends: dict[str, AgentBackend],
        *,
        workspace_root: Path,
        mcp_url: str,
        skills_root: Path = SKILLS_ROOT,
    ) -> None:
        self.session_factory = session_factory
        self.env = env
        self.backends = backends
        self.workspace_root = workspace_root
        self.mcp_url = mcp_url
        self.skills_root = skills_root
        self._turns: dict[str, asyncio.Task[None]] = {}
        # 已啟動、還沒關的 session → 後端名（關機時逐一關掉）。
        self._open: dict[str, str] = {}

    # ---- 事件 ----

    def _ctx(self, row: AgentSessionRow) -> SessionContext:
        return self.env.sessions.ensure(row)

    def _emit(self, session_id: str, event_type: str, data: dict[str, Any]) -> None:
        sctx = self.env.sessions.get(session_id)
        assert sctx is not None
        self.env.emit(sctx, event_type, data)

    async def _set_status(self, session_id: str, status: str, **values: Any) -> None:
        async with self.session_factory() as db:
            row = await db.get(AgentSessionRow, session_id)
            assert row is not None
            row.status = status
            for key, value in values.items():
                setattr(row, key, value)
            await db.commit()

    # ---- N-10a ----

    async def open(
        self, *, book: BookRow, backend: str, genre: str | None, model: str | None
    ) -> AgentSessionRow:
        brain = self.backends.get(backend)
        if brain is None:
            raise ApiError(422, "validation_error", f"Backend '{backend}' is not available.")
        skills = skills_for(genre)
        async with self.session_factory() as db:
            row, token = await create_session(
                db,
                book_id=book.id,
                backend=backend,
                model=model,
                genre=genre,
                skills=skills,
                allowed_tools=list(L0_TOOLS),
            )
            row.status = "starting"
            await db.commit()
            session_id = row.id
        workspace = self.workspace_root / session_id
        for name in skills:
            shutil.copytree(self.skills_root / name, workspace / "skills" / name)
        cfg = SessionConfig(
            session_id=session_id,
            book_id=book.id,
            genre=genre,
            mcp_url=self.mcp_url,
            token=token,
            workspace=workspace,
            skills=skills,
            allowed_tools=list(L0_TOOLS),
            model=model,
            book_title=book.title or "",
        )
        async with self.session_factory() as db:
            stored = await db.get(AgentSessionRow, session_id)
            assert stored is not None
            self._ctx(stored)
        try:
            await brain.start(cfg)
        except BackendError as err:
            if err.code == "llm_unconfigured":
                await self._set_status(session_id, "error", closed_at=datetime.now(UTC))
                raise ApiError(503, "llm_unconfigured", err.message) from err
            await self._set_status(session_id, "error")
            self._emit(
                session_id,
                "error",
                {"code": err.code, "message": err.message, "retryable": err.retryable},
            )
        else:
            self._open[session_id] = backend
            await self._set_status(session_id, "ready")
        return await self.get(session_id)

    async def get(self, session_id: str) -> AgentSessionRow:
        async with self.session_factory() as db:
            row = await db.get(AgentSessionRow, session_id)
        if row is None:
            raise not_found("Agent session", session_id)
        return row

    # ---- N-10d ----

    async def send(self, session_id: str, text: str) -> str:
        row = await self.get(session_id)
        if row.status != "ready":
            raise invalid_state(f"Session is {row.status}; it cannot take a message now.")
        turn_id = str(uuid.uuid4())
        message = {"turnId": turn_id, "role": "user", "text": text, "createdAt": _now()}
        await self._set_status(session_id, "busy", messages_json=[*row.messages_json, message])
        self._ctx(row)
        self.env.sessions.set_turn(session_id, turn_id, text)
        self._turns[session_id] = asyncio.create_task(
            self._run_turn(row.backend, session_id, turn_id, text)
        )
        return turn_id

    async def _run_turn(self, backend: str, session_id: str, turn_id: str, text: str) -> None:
        brain = self.backends[backend]
        stop_reason = "end_turn"
        reply = ""
        try:
            reply = await brain.send(
                session_id, text, lambda piece: self._emit(session_id, "text_delta", {"text": piece})
            )
        except asyncio.CancelledError:
            stop_reason = "cancelled"
        except BackendError as err:
            stop_reason = "error"
            self._emit(
                session_id,
                "error",
                {"code": err.code, "message": err.message, "retryable": err.retryable},
            )
        except Exception as exc:
            logger.exception("Agent turn %s of session %s failed", turn_id, session_id)
            stop_reason = "error"
            code = "rate_limited" if "429" in str(exc) else "backend_crashed"
            self._emit(
                session_id,
                "error",
                {"code": code, "message": str(exc)[:500], "retryable": code == "rate_limited"},
            )
        finally:
            self._turns.pop(session_id, None)
        async with self.session_factory() as db:
            row = await db.get(AgentSessionRow, session_id)
            assert row is not None
            if reply:
                row.messages_json = [
                    *row.messages_json,
                    {"turnId": turn_id, "role": "assistant", "text": reply, "createdAt": _now()},
                ]
            if row.status == "busy":
                row.status = "ready"
            await db.commit()
        self._emit(session_id, "done", {"stopReason": stop_reason})

    async def wait_turn(self, session_id: str) -> None:
        """等目前這一輪結束（大腦測試用）。"""
        task = self._turns.get(session_id)
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)

    # ---- N-10f ----

    async def resolve_approval(self, session_id: str, request_id: str, allow: bool) -> None:
        await self.get(session_id)
        async with self.session_factory() as db:
            trace = await db.scalar(
                select(TraceCallRow).where(
                    TraceCallRow.session_id == session_id,
                    TraceCallRow.approval_request_id == request_id,
                )
            )
        if trace is None:
            raise not_found("Approval request", request_id)
        if not self.env.approvals.resolve(request_id, allow):
            raise invalid_state("This approval request was already answered.")

    async def _deny_pending(self, session_id: str) -> None:
        """取消或關閉時，未回應的確認一律視為拒絕（N-10f）。"""
        async with self.session_factory() as db:
            ids = await db.scalars(
                select(TraceCallRow.approval_request_id).where(
                    TraceCallRow.session_id == session_id,
                    TraceCallRow.status == "pending_approval",
                )
            )
            for request_id in ids:
                if request_id:
                    self.env.approvals.resolve(request_id, False)

    # ---- N-10g ----

    async def cancel(self, session_id: str) -> None:
        await self.get(session_id)
        task = self._turns.get(session_id)
        if task is None or task.done():
            raise invalid_state("No turn is running.")
        await self._deny_pending(session_id)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    # ---- N-10h ----

    async def close(self, session_id: str) -> None:
        row = await self.get(session_id)
        if row.status == "closed":
            return
        task = self._turns.get(session_id)
        await self._deny_pending(session_id)
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if self._open.pop(session_id, None) is not None:
            await self.backends[row.backend].close(session_id)
        discarded: list[dict[str, Any]] = []
        async with self.session_factory() as db:
            stored = await db.get(AgentSessionRow, session_id)
            assert stored is not None
            drafts = []
            for draft in stored.drafts_json:
                draft = dict(draft)
                if draft.get("state") == "open":
                    draft["state"] = "discarded"
                    draft["updated_at"] = _now()
                    discarded.append(draft)
                drafts.append(draft)
            stored.drafts_json = drafts
            stored.status = "closed"
            stored.closed_at = datetime.now(UTC)
            await db.commit()
        self._ctx(row)
        for draft in discarded:
            self._emit(session_id, "note_draft", {"op": "discarded", "draft": draft_event(draft)})

    # ---- N-10k ----

    async def discard_draft(self, session_id: str, draft_id: str) -> None:
        await self.get(session_id)
        async with self.session_factory() as db:
            row = await db.get(AgentSessionRow, session_id)
            assert row is not None
            drafts = [dict(d) for d in row.drafts_json]
            target = next((d for d in drafts if d["draft_id"] == draft_id), None)
            if target is None:
                raise not_found("Draft", draft_id)
            if target["state"] == "confirmed":
                raise invalid_state("This draft was already saved as a note.")
            if target["state"] == "discarded":
                return
            target["state"] = "discarded"
            target["updated_at"] = _now()
            row.drafts_json = drafts
            await db.commit()
            self._ctx(row)
        self._emit(session_id, "note_draft", {"op": "discarded", "draft": draft_event(target)})

    async def shutdown(self) -> None:
        """伺服器關閉：停掉進行中的輪次與後端連線（session 狀態留給下次啟動處理）。"""
        for task in list(self._turns.values()):
            task.cancel()
        await asyncio.gather(*self._turns.values(), return_exceptions=True)
        for session_id, backend in list(self._open.items()):
            await self.backends[backend].close(session_id)
        self._open.clear()


async def close_stale_sessions(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """啟動時：上次沒關的 session 一律 closed（大腦已不在，token 也跟著作廢）。"""
    async with session_factory() as db:
        rows = await db.scalars(
            select(AgentSessionRow).where(AgentSessionRow.status.in_(OPEN_STATUSES))
        )
        for row in rows:
            row.status = "closed"
            row.closed_at = datetime.now(UTC)
        await db.commit()
