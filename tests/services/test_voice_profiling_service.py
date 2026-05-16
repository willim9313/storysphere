"""Unit tests for VoiceProfilingService._compute_metrics."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.voice_profiling_service import (
    _bucket_histogram,
    _compute_metrics,
    _empty_qualitative,
    _tone_distribution,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _para(text: str):
    p = MagicMock()
    p.text = text
    return p


# ── _compute_metrics ──────────────────────────────────────────────────────────

class TestComputeMetrics:
    def test_empty_paragraphs_returns_zeros(self):
        result = _compute_metrics([])
        assert result["avg_sentence_length"] == 0.0
        assert result["question_ratio"] == 0.0
        assert result["exclamation_ratio"] == 0.0
        assert result["lexical_diversity"] == 0.0
        # Distributions are still emitted (with empty/declarative-only values)
        assert len(result["tone_distribution"]) == 3
        assert len(result["sentence_length_histogram"]) == 6
        assert all(b["value"] == 0 for b in result["sentence_length_histogram"])

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


# ── _tone_distribution ────────────────────────────────────────────────────────

class TestToneDistribution:
    def test_sums_to_one_for_pure_declarative(self):
        result = _tone_distribution(0.0, 0.0)
        assert [s["label"] for s in result] == ["declarative", "interrogative", "exclamatory"]
        assert result[0]["value"] == pytest.approx(1.0)
        assert result[1]["value"] == 0.0
        assert result[2]["value"] == 0.0

    def test_balanced_ratios(self):
        result = _tone_distribution(0.3, 0.2)
        assert result[0]["value"] == pytest.approx(0.5)
        assert result[1]["value"] == pytest.approx(0.3)
        assert result[2]["value"] == pytest.approx(0.2)

    def test_clamps_negative_declarative_to_zero(self):
        # Rounding edge case: question + exclamation could exceed 1 by epsilon
        result = _tone_distribution(0.6, 0.5)
        assert result[0]["value"] == 0.0


# ── _bucket_histogram ─────────────────────────────────────────────────────────

class TestBucketHistogram:
    def test_empty_returns_six_zero_buckets(self):
        result = _bucket_histogram([])
        assert [b["bucket"] for b in result] == ["1-10", "11-20", "21-30", "31-40", "41-50", "51+"]
        assert all(b["value"] == 0 for b in result)

    def test_assigns_to_correct_bucket(self):
        result = _bucket_histogram([3, 15, 25, 35, 45, 60, 100])
        values = {b["bucket"]: b["value"] for b in result}
        assert values["1-10"] == 1
        assert values["11-20"] == 1
        assert values["21-30"] == 1
        assert values["31-40"] == 1
        assert values["41-50"] == 1
        assert values["51+"] == 2  # 60 and 100 both land in 51+

    def test_boundary_inclusive(self):
        # Boundary values land in the lower bucket
        result = _bucket_histogram([10, 20, 50, 51])
        values = {b["bucket"]: b["value"] for b in result}
        assert values["1-10"] == 1
        assert values["11-20"] == 1
        assert values["41-50"] == 1
        assert values["51+"] == 1
