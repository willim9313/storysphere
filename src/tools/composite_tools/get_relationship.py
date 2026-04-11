"""GetEntityRelationshipTool — complete relationship info between two entities.

USE when: the user asks about the relationship between two characters/entities.
Combines: entity attrs + relation paths + evidence paragraphs.
Example queries: "What is the relationship between Alice and Bob?"
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import _json_default, format_entity, handle_not_found
from tools.schemas import GetRelationshipInput

logger = logging.getLogger(__name__)


class GetEntityRelationshipTool(BaseTool):
    """Retrieve complete relationship information between two entities."""

    name: str = "get_entity_relationship"
    description: str = (
        "Get the full relationship between two entities: both profiles, "
        "relation paths, and supporting evidence passages. "
        "USE for 'relationship between X and Y' or 'how are X and Y connected' queries. "
        "Input: two entity IDs or names."
    )
    args_schema: Type[GetRelationshipInput] = GetRelationshipInput

    kg_service: Any = None
    doc_service: Any = None
    vector_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _resolve_entity(self, entity_id: str):
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        return entity

    async def _arun(self, entity_a: str, entity_b: str) -> str:
        # 1. Resolve both entities in parallel
        e1_r, e2_r = await asyncio.gather(
            self._resolve_entity(entity_a),
            self._resolve_entity(entity_b),
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
            "entity_a": format_entity(e1),
            "entity_b": format_entity(e2),
        }

        # 2+3. Relation paths and evidence passages — run in parallel
        async def get_paths() -> list:
            return await self.kg_service.get_relation_paths(e1.id, e2.id, max_length=3)

        async def get_passages() -> list:
            if self.vector_service is None:
                return []
            query = f"{e1.name} {e2.name}"
            return await self.vector_service.search(query_text=query, top_k=3)

        paths_r, passages_r = await asyncio.gather(
            get_paths(),
            get_passages(),
            return_exceptions=True,
        )

        if isinstance(paths_r, Exception):
            logger.warning("GetEntityRelationshipTool: paths fetch failed: %s", paths_r)
            result["paths"] = []
            result["path_count"] = 0
        else:
            result["paths"] = paths_r
            result["path_count"] = len(paths_r)

        if isinstance(passages_r, Exception):
            logger.warning("GetEntityRelationshipTool: passages fetch failed: %s", passages_r)
            result["evidence_passages"] = []
        else:
            result["evidence_passages"] = passages_r

        return json.dumps(result, ensure_ascii=False, indent=2, default=_json_default)

    def _run(self, entity_a: str, entity_b: str) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(
            self._arun(entity_a, entity_b)
        )
