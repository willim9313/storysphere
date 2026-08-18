"""Characterization tests for the uncovered steps of ``run_phase2``.

``test_ingestion_summarization_partial.py`` covers the summarization step and
``test_ingestion_cache_invalidation.py`` covers the finalisation step, but the
knowledge-graph, symbol-discovery and timeline-detection steps (ingestion.py
507-580) had no coverage at all — including every failure branch.

These tests pin the current step contract so a later refactor that unifies the
five near-identical step blocks is provably behaviour-preserving:

    progress → try/except → mark_done | StepStatus.failed
             → update_pipeline_status → (optionally) save_document
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from storysphere.domain.documents import (
    Chapter,
    Document,
    FileType,
    Paragraph,
    StepStatus,
)
from storysphere.domain.events import Event, EventType
from storysphere.pipelines.feature_extraction.pipeline import FeatureExtractionResult
from storysphere.pipelines.knowledge_graph.pipeline import KGExtractionResult
from storysphere.pipelines.summarization.pipeline import SummarizationResult
from storysphere.pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
from storysphere.workflows.ingestion import IngestionWorkflow


def _make_doc(n_chapters: int = 2) -> Document:
    chapters = [
        Chapter(
            number=i,
            title=f"Chapter {i}",
            paragraphs=[Paragraph(text=f"Text {i}.", chapter_number=i, position=0)],
        )
        for i in range(1, n_chapters + 1)
    ]
    return Document(
        id="doc-phase2",
        title="Phase 2 Book",
        file_path="/tmp/p2.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


def _event(chapter: int, rank: float | None = None) -> Event:
    return Event(
        title=f"event-{chapter}",
        event_type=EventType.PLOT,
        description="",
        chapter=chapter,
        chronological_rank=rank,
    )


def _make_workflow(
    doc: Document,
    *,
    kg_result: KGExtractionResult | None = None,
    kg_error: Exception | None = None,
    symbol_result: SymbolDiscoveryResult | None = None,
    symbol_error: Exception | None = None,
    kg_service=None,
) -> IngestionWorkflow:
    """Workflow with summarization/feature stubbed out and KG/symbols live."""
    mock_doc_svc = AsyncMock()
    mock_doc_svc.get_document.return_value = doc

    mock_summ = AsyncMock()
    mock_summ.run.return_value = SummarizationResult(
        document_id=doc.id, chapters_summarized=0, chapters_total=0
    )

    mock_feat = AsyncMock()
    mock_feat.run.return_value = FeatureExtractionResult(document_id=doc.id)

    mock_kg = AsyncMock()
    if kg_error is not None:
        mock_kg.run.side_effect = kg_error
    else:
        mock_kg.run.return_value = kg_result or KGExtractionResult()

    mock_symbol = AsyncMock()
    if symbol_error is not None:
        mock_symbol.run.side_effect = symbol_error
    else:
        mock_symbol.run.return_value = symbol_result or SymbolDiscoveryResult(
            book_id=doc.id
        )

    return IngestionWorkflow(
        summarization_pipeline=mock_summ,
        feature_pipeline=mock_feat,
        kg_pipeline=mock_kg,
        symbol_pipeline=mock_symbol,
        document_service=mock_doc_svc,
        kg_service=kg_service or AsyncMock(),
    )


async def _run(wf: IngestionWorkflow, doc_id: str):
    with patch("storysphere.services.analysis_cache.AnalysisCache"), patch(
        "storysphere.config.settings.get_settings"
    ):
        return await wf.run_phase2(doc_id)


class TestDocumentLookup:
    @pytest.mark.asyncio
    async def test_missing_document_raises(self):
        wf = _make_workflow(_make_doc())
        wf._document_service.get_document.return_value = None

        with pytest.raises(ValueError, match="not found"):
            await _run(wf, "nope")


class TestKnowledgeGraphStep:
    @pytest.mark.asyncio
    async def test_success_marks_done_and_saves_kg(self):
        doc = _make_doc()
        kg_service = AsyncMock()
        wf = _make_workflow(
            doc,
            kg_result=KGExtractionResult(entities=[], relations=[], events=[]),
            kg_service=kg_service,
        )

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.knowledge_graph == StepStatus.done
        assert kg_service.save.await_count == 1
        assert not any("kg_extraction" in e for e in result.errors)

    @pytest.mark.asyncio
    async def test_failure_records_error_and_skips_kg_save(self):
        doc = _make_doc()
        kg_service = AsyncMock()
        wf = _make_workflow(doc, kg_error=RuntimeError("boom"), kg_service=kg_service)

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.knowledge_graph == StepStatus.failed
        assert any("kg_extraction: boom" in e for e in result.errors)
        # save() is only reached when the step succeeded
        assert kg_service.save.await_count == 0

    @pytest.mark.asyncio
    async def test_kg_save_failure_is_non_fatal(self):
        """A KG persist error must not turn a successful step into a failure."""
        doc = _make_doc()
        kg_service = AsyncMock()
        kg_service.save.side_effect = RuntimeError("disk full")
        wf = _make_workflow(doc, kg_service=kg_service)

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.knowledge_graph == StepStatus.done
        assert result.errors == []

    @pytest.mark.asyncio
    async def test_skip_kg_leaves_status_pending(self):
        doc = _make_doc()
        wf = _make_workflow(doc)
        wf._skip_kg = True

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.knowledge_graph == StepStatus.pending
        assert wf._kg_pipeline.run.await_count == 0
        assert result.entities == 0

    @pytest.mark.asyncio
    async def test_counts_are_reported_from_kg_result(self):
        doc = _make_doc()
        kg_result = KGExtractionResult(
            entities=[object(), object()],  # only len() is used
            relations=[object()],
            events=[_event(1)],
        )
        wf = _make_workflow(doc, kg_result=kg_result)

        result = await _run(wf, doc.id)

        assert result.entities == 2
        assert result.relations == 1
        assert result.events == 1


class TestSymbolDiscoveryStep:
    @pytest.mark.asyncio
    async def test_success_marks_done_and_reports_imagery(self):
        doc = _make_doc()
        wf = _make_workflow(
            doc,
            symbol_result=SymbolDiscoveryResult(book_id=doc.id, imagery_count=7),
        )

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.symbol_discovery == StepStatus.done
        assert result.imagery_extracted == 7

    @pytest.mark.asyncio
    async def test_failure_is_recorded_but_does_not_abort_phase2(self):
        doc = _make_doc()
        wf = _make_workflow(doc, symbol_error=RuntimeError("no symbols"))

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.symbol_discovery == StepStatus.failed
        assert any("symbol_discovery: no symbols" in e for e in result.errors)
        # phase 2 still completes and returns a result
        assert result.document_id == doc.id

    @pytest.mark.asyncio
    async def test_skip_symbols_leaves_status_pending(self):
        doc = _make_doc()
        wf = _make_workflow(doc)
        wf._skip_symbols = True

        await _run(wf, doc.id)

        assert doc.pipeline_status.symbol_discovery == StepStatus.pending
        assert wf._symbol_pipeline.run.await_count == 0


class TestTimelineDetection:
    @pytest.mark.asyncio
    async def test_no_events_means_no_timeline_detection(self):
        doc = _make_doc()
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=[]))

        result = await _run(wf, doc.id)

        assert result.timeline_detection is None
        assert doc.timeline_config is None

    @pytest.mark.asyncio
    async def test_counts_distinct_chapters_and_ranked_events(self):
        doc = _make_doc()
        events = [_event(1), _event(1), _event(2, rank=1.0), _event(3, rank=2.0)]
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=events))

        result = await _run(wf, doc.id)

        detection = result.timeline_detection
        assert detection is not None
        assert detection.chapter_count == 3
        assert detection.event_count == 4
        assert detection.ranked_event_count == 2
        assert detection.chapter_mode_viable is True
        assert detection.story_mode_viable is True

    @pytest.mark.asyncio
    async def test_single_chapter_makes_chapter_mode_unviable(self):
        doc = _make_doc()
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=[_event(1)]))

        result = await _run(wf, doc.id)

        assert result.timeline_detection.chapter_mode_viable is False
        assert result.timeline_detection.story_mode_viable is False

    @pytest.mark.asyncio
    async def test_non_positive_chapters_excluded_from_count(self):
        """chapter=0 and chapter=None do not count as distinct chapters."""
        doc = _make_doc()
        events = [_event(0), _event(5)]
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=events))

        result = await _run(wf, doc.id)

        assert result.timeline_detection.chapter_count == 1

    @pytest.mark.asyncio
    async def test_timeline_config_written_onto_document(self):
        doc = _make_doc()
        events = [_event(1), _event(2, rank=1.0)]
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=events))

        await _run(wf, doc.id)

        assert doc.timeline_config is not None
        assert doc.timeline_config.total_chapters == 2
        assert doc.timeline_config.total_events == 2
        assert doc.timeline_config.total_ranked_events == 1
        assert doc.timeline_config.chapter_mode_configured is False
        assert doc.timeline_config.story_mode_configured is False

    @pytest.mark.asyncio
    async def test_skip_kg_suppresses_timeline_detection(self):
        doc = _make_doc()
        wf = _make_workflow(doc, kg_result=KGExtractionResult(events=[_event(1)]))
        wf._skip_kg = True

        result = await _run(wf, doc.id)

        assert result.timeline_detection is None


class TestStepIsolation:
    @pytest.mark.asyncio
    async def test_kg_failure_does_not_prevent_symbol_discovery(self):
        """Each step is independent — an earlier failure must not short-circuit."""
        doc = _make_doc()
        wf = _make_workflow(
            doc,
            kg_error=RuntimeError("kg down"),
            symbol_result=SymbolDiscoveryResult(book_id=doc.id, imagery_count=3),
        )

        result = await _run(wf, doc.id)

        assert doc.pipeline_status.knowledge_graph == StepStatus.failed
        assert doc.pipeline_status.symbol_discovery == StepStatus.done
        assert result.imagery_extracted == 3

    @pytest.mark.asyncio
    async def test_every_step_updates_pipeline_status(self):
        """update_pipeline_status is called once per executed step."""
        doc = _make_doc()
        wf = _make_workflow(doc)

        await _run(wf, doc.id)

        # summarization, feature_extraction, knowledge_graph, symbol_discovery
        assert wf._document_service.update_pipeline_status.await_count == 4
