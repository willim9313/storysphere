"""Tests for the POST /books/:bookId/rerun/:step endpoint.

Coverage:
  - 422 for unknown step name
  - 404 for unknown book
  - 202 with task_id for valid request (each of the 4 valid steps)
  - task_store entry is created and the background coroutine is invoked
  - _run_rerun_step happy path: pipeline_status moves to `done`, task to completed
  - _run_rerun_step failure path: pipeline_status set to `failed`, task to error
"""

from __future__ import annotations

import asyncio
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

sys.path.insert(0, "src")


VALID_STEPS = ["summarization", "feature-extraction", "knowledge-graph", "symbol-discovery"]


# ── Endpoint-level tests (patch _run_rerun_step to isolate handler) ──────────

class TestRerunEndpoint:
    def test_returns_422_for_unknown_step(self, client):
        with patch("api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/no-such-step")
        assert resp.status_code == 422
        assert "Unknown step" in resp.json()["detail"]

    def test_returns_404_for_unknown_book(self, client):
        with patch("api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/no-such-book/rerun/summarization")
        assert resp.status_code == 404

    @pytest.mark.parametrize("step", VALID_STEPS)
    def test_returns_202_with_task_id_for_valid_step(self, client, step):
        with patch("api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/books/doc-1/rerun/{step}")
        assert resp.status_code == 202
        body = resp.json()
        # camelCase per api/schemas/ alias_generator=to_camel
        assert "taskId" in body
        assert isinstance(body["taskId"], str)
        assert len(body["taskId"]) > 0

    def test_creates_task_store_entry(self, client):
        from api.store import task_store
        with patch("api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/summarization")
        task_id = resp.json()["taskId"]
        assert task_store.get(task_id) is not None

    def test_background_coroutine_called_with_step_and_book(self, client):
        """The handler must forward (task_id, book_id, step, doc, kg) to _run_rerun_step."""
        with patch("api.routers.books._run_rerun_step", new_callable=AsyncMock) as runner:
            resp = client.post("/api/v1/books/doc-1/rerun/knowledge-graph")
        assert resp.status_code == 202
        runner.assert_called_once()
        args = runner.call_args[0]
        # signature: (task_id, book_id, step, doc_service, kg_service)
        task_id, book_id, step, _doc, _kg = args
        assert book_id == "doc-1"
        assert step == "knowledge-graph"
        assert task_id == resp.json()["taskId"]


# ── _run_rerun_step internals ────────────────────────────────────────────────

class TestRunRerunStep:
    """Direct tests for the background coroutine, bypassing FastAPI."""

    def _make_doc(self):
        from domain.documents import Document, FileType, PipelineStatus, StepStatus
        return Document(
            id="book-x",
            title="T",
            author="A",
            file_path="/tmp/x.pdf",
            file_type=FileType.PDF,
            chapters=[],
            pipeline_status=PipelineStatus(
                summarization=StepStatus.failed,
                feature_extraction=StepStatus.failed,
                knowledge_graph=StepStatus.failed,
                symbol_discovery=StepStatus.failed,
            ),
        )

    def _make_workflow_mock(self):
        wf = MagicMock()
        wf._summarization_pipeline = MagicMock(run=AsyncMock())
        wf._feature_pipeline = MagicMock(run=AsyncMock())
        wf._kg_pipeline = MagicMock(run=AsyncMock())
        wf._kg_service = MagicMock(save=AsyncMock())
        wf._symbol_pipeline = MagicMock(run=AsyncMock())
        return wf

    @pytest.mark.parametrize(
        "step,status_attr",
        [
            ("summarization", "summarization"),
            ("feature-extraction", "feature_extraction"),
            ("knowledge-graph", "knowledge_graph"),
            ("symbol-discovery", "symbol_discovery"),
        ],
    )
    def test_happy_path_marks_step_done(self, step, status_attr):
        from api.routers.books import _run_rerun_step
        from api.store import task_store
        from domain.documents import StepStatus

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = self._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()
        wf = self._make_workflow_mock()

        with patch("workflows.ingestion.IngestionWorkflow", return_value=wf):
            asyncio.run(_run_rerun_step(task_id, "book-x", step, doc_svc, AsyncMock()))

        assert getattr(doc.pipeline_status, status_attr) == StepStatus.done
        doc_svc.update_pipeline_status.assert_awaited()
        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "done"
        assert status.result == {"bookId": "book-x", "step": step}

    def test_failure_path_marks_step_failed_and_task_error(self):
        from api.routers.books import _run_rerun_step
        from api.store import task_store
        from domain.documents import StepStatus

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = self._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()

        wf = self._make_workflow_mock()
        wf._feature_pipeline.run.side_effect = RuntimeError("boom")

        with patch("workflows.ingestion.IngestionWorkflow", return_value=wf):
            asyncio.run(
                _run_rerun_step(task_id, "book-x", "feature-extraction", doc_svc, AsyncMock())
            )

        assert doc.pipeline_status.feature_extraction == StepStatus.failed
        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "error"
        assert "boom" in (status.error or "")

    def test_book_not_found_marks_task_failed(self):
        from api.routers.books import _run_rerun_step
        from api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=None)

        asyncio.run(
            _run_rerun_step(task_id, "ghost-book", "summarization", doc_svc, AsyncMock())
        )

        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "error"
        assert "ghost-book" in (status.error or "")
