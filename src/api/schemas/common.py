from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class TaskStatus(BaseModel):
    """Generic async task status envelope."""

    task_id: str
    status: Literal["pending", "running", "completed", "failed"]
    result: Any | None = None
    error: str | None = None


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
