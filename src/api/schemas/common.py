from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class TaskStatus(BaseModel):
    """Generic async task status envelope."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    task_id: str
    status: Literal["pending", "running", "done", "error"]
    progress: int = 0
    stage: str = ""
    sub_progress: int | None = None
    sub_total: int | None = None
    result: dict[str, Any] | None = None
    error: str | None = None


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
