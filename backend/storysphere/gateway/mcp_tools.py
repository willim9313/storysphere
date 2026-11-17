"""把 StorySphere MCP server 的工具包成 LangChain 工具（05 §5.1，T25 使用者決定）。

不用 `langchain-mcp-adapters`：它要求 `mcp<2`，與 T20 的 server 衝突。這裡用 `mcp` 2.x 的
`Client` 經 HTTP、帶 session token 連 `/mcp`，所以 token 驗證與 trace 都和外接大腦走同一條路。
"""

from __future__ import annotations

from typing import Any

import httpx2
from langchain_core.tools import StructuredTool, ToolException
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, TextContent


def http_client(url: str, token: str) -> Client:
    """未進入的 MCP client；呼叫端 `async with` 它。"""
    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=None)
    return Client(streamable_http_client(url, http_client=http))


def _text(result: CallToolResult) -> str:
    return "\n".join(part.text for part in result.content if isinstance(part, TextContent))


async def load_tools(client: Client, allowed: list[str]) -> list[StructuredTool]:
    """白名單內的工具；白名單外的大腦根本看不到（L0）。"""
    listed = await client.list_tools()
    tools: list[StructuredTool] = []
    for spec in listed.tools:
        if spec.name not in allowed:
            continue
        tools.append(_wrap(client, spec.name, spec.description or "", spec.input_schema))
    return tools


def _wrap(client: Client, name: str, description: str, schema: dict[str, Any]) -> StructuredTool:
    async def call(**kwargs: Any) -> str:
        result = await client.call_tool(name, kwargs)
        if result.is_error:
            # `{code, message, hint}` 原樣交給大腦（04 §5.2）。
            raise ToolException(_text(result))
        return _text(result)

    return StructuredTool(
        name=name,
        description=description,
        args_schema=schema,
        coroutine=call,
        handle_tool_error=True,
    )
