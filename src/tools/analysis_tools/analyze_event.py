"""AnalyzeEventTool — deep event analysis (STUB — Phase 5).

USE when: the user wants a comprehensive analysis of a specific event,
    including causes, consequences, and affected characters.
DO NOT USE when: the user only wants the event timeline
    (use GetEntityTimelineTool) or basic event data.
Example queries: "Analyze the significance of the battle.",
    "What caused the turning point?", "Deep analysis of the meeting event."

This is a STUB: the full implementation requires domain knowledge
and multi-step LLM reasoning (Phase 5).
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.schemas import AnalyzeEventInput, EventAnalysisOutput

_SYSTEM_PROMPT_TEMPLATE = """\
You are a literary analyst performing deep event analysis.

Event: {event_title}
Include consequences: {include_consequences}

Instructions:
1. Analyze the event's significance in the narrative.
2. Trace the causal chain leading to this event.
3. Identify all consequences and ripple effects.
4. List all affected characters and how they were impacted.

Return a structured JSON matching this schema:
{output_schema}

Base your analysis on the following knowledge graph data and text passages:
{context}
"""


class AnalyzeEventTool(BaseTool):
    """Deep event analysis — STUB (Phase 5: needs domain knowledge)."""

    name: str = "analyze_event"
    description: str = (
        "Perform comprehensive event analysis including significance, "
        "cause chain, consequences, and affected characters. "
        "USE for: deep event analysis, 'what caused X', consequence analysis. "
        "DO NOT USE for: event timelines (use get_entity_timeline) "
        "or listing events. "
        "Input: event ID, optional include_consequences flag. "
        "NOTE: This tool is under development and may return limited results."
    )
    args_schema: Type[AnalyzeEventInput] = AnalyzeEventInput

    kg_service: Any = None
    llm: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, event_id: str, include_consequences: bool = True) -> str:
        raise NotImplementedError(
            "Phase 5: AnalyzeEventTool requires domain knowledge integration. "
            "Use get_entity_timeline + generate_insight as a workaround."
        )

    def _run(self, event_id: str, include_consequences: bool = True) -> str:
        raise NotImplementedError(
            "Phase 5: AnalyzeEventTool requires domain knowledge integration."
        )
