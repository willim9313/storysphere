"""GetKeywordsTool — retrieve keywords for a chapter or book.

USE when: the user asks about keywords, key themes, or important terms.
DO NOT USE when: the user wants full text (GetParagraphsTool) or summaries (GetSummaryTool).
Example queries: "What are the keywords for chapter 3?", "Key themes of the book."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GetKeywordsInput


class GetKeywordsTool(BaseTool):
    """Retrieve keywords for a chapter or the whole book."""

    name: str = "get_keywords"
    description: str = (
        "Get keywords and their relevance scores for a document. "
        "If chapter_number is provided, returns that chapter's keywords. "
        "If omitted, returns the book-level keywords. "
        "USE for: key themes, important terms, topic overview. "
        "DO NOT USE for: full text retrieval or summaries. "
        "Input: document_id, optional chapter_number."
    )
    args_schema: Type[GetKeywordsInput] = GetKeywordsInput

    keyword_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        chapter_number: int | None = None,
    ) -> str:
        if chapter_number is not None:
            keywords = await self.keyword_service.get_chapter_keywords(
                document_id, chapter_number
            )
            if keywords is None:
                return format_tool_output(
                    {"message": f"No keywords found for document '{document_id}' chapter {chapter_number}."}
                )
            return format_tool_output(
                {"document_id": document_id, "chapter_number": chapter_number, "keywords": keywords}
            )

        keywords = await self.keyword_service.get_book_keywords(document_id)
        if keywords is None:
            return format_tool_output(
                {"message": f"No book keywords found for document '{document_id}'."}
            )
        return format_tool_output(
            {"document_id": document_id, "keywords": keywords}
        )

    def _run(self, document_id: str, chapter_number: int | None = None) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, chapter_number)
        )
