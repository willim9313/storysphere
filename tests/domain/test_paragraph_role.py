"""Tests for ParagraphRole enum and extract_body_text() helper."""

from __future__ import annotations

import sys
sys.path.insert(0, "src")

import pytest
from domain.documents import Paragraph, ParagraphRole, extract_body_text


# ── extract_body_text ─────────────────────────────────────────────────────────


class TestExtractBodyText:
    def test_plain_body_returns_text(self):
        p = Paragraph(text="Hello world.", chapter_number=1, position=0)
        assert extract_body_text(p) == "Hello world."

    def test_body_with_title_span_strips_title_prefix(self):
        # text = "Chapter One\nHero walks in."
        p = Paragraph(
            text="Chapter One\nHero walks in.",
            chapter_number=1,
            position=0,
            title_span=(0, 11),
        )
        assert extract_body_text(p) == "Hero walks in."

    def test_body_with_title_span_leading_whitespace_stripped(self):
        p = Paragraph(
            text="Title\n   Body text here.",
            chapter_number=1,
            position=0,
            title_span=(0, 5),
        )
        result = extract_body_text(p)
        assert result == "Body text here."

    def test_body_title_span_body_empty_returns_none(self):
        # Paragraph is only the title, no body after it
        p = Paragraph(
            text="Standalone Title",
            chapter_number=1,
            position=0,
            title_span=(0, 16),
        )
        assert extract_body_text(p) is None

    def test_separator_returns_none(self):
        p = Paragraph(
            text="***",
            chapter_number=1,
            position=1,
            role=ParagraphRole.separator,
        )
        assert extract_body_text(p) is None

    def test_section_returns_none(self):
        p = Paragraph(
            text="I. The Arrival",
            chapter_number=1,
            position=0,
            role=ParagraphRole.section,
        )
        assert extract_body_text(p) is None

    def test_epigraph_returns_none(self):
        p = Paragraph(
            text='"To be or not to be."',
            chapter_number=1,
            position=0,
            role=ParagraphRole.epigraph,
        )
        assert extract_body_text(p) is None

    def test_preamble_returns_none(self):
        p = Paragraph(
            text="This story is a work of fiction.",
            chapter_number=1,
            position=0,
            role=ParagraphRole.preamble,
        )
        assert extract_body_text(p) is None

    def test_default_role_is_body(self):
        p = Paragraph(text="Hello.", chapter_number=1, position=0)
        assert p.role == ParagraphRole.body


# ── ParagraphRole enum ────────────────────────────────────────────────────────


class TestParagraphRole:
    def test_all_roles_str_values(self):
        assert ParagraphRole.body.value == "body"
        assert ParagraphRole.separator.value == "separator"
        assert ParagraphRole.section.value == "section"
        assert ParagraphRole.epigraph.value == "epigraph"
        assert ParagraphRole.preamble.value == "preamble"

    def test_role_from_string(self):
        assert ParagraphRole("body") == ParagraphRole.body
        assert ParagraphRole("separator") == ParagraphRole.separator

    def test_invalid_role_raises(self):
        with pytest.raises(ValueError):
            ParagraphRole("unknown_role")

    def test_paragraph_accepts_role_kwarg(self):
        p = Paragraph(
            text="***",
            chapter_number=1,
            position=0,
            role=ParagraphRole.separator,
        )
        assert p.role == ParagraphRole.separator
