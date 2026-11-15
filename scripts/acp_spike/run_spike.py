"""T02 ACP spike: drive Claude Code through the ACP adapter from Python.

    uv run --with agent-client-protocol --with mcp --with uvicorn \
        python scripts/acp_spike/run_spike.py [--out result.json]

驗證三件事（docs/spec/07 T02）：
  A. 建 session 時傳入 MCP server，大腦呼叫 `ping`，Python 端收到 tool_call 與結果事件。
  B. 關掉 Claude Code 自帶的 Bash、寫檔工具。
  C. permission request 能在 Python 端攔下（允許、拒絕各一次）。

會用到本機已登入的 Claude Code（吃訂閱額度）；不讀取、不傳遞任何憑證。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import socket
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import uvicorn
from acp import PROTOCOL_VERSION, spawn_agent_process
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

sys.path.insert(0, str(Path(__file__).parent))
from ping_mcp_server import MCP_PATH, build_mcp_app  # noqa: E402

ADAPTER = ("npx", "-y", "@agentclientprotocol/claude-agent-acp")

# 隔離選項（經 adapter 的 `_meta.claudeCode.options` 傳給 Claude Agent SDK）：
#   settingSources: []   不載入使用者／專案的 Claude 設定（允許規則、預設權限模式、MCP server）
#   strict-mcp-config    只用 session 傳入的 MCP server，不帶帳號的連接器
ISOLATION = {"settingSources": [], "extraArgs": {"strict-mcp-config": None}}
PROMPT_TIMEOUT_S = 180


class SpikeClient:
    """ACP client side: records every session update and answers permission requests."""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.permission_policy = "allow"  # allow | deny
        self.scenario = "setup"

    async def session_update(self, session_id: str, update: Any, **kwargs: Any) -> None:
        kind = getattr(update, "session_update", type(update).__name__)
        record: dict[str, Any] = {"scenario": self.scenario, "type": kind}
        if kind in ("tool_call", "tool_call_update"):
            record.update(
                tool_call_id=update.tool_call_id,
                title=update.title,
                tool_kind=update.kind,
                status=update.status,
                raw_input=update.raw_input,
                raw_output=_short(update.raw_output),
                meta=update.field_meta,
            )
        elif kind == "agent_message_chunk":
            record["text"] = getattr(update.content, "text", None)
        else:
            return  # 其餘更新（usage、mode、commands…）與驗證無關
        self.events.append(record)

    async def request_permission(
        self, session_id: str, tool_call: Any, options: list[Any], **kwargs: Any
    ) -> RequestPermissionResponse:
        decision = self.permission_policy
        self.events.append(
            {
                "scenario": self.scenario,
                "type": "permission_request",
                "tool_call_id": tool_call.tool_call_id,
                "title": tool_call.title,
                "raw_input": tool_call.raw_input,
                "options": [{"id": o.option_id, "kind": o.kind, "name": o.name} for o in options],
                "decision": decision,
            }
        )
        if decision == "allow":
            # 只選 allow_once：不讓 harness 記住，之後每次都還會來問。
            chosen = next((o for o in options if o.kind == "allow_once"), None)
            if chosen is not None:
                return RequestPermissionResponse(
                    outcome=AllowedOutcome(option_id=chosen.option_id, outcome="selected")
                )
        chosen = next((o for o in options if o.kind == "reject_once"), None)
        if chosen is not None:
            return RequestPermissionResponse(
                outcome=AllowedOutcome(option_id=chosen.option_id, outcome="selected")
            )
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))


def _short(value: Any, limit: int = 300) -> Any:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text if text is None or len(text) <= limit else text[:limit] + "…"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def _open_session(conn, result: dict, label: str, workdir: str, mcp_server, options: dict):
    """Create a session, then force the `default` permission mode (ask before every tool)."""
    session = await conn.new_session(
        cwd=workdir, mcp_servers=[mcp_server], claudeCode={"options": options}
    )
    modes = session.modes
    info = {
        "options": options,
        "initial_mode": modes.current_mode_id if modes else None,
        "available_modes": [m.id for m in modes.available_modes] if modes else [],
    }
    # adapter 預設會選 auto 模式（不逐次詢問）；改成 default 才會每次都送 permission request。
    await conn.set_session_mode(session_id=session.session_id, mode_id="default")
    info["mode_after_set"] = "default"
    result.setdefault("sessions", {})[label] = info
    return session.session_id


async def _run_prompt(conn, client: SpikeClient, session_id: str, scenario: str, text: str) -> str:
    client.scenario = scenario
    started = time.monotonic()
    response = await asyncio.wait_for(
        conn.prompt(session_id=session_id, prompt=[TextContentBlock(type="text", text=text)]),
        timeout=PROMPT_TIMEOUT_S,
    )
    client.events.append(
        {
            "scenario": scenario,
            "type": "done",
            "stop_reason": response.stop_reason,
            "seconds": round(time.monotonic() - started, 1),
        }
    )
    return response.stop_reason


async def main(out_path: Path | None) -> int:
    token = secrets.token_urlsafe(24)
    mcp_calls: list[dict] = []
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            build_mcp_app(token, mcp_calls), host="127.0.0.1", port=port, log_level="warning"
        )
    )
    server_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)

    mcp_server = HttpMcpServer(
        type="http",
        name="storysphere",
        url=f"http://127.0.0.1:{port}{MCP_PATH}",
        headers=[HttpHeader(name="Authorization", value=f"Bearer {token}")],
    )
    client = SpikeClient()
    result: dict[str, Any] = {"adapter": " ".join(ADAPTER)}

    # 空的 session 工作目錄（架構文件 L0）。
    with tempfile.TemporaryDirectory(prefix="acp-spike-") as workdir:
        async with spawn_agent_process(client, *ADAPTER, env=dict(os.environ)) as (conn, _proc):
            init = await conn.initialize(
                protocol_version=PROTOCOL_VERSION,
                # 不宣告 fs／terminal 能力：client 端不替 agent 讀寫檔或開終端機。
                client_capabilities=ClientCapabilities(),
                client_info=Implementation(name="storysphere-acp-spike", version="0.0.1"),
            )
            result["agent_info"] = init.agent_info.model_dump() if init.agent_info else None
            result["protocol_version"] = init.protocol_version

            # --- Session 1：內建工具全關（tools: []），只剩傳入的 MCP server ---
            locked_id = await _open_session(
                conn, result, "locked", workdir, mcp_server, {**ISOLATION, "tools": []}
            )
            client.permission_policy = "allow"
            await _run_prompt(
                conn,
                client,
                locked_id,
                "A_ping_allowed",
                "Call the `ping` tool from the `storysphere` MCP server with message "
                "'hello-from-spike', then tell me exactly what it returned.",
            )
            await _run_prompt(
                conn,
                client,
                locked_id,
                "B_builtin_tools_off",
                "Use your Bash tool to run `echo spike > bash.txt`, and use your Write tool to "
                "create `write.txt` containing 'spike'. If a tool is not available to you, do "
                "not work around it; just list the exact names of every tool you do have.",
            )
            client.permission_policy = "deny"
            await _run_prompt(
                conn,
                client,
                locked_id,
                "C_ping_denied",
                "Call the `ping` tool again with message 'second-call'. Report whether it "
                "succeeded.",
            )

            # --- Session 2：內建工具保留，看 Bash／寫檔的 permission request 能否攔下 ---
            default_id = await _open_session(
                conn, result, "builtin_on", workdir, mcp_server, dict(ISOLATION)
            )
            client.permission_policy = "deny"
            await _run_prompt(
                conn,
                client,
                default_id,
                "D_builtin_denied",
                "Use Bash to run `echo spike > bash2.txt` and use Write to create `write2.txt` "
                "containing 'spike'. Report what happened; do not retry if refused.",
            )

        result["files_in_workdir"] = sorted(p.name for p in Path(workdir).iterdir())

    server.should_exit = True
    await server_task

    result["mcp_server_log"] = mcp_calls
    result["events"] = client.events
    text = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if out_path:
        out_path.write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=None)
    raise SystemExit(asyncio.run(main(parser.parse_args().out)))
