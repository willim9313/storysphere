"""Tests for the POST /books/:bookId/rerun/:step endpoint.

Coverage:
  - 422 for unknown step name
  - 404 for unknown book
  - 202 with task_id for valid request (each of the 4 valid steps)
  - task_store entry is created and the background coroutine is invoked
  - runner happy path: pipeline_status moves to `done`, task to completed
  - runner failure path: pipeline_status set to `failed`, task to error
"""

from __future__ import annotations

import asyncio
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

sys.path.insert(0, "src")


VALID_STEPS = ["summarization", "feature-extraction", "knowledge-graph", "symbol-discovery"]


# ── Endpoint-level tests (patch the runner to isolate the handler) ──────────

class TestRerunEndpoint:
    def test_returns_422_for_unknown_step(self, client):
        with patch("storysphere.api.routers.books._rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/no-such-step")
        assert resp.status_code == 422
        assert "Unknown step" in resp.json()["detail"]

    def test_returns_404_for_unknown_book(self, client):
        with patch("storysphere.api.routers.books._rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/no-such-book/rerun/summarization")
        assert resp.status_code == 404

    @pytest.mark.parametrize("step", VALID_STEPS)
    def test_returns_202_with_task_id_for_valid_step(self, client, step):
        with patch("storysphere.api.routers.books._rerun_step", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/books/doc-1/rerun/{step}")
        assert resp.status_code == 202
        body = resp.json()
        # camelCase per api/schemas/ alias_generator=to_camel
        assert "taskId" in body
        assert isinstance(body["taskId"], str)
        assert len(body["taskId"]) > 0

    def test_creates_task_store_entry(self, client):
        from storysphere.api.store import task_store
        with patch("storysphere.api.routers.books._rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/summarization")
        task_id = resp.json()["taskId"]
        assert task_store.get(task_id) is not None

    def test_background_coroutine_called_with_step_and_book(self, client):
        """The handler must forward (book_id, step, doc, kg) to the runner."""
        with patch("storysphere.api.routers.books._rerun_step", new_callable=AsyncMock) as runner:
            resp = client.post("/api/v1/books/doc-1/rerun/knowledge-graph")
        assert resp.status_code == 202
        runner.assert_called_once()
        args = runner.call_args[0]
        # signature: (book_id, step, doc_service, kg_service) — the task id is
        # the supervisor's business now, not the runner's.
        book_id, step, _doc, _kg = args
        assert book_id == "doc-1"
        assert step == "knowledge-graph"


# ── runner internals ─────────────────────────────────────────────────────────

class TestRunRerunStep:
    """The runner's only job now: mirror the workflow's outcome into the store.

    The rerun policy itself — step status, document persistence, KG save and
    cache invalidation — moved to ``IngestionWorkflow.rerun_step`` and is
    tested in ``tests/workflows/test_ingestion_rerun_step.py``.
    """

    @staticmethod
    def _run(outcome=None, *, error: Exception | None = None):
        """Drive the runner through the supervisor, as the endpoint does.

        The runner returns its result or raises ``TaskAborted``; turning that
        into a task status is ``task_runner``'s job, so the pair is what this
        needs to exercise.
        """
        from storysphere.api import task_runner
        from storysphere.api.routers.books import _rerun_step
        from storysphere.api.store import task_store

        wf = MagicMock()
        wf.rerun_step = (
            AsyncMock(side_effect=error) if error else AsyncMock(return_value=outcome)
        )

        async def _drive():
            task_id = f"rerun-{uuid4()}"
            task_store.create(task_id)
            await task_runner.launch(
                task_id,
                _rerun_step("book-x", "summarization", AsyncMock(), AsyncMock()),
            )
            return task_id

        with patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf):
            task_id = asyncio.run(_drive())
        return task_store.get(task_id), wf

    def test_successful_outcome_completes_the_task(self):
        from storysphere.workflows.ingestion import StepOutcome

        status, wf = self._run(StepOutcome(step="summarization"))

        assert status.status == "done"
        assert status.result == {"bookId": "book-x", "step": "summarization"}
        wf.rerun_step.assert_awaited_once_with("summarization", "book-x")

    def test_failed_outcome_carries_its_error_to_the_task(self):
        from storysphere.workflows.ingestion import StepOutcome

        status, _ = self._run(StepOutcome(step="summarization", error="boom"))

        assert status.status == "error"
        assert status.error == "boom"

    def test_missing_book_surfaces_as_a_failed_task(self):
        """rerun_step reports it as a failed outcome, not an exception."""
        from storysphere.workflows.ingestion import StepOutcome

        status, _ = self._run(
            StepOutcome(step="summarization", error="Book 'ghost-book' not found")
        )

        assert status.status == "error"
        assert "ghost-book" in (status.error or "")

    def test_unexpected_exception_fails_the_task(self):
        status, _ = self._run(error=RuntimeError("disk full"))

        assert status.status == "error"
        assert "disk full" in (status.error or "")

    def test_cancellation_marks_the_task_and_propagates(self):
        from storysphere.api import task_runner
        from storysphere.api.routers.books import _rerun_step
        from storysphere.api.store import task_store

        wf = MagicMock()
        wf.rerun_step = AsyncMock(side_effect=asyncio.CancelledError())
        holder = {}

        async def _drive():
            task_id = f"rerun-{uuid4()}"
            holder["id"] = task_id
            task_store.create(task_id)
            await task_runner.launch(
                task_id,
                _rerun_step("book-x", "summarization", AsyncMock(), AsyncMock()),
            )

        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf),
            pytest.raises(asyncio.CancelledError),
        ):
            asyncio.run(_drive())

        assert task_store.get(holder["id"]).status == "error"


class TestPipelineStepTimestamps:
    """A completed step records when it finished, for staleness comparison."""

    def test_mark_done_sets_status_and_timestamp(self):
        from datetime import UTC, datetime

        from storysphere.domain.documents import PipelineStatus, StepStatus

        status = PipelineStatus()
        assert status.summarization_at is None

        before = datetime.now(UTC)
        status.mark_done("summarization")

        assert status.summarization == StepStatus.done
        assert status.summarization_at is not None
        assert status.summarization_at >= before


class TestRerunStepRegistry:
    """The endpoint's step vocabulary must stay in step with the workflow's."""

    def test_rerun_steps_match_the_workflow_registry(self):
        from storysphere.api.routers.books import _RERUN_STEPS
        from storysphere.workflows.ingestion import INGESTION_STEPS

        assert _RERUN_STEPS == set(INGESTION_STEPS)

    def test_valid_steps_constant_matches_too(self):
        from storysphere.workflows.ingestion import INGESTION_STEPS

        assert set(VALID_STEPS) == set(INGESTION_STEPS)
