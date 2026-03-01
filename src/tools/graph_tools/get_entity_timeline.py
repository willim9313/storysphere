"""GetEntityTimelineTool — chronological event timeline for an entity.

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
from tools.schemas import EntityIdInput


class GetEntityTimelineTool(BaseTool):
    """Return all events involving an entity, sorted chronologically by chapter."""

    name: str = "get_entity_timeline"
    description: str = (
        "Get a chronological timeline of all events involving an entity, "
        "sorted by chapter number. Returns event title, type, chapter, "
        "description, and participants. "
        "USE for: character story arc, event history, chronological questions. "
        "DO NOT USE for: single event deep analysis or entity attributes. "
        "Input: entity ID (UUID) or exact name."
    )
    args_schema: Type[EntityIdInput] = EntityIdInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str) -> str:
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)

        timeline = await self.kg_service.get_entity_timeline(entity.id)
        return format_tool_output([format_event(e) for e in timeline])

    def _run(self, entity_id: str) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id))
