"""GetParagraphsTool — retrieve raw paragraph texts from a document.

USE when: the user wants to read the actual text of a chapter, needs
    the original paragraphs, or wants raw content for analysis.
DO NOT USE when: the user wants summaries (use GetSummaryTool) or
    semantic search (use VectorSearchTool).
Example queries: "Show me the text of chapter 2.", "Read chapter 1 paragraphs.",
    "Get all paragraphs from the document."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetParagraphsInput


class GetParagraphsTool(BaseTool):
    """Retrieve raw paragraph texts from a document, optionally by chapter."""

    name: str = "get_paragraphs"
    description: str = (
        "Retrieve original paragraph texts from a document. "
        "If chapter_number is provided, returns only that chapter's paragraphs. "
        "Otherwise, returns all paragraphs. "
        "USE for: reading raw text, quoting passages, providing source material. "
        "DO NOT USE for: summaries (use get_summary) or semantic search. "
        "Input: document_id, optional chapter_number."
    )
    args_schema: Type[GetParagraphsInput] = GetParagraphsInput

    doc_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        chapter_number: int | None = None,
    ) -> str:
        paragraphs = await self.doc_service.get_paragraphs(
            document_id, chapter_number=chapter_number
        )
        result = [
            {
                "id": p.id,
                "text": p.text,
                "chapter_number": p.chapter_number,
                "position": p.position,
            }
            for p in paragraphs
        ]
        return format_tool_output(result)

    def _run(self, document_id: str, chapter_number: int | None = None) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
