"""Knowledge graph pipeline: Document → Entities + Relations + Events → KG."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from domain.documents import Document
from domain.entities import Entity
from domain.events import Event
from domain.relations import Relation
from pipelines.base import BasePipeline

from .entity_extractor import EntityExtractor
from .entity_linker import EntityLinker
from .relation_extractor import RelationExtractor

logger = logging.getLogger(__name__)


@dataclass
class KGExtractionResult:
    """Output of the knowledge graph pipeline."""

    entities: list[Entity] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)


class KnowledgeGraphPipeline(BasePipeline[Document, KGExtractionResult]):
    """Three-step KG builder: extract entities → deduplicate → extract relations/events.

    Steps per chapter:
        1. ``EntityExtractor`` → raw entities from LLM.
        2. ``EntityLinker``    → deduplicate all entities across chapters.
        3. ``RelationExtractor`` → relations + events per chapter.

    The full document is processed chapter-by-chapter sequentially to keep
    LLM token usage predictable.
    """

    def __init__(
        self,
        entity_extractor: EntityExtractor | None = None,
        relation_extractor: RelationExtractor | None = None,
        entity_linker: EntityLinker | None = None,
        kg_service=None,
    ) -> None:
        self._entity_extractor = entity_extractor or EntityExtractor()
        self._relation_extractor = relation_extractor or RelationExtractor()
        self._entity_linker = entity_linker or EntityLinker()
        self._kg_service = kg_service  # optional KGService; pass None to skip write

    async def run(self, input_data: Document) -> KGExtractionResult:
        """Extract KG data from all chapters in the document.

        Args:
            input_data: Fully processed ``Document`` (with paragraphs).

        Returns:
            ``KGExtractionResult`` with all extracted entities, relations, events.
        """
        doc = input_data
        all_raw_entities: list[Entity] = []
        chapter_texts: dict[int, str] = {}

        # ── Step 1: extract entities per chapter ────────────────────────────
        for chapter in doc.chapters:
            text = "\n\n".join(p.text for p in chapter.paragraphs)
            if not text.strip():
                continue
            chapter_texts[chapter.number] = text
            self._log_step("entity_extract", chapter=chapter.number)
            chapter_entities = await self._entity_extractor.extract(text, chapter.number)
            # Track per-chapter mention counts heuristically
            for entity in chapter_entities:
                entity.mention_count = text.lower().count(entity.name.lower())
            all_raw_entities.extend(chapter_entities)

        # ── Step 2: deduplicate across chapters ─────────────────────────────
        self._log_step("entity_link", raw=len(all_raw_entities))
        unique_entities = await asyncio.get_event_loop().run_in_executor(
            None, self._entity_linker.link, all_raw_entities
        )

        # Build lookup by name and alias for relation extraction
        name_to_entity: dict[str, Entity] = {}
        for entity in unique_entities:
            name_to_entity[entity.name] = entity
            for alias in entity.aliases:
                name_to_entity.setdefault(alias, entity)

        # ── Step 3: extract relations + events per chapter ──────────────────
        all_relations: list[Relation] = []
        all_events: list[Event] = []

        for chapter in doc.chapters:
            text = chapter_texts.get(chapter.number, "")
            if not text:
                continue
            # Use only entities that appear in this chapter
            chapter_entities = [
                e
                for e in unique_entities
                if e.first_appearance_chapter is not None
                and e.first_appearance_chapter <= chapter.number
            ]
            self._log_step("relation_extract", chapter=chapter.number)
            relations, events = await self._relation_extractor.extract(
                text, chapter_entities, chapter.number
            )
            all_relations.extend(relations)
            all_events.extend(events)

        result = KGExtractionResult(
            entities=unique_entities,
            relations=all_relations,
            events=all_events,
        )

        # ── Step 4 (optional): persist to KGService ─────────────────────────
        if self._kg_service is not None:
            await self._persist_to_kg(result)

        logger.info(
            "KGPipeline done: entities=%d  relations=%d  events=%d",
            len(result.entities),
            len(result.relations),
            len(result.events),
        )
        return result

    # ── Persistence ──────────────────────────────────────────────────────────

    async def _persist_to_kg(self, result: KGExtractionResult) -> None:
        for entity in result.entities:
            await self._kg_service.add_entity(entity)
        for relation in result.relations:
            await self._kg_service.add_relation(relation)
        for event in result.events:
            await self._kg_service.add_event(event)
        logger.info("KGPipeline persisted to KGService")
