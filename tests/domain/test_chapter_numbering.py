"""Tests for assign_chapter_numbers() — story numbering of chapters."""

from __future__ import annotations

from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    assign_chapter_numbers,
)

B = ChapterRole.body
P = ChapterRole.preface
T = ChapterRole.toc
A = ChapterRole.afterword


class TestAssignChapterNumbers:
    def test_empty_input_returns_empty(self):
        assert assign_chapter_numbers([]) == []

    def test_all_body_numbers_sequentially_from_one(self):
        assert assign_chapter_numbers([B, B, B]) == [1, 2, 3]

    def test_front_matter_does_not_consume_story_numbers(self):
        # preface + toc + 3 body: the first body chapter must be Ch.1
        assert assign_chapter_numbers([P, T, B, B, B]) == [-1, 0, 1, 2, 3]

    def test_back_matter_numbered_after_last_body(self):
        assert assign_chapter_numbers([B, B, A]) == [1, 2, 3]

    def test_front_and_back_matter_together(self):
        assert assign_chapter_numbers([P, T, B, B, A]) == [-1, 0, 1, 2, 3]

    def test_numbers_are_unique(self):
        numbers = assign_chapter_numbers([P, T, B, B, B, A, A])
        assert len(set(numbers)) == len(numbers)

    def test_ascending_order_preserves_document_order(self):
        # DocumentService orders chapters by number, so numbers must ascend
        # along document order for leading/trailing matter.
        numbers = assign_chapter_numbers([P, T, B, B, A])
        assert numbers == sorted(numbers)

    def test_no_body_chapters_numbers_from_zero_downwards(self):
        # Degenerate document (all front matter): still unique and ascending.
        assert assign_chapter_numbers([P, T]) == [-1, 0]


class TestBodyChapterCount:
    @staticmethod
    def _doc(*roles: ChapterRole) -> Document:
        numbers = assign_chapter_numbers(list(roles))
        return Document(
            title="Test",
            file_path="/tmp/t.pdf",
            file_type=FileType.PDF,
            chapters=[
                Chapter(number=n, role=r) for n, r in zip(numbers, roles, strict=True)
            ],
        )

    def test_excludes_front_and_back_matter(self):
        doc = self._doc(P, T, B, B, B, A)
        assert doc.body_chapter_count == 3
        assert doc.total_chapters == 6

    def test_equals_total_when_all_body(self):
        doc = self._doc(B, B)
        assert doc.body_chapter_count == doc.total_chapters == 2

    def test_zero_when_no_body_chapters(self):
        assert self._doc(P, T).body_chapter_count == 0
