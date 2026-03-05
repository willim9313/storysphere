"""GetEntityProfileTool — comprehensive entity dossier.

USE when: the user wants a full profile of a character, location, or org.
Combines: entity attributes + first appearance summary + relevant passages.
DO NOT USE when: user just wants quick attribute lookup (use get_entity_attributes).
Example queries: "Who is Elizabeth Bennet?", "Tell me everything about London."
"""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.base import format_entity, handle_not_found
from tools.schemas import GetEntityProfileInput


class GetEntityProfileTool(BaseTool):
    """Build a comprehensive entity profile combining KG, summaries, and vector search."""

    name: str = "get_entity_profile"
    description: str = (
        "Get a comprehensive entity profile: attributes, first appearance context, "
        "and relevant passages. USE for 'Who is X?' or 'Tell me about X' queries. "
        "DO NOT USE for relationship questions (use get_entity_relationship). "
        "Input: entity ID or name."
    )
    args_schema: Type[GetEntityProfileInput] = GetEntityProfileInput

    kg_service: Any = None
    doc_service: Any = None
    vector_service: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(self, entity_id: str) -> str:
        # 1. Resolve entity
        entity = await self.kg_service.get_entity(entity_id)
        if entity is None:
            entity = await self.kg_service.get_entity_by_name(entity_id)
        if entity is None:
            return handle_not_found(entity_id)

        profile: dict[str, Any] = {"entity": format_entity(entity)}

        # 2. First appearance summary (best-effort)
        if self.doc_service is not None and entity.first_appearance_chapter:
            try:
                summary = await self.doc_service.get_chapter_summary(
                    document_id=None,
                    chapter_number=entity.first_appearance_chapter,
                )
                profile["first_appearance_summary"] = summary
            except Exception:
                profile["first_appearance_summary"] = None

        # 3. Related passages via vector search (best-effort)
        if self.vector_service is not None:
            try:
                passages = await self.vector_service.search(
                    query_text=entity.name, top_k=3
                )
                profile["relevant_passages"] = passages
            except Exception:
                profile["relevant_passages"] = []

        # 4. Relations summary
        try:
            relations = await self.kg_service.get_relations(entity.id)
            profile["relation_count"] = len(relations)
            profile["relation_types"] = list(
                {r.relation_type.value if hasattr(r.relation_type, "value") else str(r.relation_type) for r in relations}
            )
        except Exception:
            profile["relation_count"] = 0
            profile["relation_types"] = []

        return json.dumps(profile, ensure_ascii=False, indent=2, default=str)

    def _run(self, entity_id: str) -> str:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(self._arun(entity_id))
