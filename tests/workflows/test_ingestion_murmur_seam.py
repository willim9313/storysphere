"""End-to-end check of the murmur seam between the workflow and the API layer.

``IngestionWorkflow`` used to build ``MurmurEvent`` itself, which is why
``workflows/`` imported ``storysphere.api``. It now hands the emitter plain
fields and the API-layer reporter builds the model.

This is worth a test of its own because ``_murmur`` swallows every exception:
a signature drift between the two sides would not raise — murmur events would
just silently stop reaching the UI. Only a run that asserts events actually
landed in the store can catch that.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from storysphere.api.ingestion_reporter import TaskStoreReporter
from storysphere.api.store import task_store
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.pipelines.feature_extraction.pipeline import FeatureExtractionResult
from storysphere.pipelines.knowledge_graph.pipeline import KGExtractionResult
from storysphere.pipelines.summarization.pipeline import SummarizationResult
from storysphere.pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
from storysphere.workflows.ingestion import IngestionWorkflow


def _doc() -> Document:
    return Document(
        id="doc-murmur",
        title="Murmur Book",
        file_path="/tmp/m.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                title="One",
                paragraphs=[Paragraph(text="Text.", chapter_number=1, position=0)],
            )
        ],
    )


def _workflow(doc: Document, kg_run) -> IngestionWorkflow:
    """Workflow whose KG pipeline is the one thing that emits murmurs."""
    mock_doc_svc = AsyncMock()
    mock_doc_svc.get_document.return_value = doc

    mock_summ = AsyncMock()
    mock_summ.run.return_value = SummarizationResult(
        document_id=doc.id, chapters_summarized=0, chapters_total=0
    )
    mock_feat = AsyncMock()
    mock_feat.run.return_value = FeatureExtractionResult(document_id=doc.id)
    mock_symbol = AsyncMock()
    mock_symbol.run.return_value = SymbolDiscoveryResult(book_id=doc.id)

    mock_kg = AsyncMock()
    mock_kg.run.side_effect = kg_run

    return IngestionWorkflow(
        summarization_pipeline=mock_summ,
        feature_pipeline=mock_feat,
        kg_pipeline=mock_kg,
        symbol_pipeline=mock_symbol,
        document_service=mock_doc_svc,
        kg_service=AsyncMock(),
    )


async def _run_phase2(wf: IngestionWorkflow, doc_id: str, task_id: str):
    reporter = TaskStoreReporter(task_id)
    with patch("storysphere.services.analysis_cache.AnalysisCache"), patch(
        "storysphere.config.settings.get_settings"
    ):
        return await wf.run_phase2(
            doc_id, progress_cb=reporter.progress, murmur_cb=reporter.murmur
        )


class TestMurmurReachesTheStore:
    @pytest.mark.asyncio
    async def test_pipeline_murmur_lands_in_the_task_store(self):
        doc = _doc()
        task_id = str(uuid4())
        task_store.create(task_id, kind="ingestion", title="t")

        async def _kg_run(document, sub_cb=None, murmur_cb=None):
            # Exactly how KnowledgeGraphPipeline calls it today.
            await murmur_cb("knowledgeGraph", "character", "Ahab", meta={"chapter": 1})
            return KGExtractionResult()

        await _run_phase2(_workflow(doc, _kg_run), doc.id, task_id)

        events = await task_store.get_murmur_events(task_id)
        assert [(e.step_key, e.type, e.content) for e in events] == [
            ("knowledgeGraph", "character", "Ahab")
        ]
        assert events[0].meta == {"chapter": 1}

    @pytest.mark.asyncio
    async def test_content_and_raw_content_are_truncated_by_the_workflow(self):
        doc = _doc()
        task_id = str(uuid4())
        task_store.create(task_id, kind="ingestion", title="t")

        async def _kg_run(document, sub_cb=None, murmur_cb=None):
            await murmur_cb(
                "knowledgeGraph", "raw", "x" * 2000, raw_content="y" * 9000
            )
            return KGExtractionResult()

        await _run_phase2(_workflow(doc, _kg_run), doc.id, task_id)

        events = await task_store.get_murmur_events(task_id)
        assert len(events[0].content) == 1024
        assert len(events[0].raw_content) == 4096

    @pytest.mark.asyncio
    async def test_progress_also_reaches_the_store(self):
        doc = _doc()
        task_id = str(uuid4())
        task_store.create(task_id, kind="ingestion", title="t")

        async def _kg_run(document, sub_cb=None, murmur_cb=None):
            return KGExtractionResult()

        await _run_phase2(_workflow(doc, _kg_run), doc.id, task_id)

        # run_phase2 walks progress forward as each step completes
        assert task_store.get(task_id).progress > 0
