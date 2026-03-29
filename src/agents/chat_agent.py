"""Chat Agent — LangGraph-based streaming reasoning agent.

Wraps a ``create_agent`` graph with:
- ``QueryPatternRecognizer`` pre-filter for fast-routing common queries
- ``ChatState`` management (entity tracking, tool cache, pronoun resolution)
- Streaming support via ``astream(stream_mode="messages", version="v2")``
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any, Optional

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agents.chat_agent_base import (
    SYSTEM_PROMPT,
    build_context_prompt,
    build_history_messages,
    fast_route,
    get_default_llm,
)
from agents.pattern_recognizer import QueryPatternRecognizer
from agents.states import ChatState
from core.token_callback import set_llm_service_context
from tools.tool_registry import get_chat_tools

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
        self._graph = create_agent(
            model=self._llm,
            tools=self._tools,
            system_prompt=self._system_prompt,
        )

        # Fast-route recognizer
        self._recognizer = QueryPatternRecognizer()

    async def chat(
        self, query: str, state: ChatState, language: str = "en"
    ) -> str:
        """Single-turn chat: returns the final assistant response text.

        1. Run QueryPatternRecognizer for entity tracking side-effects
        2. Run full LangGraph ReAct loop
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

            # Pattern recognition (entity tracking side-effects only)
            match = self._recognizer.recognize(query)
            if match and match.confidence > 0.8:
                fast_route(self._recognizer, self._tool_map, match, query, state)

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

        1. Run QueryPatternRecognizer for entity tracking side-effects
        2. Run full LangGraph ReAct loop with token streaming
        3. Falls back to non-streaming _agent_invoke if streaming fails
        """
        # Pronoun resolution
        resolved = state.resolve_pronoun(query.strip())
        if resolved and len(query.split()) <= 3:
            query = query.replace(query.strip(), resolved)

        state.add_message("user", query)

        # Pattern recognition (entity tracking side-effects only)
        match = self._recognizer.recognize(query)
        if match and match.confidence > 0.8:
            fast_route(self._recognizer, self._tool_map, match, query, state)

        from langchain_core.messages import AIMessageChunk, SystemMessage  # noqa: PLC0415

        context_prompt = build_context_prompt(state, language)
        history = build_history_messages(state)
        messages = [
            SystemMessage(content=context_prompt),
            *history,
            HumanMessage(content=query),
        ]
        set_llm_service_context("chat")
        full_response = ""
        try:
            async for chunk in self._graph.astream(
                {"messages": messages}, stream_mode="messages", version="v2"
            ):
                if chunk.get("type") == "messages":
                    message_chunk, _ = chunk["data"]
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
                result = await self._agent_invoke(query, language=language, state=state)
                full_response = result
                yield result
            except Exception:
                logger.exception("Non-streaming fallback also failed")
                fallback = "抱歉，處理您的問題時發生錯誤，請稍後再試。"
                full_response = fallback
                yield fallback

        if not full_response:
            fallback = "抱歉，無法生成回應，請嘗試換個方式提問。"
            full_response = fallback
            yield fallback

        # Save the full response to state for history continuity
        if full_response:
            state.add_message("assistant", full_response)
            if match:
                state.last_query_type = match.pattern_name
                for entity in match.extracted_entities:
                    state.add_entity_mention(entity)
            state.trim_history(max_turns=20)

    async def _agent_invoke(
        self, query: str, language: str = "en", state: ChatState | None = None
    ) -> str:
        """Invoke the LangGraph agent and extract the final response text."""
        from langchain_core.messages import SystemMessage  # noqa: PLC0415

        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        context_prompt = (
            build_context_prompt(state, language)
            if state
            else (
                f"Always respond in {language}."
                if language and language.lower() not in ("auto", "")
                else "Always reply in the same language the user uses."
            )
        )
        history = build_history_messages(state) if state else []
        messages = [
            SystemMessage(content=context_prompt),
            *history,
            HumanMessage(content=query),
        ]
        set_llm_service_context("chat")
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
