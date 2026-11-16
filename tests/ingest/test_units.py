"""切抽取單位（02 §2）：依語言的上限、不跨章、只收正文、前文脈絡、穩定 id。"""

from __future__ import annotations

from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    Paragraph,
    ParagraphRole,
)
from storysphere.ingest.units import build_units, unit_limit


def para(chapter: int, position: int, text: str, **kwargs) -> Paragraph:
    return Paragraph(
        id=f"p{chapter}-{position}", text=text, chapter_number=chapter, position=position, **kwargs
    )


def book(chapters: list[Chapter], language: str = "zh-tw") -> Document:
    return Document(
        id="book", title="t", file_path="x.txt", file_type=FileType.TXT,
        chapters=chapters, language=language,
    )


def chapter(number: int, sizes: list[int], role: ChapterRole = ChapterRole.body) -> Chapter:
    return Chapter(
        number=number,
        role=role,
        paragraphs=[para(number, i, "字" * n) for i, n in enumerate(sizes)],
    )


class TestUnitLimit:
    def test_cjk(self):
        assert [unit_limit(code) for code in ("zh-tw", "zh-cn", "ja", "ko")] == [3000] * 4

    def test_other(self):
        assert unit_limit("en") == 8000


class TestBuildUnits:
    def test_accumulates_up_to_limit(self):
        units = build_units(book([chapter(1, [1200, 1200, 1200, 1200, 500])]))
        assert [u.paragraph_ids for u in units] == [
            ["p1-0", "p1-1"],
            ["p1-2", "p1-3", "p1-4"],
        ]

    def test_other_language_uses_larger_limit(self):
        units = build_units(book([chapter(1, [3000, 3000, 3000])], language="en"))
        assert {u.language for u in units} == {"en"}
        assert [len(u.paragraphs) for u in units] == [2, 1]

    def test_does_not_cross_chapters(self):
        units = build_units(book([chapter(1, [100]), chapter(2, [100])]))
        assert [(u.chapter, u.paragraph_ids) for u in units] == [(1, ["p1-0"]), (2, ["p2-0"])]

    def test_oversized_paragraph_is_its_own_unit(self):
        units = build_units(book([chapter(1, [100, 5000, 100])]))
        assert [u.paragraph_ids for u in units] == [["p1-0"], ["p1-1"], ["p1-2"]]

    def test_ids_are_stable(self):
        units = build_units(book([chapter(1, [2000, 2000]), chapter(2, [10])]))
        assert [u.id for u in units] == ["book:1:0", "book:1:1", "book:2:0"]

    def test_context_is_last_paragraph_of_previous_unit(self):
        units = build_units(book([chapter(1, [2000, 500, 2000]), chapter(2, [10])]))
        assert units[0].context_only is None
        assert units[1].context_only.id == "p1-1"
        assert units[2].context_only.id == "p1-2"

    def test_skips_non_body_chapters_and_paragraphs(self):
        ch1 = Chapter(
            number=1,
            paragraphs=[
                para(1, 0, "正文一"),
                para(1, 1, "***", role=ParagraphRole.separator),
                para(1, 2, "正文二"),
            ],
        )
        units = build_units(book([chapter(0, [50], role=ChapterRole.other), ch1]))
        assert [u.paragraph_ids for u in units] == [["p1-0", "p1-2"]]

    def test_title_prefix_is_stripped(self):
        ch = Chapter(number=1, paragraphs=[para(1, 0, "第一章 起\n正文", title_span=(0, 5))])
        units = build_units(book([ch]))
        assert units[0].paragraphs[0].text == "正文"

    def test_no_body_text_gives_no_units(self):
        assert build_units(book([chapter(0, [50], role=ChapterRole.other)])) == []
