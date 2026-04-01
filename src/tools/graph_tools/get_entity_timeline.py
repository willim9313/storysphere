"""GetEntityTimelineTool — event timeline for an entity.

USE when: the user asks about what happened to a character over time,
    a character's story arc, or events in order.
DO NOT USE when: the user asks about a single specific event
    (use AnalyzeEventTool) or entity attributes (use GetEntityAttributesTool).
Example queries: "What happened to Alice?", "Show Bob's timeline.",
    "Events involving London in order."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_event, format_tool_output, handle_not_found
from tools.schemas import EntityTimelineInput


class GetEntityTimelineTool(BaseTool):
    """Return events involving an entity, sorted by chapter or story time."""

    name: str = "get_entity_timeline"
    description: str = (
        "Raw event list — no LLM. "
        "Get a timeline of all events involving an entity, sorted by narrative or chronological order. "
        "Returns event title, type, chapter, description, participants, and temporal info. "
        "USE for: event history queries, story arc data without interpretation. "
        "For character development analysis with LLM-generated insight, use get_character_arc instead. "
        "DO NOT USE for: single event deep analysis. "
        "Input: entity ID or name, optional sort_by ('narrative' (default) or 'chronological')."
    )
    args_schema: Type[EntityTimelineInput] = EntityTimelineInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self, entity_id: str, sort_by: str = "narrative"
    ) -> str:
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(
                entity_id
            )
        if entity is None:
            return handle_not_found(entity_id)

        timeline = await self.kg_service.get_entity_timeline(
            entity.id, sort_by=sort_by
        )
        return format_tool_output(
            [format_event(e) for e in timeline]
        )

    def _run(
        self, entity_id: str, sort_by: str = "narrative"
    ) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(
            self._arun(entity_id, sort_by)
        )
