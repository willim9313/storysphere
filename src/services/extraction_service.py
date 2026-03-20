"""ExtractionService — LLM-based entity, relation, and event extraction.

Consolidates the LLM extraction capabilities from the former
EntityExtractor and RelationExtractor pipeline classes.  Pipelines and
tools delegate to this service.

Uses tenacity retry (3 attempts, exponential backoff).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType

logger = logging.getLogger(__name__)


# -- Pydantic schemas for entity extraction LLM output -----------------------


class _RawEntity(BaseModel):
    """Schema for a single entity as returned by the LLM."""

    name: str
    entity_type: str = "other"
    aliases: list[str] = Field(default_factory=list)
    description: str | None = None
    attributes: dict[str, Any] | None = Field(default_factory=dict)

    @field_validator("aliases", mode="before")
    @classmethod
    def _coerce_aliases(cls, v: Any) -> list:
        return v if isinstance(v, list) else []

    @field_validator("attributes", mode="before")
    @classmethod
    def _coerce_attributes(cls, v: Any) -> dict:
        return v if isinstance(v, dict) else {}


class _EntityList(BaseModel):
    entities: list[_RawEntity] = Field(default_factory=list)


# -- Pydantic schemas for relation/event extraction LLM output ---------------


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

    @field_validator("participants", "consequences", mode="before")
    @classmethod
    def _coerce_list(cls, v: Any) -> list:
        return v if isinstance(v, list) else []


class _ExtractionResult(BaseModel):
    relations: list[_RawRelation] = Field(default_factory=list)
    events: list[_RawEvent] = Field(default_factory=list)


# -- Prompts -----------------------------------------------------------------


_ENTITY_SYSTEM_PROMPT = """\
You are a literary NER system.  Extract all named entities from the provided
novel chapter text.

Return ONLY a JSON object with the key "entities" whose value is a list.
Each element must have:
  - "name"        (str)            The canonical name as it appears in the text.
  - "entity_type" (str)            One of: character, location, organization,
                                   object, concept, other.
  - "aliases"     (list[str])      Other names or titles for the same entity.
  - "description" (str | null)     A one-sentence description.
  - "attributes"  (dict)           Any notable attributes (age, gender, role…).

Do NOT include pronouns or generic nouns.  Only include specific named things.
"""

_RELATION_SYSTEM_PROMPT = """\
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


# -- Service -----------------------------------------------------------------


class ExtractionService:
    """Extract entities, relations, and events from text via LLM."""

    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.0)
        return self._llm

    # -- Entity extraction ---------------------------------------------------

    async def extract_entities(
        self, text: str, chapter_number: int, language: str = "en"
    ) -> list[Entity]:
        """Extract entities from a chapter text string.

        Args:
            text: Chapter text (may be the concatenation of all paragraphs).
            chapter_number: Used to populate ``Entity.first_appearance_chapter``.
            language: ISO 639-1 code for response language.

        Returns:
            List of ``Entity`` objects (IDs auto-generated by Pydantic).
        """
        if not text.strip():
            return []

        raw_list = await self._call_entity_llm(text, language)
        entities = self._parse_entities(raw_list, chapter_number)
        logger.info(
            "ExtractionService: chapter=%d  extracted=%d entities",
            chapter_number,
            len(entities),
        )
        return entities

    # -- Relation / event extraction -----------------------------------------

    async def extract_relations(
        self,
        text: str,
        entities: list[Entity],
        chapter_number: int,
        language: str = "en",
    ) -> tuple[list[Relation], list[Event]]:
        """Extract relations and events for a chapter.

        Args:
            text: Chapter text (concatenated paragraphs).
            entities: Entities already identified in this chapter.
            chapter_number: Used to populate relation/event chapter fields.
            language: ISO 639-1 code for response language.

        Returns:
            Tuple of (relations, events).
        """
        if not text.strip() or not entities:
            return [], []

        entity_names = [e.name for e in entities]
        raw = await self._call_relation_llm(text, entity_names, language)

        name_to_id = {e.name: e.id for e in entities}
        relations = self._parse_relations(raw.relations, name_to_id, chapter_number)
        events = self._parse_events(raw.events, name_to_id, chapter_number)

        logger.info(
            "ExtractionService: chapter=%d  relations=%d  events=%d",
            chapter_number,
            len(relations),
            len(events),
        )
        return relations, events

    # -- LLM calls with retry -----------------------------------------------

    @retry(
        retry=retry_if_exception_type((ValidationError, json.JSONDecodeError, ValueError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_entity_llm(self, text: str, language: str = "en") -> _EntityList:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        from core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        prompt = (
            _ENTITY_SYSTEM_PROMPT
            + f"\nAll descriptions must be written in {lang_name}."
        )
        llm = self._get_llm()
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Chapter text:\n\n{text[:8000]}"),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return _parse_json_response(content)

    @retry(
        retry=retry_if_exception_type((ValidationError, json.JSONDecodeError, ValueError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_relation_llm(
        self, text: str, entity_names: list[str], language: str = "en"
    ) -> _ExtractionResult:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        from core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        prompt = (
            _RELATION_SYSTEM_PROMPT
            + f"\nAll descriptions must be written in {lang_name}."
        )
        entity_list_str = "\n".join(f"- {name}" for name in entity_names)
        user_content = (
            f"Entities in this chapter:\n{entity_list_str}\n\n"
            f"Chapter text:\n\n{text[:8000]}"
        )
        llm = self._get_llm()
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=user_content),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return _parse_extraction_response(content)

    # -- Parsing helpers -----------------------------------------------------

    @staticmethod
    def _parse_entities(raw_list: _EntityList, chapter_number: int) -> list[Entity]:
        entities: list[Entity] = []
        for raw in raw_list.entities:
            try:
                etype = EntityType(raw.entity_type.lower())
            except ValueError:
                etype = EntityType.OTHER
            entities.append(
                Entity(
                    name=raw.name,
                    entity_type=etype,
                    aliases=raw.aliases,
                    description=raw.description,
                    attributes=raw.attributes,
                    first_appearance_chapter=chapter_number,
                )
            )
        return entities

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
                logger.debug(
                    "Skipping relation — unknown entity: %s or %s",
                    raw.source_name,
                    raw.target_name,
                )
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


# -- Shared JSON parsers (also used by pipeline shims) -----------------------


def _strip_markdown_fences(content: str) -> str:
    """Remove ```json ... ``` fences if present."""
    content = content.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        content = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()
    return content


def _loads_with_repair(content: str) -> Any:
    """Try json.loads first; fall back to json_repair.loads on failure."""
    try:
        return json.loads(content)
    except ValueError:
        try:
            from json_repair import loads as repair_loads  # noqa: PLC0415

            logger.debug("json.loads failed — retrying with json_repair")
            return repair_loads(content)
        except Exception as exc:
            raise ValueError(f"JSON repair also failed: {exc}") from exc


def _parse_json_response(content: str) -> _EntityList:
    """Extract JSON from LLM text (may be wrapped in markdown fences)."""
    content = _strip_markdown_fences(content)
    data = _loads_with_repair(content)
    return _EntityList.model_validate(data)


def _parse_extraction_response(content: str) -> _ExtractionResult:
    content = _strip_markdown_fences(content)
    data = _loads_with_repair(content)
    return _ExtractionResult.model_validate(data)
