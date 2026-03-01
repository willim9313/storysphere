"""GetRelationPathsTool — find relationship paths between two entities.

USE when: the user asks how two characters are connected, the chain of
    relationships between entities, or degrees of separation.
DO NOT USE when: the user asks about a single entity's relationships
    (use GetEntityRelationsTool) or neighbourhood (use GetSubgraphTool).
Example queries: "How are Alice and Carol connected?",
    "What is the relationship path from Bob to London?"
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output, handle_not_found
from tools.schemas import RelationPathsInput


class GetRelationPathsTool(BaseTool):
    """Find all simple paths between two entities up to a maximum hop count."""

    name: str = "get_relation_paths"
    description: str = (
        "Find relationship paths between two entities in the knowledge graph. "
        "Returns all simple paths (no cycles) up to max_length hops. "
        "Each path shows entities and connecting relations. "
        "USE for: 'How are X and Y connected?', degrees of separation. "
        "DO NOT USE for: single entity's direct relations or subgraph exploration. "
        "Input: source and target entity ID/name, optional max_length (1–5, default 3)."
    )
    args_schema: Type[RelationPathsInput] = RelationPathsInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self, source: str, target: str, max_length: int = 3
    ) -> str:
        # Resolve names to IDs
        src_entity = await self.kg_service.get_entity(source)
        if src_entity is None:
            src_entity = await self.kg_service.get_entity_by_name(source)
        if src_entity is None:
            return handle_not_found(source)

        tgt_entity = await self.kg_service.get_entity(target)
        if tgt_entity is None:
            tgt_entity = await self.kg_service.get_entity_by_name(target)
        if tgt_entity is None:
            return handle_not_found(target)

        paths = await self.kg_service.get_relation_paths(
            src_entity.id, tgt_entity.id, max_length=max_length
        )
        if not paths:
            return format_tool_output(
                {"message": f"No paths found between '{source}' and '{target}' within {max_length} hops."}
            )
        return format_tool_output({"paths": paths, "count": len(paths)})

    def _run(self, source: str, target: str, max_length: int = 3) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(source, target, max_length))
