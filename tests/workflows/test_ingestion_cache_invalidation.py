"""A full ingestion run drops every analysis cache derived from the book.

Re-ingesting regenerates the entity and event ids the analyses were keyed by,
and nothing else clears them — entries no longer expire on their own.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.pipelines.feature_extraction.pipeline import FeatureExtractionResult
from storysphere.pipelines.summarization.pipeline import SummarizationResult
from storysphere.workflows.ingestion import IngestionWorkflow


def _make_doc() -> Document:
    return Document(
        id="doc-test",
        title="Test Book",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                title="Chapter 1",
                paragraphs=[Paragraph(text="Text.", chapter_number=1, position=0)],
            )
        ],
    )


def _make_workflow(doc: Document) -> IngestionWorkflow:
    doc_svc = AsyncMock()
    doc_svc.get_document.return_value = doc
    doc_svc.update_pipeline_status = AsyncMock()
    doc_svc.save_document = AsyncMock()

    summ = AsyncMock()
    summ.run.return_value = SummarizationResult(
        document_id=doc.id, chapters_summarized=1, chapters_total=1
    )
    feat = AsyncMock()
    feat.run.return_value = FeatureExtractionResult(document_id=doc.id)

    return IngestionWorkflow(
        summarization_pipeline=summ,
        feature_pipeline=feat,
        kg_pipeline=AsyncMock(),
        symbol_pipeline=AsyncMock(),
        document_service=doc_svc,
        kg_service=AsyncMock(),
        skip_kg=True,
        skip_symbols=True,
    )


async def _run_and_capture() -> set[str]:
    doc = _make_doc()
    wf = _make_workflow(doc)
    cache = AsyncMock()

    with (
        patch("storysphere.services.analysis_cache.AnalysisCache", return_value=cache),
        patch("storysphere.config.settings.get_settings"),
    ):
        await wf.run_phase2(doc.id)

    return {c.args[0] for c in cache.invalidate.call_args_list}


class TestIngestionCacheInvalidation:
    @pytest.mark.asyncio
    async def test_covers_every_derived_family(self):
        families = {p.split(":")[0] for p in await _run_and_capture()}

        assert families == {
            "hero_journey",
            "event",
            "character",
            "epistemic",
            "narrative_structure",
            "temporal_analysis",
            "tension_lines",
            "tension_theme",
            "voice_profile",
            "sep",
            "symbol_analysis",
        }

    @pytest.mark.asyncio
    async def test_scopes_every_pattern_to_the_document(self):
        assert all("doc-test" in p for p in await _run_and_capture())

    @pytest.mark.asyncio
    async def test_no_pattern_is_issued_twice(self):
        doc = _make_doc()
        wf = _make_workflow(doc)
        cache = AsyncMock()

        with (
            patch("storysphere.services.analysis_cache.AnalysisCache", return_value=cache),
            patch("storysphere.config.settings.get_settings"),
        ):
            await wf.run_phase2(doc.id)

        issued = [c.args[0] for c in cache.invalidate.call_args_list]
        assert len(issued) == len(set(issued))
