"""章節審閱的純函數：切段、角色覆寫、重建章節、apply_review、build_review_data。"""

from __future__ import annotations

from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    Paragraph,
    ParagraphRole,
)
from storysphere.ingest.review import (
    apply_paragraph_splits,
    apply_review,
    apply_role_overrides,
    build_review_data,
    rebuild_chapters,
)


def make_doc(chapter_texts: list[list[str]], **para_kw) -> Document:
    """每個內層清單是一章的段落文字。"""
    chapters = []
    n = 0
    for number, texts in enumerate(chapter_texts, start=1):
        paras = []
        for pos, text in enumerate(texts):
            paras.append(
                Paragraph(id=f"p{n}", text=text, chapter_number=number, position=pos, **para_kw)
            )
            n += 1
        chapters.append(Chapter(number=number, title=f"Ch{number}", paragraphs=paras))
    return Document(
        id="doc-1", title="Test", file_path="/tmp/t.txt", file_type=FileType.TXT, chapters=chapters
    )


def texts(doc: Document) -> list[str]:
    return [p.text for ch in doc.chapters for p in ch.paragraphs]


def roles(doc: Document) -> list[ParagraphRole]:
    return [p.role for ch in doc.chapters for p in ch.paragraphs]


class TestApplyParagraphSplits:
    def test_empty_splits_is_noop(self):
        doc = make_doc([["Hello world.", "Second."]])
        apply_paragraph_splits(doc, {})
        assert texts(doc) == ["Hello world.", "Second."]

    def test_single_offset_splits_in_two(self):
        doc = make_doc([["HeadTail"]])
        apply_paragraph_splits(doc, {"0": [4]})
        assert texts(doc) == ["Head", "Tail"]

    def test_two_offsets_split_in_three(self):
        doc = make_doc([["AAABBBCCC"]])
        apply_paragraph_splits(doc, {"0": [3, 6]})
        assert texts(doc) == ["AAA", "BBB", "CCC"]

    def test_positions_renumbered_within_chapter(self):
        doc = make_doc([["AAABBB", "CCC"]])
        apply_paragraph_splits(doc, {"0": [3]})
        assert [p.position for p in doc.chapters[0].paragraphs] == [0, 1, 2]

    def test_pieces_inherit_role_and_chapter_number(self):
        doc = make_doc([["x"], ["AAABBB"]], role=ParagraphRole.preamble)
        apply_paragraph_splits(doc, {"1": [3]})
        pieces = doc.chapters[1].paragraphs
        assert [p.role for p in pieces] == [ParagraphRole.preamble] * 2
        assert [p.chapter_number for p in pieces] == [2, 2]

    def test_index_is_global_across_chapters(self):
        doc = make_doc([["AAAA"], ["BBBB"]])
        apply_paragraph_splits(doc, {"1": [2]})
        assert texts(doc) == ["AAAA", "BB", "BB"]

    def test_indices_refer_to_pre_split_order(self):
        doc = make_doc([["AAAA", "BBBB"]])
        apply_paragraph_splits(doc, {"0": [2], "1": [1]})
        assert texts(doc) == ["AA", "AA", "B", "BBB"]

    def test_invalid_entries_ignored(self):
        doc = make_doc([["AAAA", "BB  ", "CCCC", "DDDD"]])
        apply_paragraph_splits(
            doc,
            {
                "0": [3, 1],  # 沒有遞增
                "1": [2],  # 會切出只有空白的一段
                "2": [0],  # 超出範圍
                "3": [4],  # 等於長度
                "9": [1],  # 沒有這個段落
                "x": [1],  # 不是索引
            },
        )
        assert texts(doc) == ["AAAA", "BB  ", "CCCC", "DDDD"]

    def test_invalid_entry_does_not_block_valid_one(self):
        doc = make_doc([["AAAA", "BBBB"]])
        apply_paragraph_splits(doc, {"0": [9], "1": [2]})
        assert texts(doc) == ["AAAA", "BB", "BB"]

    def test_title_span_kept_on_piece_that_contains_it(self):
        doc = make_doc([["TitleBodyTail"]], title_span=(0, 5))
        apply_paragraph_splits(doc, {"0": [9]})
        assert [p.title_span for p in doc.chapters[0].paragraphs] == [(0, 5), None]

    def test_title_span_shifted_into_later_piece(self):
        doc = make_doc([["LeadTitleBody"]], title_span=(4, 9))
        apply_paragraph_splits(doc, {"0": [4]})
        assert [p.title_span for p in doc.chapters[0].paragraphs] == [None, (0, 5)]

    def test_title_span_dropped_when_split_through_it(self):
        doc = make_doc([["TitleBody"]], title_span=(0, 5))
        apply_paragraph_splits(doc, {"0": [3]})
        assert [p.title_span for p in doc.chapters[0].paragraphs] == [None, None]


class TestApplyRoleOverrides:
    def test_override_by_global_index(self):
        doc = make_doc([["a", "b"], ["c"]])
        apply_role_overrides(doc, {"2": "epigraph", "0": "preamble"})
        assert roles(doc) == [ParagraphRole.preamble, ParagraphRole.body, ParagraphRole.epigraph]

    def test_empty_is_noop(self):
        doc = make_doc([["a"]])
        apply_role_overrides(doc, {})
        assert roles(doc) == [ParagraphRole.body]

    def test_invalid_entries_ignored(self):
        doc = make_doc([["a", "b"]])
        apply_role_overrides(doc, {"x": "section", "1": "nonsense", "7": "section", "-1": "section"})
        assert roles(doc) == [ParagraphRole.body, ParagraphRole.body]


class TestRebuildChapters:
    def doc(self) -> Document:
        return make_doc([["a", "b"], ["c", "d"], ["e"]])

    def test_same_boundaries(self):
        chapters = rebuild_chapters(
            self.doc(),
            [
                {"title": "One", "start_paragraph_index": 0},
                {"title": "Two", "start_paragraph_index": 2},
                {"title": "Three", "start_paragraph_index": 4},
            ],
        )
        assert [c.title for c in chapters] == ["One", "Two", "Three"]
        assert [[p.text for p in c.paragraphs] for c in chapters] == [["a", "b"], ["c", "d"], ["e"]]
        assert [c.number for c in chapters] == [1, 2, 3]

    def test_merge_into_single_chapter(self):
        chapters = rebuild_chapters(self.doc(), [{"title": "All", "start_paragraph_index": 0}])
        assert len(chapters) == 1
        assert [p.position for p in chapters[0].paragraphs] == [0, 1, 2, 3, 4]
        assert {p.chapter_number for p in chapters[0].paragraphs} == {1}

    def test_paragraph_ids_preserved(self):
        chapters = rebuild_chapters(self.doc(), [{"title": "All", "start_paragraph_index": 0}])
        assert [p.id for p in chapters[0].paragraphs] == ["p0", "p1", "p2", "p3", "p4"]

    def test_numbers_skip_non_body_roles(self):
        chapters = rebuild_chapters(
            self.doc(),
            [
                {"title": "序", "role": "preface", "start_paragraph_index": 0},
                {"title": "一", "role": "body", "start_paragraph_index": 1},
                {"title": "二", "role": "body", "start_paragraph_index": 3},
                {"title": "後記", "role": "afterword", "start_paragraph_index": 4},
            ],
        )
        assert [c.role for c in chapters] == [
            ChapterRole.preface,
            ChapterRole.body,
            ChapterRole.body,
            ChapterRole.afterword,
        ]
        assert [c.number for c in chapters] == [0, 1, 2, 3]
        assert [p.chapter_number for p in chapters[1].paragraphs] == [1, 1]

    def test_empty_title_becomes_none(self):
        chapters = rebuild_chapters(self.doc(), [{"title": "", "start_paragraph_index": 0}])
        assert chapters[0].title is None

    def test_role_defaults_to_body_and_invalid_falls_back(self):
        chapters = rebuild_chapters(
            self.doc(),
            [
                {"title": "A", "start_paragraph_index": 0},
                {"title": "B", "role": "nonsense", "start_paragraph_index": 2},
            ],
        )
        assert [c.role for c in chapters] == [ChapterRole.body, ChapterRole.body]


class TestApplyReview:
    def test_absent_chapters_returns_false_and_changes_nothing(self):
        doc = make_doc([["AAAA", "b"], ["c"]])
        before = doc.model_copy(deep=True)
        assert apply_review(doc, {}) is False
        assert doc == before

    def test_empty_or_none_chapters_returns_false(self):
        doc = make_doc([["AAAA"]])
        assert apply_review(doc, {"chapters": []}) is False
        assert apply_review(doc, {"chapters": None}) is False
        assert len(doc.chapters) == 1

    def test_overrides_and_splits_not_applied_without_chapters(self):
        """與舊版相同：沒給 chapters 時，角色覆寫與切段也一併不套用。"""
        doc = make_doc([["AAAA"]])
        payload = {"role_overrides": {"0": "epigraph"}, "paragraph_splits": {"0": [2]}}
        assert apply_review(doc, payload) is False
        assert texts(doc) == ["AAAA"]
        assert roles(doc) == [ParagraphRole.body]

    def test_splits_then_overrides_then_rebuild(self):
        doc = make_doc([["AAAABBBB", "c"], ["d"]])
        payload = {
            # 索引 1、2 指的是切段之後的順序
            "paragraph_splits": {"0": [4]},
            "role_overrides": {"1": "epigraph"},
            "chapters": [
                {"title": "X", "role": "body", "start_paragraph_index": 0},
                {"title": "Y", "role": "body", "start_paragraph_index": 2},
            ],
        }
        assert apply_review(doc, payload) is True
        assert [c.title for c in doc.chapters] == ["X", "Y"]
        assert [[p.text for p in c.paragraphs] for c in doc.chapters] == [
            ["AAAA", "BBBB"],
            ["c", "d"],
        ]
        assert roles(doc) == [
            ParagraphRole.body,
            ParagraphRole.epigraph,
            ParagraphRole.body,
            ParagraphRole.body,
        ]


class TestBuildReviewData:
    def test_shape(self):
        doc = make_doc([["Title\nOne. Two!"]], title_span=(0, 5))
        doc.chapters[0].role = ChapterRole.preface
        data = build_review_data(doc)
        assert data == {
            "chapters": [
                {
                    "chapter_idx": 0,
                    "title": "Ch1",
                    "role": "preface",
                    "paragraphs": [
                        {
                            "paragraph_index": 0,
                            "text": "Title\nOne. Two!",
                            "role": "body",
                            "title_span": [0, 5],
                            "sentences": ["Title\nOne.", "Two!"],
                        }
                    ],
                }
            ]
        }

    def test_paragraph_index_is_global_not_per_chapter(self):
        data = build_review_data(make_doc([["a", "b"], ["c"], ["d", "e"]]))
        indices = [[p["paragraph_index"] for p in ch["paragraphs"]] for ch in data["chapters"]]
        assert indices == [[0, 1], [2], [3, 4]]
        assert [ch["chapter_idx"] for ch in data["chapters"]] == [0, 1, 2]

    def test_cjk_sentences_and_fallback(self):
        doc = make_doc([["他來了。她走了！", "***"]])
        doc.chapters[0].paragraphs[1].role = ParagraphRole.separator
        paras = build_review_data(doc)["chapters"][0]["paragraphs"]
        assert paras[0]["sentences"] == ["他來了。", "她走了！"]
        assert paras[0]["title_span"] is None
        assert paras[1]["sentences"] == ["***"]
        assert paras[1]["role"] == "separator"
