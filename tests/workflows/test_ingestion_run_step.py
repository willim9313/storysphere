"""Tests for ``IngestionWorkflow.run_step``.

``run_step`` is the single implementation of the per-step contract that
``run_phase2`` and the rerun endpoint both drive:

    pipeline.run() → mark_done | failed → update_pipeline_status
                   → save_document (doc-mutating steps only)

The two callers differ only in what they do with the outcome — continue or
abort — so everything below is about the shared mechanism.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.documents import (
    Chapter,
    Document,
    FileType,
    Paragraph,
    StepStatus,
)
from storysphere.workflows.ingestion import INGESTION_STEPS, IngestionWorkflow

# (step name, PipelineStatus field, writes output onto the Document)
ALL_STEPS = [
    ("summarization", "summarization", True),
    ("feature-extraction", "feature_extraction", True),
    ("knowledge-graph", "knowledge_graph", False),
    ("symbol-discovery", "symbol_discovery", False),
]


def _make_doc() -> Document:
    return Document(
        id="doc-step",
        title="Step Test",
        file_path="/tmp/step.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                paragraphs=[Paragraph(text="Text.", chapter_number=1, position=0)],
            )
        ],
    )


def _make_workflow() -> IngestionWorkflow:
    doc_svc = AsyncMock()
    return IngestionWorkflow(
        summarization_pipeline=AsyncMock(),
        feature_pipeline=AsyncMock(),
        kg_pipeline=AsyncMock(),
        symbol_pipeline=AsyncMock(),
        document_service=doc_svc,
        kg_service=AsyncMock(),
    )


class TestStepRegistry:
    def test_registry_covers_every_pipeline_status_field(self):
        """Every step maps to a real PipelineStatus field and a real attribute."""
        doc = _make_doc()
        wf = _make_workflow()
        for name, spec in INGESTION_STEPS.items():
            assert hasattr(doc.pipeline_status, spec.status_field), name
            assert hasattr(wf, spec.pipeline_attr), name

    def test_registry_matches_the_expected_four_steps(self):
        assert set(INGESTION_STEPS) == {s for s, _, _ in ALL_STEPS}

    @pytest.mark.asyncio
    async def test_unknown_step_raises_key_error(self):
        wf = _make_workflow()
        with pytest.raises(KeyError):
            await wf.run_step("no-such-step", _make_doc())


class TestDispatch:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "status_field", "_mutates"), ALL_STEPS)
    async def test_runs_only_its_own_pipeline(self, step, status_field, _mutates):
        doc = _make_doc()
        wf = _make_workflow()

        await wf.run_step(step, doc)

        target = getattr(wf, INGESTION_STEPS[step].pipeline_attr)
        assert target.run.await_count == 1
        others = [
            getattr(wf, s.pipeline_attr)
            for name, s in INGESTION_STEPS.items()
            if name != step
        ]
        assert all(o.run.await_count == 0 for o in others)

    @pytest.mark.asyncio
    async def test_callbacks_are_forwarded_to_the_pipeline(self):
        doc = _make_doc()
        wf = _make_workflow()

        def _sub(cur, tot, label=""):
            return None

        async def _murmur(*a, **kw):
            return None

        await wf.run_step("summarization", doc, sub_cb=_sub, murmur_cb=_murmur)

        call = wf._summarization_pipeline.run.await_args
        assert call.args[0] is doc
        assert call.kwargs["sub_cb"] is _sub
        assert call.kwargs["murmur_cb"] is _murmur


class TestStatusTransitions:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "status_field", "_mutates"), ALL_STEPS)
    async def test_success_marks_done_and_stamps_time(self, step, status_field, _mutates):
        doc = _make_doc()
        wf = _make_workflow()

        outcome = await wf.run_step(step, doc)

        assert outcome.ok
        assert outcome.error is None
        assert getattr(doc.pipeline_status, status_field) == StepStatus.done
        assert getattr(doc.pipeline_status, f"{status_field}_at") is not None

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "status_field", "_mutates"), ALL_STEPS)
    async def test_failure_marks_failed_and_captures_message(
        self, step, status_field, _mutates
    ):
        doc = _make_doc()
        wf = _make_workflow()
        getattr(wf, INGESTION_STEPS[step].pipeline_attr).run.side_effect = RuntimeError(
            "boom"
        )

        outcome = await wf.run_step(step, doc)

        assert not outcome.ok
        assert outcome.error == "boom"
        assert outcome.result is None
        assert getattr(doc.pipeline_status, status_field) == StepStatus.failed

    @pytest.mark.asyncio
    async def test_pipeline_failure_is_not_raised(self):
        """Callers decide whether to continue; run_step never raises for them."""
        doc = _make_doc()
        wf = _make_workflow()
        wf._kg_pipeline.run.side_effect = RuntimeError("kg down")

        outcome = await wf.run_step("knowledge-graph", doc)  # must not raise

        assert outcome.error == "kg down"

    @pytest.mark.asyncio
    async def test_result_is_whatever_the_pipeline_returned(self):
        doc = _make_doc()
        wf = _make_workflow()
        sentinel = object()
        wf._kg_pipeline.run.return_value = sentinel

        outcome = await wf.run_step("knowledge-graph", doc)

        assert outcome.result is sentinel
        assert outcome.step == "knowledge-graph"


class TestPersistence:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "_field", "_mutates"), ALL_STEPS)
    async def test_status_is_persisted_on_success(self, step, _field, _mutates):
        doc = _make_doc()
        wf = _make_workflow()

        await wf.run_step(step, doc)

        wf._document_service.update_pipeline_status.assert_awaited_once_with(
            doc.id, doc.pipeline_status
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "_field", "_mutates"), ALL_STEPS)
    async def test_status_is_persisted_on_failure_too(self, step, _field, _mutates):
        doc = _make_doc()
        wf = _make_workflow()
        getattr(wf, INGESTION_STEPS[step].pipeline_attr).run.side_effect = RuntimeError("x")

        await wf.run_step(step, doc)

        wf._document_service.update_pipeline_status.assert_awaited_once()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("step", "_field", "mutates"), ALL_STEPS)
    async def test_document_saved_only_for_doc_mutating_steps(self, step, _field, mutates):
        doc = _make_doc()
        wf = _make_workflow()

        await wf.run_step(step, doc)

        if mutates:
            wf._document_service.save_document.assert_awaited_once_with(doc)
        else:
            wf._document_service.save_document.assert_not_awaited()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("step", ["summarization", "feature-extraction"])
    async def test_partial_output_saved_when_the_step_fails(self, step):
        """A rate-limited run still produced summaries/keywords — keep them,
        or the next attempt pays for them again."""
        doc = _make_doc()
        wf = _make_workflow()
        getattr(wf, INGESTION_STEPS[step].pipeline_attr).run.side_effect = RuntimeError("429")

        await wf.run_step(step, doc)

        wf._document_service.save_document.assert_awaited_once_with(doc)

    @pytest.mark.asyncio
    async def test_persist_failure_does_not_fail_the_step(self):
        doc = _make_doc()
        wf = _make_workflow()
        wf._document_service.save_document.side_effect = RuntimeError("disk full")

        outcome = await wf.run_step("summarization", doc)

        assert outcome.ok
        assert doc.pipeline_status.summarization == StepStatus.done


class TestKgSavePolicy:
    @pytest.mark.asyncio
    async def test_run_step_never_saves_the_kg(self):
        """KGService.save() is the caller's call — run_phase2 treats a failed
        save as non-fatal, the rerun endpoint does not. Keeping it out of
        run_step is what lets the two disagree."""
        doc = _make_doc()
        wf = _make_workflow()

        await wf.run_step("knowledge-graph", doc)

        assert wf._kg_service.save.await_count == 0
