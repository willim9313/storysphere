"""GenerateInsightTool — single LLM call to generate an analytical insight.

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

_SYSTEM_PROMPT = """\
You are a literary analysis expert. Given a topic and supporting context from
a novel's knowledge graph and text, generate a concise, insightful observation.

Guidelines:
- Be specific and reference the provided context.
- Keep the insight to 2-4 sentences.
- Focus on literary significance, thematic meaning, or narrative implications.
- If the context is insufficient, state what additional information would help.
"""


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

    llm: Any = None  # LangChain BaseChatModel, injected

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, topic: str, context: str = "") -> str:
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = self._resolve_llm()
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Topic: {topic}\n\nContext:\n{context}" if context
                else f"Topic: {topic}\n\n(No additional context provided.)"
            ),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return format_tool_output({"topic": topic, "insight": content})

    def _run(self, topic: str, context: str = "") -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(topic, context))

    def _resolve_llm(self):
        if self.llm is not None:
            return self.llm
        from core.llm_client import get_llm_client
        return get_llm_client().get_primary(temperature=0.3)
