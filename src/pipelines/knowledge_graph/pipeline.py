"""Knowledge graph pipeline: Document → Entities + Relations + Events → KG."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from domain.documents import Document, extract_body_text
from domain.entities import Entity
from domain.events import Event, EventType
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

    # entity_type → murmur type mapping
    _ENTITY_TYPE_MAP: dict[str, str] = {
        "character": "character",
        "person": "character",
        "location": "location",
        "place": "location",
        "organization": "org",
        "org": "org",
        "event": "event",
        "object": "topic",
        "concept": "topic",
    }

    async def run(self, input_data: Document, *, sub_cb=None, murmur_cb=None) -> KGExtractionResult:
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
            if any(extract_body_text(p) for p in ch.paragraphs)
        ]
        total_chapters = len(chapters_with_content)
        chapters_done = 0

        if sub_cb:
            sub_cb(0, total_chapters, "實體抽取")

        # ── Step 1: extract entities per paragraph ──────────────────────────
        # Paragraph-level extraction keeps each LLM call small, avoiding
        # truncation issues on long chapters with local models.
        for chapter in doc.chapters:
            # Only process body paragraphs; separators carry no narrative content.
            body_texts_ch = [
                (p, extract_body_text(p))
                for p in chapter.paragraphs
            ]
            body_texts_ch = [(p, t) for p, t in body_texts_ch if t]
            chapter_text = "\n\n".join(t for _, t in body_texts_ch)
            if not chapter_text.strip():
                continue
            chapter_texts[chapter.number] = chapter_text

            for para, body_text in body_texts_ch:
                self._log_step(
                    "entity_extract",
                    chapter=chapter.number,
                    para=para.position,
                )
                para_entities = await self._entity_extractor.extract(
                    body_text, chapter.number, language=doc.language
                )
                # Count mentions across the full chapter text for context
                for entity in para_entities:
                    entity.mention_count = chapter_text.lower().count(
                        entity.name.lower()
                    )
                    if murmur_cb:
                        try:
                            murmur_type = self._ENTITY_TYPE_MAP.get(
                                str(getattr(entity, "entity_type", "")).lower(), "topic"
                            )
                            role = getattr(entity, "role", None) or getattr(entity, "description", None)
                            await murmur_cb(
                                "featureExtraction", murmur_type, entity.name,
                                meta={
                                    "chapter": chapter.number,
                                    **({"role": str(role)[:80]} if role else {}),
                                },
                            )
                        except Exception:  # noqa: BLE001
                            pass
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

        self._fill_relation_valid_to(all_relations)
        self._fill_entity_valid_to(unique_entities, all_events)

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

    # ── Timeline post-processing ─────────────────────────────────────────────

    @staticmethod
    def _fill_relation_valid_to(relations: list[Relation]) -> None:
        """Set valid_to_chapter where a pair's relationship type changes.

        Groups by (source_id, target_id), sorts by valid_from_chapter, and marks
        each phase's end as the next phase's start. Consecutive same-type phases
        are merged (duplicates dropped).
        """
        from collections import defaultdict  # noqa: PLC0415

        pair_map: dict[tuple[str, str], list[Relation]] = defaultdict(list)
        for rel in relations:
            pair_map[(rel.source_id, rel.target_id)].append(rel)

        to_remove = KnowledgeGraphPipeline._annotate_relation_phases(pair_map)
        KnowledgeGraphPipeline._remove_merged_relations(relations, to_remove)

    @staticmethod
    def _annotate_relation_phases(
        pair_map: dict[tuple[str, str], list[Relation]],
    ) -> set[int]:
        to_remove: set[int] = set()
        for pair_rels in pair_map.values():
            pair_rels.sort(key=lambda r: r.valid_from_chapter or 0)
            i = 0
            while i < len(pair_rels):
                current = pair_rels[i]
                j = i + 1
                same_type = current.relation_type
                while j < len(pair_rels) and pair_rels[j].relation_type == same_type:
                    to_remove.add(id(pair_rels[j]))
                    j += 1
                if j < len(pair_rels):
                    current.valid_to_chapter = pair_rels[j].valid_from_chapter
                i = j
        return to_remove

    @staticmethod
    def _remove_merged_relations(
        relations: list[Relation], to_remove: set[int]
    ) -> None:
        i = 0
        while i < len(relations):
            if id(relations[i]) in to_remove:
                relations.pop(i)
            else:
                i += 1

    @staticmethod
    def _fill_entity_valid_to(
        entities: list[Entity], events: list[Event]
    ) -> None:
        """Set valid_to_chapter on entities that have a DEATH event.

        valid_to is exclusive — entity absent from chapter after death.
        Multiple death events: the last one wins.
        """
        entity_map = {e.id: e for e in entities}
        for event in events:
            if event.event_type != EventType.DEATH:
                continue
            for entity_id in event.participants:
                entity = entity_map.get(entity_id)
                if entity is None:
                    continue
                new_valid_to = event.chapter + 1
                if (
                    entity.valid_to_chapter is None
                    or new_valid_to > entity.valid_to_chapter
                ):
                    entity.valid_to_chapter = new_valid_to
