"""Unit tests for the document processing pipeline.

Tests cover:
- loader helpers (mocked file I/O)
- chapter_detector heuristics
- chunker split/merge logic
- DocumentProcessingPipeline with a mock loader
"""

from __future__ import annotations

import pytest

from pipelines.document_processing.chapter_detector import ChapterSpan, detect_chapters
from pipelines.document_processing.chunker import chunk_segments


# ── chapter_detector ────────────────────────────────────────────────────────


class TestDetectChapters:
    def test_empty_input_returns_empty(self):
        assert detect_chapters([]) == []

    def test_no_headings_produces_single_chapter(self):
        segments = [(0, "Once upon a time."), (1, "The hero walked.")]
        chapters = detect_chapters(segments)
        assert len(chapters) == 1
        assert chapters[0].chapter_number == 1
        assert chapters[0].title is None
        assert len(chapters[0].segments) == 2

    def test_chapter_heading_splits_correctly(self):
        segments = [
            (0, "Chapter 1"),
            (1, "The beginning."),
            (2, "Chapter 2"),
            (3, "The middle."),
        ]
        chapters = detect_chapters(segments)
        assert len(chapters) == 2
        assert chapters[0].chapter_number == 1
        assert len(chapters[0].segments) == 1
        assert chapters[1].chapter_number == 2

    def test_cjk_chapter_heading(self):
        segments = [(0, "第一章"), (1, "龍出現了。"), (2, "第二章"), (3, "戰鬥開始。")]
        chapters = detect_chapters(segments)
        assert len(chapters) == 2

    def test_roman_numeral_heading(self):
        segments = [(0, "I"), (1, "Text A."), (2, "II"), (3, "Text B.")]
        chapters = detect_chapters(segments)
        assert len(chapters) == 2

    def test_prologue_heading(self):
        segments = [(0, "Prologue"), (1, "Before it all."), (2, "Chapter 1"), (3, "It started.")]
        chapters = detect_chapters(segments)
        assert len(chapters) == 2
        assert chapters[0].chapter_number == 1

    def test_content_before_first_heading(self):
        """Text before any chapter heading becomes chapter 1."""
        segments = [(0, "Author's note."), (1, "Chapter 1"), (2, "Story starts.")]
        chapters = detect_chapters(segments)
        assert len(chapters) == 2
        assert chapters[0].segments[0][1] == "Author's note."

    # ── new patterns (old_version parity) ──

    def test_volume_book_part_headings(self):
        """Volume/Book/Part/Act/Scene as standalone headings."""
        for heading in ["Volume 1", "Book 3", "Part 2", "Act 1", "Scene 5", "Vol II"]:
            segments = [(0, heading), (1, "Content.")]
            chapters = detect_chapters(segments)
            assert len(chapters) == 1, f"Failed for: {heading}"

    def test_chapter_with_title_separator(self):
        """Chapter heading followed by separator and title."""
        for heading in [
            "Chapter 3 - The Return",
            "Chapter 5: Awakening",
            "Ch. 2: Title",
            "Chapter IV: The Quest",
        ]:
            segments = [(0, heading), (1, "Content.")]
            chapters = detect_chapters(segments)
            assert len(chapters) == 1, f"Failed for: {heading}"

    def test_cjk_chapter_with_title(self):
        """Chinese chapter heading with separator and title."""
        for heading in ["第五章：歸來", "第1章: 開始", "第三節-啟程"]:
            segments = [(0, heading), (1, "內容。")]
            chapters = detect_chapters(segments)
            assert len(chapters) == 1, f"Failed for: {heading}"

    def test_compound_volume_chapter(self):
        """Compound volume + chapter format."""
        for heading in [
            "Volume 1, Chapter 5",
            "Book 2, Act 3",
            "Part 1 Chapter 1",
        ]:
            segments = [(0, heading), (1, "Content.")]
            chapters = detect_chapters(segments)
            assert len(chapters) == 1, f"Failed for: {heading}"

    def test_extended_cjk_characters(self):
        """Chinese chapter with 萬/零/〇 characters."""
        for heading in ["第零章", "第〇章"]:
            segments = [(0, heading), (1, "內容。")]
            chapters = detect_chapters(segments)
            assert len(chapters) == 1, f"Failed for: {heading}"


# ── chunker ─────────────────────────────────────────────────────────────────


class TestChunkSegments:
    def test_empty_segments_return_empty(self):
        result = chunk_segments([], chapter_number=1)
        assert result == []

    def test_normal_segment_becomes_paragraph(self):
        segments = [(0, "This is a sentence about something interesting.")]
        paragraphs = chunk_segments(segments, chapter_number=1)
        assert len(paragraphs) == 1
        assert paragraphs[0].chapter_number == 1
        assert paragraphs[0].position == 0

    def test_short_segments_are_merged(self):
        """Two short segments should be merged into one paragraph."""
        segments = [(0, "Hi."), (1, "Bye.")]
        paragraphs = chunk_segments(segments, chapter_number=2, min_chars=10)
        # "Hi." (3) + " " + "Bye." (4) = 8 chars → still below 10, merged into 1
        assert len(paragraphs) == 1
        assert "Hi." in paragraphs[0].text

    def test_long_segment_is_split(self):
        """A segment exceeding max_chars should be split into multiple paragraphs."""
        # Build a long text > 100 chars with sentence boundaries
        long_text = "Sentence one. Sentence two. Sentence three. " * 5
        segments = [(0, long_text)]
        paragraphs = chunk_segments(segments, chapter_number=3, max_chars=100)
        assert len(paragraphs) > 1

    def test_positions_are_sequential(self):
        segments = [(i, f"This is paragraph number {i} with enough characters here.") for i in range(5)]
        paragraphs = chunk_segments(segments, chapter_number=1)
        positions = [p.position for p in paragraphs]
        assert positions == list(range(len(paragraphs)))

    def test_whitespace_only_segments_are_skipped(self):
        segments = [(0, "   "), (1, "Real content here."), (2, "\n\t")]
        paragraphs = chunk_segments(segments, chapter_number=1)
        assert all(p.text.strip() for p in paragraphs)


# ── DocumentProcessingPipeline (integration-lite) ────────────────────────────


class TestDocumentProcessingPipeline:
    @pytest.mark.asyncio
    async def test_unsupported_extension_raises(self, tmp_path):
        from pipelines.document_processing.pipeline import DocumentProcessingPipeline

        bad_file = tmp_path / "novel.txt"
        bad_file.write_text("hello")

        pipeline = DocumentProcessingPipeline()
        with pytest.raises(ValueError, match="Unsupported file type"):
            await pipeline.run(bad_file)

    @pytest.mark.asyncio
    async def test_missing_file_raises(self, tmp_path):
        from pipelines.document_processing.pipeline import DocumentProcessingPipeline

        pipeline = DocumentProcessingPipeline()
        with pytest.raises(FileNotFoundError):
            await pipeline.run(tmp_path / "missing.pdf")

    @pytest.mark.asyncio
    async def test_docx_processing(self, tmp_path):
        """Create a minimal DOCX and verify it produces a Document."""
        try:
            import docx  # noqa: F401
        except ImportError:
            pytest.skip("python-docx not installed")

        import docx as docx_lib

        doc_file = tmp_path / "test.docx"
        wdoc = docx_lib.Document()
        wdoc.add_paragraph("Chapter 1")
        wdoc.add_paragraph("The hero woke up on a cold morning and looked around the room.")
        wdoc.add_paragraph("Chapter 2")
        wdoc.add_paragraph("The journey began at dawn. The path was steep and treacherous.")
        wdoc.save(str(doc_file))

        from pipelines.document_processing.pipeline import DocumentProcessingPipeline

        pipeline = DocumentProcessingPipeline()
        result = await pipeline.run(doc_file)

        assert result.title == "test"
        assert result.total_chapters >= 1
        assert result.total_paragraphs >= 1
