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
from collections.abc import Callable
from datetime import datetime
from typing import TYPE_CHECKING

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from storysphere.config.mythos import get_mythos_summary, resolve_mythos_id
from storysphere.core.token_callback import set_llm_service_context
from storysphere.core.utils.output_extractor import extract_json_from_text
from storysphere.domain.entities import EntityType
from storysphere.domain.tension import TEU, TensionLine, TensionPole, TensionTheme

if TYPE_CHECKING:
    from storysphere.services.analysis_cache import AnalysisCache
    from storysphere.services.document_service import DocumentService
    from storysphere.services.kg_service import KGService

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

The lists above are formatted as `**Display Name** (id)`. Answer with the
PARENTHESISED ID ONLY — lowercase ASCII, never the display name. For example,
given `- **悲劇** (tragedy): ...` the correct answer is "tragedy", not "悲劇".

Return ONLY a JSON object with:
  "proposition": str        # The book-level thematic claim (1-2 sentences)
  "frye_mythos": str        # The Frye mythos id, e.g. "tragedy" — id, not name
  "booker_plot": str        # The Booker plot id, e.g. "overcoming_the_monster"
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

    @staticmethod
    def _grouping_coverage(teus: list[TEU], lines: list[TensionLine]) -> dict:
        """Report which of ``teus`` no TensionLine claims.

        The grouping LLM receives every TEU in one call and is free to omit any
        of them; nothing downstream notices, so omitted TEUs disappear from the
        analysis silently. This computes the shortfall so callers can report it.
        """
        covered = {tid for line in lines for tid in line.teu_ids}
        uncovered = [t for t in teus if t.id not in covered]
        return {
            "total_teus": len(teus),
            "covered_teus": len(teus) - len(uncovered),
            "uncovered_teus": len(uncovered),
            "uncovered_teu_ids": [t.id for t in uncovered],
            "uncovered_chapters": sorted({t.chapter for t in uncovered}),
        }

    async def group_teus(
        self,
        document_id: str,
        kg_service,
        language: str = "en",
        force: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> dict:
        """Group all cached TEUs for a document into TensionLines (LLM-based).

        Returns cached result unless force=True.

        Returns:
            ``{"lines": list[TensionLine], "coverage": dict | None}``. ``coverage``
            is None on a cache hit (nothing was re-grouped, so there is no new
            shortfall to report); otherwise see :meth:`_grouping_coverage`.
        """
        cache_key = f"tension_lines:{document_id}"
        if not force:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.debug("TensionService: cache hit for %s", cache_key)
                return {
                    "lines": [TensionLine.model_validate(line) for line in cached["lines"]],
                    "coverage": None,
                }

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
            return {"lines": [], "coverage": self._grouping_coverage([], [])}

        if progress_callback:
            progress_callback(60, "calling LLM for line grouping")
        lines = await self._call_grouping_llm(teus, document_id, language)

        coverage = self._grouping_coverage(teus, lines)
        if coverage["uncovered_teus"]:
            logger.warning(
                "TensionService grouping: document=%s left %d/%d TEUs ungrouped "
                "(chapters affected: %s)",
                document_id,
                coverage["uncovered_teus"],
                coverage["total_teus"],
                coverage["uncovered_chapters"],
            )

        if progress_callback:
            progress_callback(95, "saving tension lines")
        await self.save_lines(lines, document_id)
        return {"lines": lines, "coverage": coverage}

    async def save_lines(self, lines: list[TensionLine], document_id: str) -> None:
        """Persist TensionLines for a document to cache."""
        key = f"tension_lines:{document_id}"
        await self._cache.set(key, {"lines": [line.model_dump(mode="json") for line in lines]})
        logger.debug("TensionService: saved %d TensionLines for document=%s", len(lines), document_id)

    async def get_lines(self, document_id: str) -> list[TensionLine]:
        """Retrieve cached TensionLines for a document, or empty list if none."""
        cached = await self._cache.get(f"tension_lines:{document_id}")
        if not cached:
            return []
        return [TensionLine.model_validate(line) for line in cached["lines"]]

    async def get_teus(self, document_id: str) -> list[TEU]:
        """Return every cached TEU for a document, ordered by chapter.

        TEUs are cached per event (``teu:{event_id}``) with no document-level
        index, so this scans the prefix and filters. Entries that no longer
        validate against the current TEU model are skipped rather than raising.
        """
        entries = await self._cache.list_by_prefix("teu:")
        result: list[TEU] = []
        for entry in entries:
            try:
                teu = TEU.model_validate(entry)
            except Exception:
                continue
            if teu.document_id == document_id:
                result.append(teu)
        result.sort(key=lambda t: (t.chapter, t.id))
        return result

    @staticmethod
    def _orientation_flips(teus: list[TEU]) -> dict[str, bool]:
        """Flag TEUs whose pole A/B assignment opposes the rest of their line.

        Grouping never normalises pole order, so one opposition can arrive as
        ``A=X, B=Y`` in one scene and ``A=Y, B=X`` in the next. Aggregating
        carriers across a line without accounting for that yields the same pill
        list on both poles — the review drawer's "A/B assignment is unstable"
        warning exists to surface exactly this.

        Orientation is read from carrier overlap against the TEU with the most
        carriers (an empty or one-sided reference could decide nothing), then
        the reference is inverted if most TEUs disagreed with it, so the answer
        does not depend on which TEU happened to be chosen.

        Two cases are undecidable and reported as *not* flipped — the warning
        should understate rather than invent a conflict:
          - a TEU sharing no carrier names with the reference
          - a TEU naming the same carriers on both of its poles
        """
        if len(teus) < 2:
            return {t.id: False for t in teus}

        def _names(pole: TensionPole) -> set[str]:
            return {n.strip() for n in pole.carrier_names if n and n.strip()}

        ref = max(teus, key=lambda t: len(_names(t.pole_a) | _names(t.pole_b)))
        ref_a, ref_b = _names(ref.pole_a), _names(ref.pole_b)

        # +1 agrees with the reference, -1 opposes it, 0 undecidable.
        orientation: dict[str, int] = {}
        for teu in teus:
            a, b = _names(teu.pole_a), _names(teu.pole_b)
            agree = len(a & ref_a) + len(b & ref_b)
            oppose = len(a & ref_b) + len(b & ref_a)
            if agree > oppose:
                orientation[teu.id] = 1
            elif oppose > agree:
                orientation[teu.id] = -1
            else:
                orientation[teu.id] = 0

        agreeing = sum(1 for v in orientation.values() if v == 1)
        opposing = sum(1 for v in orientation.values() if v == -1)
        minority = -1 if agreeing >= opposing else 1
        return {tid: v == minority for tid, v in orientation.items()}

    async def get_lines_with_teus(self, document_id: str) -> list[dict]:
        """Return TensionLines for a document with their constituent TEUs embedded.

        Each TensionLine dict gains a ``teus`` key (list of TEU dicts) so that the
        UI can render per-line evidence without a second round-trip. Lines whose
        TEUs are not in the cache (stale references) simply receive an empty list.
        """
        lines = await self.get_lines(document_id)
        if not lines:
            return []

        # Resolve TEUs across all lines in a single cache pass.
        all_teu_ids = {tid for line in lines for tid in line.teu_ids}
        teu_by_id: dict[str, TEU] = {}
        if all_teu_ids:
            teu_by_id = {
                teu.id: teu
                for teu in await self.get_teus(document_id)
                if teu.id in all_teu_ids
            }

        result: list[dict] = []
        for line in lines:
            payload = line.model_dump(mode="json")
            constituent = [teu_by_id[tid] for tid in line.teu_ids if tid in teu_by_id]
            flips = self._orientation_flips(constituent)
            teus_payload = []
            for teu in constituent:
                teu_payload = teu.model_dump(mode="json")
                teu_payload["flipped"] = flips[teu.id]
                teus_payload.append(teu_payload)
            payload["teus"] = teus_payload
            result.append(payload)
        return result

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

        input_lines = self.theme_input_lines(lines)
        logger.info(
            "TensionService synthesize_theme: document=%s using %d/%d lines",
            document_id,
            len(input_lines),
            len(lines),
        )

        theme = await self._call_theme_llm(input_lines, document_id, language)
        return theme

    @staticmethod
    def theme_input_lines(lines: list[TensionLine]) -> list[TensionLine]:
        """Select the lines a theme synthesis would be built from.

        Reviewed lines win; with none reviewed we fall back to everything, so
        that pressing Step 3 before reviewing still produces something. Shared
        with :meth:`theme_staleness` on purpose — if staleness reimplemented
        this rule the two would drift and the UI would lie about freshness.
        """
        reviewed = [line for line in lines if line.review_status in {"approved", "modified"}]
        return reviewed if reviewed else lines

    async def theme_staleness(
        self, document_id: str, theme: TensionTheme
    ) -> tuple[bool, str | None]:
        """Report whether ``theme`` still reflects the current TensionLines.

        Compares the lines the theme was built from against the ones a fresh
        synthesis would use right now. This catches re-grouping (every line id
        changes) and review decisions (the reviewed subset changes).

        It does not catch edits that leave membership intact — renaming a line's
        poles via a ``modified`` review keeps the same id, so the theme reads as
        fresh even though its inputs changed wording. Detecting that needs a
        content hash or per-line timestamps; neither exists yet.

        Returns:
            ``(is_stale, reason)``; reason is None when fresh.
        """
        lines = await self.get_lines(document_id)
        if not lines:
            return True, "no_lines"

        current = {line.id for line in self.theme_input_lines(lines)}
        used = set(theme.tension_line_ids)
        if current == used:
            return False, None
        if not used & current:
            return True, "lines_regrouped"
        return True, "review_changed"

    async def save_theme(self, theme: TensionTheme) -> None:
        """Persist a TensionTheme to cache."""
        key = f"tension_theme:{theme.document_id}"
        await self._cache.set(key, theme.model_dump(mode="json"))
        logger.debug("TensionService: saved TensionTheme for document=%s", theme.document_id)

    async def get_theme(self, document_id: str) -> TensionTheme | None:
        """Retrieve a cached TensionTheme, or None if not found/expired.

        ``frye_mythos`` / ``booker_plot`` are normalized to canonical ids on the
        way out, so themes synthesised before that guarantee existed (which may
        hold a localized display name) read correctly without re-running the
        LLM. The cached row itself is left untouched — the value read here can
        therefore differ from the value stored.
        """
        cached = await self._cache.get(f"tension_theme:{document_id}")
        if cached is None:
            return None
        theme = TensionTheme.model_validate(cached)
        return theme.model_copy(
            update={
                "frye_mythos": self._normalized_mythos("frye", theme.frye_mythos),
                "booker_plot": self._normalized_mythos("booker", theme.booker_plot),
            }
        )

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
            from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

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
                    thematic_note=item.get("thematic_note"),
                    assembled_by=_GROUPER_TAG,
                    assembled_at=datetime.utcnow(),
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
            tension_line_ids=[line.id for line in lines],
            proposition=parsed.get("proposition", ""),
            frye_mythos=self._normalized_mythos("frye", parsed.get("frye_mythos")),
            booker_plot=self._normalized_mythos("booker", parsed.get("booker_plot")),
            assembled_by=_SYNTHESIZER_TAG,
        )

    @staticmethod
    def _normalized_mythos(framework: str, value: str | None) -> str | None:
        """Coerce an LLM mythos answer to a canonical id, logging what was dropped."""
        resolved = resolve_mythos_id(framework, value)
        if value and resolved is None:
            logger.warning(
                "TensionService: unrecognised %s value %r — storing null",
                framework,
                value,
            )
        elif value and resolved != value:
            logger.info(
                "TensionService: normalised %s %r → %r", framework, value, resolved
            )
        return resolved

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        from storysphere.core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        return prompt + f"\nRespond in {lang_name}."
