"""Chat WebSocket endpoint (original LangGraph agent).

WS /ws/chat?session_id=<uuid>

Message protocol:
  Client → Server:  {"message": "Who is Elizabeth?"}
  Server → Client:  {"type": "chunk", "content": "Elizabeth "}  (multiple)
  Server → Client:  {"type": "done"}
  Server → Client:  {"type": "error", "detail": "..."}
"""

from __future__ import annotations

import threading

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from storysphere.api.deps import ChatAgentDep
from storysphere.api.llm_guard import primary_config_error
from storysphere.api.routers._chat_ws_shared import handle_chat_websocket

router = APIRouter(tags=["chat"])

# In-memory session store: session_id → ChatState
_sessions: dict = {}
_sessions_lock = threading.Lock()


async def _reply_unconfigured(websocket: WebSocket) -> None:
    detail = f"LLM provider is not configured: {primary_config_error()}"
    await websocket.accept()
    try:
        while True:
            await websocket.receive_json()
            await websocket.send_json({"type": "error", "detail": detail})
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/chat")
async def chat_websocket(
    websocket: WebSocket,
    agent: ChatAgentDep,
    session_id: str = "default",
) -> None:
    """Streaming chat via WebSocket.

    Connect with ``?session_id=<your-id>`` to maintain conversation state
    across multiple messages within the same session.

    With no LLM provider configured there is no agent (``get_chat_agent``
    returns ``None``): the socket stays open and answers every message with an
    ``error`` frame, so the client shows the reason instead of reconnecting.
    """
    if agent is None:
        await _reply_unconfigured(websocket)
        return
    await handle_chat_websocket(
        websocket, agent, session_id, _sessions, _sessions_lock
    )
