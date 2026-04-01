"""GetGlobalTimelineTool — full book event timeline.

USE when: the user asks about the overall story timeline, all
    events in chronological order, or the full event sequence.
DO NOT USE when: the user asks about a single entity's timeline
    (use GetEntityTimelineTool) or a single event (use
    AnalyzeEventTool).
Example queries: "Show the full timeline.", "What is the
    chronological order of all events?", "Story timeline."
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_event, format_tool_output
from tools.schemas import GlobalTimelineInput


class GetGlobalTimelineTool(BaseTool):
    """Return the global event timeline for a book."""

    name: str = "get_global_timeline"
    description: str = (
        "Get the global event timeline for a book, sorted "
        "by story chronology or narrative order. "
        "USE for: full story timeline, event sequence. "
        "DO NOT USE for: single entity timeline. "
        "Input: document_id, optional order ('chronological' (default) or 'narrative')."
    )
    args_schema: Type[GlobalTimelineInput] = GlobalTimelineInput

    kg_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        document_id: str,
        order: str = "chronological",
    ) -> str:
        events = await self.kg_service.get_events(
            document_id=document_id
        )
        if not events:
            return "No events found for this document."

        if order == "chronological":
            events.sort(
                key=lambda e: (
                    e.chronological_rank
                    if e.chronological_rank is not None
                    else float("inf"),
                    e.chapter,
                )
            )
        else:
            events.sort(key=lambda e: e.chapter)

        return format_tool_output(
            [format_event(e) for e in events]
        )

    def _run(
        self,
        document_id: str,
        order: str = "chronological",
    ) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(
            self._arun(document_id, order)
        )
