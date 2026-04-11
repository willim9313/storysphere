"""CompareCharactersTool — side-by-side character comparison.

USE when: the user asks to compare two characters.
Combines: both entity profiles + LLM insight on similarities/differences.
Example queries: "Compare Alice and Bob", "Differences between X and Y."
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import _json_default, format_entity, handle_not_found, resolve_entity
from tools.schemas import CompareCharactersInput

logger = logging.getLogger(__name__)


class CompareCharactersTool(BaseTool):
    """Compare two characters side-by-side with LLM-generated analysis."""

    name: str = "compare_characters"
    description: str = (
        "Compare two characters side-by-side with LLM-generated narrative analysis: "
        "profiles, relationship counts, and an LLM insight on similarities, differences, and narrative roles. "
        "USE for 'Compare X and Y' or 'How are X and Y different?' queries (characters, narrative analysis). "
        "For quick pure-data comparison without LLM, use compare_entities instead. "
        "Input: two character entity IDs or names."
    )
    args_schema: Type[CompareCharactersInput] = CompareCharactersInput

    kg_service: Any = None
    vector_service: Any = None
    analysis_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_a: str, entity_b: str) -> str:
        # 1. Resolve both entities in parallel
        e1_r, e2_r = await asyncio.gather(
            resolve_entity(self.kg_service, entity_a),
            resolve_entity(self.kg_service, entity_b),
            return_exceptions=True,
        )

        errors = []
        e1 = None if isinstance(e1_r, Exception) or e1_r is None else e1_r
        e2 = None if isinstance(e2_r, Exception) or e2_r is None else e2_r
        if e1 is None:
            errors.append(f"Entity '{entity_a}' not found.")
        if e2 is None:
            errors.append(f"Entity '{entity_b}' not found.")
        if errors:
            return json.dumps({"error": " ".join(errors)}, ensure_ascii=False)

        result: dict[str, Any] = {
            "character_a": format_entity(e1),
            "character_b": format_entity(e2),
        }

        # 2. Relations for both entities in parallel
        rels_a_r, rels_b_r = await asyncio.gather(
            self.kg_service.get_relations(e1.id),
            self.kg_service.get_relations(e2.id),
            return_exceptions=True,
        )

        if not isinstance(rels_a_r, Exception):
            result["character_a_relation_count"] = len(rels_a_r)
        else:
            logger.warning("CompareCharactersTool: rels_a fetch failed: %s", rels_a_r)
        if not isinstance(rels_b_r, Exception):
            result["character_b_relation_count"] = len(rels_b_r)
        else:
            logger.warning("CompareCharactersTool: rels_b fetch failed: %s", rels_b_r)

        # 3. LLM comparison insight (best-effort)
        if self.analysis_service is not None:
            try:
                context = (
                    f"Character A: {e1.name} — {e1.description}\n"
                    f"Character B: {e2.name} — {e2.description}"
                )
                insight = await self.analysis_service.generate_insight(
                    topic=f"Compare characters {e1.name} and {e2.name}: "
                    f"similarities, differences, and narrative roles",
                    context=context,
                )
                result["comparison_insight"] = insight
            except Exception:
                result["comparison_insight"] = None

        return json.dumps(result, ensure_ascii=False, indent=2, default=_json_default)

    def _run(self, entity_a: str, entity_b: str) -> str:
        return asyncio.get_event_loop().run_until_complete(
            self._arun(entity_a, entity_b)
        )
