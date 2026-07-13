"""Unit tests for the TOC parser service (目錄對照提示).

Pure-ish service tests: the LLM is a fake whose ``ainvoke`` returns a canned
response, so we exercise the concat/parse/coerce logic without a real provider.
"""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, "src")


def _make_toc_chapters(toc_text: str):
    """A book with one non-toc body chapter and one toc chapter."""
    from storysphere.domain.documents import Chapter, ChapterRole, Paragraph

    return [
        Chapter(
            number=1,
            role=ChapterRole.body,
            paragraphs=[Paragraph(id="b0", text="故事開始。", chapter_number=1, position=0)],
        ),
        Chapter(
            number=2,
            role=ChapterRole.toc,
            paragraphs=[Paragraph(id="t0", text=toc_text, chapter_number=2, position=0)],
        ),
    ]


def _fake_llm(content: str) -> AsyncMock:
    llm = AsyncMock()
    llm.ainvoke.return_value = SimpleNamespace(content=content)
    return llm


class TestParseTocEntries:
    @pytest.mark.asyncio
    async def test_no_toc_chapter_returns_empty_without_llm(self):
        from storysphere.domain.documents import Chapter, ChapterRole, Paragraph
        from storysphere.services.toc_parser import parse_toc_entries

        chapters = [
            Chapter(
                number=1,
                role=ChapterRole.body,
                paragraphs=[Paragraph(id="b0", text="正文。", chapter_number=1, position=0)],
            )
        ]
        llm = _fake_llm('{"entries": []}')
        result = await parse_toc_entries(chapters, llm=llm)
        assert result == []
        llm.ainvoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_happy_path_parses_ordered_entries(self):
        from storysphere.services.toc_parser import parse_toc_entries

        content = (
            '{"entries": ['
            '{"title": "第一章 開端", "page": 15, "level": 0, "isBody": true},'
            '{"title": "第二章 潮汐", "page": 34, "level": 0, "isBody": true},'
            '{"title": "跋", "page": 86, "level": 0, "isBody": false}'
            ']}'
        )
        result = await parse_toc_entries(_make_toc_chapters("目錄 …"), llm=_fake_llm(content))
        assert [e.title for e in result] == ["第一章 開端", "第二章 潮汐", "跋"]
        assert result[0].page == 15
        assert result[2].is_body is False

    @pytest.mark.asyncio
    async def test_non_json_response_returns_empty(self):
        from storysphere.services.toc_parser import parse_toc_entries

        result = await parse_toc_entries(_make_toc_chapters("目錄 …"), llm=_fake_llm("not json at all"))
        assert result == []

    @pytest.mark.asyncio
    async def test_entries_not_a_list_returns_empty(self):
        from storysphere.services.toc_parser import parse_toc_entries

        result = await parse_toc_entries(_make_toc_chapters("目錄 …"), llm=_fake_llm('{"entries": "oops"}'))
        assert result == []

    @pytest.mark.asyncio
    async def test_entries_without_title_are_dropped(self):
        from storysphere.services.toc_parser import parse_toc_entries

        content = (
            '{"entries": ['
            '{"title": "", "page": 1},'
            '{"title": "第一章", "page": null},'
            '{"page": 5}'
            ']}'
        )
        result = await parse_toc_entries(_make_toc_chapters("目錄 …"), llm=_fake_llm(content))
        assert [e.title for e in result] == ["第一章"]
        assert result[0].page is None
        assert result[0].level == 0
        assert result[0].is_body is True

    @pytest.mark.asyncio
    async def test_negative_level_clamped_to_zero(self):
        from storysphere.services.toc_parser import parse_toc_entries

        content = '{"entries": [{"title": "序", "level": -3, "isBody": false}]}'
        result = await parse_toc_entries(_make_toc_chapters("目錄 …"), llm=_fake_llm(content))
        assert result[0].level == 0


class TestParseTocText:
    """parse_toc_text: same extraction, but from raw text (the edited TOC)."""

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty_without_llm(self):
        from storysphere.services.toc_parser import parse_toc_text

        llm = _fake_llm('{"entries": []}')
        result = await parse_toc_text("   \n  ", llm=llm)
        assert result == []
        llm.ainvoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_parses_ordered_entries_from_text(self):
        from storysphere.services.toc_parser import parse_toc_text

        content = (
            '{"entries": ['
            '{"title": "第一章 開端", "page": 15, "level": 0, "isBody": true},'
            '{"title": "跋", "page": 86, "level": 0, "isBody": false}'
            ']}'
        )
        result = await parse_toc_text("第一章 開端 …… 15", llm=_fake_llm(content))
        assert [e.title for e in result] == ["第一章 開端", "跋"]
        assert result[1].is_body is False
