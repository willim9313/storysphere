"""Tests for paragraph separator detection in the document processing pipeline.

Coverage:
  - _is_separator_segment: regex-based classifier
  - _split_at_separators: groups segments around separator lines
  - DocumentProcessingPipeline.run: separators become role=separator paragraphs
    and are NOT merged into adjacent body text
"""

from __future__ import annotations

import sys
sys.path.insert(0, "src")

import pytest
from pipelines.document_processing.pipeline import (
    _is_separator_segment,
    _split_at_separators,
)
from domain.documents import ParagraphRole


# ── _is_separator_segment ─────────────────────────────────────────────────────


class TestIsSeparatorSegment:
    # Positive cases — should be detected as separators
    @pytest.mark.parametrize("text", [
        "***",
        "* * *",
        "---",
        "- - -",
        "~~~",
        "===",
        "◇◇◇",
        "◆◆◆",
        "※ ※ ※",
        "——",
        "———",
        "─────",
        "• • •",
        "  ***  ",    # leading/trailing whitespace
        "~*~*~",
    ])
    def test_returns_true_for_separator_line(self, text):
        assert _is_separator_segment(text) is True

    # Negative cases — should NOT be detected as separators
    @pytest.mark.parametrize("text", [
        "第一章",              # CJK — word chars
        "Chapter 1",           # ASCII letters
        "Hello world.",        # plain body
        "1",                   # digit — word char
        "— 47 —",              # contains digit
        "",                    # blank
        "   ",                 # whitespace only
        "*" * 41,              # too long (> _MAX_SEP_LEN=40)
        "This is a very long separator line that exceeds the limit",
    ])
    def test_returns_false_for_non_separator(self, text):
        assert _is_separator_segment(text) is False

    def test_cjk_body_text_not_separator(self):
        assert _is_separator_segment("龍出現了。") is False

    def test_empty_string_not_separator(self):
        assert _is_separator_segment("") is False


# ── _split_at_separators ─────────────────────────────────────────────────────


class TestSplitAtSeparators:
    def test_no_separators_single_group(self):
        segs = [(0, "Hello."), (1, "World.")]
        groups = _split_at_separators(segs)
        assert len(groups) == 1
        assert groups[0][0] is None  # no preceding separator
        assert [t for _, t in groups[0][1]] == ["Hello.", "World."]

    def test_one_separator_splits_into_two_groups(self):
        segs = [(0, "Before."), (1, "***"), (2, "After.")]
        groups = _split_at_separators(segs)
        assert len(groups) == 2
        assert groups[0][0] is None
        assert [t for _, t in groups[0][1]] == ["Before."]
        assert groups[1][0] == "***"
        assert [t for _, t in groups[1][1]] == ["After."]

    def test_separator_at_start_creates_empty_first_group(self):
        segs = [(0, "---"), (1, "Body text.")]
        groups = _split_at_separators(segs)
        assert len(groups) == 2
        assert groups[0][0] is None
        assert groups[0][1] == []     # nothing before the separator
        assert groups[1][0] == "---"

    def test_separator_at_end_creates_empty_last_group(self):
        segs = [(0, "Body text."), (1, "~~~")]
        groups = _split_at_separators(segs)
        assert len(groups) == 2
        assert groups[1][1] == []     # nothing after the separator

    def test_consecutive_separators(self):
        segs = [(0, "A"), (1, "***"), (2, "---"), (3, "B")]
        groups = _split_at_separators(segs)
        # Two separator boundaries → 3 groups
        assert len(groups) == 3

    def test_separator_text_is_stripped(self):
        segs = [(0, "  * * *  ")]
        groups = _split_at_separators(segs)
        assert groups[1][0] == "* * *"

    def test_empty_input(self):
        assert _split_at_separators([]) == [(None, [])]


# ── Integration: separators become Paragraph(role=separator) ─────────────────


class TestPipelineSeparatorIntegration:
    """Verify that the DocumentProcessingPipeline creates separator paragraphs."""

    def _make_span(self, segs, chapter_number=1, title=None):
        from pipelines.document_processing.chapter_detector import ChapterSpan
        return ChapterSpan(chapter_number=chapter_number, title=title, segments=segs)

    def _chunk_with_separators(self, segs, chapter_number=1, title=None):
        """Run the separator-aware chunking logic from the pipeline."""
        from pipelines.document_processing.pipeline import _split_at_separators
        from pipelines.document_processing.chunker import chunk_segments
        from domain.documents import Paragraph

        groups = _split_at_separators(segs)
        paragraphs: list[Paragraph] = []
        pos = 0
        for sep_text, body_segs in groups:
            if sep_text is not None:
                paragraphs.append(
                    Paragraph(
                        text=sep_text,
                        chapter_number=chapter_number,
                        position=pos,
                        role=ParagraphRole.separator,
                    )
                )
                pos += 1
            if body_segs:
                body_paras = chunk_segments(body_segs, chapter_number=chapter_number)
                for para in body_paras:
                    paragraphs.append(para.model_copy(update={"position": pos}))
                    pos += 1
        return paragraphs

    def test_separator_not_merged_into_body(self):
        segs = [
            (0, "A" * 60),  # long enough to survive min_chars filter
            (1, "***"),
            (2, "B" * 60),
        ]
        paras = self._chunk_with_separators(segs)
        roles = [p.role for p in paras]
        assert ParagraphRole.separator in roles

    def test_separator_paragraph_text_is_preserved(self):
        segs = [(0, "A" * 60), (1, "◇◇◇"), (2, "B" * 60)]
        paras = self._chunk_with_separators(segs)
        sep_paras = [p for p in paras if p.role == ParagraphRole.separator]
        assert len(sep_paras) == 1
        assert sep_paras[0].text == "◇◇◇"

    def test_body_paragraphs_before_and_after_separator(self):
        segs = [(0, "A" * 60), (1, "***"), (2, "B" * 60)]
        paras = self._chunk_with_separators(segs)
        body_paras = [p for p in paras if p.role == ParagraphRole.body]
        assert len(body_paras) == 2

    def test_separator_does_not_contain_adjacent_body_text(self):
        segs = [(0, "First paragraph text. " * 5), (1, "---"), (2, "Second paragraph text. " * 5)]
        paras = self._chunk_with_separators(segs)
        sep = next(p for p in paras if p.role == ParagraphRole.separator)
        assert "paragraph text" not in sep.text

    def test_positions_are_sequential(self):
        segs = [(0, "A" * 60), (1, "***"), (2, "B" * 60), (3, "~~~"), (4, "C" * 60)]
        paras = self._chunk_with_separators(segs)
        assert [p.position for p in paras] == list(range(len(paras)))

    def test_no_separators_all_body(self):
        segs = [(0, "Some body text. " * 5)]
        paras = self._chunk_with_separators(segs)
        assert all(p.role == ParagraphRole.body for p in paras)
