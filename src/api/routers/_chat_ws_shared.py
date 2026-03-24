"""Shared WebSocket handler for chat agents.

Used by both ``chat_ws.py`` (ChatAgent) and ``chat_deep_ws.py`` (DeepChatAgent).
"""

from __future__ import annotations

import logging
import threading

from fastapi import WebSocket, WebSocketDisconnect

from agents.states import ChatState
from api.schemas.chat import ChatContext

logger = logging.getLogger(__name__)


def get_or_create_state(
    session_id: str,
    sessions: dict[str, ChatState],
    sessions_lock: threading.Lock,
) -> ChatState:
    with sessions_lock:
        if session_id not in sessions:
            sessions[session_id] = ChatState()
        return sessions[session_id]


def cleanup_state(
    session_id: str,
    sessions: dict[str, ChatState],
    sessions_lock: threading.Lock,
) -> None:
    with sessions_lock:
        sessions.pop(session_id, None)


async def handle_chat_websocket(
    websocket: WebSocket,
    agent,
    session_id: str,
    sessions: dict[str, ChatState],
    sessions_lock: threading.Lock,
) -> None:
    """Shared streaming chat loop for any agent with an ``astream`` method."""

    await websocket.accept()
    state = get_or_create_state(session_id, sessions, sessions_lock)
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

            # Hydrate page context into ChatState
            raw_ctx = data.get("context")
            if raw_ctx and isinstance(raw_ctx, dict):
                ctx = ChatContext(**raw_ctx)
                state.book_id = ctx.book_id
                state.chapter_id = ctx.chapter_id
                state.page_context = ctx.page
                if ctx.selected_entity and ctx.selected_entity.get("name"):
                    state.add_entity_mention(ctx.selected_entity["name"])

            try:
                await websocket.send_json({"type": "thinking"})
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
        cleanup_state(session_id, sessions, sessions_lock)
    except Exception:
        logger.exception("Unexpected WebSocket error: session=%s", session_id)
        cleanup_state(session_id, sessions, sessions_lock)
