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
from tools.other_tools import CompareEntitiesTool, ExtractEntitiesFromTextTool, GetChapterSummaryTool
from tools.retrieval_tools import GetParagraphsTool, GetSummaryTool, VectorSearchTool


def get_chat_tools(
    *,
    kg_service: Any,
    doc_service: Any,
    vector_service: Any,
    llm: Any = None,
    entity_extractor: Any = None,
) -> list[BaseTool]:
    """Return all tools available to the chat agent (Phase 4).

    Args:
        kg_service: KGService instance.
        doc_service: DocumentService instance.
        vector_service: VectorService instance.
        llm: Optional LangChain LLM for insight generation.
        entity_extractor: Optional EntityExtractor for NER tool.

    Returns:
        List of 13 fully-functional tools (stubs excluded from chat).
    """
    return [
        # Graph tools (6)
        GetEntityAttributesTool(kg_service=kg_service),
        GetEntityRelationsTool(kg_service=kg_service),
        GetEntityTimelineTool(kg_service=kg_service),
        GetRelationPathsTool(kg_service=kg_service),
        GetSubgraphTool(kg_service=kg_service),
        GetRelationStatsTool(kg_service=kg_service),
        # Retrieval tools (3)
        VectorSearchTool(vector_service=vector_service),
        GetSummaryTool(doc_service=doc_service),
        GetParagraphsTool(doc_service=doc_service),
        # Analysis tools (1 — stubs excluded from chat)
        GenerateInsightTool(llm=llm),
        # Other tools (3)
        ExtractEntitiesFromTextTool(entity_extractor=entity_extractor),
        CompareEntitiesTool(kg_service=kg_service),
        GetChapterSummaryTool(doc_service=doc_service),
    ]


def get_analysis_tools(
    *,
    kg_service: Any,
    doc_service: Any,
    vector_service: Any,
    llm: Any = None,
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
        "generate_insight",
        "extract_entities_from_text",
        "compare_entities",
        "get_chapter_summary",
        # Stubs (Phase 5)
        "analyze_character",
        "analyze_event",
    ]
