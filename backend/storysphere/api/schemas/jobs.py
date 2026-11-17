"""`Job` (docs/spec/04 §2.3)."""

from __future__ import annotations

from typing import Any

from storysphere.api.schemas.common import ApiModel, UtcDatetime
from storysphere.store.tables import Job as JobRow


class Job(ApiModel):
    id: str
    kind: str
    book_id: str | None
    title: str | None
    status: str
    progress: int
    stage: str | None
    params: dict[str, Any] | None
    result: dict[str, Any] | None
    error: str | None
    error_kind: str | None
    parent_job_id: str | None
    last_seq: int
    created_at: UtcDatetime
    started_at: UtcDatetime | None
    finished_at: UtcDatetime | None


class JobAccepted(ApiModel):
    job_id: str


def job_out(row: JobRow) -> Job:
    return Job(
        id=row.id,
        kind=row.kind,
        book_id=row.book_id,
        title=row.title,
        status=row.status,
        progress=row.progress,
        stage=row.stage,
        params=row.params_json,
        result=row.result_json,
        error=row.error,
        error_kind=row.error_kind,
        parent_job_id=row.parent_job_id,
        last_seq=row.last_seq,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )
