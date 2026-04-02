"""NarrativeService — Kernel/Satellite classification and narrative structure — B-033.

Phase 1 (this file):
  classify_by_heuristic(document_id) — uses summary hierarchy as proxy for importance
  get_kernel_spine(document_id)       — returns kernel events sorted by narrative position

Phase 2 (B-034):
  refine_with_llm(event_ids)          — LLM refinement of uncertain classifications

Phase 3 (B-035):
  map_hero_journey(document_id)       — Campbell 12-stage structure mapping

Persistence via AnalysisCache:
  narrative_structure:{document_id}
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from domain.events import Event
from domain.narrative import KernelSatelliteResult, NarrativeStructure

if TYPE_CHECKING:
    from services.analysis_cache import AnalysisCache
    from services.document_service import DocumentService
    from services.kg_service import KGService

logger = logging.getLogger(__name__)

_CACHE_KEY_PREFIX = "narrative_structure"


class NarrativeService:
    """Narrative structure analysis: Kernel/Satellite classification + Hero's Journey."""

    def __init__(
        self,
        kg_service: "KGService",
        document_service: "DocumentService",
        cache: "AnalysisCache",
    ) -> None:
        self._kg = kg_service
        self._doc = document_service
        self._cache = cache

    # ── Phase 1: Heuristic classification ────────────────────────────────────

    async def classify_by_heuristic(self, document_id: str) -> NarrativeStructure:
        """Classify all events for a book using the summary hierarchy heuristic.

        Heuristic rules (in order of precedence):
        1. Event title/significance found in book-level summary  → kernel (confidence 0.85)
        2. Event title/significance found in same-chapter summary → kernel (confidence 0.65)
        3. Not found in any summary                               → satellite (confidence 0.60)

        Side-effect: updates Event.narrative_weight and narrative_weight_source
        directly in KGService's in-memory store.

        Returns:
            NarrativeStructure with classified event ID lists, persisted to cache.
        """
        cache_key = f"{_CACHE_KEY_PREFIX}:{document_id}"
        cached = await self._cache.get(cache_key)
        if cached:
            return NarrativeStructure(**cached)

        events = await self._kg.get_events(document_id=document_id)
        if not events:
            logger.warning("classify_by_heuristic: no events found for document=%s", document_id)
            return NarrativeStructure(document_id=document_id)

        # Fetch document (includes book summary + all chapter summaries)
        doc = await self._doc.get_document(document_id)
        book_summary = (doc.summary or "").lower() if doc else ""
        chapter_summaries: dict[int, str] = {}
        if doc:
            for ch in doc.chapters:
                chapter_summaries[ch.number] = (ch.summary or "").lower()

        results: list[KernelSatelliteResult] = []
        for event in events:
            result = self._classify_event(event, book_summary, chapter_summaries)
            results.append(result)
            # Mutate in-place — events are references to KGService's in-memory objects
            event.narrative_weight = result.narrative_weight
            event.narrative_weight_source = "summary_heuristic"

        kernel_ids = [r.event_id for r in results if r.narrative_weight == "kernel"]
        satellite_ids = [r.event_id for r in results if r.narrative_weight == "satellite"]
        unclassified_ids = [r.event_id for r in results if r.narrative_weight == "unclassified"]

        logger.info(
            "classify_by_heuristic: document=%s kernel=%d satellite=%d unclassified=%d",
            document_id,
            len(kernel_ids),
            len(satellite_ids),
            len(unclassified_ids),
        )

        structure = NarrativeStructure(
            document_id=document_id,
            kernel_event_ids=kernel_ids,
            satellite_event_ids=satellite_ids,
            unclassified_event_ids=unclassified_ids,
            classification_source="summary_heuristic",
        )
        await self._cache.set(cache_key, structure.model_dump())
        return structure

    def _classify_event(
        self,
        event: Event,
        book_summary: str,
        chapter_summaries: dict[int, str],
    ) -> KernelSatelliteResult:
        """Classify a single event via text matching against summary levels."""
        # Build search terms from event title and significance
        # Only use terms longer than 3 chars to avoid noise from short words
        terms: list[str] = []
        if event.title and len(event.title.strip()) > 3:
            terms.append(event.title.strip().lower())
        if event.significance and len(event.significance.strip()) > 3:
            # Use first 80 chars of significance to avoid over-matching
            terms.append(event.significance.strip().lower()[:80])

        if not terms:
            return KernelSatelliteResult(
                event_id=event.id,
                narrative_weight="unclassified",
                confidence=0.0,
                reasoning="Event has no title or significance to match against",
            )

        # Rule 1: found in book-level summary → strong kernel signal
        if book_summary and any(term in book_summary for term in terms):
            return KernelSatelliteResult(
                event_id=event.id,
                narrative_weight="kernel",
                confidence=0.85,
                reasoning="Event found in book-level summary",
            )

        # Rule 2: found in chapter summary → moderate kernel signal
        chapter_summary = chapter_summaries.get(event.chapter, "")
        if chapter_summary and any(term in chapter_summary for term in terms):
            return KernelSatelliteResult(
                event_id=event.id,
                narrative_weight="kernel",
                confidence=0.65,
                reasoning="Event found in chapter summary",
            )

        # Rule 3: not found anywhere → satellite
        return KernelSatelliteResult(
            event_id=event.id,
            narrative_weight="satellite",
            confidence=0.60,
            reasoning="Event not found in book or chapter summary",
        )

    # ── Kernel spine query ────────────────────────────────────────────────────

    async def get_kernel_spine(self, document_id: str) -> list[Event]:
        """Return kernel events (plot spine) sorted by chapter then narrative position.

        If events have not been classified yet, runs classify_by_heuristic first.
        """
        events = await self._kg.get_events(document_id=document_id)

        # Auto-classify if no events have been classified yet
        all_unclassified = all(e.narrative_weight == "unclassified" for e in events)
        if all_unclassified and events:
            await self.classify_by_heuristic(document_id)
            events = await self._kg.get_events(document_id=document_id)

        kernels = [e for e in events if e.narrative_weight == "kernel"]
        return sorted(kernels, key=lambda e: (e.chapter, e.narrative_position or 0))
