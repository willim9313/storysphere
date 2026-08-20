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

from storysphere.domain.documents import Document
from storysphere.pipelines.base import BasePipeline

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
        from storysphere.services.imagery_extractor import ImageryExtractor  # noqa: PLC0415
        from storysphere.services.symbol_service import SymbolService  # noqa: PLC0415

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
            # Paragraph anchoring is deliberately *not* done here — it needs the
            # synonym clusters, which only exist after every chapter is in.
            for item in chapter_items:
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
        anchored = self._anchor_extractions(doc, raw_extractions, clusters)
        entities, occurrences = await self._extractor.build_imagery_entities(
            raw_extractions=anchored,
            book_id=doc.id,
            clusters=clusters,
        )
        # A term whose every occurrence failed to anchor has no evidence left to
        # show, and an imagery the reader cannot trace back to the text is the
        # very failure this change exists to remove (B-079).
        entities = [e for e in entities if e.frequency > 0]

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

    def _anchor_extractions(
        self, doc: Document, raw_extractions: list[dict], clusters: list
    ) -> list[dict]:
        """Attach a real paragraph to each extraction, dropping those with none.

        Runs after clustering rather than during extraction because the cluster
        is where a term's other surface forms live, and roughly one occurrence in
        ten is only findable under one of those.

        Dropping is the point: an occurrence with no paragraph behind it used to
        be handed the chapter's first paragraph instead, which is how a fifth of
        the evidence sent to the interpretation LLM came to be about something
        else entirely (B-079).
        """
        chapters = {c.number: c for c in doc.chapters}

        forms_by_term: dict[str, list[str]] = {}
        for cluster in clusters:
            forms = [cluster.canonical_term, *cluster.variants]
            for form in forms:
                forms_by_term[form] = forms

        anchored: list[dict] = []
        for ex in raw_extractions:
            term = ex.get("term", "")
            chapter = chapters.get(ex.get("chapter_number", 0))
            if chapter is None:
                logger.warning(
                    "Imagery %r names chapter %s, which this book does not have",
                    term, ex.get("chapter_number"),
                )
                continue

            aliases = [f for f in forms_by_term.get(term, []) if f != term]
            hit = self._find_anchor(
                chapter, term, aliases, ex.get("context_sentence", "")
            )
            if hit is None:
                logger.warning(
                    "Dropping imagery %r in chapter %s: no paragraph contains it "
                    "or any of its %d alias(es)",
                    term, chapter.number, len(aliases),
                )
                continue

            ex["paragraph_id"], ex["position"] = hit
            anchored.append(ex)

        return anchored

    @staticmethod
    def _find_anchor(
        chapter, term: str, aliases: list[str], context_sentence: str
    ) -> tuple[str, int] | None:
        """Locate *term* in *chapter*; return ``(paragraph_id, position)`` or None.

        The term is the anchor, not ``context_sentence`` — the sentence comes
        from the LLM and is under no obligation to quote the book, so matching on
        it fails whenever the model paraphrases. It still earns its keep as a
        tiebreaker when several paragraphs carry the term.
        """
        candidates = [p for p in chapter.paragraphs if term and term in p.text]
        if not candidates:
            candidates = [
                p
                for p in chapter.paragraphs
                if any(alias and alias in p.text for alias in aliases)
            ]
        if not candidates:
            return None

        if len(candidates) > 1 and context_sentence:
            snippet = context_sentence[:80]
            narrowed = [p for p in candidates if snippet in p.text]
            if narrowed:
                candidates = narrowed
            else:
                logger.debug(
                    "Imagery %r appears in %d paragraphs of chapter %s and the "
                    "context sentence matched none; taking the earliest",
                    term, len(candidates), chapter.number,
                )

        chosen = candidates[0]
        return chosen.id, chosen.position

    @staticmethod
    def _find_co_occurring(chapter, term: str, context_sentence: str) -> list[str]:
        """Return other imagery-like noun tokens from the same paragraph."""
        # Simple heuristic: just return empty list here; full co-occurrence
        # analysis is done by SymbolGraphService on demand.
        return []
