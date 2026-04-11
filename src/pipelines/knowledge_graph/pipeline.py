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
from .paragraph_entity_linker import ParagraphEntityLinker
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

    Steps:
        1. ``EntityExtractor`` → raw entities per **paragraph** (keeps each
           LLM call small enough for local models).
        2. ``EntityLinker``    → deduplicate all entities across paragraphs.
        3. ``RelationExtractor`` → relations + events per chapter (needs
           broader context than a single paragraph).

    Processing is paragraph-by-paragraph for entity extraction so that even
    very long chapters don't produce oversized LLM responses.
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
        self._paragraph_entity_linker = ParagraphEntityLinker()
        self._kg_service = kg_service  # optional KGService; pass None to skip write

    async def run(self, input_data: Document, *, sub_cb=None) -> KGExtractionResult:
        """Extract KG data from all chapters in the document.

        Args:
            input_data: Fully processed ``Document`` (with paragraphs).

        Returns:
            ``KGExtractionResult`` with all extracted entities, relations, events.
        """
        doc = input_data
        all_raw_entities: list[Entity] = []
        # chapter_texts holds full text per chapter for the relation/event pass.
        # Entries are pop()-ed after use so already-processed chapters are
        # released to the GC rather than accumulating for the whole run.
        chapter_texts: dict[int, str] = {}
        chapters_with_content = [
            ch for ch in doc.chapters
            if any(p.text.strip() for p in ch.paragraphs)
        ]
        total_chapters = len(chapters_with_content)
        chapters_done = 0

        if sub_cb:
            sub_cb(0, total_chapters, "實體抽取")

        # ── Step 1: extract entities per paragraph ──────────────────────────
        # Paragraph-level extraction keeps each LLM call small, avoiding
        # truncation issues on long chapters with local models.
        for chapter in doc.chapters:
            chapter_text = "\n\n".join(p.text for p in chapter.paragraphs)
            if not chapter_text.strip():
                continue
            chapter_texts[chapter.number] = chapter_text

            for para in chapter.paragraphs:
                if not para.text.strip():
                    continue
                self._log_step(
                    "entity_extract",
                    chapter=chapter.number,
                    para=para.position,
                )
                para_entities = await self._entity_extractor.extract(
                    para.text, chapter.number, language=doc.language
                )
                # Count mentions across the full chapter text for context
                for entity in para_entities:
                    entity.mention_count = chapter_text.lower().count(
                        entity.name.lower()
                    )
                all_raw_entities.extend(para_entities)

            chapters_done += 1
            if sub_cb:
                sub_cb(chapters_done, total_chapters, "實體抽取")

        # ── Step 2: deduplicate across chapters ─────────────────────────────
        self._log_step("entity_link", raw=len(all_raw_entities))
        unique_entities = await asyncio.get_running_loop().run_in_executor(
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
        rel_done = 0

        if sub_cb:
            sub_cb(0, total_chapters, "關係抽取")

        for chapter in doc.chapters:
            # pop() releases the chapter string once relation/event extraction
            # is done — the dict shrinks as we progress through the book.
            text = chapter_texts.pop(chapter.number, "")
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
                text, chapter_entities, chapter.number, language=doc.language
            )
            all_relations.extend(relations)
            all_events.extend(events)
            rel_done += 1
            if sub_cb:
                sub_cb(rel_done, total_chapters, "關係抽取")

        # ── Step 3.5: link entities to paragraphs ─────────────────────────────
        self._log_step("paragraph_entity_link")
        self._paragraph_entity_linker.link(doc, unique_entities)

        result = KGExtractionResult(
            entities=unique_entities,
            relations=all_relations,
            events=all_events,
        )

        # ── Step 4 (optional): persist to KGService ─────────────────────────
        if self._kg_service is not None:
            await self._persist_to_kg(result, document_id=doc.id)

        logger.info(
            "KGPipeline done: entities=%d  relations=%d  events=%d",
            len(result.entities),
            len(result.relations),
            len(result.events),
        )
        return result

    # ── Persistence ──────────────────────────────────────────────────────────

    async def _persist_to_kg(
        self, result: KGExtractionResult, document_id: str | None = None
    ) -> None:
        for entity in result.entities:
            if document_id:
                entity.document_id = document_id
            await self._kg_service.add_entity(entity)
        for relation in result.relations:
            if document_id:
                relation.document_id = document_id
            await self._kg_service.add_relation(relation)
        for event in result.events:
            if document_id:
                event.document_id = document_id
            await self._kg_service.add_event(event)
        logger.info("KGPipeline persisted to KGService")
