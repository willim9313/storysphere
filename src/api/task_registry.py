"""In-process registry mapping task_id → asyncio.Task.

Enables true cancellation of background ingestion tasks via
POST /tasks/:taskId/cancel. Only valid within a single uvicorn worker process.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_registry: dict[str, asyncio.Task] = {}


def register(task_id: str, task: asyncio.Task) -> None:
    _registry[task_id] = task


def cancel(task_id: str) -> bool:
    """Cancel the running task. Returns False if not found or already done."""
    task = _registry.get(task_id)
    if task is None or task.done():
        return False
    task.cancel()
    logger.info("TaskRegistry: cancelled task %s", task_id)
    return True


def unregister(task_id: str) -> None:
    _registry.pop(task_id, None)
