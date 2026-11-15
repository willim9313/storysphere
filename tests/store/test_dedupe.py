from __future__ import annotations

from storysphere.store.dedupe import char_ngrams, dedupe_drafts, jaccard
from storysphere.store.evidence_writer import QuoteDraft, SubjectRef

from tests.store.conftest import make_draft

HOLMES = SubjectRef(subject_id="c-holmes", role="participant")
WATSON = SubjectRef(subject_id="c-watson", role="participant")


def _event(summary: str, **overrides):
    fields = {"summary": summary, "subjects": [HOLMES], "discourse_chapter": 1}
    fields.update(overrides)
    return make_draft("event", **fields)


class TestSimilarity:
    def test_identical_text_is_1(self):
        grams = char_ngrams("福爾摩斯注射古柯鹼")
        assert jaccard(grams, grams) == 1.0

    def test_unrelated_text_is_low(self):
        assert jaccard(char_ngrams("福爾摩斯注射古柯鹼"), char_ngrams("摩斯坦小姐來訪")) < 0.2

    def test_whitespace_ignored(self):
        assert char_ngrams("福爾摩斯 注射") == char_ngrams("福爾摩斯注射")

    def test_short_text_is_one_gram(self):
        assert char_ngrams("珍珠") == {"珍珠"}


class TestDedupeDrafts:
    def test_near_duplicates_merge_quotes_and_keep_max_confidence(self):
        first = _event(
            "福爾摩斯在華生面前注射古柯鹼溶液",
            confidence=0.6,
            quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯")],
        )
        second = _event(
            "福爾摩斯在華生面前注射了古柯鹼溶液",
            confidence=0.9,
            quotes=[
                QuoteDraft(paragraph_id="p-1", text="福爾摩斯"),  # 重複的引文不重複收
                QuoteDraft(paragraph_id="p-1", text="拿下一個瓶子"),
            ],
        )

        (merged,) = dedupe_drafts([first, second])

        assert merged.summary == first.summary  # 第一筆的內容留下
        assert merged.confidence == 0.9
        assert [q.text for q in merged.quotes] == ["福爾摩斯", "拿下一個瓶子"]

    def test_different_summary_kept_apart(self):
        drafts = [_event("福爾摩斯注射古柯鹼溶液"), _event("摩斯坦小姐帶著信來訪")]

        assert dedupe_drafts(drafts) == drafts

    def test_same_summary_different_claim_type_kept_apart(self):
        drafts = [
            _event("福爾摩斯注射古柯鹼溶液"),
            make_draft(
                "utterance",
                summary="福爾摩斯注射古柯鹼溶液",
                subjects=[HOLMES],
                discourse_chapter=1,
            ),
        ]

        assert len(dedupe_drafts(drafts)) == 2

    def test_same_summary_different_subjects_kept_apart(self):
        drafts = [
            _event("他走進房間坐了下來看著爐火"),
            _event("他走進房間坐了下來看著爐火", subjects=[WATSON]),
        ]

        assert len(dedupe_drafts(drafts)) == 2

    def test_same_summary_different_chapter_kept_apart(self):
        drafts = [
            _event("福爾摩斯注射古柯鹼溶液"),
            _event("福爾摩斯注射古柯鹼溶液", discourse_chapter=2),
        ]

        assert len(dedupe_drafts(drafts)) == 2

    def test_subject_order_does_not_matter(self):
        drafts = [
            _event("福爾摩斯與華生搭馬車前往", subjects=[HOLMES, WATSON]),
            _event("福爾摩斯與華生搭馬車前往", subjects=[WATSON, HOLMES]),
        ]

        assert len(dedupe_drafts(drafts)) == 1

    def test_order_preserved(self):
        a = _event("福爾摩斯與華生搭馬車前往萊西厄姆劇院")
        b = _event("摩斯坦小姐收到匿名者寄來的珍珠")
        c = _event("福爾摩斯與華生搭上馬車前往萊西厄姆劇院")

        assert [d.summary for d in dedupe_drafts([a, b, c])] == [a.summary, b.summary]

    def test_one_changed_character_in_a_short_summary_is_not_a_duplicate(self):
        # 門檻 0.6 對短摘要很嚴：10 個字的摘要插入 1 個字，Jaccard 只有 0.55。
        drafts = [_event("甲事件發生在倫敦街頭"), _event("甲事件發生在倫敦的街頭")]

        assert len(dedupe_drafts(drafts)) == 2
