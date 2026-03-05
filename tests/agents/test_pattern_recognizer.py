"""Unit tests for QueryPatternRecognizer."""

from __future__ import annotations

from agents.pattern_recognizer import QueryPatternRecognizer


class TestQueryPatternRecognizer:
    def setup_method(self):
        self.recognizer = QueryPatternRecognizer()

    def test_entity_info_english(self):
        match = self.recognizer.recognize("Who is Elizabeth Bennet?")
        assert match is not None
        assert match.pattern_name == "entity_info"
        assert "get_entity_profile" in match.suggested_tools
        assert match.confidence >= 0.8

    def test_entity_info_chinese(self):
        match = self.recognizer.recognize("「李明」是誰？")
        assert match is not None
        assert match.pattern_name == "entity_info"

    def test_relationship_pattern(self):
        match = self.recognizer.recognize(
            "What is the relationship between Alice and Bob?"
        )
        assert match is not None
        assert match.pattern_name == "relationship"
        assert "get_entity_relationship" in match.suggested_tools

    def test_timeline_pattern(self):
        match = self.recognizer.recognize("How does Elizabeth change throughout the story?")
        assert match is not None
        assert match.pattern_name == "timeline"
        assert "get_character_arc" in match.suggested_tools

    def test_comparison_pattern(self):
        match = self.recognizer.recognize("Compare Alice and Bob")
        assert match is not None
        assert match.pattern_name == "comparison"
        assert "compare_characters" in match.suggested_tools

    def test_search_pattern(self):
        match = self.recognizer.recognize("Find passages about the battle")
        assert match is not None
        assert match.pattern_name == "search"
        assert "vector_search" in match.suggested_tools

    def test_summary_pattern(self):
        match = self.recognizer.recognize("Give me a summary of chapter 3")
        assert match is not None
        assert match.pattern_name == "summary"

    def test_no_match(self):
        match = self.recognizer.recognize("What's the weather today?")
        assert match is None

    def test_entity_extraction_quoted(self):
        match = self.recognizer.recognize('Who is "Elizabeth Bennet"?')
        assert match is not None
        assert "Elizabeth Bennet" in match.extracted_entities

    def test_entity_extraction_capitalized(self):
        match = self.recognizer.recognize("Tell me about Alice")
        assert match is not None
        assert "Alice" in match.extracted_entities
