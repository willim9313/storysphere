"""In-memory task store for background job status tracking.

Suitable for development and single-process deployments.
For multi-process production, replace with a Redis or SQLite backend.
"""

from __future__ import annotations

import threading
from typing import Any

from api.schemas.common import TaskStatus


class TaskStore:
    """Thread-safe in-memory store for TaskStatus objects."""

    def __init__(self) -> None:
        self._store: dict[str, TaskStatus] = {}
        self._lock = threading.Lock()

    def create(self, task_id: str) -> TaskStatus:
        task = TaskStatus(task_id=task_id, status="pending")
        with self._lock:
            self._store[task_id] = task
        return task

    def get(self, task_id: str) -> TaskStatus | None:
        with self._lock:
            return self._store.get(task_id)

    def set_running(self, task_id: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "running"}
                )

    def set_completed(self, task_id: str, result: Any) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "completed", "result": result}
                )

    def set_failed(self, task_id: str, error: str) -> None:
        with self._lock:
            if task_id in self._store:
                self._store[task_id] = self._store[task_id].model_copy(
                    update={"status": "failed", "error": error}
                )


# Process-level singleton
task_store = TaskStore()
