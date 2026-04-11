"""ExtractEntitiesFromTextTool — extract entities from free-form text.

USE when: the user pastes or provides arbitrary text and wants to identify
    entities (characters, locations, organizations) within it.
DO NOT USE when: the user asks about existing entities in the knowledge graph
    (use GetEntityAttributesTool) or wants to search for passages
    (use VectorSearchTool).
Example queries: "Extract entities from this passage: ...",
    "Who is mentioned in this text?"
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, format_tool_output
from tools.schemas import ExtractEntitiesInput


class ExtractEntitiesFromTextTool(BaseTool):
    """Extract named entities from free-form text using the LLM-based entity extractor."""

    name: str = "extract_entities_from_text"
    description: str = (
        "Extract named entities (characters, locations, organizations, etc.) "
        "from arbitrary user-provided text using LLM-based NER. "
        "Returns a list of detected entities with type, aliases, and description. "
        "USE for: identifying entities in pasted text, ad-hoc NER. "
        "DO NOT USE for: querying existing KG entities or searching passages. "
        "Input: free-form text string."
    )
    args_schema: Type[ExtractEntitiesInput] = ExtractEntitiesInput

    extraction_service: Any = None  # ExtractionService instance, injected or lazy

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, text: str) -> str:
        svc = self._resolve_service()
        entities = await svc.extract_entities(text, chapter_number=0)
        return format_tool_output([format_entity(e) for e in entities])

    def _run(self, text: str) -> str:
        return asyncio.get_event_loop().run_until_complete(self._arun(text))

    def _resolve_service(self):
        if self.extraction_service is not None:
            return self.extraction_service
        from services.extraction_service import ExtractionService
        return ExtractionService()
