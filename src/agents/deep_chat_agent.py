"""DeepChat Agent — DeepAgent-based streaming reasoning agent.

Mirrors ``ChatAgent`` exactly but uses ``create_deep_agent`` instead of
``create_agent``.  Shares the same tools, system prompt, ChatState management,
and fast-route logic via ``chat_agent_base``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

from deepagents import create_deep_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agents.chat_agent_base import (
    SYSTEM_PROMPT,
    build_context_prompt,
    build_history_messages,
    fast_route,
)
from agents.pattern_recognizer import QueryPatternRecognizer
from agents.states import ChatState
from core.token_callback import set_llm_service_context
from tools.tool_registry import get_chat_tools

logger = logging.getLogger(__name__)


def _extract_text(content: str | list | Any) -> str:
    """Extract plain text from a message content field.

    LLM responses may return ``str`` or a list of content blocks
    (dicts with ``"type": "text"``).  This normalises both to ``str``.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("text"):
                parts.append(block["text"])
        return "".join(parts)
    return str(content) if content else ""


class DeepChatAgent:
    """DeepAgent-based chat agent for novel analysis.

    Drop-in replacement for ``ChatAgent`` with identical public API.

    Usage::

        agent = DeepChatAgent(kg_service=kg, doc_service=doc, vector_service=vec)
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

        # Build tools (same BaseTool instances as ChatAgent)
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

        # LLM — must be a real BaseChatModel (not RunnableWithFallbacks)
        # because create_deep_agent's resolve_model checks isinstance.
        if isinstance(llm, BaseChatModel):
            self._llm = llm
        else:
            self._llm = self._get_primary_llm()

        # Build the DeepAgent graph
        self._system_prompt = system_prompt or SYSTEM_PROMPT
        self._graph = create_deep_agent(
            model=self._llm,
            tools=self._tools,
            system_prompt=self._system_prompt,
        )

        # Fast-route recognizer
        self._recognizer = QueryPatternRecognizer()

    @staticmethod
    def _get_primary_llm() -> BaseChatModel:
        """Return the primary LLM (a real BaseChatModel, no fallback wrapper)."""
        from core.llm_client import get_llm_client  # noqa: PLC0415
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        return get_llm_client().get_primary(
            temperature=settings.chat_agent_temperature,
        )

    async def chat(
        self, query: str, state: ChatState, language: str = "en"
    ) -> str:
        """Single-turn chat: returns the final assistant response text."""
        from core.metrics import get_metrics  # noqa: PLC0415

        _metrics = get_metrics()
        _t0 = time.perf_counter()
        _route = "deep_agent_loop"

        try:
            # Pronoun resolution
            resolved = state.resolve_pronoun(query.strip())
            if resolved and len(query.split()) <= 3:
                query = query.replace(query.strip(), resolved)

            state.add_message("user", query)

            # Fast route
            match = self._recognizer.recognize(query)
            if match and match.confidence > 0.8:
                result = await fast_route(
                    self._recognizer, self._tool_map, match, query, state
                )
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

            # Full deep agent loop
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
        """Streaming chat: yields token chunks as they arrive."""
        # Pronoun resolution
        resolved = state.resolve_pronoun(query.strip())
        if resolved and len(query.split()) <= 3:
            query = query.replace(query.strip(), resolved)

        state.add_message("user", query)

        # Fast route
        match = self._recognizer.recognize(query)
        if match and match.confidence > 0.8:
            result = await fast_route(
                self._recognizer, self._tool_map, match, query, state
            )
            if result is not None:
                state.add_message("assistant", result)
                state.last_query_type = match.pattern_name
                yield result
                return

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
                    # Only yield AI message chunks, skip tool calls/results/history
                    if (
                        isinstance(message_chunk, AIMessageChunk)
                        and message_chunk.content
                        and not message_chunk.tool_calls
                        and not message_chunk.tool_call_chunks
                    ):
                        text = _extract_text(message_chunk.content)
                        if text:
                            full_response += text
                            yield text
        except Exception:
            logger.exception(
                "DeepAgent streaming failed, falling back"
            )
            result = await self._agent_invoke(
                query, language=language, state=state
            )
            full_response = result
            yield result

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
        """Invoke the DeepAgent graph and extract the final response text."""
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
                _metrics.record_tool_selection(msg.name, source="deep_agent_loop")

        for msg in reversed(output_messages):
            if isinstance(msg, AIMessage) and msg.content:
                return _extract_text(msg.content)
        return "I could not generate a response. Please try rephrasing your question."
