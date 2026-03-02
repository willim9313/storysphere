"""Unit tests for retrieval tools (4 tools)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from tools.retrieval_tools import GenSummaryTool, GetParagraphsTool, GetSummaryTool, VectorSearchTool


class TestVectorSearchTool:
    @pytest.mark.asyncio
    async def test_returns_results(self, mock_vector_service):
        tool = VectorSearchTool(vector_service=mock_vector_service)
        result = json.loads(await tool._arun("garden scene"))
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["score"] > result[1]["score"]

    @pytest.mark.asyncio
    async def test_with_document_filter(self, mock_vector_service):
        tool = VectorSearchTool(vector_service=mock_vector_service)
        await tool._arun("garden", top_k=3, document_id="doc-1")
        mock_vector_service.search.assert_called_with(
            query_text="garden", top_k=3, document_id="doc-1"
        )


class TestGetSummaryTool:
    @pytest.mark.asyncio
    async def test_single_chapter(self, mock_doc_service):
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1", chapter_number=1))
        assert result["chapter_number"] == 1
        assert "summary" in result

    @pytest.mark.asyncio
    async def test_book_summary(self, mock_doc_service):
        """When no chapter_number, returns book-level summary."""
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1"))
        assert "summary" in result
        assert result["document_id"] == "doc-1"
        assert "chapter_number" not in result  # book-level, not chapter

    @pytest.mark.asyncio
    async def test_book_summary_not_found(self, mock_doc_service):
        mock_doc_service.get_book_summary.return_value = None
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1"))
        assert "message" in result

    @pytest.mark.asyncio
    async def test_chapter_not_found(self, mock_doc_service):
        mock_doc_service.get_chapter_summary.return_value = None
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1", chapter_number=99))
        assert "message" in result


class TestGenSummaryTool:
    @pytest.mark.asyncio
    async def test_regenerate_chapter_summary(self, mock_doc_service):
        mock_summarizer = AsyncMock()
        mock_summarizer.summarize_chapter = AsyncMock(return_value="New chapter summary.")
        tool = GenSummaryTool(doc_service=mock_doc_service, summarizer=mock_summarizer)
        result = json.loads(await tool._arun("doc-1", chapter_number=1))
        assert result["regenerated"] is True
        assert result["chapter_number"] == 1
        assert result["summary"] == "New chapter summary."
        mock_doc_service.save_chapter_summary.assert_called_once_with("doc-1", 1, "New chapter summary.")

    @pytest.mark.asyncio
    async def test_regenerate_book_summary(self, mock_doc_service):
        mock_summarizer = AsyncMock()
        mock_summarizer.summarize_book = AsyncMock(return_value="New book summary.")
        tool = GenSummaryTool(doc_service=mock_doc_service, summarizer=mock_summarizer)
        result = json.loads(await tool._arun("doc-1"))
        assert result["regenerated"] is True
        assert result["summary"] == "New book summary."
        mock_doc_service.save_book_summary.assert_called_once_with("doc-1", "New book summary.")

    @pytest.mark.asyncio
    async def test_document_not_found(self, mock_doc_service):
        mock_doc_service.get_document.return_value = None
        tool = GenSummaryTool(doc_service=mock_doc_service, summarizer=AsyncMock())
        result = json.loads(await tool._arun("nonexistent"))
        assert "not found" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_chapter_not_found(self, mock_doc_service):
        tool = GenSummaryTool(doc_service=mock_doc_service, summarizer=AsyncMock())
        result = json.loads(await tool._arun("doc-1", chapter_number=99))
        assert "not found" in result["message"].lower()


class TestGetParagraphsTool:
    @pytest.mark.asyncio
    async def test_returns_paragraphs(self, mock_doc_service):
        tool = GetParagraphsTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1"))
        assert isinstance(result, list)
        assert len(result) == 3
        assert "text" in result[0]

    @pytest.mark.asyncio
    async def test_with_chapter_filter(self, mock_doc_service):
        tool = GetParagraphsTool(doc_service=mock_doc_service)
        await tool._arun("doc-1", chapter_number=1)
        mock_doc_service.get_paragraphs.assert_called_with("doc-1", chapter_number=1)
