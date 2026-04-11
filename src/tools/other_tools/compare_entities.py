"""CompareEntitiesTool — compare two entities' attributes and relations.

USE when: the user asks to compare two characters, contrast two locations,
    or see differences/similarities between entities.
DO NOT USE when: the user asks about a single entity (use GetEntityAttributesTool)
    or about paths between entities (use GetRelationPathsTool).
Example queries: "Compare Alice and Bob.", "How do London and Paris differ?",
    "Similarities between the two organizations."
"""

from __future__ import annotations

import asyncio
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, format_relation, format_tool_output, handle_not_found, resolve_entity
from tools.schemas import CompareEntitiesInput


class CompareEntitiesTool(BaseTool):
    """Compare two entities' attributes and relationships (pure data, no LLM)."""

    name: str = "compare_entities"
    description: str = (
        "Pure data comparison — NO LLM involved, faster than compare_characters. "
        "Compares two entities side-by-side: attributes, relation counts, event counts, shared connections, shared events. "
        "USE for: quick data queries, non-character entity comparisons, or when LLM analysis is not needed. "
        "For character comparison with LLM-generated narrative insight, use compare_characters instead. "
        "DO NOT USE for: single entity queries or path finding. "
        "Input: two entity IDs or names."
    )
    args_schema: Type[CompareEntitiesInput] = CompareEntitiesInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_a: str, entity_b: str) -> str:
        a = await resolve_entity(self.kg_service, entity_a)
        if a is None:
            return handle_not_found(entity_a)
        b = await resolve_entity(self.kg_service, entity_b)
        if b is None:
            return handle_not_found(entity_b)

        rels_a = await self.kg_service.get_relations(a.id)
        rels_b = await self.kg_service.get_relations(b.id)
        events_a = await self.kg_service.get_events(a.id)
        events_b = await self.kg_service.get_events(b.id)

        # Find shared relations (entities both are connected to)
        a_targets = {r.target_id for r in rels_a} | {r.source_id for r in rels_a}
        b_targets = {r.target_id for r in rels_b} | {r.source_id for r in rels_b}
        shared_connections = (a_targets & b_targets) - {a.id, b.id}

        # Find shared events
        a_event_ids = {e.id for e in events_a}
        b_event_ids = {e.id for e in events_b}
        shared_events = a_event_ids & b_event_ids

        comparison = {
            "entity_a": format_entity(a),
            "entity_b": format_entity(b),
            "relations_a_count": len(rels_a),
            "relations_b_count": len(rels_b),
            "events_a_count": len(events_a),
            "events_b_count": len(events_b),
            "shared_connections": list(shared_connections),
            "shared_events_count": len(shared_events),
            "type_match": a.entity_type == b.entity_type,
        }
        return format_tool_output(comparison)

    def _run(self, entity_a: str, entity_b: str) -> str:
        return asyncio.get_event_loop().run_until_complete(self._arun(entity_a, entity_b))
