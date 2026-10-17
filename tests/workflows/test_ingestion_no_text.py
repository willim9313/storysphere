"""Phase 1 抽不到任何文字（掃描檔）時直接失敗、不入庫（errorKind: no_text）。"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.core.error_handling import NoExtractableText, classify_task_failure
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.workflows.ingestion import IngestionWorkflow


def _doc(paragraphs: int) -> Document:
    return Document(
        id="doc-scan",
        title="Scan",
        file_path="/tmp/scan.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                title="Chapter 1",
                paragraphs=[Paragraph(text=f"p{i}", chapter_number=1, position=i) for i in range(paragraphs)],
            )
        ],
    )


def _workflow(doc: Document) -> tuple[IngestionWorkflow, AsyncMock]:
    doc_svc = AsyncMock()
    return (
        IngestionWorkflow(
            document_pipeline=AsyncMock(return_value=doc),
            summarization_pipeline=AsyncMock(),
            feature_pipeline=AsyncMock(),
            kg_pipeline=AsyncMock(),
            symbol_pipeline=AsyncMock(),
            document_service=doc_svc,
            kg_service=AsyncMock(),
        ),
        doc_svc,
    )


class TestNoExtractableText:
    @pytest.mark.asyncio
    async def test_zero_paragraphs_fails_before_the_book_is_saved(self, tmp_path):
        wf, doc_svc = _workflow(_doc(0))
        with pytest.raises(NoExtractableText) as info:
            await wf.run_phase1(tmp_path / "scan.pdf", title="Scan")
        assert classify_task_failure(info.value) == "no_text"
        doc_svc.save_document.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_any_text_goes_on(self, tmp_path):
        wf, doc_svc = _workflow(_doc(1))
        await wf.run_phase1(tmp_path / "book.pdf", title="Book")
        doc_svc.save_document.assert_awaited_once()
