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
        with patch("storysphere.api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/no-such-step")
        assert resp.status_code == 422
        assert "Unknown step" in resp.json()["detail"]

    def test_returns_404_for_unknown_book(self, client):
        with patch("storysphere.api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/no-such-book/rerun/summarization")
        assert resp.status_code == 404

    @pytest.mark.parametrize("step", VALID_STEPS)
    def test_returns_202_with_task_id_for_valid_step(self, client, step):
        with patch("storysphere.api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post(f"/api/v1/books/doc-1/rerun/{step}")
        assert resp.status_code == 202
        body = resp.json()
        # camelCase per api/schemas/ alias_generator=to_camel
        assert "taskId" in body
        assert isinstance(body["taskId"], str)
        assert len(body["taskId"]) > 0

    def test_creates_task_store_entry(self, client):
        from storysphere.api.store import task_store
        with patch("storysphere.api.routers.books._run_rerun_step", new_callable=AsyncMock):
            resp = client.post("/api/v1/books/doc-1/rerun/summarization")
        task_id = resp.json()["taskId"]
        assert task_store.get(task_id) is not None

    def test_background_coroutine_called_with_step_and_book(self, client):
        """The handler must forward (task_id, book_id, step, doc, kg) to _run_rerun_step."""
        with patch("storysphere.api.routers.books._run_rerun_step", new_callable=AsyncMock) as runner:
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
        from storysphere.domain.documents import Document, FileType, PipelineStatus, StepStatus
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

    def _make_workflow_mock(self, doc_service=None, kg_service=None):
        """A real IngestionWorkflow with mocked pipelines.

        Deliberately not a bare MagicMock: the per-step contract (status
        transition, status persistence, saving the Document) lives in
        ``IngestionWorkflow.run_step``, so mocking the whole workflow would
        leave these tests asserting against the mock instead of that logic.
        Only the pipelines — the slow, LLM-backed parts — are stubbed.
        """
        from storysphere.workflows.ingestion import IngestionWorkflow

        return IngestionWorkflow(
            summarization_pipeline=MagicMock(run=AsyncMock()),
            feature_pipeline=MagicMock(run=AsyncMock()),
            kg_pipeline=MagicMock(run=AsyncMock()),
            symbol_pipeline=MagicMock(run=AsyncMock()),
            document_service=doc_service or AsyncMock(),
            kg_service=kg_service or MagicMock(save=AsyncMock()),
        )

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
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store
        from storysphere.domain.documents import StepStatus

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = self._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()
        wf = self._make_workflow_mock(doc_service=doc_svc)

        with patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf):
            asyncio.run(_run_rerun_step(task_id, "book-x", step, doc_svc, AsyncMock()))

        assert getattr(doc.pipeline_status, status_attr) == StepStatus.done
        doc_svc.update_pipeline_status.assert_awaited()
        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "done"
        assert status.result == {"bookId": "book-x", "step": step}

    def test_failure_path_marks_step_failed_and_task_error(self):
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store
        from storysphere.domain.documents import StepStatus

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = self._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()

        wf = self._make_workflow_mock(doc_service=doc_svc)
        wf._feature_pipeline.run.side_effect = RuntimeError("boom")

        with patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf):
            asyncio.run(
                _run_rerun_step(task_id, "book-x", "feature-extraction", doc_svc, AsyncMock())
            )

        assert doc.pipeline_status.feature_extraction == StepStatus.failed
        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "error"
        assert "boom" in (status.error or "")

    def test_book_not_found_marks_task_failed(self):
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

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


class TestRerunPersistsDocumentOutput:
    """Chapter summaries and keywords live on the Document, so a rerun must save it.

    The pipelines mutate the Document in place and never write to SQLite — without
    an explicit save the LLM output is generated, charged for, and then dropped.
    """

    def _run(self, step, *, failing: bool = False):
        """Run the step; return the doc_service mock and the Document it saw."""
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = TestRunRerunStep()._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()
        doc_svc.save_document = AsyncMock()

        wf = TestRunRerunStep()._make_workflow_mock(doc_service=doc_svc)
        if failing:
            attr = {
                "summarization": "_summarization_pipeline",
                "feature-extraction": "_feature_pipeline",
            }[step]
            getattr(wf, attr).run.side_effect = RuntimeError("rate limited")

        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[])
        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf),
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=AsyncMock()),
            patch("storysphere.config.settings.get_settings"),
        ):
            asyncio.run(_run_rerun_step(task_id, "book-x", step, doc_svc, kg))
        return doc_svc, doc

    @pytest.mark.parametrize("step", ["summarization", "feature-extraction"])
    def test_saves_document_after_doc_mutating_step(self, step):
        doc_svc, doc = self._run(step)
        doc_svc.save_document.assert_awaited_once_with(doc)

    @pytest.mark.parametrize("step", ["summarization", "feature-extraction"])
    def test_saves_partial_output_when_step_fails(self, step):
        """A rate-limited run leaves summaries on the chapters it got through;
        saving them is what lets the next rerun skip and resume."""
        doc_svc, doc = self._run(step, failing=True)
        doc_svc.save_document.assert_awaited_once_with(doc)

    @pytest.mark.parametrize("step", ["knowledge-graph", "symbol-discovery"])
    def test_does_not_rewrite_document_for_non_doc_steps(self, step):
        """These write to the KG / symbol store, not the Document — rewriting
        every chapter and paragraph row would be cost without effect."""
        doc_svc, _ = self._run(step)
        doc_svc.save_document.assert_not_awaited()

    def test_persist_failure_does_not_fail_the_task(self):
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=TestRunRerunStep()._make_doc())
        doc_svc.update_pipeline_status = AsyncMock()
        doc_svc.save_document = AsyncMock(side_effect=RuntimeError("disk full"))

        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow",
                  return_value=TestRunRerunStep()._make_workflow_mock(doc_service=doc_svc)),
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=AsyncMock()),
            patch("storysphere.config.settings.get_settings"),
        ):
            asyncio.run(_run_rerun_step(task_id, "book-x", "summarization", doc_svc, AsyncMock()))

        status = task_store.get(task_id)
        assert status is not None
        assert status.status == "done"


class TestRerunCacheInvalidation:
    """A successful rerun drops the analyses derived from that step."""

    def _make_doc(self):
        from storysphere.domain.documents import Document, FileType, PipelineStatus, StepStatus
        return Document(
            id="book-x", title="T", author="A", file_path="/tmp/x.pdf",
            file_type=FileType.PDF, chapters=[],
            pipeline_status=PipelineStatus(
                summarization=StepStatus.failed,
                feature_extraction=StepStatus.failed,
                knowledge_graph=StepStatus.failed,
                symbol_discovery=StepStatus.failed,
            ),
        )

    def _make_workflow_mock(self, failing: str | None = None, doc_service=None):
        """Real IngestionWorkflow, pipelines stubbed — see TestRunRerunStep."""
        from storysphere.workflows.ingestion import IngestionWorkflow

        def _pipeline(attr: str):
            run = (
                AsyncMock(side_effect=RuntimeError("boom"))
                if attr == failing
                else AsyncMock()
            )
            return MagicMock(run=run)

        return IngestionWorkflow(
            summarization_pipeline=_pipeline("_summarization_pipeline"),
            feature_pipeline=_pipeline("_feature_pipeline"),
            kg_pipeline=_pipeline("_kg_pipeline"),
            symbol_pipeline=_pipeline("_symbol_pipeline"),
            document_service=doc_service or AsyncMock(),
            kg_service=MagicMock(save=AsyncMock()),
        )

    def _run(self, step, kg=None, failing=None):
        """Run the step with a mocked cache; return the cache mock."""
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=self._make_doc())
        doc_svc.update_pipeline_status = AsyncMock()

        cache = AsyncMock()
        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow",
                  return_value=self._make_workflow_mock(failing, doc_service=doc_svc)),
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=cache),
            patch("storysphere.config.settings.get_settings"),
        ):
            asyncio.run(_run_rerun_step(task_id, "book-x", step, doc_svc, kg or AsyncMock()))
        return cache

    def _patterns(self, cache):
        return {c.args[0] for c in cache.invalidate.call_args_list}

    def test_summarization_deletes_nothing(self):
        """hero_journey is book-keyed, so it survives and is reported stale."""
        cache = self._run("summarization")
        assert self._patterns(cache) == set()

    def test_symbol_discovery_drops_symbol_caches_only(self):
        cache = self._run("symbol-discovery")
        assert self._patterns(cache) == {
            "sep:book-x:%",
            "symbol_analysis:book-x:%",
            # Keyed by the imagery ids re-discovery replaces, same as the
            # interpretations — a refusal recorded against a stale id would
            # otherwise outlive the symbol it refers to.
            "symbol_analysis_block:book-x:%",
            # Book-keyed, but a pure projection of the symbol set being replaced.
            "symbol_overview:book-x",
        }

    def test_feature_extraction_drops_id_keyed_caches_only(self):
        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[])
        patterns = self._patterns(self._run("feature-extraction", kg=kg))

        assert "event:book-x:%" in patterns
        assert "narrative_structure:book-x" not in patterns
        assert "tension_lines:book-x" not in patterns

    def test_teu_keys_collected_before_events_are_regenerated(self):
        from types import SimpleNamespace

        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[SimpleNamespace(id="ev-1")])
        patterns = self._patterns(self._run("feature-extraction", kg=kg))

        assert "teu:ev-1" in patterns

    def test_failed_step_leaves_caches_alone(self):
        """The old data is still in place, so its analyses still describe the book."""
        cache = self._run("summarization", failing="_summarization_pipeline")
        cache.invalidate.assert_not_called()


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

    def test_rerun_stamps_the_step_it_ran(self):
        cache_run = TestRerunCacheInvalidation()
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = cache_run._make_doc()
        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()

        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow",
                  return_value=cache_run._make_workflow_mock(doc_service=doc_svc)),
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=AsyncMock()),
            patch("storysphere.config.settings.get_settings"),
        ):
            asyncio.run(_run_rerun_step(task_id, "book-x", "symbol-discovery",
                                        doc_svc, AsyncMock()))

        assert doc.pipeline_status.symbol_discovery_at is not None
        assert doc.pipeline_status.summarization_at is None


class TestRerunStepRegistry:
    """The endpoint's step vocabulary must stay in step with the workflow's."""

    def test_rerun_steps_match_the_workflow_registry(self):
        from storysphere.api.routers.books import _RERUN_STEPS
        from storysphere.workflows.ingestion import INGESTION_STEPS

        assert _RERUN_STEPS == set(INGESTION_STEPS)

    def test_valid_steps_constant_matches_too(self):
        from storysphere.workflows.ingestion import INGESTION_STEPS

        assert set(VALID_STEPS) == set(INGESTION_STEPS)


class TestRerunKgSavePolicy:
    """A rerun is stricter than ingestion about persisting the KG.

    ``run_phase2`` treats a failed ``KGService.save()`` as non-fatal — the
    extraction succeeded and the rest of the run should continue. A rerun of
    the knowledge-graph step exists precisely to get that output on disk, so
    reporting success with nothing written would defeat the point.
    """

    def _run(self, *, save_error: Exception | None = None):
        from storysphere.api.routers.books import _run_rerun_step
        from storysphere.api.store import task_store

        task_id = f"rerun-{uuid4()}"
        task_store.create(task_id)
        doc = TestRunRerunStep()._make_doc()

        doc_svc = AsyncMock()
        doc_svc.get_document = AsyncMock(return_value=doc)
        doc_svc.update_pipeline_status = AsyncMock()

        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[])
        if save_error is not None:
            kg.save = AsyncMock(side_effect=save_error)

        wf = TestRunRerunStep()._make_workflow_mock(doc_service=doc_svc)
        with (
            patch("storysphere.workflows.ingestion.IngestionWorkflow", return_value=wf),
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=AsyncMock()),
            patch("storysphere.config.settings.get_settings"),
        ):
            asyncio.run(_run_rerun_step(task_id, "book-x", "knowledge-graph", doc_svc, kg))
        return task_store.get(task_id), doc, kg

    def test_kg_is_saved_on_success(self):
        status, doc, kg = self._run()
        from storysphere.domain.documents import StepStatus

        assert kg.save.await_count == 1
        assert doc.pipeline_status.knowledge_graph == StepStatus.done
        assert status.status == "done"

    def test_failed_kg_save_fails_the_step_and_the_task(self):
        from storysphere.domain.documents import StepStatus

        status, doc, _ = self._run(save_error=RuntimeError("disk full"))

        assert doc.pipeline_status.knowledge_graph == StepStatus.failed
        assert status.status == "error"
        assert "disk full" in (status.error or "")
