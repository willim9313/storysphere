"""Task status polling endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.schemas.common import TaskStatus
from api.store import get_task, task_store

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}/status", response_model=TaskStatus)
async def get_task_status(
    task_id: str,
    after: int = Query(default=0, ge=0, description="Return only murmur events with seq >= after"),
) -> TaskStatus:
    """Poll the status of a background task.

    Pass ``?after=N`` to receive only murmur events added since the last poll
    (delta semantics). The client is responsible for accumulating events.
    """
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    events = await task_store.get_murmur_events(task_id, after=after)
    return task.model_copy(update={"murmur_events": events})
