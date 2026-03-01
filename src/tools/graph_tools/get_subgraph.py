"""GetSubgraphTool — extract a k-hop neighbourhood subgraph.

USE when: the user asks about the network around an entity, wants to see
    the local graph structure, or asks "who is near X".
DO NOT USE when: the user asks about specific paths between two entities
    (use GetRelationPathsTool) or a single entity's attributes
    (use GetEntityAttributesTool).
Example queries: "Show me the network around Alice.",
    "What entities are within 2 hops of London?", "Map around Bob."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output, handle_not_found
from tools.schemas import SubgraphInput


class GetSubgraphTool(BaseTool):
    """Extract the k-hop ego-graph neighbourhood around an entity."""

    name: str = "get_subgraph"
    description: str = (
        "Extract a k-hop neighbourhood subgraph centred on an entity. "
        "Returns all nodes (entities) and edges (relations) within k hops. "
        "USE for: local network exploration, 'who is near X', map queries. "
        "DO NOT USE for: finding paths between two specific entities. "
        "Input: entity ID/name, optional k_hops (1–3, default 2)."
    )
    args_schema: Type[SubgraphInput] = SubgraphInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str, k_hops: int = 2) -> str:
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)

        subgraph = await self.kg_service.get_subgraph(entity.id, k_hops=k_hops)
        return format_tool_output(subgraph)

    def _run(self, entity_id: str, k_hops: int = 2) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id, k_hops))
