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

from fastapi import APIRouter, WebSocket

from api.deps import ChatAgentDep
from api.routers._chat_ws_shared import handle_chat_websocket

router = APIRouter(tags=["chat"])

# In-memory session store: session_id → ChatState
_sessions: dict = {}
_sessions_lock = threading.Lock()


@router.websocket("/ws/chat")
async def chat_websocket(
    websocket: WebSocket,
    agent: ChatAgentDep,
    session_id: str = "default",
) -> None:
    """Streaming chat via WebSocket.

    Connect with ``?session_id=<your-id>`` to maintain conversation state
    across multiple messages within the same session.
    """
    await handle_chat_websocket(
        websocket, agent, session_id, _sessions, _sessions_lock
    )
