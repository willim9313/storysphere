"""AnalysisService — LLM-based literary analysis.

Owns the LLM logic for generating insights (and future character/event
analysis in Phase 5).  Tools delegate to this service.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


_INSIGHT_SYSTEM_PROMPT = """\
You are a literary analysis expert. Given a topic and supporting context from
a novel's knowledge graph and text, generate a concise, insightful observation.

Guidelines:
- Be specific and reference the provided context.
- Keep the insight to 2-4 sentences.
- Focus on literary significance, thematic meaning, or narrative implications.
- If the context is insufficient, state what additional information would help.
"""


class AnalysisService:
    """Generate literary analysis insights via LLM."""

    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_primary(temperature=0.3)
        return self._llm

    async def generate_insight(self, topic: str, context: str = "") -> str:
        """Generate a literary insight for the given topic.

        Args:
            topic: The question or theme to analyze.
            context: Supporting data (entity info, passages, etc.).

        Returns:
            The generated insight text.
        """
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        messages = [
            SystemMessage(content=_INSIGHT_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Topic: {topic}\n\nContext:\n{context}" if context
                else f"Topic: {topic}\n\n(No additional context provided.)"
            ),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        logger.info("AnalysisService: generated insight for topic=%r  len=%d", topic, len(content))
        return content
