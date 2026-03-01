"""GetChapterSummaryTool — retrieve a specific chapter's summary.

USE when: the user asks for a single chapter's summary by number.
DO NOT USE when: the user wants all chapter summaries (use GetSummaryTool)
    or raw paragraph text (use GetParagraphsTool).
Example queries: "What happens in chapter 5?", "Summary of chapter 1.",
    "Tell me about chapter 3."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetChapterSummaryInput


class GetChapterSummaryTool(BaseTool):
    """Retrieve the summary for a specific chapter of a document."""

    name: str = "get_chapter_summary"
    description: str = (
        "Get the summary of a specific chapter by document ID and chapter number. "
        "Returns the pre-generated chapter summary text. "
        "USE for: 'what happens in chapter X', single chapter overview. "
        "DO NOT USE for: all chapter summaries (use get_summary) "
        "or raw text (use get_paragraphs). "
        "Input: document_id and chapter_number."
    )
    args_schema: Type[GetChapterSummaryInput] = GetChapterSummaryInput

    doc_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, document_id: str, chapter_number: int) -> str:
        summary = await self.doc_service.get_chapter_summary(document_id, chapter_number)
        if summary is None:
            return format_tool_output(
                {"message": f"No summary found for document '{document_id}' chapter {chapter_number}."}
            )
        return format_tool_output(
            {
                "document_id": document_id,
                "chapter_number": chapter_number,
                "summary": summary,
            }
        )

    def _run(self, document_id: str, chapter_number: int) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
