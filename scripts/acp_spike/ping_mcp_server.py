"""T02 ACP spike: the smallest possible MCP server — one `ping` tool.

Streamable HTTP transport with a per-session Bearer token, the same shape the
real StorySphere MCP server will use (docs/spec/04 §1).
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

MCP_PATH = "/mcp"


def build_mcp_app(token: str, calls: list[dict]):
    """Return an ASGI app serving the ping tool; record calls and auth results in `calls`."""
    server = MCPServer("storysphere-spike")

    @server.tool()
    def ping(message: str) -> str:
        """Echo the message back. Used to prove the agent can reach StorySphere tools."""
        calls.append({"event": "tool", "tool": "ping", "message": message})
        return f"pong: {message}"

    inner = server.streamable_http_app(streamable_http_path=MCP_PATH)

    async def app(scope, receive, send):
        # lifespan 等非 http scope 原樣交給內層（session manager 靠 lifespan 啟動）。
        if scope["type"] != "http":
            await inner(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        authorized = headers.get(b"authorization", b"").decode() == f"Bearer {token}"
        calls.append({"event": "http", "method": scope["method"], "authorized": authorized})
        if not authorized:
            await send({"type": "http.response.start", "status": 401, "headers": []})
            await send({"type": "http.response.body", "body": b"unauthorized"})
            return
        await inner(scope, receive, send)

    return app
