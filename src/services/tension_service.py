"""TensionService — TEU assembly and persistence — B-026/B-027/B-028/B-029.

Mode B (single-event trigger) is implemented here.
Mode A (full-book batch) is implemented in B-028.
TensionTheme synthesis is implemented in B-029.

Persistence uses AnalysisCache (SQLite) with key patterns:
    teu:{event_id}
    tension_lines:{document_id}
    tension_theme:{document_id}
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.token_callback import set_llm_service_context
from core.utils.output_extractor import extract_json_from_text
from config.mythos import get_mythos_summary
from domain.entities import EntityType
from domain.tension import TEU, TensionLine, TensionPole, TensionTheme

if TYPE_CHECKING:
    from services.analysis_cache import AnalysisCache
    from services.document_service import DocumentService
    from services.kg_service import KGService

logger = logging.getLogger(__name__)

_ASSEMBLER_TAG = "tension_service_v1"
_GROUPER_TAG = "tension_grouper_v1"
_SYNTHESIZER_TAG = "tension_synthesizer_v1"

_GROUPING_SYSTEM_PROMPT = """\
You are a literary tension analyst. Given a list of Tension Evidence Units (TEUs)
from a novel, group them into recurring tension patterns (TensionLines).

Each TEU has two opposing poles (pole_a, pole_b) and involves characters (carriers).

Rules for grouping:
- Group TEUs that express the same fundamental opposition (same conceptual conflict,
  even if the surface labels differ slightly).
- A TEU may belong to at most one TensionLine.
- Do NOT group TEUs with unrelated oppositions just because they share a character.
- Aim for 2-6 TensionLines per book. Each should have at least 2 TEUs.
- Ungrouped TEUs (too unique to form a pattern) should be omitted.

Return ONLY a JSON array. Each element must have:
  "canonical_pole_a": str      # Canonical label for one side of the tension
  "canonical_pole_b": str      # Canonical label for the opposing side
  "teu_ids": [str]             # IDs of TEUs belonging to this TensionLine
  "thematic_note": str|null    # Optional broader theme this line serves
"""

_TEU_SYSTEM_PROMPT = """\
You are a literary tension analyst. Given evidence about a scene from a novel,
identify the CENTRAL BINARY TENSION — the opposing forces or values in conflict.

You will receive:
- The scene (event) description and emotional context
- The characters involved and their roles
- Relevant abstract concepts (surface and inferred) linked to this scene
- A chapter summary for additional context

Your task: identify TWO opposing poles and describe the tension between them.

Guidelines:
- Each pole is an abstract value, claim, or force (not just a character name).
- A character CARRIES a pole; they are not the pole itself.
- The tension must be specific to this scene, not a generic observation.
- Intensity should reflect the scene's emotional_intensity (provided in input).

Return ONLY a JSON object with:
  "pole_a": {
    "concept_name": str,       # The value/force on one side
    "carrier_names": [str],    # Character names embodying this pole
    "stance": str              # How they embody it (1 sentence)
  }
  "pole_b": {
    "concept_name": str,
    "carrier_names": [str],
    "stance": str
  }
  "tension_description": str   # What is in conflict (1-2 sentences)
  "intensity": float           # 0.0–1.0
  "evidence": [str]            # 1-3 quotations or paraphrases from the scene
  "thematic_note": str | null  # Optional broader theme this serves
"""


_THEME_SYSTEM_PROMPT = """\
You are a literary scholar specializing in narrative theory. Given the recurring tension patterns
(TensionLines) found across a novel, synthesize them into a single book-level thematic proposition
and classify the work using Frye's mythos and Booker's seven basic plots.

You will receive:
- A list of TensionLines (canonical pole labels, intensity, chapter range)
- Frye's four mythoi with descriptions
- Booker's seven basic plots with descriptions

Your task:
1. Write a PROPOSITION — a one or two sentence thematic claim that captures what the book argues
   or reveals through its central tensions. Be specific, not generic (avoid "good vs. evil").
2. Choose the most fitting FRYE MYTHOS (one id from the list provided).
3. Choose the most fitting BOOKER PLOT (one id from the list provided).

Return ONLY a JSON object with:
  "proposition": str        # The book-level thematic claim (1-2 sentences)
  "frye_mythos": str        # The Frye mythos id (e.g. "tragedy")
  "booker_plot": str        # The Booker plot id (e.g. "overcoming_the_monster")
  "reasoning": str          # Brief justification for your choices (2-3 sentences)
"""


class TensionService:
    """Assemble and persist TEUs for tension analysis.

    Args:
        cache: AnalysisCache instance for TEU persistence.
        llm: Optional pre-built LLM client (injected for testing).
    """

    def __init__(self, cache: AnalysisCache, llm=None) -> None:
        self._cache = cache
        self._llm = llm

    # ── Public: Mode B (single-event) ────────────────────────────────────────

    async def assemble_teu(
        self,
        event_id: str,
        document_id: str,
        kg_service: KGService,
        doc_service: DocumentService,
        language: str = "en",
        force: bool = False,
    ) -> TEU:
        """Assemble a TEU for a single event (Mode B).

        Returns cached result if available unless force=True.

        Args:
            event_id: The Event ID to analyse.
            document_id: The book's document ID.
            kg_service: KGService for entity and event retrieval.
            doc_service: DocumentService for chapter summary.
            language: LLM output language.
            force: If True, bypass cache and re-assemble.

        Returns:
            Assembled TEU (not yet persisted — call save_teu() if desired).
        """
        cache_key = f"teu:{event_id}"

        if not force:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.debug("TensionService: cache hit for %s", cache_key)
                return TEU.model_validate(cached)

        # 1. Load event
        event = await kg_service.get_event(event_id)
        if event is None:
            raise ValueError(f"TensionService: event not found: {event_id!r}")

        # 2. Load participant entities (characters)
        characters = []
        for eid in event.participants:
            entity = await kg_service.get_entity(eid)
            if entity is not None:
                characters.append(entity)

        # 3. Load Concept nodes from KG (surface + inferred)
        all_concepts = await kg_service.list_entities(
            entity_type=EntityType.CONCEPT,
            document_id=document_id,
        )

        # 4. Chapter summary for context
        chapter_summary = await doc_service.get_chapter_summary(
            document_id, event.chapter
        )

        # 5. Assemble via LLM
        teu = await self._call_llm(
            event=event,
            characters=characters,
            concepts=all_concepts,
            chapter_summary=chapter_summary,
            document_id=document_id,
            language=language,
        )

        return teu

    async def save_teu(self, teu: TEU) -> None:
        """Persist a TEU to cache."""
        key = f"teu:{teu.event_id}"
        await self._cache.set(key, teu.model_dump(mode="json"))
        logger.debug("TensionService: saved TEU for event=%s", teu.event_id)

    async def get_teu(self, event_id: str) -> TEU | None:
        """Retrieve a cached TEU by event_id, or None if not found/expired."""
        cached = await self._cache.get(f"teu:{event_id}")
        if cached is None:
            return None
        return TEU.model_validate(cached)

    # ── Public: Mode B+ (TensionLine grouping) ────────────────────────────────

    async def group_teus(
        self,
        document_id: str,
        kg_service,
        language: str = "en",
        force: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> list[TensionLine]:
        """Group all cached TEUs for a document into TensionLines (LLM-based).

        Returns cached result unless force=True.
        """
        cache_key = f"tension_lines:{document_id}"
        if not force:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.debug("TensionService: cache hit for %s", cache_key)
                return [TensionLine.model_validate(l) for l in cached["lines"]]

        events = await kg_service.get_events(document_id=document_id)
        teus: list[TEU] = []
        total_events = len(events)
        for idx, event in enumerate(events):
            teu = await self.get_teu(event.id)
            if teu is not None:
                teus.append(teu)
            if progress_callback:
                progress_callback(int((idx + 1) / total_events * 60) if total_events else 0, f"loading TEU {idx + 1}/{total_events}")

        if not teus:
            logger.info("TensionService: no TEUs found for document=%s", document_id)
            return []

        if progress_callback:
            progress_callback(60, "calling LLM for line grouping")
        lines = await self._call_grouping_llm(teus, document_id, language)
        if progress_callback:
            progress_callback(95, "saving tension lines")
        await self.save_lines(lines, document_id)
        return lines

    async def save_lines(self, lines: list[TensionLine], document_id: str) -> None:
        """Persist TensionLines for a document to cache."""
        key = f"tension_lines:{document_id}"
        await self._cache.set(key, {"lines": [l.model_dump(mode="json") for l in lines]})
        logger.debug("TensionService: saved %d TensionLines for document=%s", len(lines), document_id)

    async def get_lines(self, document_id: str) -> list[TensionLine]:
        """Retrieve cached TensionLines for a document, or empty list if none."""
        cached = await self._cache.get(f"tension_lines:{document_id}")
        if not cached:
            return []
        return [TensionLine.model_validate(l) for l in cached["lines"]]

    async def update_line_review(
        self,
        line_id: str,
        document_id: str,
        review_status: str,
        canonical_pole_a: str | None = None,
        canonical_pole_b: str | None = None,
    ) -> TensionLine | None:
        """Update the review_status (and optionally pole labels) of a TensionLine.

        Returns the updated TensionLine, or None if line_id is not found.
        """
        lines = await self.get_lines(document_id)
        for i, line in enumerate(lines):
            if line.id == line_id:
                updates: dict = {"review_status": review_status}
                if canonical_pole_a is not None:
                    updates["canonical_pole_a"] = canonical_pole_a
                if canonical_pole_b is not None:
                    updates["canonical_pole_b"] = canonical_pole_b
                lines[i] = line.model_copy(update=updates)
                await self.save_lines(lines, document_id)
                logger.debug("TensionService: updated review for line=%s status=%s", line_id, review_status)
                return lines[i]
        return None

    # ── Public: TensionTheme synthesis (B-029) ───────────────────────────────

    async def synthesize_theme(
        self,
        document_id: str,
        language: str = "en",
        force: bool = False,
    ) -> TensionTheme:
        """Synthesize a book-level TensionTheme from approved TensionLines.

        Uses all TensionLines if none have been approved yet (graceful fallback).
        Returns cached result unless force=True.

        Args:
            document_id: The book's document ID.
            language: LLM output language.
            force: If True, bypass cache and re-synthesize.

        Returns:
            Synthesized TensionTheme (call save_theme() to persist).
        """
        cache_key = f"tension_theme:{document_id}"

        if not force:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.debug("TensionService: cache hit for %s", cache_key)
                return TensionTheme.model_validate(cached)

        lines = await self.get_lines(document_id)
        if not lines:
            raise ValueError(
                f"TensionService: no TensionLines found for document={document_id!r}. "
                "Run group_teus() first."
            )

        # Prefer reviewed lines; fall back to all lines
        reviewed = [l for l in lines if l.review_status in {"approved", "modified"}]
        input_lines = reviewed if reviewed else lines
        logger.info(
            "TensionService synthesize_theme: document=%s using %d/%d lines (reviewed=%d)",
            document_id,
            len(input_lines),
            len(lines),
            len(reviewed),
        )

        theme = await self._call_theme_llm(input_lines, document_id, language)
        return theme

    async def save_theme(self, theme: TensionTheme) -> None:
        """Persist a TensionTheme to cache."""
        key = f"tension_theme:{theme.document_id}"
        await self._cache.set(key, theme.model_dump(mode="json"))
        logger.debug("TensionService: saved TensionTheme for document=%s", theme.document_id)

    async def get_theme(self, document_id: str) -> TensionTheme | None:
        """Retrieve a cached TensionTheme, or None if not found/expired."""
        cached = await self._cache.get(f"tension_theme:{document_id}")
        if cached is None:
            return None
        return TensionTheme.model_validate(cached)

    async def update_theme_review(
        self,
        theme_id: str,
        document_id: str,
        review_status: str,
        proposition: str | None = None,
    ) -> TensionTheme | None:
        """Update the review_status (and optionally the proposition) of a TensionTheme.

        Returns the updated TensionTheme, or None if theme_id does not match.
        """
        theme = await self.get_theme(document_id)
        if theme is None or theme.id != theme_id:
            return None

        updates: dict = {"review_status": review_status}
        if proposition is not None:
            updates["proposition"] = proposition
        updated = theme.model_copy(update=updates)
        await self.save_theme(updated)
        logger.debug(
            "TensionService: updated theme review document=%s status=%s",
            document_id,
            review_status,
        )
        return updated

    # ── Public: Mode A (full-book batch) ─────────────────────────────────────

    async def analyze_book_tensions(
        self,
        document_id: str,
        kg_service,
        doc_service,
        language: str = "en",
        force: bool = False,
        concurrency: int = 5,
        progress_callback=None,
    ) -> dict:
        """Batch-assemble TEUs for all qualifying events in a document (Mode A).

        Filters events where tension_signal != "none".
        Uses asyncio.Semaphore to limit parallel LLM calls.

        Args:
            progress_callback: Optional async callable(done: int, total: int).

        Returns:
            dict with total_events, candidates, assembled, failed counts.
        """
        import asyncio  # noqa: PLC0415

        events = await kg_service.get_events(document_id=document_id)
        candidates = [e for e in events if e.tension_signal != "none"]
        total = len(candidates)

        if not candidates:
            logger.info(
                "analyze_book_tensions: no qualifying events for document=%s",
                document_id,
            )
            return {
                "total_events": len(events),
                "candidates": 0,
                "assembled": 0,
                "failed": 0,
            }

        sem = asyncio.Semaphore(concurrency)
        assembled = 0
        failed = 0

        async def _assemble_one(event):
            nonlocal assembled, failed
            async with sem:
                try:
                    teu = await self.assemble_teu(
                        event_id=event.id,
                        document_id=document_id,
                        kg_service=kg_service,
                        doc_service=doc_service,
                        language=language,
                        force=force,
                    )
                    await self.save_teu(teu)
                    assembled += 1
                except Exception:
                    logger.warning(
                        "analyze_book_tensions: failed for event=%s",
                        event.id,
                        exc_info=True,
                    )
                    failed += 1
            if progress_callback:
                progress_callback(assembled + failed, total)

        await asyncio.gather(
            *[_assemble_one(e) for e in candidates],
            return_exceptions=True,
        )

        logger.info(
            "analyze_book_tensions: document=%s candidates=%d assembled=%d failed=%d",
            document_id,
            total,
            assembled,
            failed,
        )
        return {
            "total_events": len(events),
            "candidates": total,
            "assembled": assembled,
            "failed": failed,
        }

    # ── Private ───────────────────────────────────────────────────────────────

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.3)
        return self._llm

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm(
        self,
        event,
        characters,
        concepts,
        chapter_summary: str | None,
        document_id: str,
        language: str,
    ) -> TEU:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        human_content = self._build_human_content(
            event, characters, concepts, chapter_summary
        )
        system_prompt = self._localize_prompt(_TEU_SYSTEM_PROMPT, language)

        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"TensionService: LLM parse failed: {err!r}")

        return self._build_teu(parsed, event, characters, concepts, document_id)

    @staticmethod
    def _build_human_content(event, characters, concepts, chapter_summary) -> str:
        lines = [
            f"## Scene: {event.title}",
            f"Chapter: {event.chapter}",
            f"Type: {event.event_type}",
            f"Description: {event.description}",
            f"Tension signal: {event.tension_signal}",
            f"Emotional intensity: {event.emotional_intensity}",
            f"Emotional valence: {event.emotional_valence}",
        ]
        if event.significance:
            lines.append(f"Significance: {event.significance}")

        if characters:
            lines.append("\n## Participants")
            for c in characters:
                desc = f" — {c.description}" if c.description else ""
                lines.append(f"- {c.name} ({c.entity_type.value}){desc}")

        if concepts:
            surface = [c for c in concepts if c.extraction_method == "ner"]
            inferred = [c for c in concepts if c.extraction_method == "inferred"]
            if surface:
                lines.append("\n## Surface Concepts (from text)")
                for c in surface[:10]:
                    lines.append(f"- {c.name}")
            if inferred:
                lines.append("\n## Inferred Concepts (thematic)")
                for c in inferred[:10]:
                    conf = f" (confidence: {c.confidence:.2f})" if c.confidence else ""
                    desc = f" — {c.description}" if c.description else ""
                    lines.append(f"- {c.name}{conf}{desc}")

        if chapter_summary:
            lines.append(f"\n## Chapter Summary\n{chapter_summary[:800]}")

        return "\n".join(lines)

    @staticmethod
    def _build_teu(parsed, event, characters, concepts, document_id) -> TEU:
        name_to_id = {c.name: c.id for c in characters}
        concept_name_to_id = {c.name: c.id for c in concepts}

        def _make_pole(raw_pole: dict) -> TensionPole:
            concept_name = raw_pole.get("concept_name", "")
            carrier_names = raw_pole.get("carrier_names", [])
            if not isinstance(carrier_names, list):
                carrier_names = []
            return TensionPole(
                concept_name=concept_name,
                concept_id=concept_name_to_id.get(concept_name),
                carrier_ids=[name_to_id[n] for n in carrier_names if n in name_to_id],
                carrier_names=carrier_names,
                stance=raw_pole.get("stance"),
            )

        try:
            intensity = max(0.0, min(1.0, float(parsed.get("intensity", 0.5))))
        except (TypeError, ValueError):
            intensity = event.emotional_intensity or 0.5

        evidence = parsed.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []

        return TEU(
            event_id=event.id,
            document_id=document_id,
            chapter=event.chapter,
            pole_a=_make_pole(parsed.get("pole_a", {})),
            pole_b=_make_pole(parsed.get("pole_b", {})),
            tension_description=parsed.get("tension_description", ""),
            intensity=intensity,
            evidence=evidence,
            thematic_note=parsed.get("thematic_note"),
            assembled_by=_ASSEMBLER_TAG,
        )

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_grouping_llm(
        self,
        teus: list[TEU],
        document_id: str,
        language: str,
    ) -> list[TensionLine]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        teu_index = {t.id: t for t in teus}
        lines_input = []
        for t in teus:
            lines_input.append(
                f"- id={t.id} | chapter={t.chapter} | intensity={t.intensity:.2f}"
                f" | pole_a={t.pole_a.concept_name!r} (carriers: {t.pole_a.carrier_names})"
                f" | pole_b={t.pole_b.concept_name!r} (carriers: {t.pole_b.carrier_names})"
            )
        human_content = "TEUs:\n" + "\n".join(lines_input)

        system_prompt = self._localize_prompt(_GROUPING_SYSTEM_PROMPT, language)
        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(f"TensionService grouping: LLM parse failed: {err!r}")

        result: list[TensionLine] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            valid_ids = [tid for tid in item.get("teu_ids", []) if tid in teu_index]
            if not valid_ids:
                continue
            constituent = [teu_index[tid] for tid in valid_ids]
            chapters = [t.chapter for t in constituent]
            intensities = [t.intensity for t in constituent]
            result.append(
                TensionLine(
                    document_id=document_id,
                    teu_ids=valid_ids,
                    canonical_pole_a=item.get("canonical_pole_a", ""),
                    canonical_pole_b=item.get("canonical_pole_b", ""),
                    intensity_summary=sum(intensities) / len(intensities),
                    chapter_range=[min(chapters), max(chapters)],
                )
            )

        logger.debug("TensionService grouping: produced %d TensionLines", len(result))
        return result

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_theme_llm(
        self,
        lines: list[TensionLine],
        document_id: str,
        language: str,
    ) -> TensionTheme:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        lang_key = "zh" if language.lower().startswith("zh") else "en"
        frye_summary = get_mythos_summary("frye", lang_key)
        booker_summary = get_mythos_summary("booker", lang_key)

        human_parts = ["## TensionLines"]
        for line in lines:
            ch = f"ch{line.chapter_range[0]}-{line.chapter_range[-1]}" if line.chapter_range else "?"
            human_parts.append(
                f"- [{ch}] intensity={line.intensity_summary:.2f} | "
                f"{line.canonical_pole_a!r} vs {line.canonical_pole_b!r} "
                f"(status={line.review_status})"
            )

        human_parts += [
            "\n## Frye's Four Mythoi",
            frye_summary,
            "\n## Booker's Seven Basic Plots",
            booker_summary,
        ]
        human_content = "\n".join(human_parts)

        system_prompt = self._localize_prompt(_THEME_SYSTEM_PROMPT, language)
        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"TensionService theme synthesis: LLM parse failed: {err!r}")

        return TensionTheme(
            document_id=document_id,
            tension_line_ids=[l.id for l in lines],
            proposition=parsed.get("proposition", ""),
            frye_mythos=parsed.get("frye_mythos"),
            booker_plot=parsed.get("booker_plot"),
            assembled_by=_SYNTHESIZER_TAG,
        )

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        if language.lower().startswith("zh"):
            return prompt + "\n\nRespond with all text fields in Traditional Chinese."
        if language.lower().startswith("ja"):
            return prompt + "\n\nRespond with all text fields in Japanese."
        return prompt
