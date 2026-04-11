"""VectorSearchTool — semantic search over paragraph embeddings.

USE when: the user asks a free-form question about the novel's content,
    wants to find relevant passages, or searches by topic/theme.
DO NOT USE when: the user asks about a specific chapter summary
    (use GetSummaryTool) or specific entity data (use graph tools).
Example queries: "Find passages about betrayal.", "Where is the garden described?",
    "What does the text say about love?"
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import VectorSearchInput


class VectorSearchTool(BaseTool):
    """Semantic search over novel paragraphs using vector embeddings."""

    name: str = "vector_search"
    description: str = (
        "Perform semantic (meaning-based) search over all paragraphs in the novel. "
        "Returns top-k most relevant passages with similarity scores. "
        "USE for: topic/theme search, finding relevant passages, free-form questions. "
        "DO NOT USE for: chapter summaries or structured entity queries. "
        "Input: natural language query, optional top_k (1–20), optional document_id filter."
    )
    args_schema: Type[VectorSearchInput] = VectorSearchInput

    vector_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        query: str,
        top_k: int = 5,
        document_id: str | None = None,
    ) -> str:
        results = await self.vector_service.search(
            query_text=query, top_k=top_k, document_id=document_id
        )
        return format_tool_output(results)

    def _run(self, query: str, top_k: int = 5, document_id: str | None = None) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(query, top_k, document_id)
        )
