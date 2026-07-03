"""Chat Agent — LangGraph-based streaming reasoning agent.

Builds a StateGraph (agent node + ToolNode) with:
- ``QueryPatternRecognizer`` pre-filter for entity tracking
- ``ChatState`` management (entity tracking, tool cache, pronoun resolution)
- Streaming support via ``astream(stream_mode="messages", version="v2")``
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from storysphere.agents.chat_agent_base import (
    SYSTEM_PROMPT,
    build_context_prompt,
    build_history_entries,
    build_history_messages,
    get_default_llm,
    select_new_turn_messages,
    update_entity_state,
)
from storysphere.agents.pattern_recognizer import QueryPatternRecognizer
from storysphere.agents.states import ChatState
from storysphere.core.token_callback import set_llm_service_context
from storysphere.tools.tool_registry import get_chat_tools

logger = logging.getLogger(__name__)


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
        self._llm = llm or get_default_llm()

        # Build the LangGraph agent
        self._system_prompt = system_prompt or SYSTEM_PROMPT
        self._graph = self._build_graph()

        # Pattern recognizer for entity tracking
        self._recognizer = QueryPatternRecognizer()
        # Known KG entity names per book, cached for dictionary-based extraction
        self._entity_name_cache: dict[str, list[str]] = {}

    def _build_graph(self):
        """Build a ReAct StateGraph: agent node ↔ ToolNode loop."""
        llm_with_tools = self._llm.bind_tools(self._tools)
        tool_node = ToolNode(self._tools)

        def call_model(state: MessagesState) -> dict:
            # SystemMessage is injected at invocation time as messages[0]
            # (see _agent_invoke and astream), so no static injection needed here.
            response = llm_with_tools.invoke(state["messages"])
            return {"messages": [response]}

        graph = StateGraph(MessagesState)
        graph.add_node("agent", call_model)
        graph.add_node("tools", tool_node)
        graph.add_edge(START, "agent")
        graph.add_conditional_edges("agent", tools_condition)
        graph.add_edge("tools", "agent")
        return graph.compile()

    def _build_messages(
        self, query: str, language: str, state: ChatState | None
    ) -> list:
        """Assemble LLM input: system context + replayed history + current query.

        Shared by ``astream`` and ``_agent_invoke``. When ``state`` is None
        (no page context), fall back to a minimal language directive.
        """
        from langchain_core.messages import SystemMessage  # noqa: PLC0415

        if state is not None:
            context_prompt = build_context_prompt(state, language)
            history = build_history_messages(state)
        else:
            context_prompt = (
                f"Always respond in {language}."
                if language and language.lower() not in ("auto", "")
                else "Always reply in the same language the user uses."
            )
            history = []
        return [SystemMessage(content=context_prompt), *history, HumanMessage(content=query)]

    async def _known_entity_names(self, book_id: str | None) -> list[str]:
        """Return known KG entity names (+aliases) for the current book, cached.

        Feeds dictionary-based entity extraction so names the regex heuristics
        miss — notably bare Chinese names — still resolve. Cached per book_id
        for the life of the agent; entities are stable within a chat session.
        """
        if not book_id:
            return []
        if book_id not in self._entity_name_cache:
            try:
                entities = await self._kg_service.list_entities(document_id=book_id)
            except Exception:
                logger.exception("Failed to list entities for book %s", book_id)
                return []
            names: list[str] = []
            seen: set[str] = set()
            for entity in entities:
                for candidate in (entity.name, *getattr(entity, "aliases", [])):
                    if candidate and candidate.lower() not in seen:
                        seen.add(candidate.lower())
                        names.append(candidate)
            self._entity_name_cache[book_id] = names
        return self._entity_name_cache[book_id]

    def _preprocess(
        self,
        query: str,
        state: ChatState,
        known_entities: list[str] | None = None,
    ) -> tuple[str, Any]:
        """Resolve pronouns, record the user turn, and run pattern recognition.

        Returns ``(possibly pronoun-resolved query, PatternMatch | None)``.

        ``update_entity_state`` here sets ``current_focus_entity`` *before* the
        agent loop so the system prompt reflects the focused entity this turn.
        This is the chat<->KG entity-alignment tracker — NOT duplicate
        bookkeeping against ``_postprocess``; do not "de-dup" the two.
        """
        resolved = state.resolve_pronoun(query.strip())
        if resolved and len(query.split()) <= 3:
            query = query.replace(query.strip(), resolved)

        state.add_message("user", query)

        match = self._recognizer.recognize(query, known_entities)
        if match and match.confidence > 0.8:
            update_entity_state(match, state)
        return query, match

    def _postprocess(
        self,
        response: str,
        match: Any,
        state: ChatState,
        output_messages: list | None = None,
    ) -> None:
        """Record the assistant turn, entity mentions, and trim history.

        When ``output_messages`` (the graph's full message list) is given, this
        turn's tool exchange is persisted so a follow-up can see tool results,
        not just the summary text. Without it, only the assistant text is stored
        (e.g. the streaming error fallback).

        The entity mentions recorded here feed pronoun resolution on the *next*
        turn; kept intentionally separate from ``_preprocess``'s focus-setting
        (see the note there).
        """
        entries = (
            build_history_entries(select_new_turn_messages(output_messages))
            if output_messages
            else None
        )
        if entries:
            state.record_agent_turn(entries)
        else:
            state.add_message("assistant", response)
        if match:
            state.last_query_type = match.pattern_name
            for entity in match.extracted_entities:
                state.add_entity_mention(entity)
        state.trim_history(max_turns=20)

    async def chat(
        self, query: str, state: ChatState, language: str = "en"
    ) -> str:
        """Single-turn chat: returns the final assistant response text.

        1. Run QueryPatternRecognizer for entity tracking side-effects
        2. Run full LangGraph ReAct loop
        3. Update ChatState with entity mentions and tool results
        """
        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        known = await self._known_entity_names(state.book_id)
        # timer() records record_agent_query (success/latency/error) on exit.
        with get_metrics().timer("agent_query", "agent_loop"):
            query, match = self._preprocess(query, state, known)
            response, output_messages = await self._agent_invoke(
                query, language=language, state=state
            )
            self._postprocess(response, match, state, output_messages)
            return response

    async def astream(
        self, query: str, state: ChatState, language: str = "en"
    ) -> AsyncGenerator[str, None]:
        """Streaming chat: yields token chunks as they arrive.

        1. Run QueryPatternRecognizer for entity tracking side-effects
        2. Run full LangGraph ReAct loop with token streaming
        3. Falls back to non-streaming _agent_invoke if streaming fails
        """
        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        _success, _error = True, None
        try:
            known = await self._known_entity_names(state.book_id)
            query, match = self._preprocess(query, state, known)

            from langchain_core.messages import AIMessageChunk  # noqa: PLC0415

            messages = self._build_messages(query, language, state)
            set_llm_service_context("chat")
            full_response = ""
            # Captured from the "values" stream so the tool exchange persists.
            output_messages: list | None = None
            try:
                # Combined mode: "messages" streams tokens; "values" yields the
                # accumulated state, whose final messages carry the tool exchange.
                async for mode, data in self._graph.astream(
                    {"messages": messages}, stream_mode=["messages", "values"],
                ):
                    if mode == "values":
                        output_messages = data.get("messages", output_messages)
                        continue
                    message_chunk, _ = data
                    # Only yield AI message chunks from the agent node,
                    # skip tool calls, tool results, and replayed history
                    if (
                        isinstance(message_chunk, AIMessageChunk)
                        and message_chunk.content
                        and not message_chunk.tool_calls
                        and not message_chunk.tool_call_chunks
                    ):
                        text = message_chunk.content if isinstance(message_chunk.content, str) else ""
                        if text:
                            full_response += text
                            yield text
            except Exception:
                logger.exception("Streaming failed, falling back to non-streaming")
                try:
                    result, output_messages = await self._agent_invoke(
                        query, language=language, state=state
                    )
                    full_response = result
                    yield result
                except Exception:
                    logger.exception("Non-streaming fallback also failed")
                    fallback = "抱歉，處理您的問題時發生錯誤，請稍後再試。"
                    full_response = fallback
                    output_messages = None
                    yield fallback

            if not full_response:
                fallback = "抱歉，無法生成回應，請嘗試換個方式提問。"
                full_response = fallback
                output_messages = None
                yield fallback

            # Save the full response to state for history continuity
            if full_response:
                self._postprocess(full_response, match, state, output_messages)
        except Exception as exc:
            _success, _error = False, type(exc).__name__
            raise
        finally:
            # Mirror chat()'s agent_query metric on the production (stream) path.
            # Manual try/finally (not timer's sync CM) to stay safe across an
            # async generator's aclose()/GeneratorExit.
            _metrics.record_agent_query(
                success=_success,
                latency_ms=(time.perf_counter() - _t0) * 1000,
                route="agent_stream",
                error=_error,
            )

    async def _agent_invoke(
        self, query: str, language: str = "en", state: ChatState | None = None
    ) -> tuple[str, list]:
        """Invoke the LangGraph agent.

        Returns ``(final response text, full output message list)``; the message
        list lets the caller persist this turn's tool exchange.
        """
        from storysphere.core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        messages = self._build_messages(query, language, state)
        set_llm_service_context("chat")
        result = await self._graph.ainvoke({"messages": messages})

        # Extract the last AI message; record tool selections from ToolMessages
        output_messages = result.get("messages", [])
        for msg in output_messages:
            if isinstance(msg, ToolMessage) and msg.name:
                _metrics.record_tool_selection(msg.name, source="agent_loop")

        for msg in reversed(output_messages):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content, output_messages
        fallback = "I could not generate a response. Please try rephrasing your question."
        return fallback, output_messages
