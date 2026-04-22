"""SymbolAnalysisService — LLM-driven symbol interpretation — B-040.

Reads an SEP (from SymbolService) and produces a SymbolInterpretation via LLM.
Persistence uses AnalysisCache under the key pattern:
    symbol_analysis:{book_id}:{imagery_id}

Architecture mirrors TensionService (TEU → TensionLine) and AnalysisService
(CEP → CharacterAnalysisResult): data assembly is upstream (B-022 SEP),
this service focuses on the LLM reading and HITL review.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Callable

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.token_callback import set_llm_service_context
from core.utils.output_extractor import extract_json_from_text
from domain.symbol_analysis import SEP, SymbolInterpretation

if TYPE_CHECKING:
    from services.analysis_cache import AnalysisCache
    from services.document_service import DocumentService
    from services.kg_service import KGService
    from services.symbol_service import SymbolService

logger = logging.getLogger(__name__)

_ANALYZER_TAG = "symbol_analysis_service_v1"

_SYMBOL_SYSTEM_PROMPT = """\
You are a literary symbolism analyst. Given a Symbol Evidence Profile (SEP)
for a recurring imagery element in a novel, interpret what the symbol
represents and how it functions thematically.

You will receive:
- The imagery term, type, and frequency
- Occurrence contexts (paragraph text + chapter location)
- IDs of co-occurring characters and events (for reference)
- Chapter distribution and peak chapters

Your task: produce a structured interpretation grounded in the evidence.

Guidelines:
- The theme is a specific thematic proposition (NOT a generic label).
  Bad: "freedom". Good: "The caged bird figures the heroine's constrained
  choices within her marriage."
- polarity: how the symbol is valued across its occurrences —
  "positive" (affirming/aspirational), "negative" (threatening/destructive),
  "mixed" (both, by context), "neutral" (descriptive, not evaluatively charged).
- evidence_summary: 2-3 sentences synthesizing *what the text shows*, citing
  concrete occurrences — not a restatement of the theme.
- linked_characters / linked_events: pick at most 5 IDs EACH from the
  co_occurring lists provided. Do NOT invent IDs.
- confidence: 0.0–1.0 reflecting how firmly the evidence supports the reading.
  Low coverage (few occurrences, narrow chapter spread) should lower confidence.

Return ONLY a JSON object with keys:
  "theme": str
  "polarity": "positive"|"negative"|"neutral"|"mixed"
  "evidence_summary": str
  "linked_characters": [str]
  "linked_events": [str]
  "confidence": float
"""


class SymbolAnalysisService:
    """LLM-based symbol interpreter + HITL review store.

    Args:
        cache: AnalysisCache for persistence.
        llm: Optional pre-built LLM client (injected for testing).
    """

    def __init__(self, cache: "AnalysisCache", llm: Any = None) -> None:
        self._cache = cache
        self._llm = llm

    # ── Public ────────────────────────────────────────────────────────────────

    async def analyze_symbol(
        self,
        imagery_id: str,
        book_id: str,
        symbol_service: "SymbolService",
        doc_service: "DocumentService",
        kg_service: "KGService",
        language: str = "en",
        force: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> SymbolInterpretation:
        """Interpret a single imagery symbol via LLM.

        Returns cached result unless force=True. On cache miss the SEP is
        assembled (or fetched from its own cache) via SymbolService, then
        fed to the LLM. The result is persisted under
        ``symbol_analysis:{book_id}:{imagery_id}``.
        """
        cache_key = _interpretation_cache_key(book_id, imagery_id)

        if not force:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.debug("SymbolAnalysisService: cache hit for %s", cache_key)
                return SymbolInterpretation.model_validate(cached)

        if progress_callback:
            progress_callback(10, "loading SEP")
        sep = await symbol_service.assemble_sep(
            imagery_id=imagery_id,
            book_id=book_id,
            doc_service=doc_service,
            kg_service=kg_service,
            cache=self._cache,
        )

        if progress_callback:
            progress_callback(40, "calling LLM for interpretation")
        interpretation = await self._call_llm(sep, language)

        if progress_callback:
            progress_callback(90, "saving interpretation")
        await self.save_interpretation(interpretation)
        return interpretation

    async def save_interpretation(
        self, interpretation: SymbolInterpretation
    ) -> None:
        """Persist a SymbolInterpretation to cache."""
        key = _interpretation_cache_key(
            interpretation.book_id, interpretation.imagery_id
        )
        await self._cache.set(key, interpretation.model_dump(mode="json"))
        logger.debug(
            "SymbolAnalysisService: saved interpretation imagery=%s",
            interpretation.imagery_id,
        )

    async def get_interpretation(
        self, imagery_id: str, book_id: str
    ) -> SymbolInterpretation | None:
        """Retrieve a cached SymbolInterpretation, or None if missing/expired."""
        cached = await self._cache.get(
            _interpretation_cache_key(book_id, imagery_id)
        )
        if cached is None:
            return None
        return SymbolInterpretation.model_validate(cached)

    async def update_interpretation_review(
        self,
        imagery_id: str,
        book_id: str,
        review_status: str,
        theme: str | None = None,
        polarity: str | None = None,
    ) -> SymbolInterpretation | None:
        """Update review_status (and optionally theme/polarity) of an interpretation.

        Returns the updated SymbolInterpretation, or None if not found.
        """
        current = await self.get_interpretation(imagery_id, book_id)
        if current is None:
            return None

        updates: dict = {"review_status": review_status}
        if theme is not None:
            updates["theme"] = theme
        if polarity is not None:
            updates["polarity"] = polarity
        updated = current.model_copy(update=updates)
        await self.save_interpretation(updated)
        logger.debug(
            "SymbolAnalysisService: updated review imagery=%s status=%s",
            imagery_id,
            review_status,
        )
        return updated

    # ── Private: LLM call ─────────────────────────────────────────────────────

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.3)
        return self._llm

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        from core.language_detection import get_language_display_name  # noqa: PLC0415

        return prompt + f"\nRespond in {get_language_display_name(language)}."

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm(self, sep: SEP, language: str) -> SymbolInterpretation:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        prompt = self._localize_prompt(_SYMBOL_SYSTEM_PROMPT, language)
        user_content = _format_sep_for_prompt(sep)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=user_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"Symbol interpretation parse failed: {err}")

        allowed_entity_ids = set(sep.co_occurring_entity_ids)
        allowed_event_ids = set(sep.co_occurring_event_ids)

        linked_chars = [
            cid for cid in parsed.get("linked_characters", [])
            if cid in allowed_entity_ids
        ][:5]
        linked_events = [
            eid for eid in parsed.get("linked_events", [])
            if eid in allowed_event_ids
        ][:5]

        polarity = parsed.get("polarity", "neutral")
        if polarity not in ("positive", "negative", "neutral", "mixed"):
            polarity = "neutral"

        confidence = float(parsed.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))

        return SymbolInterpretation(
            imagery_id=sep.imagery_id,
            book_id=sep.book_id,
            term=sep.term,
            theme=parsed.get("theme", ""),
            polarity=polarity,
            evidence_summary=parsed.get("evidence_summary", ""),
            linked_characters=linked_chars,
            linked_events=linked_events,
            confidence=confidence,
            assembled_by=_ANALYZER_TAG,
        )


def _interpretation_cache_key(book_id: str, imagery_id: str) -> str:
    return f"symbol_analysis:{book_id}:{imagery_id}"


def _format_sep_for_prompt(sep: SEP) -> str:
    """Serialize an SEP into a compact LLM-readable prompt body."""
    lines: list[str] = [
        f"Imagery term: {sep.term}",
        f"Imagery type: {sep.imagery_type}",
        f"Total frequency: {sep.frequency}",
        f"Peak chapters: {sep.peak_chapters}",
        f"Chapter distribution: {dict(sorted(sep.chapter_distribution.items()))}",
        f"Co-occurring character/entity IDs: {sep.co_occurring_entity_ids}",
        f"Co-occurring event IDs: {sep.co_occurring_event_ids}",
        "",
        "Occurrence contexts:",
    ]
    for i, ctx in enumerate(sep.occurrence_contexts[:20], start=1):
        snippet = ctx.paragraph_text or ctx.context_window
        if len(snippet) > 500:
            snippet = snippet[:500] + "…"
        lines.append(
            f"  [{i}] ch.{ctx.chapter_number} pos.{ctx.position}: {snippet}"
        )
    if len(sep.occurrence_contexts) > 20:
        lines.append(
            f"  … ({len(sep.occurrence_contexts) - 20} more occurrences omitted)"
        )
    return "\n".join(lines)
