"""Unit tests for QueryPatternRecognizer."""

from __future__ import annotations

from storysphere.agents.pattern_recognizer import QueryPatternRecognizer


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

    def test_known_entity_extracts_bare_chinese_name(self):
        # Bare Chinese name the regex can't segment; dictionary catches it.
        match = self.recognizer.recognize(
            "李明是誰？", known_entities=["李明", "王芳"]
        )
        assert match is not None
        assert "李明" in match.extracted_entities
        assert "王芳" not in match.extracted_entities

    def test_known_entity_matches_both_in_comparison(self):
        match = self.recognizer.recognize(
            "比較李明和王芳", known_entities=["李明", "王芳"]
        )
        assert match is not None
        assert "李明" in match.extracted_entities
        assert "王芳" in match.extracted_entities

    def test_known_entity_no_false_positive(self):
        # A known name not present in the query must not be extracted.
        match = self.recognizer.recognize(
            "李明是誰？", known_entities=["李明", "張三"]
        )
        assert match is not None
        assert "張三" not in match.extracted_entities

    def test_known_entity_ignores_single_char_names(self):
        # Single-char names are too ambiguous to substring-match safely.
        match = self.recognizer.recognize(
            "李明是誰？", known_entities=["明"]
        )
        assert match is not None
        assert "明" not in match.extracted_entities
