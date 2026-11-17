"""deepagents 後端（05 §5.1）。

- 工具：`gateway/mcp_tools` 經 HTTP 連 StorySphere 的 MCP server，只給白名單內的。
- 檔案：`FilesystemBackend` 以 session 工作目錄為虛擬根（不能 `..` 跳出去），寫入一律拒絕；
  它不是 sandbox，`execute` 只會回錯誤（L0：不給 shell）。
- skills：工作目錄下的 `/skills/`。
- 對話紀錄：記憶體的 checkpointer，thread＝session id；伺服器重啟後大腦不記得前面的輪次
  （旁白另存 `messages_json`，只給畫面用）。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from storysphere.gateway.base import BackendError, SessionConfig, TextSink, system_prompt
from storysphere.gateway.mcp_tools import http_client, load_tools
from storysphere.llm.router import LlmUnconfigured, chat_model_for
from storysphere.llm.settings import load_settings

logger = logging.getLogger(__name__)

BRAIN_TASK = "brain"
# 單輪最多幾步（模型呼叫＋工具呼叫）；防止大腦繞圈。
RECURSION_LIMIT = 60

ModelFactory = Callable[[str | None], BaseChatModel]
# (url, token) → 未進入的 MCP client；測試換成 in-process 的。
ClientFactory = Callable[[str, str], Any]


# L0（架構文件「權限分級」）：deepagents 自帶、會寫檔或跑 shell 的工具，以及會開子 agent 的 `task`
# （子 agent 不經這層過濾）。只留唯讀的 ls／read_file／glob／grep 給它讀 skills。
HIDDEN_TOOLS = frozenset({"execute", "write_file", "edit_file", "task"})


class HideTools(AgentMiddleware):
    """模型看不到 ``HIDDEN_TOOLS``；就算硬叫也回錯誤。"""

    async def awrap_model_call(self, request: Any, handler: Any) -> Any:
        tools = [t for t in request.tools if getattr(t, "name", None) not in HIDDEN_TOOLS]
        return await handler(request.override(tools=tools))

    async def awrap_tool_call(self, request: Any, handler: Any) -> Any:
        name = request.tool_call["name"]
        if name in HIDDEN_TOOLS:
            return ToolMessage(
                content=f"Error: {name} is not available.",
                tool_call_id=request.tool_call["id"] or "",
                name=name,
                status="error",
            )
        return await handler(request)


def default_model(model_name: str | None) -> BaseChatModel:
    return chat_model_for(BRAIN_TASK, settings=load_settings(), model_name=model_name)


@dataclass
class _Live:
    agent: Any
    holder: asyncio.Task[None]
    stop: asyncio.Event = field(default_factory=asyncio.Event)


def _chunk_text(content: Any) -> str:
    """Gemini 的串流片段可能是字串或 parts 清單。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
            if not isinstance(part, dict) or part.get("type", "text") == "text"
        )
    return ""


class DeepAgentsBackend:
    def __init__(
        self,
        model_factory: ModelFactory = default_model,
        client_factory: ClientFactory = http_client,
    ) -> None:
        self._model_factory = model_factory
        self._client_factory = client_factory
        self._live: dict[str, _Live] = {}
        self._checkpointer = InMemorySaver()

    async def start(self, cfg: SessionConfig) -> None:
        try:
            model = self._model_factory(cfg.model)
        except LlmUnconfigured as exc:
            raise BackendError("llm_unconfigured", f"No usable model for task {exc}.") from exc
        # MCP client 的 context 要在同一個 task 進出（anyio），所以由一個常駐 task 持有到 close。
        stop = asyncio.Event()
        ready: asyncio.Future[list[Any]] = asyncio.get_running_loop().create_future()
        holder = asyncio.create_task(self._hold(cfg, ready, stop))
        try:
            tools = await ready
        except Exception as exc:
            await asyncio.gather(holder, return_exceptions=True)
            raise BackendError(
                "backend_start_failed", f"Cannot reach the StorySphere MCP server: {exc}"
            ) from exc
        agent = create_deep_agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt(cfg),
            skills=["/skills/"] if cfg.skills else None,
            backend=FilesystemBackend(root_dir=cfg.workspace, virtual_mode=True),
            permissions=[FilesystemPermission(operations=["write"], paths=["/**"], mode="deny")],
            middleware=[HideTools()],
            checkpointer=self._checkpointer,
            name="storysphere-brain",
        )
        self._live[cfg.session_id] = _Live(agent, holder, stop)

    async def _hold(
        self, cfg: SessionConfig, ready: asyncio.Future[list[Any]], stop: asyncio.Event
    ) -> None:
        try:
            async with self._client_factory(cfg.mcp_url, cfg.token) as client:
                ready.set_result(await load_tools(client, cfg.allowed_tools))
                await stop.wait()
        except Exception as exc:
            if not ready.done():
                ready.set_exception(exc)
            else:
                logger.exception("MCP connection of session %s dropped", cfg.session_id)

    async def send(self, session_id: str, text: str, on_text: TextSink) -> str:
        live = self._live.get(session_id)
        if live is None:
            raise BackendError("backend_crashed", "Session is not running; reopen it.")
        config = {"configurable": {"thread_id": session_id}, "recursion_limit": RECURSION_LIMIT}
        final = ""
        async for event in live.agent.astream_events(
            {"messages": [{"role": "user", "content": text}]}, config=config, version="v2"
        ):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                # 子 agent（`task` 工具）的旁白也算進來；原型不分。
                piece = _chunk_text(getattr(event["data"].get("chunk"), "content", ""))
                if piece:
                    on_text(piece)
            elif kind == "on_chat_model_end":
                output = event["data"].get("output")
                if output is not None and not getattr(output, "tool_calls", None):
                    final = _chunk_text(getattr(output, "content", "")) or final
        return final

    async def close(self, session_id: str) -> None:
        live = self._live.pop(session_id, None)
        if live is not None:
            live.stop.set()
            await asyncio.gather(live.holder, return_exceptions=True)
