"""Claude Code 後端：經 ACP 驅動 `claude-agent-acp`（05 §5.2，T02 spike、T26 規劃）。

- 每個 session 一個 adapter 子 process，由常駐 task 持有（anyio 的 context 要同一個 task 進出）。
- L0 靠四層一起保證：`tools: ["Skill"]`（只留讀 skill）、`settingSources: []`（不載使用者／專案設定）、
  `strict-mcp-config`（只留本 session 的 MCP）、`default` 權限模式（每次呼叫都送 permission request）。
- skill 經 ACP 建 session 時一起帶：`plugins` 指向 session 目錄裡的本機 plugin。
- session 目錄放系統暫存目錄（repo 外）：在 repo 裡時 Claude Code 會往上讀 `CLAUDE.md`、帶進 auto-memory。
- tool_call／tool_result 由 MCP server 發；這裡只轉旁白（`text_delta`）。
"""

from __future__ import annotations

import asyncio
import logging
import os
import shlex
import shutil
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from acp import PROTOCOL_VERSION, RequestError, spawn_agent_process
from acp.schema import (
    AllowedOutcome,
    ClientCapabilities,
    DeniedOutcome,
    HttpHeader,
    HttpMcpServer,
    Implementation,
    RequestPermissionResponse,
    TextContentBlock,
)
from sqlalchemy import update

from storysphere.gateway.base import BackendError, SessionConfig, TextSink
from storysphere.mcp.runtime import ToolEnv
from storysphere.store.agent import TraceCallRow, start_call

logger = logging.getLogger(__name__)

MCP_SERVER_NAME = "storysphere"
MCP_PREFIX = f"mcp__{MCP_SERVER_NAME}__"
SKILL_TOOL = "Skill"
PERMISSION_MODE = "default"
# 子 process 只拿這些環境變數：不把後端的金鑰（GEMINI_API_KEY…）傳給大腦（架構文件）。
ENV_ALLOWLIST = ("HOME", "PATH", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "SHELL")
EXTRA_ENV = {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
DEFAULT_LAUNCH_COMMAND = "npx -y @agentclientprotocol/claude-agent-acp"
START_TIMEOUT_S = 120


class _QuietAuthStatus(logging.Filter):
    """adapter 會送 `auth/status_update` 通知，ACP SDK 不認得、記成錯誤；與運作無關。"""

    def filter(self, record: logging.LogRecord) -> bool:
        return "auth/status_update" not in record.getMessage()


_quiet = _QuietAuthStatus()


def isolation_options(plugin_dir: Path) -> dict[str, Any]:
    """`_meta.claudeCode.options`（05 §5.2）。"""
    return {
        "tools": [SKILL_TOOL],
        "settingSources": [],
        "plugins": [{"type": "local", "path": str(plugin_dir)}],
        "extraArgs": {"strict-mcp-config": None},
    }


def build_workspace(cfg: SessionConfig, root: Path) -> tuple[Path, Path]:
    """repo 外的 session 目錄＋裡面的 plugin（skills 從 Gateway 準備好的目錄複製）。"""
    workdir = root / cfg.session_id
    plugin = workdir / "plugin"
    (plugin / ".claude-plugin").mkdir(parents=True, exist_ok=True)
    (plugin / ".claude-plugin" / "plugin.json").write_text(
        '{"name": "storysphere", "version": "0.1.0"}', encoding="utf-8"
    )
    source = cfg.workspace / "skills"
    if source.exists():
        shutil.copytree(source, plugin / "skills", dirs_exist_ok=True)
    return workdir, plugin


def child_env() -> dict[str, str]:
    return {k: os.environ[k] for k in ENV_ALLOWLIST if k in os.environ} | EXTRA_ENV


def tool_name(tool_call: Any) -> str:
    """`_meta.claudeCode.toolName` 是完整名稱；`title` 會變成人看的描述，不能拿來判斷。"""
    meta = getattr(tool_call, "field_meta", None) or {}
    return (meta.get("claudeCode") or {}).get("toolName") or ""


class _Client:
    """ACP client 端：旁白、模式守門、權限分流。"""

    def __init__(self, backend: AcpBackend, cfg: SessionConfig) -> None:
        self.backend = backend
        self.cfg = cfg
        self.conn: Any = None
        self.acp_session_id: str | None = None
        self.on_text: TextSink | None = None
        self.reply: list[str] = []

    async def session_update(self, session_id: str, update: Any, **_: Any) -> None:
        kind = getattr(update, "session_update", "")
        if kind == "agent_message_chunk":
            text = getattr(update.content, "text", None) or ""
            if text:
                self.reply.append(text)
                if self.on_text is not None:
                    self.on_text(text)
        elif kind == "current_mode_update" and update.current_mode_id != PERMISSION_MODE:
            # 大腦（或使用者在對話裡）切走權限模式：切回去，否則之後不再逐次詢問。
            logger.warning("Session %s left %s mode; switching back", self.cfg.session_id,
                           PERMISSION_MODE)  # fmt: skip
            await self.conn.set_session_mode(session_id=session_id, mode_id=PERMISSION_MODE)

    async def request_permission(
        self, session_id: str, tool_call: Any, options: list[Any], **_: Any
    ) -> RequestPermissionResponse:
        name = tool_name(tool_call)
        allowed = name == SKILL_TOOL or (
            name.startswith(MCP_PREFIX) and name.removeprefix(MCP_PREFIX) in self.cfg.allowed_tools
        )
        if allowed:
            # 只選 allow_once：不讓 harness 記住。`add_interpretation` 的確認由 MCP server 發。
            chosen = next((o for o in options if o.kind == "allow_once"), None)
            if chosen is not None:
                return RequestPermissionResponse(
                    outcome=AllowedOutcome(option_id=chosen.option_id, outcome="selected")
                )
        else:
            await self.backend.record_denied(self.cfg.session_id, name or "(unknown)",
                                             getattr(tool_call, "raw_input", None))  # fmt: skip
        chosen = next((o for o in options if o.kind == "reject_once"), None)
        if chosen is not None:
            return RequestPermissionResponse(
                outcome=AllowedOutcome(option_id=chosen.option_id, outcome="selected")
            )
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))


@dataclass
class _Live:
    client: _Client
    holder: asyncio.Task[None]
    stop: asyncio.Event = field(default_factory=asyncio.Event)
    workdir: Path | None = None


Spawn = Callable[..., Any]


class AcpBackend:
    def __init__(
        self,
        env: ToolEnv,
        launch_command: Callable[[], str] = lambda: DEFAULT_LAUNCH_COMMAND,
        *,
        spawn: Spawn = spawn_agent_process,
        workspace_root: Path | None = None,
    ) -> None:
        self.env = env
        self._launch_command = launch_command
        self._spawn = spawn
        self._root = workspace_root or Path(tempfile.gettempdir()) / "storysphere-agent"
        self._live: dict[str, _Live] = {}
        logging.getLogger().addFilter(_quiet)

    async def record_denied(self, session_id: str, tool: str, args: Any) -> None:
        """L0 白名單外的工具：不問使用者，直接拒絕並記 trace（04 §5.1）。"""
        sctx = self.env.sessions.get(session_id)
        if sctx is None:
            return
        async with sctx.trace_lock, self.env.session_factory() as db:
            row = await start_call(db, session_id=session_id, turn_id=sctx.turn_id, tool=tool,
                                   args=args if isinstance(args, dict) else {})  # fmt: skip
            await db.execute(
                update(TraceCallRow)
                .where(TraceCallRow.id == row.id)
                .values(status="denied", error_code="tool_not_allowed")
            )
            await db.commit()

    async def start(self, cfg: SessionConfig) -> None:
        command = shlex.split(self._launch_command())
        if not command or shutil.which(command[0]) is None:
            raise BackendError("backend_start_failed", f"Launch command not found: {command[:1]}")
        workdir, plugin = build_workspace(cfg, self._root)
        client = _Client(self, cfg)
        stop = asyncio.Event()
        ready: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        holder = asyncio.create_task(self._hold(cfg, command, workdir, plugin, client, ready, stop))
        try:
            await asyncio.wait_for(asyncio.shield(ready), START_TIMEOUT_S)
        except Exception as exc:
            stop.set()
            holder.cancel()
            await asyncio.gather(holder, return_exceptions=True)
            raise BackendError("backend_start_failed", f"Claude Code did not start: {exc}") from exc
        self._live[cfg.session_id] = _Live(client, holder, stop, workdir)

    async def _hold(
        self,
        cfg: SessionConfig,
        command: list[str],
        workdir: Path,
        plugin: Path,
        client: _Client,
        ready: asyncio.Future[None],
        stop: asyncio.Event,
    ) -> None:
        try:
            async with self._spawn(client, *command, env=child_env(), cwd=str(workdir)) as (conn, _):
                client.conn = conn
                # 不宣告 fs／terminal 能力：client 端不替大腦讀寫檔或開終端機。
                await conn.initialize(
                    protocol_version=PROTOCOL_VERSION,
                    client_capabilities=ClientCapabilities(),
                    client_info=Implementation(name="storysphere", version="0.1.0"),
                )
                mcp = HttpMcpServer(
                    type="http",
                    name=MCP_SERVER_NAME,
                    url=cfg.mcp_url,
                    headers=[HttpHeader(name="Authorization", value=f"Bearer {cfg.token}")],
                )
                session = await conn.new_session(
                    cwd=str(workdir),
                    mcp_servers=[mcp],
                    claudeCode={"options": isolation_options(plugin)},
                )
                client.acp_session_id = session.session_id
                # adapter 預設 auto 模式（不逐次詢問）：還沒送任何 prompt 前切成 default。
                await conn.set_session_mode(session_id=session.session_id, mode_id=PERMISSION_MODE)
                ready.set_result(None)
                await stop.wait()
        except Exception as exc:
            if not ready.done():
                ready.set_exception(exc)
            else:
                logger.exception("Claude Code process of session %s ended", cfg.session_id)

    async def send(self, session_id: str, text: str, on_text: TextSink) -> str:
        live = self._live.get(session_id)
        if live is None or live.holder.done():
            raise BackendError("backend_crashed", "Claude Code is not running; reopen the session.")
        client = live.client
        client.on_text, client.reply = on_text, []
        prompt = [TextContentBlock(type="text", text=text)]
        try:
            await client.conn.prompt(session_id=client.acp_session_id, prompt=prompt)
        except asyncio.CancelledError:
            await client.conn.cancel(session_id=client.acp_session_id)
            raise
        except RequestError as exc:
            message = str(exc)
            if "auth" in message.lower():
                raise BackendError("not_logged_in",
                                   "Claude Code is not logged in; run `claude` once to log in.") from exc  # fmt: skip
            raise BackendError("backend_crashed", message) from exc
        finally:
            client.on_text = None
        return "".join(client.reply)

    async def close(self, session_id: str) -> None:
        live = self._live.pop(session_id, None)
        if live is None:
            return
        live.stop.set()
        await asyncio.gather(live.holder, return_exceptions=True)
        if live.workdir is not None:
            shutil.rmtree(live.workdir, ignore_errors=True)
