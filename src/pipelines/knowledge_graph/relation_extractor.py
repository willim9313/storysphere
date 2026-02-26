"""LLM-based relation and event extraction.

Given a chapter text and the entities already identified in that chapter,
the LLM returns relations between entities *and* significant plot events.
Both are validated with Pydantic and retried on failure (ADR-007).
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field, ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from domain.entities import Entity
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from pipelines.knowledge_graph.entity_extractor import _parse_json_response  # noqa: F401

logger = logging.getLogger(__name__)


# ── Pydantic schemas for LLM output ─────────────────────────────────────────


class _RawRelation(BaseModel):
    source_name: str
    target_name: str
    relation_type: str = "other"
    description: str | None = None
    weight: float = 0.5
    is_bidirectional: bool = False


class _RawEvent(BaseModel):
    title: str
    event_type: str = "other"
    description: str
    participants: list[str] = Field(default_factory=list)
    significance: str | None = None
    consequences: list[str] = Field(default_factory=list)


class _ExtractionResult(BaseModel):
    relations: list[_RawRelation] = Field(default_factory=list)
    events: list[_RawEvent] = Field(default_factory=list)


# ── Extractor ────────────────────────────────────────────────────────────────


_SYSTEM_PROMPT = """\
You are a literary analysis system.  Given a chapter text and the list of
named entities already identified in that chapter, extract:

1. RELATIONS between pairs of entities.
2. Significant EVENTS that occur in the chapter.

Return ONLY a JSON object with two keys:

"relations": list of objects with:
  - "source_name"      (str)   Name of the source entity.
  - "target_name"      (str)   Name of the target entity.
  - "relation_type"    (str)   One of: family, friendship, romance, enemy, ally,
                               subordinate, located_in, member_of, owns, other.
  - "description"      (str|null)
  - "weight"           (float, 0.0–1.0)  Strength of the relationship.
  - "is_bidirectional" (bool)  True if the relationship applies both ways.

"events": list of objects with:
  - "title"         (str)
  - "event_type"    (str)  One of: plot, conflict, revelation, turning_point,
                           meeting, battle, death, romance, alliance, other.
  - "description"   (str)
  - "participants"  (list[str])  Entity names involved.
  - "significance"  (str|null)
  - "consequences"  (list[str])

Only extract relations between entities in the provided entity list.
"""


class RelationExtractor:
    """Extract relations and events from a chapter using a structured LLM call."""

    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_primary(temperature=0.0)
        return self._llm

    async def extract(
        self,
        text: str,
        entities: list[Entity],
        chapter_number: int,
    ) -> tuple[list[Relation], list[Event]]:
        """Extract relations and events for a chapter.

        Args:
            text: Chapter text (concatenated paragraphs).
            entities: Entities already identified in this chapter.
            chapter_number: Used to populate relation/event chapter fields.

        Returns:
            Tuple of (relations, events).
        """
        if not text.strip() or not entities:
            return [], []

        entity_names = [e.name for e in entities]
        raw = await self._call_llm_with_retry(text, entity_names)

        name_to_id = {e.name: e.id for e in entities}
        relations = self._parse_relations(raw.relations, name_to_id, chapter_number)
        events = self._parse_events(raw.events, name_to_id, chapter_number)

        logger.info(
            "RelationExtractor: chapter=%d  relations=%d  events=%d",
            chapter_number,
            len(relations),
            len(events),
        )
        return relations, events

    # ── LLM call ─────────────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ValidationError, json.JSONDecodeError, ValueError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm_with_retry(
        self, text: str, entity_names: list[str]
    ) -> _ExtractionResult:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        entity_list_str = "\n".join(f"- {name}" for name in entity_names)
        user_content = (
            f"Entities in this chapter:\n{entity_list_str}\n\n"
            f"Chapter text:\n\n{text[:8000]}"
        )
        llm = self._get_llm()
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return _parse_extraction_response(content)

    # ── Parsing ──────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_relations(
        raw_relations: list[_RawRelation],
        name_to_id: dict[str, str],
        chapter_number: int,
    ) -> list[Relation]:
        relations: list[Relation] = []
        for raw in raw_relations:
            src_id = name_to_id.get(raw.source_name)
            tgt_id = name_to_id.get(raw.target_name)
            if not src_id or not tgt_id:
                logger.debug("Skipping relation — unknown entity: %s or %s", raw.source_name, raw.target_name)
                continue
            try:
                rtype = RelationType(raw.relation_type.lower())
            except ValueError:
                rtype = RelationType.OTHER
            relations.append(
                Relation(
                    source_id=src_id,
                    target_id=tgt_id,
                    relation_type=rtype,
                    description=raw.description,
                    weight=max(0.0, min(1.0, raw.weight)),
                    chapters=[chapter_number],
                    is_bidirectional=raw.is_bidirectional,
                )
            )
        return relations

    @staticmethod
    def _parse_events(
        raw_events: list[_RawEvent],
        name_to_id: dict[str, str],
        chapter_number: int,
    ) -> list[Event]:
        events: list[Event] = []
        for raw in raw_events:
            try:
                etype = EventType(raw.event_type.lower())
            except ValueError:
                etype = EventType.OTHER
            participant_ids = [
                name_to_id[name] for name in raw.participants if name in name_to_id
            ]
            events.append(
                Event(
                    title=raw.title,
                    event_type=etype,
                    description=raw.description,
                    chapter=chapter_number,
                    participants=participant_ids,
                    significance=raw.significance,
                    consequences=raw.consequences,
                )
            )
        return events


# ── JSON parser ──────────────────────────────────────────────────────────────


def _parse_extraction_response(content: str) -> _ExtractionResult:
    content = content.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        content = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()
    data = json.loads(content)
    return _ExtractionResult.model_validate(data)
