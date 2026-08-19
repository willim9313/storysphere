"""AnalysisAgent — cache-first orchestrator for deep analysis.

NOT a LangGraph ReAct agent. Simple orchestrator that checks cache
before delegating to AnalysisService / NarrativeService, then stores results.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

try:
    from langfuse import observe as _langfuse_observe
except ImportError:  # pragma: no cover
    def _langfuse_observe(**_kw):  # type: ignore[misc]
        def noop(fn):
            return fn
        return noop

from storysphere.core.token_callback import set_llm_service_context
from storysphere.domain.symbol_analysis import SymbolInterpretation
from storysphere.services.analysis_cache import AnalysisCache
from storysphere.services.analysis_models import CharacterAnalysisResult, EventAnalysisResult

logger = logging.getLogger(__name__)


class AnalysisAgent:
    """Cache-first orchestrator for deep character analysis.

    Flow:
        1. Check cache (hit → return in <100ms)
        2. Cache miss → AnalysisService.analyze_character()
        3. Store result in cache
        4. Return CharacterAnalysisResult
    """

    def __init__(
        self,
        analysis_service: Any,
        cache: AnalysisCache | None = None,
        narrative_service: Any = None,
        symbol_analysis_service: Any = None,
        symbol_service: Any = None,
        doc_service: Any = None,
        kg_service: Any = None,
    ) -> None:
        self._service = analysis_service
        self._cache = cache
        self._narrative = narrative_service
        self._symbol_analysis = symbol_analysis_service
        self._symbol_service = symbol_service
        self._doc_service = doc_service
        self._kg_service = kg_service

    async def _character_cache_id(
        self, document_id: str, entity_name: str, entity_id: str | None
    ) -> str:
        """Resolve the entity component of a character cache key.

        Keyed by entity id, since a display name is not stable across a
        re-ingest and two characters can share one. Callers holding the id
        pass it directly; the chat tool and POST /analysis/character only know
        a name, so those resolve through the KG. Falls back to the name when
        no KG is wired or the name is unknown — a name-keyed entry is still
        better than no caching at all.
        """
        if entity_id:
            return entity_id
        if self._kg_service is not None:
            entity = await self._kg_service.get_entity_by_name(entity_name)
            if entity is not None:
                return entity.id
        logger.debug(
            "Character cache falling back to a name key for %r in %s",
            entity_name, document_id,
        )
        return entity_name

    @_langfuse_observe(name="AnalysisAgent.analyze_character")
    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        force_refresh: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
        retry_parts: list[str] | None = None,
        entity_id: str | None = None,
    ) -> CharacterAnalysisResult:
        """Run character analysis with cache-first strategy.

        Args:
            entity_name: Character name.
            document_id: Source document ID.
            archetype_frameworks: Archetype frameworks (default: ['jung']).
            language: Language for archetype configs.
            force_refresh: If True, skip cache and re-analyze.
            entity_id: Entity id used for the cache key. Resolved from
                entity_name via the KG when omitted.

        Returns:
            CharacterAnalysisResult.
        """
        import time  # noqa: PLC0415

        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        set_llm_service_context("analysis", book_id=document_id)
        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = AnalysisCache.make_key(
            "character",
            document_id,
            await self._character_cache_id(document_id, entity_name, entity_id),
        )

        # Partial re-run: reuse cached result, recompute only failed parts.
        if retry_parts and self._cache is not None:
            base = await self._cache.get_as(cache_key, CharacterAnalysisResult)
            result = await self._service.analyze_character(
                entity_name=entity_name,
                document_id=document_id,
                archetype_frameworks=archetype_frameworks,
                language=language,
                progress_callback=progress_callback,
                retry_parts=retry_parts,
                base_result=base,
            )
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            return result

        # 1. Check cache (unless force_refresh)
        if self._cache is not None and not force_refresh:
            cached = await self._cache.get_as(cache_key, CharacterAnalysisResult)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("character", hit=True, cache_key=cache_key)
                return cached
            logger.info("Cache MISS for %s", cache_key)
            _metrics.record_cache_event("character", hit=False, cache_key=cache_key)

        # 2. Run analysis
        try:
            result = await self._service.analyze_character(
                entity_name=entity_name,
                document_id=document_id,
                archetype_frameworks=archetype_frameworks,
                language=language,
                progress_callback=progress_callback,
            )
        except Exception as exc:
            _metrics.record_tool_execution(
                "analyze_character",
                success=False,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                error=type(exc).__name__,
            )
            raise

        # 3. Store in cache
        if self._cache is not None:
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            logger.info("Cached result for %s", cache_key)

        _metrics.record_tool_execution(
            "analyze_character",
            success=True,
            latency_ms=(time.perf_counter() - _t0) * 1000,
        )
        return result

    @_langfuse_observe(name="AnalysisAgent.analyze_event")
    async def analyze_event(
        self,
        event_id: str,
        document_id: str,
        language: str = "en",
        force_refresh: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
        retry_parts: list[str] | None = None,
    ) -> EventAnalysisResult:
        """Run event analysis with cache-first strategy.

        Args:
            event_id: Event ID from the KG.
            document_id: Source document ID.
            language: Output language code (default "en").
            force_refresh: If True, skip cache and re-analyze.

        Returns:
            EventAnalysisResult.
        """
        import time  # noqa: PLC0415

        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        set_llm_service_context("analysis", book_id=document_id)
        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = f"event:{document_id}:{event_id}"

        # Partial re-run: reuse cached result, recompute only failed parts.
        if retry_parts and self._cache is not None:
            base = await self._cache.get_as(cache_key, EventAnalysisResult)
            result = await self._service.analyze_event(
                event_id=event_id,
                document_id=document_id,
                language=language,
                progress_callback=progress_callback,
                retry_parts=retry_parts,
                base_result=base,
            )
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            return result

        if self._cache is not None and not force_refresh:
            cached = await self._cache.get_as(cache_key, EventAnalysisResult)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("event", hit=True, cache_key=cache_key)
                return cached
            logger.info("Cache MISS for %s", cache_key)
            _metrics.record_cache_event("event", hit=False, cache_key=cache_key)

        try:
            result = await self._service.analyze_event(
                event_id=event_id,
                document_id=document_id,
                language=language,
                progress_callback=progress_callback,
            )
        except Exception as exc:
            _metrics.record_tool_execution(
                "analyze_event",
                success=False,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                error=type(exc).__name__,
            )
            raise

        if self._cache is not None:
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            logger.info("Cached result for %s", cache_key)

        _metrics.record_tool_execution(
            "analyze_event",
            success=True,
            latency_ms=(time.perf_counter() - _t0) * 1000,
        )
        return result

    @_langfuse_observe(name="AnalysisAgent.analyze_symbol")
    async def analyze_symbol(
        self,
        imagery_id: str,
        book_id: str,
        language: str = "en",
        force_refresh: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> SymbolInterpretation:
        """Run symbol interpretation with cache-first strategy (B-040).

        Args:
            imagery_id: ImageryEntity ID.
            book_id: Book document ID.
            language: LLM output language.
            force_refresh: If True, bypass cache and re-interpret.

        Returns:
            SymbolInterpretation.
        """
        import time  # noqa: PLC0415

        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        if self._symbol_analysis is None:
            raise RuntimeError("AnalysisAgent: symbol_analysis_service not configured")

        set_llm_service_context("imagery", book_id=book_id)
        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = f"symbol_analysis:{book_id}:{imagery_id}"

        if self._cache is not None and not force_refresh:
            cached = await self._cache.get_as(cache_key, SymbolInterpretation)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("symbol", hit=True, cache_key=cache_key)
                return cached
            logger.info("Cache MISS for %s", cache_key)
            _metrics.record_cache_event("symbol", hit=False, cache_key=cache_key)

        try:
            result = await self._symbol_analysis.analyze_symbol(
                imagery_id=imagery_id,
                book_id=book_id,
                symbol_service=self._symbol_service,
                doc_service=self._doc_service,
                kg_service=self._kg_service,
                language=language,
                force=force_refresh,
                progress_callback=progress_callback,
            )
        except Exception as exc:
            _metrics.record_tool_execution(
                "analyze_symbol",
                success=False,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                error=type(exc).__name__,
            )
            raise

        _metrics.record_tool_execution(
            "analyze_symbol",
            success=True,
            latency_ms=(time.perf_counter() - _t0) * 1000,
        )
        return result

    async def analyze_symbols_batch(
        self,
        book_id: str,
        imagery_ids: list[str],
        *,
        language: str = "en",
        force_refresh: bool = False,
        skip_ids: set[str] | None = None,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict:
        """Interpret every imagery entity in *imagery_ids*, one at a time.

        Sequential rather than concurrent: every item is a paid LLM call, and
        running them in parallel makes a rate-limit abort lose work that has
        already been charged for.

        ``skip_ids`` covers both symbols that already have an interpretation and
        symbols the provider has refused. Both are counted as skipped rather
        than failed: neither spends a call, and a refusal re-attempted in a
        sweep spends one to learn what is already recorded.

        Hitting the provider's rate limit stops the sweep — continuing would
        only burn the remaining items on the same error. That is reported as
        ``aborted`` in the summary rather than raised, so the caller keeps the
        counts of what did get through and decides how to surface it.

        Returns:
            ``{"progress", "total", "failed", "skipped", "aborted"}``.
        """
        from storysphere.core.error_handling import is_rate_limit_error  # noqa: PLC0415

        skip_ids = skip_ids or set()
        total = len(imagery_ids)
        done = failed = skipped = 0

        def _report() -> None:
            if progress_callback is not None:
                progress_callback(done, total)

        for imagery_id in imagery_ids:
            if not force_refresh and imagery_id in skip_ids:
                skipped += 1
                done += 1
                _report()
                continue
            try:
                await self.analyze_symbol(
                    imagery_id=imagery_id,
                    book_id=book_id,
                    language=language,
                    force_refresh=force_refresh,
                )
                done += 1
            except Exception as exc:  # noqa: BLE001
                if is_rate_limit_error(exc):
                    logger.warning("Batch symbol analysis aborted — rate limit: %s", exc)
                    return {
                        "progress": done,
                        "total": total,
                        "failed": failed,
                        "skipped": skipped,
                        "aborted": True,
                    }
                logger.warning("Batch symbol analysis failed for %s: %s", imagery_id, exc)
                failed += 1
                done += 1
            _report()

        logger.info(
            "Batch symbol analysis complete: book=%s total=%d skipped=%d failed=%d",
            book_id,
            total,
            skipped,
            failed,
        )
        return {
            "progress": total,
            "total": total,
            "failed": failed,
            "skipped": skipped,
            "aborted": False,
        }

    @_langfuse_observe(name="AnalysisAgent.analyze_narrative")
    async def analyze_narrative(
        self,
        document_id: str,
        language: str = "en",
        force_refresh: bool = False,
    ) -> dict:
        """Run full narrative structure analysis (B-038 entry point).

        Runs in sequence:
          1. classify_by_heuristic   — Kernel/Satellite (Phase 1)
          2. refine_with_llm         — LLM refinement of satellites (Phase 2)
          3. map_hero_journey        — Campbell stage mapping (Phase 3)

        Temporal analysis (B-037) is NOT included here because it requires
        ≥ 60% story_time_hint coverage, which must be verified separately.

        Args:
            document_id: Book document ID.
            language: LLM output language.
            force_refresh: If True, bypass cache and re-run all phases.

        Returns:
            dict with keys: narrative_structure, hero_journey_stages.
        """
        if self._narrative is None:
            raise RuntimeError("AnalysisAgent: narrative_service not configured")

        set_llm_service_context("analysis", book_id=document_id)

        structure = await self._narrative.refine_with_llm(
            document_id=document_id,
            language=language,
            force=force_refresh,
        )
        stages = await self._narrative.map_hero_journey(
            document_id=document_id,
            language=language,
            force=force_refresh,
        )

        logger.info(
            "AnalysisAgent.analyze_narrative: document=%s kernel=%d satellite=%d stages=%d",
            document_id,
            len(structure.kernel_event_ids),
            len(structure.satellite_event_ids),
            len(stages),
        )
        return {
            "narrative_structure": structure.model_dump(),
            "hero_journey_stages": [s.model_dump() for s in stages],
        }
