"""GetSummaryTool — retrieve a chapter or book-level summary.

USE when: the user asks for a summary, an overview of a chapter or the whole book.
DO NOT USE when: the user wants full paragraph text (use GetParagraphsTool)
    or semantic search (use VectorSearchTool).
Example queries: "Summarize chapter 3.", "What happens in chapter 1?",
    "Give me an overview of the book."
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetSummaryInput


class GetSummaryTool(BaseTool):
    """Retrieve a chapter summary or the book-level summary."""

    name: str = "get_summary"
    description: str = (
        "Get a summary for a document. "
        "If chapter_number is provided, returns that chapter's summary. "
        "If omitted, returns the book-level summary. "
        "USE for: chapter overview, 'what happens in chapter X', book overview. "
        "DO NOT USE for: full paragraph text retrieval or semantic search. "
        "Input: document_id, optional chapter_number."
    )
    args_schema: Type[GetSummaryInput] = GetSummaryInput

    doc_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        chapter_number: int | None = None,
    ) -> str:
        if chapter_number is not None:
            summary = await self.doc_service.get_chapter_summary(
                document_id, chapter_number
            )
            if summary is None:
                return format_tool_output(
                    {"message": f"No summary found for document '{document_id}' chapter {chapter_number}."}
                )
            return format_tool_output(
                {"document_id": document_id, "chapter_number": chapter_number, "summary": summary}
            )

        # Return book-level summary
        summary = await self.doc_service.get_book_summary(document_id)
        if summary is None:
            return format_tool_output(
                {"message": f"No book summary found for document '{document_id}'."}
            )
        return format_tool_output(
            {"document_id": document_id, "summary": summary}
        )

    def _run(self, document_id: str, chapter_number: int | None = None) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
