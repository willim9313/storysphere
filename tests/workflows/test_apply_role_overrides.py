"""Tests for _apply_role_overrides() — role correction before _rebuild_chapters."""

from __future__ import annotations

import sys
sys.path.insert(0, "src")

from domain.documents import Chapter, Document, FileType, Paragraph, ParagraphRole
from workflows.ingestion import _apply_role_overrides


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_doc(roles: list[str] | None = None) -> Document:
    n = len(roles) if roles else 4
    paras = [
        Paragraph(
            id=f"p{i}",
            text=f"Para {i}",
            chapter_number=1,
            position=i,
            role=ParagraphRole(roles[i]) if roles else ParagraphRole.body,
        )
        for i in range(n)
    ]
    ch = Chapter(number=1, title="Ch1", paragraphs=paras)
    return Document(
        id="doc-1",
        title="Test",
        file_path="/tmp/t.pdf",
        file_type=FileType.PDF,
        chapters=[ch],
    )


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestApplyRoleOverrides:
    def test_empty_overrides_is_noop(self):
        doc = _make_doc()
        original_roles = [p.role for p in doc.chapters[0].paragraphs]
        _apply_role_overrides(doc, {})
        assert [p.role for p in doc.chapters[0].paragraphs] == original_roles

    def test_single_override_applied(self):
        doc = _make_doc()
        _apply_role_overrides(doc, {"1": "separator"})
        assert doc.chapters[0].paragraphs[1].role == ParagraphRole.separator

    def test_multiple_overrides_applied(self):
        doc = _make_doc()
        _apply_role_overrides(doc, {"0": "preamble", "2": "separator", "3": "section"})
        paras = doc.chapters[0].paragraphs
        assert paras[0].role == ParagraphRole.preamble
        assert paras[1].role == ParagraphRole.body    # unchanged
        assert paras[2].role == ParagraphRole.separator
        assert paras[3].role == ParagraphRole.section

    def test_override_to_body_resets_role(self):
        doc = _make_doc(roles=["separator", "body", "body", "body"])
        _apply_role_overrides(doc, {"0": "body"})
        assert doc.chapters[0].paragraphs[0].role == ParagraphRole.body

    def test_out_of_range_index_ignored(self):
        doc = _make_doc()
        _apply_role_overrides(doc, {"99": "separator"})  # index doesn't exist
        assert all(p.role == ParagraphRole.body for p in doc.chapters[0].paragraphs)

    def test_invalid_role_value_ignored(self):
        doc = _make_doc()
        _apply_role_overrides(doc, {"0": "not_a_real_role"})
        assert doc.chapters[0].paragraphs[0].role == ParagraphRole.body

    def test_non_integer_key_ignored(self):
        doc = _make_doc()
        _apply_role_overrides(doc, {"abc": "separator"})
        assert all(p.role == ParagraphRole.body for p in doc.chapters[0].paragraphs)

    def test_global_index_spans_multiple_chapters(self):
        """Overrides use global paragraph index, not per-chapter position."""
        paras_ch1 = [
            Paragraph(id="p0", text="P0", chapter_number=1, position=0),
            Paragraph(id="p1", text="P1", chapter_number=1, position=1),
        ]
        paras_ch2 = [
            Paragraph(id="p2", text="P2", chapter_number=2, position=0),
            Paragraph(id="p3", text="P3", chapter_number=2, position=1),
        ]
        doc = Document(
            id="doc-multi",
            title="Multi",
            file_path="/tmp/t.pdf",
            file_type=FileType.PDF,
            chapters=[
                Chapter(number=1, paragraphs=paras_ch1),
                Chapter(number=2, paragraphs=paras_ch2),
            ],
        )
        _apply_role_overrides(doc, {"2": "separator"})
        # p2 is index 2 globally (first para of chapter 2)
        assert doc.chapters[1].paragraphs[0].role == ParagraphRole.separator
        assert doc.chapters[0].paragraphs[0].role == ParagraphRole.body
        assert doc.chapters[0].paragraphs[1].role == ParagraphRole.body
