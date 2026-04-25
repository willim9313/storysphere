"""Unit tests for VoiceProfilingService._compute_metrics."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.voice_profiling_service import _compute_metrics, _empty_qualitative


# ── Helpers ───────────────────────────────────────────────────────────────────

def _para(text: str):
    p = MagicMock()
    p.text = text
    return p


# ── _compute_metrics ──────────────────────────────────────────────────────────

class TestComputeMetrics:
    def test_empty_paragraphs_returns_zeros(self):
        result = _compute_metrics([])
        assert result == {
            "avg_sentence_length": 0.0,
            "question_ratio": 0.0,
            "exclamation_ratio": 0.0,
            "lexical_diversity": 0.0,
        }

    def test_single_english_sentence(self):
        result = _compute_metrics([_para("Hello world.")])
        assert result["avg_sentence_length"] == 2.0
        assert result["question_ratio"] == 0.0
        assert result["exclamation_ratio"] == 0.0

    def test_question_detection_english(self):
        result = _compute_metrics([_para("How are you? I am fine.")])
        assert result["question_ratio"] == pytest.approx(0.5, abs=0.01)
        assert result["exclamation_ratio"] == 0.0

    def test_question_detection_cjk(self):
        result = _compute_metrics([_para("你好嗎？我很好。")])
        assert result["question_ratio"] == pytest.approx(0.5, abs=0.01)
        assert result["exclamation_ratio"] == 0.0

    def test_exclamation_detection(self):
        result = _compute_metrics([_para("Stop! Go away. Come back!")])
        assert result["exclamation_ratio"] == pytest.approx(2 / 3, abs=0.01)

    def test_cjk_exclamation(self):
        result = _compute_metrics([_para("走開！你好嗎？我很好。")])
        assert result["exclamation_ratio"] == pytest.approx(1 / 3, abs=0.01)
        assert result["question_ratio"] == pytest.approx(1 / 3, abs=0.01)

    def test_newline_split_as_sentence_boundary(self):
        # Two lines without terminal punctuation should be split into 2 sentences
        result = _compute_metrics([_para("First line\nSecond line")])
        assert result["avg_sentence_length"] == pytest.approx(2.0, abs=0.5)

    def test_ellipsis_as_sentence_boundary(self):
        result = _compute_metrics([_para("He said…she replied.")])
        # Should split into two sentences at …
        assert result["avg_sentence_length"] > 0

    def test_lexical_diversity_all_unique(self):
        # 10+ words, all unique → diversity == 1.0
        result = _compute_metrics([_para("one two three four five six seven eight nine ten.")])
        assert result["lexical_diversity"] == pytest.approx(1.0, abs=0.01)

    def test_lexical_diversity_all_same(self):
        # 10+ identical words → diversity == 1/10 = 0.1
        result = _compute_metrics([_para("the the the the the the the the the the.")])
        assert result["lexical_diversity"] == pytest.approx(0.1, abs=0.02)

    def test_lexical_diversity_low_word_count_returns_zero(self):
        # < 10 words → diversity reported as 0.0 (insufficient signal)
        result = _compute_metrics([_para("Hi there.")])
        assert result["lexical_diversity"] == 0.0

    def test_cjk_punctuation_stripped_from_words(self):
        # 「你好」 should tokenize as 你 好, not as 「你好」
        result = _compute_metrics([_para("「你好嗎？」她說。")])
        assert result["avg_sentence_length"] > 0
        assert result["question_ratio"] > 0

    def test_multiple_paragraphs_aggregated(self):
        paras = [_para("Hello world."), _para("How are you? I am fine.")]
        result = _compute_metrics(paras)
        # 3 sentences total: "Hello world.", "How are you?", "I am fine."
        assert result["question_ratio"] == pytest.approx(1 / 3, abs=0.01)

    def test_avg_sentence_length_cjk(self):
        # "你好嗎" = 3 chars = 3 words (char-level); "我很好" = 3 chars
        result = _compute_metrics([_para("你好嗎？我很好。")])
        assert result["avg_sentence_length"] == pytest.approx(3.0, abs=0.5)

    def test_no_punctuation_whole_paragraph_is_one_sentence(self):
        result = _compute_metrics([_para("this has no punctuation at all")])
        # Treated as one sentence
        assert result["avg_sentence_length"] > 0
        assert result["question_ratio"] == 0.0


# ── _empty_qualitative ────────────────────────────────────────────────────────

def test_empty_qualitative_structure():
    result = _empty_qualitative()
    assert result["speech_style"] == ""
    assert result["distinctive_patterns"] == []
    assert result["tone"] == ""
    assert result["representative_quotes"] == []
