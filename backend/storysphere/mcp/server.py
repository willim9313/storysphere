"""StorySphere MCP server（04 §5）：給大腦的 14 個工具，掛在 `/mcp`（Streamable HTTP）。

驗證：`Authorization: Bearer <session token>`，比對 `agent_sessions.token_hash`；不對回 401。
`book_id` 不是工具參數，由 session 決定（04 §5.2）。
"""

from __future__ import annotations

from collections.abc import Callable

from mcp.server.mcpserver import MCPServer
from starlette.types import ASGIApp, Receive, Scope, Send

from storysphere.mcp import tools_read, tools_write
from storysphere.mcp.runtime import ToolEnv
from storysphere.store.agent import session_by_token

SERVER_NAME = "storysphere"
MCP_PATH = "/mcp"


def build_mcp_server(env: ToolEnv) -> MCPServer:
    server = MCPServer(SERVER_NAME)
    tools_read.register(server, env)
    tools_write.register(server, env)
    return server


async def _unauthorized(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b'{"detail":"Unknown or closed agent session.","code":"unauthorized"}',
        }
    )


def mcp_asgi_app(server: MCPServer, env: ToolEnv) -> ASGIApp:
    """The streamable HTTP app behind a Bearer-token check (spike: `scripts/acp_spike`)."""
    inner = server.streamable_http_app(streamable_http_path=MCP_PATH)

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await inner(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"").decode()
        token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
        row = None
        if token:
            async with env.session_factory() as db:
                row = await session_by_token(db, token)
        if row is None:
            await _unauthorized(send)
            return
        env.sessions.ensure(row)
        await inner(scope, receive, send)

    return app


class McpMount:
    """Routed at import time; forwards to the MCP app the lifespan builds."""

    def __init__(self, get_app: Callable[[], ASGIApp | None]) -> None:
        self._get_app = get_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        app = self._get_app()
        if app is None:
            await send({"type": "http.response.start", "status": 503, "headers": []})
            await send({"type": "http.response.body", "body": b"MCP server not started"})
            return
        await app(scope, receive, send)
