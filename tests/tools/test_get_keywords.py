"""Tests for GetKeywordsTool (Phase 2b)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from tools.retrieval_tools.get_keywords import GetKeywordsTool


@pytest.fixture
def keyword_service():
    svc = AsyncMock()
    svc.get_chapter_keywords = AsyncMock()
    svc.get_book_keywords = AsyncMock()
    return svc


class TestGetKeywordsTool:
    async def test_get_chapter_keywords(self, keyword_service):
        keyword_service.get_chapter_keywords.return_value = {"hero": 0.9, "villain": 0.7}
        tool = GetKeywordsTool(keyword_service=keyword_service)
        result = await tool._arun(document_id="doc1", chapter_number=1)
        data = json.loads(result)
        assert data["document_id"] == "doc1"
        assert data["chapter_number"] == 1
        assert data["keywords"]["hero"] == 0.9

    async def test_get_book_keywords(self, keyword_service):
        keyword_service.get_book_keywords.return_value = {"adventure": 0.95}
        tool = GetKeywordsTool(keyword_service=keyword_service)
        result = await tool._arun(document_id="doc1")
        data = json.loads(result)
        assert data["document_id"] == "doc1"
        assert "chapter_number" not in data
        assert data["keywords"]["adventure"] == 0.95

    async def test_chapter_keywords_not_found(self, keyword_service):
        keyword_service.get_chapter_keywords.return_value = None
        tool = GetKeywordsTool(keyword_service=keyword_service)
        result = await tool._arun(document_id="doc1", chapter_number=99)
        data = json.loads(result)
        assert "message" in data
        assert "No keywords found" in data["message"]

    async def test_book_keywords_not_found(self, keyword_service):
        keyword_service.get_book_keywords.return_value = None
        tool = GetKeywordsTool(keyword_service=keyword_service)
        result = await tool._arun(document_id="doc1")
        data = json.loads(result)
        assert "message" in data
        assert "No book keywords" in data["message"]
