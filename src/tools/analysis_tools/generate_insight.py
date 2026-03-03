"""GenerateInsightTool — delegates to AnalysisService for LLM insight generation.

USE when: the user asks for interpretation, thematic analysis, or wants
    AI-generated commentary on a topic with supporting context.
DO NOT USE when: the user wants raw data (use graph/retrieval tools) or
    deep character/event analysis (use AnalyzeCharacter/AnalyzeEventTool).
Example queries: "What is the theme of the novel?",
    "Analyze the significance of this passage.", "Give me an insight about betrayal."
"""

from __future__ import annotations

import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_tool_output
from tools.schemas import GenerateInsightInput

logger = logging.getLogger(__name__)


class GenerateInsightTool(BaseTool):
    """Generate a single analytical insight using an LLM call."""

    name: str = "generate_insight"
    description: str = (
        "Generate an AI-powered literary insight about a given topic, "
        "using provided context (entity data, relations, passages). "
        "Makes a single LLM call. "
        "USE for: thematic analysis, interpretation, commentary with context. "
        "DO NOT USE for: raw data retrieval or deep multi-step analysis. "
        "Input: topic (the question/theme) and context (supporting data)."
    )
    args_schema: Type[GenerateInsightInput] = GenerateInsightInput

    analysis_service: Any = None  # AnalysisService instance, injected

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, topic: str, context: str = "") -> str:
        svc = self._resolve_service()
        insight = await svc.generate_insight(topic, context)
        return format_tool_output({"topic": topic, "insight": insight})

    def _run(self, topic: str, context: str = "") -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(topic, context))

    def _resolve_service(self):
        if self.analysis_service is not None:
            return self.analysis_service
        from services.analysis_service import AnalysisService
        return AnalysisService()
