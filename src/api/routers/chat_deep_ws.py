"""DeepAgent Chat WebSocket endpoint.

WS /ws/chat-deep?session_id=<uuid>

Same protocol as /ws/chat but uses DeepChatAgent (``create_deep_agent``).
"""

from __future__ import annotations

import threading

from fastapi import APIRouter, WebSocket

from api.deps import DeepChatAgentDep
from api.routers._chat_ws_shared import handle_chat_websocket

router = APIRouter(tags=["chat-deep"])

# Independent session store (not shared with /ws/chat)
_sessions: dict = {}
_sessions_lock = threading.Lock()


@router.websocket("/ws/chat-deep")
async def chat_deep_websocket(
    websocket: WebSocket,
    agent: DeepChatAgentDep,
    session_id: str = "default",
) -> None:
    """Streaming chat via WebSocket using DeepAgent.

    Connect with ``?session_id=<your-id>`` to maintain conversation state
    across multiple messages within the same session.
    """
    await handle_chat_websocket(
        websocket, agent, session_id, _sessions, _sessions_lock
    )
