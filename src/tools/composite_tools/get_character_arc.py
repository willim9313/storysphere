"""GetCharacterArcTool — character development arc analysis.

USE when: the user asks about how a character develops or changes over time.
Combines: entity timeline + relevant passages + LLM insight.
Example queries: "How does Elizabeth develop?", "Character arc of Alice."
"""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, format_event, handle_not_found
from tools.schemas import GetCharacterArcInput


class GetCharacterArcTool(BaseTool):
    """Analyze a character's development arc using timeline, text, and LLM insight."""

    name: str = "get_character_arc"
    description: str = (
        "Analyze a character's development arc: timeline events, relevant passages, "
        "and an LLM-generated insight about their growth. "
        "USE for 'How does X change?' or 'character arc of X' queries. "
        "Input: character entity ID or name."
    )
    args_schema: Type[GetCharacterArcInput] = GetCharacterArcInput

    kg_service: Any = None
    vector_service: Any = None
    analysis_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str) -> str:
        # 1. Resolve entity
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)

        result: dict[str, Any] = {"entity": format_entity(entity)}

        # 2. Timeline events
        try:
            events = await self.kg_service.get_entity_timeline(entity.id)
            result["timeline"] = [format_event(e) for e in events]
        except Exception:
            result["timeline"] = []

        # 3. Relevant passages (best-effort)
        if self.vector_service is not None:
            try:
                passages = await self.vector_service.search(
                    query_text=f"{entity.name} development change growth",
                    top_k=5,
                )
                result["relevant_passages"] = passages
            except Exception:
                result["relevant_passages"] = []

        # 4. LLM insight (best-effort)
        if self.analysis_service is not None:
            try:
                context_parts = [f"Character: {entity.name} ({entity.description})"]
                if result.get("timeline"):
                    events_text = "; ".join(
                        f"Ch.{e['chapter']}: {e['title']}" for e in result["timeline"]
                    )
                    context_parts.append(f"Timeline: {events_text}")
                insight = await self.analysis_service.generate_insight(
                    topic=f"Character development arc of {entity.name}",
                    context="\n".join(context_parts),
                )
                result["insight"] = insight
            except Exception:
                result["insight"] = None

        return json.dumps(result, ensure_ascii=False, indent=2, default=str)

    def _run(self, entity_id: str) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id))
