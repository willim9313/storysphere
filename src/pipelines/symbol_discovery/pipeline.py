"""Symbol discovery pipeline — imagery extraction and persistence.

Follows KnowledgeGraphPipeline conventions:
- BasePipeline[Document, SymbolDiscoveryResult]
- @dataclass result type
- Sequential chapter processing (no asyncio.gather — rate limiting)
- Re-ingest safe: delete_by_book() before extraction
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from domain.documents import Document
from pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


@dataclass
class SymbolDiscoveryResult:
    """Output of the symbol discovery pipeline."""

    book_id: str
    imagery_count: int = 0
    occurrence_count: int = 0
    errors: list[str] = field(default_factory=list)


class SymbolDiscoveryPipeline(BasePipeline[Document, SymbolDiscoveryResult]):
    """Extract symbolic imagery from a document and persist to SQLite.

    Chapters are processed sequentially to respect LLM rate limits.
    Running on an already-ingested book is safe: existing records are
    deleted before extraction begins.
    """

    def __init__(
        self,
        imagery_extractor=None,
        symbol_service=None,
    ) -> None:
        from services.imagery_extractor import ImageryExtractor  # noqa: PLC0415
        from services.symbol_service import SymbolService  # noqa: PLC0415

        self._extractor = imagery_extractor or ImageryExtractor()
        self._symbol_service = symbol_service or SymbolService()

    async def run(self, input_data: Document, *, sub_cb=None, murmur_cb=None) -> SymbolDiscoveryResult:
        """Run imagery extraction and persist results for a document.

        Args:
            input_data: Fully processed Document with chapters and paragraphs.

        Returns:
            SymbolDiscoveryResult with counts of extracted entities/occurrences.
        """
        doc = input_data
        result = SymbolDiscoveryResult(book_id=doc.id)

        # Clear any prior data for this book (re-ingest safety)
        await self._symbol_service.delete_by_book(doc.id)

        # Extract imagery from all chapters sequentially
        try:
            raw_extractions = await self._extract_all_chapters(doc, sub_cb=sub_cb)
        except Exception as exc:  # noqa: BLE001
            logger.error("Imagery extraction failed for book %s: %s", doc.id, exc)
            result.errors.append(f"extraction: {exc}")
            return result

        if not raw_extractions:
            logger.info("No imagery found for book %s", doc.id)
            return result

        # Cluster and persist
        try:
            imagery_count, occurrence_count = await self._build_and_persist(
                doc, raw_extractions, murmur_cb=murmur_cb
            )
            result.imagery_count = imagery_count
            result.occurrence_count = occurrence_count
        except Exception as exc:  # noqa: BLE001
            logger.error("Imagery persistence failed for book %s: %s", doc.id, exc)
            result.errors.append(f"persistence: {exc}")

        logger.info(
            "SymbolDiscoveryPipeline done: book=%s imagery=%d occurrences=%d",
            doc.id,
            result.imagery_count,
            result.occurrence_count,
        )
        return result

    async def _extract_all_chapters(self, doc: Document, sub_cb=None) -> list[dict]:
        """Extract imagery from every chapter sequentially."""
        all_raw: list[dict] = []
        total = len(doc.chapters)

        if sub_cb:
            sub_cb(0, total, "章節符號")

        for i, chapter in enumerate(doc.chapters):
            chapter_text = "\n".join(p.text for p in chapter.paragraphs)
            self._log_step("extract_chapter", chapter=chapter.number)
            chapter_items = await self._extractor.extract_chapter_imagery(
                chapter_text=chapter_text,
                chapter_number=chapter.number,
                language=doc.language,
            )
            if sub_cb:
                sub_cb(i + 1, total, "章節符號")
            # Enrich with paragraph-level metadata
            for item in chapter_items:
                item["paragraph_id"] = self._find_paragraph_id(
                    chapter, item.get("context_sentence", "")
                )
                item["position"] = self._find_position(
                    chapter, item.get("context_sentence", "")
                )
                item["co_occurring_terms"] = self._find_co_occurring(
                    chapter, item.get("term", ""), item.get("context_sentence", "")
                )
            all_raw.extend(chapter_items)
        return all_raw

    async def _build_and_persist(
        self, doc: Document, raw_extractions: list[dict], *, murmur_cb=None
    ) -> tuple[int, int]:
        """Cluster synonyms, build domain objects, and write to SQLite."""
        terms = [ex.get("term", "") for ex in raw_extractions if ex.get("term")]
        clusters = await self._extractor.cluster_synonyms(terms)
        entities, occurrences = await self._extractor.build_imagery_entities(
            raw_extractions=raw_extractions,
            book_id=doc.id,
            clusters=clusters,
        )

        for entity in entities:
            await self._symbol_service.save_imagery(entity)
            if murmur_cb:
                try:
                    await murmur_cb(
                        "symbolExploration", "symbol",
                        getattr(entity, "term", str(entity)),
                        meta={"occurrences": len(occurrences)},
                    )
                except Exception:  # noqa: BLE001
                    pass
        for occ in occurrences:
            await self._symbol_service.save_occurrence(occ)

        return len(entities), len(occurrences)

    # ── private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _find_paragraph_id(chapter, context_sentence: str) -> str:
        """Return the id of the paragraph most likely containing the context."""
        if not context_sentence:
            return chapter.paragraphs[0].id if chapter.paragraphs else ""
        snippet = context_sentence[:80]
        for para in chapter.paragraphs:
            if snippet in para.text:
                return para.id
        return chapter.paragraphs[0].id if chapter.paragraphs else ""

    @staticmethod
    def _find_position(chapter, context_sentence: str) -> int:
        """Return 0-based paragraph position most likely containing the context."""
        if not context_sentence:
            return 0
        snippet = context_sentence[:80]
        for para in chapter.paragraphs:
            if snippet in para.text:
                return para.position
        return 0

    @staticmethod
    def _find_co_occurring(chapter, term: str, context_sentence: str) -> list[str]:
        """Return other imagery-like noun tokens from the same paragraph."""
        # Simple heuristic: just return empty list here; full co-occurrence
        # analysis is done by SymbolGraphService on demand.
        return []
