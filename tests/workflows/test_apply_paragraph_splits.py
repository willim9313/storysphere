"""Tests for _apply_paragraph_splits() — reviewer-chosen in-paragraph splits."""

from __future__ import annotations

import sys

sys.path.insert(0, "src")

from storysphere.domain.documents import Chapter, Document, FileType, Paragraph, ParagraphRole
from storysphere.workflows.ingestion import _apply_paragraph_splits

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_doc(texts: list[str], **para_kw) -> Document:
    paras = [
        Paragraph(id=f"p{i}", text=t, chapter_number=1, position=i, **para_kw)
        for i, t in enumerate(texts)
    ]
    ch = Chapter(number=1, title="Ch1", paragraphs=paras)
    return Document(
        id="doc-1",
        title="Test",
        file_path="/tmp/t.pdf",
        file_type=FileType.PDF,
        chapters=[ch],
    )


def _texts(doc: Document) -> list[str]:
    return [p.text for ch in doc.chapters for p in ch.paragraphs]


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestApplyParagraphSplits:
    def test_empty_splits_is_noop(self):
        doc = _make_doc(["Hello world.", "Second."])
        _apply_paragraph_splits(doc, {})
        assert _texts(doc) == ["Hello world.", "Second."]

    def test_single_offset_splits_in_two(self):
        doc = _make_doc(["HeadTail"])
        _apply_paragraph_splits(doc, {"0": [4]})
        assert _texts(doc) == ["Head", "Tail"]

    def test_two_offsets_split_in_three(self):
        doc = _make_doc(["AAABBBCCC"])
        _apply_paragraph_splits(doc, {"0": [3, 6]})
        assert _texts(doc) == ["AAA", "BBB", "CCC"]

    def test_positions_renumbered_within_chapter(self):
        doc = _make_doc(["AAABBB", "CCC"])
        _apply_paragraph_splits(doc, {"0": [3]})
        positions = [p.position for p in doc.chapters[0].paragraphs]
        assert positions == [0, 1, 2]

    def test_pieces_inherit_role(self):
        doc = _make_doc(["AAABBB"], role=ParagraphRole.preamble)
        _apply_paragraph_splits(doc, {"0": [3]})
        assert all(
            p.role == ParagraphRole.preamble for p in doc.chapters[0].paragraphs
        )

    def test_pieces_get_fresh_ids(self):
        doc = _make_doc(["AAABBB"])
        _apply_paragraph_splits(doc, {"0": [3]})
        p0, p1 = doc.chapters[0].paragraphs
        assert p0.id != p1.id
        assert p0.id != "p0" and p1.id != "p0"

    def test_global_index_spans_multiple_chapters(self):
        paras_ch1 = [Paragraph(id="p0", text="P0", chapter_number=1, position=0)]
        paras_ch2 = [
            Paragraph(id="p1", text="AAABBB", chapter_number=2, position=0),
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
        _apply_paragraph_splits(doc, {"1": [3]})
        assert [p.text for p in doc.chapters[0].paragraphs] == ["P0"]
        assert [p.text for p in doc.chapters[1].paragraphs] == ["AAA", "BBB"]

    def test_title_span_kept_when_fully_inside_head(self):
        doc = _make_doc(["第一章 潮水AAABBB"])
        doc.chapters[0].paragraphs[0].title_span = (0, 6)
        _apply_paragraph_splits(doc, {"0": [9]})
        head, tail = doc.chapters[0].paragraphs
        assert head.title_span == (0, 6)
        assert tail.title_span is None

    def test_title_span_offset_adjusted_in_tail_piece(self):
        doc = _make_doc(["AAA第一章BBB"])
        doc.chapters[0].paragraphs[0].title_span = (3, 6)
        _apply_paragraph_splits(doc, {"0": [3]})
        head, tail = doc.chapters[0].paragraphs
        assert head.title_span is None
        assert tail.title_span == (0, 3)

    def test_title_span_dropped_when_cut_by_offset(self):
        doc = _make_doc(["第一章潮水AAA"])
        doc.chapters[0].paragraphs[0].title_span = (0, 5)
        _apply_paragraph_splits(doc, {"0": [3]})
        assert all(p.title_span is None for p in doc.chapters[0].paragraphs)

    # ── Invalid input is ignored (paragraph left untouched) ──────────────────

    def test_unknown_index_ignored(self):
        doc = _make_doc(["AAABBB"])
        _apply_paragraph_splits(doc, {"99": [3]})
        assert _texts(doc) == ["AAABBB"]

    def test_out_of_range_offset_ignored(self):
        doc = _make_doc(["AAABBB"])
        _apply_paragraph_splits(doc, {"0": [6]})  # == len(text)
        assert _texts(doc) == ["AAABBB"]

    def test_zero_offset_ignored(self):
        doc = _make_doc(["AAABBB"])
        _apply_paragraph_splits(doc, {"0": [0]})
        assert _texts(doc) == ["AAABBB"]

    def test_unsorted_offsets_ignored(self):
        doc = _make_doc(["AAABBBCCC"])
        _apply_paragraph_splits(doc, {"0": [6, 3]})
        assert _texts(doc) == ["AAABBBCCC"]

    def test_whitespace_only_piece_ignored(self):
        doc = _make_doc(["AAA   "])
        _apply_paragraph_splits(doc, {"0": [3]})  # tail would be "   "
        assert _texts(doc) == ["AAA   "]

    def test_invalid_entry_does_not_block_valid_one(self):
        doc = _make_doc(["AAABBB", "CCCDDD"])
        _apply_paragraph_splits(doc, {"0": [99], "1": [3]})
        assert _texts(doc) == ["AAABBB", "CCC", "DDD"]
