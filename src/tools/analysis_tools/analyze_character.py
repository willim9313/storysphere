"""AnalyzeCharacterTool — deep character analysis (STUB — Phase 5).

USE when: the user wants a comprehensive character analysis covering
    personality, relationships, arc, and motivations.
DO NOT USE when: the user only wants basic entity attributes
    (use GetEntityAttributesTool) or a simple timeline
    (use GetEntityTimelineTool).
Example queries: "Analyze Alice as a character.", "Deep dive into Bob's arc.",
    "Character study of the protagonist."

This is a STUB: the full implementation requires domain knowledge
and multi-step LLM reasoning (Phase 5).
"""

from __future__ import annotations

from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.schemas import AnalyzeCharacterInput, CharacterAnalysisOutput

_SYSTEM_PROMPT_TEMPLATE = """\
You are a literary critic performing deep character analysis.

Character: {character_name}
Analysis aspects: {aspects}

Instructions:
1. Examine the character's personality traits based on actions and dialogue.
2. Map key relationships and how they evolve.
3. Trace the character arc from introduction to current state.
4. Identify core motivations and how they drive the plot.

Return a structured JSON matching this schema:
{output_schema}

Base your analysis on the following knowledge graph data and text passages:
{context}
"""


class AnalyzeCharacterTool(BaseTool):
    """Deep character analysis — STUB (Phase 5: needs domain knowledge)."""

    name: str = "analyze_character"
    description: str = (
        "Perform comprehensive character analysis covering personality traits, "
        "relationships, character arc, and motivations. "
        "USE for: deep character studies, 'analyze X as a character'. "
        "DO NOT USE for: basic entity info (use get_entity_attributes) "
        "or simple timeline (use get_entity_timeline). "
        "Input: entity ID/name, optional analysis aspects. "
        "NOTE: This tool is under development and may return limited results."
    )
    args_schema: Type[AnalyzeCharacterInput] = AnalyzeCharacterInput

    kg_service: Any = None
    llm: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str, aspects: list[str] | None = None) -> str:
        raise NotImplementedError(
            "Phase 5: AnalyzeCharacterTool requires domain knowledge integration. "
            "Use get_entity_attributes + get_entity_timeline + generate_insight "
            "as a workaround."
        )

    def _run(self, entity_id: str, aspects: list[str] | None = None) -> str:
        raise NotImplementedError(
            "Phase 5: AnalyzeCharacterTool requires domain knowledge integration."
        )
