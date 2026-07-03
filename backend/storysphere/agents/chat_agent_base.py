"""Shared logic for the chat agent.

Contains the system prompt, context builder, history builder, entity-state
update logic, and default LLM factory.
"""

from __future__ import annotations

import logging

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    ToolMessage,
)

from storysphere.agents.states import ChatState, Message

logger = logging.getLogger(__name__)

# How many trailing turns keep their full tool exchange when replayed. Older
# turns replay as assistant text only, bounding token growth.
TOOL_CONTEXT_TURNS = 1
# Per tool-result truncation when storing, bounding memory and replay tokens.
MAX_TOOL_CHARS = 2000

SYSTEM_PROMPT = """\
You are a novel analysis assistant. Help users explore story content using the available tools.

RESPONSE RULES:
- ALWAYS call the appropriate tool(s) FIRST before answering. Do NOT answer from general knowledge.
- ALWAYS answer the user's actual question. Do NOT dump raw tool output.
- Read the tool result, extract the relevant information, then compose a concise answer that directly addresses what the user asked.
- If the user asks "how many", give a number first, then details if helpful.
- If the user asks a yes/no question, answer yes or no first, then elaborate.
- Keep answers focused and conversational. Avoid repeating the same information the user already saw.
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
    """Build the full system prompt: static rules + dynamic page context."""
    parts: list[str] = [SYSTEM_PROMPT]

    if language and language.lower() not in ("auto", ""):
        parts.append(f"Always respond in {language}.")
    else:
        parts.append("Always reply in the same language the user uses.")

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
        focus_hint = f"The user is focused on entity \"{state.current_focus_entity}\""
        if state.current_focus_entity_id:
            focus_hint += f" (entity_id={state.current_focus_entity_id})"
        focus_hint += ". Pronouns (he/she/they/他/她) likely refer to this entity."
        if state.current_focus_entity_id:
            focus_hint += (
                " When calling tools that require entity_id, use this value."
            )
        parts.append(focus_hint)
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


def select_new_turn_messages(all_messages: list) -> list:
    """Return the messages a turn *appended* — everything after the last human.

    The graph is invoked with ``[System, *history, Human(query)]`` and appends
    the agent/tool exchange; the current query is the last ``HumanMessage``, so
    everything after it is this turn's new assistant/tool messages.
    """
    last_human = -1
    for i, m in enumerate(all_messages):
        if isinstance(m, HumanMessage):
            last_human = i
    return list(all_messages[last_human + 1:]) if last_human >= 0 else list(all_messages)


def build_history_entries(
    new_messages: list, max_tool_chars: int = MAX_TOOL_CHARS
) -> list[Message]:
    """Normalize a turn's LangGraph output messages into stored ``Message`` rows.

    Keeps assistant tool_calls and tool results so a later turn can replay the
    tool exchange. Tool-result content is truncated to bound stored size.
    """
    entries: list[Message] = []
    for m in new_messages:
        if isinstance(m, AIMessage):
            tool_calls = None
            if m.tool_calls:
                tool_calls = [
                    {"id": tc.get("id"), "name": tc.get("name"), "args": tc.get("args", {})}
                    for tc in m.tool_calls
                ]
            content = m.content if isinstance(m.content, str) else str(m.content)
            entries.append(
                Message(role="assistant", content=content, tool_calls=tool_calls)
            )
        elif isinstance(m, ToolMessage):
            content = m.content if isinstance(m.content, str) else str(m.content)
            if len(content) > max_tool_chars:
                content = content[:max_tool_chars] + "…[truncated]"
            entries.append(
                Message(
                    role="tool",
                    content=content,
                    tool_call_id=m.tool_call_id,
                    name=m.name,
                )
            )
    return entries


def build_history_messages(state: ChatState) -> list:
    """Convert ChatState conversation history to LangChain messages.

    Excludes the last message (the current query) since it's added separately.
    Only the most recent ``TOOL_CONTEXT_TURNS`` turn(s) replay their tool
    exchange (assistant tool_calls + tool results); older turns replay as
    assistant text only. This keeps the tool_call↔ToolMessage pairing intact
    (an orphaned tool_call is a provider API error) while bounding tokens.
    """
    history = state.conversation_history[:-1] if state.conversation_history else []

    # Window for tool replay: from the Nth-from-last user message onward.
    user_idxs = [i for i, m in enumerate(history) if m.role == "user"]
    window_start = (
        user_idxs[-TOOL_CONTEXT_TURNS] if len(user_idxs) >= TOOL_CONTEXT_TURNS else 0
    )

    msgs: list = []
    for i, m in enumerate(history):
        in_window = i >= window_start
        if m.role == "user":
            msgs.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            if in_window and m.tool_calls:
                msgs.append(
                    AIMessage(
                        content=m.content,
                        tool_calls=[
                            {
                                "name": tc.get("name"),
                                "args": tc.get("args", {}),
                                "id": tc.get("id"),
                                "type": "tool_call",
                            }
                            for tc in m.tool_calls
                        ],
                    )
                )
            elif m.content:
                # Plain text turn, or an out-of-window tool-call message whose
                # calls we drop — skip empty intermediates to avoid a bare msg.
                msgs.append(AIMessage(content=m.content))
        elif m.role == "tool" and in_window:
            msgs.append(
                ToolMessage(
                    content=m.content,
                    tool_call_id=m.tool_call_id,
                    name=m.name,
                )
            )
    return msgs


def update_entity_state(match, state: ChatState) -> None:
    """Update entity tracking state from a pattern match; always returns None.

    The agent loop always handles response generation — this function only
    performs the side-effect of recording entity mentions for pronoun resolution.
    """
    for entity in match.extracted_entities:
        state.add_entity_mention(entity)


def get_default_llm():
    """Return the default LLM with local fallback."""
    from storysphere.config.settings import get_settings  # noqa: PLC0415
    from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

    settings = get_settings()
    return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)
