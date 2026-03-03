"""Backward-compatibility shim — delegates to ExtractionService.

The real LLM relation/event extraction logic now lives in
``services.extraction_service``.  This module provides a
``RelationExtractor`` wrapper that preserves the original ``.extract()``
interface so that ``KnowledgeGraphPipeline`` and existing tests work
unchanged.

The ``_parse_extraction_response`` helper is also re-exported for tests.
"""

from __future__ import annotations

from domain.entities import Entity
from domain.events import Event
from domain.relations import Relation
from services.extraction_service import ExtractionService, _parse_extraction_response

__all__ = ["RelationExtractor", "_parse_extraction_response"]


class RelationExtractor:
    """Backward compat — delegates to ExtractionService."""

    def __init__(self, llm=None) -> None:
        self._svc = ExtractionService(llm=llm)

    async def extract(
        self,
        text: str,
        entities: list[Entity],
        chapter_number: int,
    ) -> tuple[list[Relation], list[Event]]:
        return await self._svc.extract_relations(text, entities, chapter_number)
