"""Backward-compatibility shim — delegates to ExtractionService.

The real LLM entity extraction logic now lives in
``services.extraction_service``.  This module provides an
``EntityExtractor`` wrapper that preserves the original ``.extract()``
interface so that ``KnowledgeGraphPipeline`` and existing tests work
unchanged.

The ``_parse_json_response`` helper is also re-exported for tests that
import it directly.
"""

from __future__ import annotations

from domain.entities import Entity
from services.extraction_service import ExtractionService, _parse_json_response

__all__ = ["EntityExtractor", "_parse_json_response"]


class EntityExtractor:
    """Backward compat — delegates to ExtractionService."""

    def __init__(self, llm=None) -> None:
        self._svc = ExtractionService(llm=llm)

    async def extract(
        self, text: str, chapter_number: int, language: str = "en"
    ) -> list[Entity]:
        return await self._svc.extract_entities(text, chapter_number, language=language)
