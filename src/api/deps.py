"""FastAPI dependency injection — Services and Agents as singletons.

All heavy objects (KGService, ChatAgent, etc.) are created once on first
request via ``functools.lru_cache`` and reused for the lifetime of the process.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

logger = logging.getLogger(__name__)


# ── Service singletons ────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_kg_service():
    from config.settings import get_settings  # noqa: PLC0415
    from services.kg_service import KGService  # noqa: PLC0415

    settings = get_settings()
    svc = KGService(persistence_path=settings.kg_persistence_path)
    logger.info("KGService initialised (mode=%s)", settings.kg_mode)
    return svc


@lru_cache(maxsize=1)
def get_doc_service():
    from services.document_service import DocumentService  # noqa: PLC0415

    return DocumentService()


@lru_cache(maxsize=1)
def get_vector_service():
    from services.vector_service import VectorService  # noqa: PLC0415

    return VectorService()


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


# ── Agent singletons ──────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_analysis_cache():
    from services.analysis_cache import AnalysisCache  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    return AnalysisCache(db_path=settings.analysis_cache_db_path)


@lru_cache(maxsize=1)
def get_analysis_agent():
    from agents.analysis_agent import AnalysisAgent  # noqa: PLC0415

    return AnalysisAgent(
        analysis_service=get_analysis_service(),
        cache=get_analysis_cache(),
        narrative_service=get_narrative_service(),
    )


@lru_cache(maxsize=1)
def get_tension_service():
    from services.tension_service import TensionService  # noqa: PLC0415

    return TensionService(cache=get_analysis_cache())


@lru_cache(maxsize=1)
def get_narrative_service():
    from services.narrative_service import NarrativeService  # noqa: PLC0415

    return NarrativeService(
        kg_service=get_kg_service(),
        document_service=get_doc_service(),
        cache=get_analysis_cache(),
    )


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


# ── Annotated type aliases (use in router function signatures) ─────────────────

KGServiceDep = Annotated[any, Depends(get_kg_service)]
DocServiceDep = Annotated[any, Depends(get_doc_service)]
VectorServiceDep = Annotated[any, Depends(get_vector_service)]
AnalysisCacheDep = Annotated[any, Depends(get_analysis_cache)]
AnalysisAgentDep = Annotated[any, Depends(get_analysis_agent)]
ChatAgentDep = Annotated[any, Depends(get_chat_agent)]
TemporalPipelineDep = Annotated[any, Depends(get_temporal_pipeline)]
TensionServiceDep = Annotated[any, Depends(get_tension_service)]
NarrativeServiceDep = Annotated[any, Depends(get_narrative_service)]
