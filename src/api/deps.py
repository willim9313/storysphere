"""FastAPI dependency injection — Services and Agents as singletons.

All heavy objects (KGService, ChatAgent, etc.) are created once on first
request via ``functools.lru_cache`` and reused for the lifetime of the process.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends

logger = logging.getLogger(__name__)

# Runtime override for kg_mode — set via /api/v1/kg/switch endpoint.
# Takes precedence over settings.kg_mode without requiring a restart.
_runtime_kg_mode: str | None = None


def set_kg_mode_override(mode: str) -> None:
    """Switch the active KG backend at runtime and reinitialise all dependents."""
    global _runtime_kg_mode
    _runtime_kg_mode = mode
    # Clear all caches that hold a reference to the old KGService instance
    get_kg_service.cache_clear()
    get_analysis_service.cache_clear()
    get_keyword_service.cache_clear()
    get_narrative_service.cache_clear()
    get_chat_agent.cache_clear()
    get_analysis_agent.cache_clear()
    get_link_prediction_service.cache_clear()
    logger.info("KG mode switched to '%s'; all dependent singletons reset.", mode)


# ── Service singletons ──────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_kg_service():
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    mode = _runtime_kg_mode or settings.kg_mode
    if mode == "neo4j":
        from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415

        svc = Neo4jKGService(
            url=settings.neo4j_url,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
        )
        logger.info("KGService initialised (mode=neo4j, url=%s)", settings.neo4j_url)
    else:
        from services.kg_service import KGService  # noqa: PLC0415

        svc = KGService(persistence_path=settings.kg_persistence_path)
        logger.info("KGService initialised (mode=networkx)")
    return svc


KGServiceDep = Annotated[Any, Depends(get_kg_service)]


@lru_cache(maxsize=1)
def get_doc_service():
    from services.document_service import DocumentService  # noqa: PLC0415

    return DocumentService()


DocServiceDep = Annotated[Any, Depends(get_doc_service)]


@lru_cache(maxsize=1)
def get_vector_service():
    from services.vector_service import VectorService  # noqa: PLC0415

    return VectorService()


VectorServiceDep = Annotated[Any, Depends(get_vector_service)]


@lru_cache(maxsize=1)
def get_llm():
    from config.settings import get_settings  # noqa: PLC0415
    from core.llm_client import get_llm_client  # noqa: PLC0415

    settings = get_settings()
    return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)


@lru_cache(maxsize=1)
def get_summary_service():
    from services.summary_service import SummaryService  # noqa: PLC0415

    return SummaryService(llm=get_llm())


@lru_cache(maxsize=1)
def get_extraction_service():
    from services.extraction_service import ExtractionService  # noqa: PLC0415

    return ExtractionService(llm=get_llm())


@lru_cache(maxsize=1)
def get_analysis_service():
    from services.analysis_service import AnalysisService  # noqa: PLC0415

    return AnalysisService(
        llm=get_llm(),
        kg_service=get_kg_service(),
        vector_service=get_vector_service(),
        keyword_service=get_keyword_service(),
    )


@lru_cache(maxsize=1)
def get_keyword_service():
    from services.keyword_service import KeywordService  # noqa: PLC0415

    return KeywordService(doc_service=get_doc_service(), kg_service=get_kg_service())


@lru_cache(maxsize=1)
def get_token_store():
    from config.settings import get_settings  # noqa: PLC0415
    from core.token_store import TokenUsageStore  # noqa: PLC0415

    settings = get_settings()
    return TokenUsageStore(db_path=settings.token_usage_db_path)


# ── Cache / analysis singletons ─────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_analysis_cache():
    from config.settings import get_settings  # noqa: PLC0415
    from services.analysis_cache import AnalysisCache  # noqa: PLC0415

    settings = get_settings()
    return AnalysisCache(db_path=settings.analysis_cache_db_path)


AnalysisCacheDep = Annotated[Any, Depends(get_analysis_cache)]


@lru_cache(maxsize=1)
def get_analysis_agent():
    from agents.analysis_agent import AnalysisAgent  # noqa: PLC0415

    return AnalysisAgent(
        analysis_service=get_analysis_service(),
        cache=get_analysis_cache(),
        narrative_service=get_narrative_service(),
        symbol_analysis_service=get_symbol_analysis_service(),
        symbol_service=get_symbol_service(),
        doc_service=get_doc_service(),
        kg_service=get_kg_service(),
    )


AnalysisAgentDep = Annotated[Any, Depends(get_analysis_agent)]


@lru_cache(maxsize=1)
def get_tension_service():
    from services.tension_service import TensionService  # noqa: PLC0415

    return TensionService(cache=get_analysis_cache())


TensionServiceDep = Annotated[Any, Depends(get_tension_service)]


@lru_cache(maxsize=1)
def get_narrative_service():
    from services.narrative_service import NarrativeService  # noqa: PLC0415

    return NarrativeService(
        kg_service=get_kg_service(),
        document_service=get_doc_service(),
        cache=get_analysis_cache(),
    )


NarrativeServiceDep = Annotated[Any, Depends(get_narrative_service)]


# ── Timeline / temporal singletons ──────────────────────────────────────────


@lru_cache(maxsize=1)
def get_global_timeline_service():
    from services.global_timeline_service import GlobalTimelineService  # noqa: PLC0415

    return GlobalTimelineService()


@lru_cache(maxsize=1)
def get_timeline_agent():
    from agents.timeline_agent import TimelineAgent  # noqa: PLC0415

    return TimelineAgent(llm=get_llm())


@lru_cache(maxsize=1)
def get_temporal_pipeline():
    from pipelines.temporal_pipeline import TemporalPipeline  # noqa: PLC0415

    return TemporalPipeline(
        kg_service=get_kg_service(),
        analysis_cache=get_analysis_cache(),
        timeline_agent=get_timeline_agent(),
        timeline_service=get_global_timeline_service(),
    )


TemporalPipelineDep = Annotated[Any, Depends(get_temporal_pipeline)]


# ── Chat agent ───────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_chat_agent():
    from agents.chat_agent import ChatAgent  # noqa: PLC0415

    return ChatAgent(
        kg_service=get_kg_service(),
        doc_service=get_doc_service(),
        vector_service=get_vector_service(),
        llm=get_llm(),
        extraction_service=get_extraction_service(),
        summary_service=get_summary_service(),
        analysis_service=get_analysis_service(),
        keyword_service=get_keyword_service(),
    )


ChatAgentDep = Annotated[Any, Depends(get_chat_agent)]


# ── Symbol / imagery singletons ─────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_symbol_service():
    from services.symbol_service import SymbolService  # noqa: PLC0415

    return SymbolService()


SymbolServiceDep = Annotated[Any, Depends(get_symbol_service)]


@lru_cache(maxsize=1)
def get_symbol_graph_service():
    from services.symbol_graph_service import SymbolGraphService  # noqa: PLC0415

    return SymbolGraphService()


SymbolGraphServiceDep = Annotated[Any, Depends(get_symbol_graph_service)]


@lru_cache(maxsize=1)
def get_symbol_analysis_service():
    from services.symbol_analysis_service import SymbolAnalysisService  # noqa: PLC0415

    return SymbolAnalysisService(cache=get_analysis_cache())


SymbolAnalysisServiceDep = Annotated[Any, Depends(get_symbol_analysis_service)]


# ── Epistemic State (F-03) ───────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_epistemic_state_service():
    from services.epistemic_state_service import EpistemicStateService  # noqa: PLC0415

    return EpistemicStateService(
        kg_service=get_kg_service(),
        llm=get_llm(),
        cache=get_analysis_cache(),
    )


EpistemicStateServiceDep = Annotated[Any, Depends(get_epistemic_state_service)]


# ── Voice Profiling (F-04) ───────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_voice_profiling_service():
    from services.voice_profiling_service import VoiceProfilingService  # noqa: PLC0415

    return VoiceProfilingService(
        kg_service=get_kg_service(),
        doc_service=get_doc_service(),
        llm=get_llm(),
        cache=get_analysis_cache(),
    )


VoiceProfilingServiceDep = Annotated[Any, Depends(get_voice_profiling_service)]


# ── Link Prediction (F-01) ───────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_link_prediction_store():
    from config.settings import get_settings  # noqa: PLC0415
    from services.link_prediction_store import LinkPredictionStore  # noqa: PLC0415

    settings = get_settings()
    return LinkPredictionStore(db_path=settings.link_prediction_db_path)


@lru_cache(maxsize=1)
def get_link_prediction_service():
    from services.link_prediction_service import LinkPredictionService  # noqa: PLC0415

    return LinkPredictionService(
        kg_service=get_kg_service(),
        store=get_link_prediction_store(),
    )


LinkPredictionServiceDep = Annotated[Any, Depends(get_link_prediction_service)]
