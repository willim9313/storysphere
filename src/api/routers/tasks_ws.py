"""WebSocket endpoint for real-time task status push.

WS /ws/tasks/{task_id}
  — client subscribes; server pushes TaskStatus on every state change.
  — current status is sent immediately on connect.
  — connection stays open until client disconnects or task reaches a terminal
    state (done / error), at which point the server closes gracefully.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.store import get_task
from api.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tasks"])


@router.websocket("/ws/tasks/{task_id}")
async def ws_task_status(task_id: str, websocket: WebSocket) -> None:
    """Stream task status updates to the client.

    Protocol (server → client):
    - On connect: current ``TaskStatus`` JSON is sent immediately.
    - On each state change: updated ``TaskStatus`` JSON is pushed by the
      background worker via ``manager.push()``.
    - Periodic ``{"type": "ping"}`` keeps the connection alive.
    - Client should close after receiving ``status == "done"`` or ``"error"``.
    """
    await manager.connect(task_id, websocket)
    try:
        status = await get_task(task_id)
        if status is None:
            await websocket.send_json({"error": f"Task '{task_id}' not found"})
            return

        await websocket.send_json(status.model_dump())

        if status.status in ("done", "error"):
            return

        # Keep connection alive; updates arrive via manager.push()
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(task_id, websocket)
