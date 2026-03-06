"""Tests for core.utils.output_extractor — 4-step JSON fallback parser."""

import pytest

from core.utils.output_extractor import extract_json_from_text


class TestCodeFenceExtraction:
    def test_simple_json_code_fence(self):
        text = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"key": "value"}

    def test_json_array_code_fence(self):
        text = '```json\n[{"a": 1}, {"b": 2}]\n```'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == [{"a": 1}, {"b": 2}]


class TestSentinelTags:
    def test_json_sentinel_tags(self):
        text = 'Analysis:\n<JSON>{"name": "Alice", "score": 0.9}</JSON>\nEnd.'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"name": "Alice", "score": 0.9}

    def test_sentinel_case_insensitive(self):
        text = '<json>{"x": 1}</json>'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"x": 1}


class TestBracketBalanced:
    def test_bare_json_object(self):
        text = 'The answer is {"result": 42} as expected.'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"result": 42}

    def test_nested_objects(self):
        text = 'Output: {"a": {"b": [1, 2, 3]}} end'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"a": {"b": [1, 2, 3]}}


class TestRepairHeuristics:
    def test_trailing_comma(self):
        text = '```json\n{"a": 1, "b": 2,}\n```'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"a": 1, "b": 2}

    def test_python_literals(self):
        text = '{"active": True, "deleted": False, "value": None}'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"active": True, "deleted": False, "value": None}

    def test_single_quotes_fallback(self):
        text = "{'key': 'val'}"
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"key": "val"}

    def test_inline_comments(self):
        text = '{"a": 1, // comment\n"b": 2}'
        result, err = extract_json_from_text(text)
        assert err is None
        assert result == {"a": 1, "b": 2}


class TestFailures:
    def test_no_json_returns_error(self):
        result, err = extract_json_from_text("No JSON here at all.")
        assert result is None
        assert err == "no_json_found"

    def test_empty_string(self):
        result, err = extract_json_from_text("")
        assert result is None
        assert err == "no_json_found"
