"""Adapter that lets the ingestion graph report progress without knowing the API.

``workflows/ingestion_graph.py`` defines the ``IngestionReporter`` protocol it
needs; this is the implementation the API layer supplies at startup.  Keeping
it here is what allows the workflow layer to stay free of imports from
``storysphere.api`` — the task store, the murmur wire model and the camelCase
shape of the task result are all API concerns and stay on this side.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from storysphere.api.schemas.common import MurmurEvent
from storysphere.api.store import task_store

if TYPE_CHECKING:
    from storysphere.workflows.ingestion import IngestionResult


class TaskStoreReporter:
    """Reports one ingestion run's progress into the global task store."""

    def __init__(self, task_id: str) -> None:
        self._task_id = task_id

    def progress(
        self,
        pct: int,
        stage: str,
        *,
        step_key: str | None = None,
        sub_progress: int | None = None,
        sub_total: int | None = None,
        sub_stage: str | None = None,
    ) -> None:
        task_store.set_progress(
            self._task_id,
            pct,
            stage,
            step_key=step_key,
            sub_progress=sub_progress,
            sub_total=sub_total,
            sub_stage=sub_stage,
        )

    async def murmur(
        self,
        step_key: str,
        event_type: str,
        content: str,
        *,
        meta: dict | None = None,
        raw_content: str | None = None,
    ) -> None:
        # seq is assigned by the store, which owns the per-task ordering.
        await task_store.append_murmur(
            self._task_id,
            MurmurEvent(
                seq=0,
                step_key=step_key,
                type=event_type,
                content=content,
                meta=meta,
                raw_content=raw_content,
            ),
        )

    def awaiting_review(self, doc_id: str) -> None:
        task_store.set_awaiting_review(self._task_id, doc_id)

    def running(self) -> None:
        task_store.set_running(self._task_id)

    def completed(self, result: IngestionResult) -> dict:
        """Store the finished run and return the payload that was stored."""
        from storysphere.api.schemas.books import TimelineDetectionResponse  # noqa: PLC0415

        task_result: dict = {
            "bookId": result.document_id,
            "failedSteps": result.errors,
        }
        if result.timeline_detection is not None:
            task_result["timelineDetection"] = TimelineDetectionResponse.model_validate(
                result.timeline_detection.model_dump()
            ).model_dump(by_alias=True)

        task_store.set_completed(self._task_id, result=task_result)
        return task_result
