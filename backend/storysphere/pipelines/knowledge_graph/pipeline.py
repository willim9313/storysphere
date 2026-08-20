"""Knowledge graph pipeline: Document → Entities + Relations + Events → KG."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from storysphere.core.concurrency import gather_bounded
from storysphere.core.utils.text_matching import squash_spacing
from storysphere.domain.documents import ChapterRole, Document, extract_body_text
from storysphere.domain.entities import Entity
from storysphere.domain.events import Event, EventType
from storysphere.domain.relations import Relation
from storysphere.pipelines.base import BasePipeline

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
        concurrency: int | None = None,
    ) -> None:
        self._entity_extractor = entity_extractor or EntityExtractor()
        self._relation_extractor = relation_extractor or RelationExtractor()
        self._entity_linker = entity_linker or EntityLinker()
        self._paragraph_entity_linker = ParagraphEntityLinker()
        self._kg_service = kg_service  # optional KGService; pass None to skip write
        # None = read settings.ingestion_concurrency at run time, so a config
        # change takes effect without rebuilding the pipeline.
        self._concurrency = concurrency

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

    def _resolve_concurrency(self) -> int:
        """Concurrency for the per-paragraph entity pass.

        Read per run rather than cached at construction so operators can dial
        it back to 1 (sequential) without a code change when a provider starts
        rate-limiting.
        """
        if self._concurrency is not None:
            return self._concurrency
        from storysphere.config.settings import get_settings  # noqa: PLC0415

        return get_settings().ingestion_concurrency

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
        # Only body chapters carry narrative content; front/back matter chapters
        # (toc/preface/afterword/other) are excluded from the knowledge graph.
        chapters_with_content = [
            ch for ch in doc.chapters
            if ch.role == ChapterRole.body
            and any(extract_body_text(p) for p in ch.paragraphs)
        ]
        total_chapters = len(chapters_with_content)
        chapters_done = 0

        if sub_cb:
            sub_cb(0, total_chapters, "實體抽取")

        # ── Step 1: extract entities per paragraph ──────────────────────────
        # Paragraph-level extraction keeps each LLM call small, avoiding
        # truncation issues on long chapters with local models.
        for chapter in doc.chapters:
            if chapter.role != ChapterRole.body:
                continue  # front/back matter — not story content
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
            # Lowered once per chapter, not once per entity: mention counting
            # below runs for every entity of every paragraph, and each call
            # would otherwise copy the whole chapter string.
            #
            # Spacing is squashed for the same reason the lowering is hoisted —
            # once per chapter, not once per entity. pypdf breaks words across
            # lines into `礁 石` and letter-spaces display type, so counting on
            # the raw text silently undercounts (B-083).
            chapter_text_lower = squash_spacing(chapter_text).lower()

            async def _extract(pair, _chapter=chapter):
                para, body_text = pair
                self._log_step(
                    "entity_extract",
                    chapter=_chapter.number,
                    para=para.position,
                )
                return await self._entity_extractor.extract(
                    body_text, _chapter.number, language=doc.language
                )

            per_paragraph = await gather_bounded(
                body_texts_ch, _extract, limit=self._resolve_concurrency()
            )

            # Post-processing stays sequential and in paragraph order: the
            # murmur stream is user-visible, and all_raw_entities order feeds
            # EntityLinker's canonical-name choice. Only the LLM calls above
            # run concurrently.
            for para_entities in per_paragraph:
                # Count mentions across the full chapter text for context
                for entity in para_entities:
                    entity.mention_count = chapter_text_lower.count(
                        squash_spacing(entity.name).lower()
                    )
                    if murmur_cb:
                        try:
                            # EntityType is a (str, Enum) mixin, not a StrEnum:
                            # str(EntityType.LOCATION) is "EntityType.LOCATION",
                            # which matches no key. Read .value for the bare
                            # "location" the map is actually keyed on.
                            entity_type = getattr(entity, "entity_type", "")
                            murmur_type = self._ENTITY_TYPE_MAP.get(
                                str(getattr(entity_type, "value", entity_type)).lower(),
                                "topic",
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
        # Regex-scans every paragraph of the book synchronously — offloaded to
        # the executor for the same reason as the entity linker above, so a
        # long book cannot stall the event loop (and with it progress reporting).
        self._log_step("paragraph_entity_link")
        await asyncio.get_running_loop().run_in_executor(
            None, self._paragraph_entity_linker.link, doc, unique_entities
        )

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
        """Write the extraction to the KG, replacing any previous run's output.

        The clear is what makes a re-run idempotent. ``add_entity`` /
        ``add_relation`` / ``add_event`` all key on the object's own id, and
        that id is a fresh ``uuid4`` every extraction — so without this, a
        second run appends a whole second graph instead of replacing the first.
        Symbol discovery has had the same ``delete_by_book()`` since it was
        written; this is the KG side catching up (B-082).

        On a first ingestion the clear is a no-op.
        """
        if document_id:
            removed = await self._kg_service.remove_by_document(document_id)
            logger.info(
                "KGPipeline cleared prior graph for %s: %s", document_id, removed
            )

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
        # Slice assignment keeps the in-place contract the caller relies on,
        # without list.pop(i) shifting every later element on each removal.
        relations[:] = [r for r in relations if id(r) not in to_remove]

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
