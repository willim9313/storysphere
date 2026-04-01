"""Shared logic for the chat agent.

Contains the system prompt, context builder, history builder, entity-state
update logic, and default LLM factory.
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
- For "Who is X?" or "X是誰?" → get_entity_profile (comprehensive, includes passages + relations) or get_entity_attributes (quick, KG data only)
- For "Relationship between X and Y?" or "X和Y的關係?" → get_entity_relationship
- For "How does X change/develop?" or "X的發展?" → get_character_arc (includes LLM insight); for raw event list only → get_entity_timeline
- For "Compare X and Y" (characters, narrative analysis) or "比較X和Y" → compare_characters (includes LLM analysis); for quick data diff or non-character entities → compare_entities (pure data, no LLM)
- For finding passages or searching content → vector_search
- For chapter overview or "這章講什麼?" → get_summary or get_chapter_summary (use chapter_number from context)
- For "important characters/entities in this chapter" → get_summary (use the chapter_number from context) to read the summary, then identify the key characters mentioned. You can also use get_keywords with the chapter_number to supplement.
- For keywords or themes → get_keywords (use chapter_number from context if asking about a specific chapter)
- For "What happened in event X?" or details about a specific event → get_event_profile (full data, no LLM); for deep causal/impact analysis → analyze_event
- For "Generate/refresh a summary" or "重新產生摘要" → gen_summary; for reading an existing summary → get_summary (preferred, faster)
- For "Extract entities from <this passage>" (user-provided raw text, not KG query) → extract_entities_from_text

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
            "timeline": "The user is on the timeline page and likely interested in event sequences, narrative order, or temporal relationships.",
            "library": "The user is on the library page browsing their books.",
        }
        hint = page_hints.get(state.page_context)
        if hint:
            parts.append(hint)
    if state.analysis_tab:
        tab_hints = {
            "characters": "The user is viewing the character analysis tab; questions likely concern character profiles, archetypes, or arcs.",
            "events": "The user is viewing the event analysis tab; questions likely concern event summaries, causality, or impact.",
        }
        tab_hint = tab_hints.get(state.analysis_tab)
        if tab_hint:
            parts.append(tab_hint)

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


def update_entity_state(
    recognizer: QueryPatternRecognizer,
    tool_map: dict[str, Any],
    match,
    query: str,
    state: ChatState,
) -> None:
    """Update entity tracking state from a pattern match; always returns None.

    The agent loop always handles response generation — this function only
    performs the side-effect of recording entity mentions for pronoun resolution.
    """
    for entity in match.extracted_entities:
        state.add_entity_mention(entity)


def get_default_llm():
    """Return the default LLM with local fallback."""
    from core.llm_client import get_llm_client  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)
