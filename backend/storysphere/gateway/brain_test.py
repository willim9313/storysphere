"""N-08g 大腦測試（05 §6「大腦」那一列）。

開一個暫時 session，請大腦呼叫一次 `list_genre_elements`，以 `trace_calls` 有這筆為準；測完關掉。
session 需要一本書：取書庫裡最早的一本，沒有書時 `session` 這項不通過。
"""

from __future__ import annotations

import asyncio
import json
import shlex
import shutil
from collections.abc import Callable
from typing import Any

from sqlalchemy import select

from storysphere.api.errors import ApiError
from storysphere.gateway.service import Gateway
from storysphere.mcp.runtime import session_stream
from storysphere.store.agent import TraceCallRow
from storysphere.store.books import BookRow

PROBE_TOOL = "list_genre_elements"
PROBE_PROMPT = (
    f"Connectivity test: call the tool `{PROBE_TOOL}` exactly once, then reply with the single word OK."
)


def _check(check: str, ok: bool, detail: str) -> dict[str, Any]:
    return {"check": check, "ok": ok, "detail": detail}


async def claude_login_status() -> tuple[bool, str]:
    """`claude auth status`；StorySphere 只讀登入與否，不碰憑證（05 §5.2）。"""
    if shutil.which("claude") is None:
        return False, "找不到 claude 指令；請先安裝 Claude Code"
    proc = await asyncio.create_subprocess_exec(
        "claude", "auth", "status",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )  # fmt: skip
    out, _ = await proc.communicate()
    try:
        logged_in = bool(json.loads(out).get("loggedIn"))
    except ValueError:
        return False, "無法解讀 claude auth status 的輸出"
    return logged_in, "已登入" if logged_in else "未登入；請在終端機執行 claude 並登入"


def _claude_prechecks(launch_command: str) -> list[dict[str, Any]]:
    command = shlex.split(launch_command)
    found = bool(command) and shutil.which(command[0]) is not None
    return [_check("npx", found, f"{command[0]} 可用" if found else f"找不到 {command[:1]}")]


def _last_error(gateway: Gateway, session_id: str) -> str:
    for event in reversed(gateway.env.bus.replay(session_stream(session_id), 0)):
        if event.type == "error":
            data = event.data.get("data", {})
            return f"{data.get('code')}: {data.get('message')}"
    return ""


LoginCheck = Callable[[], Any]


async def run_brain_test(
    gateway: Gateway,
    backend: str,
    *,
    launch_command: str = "",
    login_status: LoginCheck | None = None,
) -> dict[str, Any]:
    """deepagents：`session`、`tool_call`；claude-code 另在前面加 `npx`、`login`、`adapter`（N-08g）。"""
    checks: list[dict[str, Any]] = []
    claude = backend == "claude-code"
    if claude:
        checks += _claude_prechecks(launch_command)
        logged_in, detail = await (login_status or claude_login_status)()
        checks.append(_check("login", logged_in, detail))
        if not all(c["ok"] for c in checks):
            return {"backend": backend, "checks": checks}
    async with gateway.session_factory() as db:
        book = await db.scalar(select(BookRow).order_by(BookRow.uploaded_at).limit(1))
    if book is None:
        checks.append(_check("session", False, "需要書庫裡至少有一本書"))
        return {"backend": backend, "checks": checks}
    try:
        row = await gateway.open(book=book, backend=backend, genre=None, model=None)
    except ApiError as err:
        checks.append(_check("session", False, err.detail))
        return {"backend": backend, "checks": checks}
    try:
        if row.status != "ready":
            reason = _last_error(gateway, row.id) or row.status
            if claude:
                checks.append(_check("adapter", False, reason))
            else:
                checks.append(_check("session", False, reason))
            return {"backend": backend, "checks": checks}
        if claude:
            checks.append(_check("adapter", True, "adapter 已啟動"))
        checks.append(_check("session", True, "session 已建立"))
        await gateway.send(row.id, PROBE_PROMPT)
        await gateway.wait_turn(row.id)
        async with gateway.session_factory() as db:
            called = await db.scalar(
                select(TraceCallRow.id).where(
                    TraceCallRow.session_id == row.id, TraceCallRow.tool == PROBE_TOOL
                )
            )
        detail = f"已呼叫 {PROBE_TOOL}" if called else (
            _last_error(gateway, row.id) or f"大腦沒有呼叫 {PROBE_TOOL}"
        )
        checks.append(_check("tool_call", called is not None, detail))
        return {"backend": backend, "checks": checks}
    finally:
        await gateway.close(row.id)
