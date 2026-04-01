"""GetEntityAttributesTool — retrieve entity attributes from the knowledge graph.

USE when: the user asks about a specific character's/location's/org's properties,
    aliases, description, or type.
DO NOT USE when: the user asks about relationships (use GetEntityRelationsTool)
    or events (use GetEntityTimelineTool).
Example queries: "Who is Alice?", "What are Bob's aliases?", "Describe London."
"""

from __future__ import annotations

from typing import Any, Optional, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, format_tool_output, handle_not_found
from tools.schemas import EntityIdInput


class GetEntityAttributesTool(BaseTool):
    """Look up an entity's attributes: name, type, aliases, description, and custom attributes."""

    name: str = "get_entity_attributes"
    description: str = (
        "QUICK lookup — no LLM. "
        "Retrieve an entity's KG-stored attributes (name, type, aliases, "
        "description, custom attributes, first appearance chapter, mention count). "
        "USE for: fast character/location/org info queries when only attributes are needed. "
        "For a comprehensive profile including passages and relations, use get_entity_profile instead. "
        "DO NOT USE for: relationship queries (use get_entity_relations) or event timelines. "
        "Input: entity ID (UUID) or exact name."
    )
    args_schema: Type[EntityIdInput] = EntityIdInput

    kg_service: Any = None  # injected

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str) -> str:
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)
        return format_tool_output(format_entity(entity))

    def _run(self, entity_id: str) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id))
