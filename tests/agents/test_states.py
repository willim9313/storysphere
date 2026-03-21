"""Unit tests for ChatState methods."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

from agents.states import ChatState


class TestAddEntityMention:
    def test_tracks_count(self):
        state = ChatState()
        state.add_entity_mention("Alice")
        assert state.entity_mentions["Alice"] == 1
        state.add_entity_mention("Alice")
        assert state.entity_mentions["Alice"] == 2

    def test_updates_focus(self):
        state = ChatState()
        state.add_entity_mention("Alice")
        assert state.current_focus_entity == "Alice"
        state.add_entity_mention("Bob")
        assert state.current_focus_entity == "Bob"

    def test_adds_to_detected(self):
        state = ChatState()
        state.add_entity_mention("Alice")
        assert "Alice" in state.detected_entities
        state.add_entity_mention("Alice")
        assert state.detected_entities.count("Alice") == 1  # no dupe


class TestResolvePronoun:
    def test_resolves_english(self):
        state = ChatState()
        state.add_entity_mention("Alice")
        assert state.resolve_pronoun("she") == "Alice"
        assert state.resolve_pronoun("He") == "Alice"
        assert state.resolve_pronoun("them") == "Alice"

    def test_resolves_chinese(self):
        state = ChatState()
        state.add_entity_mention("李明")
        assert state.resolve_pronoun("他") == "李明"
        assert state.resolve_pronoun("她") == "李明"

    def test_returns_none_for_non_pronoun(self):
        state = ChatState()
        state.add_entity_mention("Alice")
        assert state.resolve_pronoun("Alice") is None

    def test_returns_none_without_focus(self):
        state = ChatState()
        assert state.resolve_pronoun("he") is None


class TestToolCache:
    def test_cache_and_retrieve(self):
        state = ChatState()
        state.cache_tool_result("get_entity", {"name": "Alice"})
        assert state.get_cached_result("get_entity") == {"name": "Alice"}

    def test_cache_miss(self):
        state = ChatState()
        assert state.get_cached_result("nonexistent") is None

    def test_cache_expiry(self):
        state = ChatState()
        state.cache_tool_result("old_tool", "data")
        # Manually set old timestamp
        old_time = (datetime.now() - timedelta(seconds=600)).isoformat()
        state.last_tool_results["old_tool"]["timestamp"] = old_time
        assert state.get_cached_result("old_tool", ttl_seconds=300) is None


class TestPageContextFields:
    def test_defaults_none(self):
        state = ChatState()
        assert state.book_id is None
        assert state.chapter_id is None
        assert state.page_context is None

    def test_set_page_context(self):
        state = ChatState(book_id="b1", chapter_id="c1", page_context="reader")
        assert state.book_id == "b1"
        assert state.chapter_id == "c1"
        assert state.page_context == "reader"

    def test_page_context_update(self):
        state = ChatState()
        state.book_id = "b2"
        state.page_context = "graph"
        assert state.book_id == "b2"
        assert state.page_context == "graph"


class TestMessageHistory:
    def test_add_message(self):
        state = ChatState()
        state.add_message("user", "hello")
        state.add_message("assistant", "hi")
        assert len(state.conversation_history) == 2
        assert state.conversation_history[0].role == "user"
        assert state.conversation_history[1].content == "hi"

    def test_trim_history(self):
        state = ChatState()
        for i in range(15):
            state.add_message("user", f"msg-{i}")
        state.trim_history(max_turns=10)
        assert len(state.conversation_history) == 10
        assert state.conversation_history[0].content == "msg-5"
