"""TensionService — TEU assembly and persistence — B-026/B-027.

Mode B (single-event trigger) is implemented here.
Mode A (full-book batch) is implemented in B-028.

Persistence uses AnalysisCache (SQLite) with key patterns:
    teu:{event_id}
    tension_lines:{document_id}
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.token_callback import set_llm_service_context
from core.utils.output_extractor import extract_json_from_text
from domain.entities import EntityType
from domain.tension import TEU, TensionLine, TensionPole

if TYPE_CHECKING:
    from services.analysis_cache import AnalysisCache
    from services.document_service import DocumentService
    from services.kg_service import KGService

logger = logging.getLogger(__name__)

_ASSEMBLER_TAG = "tension_service_v1"
_GROUPER_TAG = "tension_grouper_v1"

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

    async def get_teu(self, event_id: str) -> Optional[TEU]:
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
        for event in events:
            teu = await self.get_teu(event.id)
            if teu is not None:
                teus.append(teu)

        if not teus:
            logger.info("TensionService: no TEUs found for document=%s", document_id)
            return []

        lines = await self._call_grouping_llm(teus, document_id, language)
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
        canonical_pole_a: Optional[str] = None,
        canonical_pole_b: Optional[str] = None,
    ) -> Optional[TensionLine]:
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
        chapter_summary: Optional[str],
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

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        if language.lower().startswith("zh"):
            return prompt + "\n\nRespond with all text fields in Traditional Chinese."
        if language.lower().startswith("ja"):
            return prompt + "\n\nRespond with all text fields in Japanese."
        return prompt
