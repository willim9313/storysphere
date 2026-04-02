"""NarrativeService — Kernel/Satellite classification and narrative structure — B-033/B-034/B-035.

Phase 1 (B-033):
  classify_by_heuristic(document_id) — uses summary hierarchy as proxy for importance
  get_kernel_spine(document_id)       — returns kernel events sorted by narrative position

Phase 2 (B-034):
  refine_with_llm(document_id)        — LLM refinement of low-confidence classifications

Phase 3 (B-035):
  map_hero_journey(document_id)       — Campbell 12-stage structure mapping

Persistence via AnalysisCache:
  narrative_structure:{document_id}
  hero_journey:{document_id}
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config.hero_journey import get_hero_journey_summary, load_hero_journey
from core.token_callback import set_llm_service_context
from core.utils.output_extractor import extract_json_from_text
from domain.events import Event
from domain.narrative import HeroJourneyStage, KernelSatelliteResult, NarrativeStructure

if TYPE_CHECKING:
    from services.analysis_cache import AnalysisCache
    from services.document_service import DocumentService
    from services.kg_service import KGService

logger = logging.getLogger(__name__)

_CACHE_KEY_PREFIX = "narrative_structure"
_HERO_JOURNEY_CACHE_PREFIX = "hero_journey"

# Heuristic confidence threshold below which LLM refinement is triggered
_REFINEMENT_CONFIDENCE_THRESHOLD = 0.70

_HERO_JOURNEY_SYSTEM_PROMPT = """\
You are a literary scholar applying Campbell's Hero's Journey framework to a novel.

Map the provided chapter summaries to the 12 stages of the Hero's Journey.

Rules:
- Each stage maps to one or more chapters (chapter_range is a list of chapter numbers).
- Stages must appear in order, but chapter ranges may overlap between adjacent stages.
- Not every stage needs to be present — omit stages that have no clear textual evidence.
- Refusal of the Call and Meeting the Mentor are often brief or implied; mark them only if
  there is clear evidence in the summaries.
- For ensemble/multi-protagonist works: map the collective journey as a single arc,
  noting in the "notes" field if a specific character primarily embodies that stage.
- Confidence reflects how clearly the summaries support the mapping (0.0–1.0).

You will receive:
- CHAPTER SUMMARIES: numbered list of chapter summaries
- HERO'S JOURNEY STAGES: stage definitions with ids, names, and narrative functions

Return ONLY a JSON array. Each element must have:
  "stage_id": str           # One of the provided stage ids
  "chapter_range": [int]    # Chapter numbers for this stage (can overlap with adjacent stages)
  "confidence": float       # 0.0–1.0
  "notes": str | null       # Optional: specific characters, evidence, or caveats
"""

_REFINE_SYSTEM_PROMPT = """\
You are a narratologist applying Chatman's story/discourse distinction to classify plot events.

Classify the TARGET EVENT as KERNEL or SATELLITE.

Definitions:
- KERNEL: A hinge point in the plot. If removed, the causal chain breaks — subsequent events
  cannot occur or lose their meaning. Kernels open or close alternatives in the narrative.
- SATELLITE: An expansion or decoration. If removed, the story still makes sense.
  Satellites elaborate kernels but do not advance the core plot logic.

You will receive:
- TARGET EVENT: the event to classify (title, type, description, significance, emotional context)
- ADJACENT EVENTS: up to 2 events immediately before and after (for causal chain context)
- CHAPTER SUMMARY: broader context for the chapter

Core question: "If the target event were deleted, would the narrative cause-and-effect chain break?"

Return ONLY a JSON object with:
  "classification": "kernel" | "satellite"
  "confidence": float (0.0–1.0)
  "reasoning": str (1–2 sentences explaining the causal chain logic)
"""


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

    # ── Phase 2: LLM refinement ───────────────────────────────────────────────

    async def refine_with_llm(
        self,
        document_id: str,
        event_ids: Optional[list[str]] = None,
        language: str = "en",
        force: bool = False,
    ) -> NarrativeStructure:
        """Phase 2: LLM refinement of low-confidence heuristic classifications.

        By default refines events whose heuristic confidence is below
        _REFINEMENT_CONFIDENCE_THRESHOLD (satellite classifications, which are
        the most likely to be misclassified chapter-level kernels).

        Args:
            document_id: Book document ID.
            event_ids: Explicit list of event IDs to refine. If None, refines
                all satellite events (heuristic has the lowest confidence there).
            language: LLM output language for reasoning field.
            force: Re-classify even if already llm_classified.

        Conflict resolution:
            If LLM disagrees with the heuristic, LLM wins.
            Divergences are logged at WARNING level for human review.

        Returns:
            Updated NarrativeStructure persisted to cache.
        """
        # Ensure heuristic has run first
        all_events = await self._kg.get_events(document_id=document_id)
        all_unclassified = all(e.narrative_weight == "unclassified" for e in all_events)
        if all_unclassified and all_events:
            await self.classify_by_heuristic(document_id)
            all_events = await self._kg.get_events(document_id=document_id)

        # Build event lookup and sorted order for adjacency
        event_by_id: dict[str, Event] = {e.id: e for e in all_events}
        sorted_events = sorted(
            all_events, key=lambda e: (e.chapter, e.narrative_position or 0)
        )
        sorted_ids = [e.id for e in sorted_events]

        # Determine which events to refine
        if event_ids is not None:
            targets = [event_by_id[eid] for eid in event_ids if eid in event_by_id]
        else:
            # Default: refine satellites (most likely to be misclassified)
            targets = [
                e for e in all_events
                if e.narrative_weight == "satellite"
                and (force or e.narrative_weight_source != "llm_classified")
            ]

        if not targets:
            logger.info("refine_with_llm: no events to refine for document=%s", document_id)
        else:
            logger.info(
                "refine_with_llm: refining %d events for document=%s",
                len(targets),
                document_id,
            )

        for event in targets:
            prev_event, next_event = self._get_adjacent(event.id, sorted_ids, event_by_id)
            chapter_summary = await self._doc.get_chapter_summary(document_id, event.chapter)
            try:
                result = await self._call_refine_llm(
                    event=event,
                    prev_event=prev_event,
                    next_event=next_event,
                    chapter_summary=chapter_summary,
                    language=language,
                )
                prior = event.narrative_weight
                event.narrative_weight = result.narrative_weight
                event.narrative_weight_source = "llm_classified"
                if prior != result.narrative_weight:
                    logger.warning(
                        "refine_with_llm: divergence on event=%s heuristic=%s llm=%s reason=%r",
                        event.id,
                        prior,
                        result.narrative_weight,
                        result.reasoning,
                    )
            except Exception:
                logger.exception("refine_with_llm: failed for event=%s, keeping heuristic", event.id)

        # Rebuild and persist NarrativeStructure
        refreshed = await self._kg.get_events(document_id=document_id)
        kernel_ids = [e.id for e in refreshed if e.narrative_weight == "kernel"]
        satellite_ids = [e.id for e in refreshed if e.narrative_weight == "satellite"]
        unclassified_ids = [e.id for e in refreshed if e.narrative_weight == "unclassified"]

        structure = NarrativeStructure(
            document_id=document_id,
            kernel_event_ids=kernel_ids,
            satellite_event_ids=satellite_ids,
            unclassified_event_ids=unclassified_ids,
            classification_source="llm_classified",
        )
        cache_key = f"{_CACHE_KEY_PREFIX}:{document_id}"
        await self._cache.set(cache_key, structure.model_dump())
        return structure

    @staticmethod
    def _get_adjacent(
        event_id: str,
        sorted_ids: list[str],
        event_by_id: dict[str, Event],
    ) -> tuple[Optional[Event], Optional[Event]]:
        """Return the (previous, next) events in narrative order."""
        try:
            idx = sorted_ids.index(event_id)
        except ValueError:
            return None, None
        prev_event = event_by_id.get(sorted_ids[idx - 1]) if idx > 0 else None
        next_event = event_by_id.get(sorted_ids[idx + 1]) if idx < len(sorted_ids) - 1 else None
        return prev_event, next_event

    # ── LLM helpers ──────────────────────────────────────────────────────────

    def _get_llm(self):
        from core.llm_client import get_llm_client  # noqa: PLC0415

        return get_llm_client().get_with_local_fallback(temperature=0.2)

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_refine_llm(
        self,
        event: Event,
        prev_event: Optional[Event],
        next_event: Optional[Event],
        chapter_summary: Optional[str],
        language: str,
    ) -> KernelSatelliteResult:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        human_content = self._build_refine_human_content(
            event, prev_event, next_event, chapter_summary
        )
        system_prompt = self._localize_prompt(_REFINE_SYSTEM_PROMPT, language)

        llm = self._get_llm()
        set_llm_service_context("analysis")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ])
        raw = response.content if hasattr(response, "content") else str(response)
        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"NarrativeService refine: LLM parse failed: {err!r}")

        classification = parsed.get("classification", "").lower()
        if classification not in ("kernel", "satellite"):
            raise ValueError(f"NarrativeService refine: unexpected classification={classification!r}")

        return KernelSatelliteResult(
            event_id=event.id,
            narrative_weight=classification,  # type: ignore[arg-type]
            confidence=float(parsed.get("confidence", 0.7)),
            reasoning=parsed.get("reasoning"),
        )

    @staticmethod
    def _build_refine_human_content(
        event: Event,
        prev_event: Optional[Event],
        next_event: Optional[Event],
        chapter_summary: Optional[str],
    ) -> str:
        lines = [
            "## TARGET EVENT",
            f"Title: {event.title}",
            f"Type: {event.event_type}",
            f"Chapter: {event.chapter}",
            f"Description: {event.description}",
        ]
        if event.significance:
            lines.append(f"Significance: {event.significance}")
        if event.emotional_intensity is not None:
            lines.append(f"Emotional intensity: {event.emotional_intensity:.2f}")
        if event.consequences:
            lines.append(f"Consequences: {'; '.join(event.consequences)}")

        if prev_event:
            lines += [
                "",
                "## PREVIOUS EVENT (context)",
                f"Title: {prev_event.title}",
                f"Description: {prev_event.description}",
            ]
        if next_event:
            lines += [
                "",
                "## NEXT EVENT (context)",
                f"Title: {next_event.title}",
                f"Description: {next_event.description}",
            ]
        if chapter_summary:
            lines += [
                "",
                "## CHAPTER SUMMARY",
                chapter_summary,
            ]
        return "\n".join(lines)

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        if language.lower().startswith("zh"):
            return prompt + "\n\nRespond with all text fields in Traditional Chinese."
        if language.lower().startswith("ja"):
            return prompt + "\n\nRespond with all text fields in Japanese."
        return prompt

    # ── Phase 3: Hero's Journey mapping ──────────────────────────────────────

    async def map_hero_journey(
        self,
        document_id: str,
        language: str = "en",
        force: bool = False,
    ) -> list[HeroJourneyStage]:
        """Phase 3: Map chapter summaries to Campbell's 12 Hero's Journey stages.

        Design decisions:
        - Chapter ranges may overlap between adjacent stages.
        - Stages with no clear evidence are omitted from the result.
        - Multi-protagonist works are mapped as a single collective arc;
          specific character mappings are noted in the 'notes' field.

        Args:
            document_id: Book document ID.
            language: LLM output language for stage notes.
            force: Re-run even if cached result exists.

        Returns:
            List of HeroJourneyStage (only stages with evidence, in order).
            Also persisted to cache and merged into NarrativeStructure.
        """
        cache_key = f"{_HERO_JOURNEY_CACHE_PREFIX}:{document_id}"
        if not force:
            cached = await self._cache.get(cache_key)
            if cached:
                return [HeroJourneyStage(**s) for s in cached]

        doc = await self._doc.get_document(document_id)
        if not doc or not doc.chapters:
            logger.warning("map_hero_journey: no chapters found for document=%s", document_id)
            return []

        chapters_with_summary = [ch for ch in doc.chapters if ch.summary]
        if not chapters_with_summary:
            logger.warning("map_hero_journey: no chapter summaries for document=%s", document_id)
            return []

        stages = await self._call_hero_journey_llm(chapters_with_summary, language)

        # Persist stages list
        await self._cache.set(cache_key, [s.model_dump() for s in stages])

        # Merge into NarrativeStructure if it exists
        ns_key = f"{_CACHE_KEY_PREFIX}:{document_id}"
        cached_ns = await self._cache.get(ns_key)
        if cached_ns:
            ns = NarrativeStructure(**cached_ns)
            ns.hero_journey_stages = stages
            await self._cache.set(ns_key, ns.model_dump())

        logger.info(
            "map_hero_journey: document=%s mapped %d stages", document_id, len(stages)
        )
        return stages

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_hero_journey_llm(self, chapters, language: str) -> list[HeroJourneyStage]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        stage_defs = load_hero_journey(language if language.startswith(("en", "zh")) else "en")
        stage_summary = get_hero_journey_summary(
            language if language.startswith(("en", "zh")) else "en"
        )
        human_content = self._build_hero_journey_human_content(chapters, stage_summary)
        system_prompt = self._localize_prompt(_HERO_JOURNEY_SYSTEM_PROMPT, language)

        llm = self._get_llm()
        set_llm_service_context("analysis")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ])
        raw = response.content if hasattr(response, "content") else str(response)
        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(f"NarrativeService hero journey: LLM parse failed: {err!r}")

        valid_ids = {s["id"] for s in stage_defs}
        stage_name_by_id = {s["id"]: s["name"] for s in stage_defs}
        stages: list[HeroJourneyStage] = []
        for item in parsed:
            stage_id = item.get("stage_id", "")
            if stage_id not in valid_ids:
                logger.warning("map_hero_journey: unknown stage_id=%r, skipping", stage_id)
                continue
            chapter_range = item.get("chapter_range", [])
            if not isinstance(chapter_range, list) or not chapter_range:
                logger.warning("map_hero_journey: empty chapter_range for stage=%s, skipping", stage_id)
                continue
            stages.append(HeroJourneyStage(
                stage_id=stage_id,
                stage_name=stage_name_by_id[stage_id],
                chapter_range=[int(c) for c in chapter_range],
                confidence=float(item.get("confidence", 0.5)),
                notes=item.get("notes"),
            ))

        # Sort by first chapter in range to ensure narrative order
        stages.sort(key=lambda s: s.chapter_range[0])
        return stages

    @staticmethod
    def _build_hero_journey_human_content(chapters, stage_summary: str) -> str:
        lines = ["## CHAPTER SUMMARIES"]
        for ch in chapters:
            lines.append(f"\n### Chapter {ch.number}" + (f": {ch.title}" if ch.title else ""))
            lines.append(ch.summary or "(no summary)")
        lines += [
            "",
            "## HERO'S JOURNEY STAGES",
            stage_summary,
        ]
        return "\n".join(lines)
