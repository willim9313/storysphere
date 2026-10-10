from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class MurmurEvent(BaseModel):
    """A single murmur event emitted during ingestion."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    seq: int
    step_key: Literal[
        "pdfParsing", "summarization", "featureExtraction",
        "knowledgeGraph", "symbolExploration",
    ]
    type: Literal["character", "location", "org", "event", "topic", "symbol", "raw"]
    content: str
    meta: dict[str, Any] | None = None
    raw_content: str | None = None


class TaskStatus(BaseModel):
    """Generic async task status envelope."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    task_id: str
    status: Literal["pending", "running", "done", "error", "awaiting_review"]
    progress: int = 0
    stage: str = ""
    # Machine-readable pipeline step (e.g. "summarization", "knowledgeGraph")
    # so the frontend timeline doesn't have to reverse-map progress ranges.
    step_key: str | None = None
    sub_progress: int | None = None
    sub_total: int | None = None
    sub_stage: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    kind: str | None = None
    title: str | None = None
    created_at: str | None = None
    # When the task reached done / error — UTC ISO-8601 with a trailing "Z".
    # The task center's "N 分鐘前完成" is measured from this, not created_at:
    # a 20-minute ingestion would otherwise read "20 分鐘前完成" the moment it
    # lands. None while the task is still pending / running / awaiting_review.
    finished_at: str | None = None
    murmur_events: list[MurmurEvent] = []


class ActiveBatchResponse(BaseModel):
    """The batch of one kind currently running for a book (``…/analyze-all/active``)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    task_id: str | None = None


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
