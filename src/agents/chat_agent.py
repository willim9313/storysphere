"""Chat Agent — LangGraph-based streaming reasoning agent.

Wraps a ``create_react_agent`` graph with:
- ``QueryPatternRecognizer`` pre-filter for fast-routing common queries
- ``ChatState`` management (entity tracking, tool cache, pronoun resolution)
- Streaming support via ``astream_events(version="v2")``
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any, Optional

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.prebuilt import create_react_agent

from agents.pattern_recognizer import QueryPatternRecognizer
from agents.states import ChatState
from tools.tool_registry import get_chat_tools

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a novel analysis assistant. Help users explore story content using the available tools.

RESPONSE RULES:
- ALWAYS answer the user's actual question. Do NOT dump raw tool output.
- Read the tool result, extract the relevant information, then compose a concise answer that directly addresses what the user asked.
- If the user asks "how many", give a number first, then details if helpful.
- If the user asks a yes/no question, answer yes or no first, then elaborate.
- Keep answers focused and conversational. Avoid repeating the same information the user already saw.
- Always respond in the same language the user uses.

TOOL SELECTION RULES:
- For "Who is X?" → get_entity_profile (comprehensive) or get_entity_attributes (quick)
- For "Relationship between X and Y?" → get_entity_relationship
- For "How does X change?" → get_character_arc
- For "Compare X and Y" → compare_characters
- For finding passages → vector_search
- For chapter overview → get_summary

DO NOT use vector_search for entity lookups. DO NOT use get_entity_attributes when the user wants relationships.
"""


class ChatAgent:
    """LangGraph-based chat agent for novel analysis.

    Usage::

        agent = ChatAgent(kg_service=kg, doc_service=doc, vector_service=vec)
        state = ChatState()
        answer = await agent.chat("Who is Alice?", state)
    """

    def __init__(
        self,
        *,
        kg_service: Any,
        doc_service: Any,
        vector_service: Any,
        llm: Any = None,
        extraction_service: Any = None,
        summary_service: Any = None,
        analysis_service: Any = None,
        keyword_service: Any = None,
        system_prompt: str | None = None,
    ) -> None:
        self._kg_service = kg_service
        self._doc_service = doc_service
        self._vector_service = vector_service
        self._analysis_service = analysis_service

        # Build tools
        self._tools = get_chat_tools(
            kg_service=kg_service,
            doc_service=doc_service,
            vector_service=vector_service,
            llm=llm,
            extraction_service=extraction_service,
            summary_service=summary_service,
            analysis_service=analysis_service,
            keyword_service=keyword_service,
        )
        self._tool_map = {t.name: t for t in self._tools}

        # LLM
        self._llm = llm or self._default_llm()

        # Build the LangGraph agent
        self._system_prompt = system_prompt or _SYSTEM_PROMPT
        self._graph = create_react_agent(
            model=self._llm,
            tools=self._tools,
            prompt=self._system_prompt,
        )

        # Fast-route recognizer
        self._recognizer = QueryPatternRecognizer()

    @staticmethod
    def _build_context_prompt(state: ChatState, language: str) -> str:
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
            parts.append(
                f"The user is viewing chapter_id={state.chapter_id}. "
                'References like "this chapter" refer to this chapter.'
            )
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

    @staticmethod
    def _build_history_messages(state: ChatState) -> list:
        """Convert ChatState conversation history to LangChain messages.

        Excludes the last message (the current query) since it's added separately.
        """
        msgs = []
        # All but the last message (which is the current user query just added)
        history = state.conversation_history[:-1] if state.conversation_history else []
        for m in history:
            if m.role == "user":
                msgs.append(HumanMessage(content=m.content))
            elif m.role == "assistant":
                msgs.append(AIMessage(content=m.content))
        return msgs

    @staticmethod
    def _default_llm():
        from core.llm_client import get_llm_client  # noqa: PLC0415

        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        return get_llm_client().get_with_local_fallback(temperature=settings.chat_agent_temperature)

    async def chat(
        self, query: str, state: ChatState, language: str = "en"
    ) -> str:
        """Single-turn chat: returns the final assistant response text.

        1. Try fast route via QueryPatternRecognizer
        2. Fall back to full LangGraph ReAct loop
        3. Update ChatState with entity mentions and tool results
        """
        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        _route = "agent_loop"

        try:
            # Pronoun resolution
            resolved = state.resolve_pronoun(query.strip())
            if resolved and len(query.split()) <= 3:
                query = query.replace(query.strip(), resolved)

            state.add_message("user", query)

            # Fast route
            match = self._recognizer.recognize(query)
            if match and match.confidence > 0.8:
                result = await self._fast_route(match, query, state)
                if result is not None:
                    state.add_message("assistant", result)
                    state.last_query_type = match.pattern_name
                    _route = "fast_route"
                    _metrics.record_agent_query(
                        success=True,
                        latency_ms=(time.perf_counter() - _t0) * 1000,
                        route=_route,
                    )
                    return result

            # Full agent loop
            response = await self._agent_invoke(query, language=language, state=state)

            # Update state
            state.add_message("assistant", response)
            if match:
                state.last_query_type = match.pattern_name
                for entity in match.extracted_entities:
                    state.add_entity_mention(entity)

            state.trim_history(max_turns=20)
            _metrics.record_agent_query(
                success=True,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                route=_route,
            )
            return response
        except Exception as exc:
            _metrics.record_agent_query(
                success=False,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                route=_route,
                error=type(exc).__name__,
            )
            raise

    async def astream(
        self, query: str, state: ChatState, language: str = "en"
    ) -> AsyncGenerator[str, None]:
        """Streaming chat: yields token chunks as they arrive.

        Falls back to non-streaming ``chat()`` if streaming is not supported.
        """
        state.add_message("user", query)

        from langchain_core.messages import SystemMessage  # noqa: PLC0415

        context_prompt = self._build_context_prompt(state, language)
        history = self._build_history_messages(state)
        messages = [
            SystemMessage(content=context_prompt),
            *history,
            HumanMessage(content=query),
        ]
        try:
            async for event in self._graph.astream_events(
                {"messages": messages}, version="v2"
            ):
                kind = event.get("event", "")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield chunk.content
        except Exception:
            logger.exception("Streaming failed, falling back to non-streaming")
            result = await self._agent_invoke(query, language=language, state=state)
            yield result

    async def _fast_route(
        self, match, query: str, state: ChatState
    ) -> Optional[str]:
        """Execute the recommended tool directly, bypassing the ReAct loop."""
        from core.metrics import get_metrics  # noqa: PLC0415

        tool_name = match.suggested_tools[0] if match.suggested_tools else None
        tool = self._tool_map.get(tool_name) if tool_name else None
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

    async def _agent_invoke(
        self, query: str, language: str = "en", state: ChatState | None = None
    ) -> str:
        """Invoke the LangGraph agent and extract the final response text."""
        from langchain_core.messages import SystemMessage  # noqa: PLC0415

        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        context_prompt = (
            self._build_context_prompt(state, language)
            if state
            else (
                f"Always respond in {language}."
                if language and language.lower() not in ("auto", "")
                else "Always reply in the same language the user uses."
            )
        )
        history = self._build_history_messages(state) if state else []
        messages = [
            SystemMessage(content=context_prompt),
            *history,
            HumanMessage(content=query),
        ]
        result = await self._graph.ainvoke({"messages": messages})

        # Extract the last AI message; record tool selections from ToolMessages
        output_messages = result.get("messages", [])
        for msg in output_messages:
            if isinstance(msg, ToolMessage) and msg.name:
                _metrics.record_tool_selection(msg.name, source="agent_loop")

        for msg in reversed(output_messages):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content
        return "I could not generate a response. Please try rephrasing your question."
