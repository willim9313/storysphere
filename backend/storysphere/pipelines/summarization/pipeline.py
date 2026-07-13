"""SummarizationPipeline — generate chapter and book summaries.

Step 1: For each chapter with paragraphs, generate a chapter summary (sequential).
Step 2: Aggregate chapter summaries → generate book-level summary.
Mutates the Document in-place (consistent with FeatureExtractionPipeline).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from storysphere.core.error_handling import is_rate_limit_error
from storysphere.domain.documents import ChapterRole, Document
from storysphere.pipelines.base import BasePipeline

from .summarizer import ChapterSummarizer

logger = logging.getLogger(__name__)


@dataclass
class SummarizationResult:
    """Output of the summarization pipeline."""

    document_id: str
    chapters_summarized: int = 0
    chapters_total: int = 0
    book_summary_generated: bool = False


class SummarizationPipeline(BasePipeline[Document, SummarizationResult]):
    """Generate hierarchical summaries: chapters → book.

    Modifies the Document in-place, setting ``Chapter.summary`` and
    ``Document.summary`` fields.
    """

    def __init__(self, summarizer: ChapterSummarizer | None = None) -> None:
        self._summarizer = summarizer or ChapterSummarizer()

    async def run(self, input_data: Document, *, sub_cb=None, murmur_cb=None) -> SummarizationResult:
        doc = input_data
        # Only body chapters are summarized; front/back matter (toc/preface/
        # afterword/other) is not story content.
        total = sum(
            1 for ch in doc.chapters
            if ch.paragraphs and ch.role == ChapterRole.body
        )

        if sub_cb:
            sub_cb(0, total, "章節摘要")

        chapters_summarized = await self._summarize_chapters(
            doc, total=total, sub_cb=sub_cb, murmur_cb=murmur_cb
        )

        chapter_summaries = [
            {"chapter_number": ch.number, "title": ch.title or "", "summary": ch.summary}
            for ch in doc.chapters
            if ch.summary
        ]

        book_summary_generated = False
        if chapter_summaries:
            if doc.summary is not None:
                book_summary_generated = True
            else:
                if sub_cb:
                    sub_cb(total, total, "全書摘要")
                self._log_step("summarize_book")
                try:
                    doc.summary = await self._summarizer.summarize_book(
                        chapter_summaries, doc.title, language=doc.language
                    )
                    book_summary_generated = True
                except Exception as exc:
                    if is_rate_limit_error(exc):
                        raise
                    logger.warning("Book summary failed (skipped): %s", exc)

        return SummarizationResult(
            document_id=doc.id,
            chapters_summarized=chapters_summarized,
            chapters_total=total,
            book_summary_generated=book_summary_generated,
        )

    async def _summarize_chapters(
        self, doc: Document, *, total: int, sub_cb=None, murmur_cb=None
    ) -> int:
        """Summarize each chapter individually; failed chapters are skipped.

        Chapters that already have a summary (from a previous partial run) are
        counted as done and skipped, enabling resume after a rate-limit abort.
        """
        chapters_summarized = 0
        for chapter in doc.chapters:
            if not chapter.paragraphs:
                logger.debug("Skipping chapter %d — no paragraphs", chapter.number)
                continue
            if chapter.role != ChapterRole.body:
                continue  # front/back matter — not summarized

            if chapter.summary is not None:
                chapters_summarized += 1
                if sub_cb:
                    sub_cb(chapters_summarized, total, "章節摘要")
                continue

            text = "\n\n".join(p.text for p in chapter.paragraphs)
            self._log_step("summarize_chapter", chapter=chapter.number)
            try:
                chapter.summary = await self._summarizer.summarize_chapter(
                    text, chapter.number, chapter.title, language=doc.language
                )
                chapters_summarized += 1
            except Exception as exc:
                if is_rate_limit_error(exc):
                    raise
                logger.warning(
                    "Chapter %d summarization failed (skipped): %s", chapter.number, exc
                )

            if sub_cb:
                sub_cb(chapters_summarized, total, "章節摘要")
            if murmur_cb:
                try:
                    await murmur_cb(chapter.number)
                except Exception:  # noqa: BLE001
                    pass

        return chapters_summarized
