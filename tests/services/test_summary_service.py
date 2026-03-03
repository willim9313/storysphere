"""Unit tests for SummaryService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.summary_service import SummaryService


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content="A great summary."))
    return llm


@pytest.fixture
def service(mock_llm):
    return SummaryService(llm=mock_llm)


class TestSummarizeChapter:
    @pytest.mark.asyncio
    async def test_returns_summary_string(self, service):
        with patch("config.settings.get_settings") as mock_settings:
            mock_settings.return_value.summary_max_chapter_chars = 10000
            result = await service.summarize_chapter("Chapter text here.", 1, "Title")

        assert result == "A great summary."

    @pytest.mark.asyncio
    async def test_truncates_text(self, service, mock_llm):
        with patch("config.settings.get_settings") as mock_settings:
            mock_settings.return_value.summary_max_chapter_chars = 5
            await service.summarize_chapter("Long text that gets truncated.", 1)

        call_args = mock_llm.ainvoke.call_args[0][0]
        # The human message content should contain truncated text
        human_msg = call_args[1].content
        assert "Long " in human_msg
        assert "truncated" not in human_msg

    @pytest.mark.asyncio
    async def test_includes_title_in_header(self, service, mock_llm):
        with patch("config.settings.get_settings") as mock_settings:
            mock_settings.return_value.summary_max_chapter_chars = 10000
            await service.summarize_chapter("Text.", 3, "The Storm")

        human_msg = mock_llm.ainvoke.call_args[0][0][1].content
        assert "Chapter 3: The Storm" in human_msg


class TestSummarizeBook:
    @pytest.mark.asyncio
    async def test_returns_book_summary(self, service):
        summaries = [
            {"chapter_number": 1, "title": "Start", "summary": "Ch1 summary."},
            {"chapter_number": 2, "title": "", "summary": "Ch2 summary."},
        ]
        result = await service.summarize_book(summaries, "My Novel")

        assert result == "A great summary."

    @pytest.mark.asyncio
    async def test_formats_chapter_summaries(self, service, mock_llm):
        summaries = [
            {"chapter_number": 1, "title": "Start", "summary": "Ch1 summary."},
        ]
        await service.summarize_book(summaries, "My Novel")

        human_msg = mock_llm.ainvoke.call_args[0][0][1].content
        assert "Chapter 1: Start" in human_msg
        assert "Book: My Novel" in human_msg

    @pytest.mark.asyncio
    async def test_empty_summary_raises(self):
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content="   "))
        svc = SummaryService(llm=llm)

        with pytest.raises(ValueError, match="empty summary"):
            await svc.summarize_book(
                [{"chapter_number": 1, "title": "", "summary": "x"}]
            )
