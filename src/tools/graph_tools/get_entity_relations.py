"""GetEntityRelationsTool — list all relations for an entity.

USE when: the user asks about who is connected to a character, what relationships
    an entity has, or the social network of an entity.
DO NOT USE when: the user asks about paths between two entities
    (use GetRelationPathsTool) or entity attributes (use GetEntityAttributesTool).
Example queries: "Who are Alice's friends?", "What are Bob's relationships?",
    "Show all connections for London."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_relation, format_tool_output, handle_not_found
from tools.schemas import EntityRelationsInput


class GetEntityRelationsTool(BaseTool):
    """List all relationships for a given entity, optionally filtered by direction."""

    name: str = "get_entity_relations"
    description: str = (
        "List all relationships (incoming, outgoing, or both) for an entity. "
        "Returns relation type, connected entity, weight, and chapters. "
        "USE for: relationship queries, social network exploration. "
        "DO NOT USE for: finding paths between two entities or entity attributes. "
        "Input: entity ID/name and optional direction ('both' (default), 'in', or 'out')."
    )
    args_schema: Type[EntityRelationsInput] = EntityRelationsInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str, direction: str = "both") -> str:
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)

        relations = await self.kg_service.get_relations(entity.id, direction=direction)
        return format_tool_output([format_relation(r) for r in relations])

    def _run(self, entity_id: str, direction: str = "both") -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id, direction))
