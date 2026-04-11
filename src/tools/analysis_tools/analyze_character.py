"""AnalyzeCharacterTool — deep character analysis via AnalysisAgent.

USE when: the user wants a comprehensive character analysis covering
    personality, relationships, arc, and motivations.
DO NOT USE when: the user only wants basic entity attributes
    (use GetEntityAttributesTool) or a simple timeline
    (use GetEntityTimelineTool).
Example queries: "Analyze Alice as a character.", "Deep dive into Bob's arc.",
    "Character study of the protagonist."
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.schemas import AnalyzeCharacterInput

logger = logging.getLogger(__name__)


class AnalyzeCharacterTool(BaseTool):
    """Deep character analysis — delegates to AnalysisAgent."""

    name: str = "analyze_character"
    description: str = (
        "Perform comprehensive character analysis covering personality traits, "
        "relationships, character arc, and archetype classification. "
        "USE for: deep character studies, 'analyze X as a character'. "
        "DO NOT USE for: basic entity info (use get_entity_attributes) "
        "or simple timeline (use get_entity_timeline). "
        "Input: entity name, document_id, optional archetype frameworks."
    )
    args_schema: Type[AnalyzeCharacterInput] = AnalyzeCharacterInput

    analysis_agent: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        entity_id: str,
        document_id: str = "",
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
    ) -> str:
        if self.analysis_agent is None:
            return json.dumps({"error": "AnalysisAgent not configured."})

        try:
            result = await self.analysis_agent.analyze_character(
                entity_name=entity_id,
                document_id=document_id,
                archetype_frameworks=archetype_frameworks,
                language=language,
            )

            output = {
                "entity_id": result.entity_id,
                "entity_name": result.entity_name,
                "document_id": result.document_id,
                "summary": result.profile.summary,
                "actions": result.cep.actions,
                "traits": result.cep.traits,
                "relations": result.cep.relations,
                "archetypes": [a.model_dump() for a in result.archetypes],
                "arc": [s.model_dump() for s in result.arc],
                "coverage_gaps": result.coverage.gaps,
            }
            return json.dumps(output, ensure_ascii=False, default=str)
        except Exception as e:
            logger.error("AnalyzeCharacterTool failed: %s", e, exc_info=True)
            return json.dumps({"error": str(e)})

    def _run(
        self,
        entity_id: str,
        document_id: str = "",
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
    ) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(entity_id, document_id, archetype_frameworks, language)
        )
