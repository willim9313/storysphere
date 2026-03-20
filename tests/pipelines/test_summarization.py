"""Unit tests for the SummarizationPipeline."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from pipelines.summarization.pipeline import SummarizationPipeline, SummarizationResult
from pipelines.summarization.summarizer import ChapterSummarizer


def _make_doc(chapters: list[Chapter] | None = None) -> Document:
    if chapters is None:
        chapters = [
            Chapter(
                number=1,
                title="The Beginning",
                paragraphs=[
                    Paragraph(text="Alice entered the garden.", chapter_number=1, position=0),
                    Paragraph(text="Bob followed closely.", chapter_number=1, position=1),
                ],
            ),
            Chapter(
                number=2,
                title="The Storm",
                paragraphs=[
                    Paragraph(text="The storm arrived.", chapter_number=2, position=0),
                ],
            ),
        ]
    return Document(
        id="doc-1",
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


class TestSummarizationPipeline:
    @pytest.mark.asyncio
    async def test_generates_chapter_and_book_summaries(self):
        mock_summarizer = AsyncMock(spec=ChapterSummarizer)
        mock_summarizer.summarize_chapter = AsyncMock(
            side_effect=lambda text, num, title, language="en": f"Summary of chapter {num}."
        )
        mock_summarizer.summarize_book = AsyncMock(return_value="Full book summary.")

        pipeline = SummarizationPipeline(summarizer=mock_summarizer)
        doc = _make_doc()
        result = await pipeline.run(doc)

        assert isinstance(result, SummarizationResult)
        assert result.chapters_summarized == 2
        assert result.book_summary_generated is True
        assert doc.chapters[0].summary == "Summary of chapter 1."
        assert doc.chapters[1].summary == "Summary of chapter 2."
        assert doc.summary == "Full book summary."
        assert mock_summarizer.summarize_chapter.call_count == 2
        assert mock_summarizer.summarize_book.call_count == 1

    @pytest.mark.asyncio
    async def test_skips_empty_chapters(self):
        mock_summarizer = AsyncMock(spec=ChapterSummarizer)
        mock_summarizer.summarize_chapter = AsyncMock(return_value="Summary.")
        mock_summarizer.summarize_book = AsyncMock(return_value="Book summary.")

        chapters = [
            Chapter(number=1, title="Has content", paragraphs=[
                Paragraph(text="Some text.", chapter_number=1, position=0),
            ]),
            Chapter(number=2, title="Empty", paragraphs=[]),
        ]
        pipeline = SummarizationPipeline(summarizer=mock_summarizer)
        doc = _make_doc(chapters)
        result = await pipeline.run(doc)

        assert result.chapters_summarized == 1
        assert doc.chapters[1].summary is None
        mock_summarizer.summarize_chapter.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_chapters_no_book_summary(self):
        mock_summarizer = AsyncMock(spec=ChapterSummarizer)
        mock_summarizer.summarize_book = AsyncMock()

        pipeline = SummarizationPipeline(summarizer=mock_summarizer)
        doc = _make_doc(chapters=[])
        result = await pipeline.run(doc)

        assert result.chapters_summarized == 0
        assert result.book_summary_generated is False
        assert doc.summary is None
        mock_summarizer.summarize_book.assert_not_called()

    @pytest.mark.asyncio
    async def test_callable_interface(self):
        """Pipeline can be called via __call__ (BasePipeline)."""
        mock_summarizer = AsyncMock(spec=ChapterSummarizer)
        mock_summarizer.summarize_chapter = AsyncMock(return_value="Ch summary.")
        mock_summarizer.summarize_book = AsyncMock(return_value="Book.")

        pipeline = SummarizationPipeline(summarizer=mock_summarizer)
        doc = _make_doc()
        result = await pipeline(doc)  # uses __call__

        assert result.chapters_summarized == 2
        assert result.book_summary_generated is True
