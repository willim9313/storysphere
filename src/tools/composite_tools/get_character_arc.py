"""GetCharacterArcTool — character development arc analysis.

USE when: the user asks about how a character develops or changes over time.
Combines: entity timeline + relevant passages + LLM insight.
Example queries: "How does Elizabeth develop?", "Character arc of Alice."
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, format_event, handle_not_found
from tools.schemas import GetCharacterArcInput

logger = logging.getLogger(__name__)


class GetCharacterArcTool(BaseTool):
    """Analyze a character's development arc using timeline, text, and LLM insight."""

    name: str = "get_character_arc"
    description: str = (
        "Comprehensive character development analysis — includes LLM-generated growth insight. "
        "Combines timeline events + relevant passages + LLM analysis of how the character changes. "
        "USE for 'How does X change/develop/grow?' or 'character arc of X' queries. "
        "For raw event list only (no LLM), use get_entity_timeline instead. "
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

        # 2+3. Timeline events and relevant passages — run in parallel
        async def get_timeline() -> list:
            return await self.kg_service.get_entity_timeline(entity.id)

        async def get_passages() -> list:
            if self.vector_service is None:
                return []
            return await self.vector_service.search(
                query_text=f"{entity.name} development change growth",
                top_k=5,
            )

        timeline_r, passages_r = await asyncio.gather(
            get_timeline(),
            get_passages(),
            return_exceptions=True,
        )

        if isinstance(timeline_r, Exception):
            logger.warning("GetCharacterArcTool: timeline fetch failed: %s", timeline_r)
            result["timeline"] = []
        else:
            result["timeline"] = [format_event(e) for e in timeline_r]

        if isinstance(passages_r, Exception):
            logger.warning("GetCharacterArcTool: passages fetch failed: %s", passages_r)
            result["relevant_passages"] = []
        else:
            result["relevant_passages"] = passages_r

        # 4. LLM insight (best-effort; runs after timeline is available)
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
