"""GenSummaryTool — regenerate a chapter or book summary on demand.

USE when: the user wants to regenerate or refresh a summary (e.g. after
    new data has been added, or wants a fresh perspective).
DO NOT USE when: the user only wants to read an existing summary
    (use GetSummaryTool).
Example queries: "Regenerate the summary for chapter 3.",
    "Create a new book summary.", "Refresh the summary."
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GenSummaryInput


class GenSummaryTool(BaseTool):
    """Regenerate a chapter or book summary using the LLM."""

    name: str = "gen_summary"
    description: str = (
        "Regenerate a summary for a chapter or the entire book. "
        "If chapter_number is provided, regenerates that chapter's summary from its paragraphs. "
        "If omitted, regenerates the book-level summary from existing chapter summaries. "
        "USE for: refreshing stale summaries, generating missing summaries. "
        "DO NOT USE for: simply reading an existing summary (use get_summary). "
        "Input: document_id, optional chapter_number."
    )
    args_schema: Type[GenSummaryInput] = GenSummaryInput

    doc_service: Any = None
    summarizer: Any = None  # ChapterSummarizer instance

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        chapter_number: int | None = None,
    ) -> str:
        doc = await self.doc_service.get_document(document_id)
        if doc is None:
            return format_tool_output(
                {"message": f"Document '{document_id}' not found."}
            )

        if chapter_number is not None:
            # Regenerate a single chapter summary
            chapter = next(
                (ch for ch in doc.chapters if ch.number == chapter_number), None
            )
            if chapter is None:
                return format_tool_output(
                    {"message": f"Chapter {chapter_number} not found in document '{document_id}'."}
                )
            if not chapter.paragraphs:
                return format_tool_output(
                    {"message": f"Chapter {chapter_number} has no paragraphs to summarize."}
                )

            text = "\n\n".join(p.text for p in chapter.paragraphs)
            summary = await self.summarizer.summarize_chapter(
                text, chapter.number, chapter.title
            )
            await self.doc_service.save_chapter_summary(
                document_id, chapter_number, summary
            )
            return format_tool_output(
                {
                    "document_id": document_id,
                    "chapter_number": chapter_number,
                    "summary": summary,
                    "regenerated": True,
                }
            )

        # Regenerate book-level summary from chapter summaries
        chapter_summaries = [
            {
                "chapter_number": ch.number,
                "title": ch.title or "",
                "summary": ch.summary,
            }
            for ch in doc.chapters
            if ch.summary
        ]
        if not chapter_summaries:
            return format_tool_output(
                {"message": "No chapter summaries available. Generate chapter summaries first."}
            )

        summary = await self.summarizer.summarize_book(
            chapter_summaries, doc.title
        )
        await self.doc_service.save_book_summary(document_id, summary)
        return format_tool_output(
            {
                "document_id": document_id,
                "summary": summary,
                "regenerated": True,
            }
        )

    def _run(self, document_id: str, chapter_number: int | None = None) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
