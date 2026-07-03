"""Unit tests for ChatState methods."""

from __future__ import annotations

from unittest.mock import patch

from storysphere.agents.states import ChatState


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

    def test_stores_canonical_id_when_provided(self):
        state = ChatState()
        state.add_entity_mention("Alice", entity_id="ent-42")
        assert state.current_focus_entity == "Alice"
        assert state.current_focus_entity_id == "ent-42"

    def test_clears_stale_id_when_switching_to_idless_entity(self):
        state = ChatState()
        state.add_entity_mention("Alice", entity_id="ent-42")
        state.add_entity_mention("Bob")  # name-only, e.g. from pattern match
        assert state.current_focus_entity == "Bob"
        assert state.current_focus_entity_id is None


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
