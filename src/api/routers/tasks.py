"""Task status polling endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas.common import TaskStatus
from api.store import get_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str) -> TaskStatus:
    """Poll the status of a background task."""
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task
