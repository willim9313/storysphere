"""Chat WebSocket endpoint.

WS /ws/chat?session_id=<uuid>

Message protocol:
  Client → Server:  {"message": "Who is Elizabeth?"}
  Server → Client:  {"type": "chunk", "content": "Elizabeth "}  (multiple)
  Server → Client:  {"type": "done"}
  Server → Client:  {"type": "error", "detail": "..."}
"""

from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from agents.states import ChatState
from api.deps import ChatAgentDep, get_chat_agent

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

# In-memory session store: session_id → ChatState
_sessions: dict[str, ChatState] = {}
_sessions_lock = threading.Lock()


def _get_or_create_state(session_id: str) -> ChatState:
    with _sessions_lock:
        if session_id not in _sessions:
            _sessions[session_id] = ChatState()
        return _sessions[session_id]


def _cleanup_state(session_id: str) -> None:
    with _sessions_lock:
        _sessions.pop(session_id, None)


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

    await websocket.accept()
    state = _get_or_create_state(session_id)
    logger.info("WebSocket connected: session=%s", session_id)

    try:
        while True:
            data = await websocket.receive_json()
            query = (data.get("message") or "").strip()
            if not query:
                await websocket.send_json({"type": "error", "detail": "Empty message"})
                continue

            language = data.get("language") or state.language
            state.language = language

            try:
                async for chunk in agent.astream(
                    query, state, language=language
                ):
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done"})
            except Exception as exc:
                logger.exception("Chat error for session %s", session_id)
                await websocket.send_json({"type": "error", "detail": str(exc)})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
        _cleanup_state(session_id)
    except Exception:
        logger.exception("Unexpected WebSocket error: session=%s", session_id)
        _cleanup_state(session_id)
