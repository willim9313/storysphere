"""Tests for ``IngestionWorkflow.rerun_step``.

These moved here from ``tests/api/test_books_rerun.py`` when the rerun policy
was lifted out of the router: what a failed KG save means, and which analyses a
successful step invalidates, are the workflow's decisions now. The router keeps
only the task-store mirroring, which is what remains tested over there.

Nothing patches ``IngestionWorkflow`` any more — the workflow under test is
constructed directly, with only the pipelines (the slow, LLM-backed parts)
stubbed, so the per-step contract in ``run_step`` still runs for real.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from storysphere.domain.documents import Document, FileType, PipelineStatus, StepStatus
from storysphere.workflows.ingestion import IngestionWorkflow

DOC_ID = "book-x"


def _make_doc() -> Document:
    return Document(
        id=DOC_ID,
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


def _workflow(doc: Document | None, *, failing: str | None = None, kg=None):
    """Real workflow, pipelines stubbed, services mocked.

    ``failing`` is a step name whose pipeline raises.
    """
    doc_svc = AsyncMock()
    doc_svc.get_document = AsyncMock(return_value=doc)
    doc_svc.update_pipeline_status = AsyncMock()
    doc_svc.save_document = AsyncMock()

    if kg is None:
        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[])

    def _pipeline(step: str):
        run = (
            AsyncMock(side_effect=RuntimeError("boom"))
            if step == failing
            else AsyncMock()
        )
        return MagicMock(run=run)

    wf = IngestionWorkflow(
        summarization_pipeline=_pipeline("summarization"),
        feature_pipeline=_pipeline("feature-extraction"),
        kg_pipeline=_pipeline("knowledge-graph"),
        symbol_pipeline=_pipeline("symbol-discovery"),
        document_service=doc_svc,
        kg_service=kg,
    )
    return wf, doc_svc, kg


async def _rerun(wf, step: str, *, cache=None):
    """Run a rerun with the analysis cache stubbed; return the cache mock."""
    cache = cache if cache is not None else AsyncMock()
    with (
        patch("storysphere.services.analysis_cache.AnalysisCache", return_value=cache),
        patch("storysphere.config.settings.get_settings"),
    ):
        outcome = await wf.rerun_step(step, DOC_ID)
    return outcome, cache


class TestStepOutcome:
    @pytest.mark.parametrize(
        "step,status_attr",
        [
            ("summarization", "summarization"),
            ("feature-extraction", "feature_extraction"),
            ("knowledge-graph", "knowledge_graph"),
            ("symbol-discovery", "symbol_discovery"),
        ],
    )
    @pytest.mark.asyncio
    async def test_happy_path_marks_step_done(self, step, status_attr):
        doc = _make_doc()
        wf, doc_svc, _ = _workflow(doc)

        outcome, _ = await _rerun(wf, step)

        assert outcome.ok
        assert getattr(doc.pipeline_status, status_attr) == StepStatus.done
        doc_svc.update_pipeline_status.assert_awaited()

    @pytest.mark.asyncio
    async def test_failure_path_marks_step_failed(self):
        doc = _make_doc()
        wf, _, _ = _workflow(doc, failing="feature-extraction")

        outcome, _ = await _rerun(wf, "feature-extraction")

        assert not outcome.ok
        assert "boom" in (outcome.error or "")
        assert doc.pipeline_status.feature_extraction == StepStatus.failed

    @pytest.mark.asyncio
    async def test_missing_book_is_a_failed_outcome_not_an_exception(self):
        wf, _, _ = _workflow(None)

        outcome, _ = await _rerun(wf, "summarization")

        assert not outcome.ok
        assert DOC_ID in (outcome.error or "")

    @pytest.mark.asyncio
    async def test_stamps_only_the_step_it_ran(self):
        doc = _make_doc()
        wf, _, _ = _workflow(doc)

        await _rerun(wf, "symbol-discovery")

        assert doc.pipeline_status.symbol_discovery_at is not None
        assert doc.pipeline_status.summarization_at is None


class TestPersistsDocumentOutput:
    """Chapter summaries and keywords live on the Document, so a rerun must save it.

    The pipelines mutate the Document in place and never write to SQLite —
    without an explicit save the LLM output is generated, charged for, and
    then dropped.
    """

    @pytest.mark.parametrize("step", ["summarization", "feature-extraction"])
    @pytest.mark.asyncio
    async def test_saves_document_after_doc_mutating_step(self, step):
        doc = _make_doc()
        wf, doc_svc, _ = _workflow(doc)

        await _rerun(wf, step)

        doc_svc.save_document.assert_awaited_once_with(doc)

    @pytest.mark.parametrize("step", ["summarization", "feature-extraction"])
    @pytest.mark.asyncio
    async def test_saves_partial_output_when_step_fails(self, step):
        """A rate-limited run leaves summaries on the chapters it got through;
        saving them is what lets the next rerun skip and resume."""
        doc = _make_doc()
        wf, doc_svc, _ = _workflow(doc, failing=step)

        await _rerun(wf, step)

        doc_svc.save_document.assert_awaited_once_with(doc)

    @pytest.mark.parametrize("step", ["knowledge-graph", "symbol-discovery"])
    @pytest.mark.asyncio
    async def test_does_not_rewrite_document_for_non_doc_steps(self, step):
        """These write to the KG / symbol store, not the Document — rewriting
        every chapter and paragraph row would be cost without effect."""
        doc = _make_doc()
        wf, doc_svc, _ = _workflow(doc)

        await _rerun(wf, step)

        doc_svc.save_document.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_persist_failure_does_not_fail_the_step(self):
        doc = _make_doc()
        wf, doc_svc, _ = _workflow(doc)
        doc_svc.save_document = AsyncMock(side_effect=RuntimeError("disk full"))

        outcome, _ = await _rerun(wf, "summarization")

        assert outcome.ok


class TestCacheInvalidation:
    """A successful rerun drops the analyses derived from that step."""

    @staticmethod
    def _patterns(cache):
        return {c.args[0] for c in cache.invalidate.call_args_list}

    @pytest.mark.asyncio
    async def test_summarization_deletes_nothing(self):
        """hero_journey is book-keyed, so it survives and is reported stale."""
        wf, _, _ = _workflow(_make_doc())
        _, cache = await _rerun(wf, "summarization")

        assert self._patterns(cache) == set()

    @pytest.mark.asyncio
    async def test_symbol_discovery_drops_symbol_caches_only(self):
        wf, _, _ = _workflow(_make_doc())
        _, cache = await _rerun(wf, "symbol-discovery")

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

    @pytest.mark.asyncio
    async def test_feature_extraction_drops_id_keyed_caches_only(self):
        wf, _, _ = _workflow(_make_doc())
        _, cache = await _rerun(wf, "feature-extraction")
        patterns = self._patterns(cache)

        assert "event:book-x:%" in patterns
        assert "narrative_structure:book-x" not in patterns
        assert "tension_lines:book-x" not in patterns

    @pytest.mark.asyncio
    async def test_teu_keys_collected_before_events_are_regenerated(self):
        """TEUs are keyed by event id alone, so they cannot be matched by
        pattern — the ids have to be read while the *old* events still exist.

        The KG returns different events before and after the step runs, so a
        collection that happened afterwards would invalidate the new ids and
        silently orphan the TEUs belonging to the replaced ones.
        """
        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[SimpleNamespace(id="ev-old")])
        wf, _, _ = _workflow(_make_doc(), kg=kg)

        async def _regenerate(*_a, **_kw):
            kg.get_events = AsyncMock(return_value=[SimpleNamespace(id="ev-new")])

        wf._feature_pipeline.run = AsyncMock(side_effect=_regenerate)

        _, cache = await _rerun(wf, "feature-extraction")
        patterns = self._patterns(cache)

        assert "teu:ev-old" in patterns
        assert "teu:ev-new" not in patterns

    @pytest.mark.asyncio
    async def test_failed_step_leaves_caches_alone(self):
        """The old data is still in place, so its analyses still describe the book."""
        wf, _, _ = _workflow(_make_doc(), failing="summarization")

        _, cache = await _rerun(wf, "summarization")

        cache.invalidate.assert_not_called()


class TestKgSavePolicy:
    """A rerun is stricter than ingestion about persisting the KG.

    ``run_phase2`` treats a failed ``KGService.save()`` as non-fatal — the
    extraction succeeded and the rest of the run should continue. A rerun of
    the knowledge-graph step exists precisely to get that output on disk, so
    reporting success with nothing written would defeat the point.
    """

    @pytest.mark.asyncio
    async def test_kg_is_saved_on_success(self):
        doc = _make_doc()
        wf, _, kg = _workflow(doc)

        outcome, _ = await _rerun(wf, "knowledge-graph")

        assert kg.save.await_count == 1
        assert doc.pipeline_status.knowledge_graph == StepStatus.done
        assert outcome.ok

    @pytest.mark.asyncio
    async def test_failed_kg_save_fails_the_step(self):
        doc = _make_doc()
        kg = AsyncMock()
        kg.get_events = AsyncMock(return_value=[])
        kg.save = AsyncMock(side_effect=RuntimeError("disk full"))
        wf, _, _ = _workflow(doc, kg=kg)

        outcome, cache = await _rerun(wf, "knowledge-graph")

        assert not outcome.ok
        assert "disk full" in (outcome.error or "")
        assert doc.pipeline_status.knowledge_graph == StepStatus.failed
        # A failed save must not drop the analyses either.
        cache.invalidate.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_step_raises(self):
        wf, _, _ = _workflow(_make_doc())

        with pytest.raises(KeyError):
            await wf.rerun_step("no-such-step", DOC_ID)
