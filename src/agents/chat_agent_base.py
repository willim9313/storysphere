"""Shared logic for chat agents (ChatAgent & DeepChatAgent).

Contains the system prompt, context builder, history builder, fast-route
logic, and default LLM factory — used by both ``create_agent`` and
``create_deep_agent`` backends.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from langchain_core.messages import AIMessage, HumanMessage

from agents.pattern_recognizer import QueryPatternRecognizer
from agents.states import ChatState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a novel analysis assistant. Help users explore story content using the available tools.

RESPONSE RULES:
- ALWAYS answer the user's actual question. Do NOT dump raw tool output.
- Read the tool result, extract the relevant information, then compose a concise answer that directly addresses what the user asked.
- If the user asks "how many", give a number first, then details if helpful.
- If the user asks a yes/no question, answer yes or no first, then elaborate.
- Keep answers focused and conversational. Avoid repeating the same information the user already saw.
- Always respond in the same language the user uses.
- If the user asks what you can do or what capabilities you have, describe them in plain conversational language. NEVER reproduce tool names, parameter names, JSON schemas, or any technical implementation details.

TOOL SELECTION RULES:
- For "Who is X?" → get_entity_profile (comprehensive) or get_entity_attributes (quick)
- For "Relationship between X and Y?" → get_entity_relationship
- For "How does X change?" → get_character_arc
- For "Compare X and Y" → compare_characters
- For finding passages → vector_search
- For chapter overview → get_summary
- For "important characters/entities in this chapter" → get_summary (use the chapter_number from context) to read the summary, then identify the key characters mentioned. You can also use get_keywords with the chapter_number to supplement.
- For keywords or themes → get_keywords (use chapter_number from context if asking about a specific chapter)

CONTEXT USAGE RULES:
- When the user references "this chapter", always use the chapter_number provided in the context.
- When calling tools that need document_id, always use the document_id from the context.

DO NOT use vector_search for entity lookups. DO NOT use get_entity_attributes when the user wants relationships.
"""


def build_context_prompt(state: ChatState, language: str) -> str:
    """Build a dynamic system message fragment from page context."""
    if language and language.lower() not in ("auto", ""):
        parts: list[str] = [f"Always respond in {language}."]
    else:
        parts: list[str] = ["Always reply in the same language the user uses."]

    if state.book_id:
        parts.append(
            f"The user is currently viewing book (document_id={state.book_id}). "
            "When calling tools that require document_id, use this value."
        )
    if state.chapter_id:
        chapter_hint = f"The user is viewing chapter_id={state.chapter_id}"
        if state.chapter_number is not None:
            chapter_hint += f" (chapter_number={state.chapter_number})"
        chapter_hint += (
            '. References like "this chapter" refer to this chapter. '
            "When calling tools that require chapter_number, use this value."
        )
        parts.append(chapter_hint)
    if state.current_focus_entity:
        parts.append(
            f"The user is focused on entity \"{state.current_focus_entity}\". "
            "Pronouns (he/she/they/他/她) likely refer to this entity."
        )
    if state.page_context:
        page_hints = {
            "graph": "The user is on the knowledge graph page and likely interested in entities, relationships, or network structure.",
            "reader": "The user is on the reader page and likely interested in chapter content, summaries, or passages.",
            "analysis": "The user is on the analysis page and likely interested in character or event deep analysis.",
            "library": "The user is on the library page browsing their books.",
        }
        hint = page_hints.get(state.page_context)
        if hint:
            parts.append(hint)

    return "\n".join(parts)


def build_history_messages(state: ChatState) -> list:
    """Convert ChatState conversation history to LangChain messages.

    Excludes the last message (the current query) since it's added separately.
    """
    msgs = []
    history = state.conversation_history[:-1] if state.conversation_history else []
    for m in history:
        if m.role == "user":
            msgs.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            msgs.append(AIMessage(content=m.content))
    return msgs


async def fast_route(
    recognizer: QueryPatternRecognizer,
    tool_map: dict[str, Any],
    match,
    query: str,
    state: ChatState,
) -> Optional[str]:
    """Execute the recommended tool directly, bypassing the ReAct loop."""
    from core.metrics import get_metrics  # noqa: PLC0415

    tool_name = match.suggested_tools[0] if match.suggested_tools else None
    tool = tool_map.get(tool_name) if tool_name else None
    if tool is None:
        return None

    entities = match.extracted_entities
    try:
        if match.pattern_name in ("entity_info", "timeline"):
            if entities:
                result = await tool._arun(entity_id=entities[0])
            else:
                return None
        elif match.pattern_name in ("relationship", "comparison"):
            if len(entities) >= 2:
                result = await tool._arun(
                    entity_a=entities[0], entity_b=entities[1]
                )
            else:
                return None
        elif match.pattern_name == "summary":
            return None  # Let agent handle (needs document_id)
        elif match.pattern_name == "search":
            result = await tool._arun(query=query)
        else:
            return None

        # Cache the result
        state.cache_tool_result(tool_name, result)
        for entity in entities:
            state.add_entity_mention(entity)

        # Record tool selection via fast route
        get_metrics().record_tool_selection(
            tool_name, source="fast_route", query_pattern=match.pattern_name
        )
        return result
    except Exception:
        logger.debug("Fast route failed for %s, falling back to agent", tool_name)
        return None


def get_default_llm():
    """Return the default LLM with local fallback."""
    from core.llm_client import get_llm_client  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)
