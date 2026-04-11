"""GetEventProfileTool — comprehensive event dossier (no LLM).

USE when: the user wants a full profile of a plot event.
Combines: event attributes + resolved participants + timeline context + passages + chapter summary.
DO NOT USE when: user wants deep causal/impact analysis (use analyze_event).
Example queries: "What happened in the battle?", "Tell me about the meeting event."
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import _json_default, format_event, handle_not_found
from tools.schemas import GetEventProfileInput

logger = logging.getLogger(__name__)


class GetEventProfileTool(BaseTool):
    """Build a comprehensive event profile combining KG, summaries, and vector search."""

    name: str = "get_event_profile"
    description: str = (
        "Get a comprehensive event profile: attributes, participants, timeline context, "
        "relevant passages, and chapter summary. USE for 'What happened in X?' or "
        "'Tell me about event X' queries. "
        "DO NOT USE for deep causal analysis (use analyze_event). "
        "Input: event ID (UUID)."
    )
    args_schema: Type[GetEventProfileInput] = GetEventProfileInput

    kg_service: Any = None
    doc_service: Any = None
    vector_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, event_id: str) -> str:
        # 1. Resolve event (sequential — subsequent steps depend on it)
        event = await self.kg_service.get_event(event_id)
        if event is None:
            return handle_not_found(event_id)

        profile: dict[str, Any] = {"event": format_event(event)}

        # 2. Parallel data gathering (4 tasks)
        async def resolve_participants() -> list[dict[str, Any]]:
            if not event.participants:
                return []
            results = await asyncio.gather(
                *(self.kg_service.get_entity(pid) for pid in event.participants),
                return_exceptions=True,
            )
            participants = []
            for r in results:
                if isinstance(r, Exception):
                    logger.warning("GetEventProfileTool: participant resolve failed: %s", r)
                    continue
                if r is None:
                    continue
                participants.append({
                    "id": r.id,
                    "name": r.name,
                    "entity_type": r.entity_type.value if hasattr(r.entity_type, "value") else str(r.entity_type),
                    "description": r.description,
                })
            return participants

        async def get_timeline_context() -> list[dict[str, Any]]:
            if not event.participants:
                return []
            timelines = await asyncio.gather(
                *(self.kg_service.get_entity_timeline(pid) for pid in event.participants),
                return_exceptions=True,
            )
            seen_ids: set[str] = set()
            merged: list[Any] = []
            for tl in timelines:
                if isinstance(tl, Exception):
                    logger.warning("GetEventProfileTool: timeline fetch failed: %s", tl)
                    continue
                for evt in tl:
                    if evt.id == event_id or evt.id in seen_ids:
                        continue
                    seen_ids.add(evt.id)
                    merged.append(evt)
            merged.sort(key=lambda e: e.chapter)
            return [
                {
                    "id": e.id,
                    "title": e.title,
                    "chapter": e.chapter,
                    "event_type": e.event_type.value if hasattr(e.event_type, "value") else str(e.event_type),
                }
                for e in merged[:20]
            ]

        async def get_passages() -> list:
            if self.vector_service is None:
                return []
            return await self.vector_service.search(query_text=event.title, top_k=5)

        async def get_chapter_summary() -> str | None:
            if self.doc_service is None:
                return None
            return await self.doc_service.get_chapter_summary(
                document_id=event.document_id,
                chapter_number=event.chapter,
            )

        participants_r, timeline_r, passages_r, summary_r = await asyncio.gather(
            resolve_participants(),
            get_timeline_context(),
            get_passages(),
            get_chapter_summary(),
            return_exceptions=True,
        )

        if isinstance(participants_r, Exception):
            logger.warning("GetEventProfileTool: participants failed: %s", participants_r)
            profile["participants"] = []
        else:
            profile["participants"] = participants_r

        if isinstance(timeline_r, Exception):
            logger.warning("GetEventProfileTool: timeline failed: %s", timeline_r)
            profile["timeline_context"] = []
        else:
            profile["timeline_context"] = timeline_r

        if isinstance(passages_r, Exception):
            logger.warning("GetEventProfileTool: passages failed: %s", passages_r)
            profile["relevant_passages"] = []
        else:
            profile["relevant_passages"] = passages_r

        if isinstance(summary_r, Exception):
            logger.warning("GetEventProfileTool: chapter summary failed: %s", summary_r)
            profile["chapter_summary"] = None
        else:
            profile["chapter_summary"] = summary_r

        return json.dumps(profile, ensure_ascii=False, indent=2, default=_json_default)

    def _run(self, event_id: str) -> str:
        return asyncio.get_event_loop().run_until_complete(self._arun(event_id))
