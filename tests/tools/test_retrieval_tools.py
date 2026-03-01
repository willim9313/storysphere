"""Unit tests for retrieval tools (3 tools)."""

from __future__ import annotations

import json

import pytest

from tools.retrieval_tools import GetParagraphsTool, GetSummaryTool, VectorSearchTool


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
    async def test_all_chapters(self, mock_doc_service):
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1"))
        assert "chapters" in result
        assert len(result["chapters"]) == 2

    @pytest.mark.asyncio
    async def test_not_found(self, mock_doc_service):
        mock_doc_service.get_chapter_summary.return_value = None
        tool = GetSummaryTool(doc_service=mock_doc_service)
        result = json.loads(await tool._arun("doc-1", chapter_number=99))
        assert "message" in result


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
