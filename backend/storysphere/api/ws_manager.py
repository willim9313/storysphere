"""WebSocket connection manager for task status push notifications."""

from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections keyed by task_id.

    Background tasks call ``push()`` to broadcast status updates to all
    subscribers of a given task_id.
    """

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, task_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[task_id].append(ws)

    def disconnect(self, task_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(task_id)
        if conns and ws in conns:
            conns.remove(ws)
        if not self._connections.get(task_id):
            self._connections.pop(task_id, None)

    async def push(self, task_id: str, data: dict) -> None:
        """Send *data* to every client subscribed to *task_id*.

        Dead connections are silently removed.
        """
        for ws in list(self._connections.get(task_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(task_id, ws)


manager = ConnectionManager()
