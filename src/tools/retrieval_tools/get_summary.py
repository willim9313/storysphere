"""GetSummaryTool — retrieve chapter summaries for a document.

USE when: the user asks for a chapter summary, an overview of a chapter,
    or wants to understand what happens in a specific part of the novel.
DO NOT USE when: the user wants full paragraph text (use GetParagraphsTool)
    or semantic search (use VectorSearchTool).
Example queries: "Summarize chapter 3.", "What happens in chapter 1?",
    "Give me an overview of all chapters."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetSummaryInput


class GetSummaryTool(BaseTool):
    """Retrieve chapter summaries for a document."""

    name: str = "get_summary"
    description: str = (
        "Get chapter summaries for a document. "
        "If chapter_number is provided, returns that single chapter's summary. "
        "If omitted, returns summaries for all chapters. "
        "USE for: chapter overview, 'what happens in chapter X', plot summaries. "
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

        # Return all chapter summaries
        doc = await self.doc_service.get_document(document_id)
        if doc is None:
            return format_tool_output({"message": f"Document '{document_id}' not found."})
        summaries = [
            {
                "chapter_number": ch.number,
                "title": ch.title,
                "summary": ch.summary,
            }
            for ch in doc.chapters
        ]
        return format_tool_output({"document_id": document_id, "chapters": summaries})

    def _run(self, document_id: str, chapter_number: int | None = None) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
