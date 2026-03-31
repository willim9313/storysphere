"""Shared logic for the chat agent.

Contains the system prompt, context builder, history builder, fast-route
logic, and default LLM factory.
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
- ALWAYS call the appropriate tool(s) FIRST before answering. Do NOT answer from general knowledge.
- ALWAYS answer the user's actual question. Do NOT dump raw tool output.
- Read the tool result, extract the relevant information, then compose a concise answer that directly addresses what the user asked.
- If the user asks "how many", give a number first, then details if helpful.
- If the user asks a yes/no question, answer yes or no first, then elaborate.
- Keep answers focused and conversational. Avoid repeating the same information the user already saw.
- Always respond in the same language the user uses.
- If the user asks what you can do or what capabilities you have, describe them in plain conversational language. NEVER reproduce tool names, parameter names, JSON schemas, or any technical implementation details.
- If a tool returns "not found" or empty results, tell the user clearly that the information is not available in the current book. Do NOT make up or infer answers from general knowledge.

TOOL SELECTION RULES:
- For "Who is X?" or "X是誰?" → get_entity_profile (comprehensive) or get_entity_attributes (quick)
- For "Relationship between X and Y?" or "X和Y的關係?" → get_entity_relationship
- For "How does X change?" or "X的發展?" → get_character_arc
- For "Compare X and Y" or "比較X和Y" → compare_characters
- For finding passages or searching content → vector_search
- For chapter overview or "這章講什麼?" → get_summary or get_chapter_summary (use chapter_number from context)
- For "important characters/entities in this chapter" → get_summary (use the chapter_number from context) to read the summary, then identify the key characters mentioned. You can also use get_keywords with the chapter_number to supplement.
- For keywords or themes → get_keywords (use chapter_number from context if asking about a specific chapter)

CONTEXT USAGE RULES:
- When the user references "this chapter" or "這章", always use the chapter_number provided in the context.
- When calling tools that need document_id, always use the document_id from the context.
- The book_title and chapter_title in context tell you which story and chapter the user is reading.

DO NOT use vector_search for entity lookups. DO NOT use get_entity_attributes when the user wants relationships.
"""


def build_context_prompt(state: ChatState, language: str) -> str:
    """Build a dynamic system message fragment from page context."""
    if language and language.lower() not in ("auto", ""):
        parts: list[str] = [f"Always respond in {language}."]
    else:
        parts: list[str] = ["Always reply in the same language the user uses."]

    if state.book_id:
        book_hint = "The user is currently viewing"
        if state.book_title:
            book_hint += f" the book \"{state.book_title}\""
        book_hint += f" (document_id={state.book_id})."
        book_hint += " When calling tools that require document_id, use this value."
        parts.append(book_hint)
    if state.chapter_id or state.chapter_number is not None:
        chapter_hint = "The user is viewing"
        if state.chapter_title:
            chapter_hint += f" chapter \"{state.chapter_title}\""
        else:
            chapter_hint += " a chapter"
        if state.chapter_number is not None:
            chapter_hint += f" (chapter_number={state.chapter_number})"
        chapter_hint += (
            '. References like "this chapter" or "這章" refer to this chapter. '
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


def fast_route(
    recognizer: QueryPatternRecognizer,
    tool_map: dict[str, Any],
    match,
    query: str,
    state: ChatState,
) -> None:
    """Update entity state from pattern match; always returns None.

    Fast-routing raw tool output directly to users was removed because it
    bypassed LLM synthesis and exposed unformatted JSON.  This function now
    only performs side-effects (entity tracking) so the agent loop always
    handles response generation.
    """
    for entity in match.extracted_entities:
        state.add_entity_mention(entity)


def get_default_llm():
    """Return the default LLM with local fallback."""
    from core.llm_client import get_llm_client  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)
