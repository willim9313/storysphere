"""GetChapterSummaryTool — retrieve the pre-computed summary for a specific chapter.

USE when: the user asks about a specific chapter's summary or overview and
    the chapter number is known.
DO NOT USE when: chapter number is unknown (use GetSummaryTool which can also
    return a book-level summary), or when the user wants full paragraph text
    (use GetParagraphsTool), or semantic search (use VectorSearchTool).
Example queries: "What is the summary of chapter 3?",
    "Give me chapter 5's overview.", "Summarize chapter 1 only."
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetChapterSummaryInput


class GetChapterSummaryTool(BaseTool):
    """Retrieve the pre-computed summary for a specific chapter."""

    name: str = "get_chapter_summary"
    description: str = (
        "Get the pre-computed summary for a specific chapter of a document. "
        "chapter_number is required. "
        "USE for: chapter-specific overview when the chapter number is known. "
        "DO NOT USE for: book-level summary (use get_summary), full paragraph text "
        "(use get_paragraphs), or semantic search (use vector_search). "
        "Input: document_id, chapter_number."
    )
    args_schema: Type[GetChapterSummaryInput] = GetChapterSummaryInput

    doc_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        chapter_number: int,
    ) -> str:
        summary = await self.doc_service.get_chapter_summary(document_id, chapter_number)
        if summary is None:
            return format_tool_output(
                {
                    "message": (
                        f"No summary found for document '{document_id}' "
                        f"chapter {chapter_number}."
                    )
                }
            )
        return format_tool_output(
            {
                "document_id": document_id,
                "chapter_number": chapter_number,
                "summary": summary,
            }
        )

    def _run(self, document_id: str, chapter_number: int) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
