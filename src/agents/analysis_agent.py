"""AnalysisAgent — cache-first orchestrator for deep analysis.

NOT a LangGraph ReAct agent. Simple orchestrator that checks cache
before delegating to AnalysisService / NarrativeService, then stores results.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

try:
    from langfuse import observe as _langfuse_observe
except ImportError:  # pragma: no cover
    def _langfuse_observe(**_kw):  # type: ignore[misc]
        def noop(fn):
            return fn
        return noop

from domain.symbol_analysis import SymbolInterpretation
from services.analysis_cache import AnalysisCache
from services.analysis_models import CharacterAnalysisResult, EventAnalysisResult

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

    @_langfuse_observe(name="AnalysisAgent.analyze_character")
    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        force_refresh: bool = False,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> CharacterAnalysisResult:
        """Run character analysis with cache-first strategy.

        Args:
            entity_name: Character name.
            document_id: Source document ID.
            archetype_frameworks: Archetype frameworks (default: ['jung']).
            language: Language for archetype configs.
            force_refresh: If True, skip cache and re-analyze.

        Returns:
            CharacterAnalysisResult.
        """
        import time  # noqa: PLC0415

        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = AnalysisCache.make_key("character", document_id, entity_name)

        # 1. Check cache (unless force_refresh)
        if self._cache is not None and not force_refresh:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("character", hit=True, cache_key=cache_key)
                return CharacterAnalysisResult.model_validate(cached)
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

        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = f"event:{document_id}:{event_id}"

        if self._cache is not None and not force_refresh:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("event", hit=True, cache_key=cache_key)
                return EventAnalysisResult.model_validate(cached)
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

        from core.metrics import get_metrics  # noqa: PLC0415

        if self._symbol_analysis is None:
            raise RuntimeError("AnalysisAgent: symbol_analysis_service not configured")

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        cache_key = f"symbol_analysis:{book_id}:{imagery_id}"

        if self._cache is not None and not force_refresh:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                _metrics.record_cache_event("symbol", hit=True, cache_key=cache_key)
                return SymbolInterpretation.model_validate(cached)
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
