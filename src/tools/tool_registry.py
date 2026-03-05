"""Tool registry — central catalogue for all available tools.

Provides factory functions that return fully-wired tool instances with
injected services.  Phase 4 (Chat Agent) will call ``get_chat_tools()``
to obtain the LangGraph-compatible tool list.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import BaseTool

from tools.analysis_tools import AnalyzeCharacterTool, AnalyzeEventTool, GenerateInsightTool
from tools.graph_tools import (
    GetEntityAttributesTool,
    GetEntityRelationsTool,
    GetEntityTimelineTool,
    GetRelationPathsTool,
    GetRelationStatsTool,
    GetSubgraphTool,
)
from tools.other_tools import CompareEntitiesTool, ExtractEntitiesFromTextTool
from tools.retrieval_tools import GenSummaryTool, GetKeywordsTool, GetParagraphsTool, GetSummaryTool, VectorSearchTool


def get_chat_tools(
    *,
    kg_service: Any,
    doc_service: Any,
    vector_service: Any,
    llm: Any = None,
    extraction_service: Any = None,
    summary_service: Any = None,
    analysis_service: Any = None,
    keyword_service: Any = None,
) -> list[BaseTool]:
    """Return all tools available to the chat agent (Phase 4).

    Args:
        kg_service: KGService instance.
        doc_service: DocumentService instance.
        vector_service: VectorService instance.
        llm: Optional LangChain LLM (passed to stubs that need raw LLM).
        extraction_service: Optional ExtractionService for NER tool.
        summary_service: Optional SummaryService for on-demand summary generation.
        analysis_service: Optional AnalysisService for insight generation.
        keyword_service: Optional KeywordService for keyword retrieval.

    Returns:
        List of 14 fully-functional tools (stubs excluded from chat).
    """
    return [
        # Graph tools (6)
        GetEntityAttributesTool(kg_service=kg_service),
        GetEntityRelationsTool(kg_service=kg_service),
        GetEntityTimelineTool(kg_service=kg_service),
        GetRelationPathsTool(kg_service=kg_service),
        GetSubgraphTool(kg_service=kg_service),
        GetRelationStatsTool(kg_service=kg_service),
        # Retrieval tools (5)
        VectorSearchTool(vector_service=vector_service),
        GetSummaryTool(doc_service=doc_service),
        GetParagraphsTool(doc_service=doc_service),
        GenSummaryTool(doc_service=doc_service, summarizer=summary_service),
        GetKeywordsTool(keyword_service=keyword_service),
        # Analysis tools (1 — stubs excluded from chat)
        GenerateInsightTool(analysis_service=analysis_service),
        # Other tools (2)
        ExtractEntitiesFromTextTool(extraction_service=extraction_service),
        CompareEntitiesTool(kg_service=kg_service),
    ]


def get_analysis_tools(
    *,
    kg_service: Any,
    doc_service: Any,
    vector_service: Any,
    llm: Any = None,
    summary_service: Any = None,
    analysis_service: Any = None,
    keyword_service: Any = None,
) -> list[BaseTool]:
    """Return tools for the deep analysis workflow (Phase 5).

    Includes stubs that will be implemented with domain knowledge.
    """
    return [
        *get_chat_tools(
            kg_service=kg_service,
            doc_service=doc_service,
            vector_service=vector_service,
            llm=llm,
            summary_service=summary_service,
            analysis_service=analysis_service,
            keyword_service=keyword_service,
        ),
        AnalyzeCharacterTool(kg_service=kg_service, llm=llm),
        AnalyzeEventTool(kg_service=kg_service, llm=llm),
    ]


def get_all_tool_names() -> list[str]:
    """Return the names of all registered tools (for documentation)."""
    return [
        "get_entity_attributes",
        "get_entity_relations",
        "get_entity_timeline",
        "get_relation_paths",
        "get_subgraph",
        "get_relation_stats",
        "vector_search",
        "get_summary",
        "get_paragraphs",
        "gen_summary",
        "get_keywords",
        "generate_insight",
        "extract_entities_from_text",
        "compare_entities",
        # Stubs (Phase 5)
        "analyze_character",
        "analyze_event",
    ]
