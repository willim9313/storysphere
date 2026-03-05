"""Unit tests for ChatAgent."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.chat_agent import ChatAgent
from agents.states import ChatState


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
        assert len(agent._tools) == 18  # 14 base + 4 composite
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

        # Patch _agent_invoke to avoid real LangGraph execution
        agent._agent_invoke = AsyncMock(return_value="Alice is the protagonist.")

        result = await agent.chat("Tell me about the story", state)
        assert result == "Alice is the protagonist."
        assert len(state.conversation_history) == 2  # user + assistant
        assert state.conversation_history[0].role == "user"
        assert state.conversation_history[1].role == "assistant"

    @pytest.mark.asyncio
    async def test_fast_route_entity_info(self, mock_services, mock_llm):
        kg, doc, vec = mock_services

        # Make kg return an entity for fast route
        from domain.entities import Entity, EntityType
        alice = Entity(id="ent-1", name="Alice", entity_type=EntityType.CHARACTER, description="Hero")
        kg.get_entity_by_name = AsyncMock(return_value=alice)
        kg.get_relations = AsyncMock(return_value=[])

        agent = ChatAgent(
            kg_service=kg, doc_service=doc, vector_service=vec, llm=mock_llm
        )
        state = ChatState()

        result = await agent.chat("Who is Alice?", state)
        # Should have used fast route and returned entity profile JSON
        assert "Alice" in result
        assert state.current_focus_entity == "Alice"


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
