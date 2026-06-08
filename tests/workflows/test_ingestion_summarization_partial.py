"""Tests for partial summarization detection in IngestionWorkflow.run_phase2.

Covers the case where SummarizationPipeline succeeds (no exception) but some
chapters were skipped — run_phase2 should append a warning to errors while
keeping pipeline_status.summarization = done.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph, StepStatus
from pipelines.feature_extraction.pipeline import FeatureExtractionResult
from pipelines.knowledge_graph.pipeline import KGExtractionResult
from pipelines.summarization.pipeline import SummarizationResult
from pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
from workflows.ingestion import IngestionWorkflow


def _make_doc(n_chapters: int = 5) -> Document:
    chapters = [
        Chapter(
            number=i,
            title=f"Chapter {i}",
            paragraphs=[Paragraph(text=f"Text {i}.", chapter_number=i, position=0)],
        )
        for i in range(1, n_chapters + 1)
    ]
    return Document(
        id="doc-test",
        title="Test Book",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


def _make_workflow(doc: Document, summ_result: SummarizationResult) -> IngestionWorkflow:
    mock_doc_svc = AsyncMock()
    mock_doc_svc.get_document.return_value = doc
    mock_doc_svc.update_pipeline_status = AsyncMock()
    mock_doc_svc.save_document = AsyncMock()

    mock_summ = AsyncMock()
    mock_summ.run.return_value = summ_result

    mock_feat = AsyncMock()
    mock_feat.run.return_value = FeatureExtractionResult(document_id=doc.id)

    return IngestionWorkflow(
        summarization_pipeline=mock_summ,
        feature_pipeline=mock_feat,
        kg_pipeline=AsyncMock(),
        symbol_pipeline=AsyncMock(),
        document_service=mock_doc_svc,
        kg_service=AsyncMock(),
        skip_kg=True,
        skip_symbols=True,
    )


class TestPartialSummarizationDetection:
    @pytest.mark.asyncio
    async def test_partial_chapters_appended_to_errors(self):
        """2 of 5 chapters skipped → error entry present, status still done."""
        doc = _make_doc(n_chapters=5)
        summ_result = SummarizationResult(
            document_id=doc.id, chapters_summarized=3, chapters_total=5
        )
        wf = _make_workflow(doc, summ_result)

        with patch("services.analysis_cache.AnalysisCache"):
            with patch("config.settings.get_settings"):
                result = await wf.run_phase2(doc.id)

        assert any("summarization" in e for e in result.errors)
        assert any("2/5" in e for e in result.errors)
        assert doc.pipeline_status.summarization == StepStatus.done

    @pytest.mark.asyncio
    async def test_full_success_no_error(self):
        """All 5 chapters summarized → no error entry."""
        doc = _make_doc(n_chapters=5)
        summ_result = SummarizationResult(
            document_id=doc.id, chapters_summarized=5, chapters_total=5
        )
        wf = _make_workflow(doc, summ_result)

        with patch("services.analysis_cache.AnalysisCache"):
            with patch("config.settings.get_settings"):
                result = await wf.run_phase2(doc.id)

        assert not any("summarization" in e for e in result.errors)
        assert doc.pipeline_status.summarization == StepStatus.done

    @pytest.mark.asyncio
    async def test_single_chapter_skipped(self):
        """1 of 5 chapters skipped → error says 1/5."""
        doc = _make_doc(n_chapters=5)
        summ_result = SummarizationResult(
            document_id=doc.id, chapters_summarized=4, chapters_total=5
        )
        wf = _make_workflow(doc, summ_result)

        with patch("services.analysis_cache.AnalysisCache"):
            with patch("config.settings.get_settings"):
                result = await wf.run_phase2(doc.id)

        assert any("1/5" in e for e in result.errors)
        assert doc.pipeline_status.summarization == StepStatus.done
