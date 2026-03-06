"""AnalysisAgent — cache-first orchestrator for deep analysis.

NOT a LangGraph ReAct agent. Simple orchestrator that checks cache
before delegating to AnalysisService, then stores results.
"""

from __future__ import annotations

import logging
from typing import Any

from services.analysis_cache import AnalysisCache
from services.analysis_models import CharacterAnalysisResult

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
    ) -> None:
        self._service = analysis_service
        self._cache = cache

    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        force_refresh: bool = False,
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
        cache_key = AnalysisCache.make_key("character", document_id, entity_name)

        # 1. Check cache (unless force_refresh)
        if self._cache is not None and not force_refresh:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                logger.info("Cache HIT for %s", cache_key)
                return CharacterAnalysisResult.model_validate(cached)
            logger.info("Cache MISS for %s", cache_key)

        # 2. Run analysis
        result = await self._service.analyze_character(
            entity_name=entity_name,
            document_id=document_id,
            archetype_frameworks=archetype_frameworks,
            language=language,
        )

        # 3. Store in cache
        if self._cache is not None:
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            logger.info("Cached result for %s", cache_key)

        return result
