"""SummarizationPipeline — generate chapter and book summaries.

Step 1: For each chapter with paragraphs, generate a chapter summary (sequential).
Step 2: Aggregate chapter summaries → generate book-level summary.
Mutates the Document in-place (consistent with FeatureExtractionPipeline).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from domain.documents import Document
from pipelines.base import BasePipeline

from .summarizer import ChapterSummarizer

logger = logging.getLogger(__name__)


@dataclass
class SummarizationResult:
    """Output of the summarization pipeline."""

    document_id: str
    chapters_summarized: int = 0
    book_summary_generated: bool = False


class SummarizationPipeline(BasePipeline[Document, SummarizationResult]):
    """Generate hierarchical summaries: chapters → book.

    Modifies the Document in-place, setting ``Chapter.summary`` and
    ``Document.summary`` fields.
    """

    def __init__(self, summarizer: ChapterSummarizer | None = None) -> None:
        self._summarizer = summarizer or ChapterSummarizer()

    async def run(self, input_data: Document) -> SummarizationResult:
        doc = input_data
        chapters_summarized = 0

        # Step 1: chapter summaries (sequential to avoid rate limits)
        for chapter in doc.chapters:
            if not chapter.paragraphs:
                logger.debug("Skipping chapter %d — no paragraphs", chapter.number)
                continue

            text = "\n\n".join(p.text for p in chapter.paragraphs)
            self._log_step("summarize_chapter", chapter=chapter.number)
            chapter.summary = await self._summarizer.summarize_chapter(
                text, chapter.number, chapter.title, language=doc.language
            )
            chapters_summarized += 1

        # Step 2: book summary from chapter summaries
        chapter_summaries = [
            {
                "chapter_number": ch.number,
                "title": ch.title or "",
                "summary": ch.summary,
            }
            for ch in doc.chapters
            if ch.summary
        ]

        book_summary_generated = False
        if chapter_summaries:
            self._log_step("summarize_book")
            doc.summary = await self._summarizer.summarize_book(
                chapter_summaries, doc.title, language=doc.language
            )
            book_summary_generated = True

        return SummarizationResult(
            document_id=doc.id,
            chapters_summarized=chapters_summarized,
            book_summary_generated=book_summary_generated,
        )
