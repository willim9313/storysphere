"""GetRelationStatsTool — relation type distribution and weight statistics.

USE when: the user asks about overall relationship patterns, most common
    relation types, or statistical summaries of the knowledge graph.
DO NOT USE when: the user asks about a specific entity's relations
    (use GetEntityRelationsTool) or specific paths (use GetRelationPathsTool).
Example queries: "What types of relationships are most common?",
    "Show relationship statistics.", "How strong are Alice's connections on average?"
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import RelationStatsInput


class GetRelationStatsTool(BaseTool):
    """Get relation type distribution and weight statistics, optionally scoped to an entity."""

    name: str = "get_relation_stats"
    description: str = (
        "Get statistical summary of relations: type distribution, "
        "average/min/max weight, total count. "
        "Can be scoped to a specific entity or computed globally. "
        "USE for: pattern analysis, 'most common relation type', statistical overview. "
        "DO NOT USE for: listing specific relations for an entity. "
        "Input: optional entity_id to scope; omit for global stats."
    )
    args_schema: Type[RelationStatsInput] = RelationStatsInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str | None = None) -> str:
        stats = await self.kg_service.get_relation_stats(entity_id=entity_id)
        return format_tool_output(stats)

    def _run(self, entity_id: str | None = None) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id))
