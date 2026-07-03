"""Unit tests for ChatAgent."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from storysphere.agents.chat_agent import ChatAgent
from storysphere.agents.chat_agent_base import build_context_prompt
from storysphere.agents.states import ChatState


@pytest.fixture
def mock_services():
    """Minimal mock services for ChatAgent construction."""
    kg = AsyncMock()
    kg.get_entity = AsyncMock(return_value=None)
    kg.get_entity_by_name = AsyncMock(return_value=None)
    kg.get_relations = AsyncMock(return_value=[])
    kg.get_entity_timeline = AsyncMock(return_value=[])
    kg.get_relation_paths = AsyncMock(return_value=[])
    kg.get_subgraph = AsyncMock(return_value={"center": "", "nodes": [], "edges": []})
    kg.get_relation_stats = AsyncMock(return_value={"total_relations": 0, "type_distribution": {}, "weight_avg": 0, "weight_min": 0, "weight_max": 0})
    kg.list_entities = AsyncMock(return_value=[])

    doc = AsyncMock()
    doc.get_paragraphs = AsyncMock(return_value=[])
    doc.get_chapter_summary = AsyncMock(return_value="")
    doc.get_book_summary = AsyncMock(return_value="")
    doc.get_document = AsyncMock(return_value=None)
    doc.list_documents = AsyncMock(return_value=[])

    vec = AsyncMock()
    vec.search = AsyncMock(return_value=[])
    vec.ensure_collection = AsyncMock()

    return kg, doc, vec


@pytest.fixture
def mock_llm():
    """Mock LLM that supports bind_tools and ainvoke."""
    llm = MagicMock()
    # bind_tools returns self (for create_react_agent)
    llm.bind_tools = MagicMock(return_value=llm)
    llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="This is a test response.", tool_calls=[])
    )
    return llm


class TestChatAgentConstruction:
    def test_creates_agent(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        assert agent._tools is not None
        assert len(agent._tools) >= 18  # 14+ base + 5 composite
        assert agent._graph is not None

    def test_tool_map(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        assert "get_entity_profile" in agent._tool_map
        assert "get_entity_relationship" in agent._tool_map
        assert "get_character_arc" in agent._tool_map
        assert "compare_characters" in agent._tool_map


class TestChatAgentChat:
    @pytest.mark.asyncio
    async def test_chat_updates_state(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        state = ChatState()

        # Patch _agent_invoke to avoid real LangGraph execution.
        # Returns (text, output_messages); empty messages → text-only persist.
        agent._agent_invoke = AsyncMock(
            return_value=("Alice is the protagonist.", [])
        )

        result = await agent.chat("Tell me about the story", state)
        assert result == "Alice is the protagonist."
        assert len(state.conversation_history) == 2  # user + assistant
        assert state.conversation_history[0].role == "user"
        assert state.conversation_history[1].role == "assistant"

    @pytest.mark.asyncio
    async def test_pattern_recognition_tracks_entity(self, mock_services, mock_llm):
        kg, doc, vec = mock_services

        from langchain_core.messages import AIMessage
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                messages=[AIMessage(content="Alice is a character.")],
                get=lambda k, d=None: [AIMessage(content="Alice is a character.")],
            )
        )

        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        state = ChatState()

        # Pattern recognizer should extract "Alice" and update entity state
        from storysphere.agents.pattern_recognizer import QueryPatternRecognizer
        match = agent._recognizer.recognize('Who is "Alice"?')
        if match and match.extracted_entities:
            for entity in match.extracted_entities:
                state.add_entity_mention(entity)
        assert state.current_focus_entity == "Alice"

    @pytest.mark.asyncio
    async def test_astream_records_agent_query_metric(self, mock_services, mock_llm):
        """The production (stream) path must record an agent_query metric."""
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        state = ChatState()

        # Force the stream to fail so we exercise the fallback without a real
        # LangGraph run; the agent_query metric must still be recorded.
        async def _boom(*_a, **_k):
            raise RuntimeError("no stream")
            yield  # unreachable — marks this as an async generator

        agent._graph.astream = _boom
        agent._agent_invoke = AsyncMock(return_value=("fallback answer", []))

        from storysphere.core.metrics import get_metrics

        with patch.object(get_metrics(), "record_agent_query") as rec:
            chunks = [c async for c in agent.astream("hello", state)]

        assert "".join(chunks) == "fallback answer"
        rec.assert_called_once()
        assert rec.call_args.kwargs["route"] == "agent_stream"
        assert rec.call_args.kwargs["success"] is True


class TestBuildContextPrompt:
    def test_minimal_state(self):
        state = ChatState()
        prompt = build_context_prompt(state, "en")
        assert "Always respond in en" in prompt
        # Static rules mention the word "document_id"; the injected book-context
        # marker "document_id=<id>" must be absent when no book_id is set.
        assert "document_id=" not in prompt

    def test_auto_language(self):
        state = ChatState()
        prompt = build_context_prompt(state, "auto")
        assert "same language the user uses" in prompt

    def test_with_book_id(self):
        state = ChatState(book_id="book-123")
        prompt = build_context_prompt(state, "zh")
        assert "Always respond in zh" in prompt
        assert "book-123" in prompt
        assert "document_id" in prompt

    def test_with_book_id_and_title(self):
        state = ChatState(book_id="book-123", book_title="三豬紅帽傳")
        prompt = build_context_prompt(state, "zh")
        assert "三豬紅帽傳" in prompt
        assert "book-123" in prompt

    def test_with_chapter_id(self):
        state = ChatState(chapter_id="ch-5", chapter_number=5)
        prompt = build_context_prompt(state, "en")
        assert "chapter_number=5" in prompt
        assert "this chapter" in prompt

    def test_with_chapter_number_only(self):
        state = ChatState(chapter_number=3)
        prompt = build_context_prompt(state, "en")
        assert "chapter_number=3" in prompt
        assert "this chapter" in prompt

    def test_with_focus_entity(self):
        state = ChatState()
        state.add_entity_mention("Elizabeth Bennet")
        prompt = build_context_prompt(state, "en")
        assert "Elizabeth Bennet" in prompt
        assert "entity_id=" not in prompt  # no id → no precise-lookup hint

    def test_focus_entity_with_id_adds_lookup_hint(self):
        state = ChatState()
        state.add_entity_mention("Elizabeth Bennet", entity_id="ent-7")
        prompt = build_context_prompt(state, "en")
        assert "entity_id=ent-7" in prompt
        assert "tools that require entity_id" in prompt

    def test_with_page_context_graph(self):
        state = ChatState(page_context="graph")
        prompt = build_context_prompt(state, "en")
        assert "knowledge graph" in prompt

    def test_with_page_context_reader(self):
        state = ChatState(page_context="reader")
        prompt = build_context_prompt(state, "en")
        assert "reader page" in prompt

    def test_full_context(self):
        state = ChatState(
            book_id="b1", book_title="TestBook",
            chapter_id="c2", chapter_number=2, page_context="reader"
        )
        state.add_entity_mention("Darcy")
        prompt = build_context_prompt(state, "en")
        assert "b1" in prompt
        assert "TestBook" in prompt
        assert "chapter_number=2" in prompt
        assert "Darcy" in prompt
        assert "reader" in prompt


class TestPatternRecognizerIntegration:
    def test_recognizer_is_attached(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        assert agent._recognizer is not None

    def test_recognizer_finds_entity_pattern(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        match = agent._recognizer.recognize("Who is Alice?")
        assert match is not None
        assert match.pattern_name == "entity_info"


class TestKnownEntityNames:
    def _agent(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        return kg, ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )

    @pytest.mark.asyncio
    async def test_returns_names_and_aliases(self, mock_services, mock_llm):
        kg, agent = self._agent(mock_services, mock_llm)
        kg.list_entities.return_value = [
            SimpleNamespace(name="李明", aliases=["小明"]),
            SimpleNamespace(name="王芳", aliases=[]),
        ]
        names = await agent._known_entity_names("book-1")
        assert names == ["李明", "小明", "王芳"]

    @pytest.mark.asyncio
    async def test_empty_book_id_skips_lookup(self, mock_services, mock_llm):
        kg, agent = self._agent(mock_services, mock_llm)
        assert await agent._known_entity_names(None) == []
        kg.list_entities.assert_not_called()

    @pytest.mark.asyncio
    async def test_caches_per_book(self, mock_services, mock_llm):
        kg, agent = self._agent(mock_services, mock_llm)
        kg.list_entities.return_value = [SimpleNamespace(name="李明", aliases=[])]
        await agent._known_entity_names("book-1")
        await agent._known_entity_names("book-1")
        assert kg.list_entities.await_count == 1


class TestToolContextPersistence:
    """A4: cross-turn tool exchange is stored and replayed (bounded)."""

    def _turn_messages(self):
        """A one-round tool exchange as LangGraph would return it."""
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
        return [
            HumanMessage(content="Who are Alice's relationships?"),
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "get_entity_relationship", "args": {"entity_id": "e1"}, "id": "call_1"}
                ],
            ),
            ToolMessage(
                content="Alice -> Bob (friend); Alice -> Carol (rival)",
                tool_call_id="call_1",
                name="get_entity_relationship",
            ),
            AIMessage(content="Alice knows Bob and Carol."),
        ]

    def test_select_new_turn_messages_after_last_human(self):
        from storysphere.agents.chat_agent_base import select_new_turn_messages
        msgs = self._turn_messages()
        new = select_new_turn_messages(msgs)
        assert len(new) == 3  # everything after the human query
        assert new[0].tool_calls  # the tool-calling AIMessage

    def test_build_history_entries_captures_tool_exchange(self):
        from storysphere.agents.chat_agent_base import (
            build_history_entries,
            select_new_turn_messages,
        )
        entries = build_history_entries(
            select_new_turn_messages(self._turn_messages())
        )
        roles = [e.role for e in entries]
        assert roles == ["assistant", "tool", "assistant"]
        assert entries[0].tool_calls[0]["id"] == "call_1"
        assert entries[1].tool_call_id == "call_1"
        assert entries[1].name == "get_entity_relationship"
        assert entries[2].content == "Alice knows Bob and Carol."

    def test_build_history_entries_truncates_tool_output(self):
        from langchain_core.messages import ToolMessage
        from storysphere.agents.chat_agent_base import build_history_entries
        big = "x" * 5000
        entries = build_history_entries(
            [ToolMessage(content=big, tool_call_id="c", name="t")],
            max_tool_chars=100,
        )
        assert len(entries[0].content) == 100 + len("…[truncated]")

    def test_replay_keeps_tool_pair_for_last_turn(self):
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
        from storysphere.agents.chat_agent_base import build_history_entries, build_history_messages
        state = ChatState()
        state.add_message("user", "Who are Alice's relationships?")
        state.record_agent_turn(
            build_history_entries(self._turn_messages()[1:])
        )
        state.add_message("user", "tell me about the second one")  # current query
        replayed = build_history_messages(state)
        # user, assistant(tool_calls), tool, assistant(text) — current query excluded
        assert isinstance(replayed[0], HumanMessage)
        assert any(isinstance(m, AIMessage) and m.tool_calls for m in replayed)
        assert any(isinstance(m, ToolMessage) for m in replayed)

    def test_replay_drops_tool_context_for_older_turns(self):
        from langchain_core.messages import AIMessage, ToolMessage
        from storysphere.agents.chat_agent_base import build_history_entries, build_history_messages
        state = ChatState()
        # Older turn with a tool exchange
        state.add_message("user", "q1")
        state.record_agent_turn(build_history_entries(self._turn_messages()[1:]))
        # Newer turn, text only
        state.add_message("user", "q2")
        state.add_message("assistant", "just text")
        state.add_message("user", "current query")
        replayed = build_history_messages(state)
        # TOOL_CONTEXT_TURNS=1 → only the newest completed turn (q2) keeps context;
        # the older tool exchange must not be replayed (no orphan tool_calls/msgs).
        assert not any(isinstance(m, ToolMessage) for m in replayed)
        assert not any(
            isinstance(m, AIMessage) and m.tool_calls for m in replayed
        )

    @pytest.mark.asyncio
    async def test_postprocess_persists_tool_exchange(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        state = ChatState()
        state.add_message("user", "Who are Alice's relationships?")
        agent._postprocess(
            "Alice knows Bob and Carol.", None, state, self._turn_messages()
        )
        roles = [m.role for m in state.conversation_history]
        assert "tool" in roles
        assert roles[-1] == "assistant"


class TestEntityIdAlignment:
    """A5: text-mentioned KG entities carry an unambiguous canonical id."""

    def _agent(self, mock_services, mock_llm):
        kg, doc, vec = mock_services
        return kg, ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )

    def test_index_maps_unique_name_and_aliases(self):
        from storysphere.agents.chat_agent import _index_known_entities
        names, id_map = _index_known_entities(
            [SimpleNamespace(id="e1", name="Alice", aliases=["Ali"])]
        )
        assert "Alice" in names and "Ali" in names
        assert id_map["alice"] == "e1"
        assert id_map["ali"] == "e1"

    def test_index_drops_ambiguous_name(self):
        from storysphere.agents.chat_agent import _index_known_entities
        names, id_map = _index_known_entities(
            [
                SimpleNamespace(id="e1", name="Alice", aliases=[]),
                SimpleNamespace(id="e2", name="Alice", aliases=[]),
            ]
        )
        assert "alice" not in id_map  # ambiguous → name-only
        assert names.count("Alice") == 1  # still deduped for matching

    def test_index_entity_without_id(self):
        from storysphere.agents.chat_agent import _index_known_entities
        names, id_map = _index_known_entities(
            [SimpleNamespace(id=None, name="Ghost", aliases=[])]
        )
        assert "Ghost" in names
        assert id_map == {}

    @pytest.mark.asyncio
    async def test_focus_entity_id_resolution(self, mock_services, mock_llm):
        kg, agent = self._agent(mock_services, mock_llm)
        kg.list_entities.return_value = [
            SimpleNamespace(id="e1", name="李明", aliases=[])
        ]
        await agent._known_entity_names("book-1")  # populate caches
        state = ChatState(book_id="book-1")
        assert agent._focus_entity_id(state, "李明") == "e1"
        assert agent._focus_entity_id(state, "王芳") is None  # unknown
        assert agent._focus_entity_id(ChatState(), "李明") is None  # no book_id

    @pytest.mark.asyncio
    async def test_preprocess_sets_focus_id_for_text_mention(
        self, mock_services, mock_llm
    ):
        kg, agent = self._agent(mock_services, mock_llm)
        kg.list_entities.return_value = [
            SimpleNamespace(id="e1", name="李明", aliases=[])
        ]
        state = ChatState(book_id="book-1")
        known = await agent._known_entity_names("book-1")
        agent._preprocess("李明是誰？", state, known)
        assert state.current_focus_entity == "李明"
        assert state.current_focus_entity_id == "e1"

    @pytest.mark.asyncio
    async def test_postprocess_sets_focus_id_for_text_mention(
        self, mock_services, mock_llm
    ):
        kg, agent = self._agent(mock_services, mock_llm)
        kg.list_entities.return_value = [
            SimpleNamespace(id="e1", name="李明", aliases=[])
        ]
        known = await agent._known_entity_names("book-1")
        state = ChatState(book_id="book-1")
        match = agent._recognizer.recognize("李明是誰？", known)
        agent._postprocess("回答內容。", match, state)
        assert state.current_focus_entity_id == "e1"
