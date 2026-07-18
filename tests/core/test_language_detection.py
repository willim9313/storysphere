"""Tests for core.language_detection."""

from unittest.mock import patch

from storysphere.core.language_detection import (
    detect_language,
    detect_language_from_document,
    get_language_display_name,
    refine_chinese_variant,
)
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph, ParagraphRole


def _paragraph(text: str, role: str = "body") -> Paragraph:
    return Paragraph(text=text, chapter_number=1, position=0, role=ParagraphRole(role))


def _document(chapters: list[Chapter]) -> Document:
    return Document(title="t", file_path="x", file_type=FileType.TXT, chapters=chapters)


class TestDetectLanguage:
    def test_short_sample_defaults_to_en(self):
        assert detect_language("Hi") == "en"

    def test_pure_chinese_text_detected_as_zh(self):
        text = "這是一段很長的繁體中文文字用來測試語言偵測功能是否能正確判斷語系" * 3
        assert detect_language(text).startswith("zh")

    def test_pure_korean_text_not_overridden(self):
        text = "이것은 한국어로 작성된 긴 문장입니다 언어 감지 기능을 테스트하기 위한 것입니다" * 3
        assert detect_language(text) == "ko"

    def test_pure_japanese_text_not_overridden(self):
        text = "これは日本語で書かれた長い文章です言語検出機能をテストするためのものです" * 3
        assert detect_language(text) == "ja"

    def test_chinese_misclassified_by_langdetect_gets_corrected(self):
        # The reported bug: a short/atypical Chinese sample (e.g. front-matter
        # text) can get misread as Korean by langdetect's generic n-gram model.
        han_text = "第一章 目錄 前言 作者序 內容簡介 版權所有" * 3
        with patch("storysphere.core.language_detection.detect", return_value="ko"):
            result = detect_language(han_text)
        assert result == "zh-cn"

    def test_traditional_markers_pick_zh_tw(self):
        han_text = "國學說後幾萬記對聽見樂們個這時來會為麼與從開關還讓過" * 2
        with patch("storysphere.core.language_detection.detect", return_value="ko"):
            result = detect_language(han_text)
        assert result == "zh-tw"

    def test_simplified_markers_pick_zh_cn(self):
        han_text = "国学说后几万记对听见乐们个这时来会为么与从开关还让过" * 2
        with patch("storysphere.core.language_detection.detect", return_value="ko"):
            result = detect_language(han_text)
        assert result == "zh-cn"

    def test_han_with_hangul_present_not_overridden(self):
        # Real mixed Han+Hangul text (e.g. Korean using hanja loanwords)
        # should not be forced into zh just because Han characters appear.
        mixed = ("國" * 25) + "이것은 한국어 문장입니다"
        with patch("storysphere.core.language_detection.detect", return_value="ko"):
            result = detect_language(mixed)
        assert result == "ko"

    def test_detection_exception_falls_back_to_en_when_not_han_dominant(self):
        with patch(
            "storysphere.core.language_detection.detect", side_effect=Exception("boom")
        ):
            result = detect_language("Some plain English text that is long enough to sample.")
        assert result == "en"

    def test_detection_exception_still_corrects_han_dominant_sample(self):
        han_text = "第一章 目錄 前言 作者序 內容簡介 版權所有" * 3
        with patch(
            "storysphere.core.language_detection.detect", side_effect=Exception("boom")
        ):
            result = detect_language(han_text)
        assert result.startswith("zh")

    def test_real_toc_page_sample_not_misdetected_as_korean(self):
        # Regression test for the reported bug, using the real langdetect
        # call (no mock): a short table-of-contents-style excerpt like this
        # was previously misread as "ko" by langdetect with no correction.
        toc_text = "目錄\n第一章\n第二章\n第三章\n序\n作者簡介\n版權頁"
        assert detect_language(toc_text).startswith("zh")


class TestDetectLanguageFromDocument:
    def test_no_chapters_defaults_to_en(self):
        doc = _document([])
        assert detect_language_from_document(doc) == "en"

    def test_skips_non_body_paragraphs(self):
        body_text = "這是本文內容用來測試語言偵測是否只採用正文段落的文字樣本" * 3
        chapter = Chapter(
            number=1,
            paragraphs=[
                _paragraph("目錄", role="separator"),
                _paragraph(body_text, role="body"),
            ],
        )
        doc = _document([chapter])
        assert detect_language_from_document(doc).startswith("zh")

    def test_all_non_body_defaults_to_en(self):
        chapter = Chapter(number=1, paragraphs=[_paragraph("xxx", role="separator")])
        doc = _document([chapter])
        assert detect_language_from_document(doc) == "en"


class TestRefineChineseVariant:
    def test_traditional_body_refines_to_zh_tw(self):
        body = "他們個個說這時來會為麼與從開關還讓過幾萬人聽見樂聲後對國學" * 3
        doc = _document([Chapter(number=1, paragraphs=[_paragraph(body)])])
        assert refine_chinese_variant(doc) == "zh-tw"

    def test_simplified_body_refines_to_zh_cn(self):
        body = "他们个个说这时来会为么与从开关还让过几万人听见乐声后对国学" * 3
        doc = _document([Chapter(number=1, paragraphs=[_paragraph(body)])])
        assert refine_chinese_variant(doc) == "zh-cn"


class TestGetLanguageDisplayName:
    def test_bare_zh_maps_to_chinese_not_capitalized_code(self):
        # Regression: bare "zh" used to fall through to the capitalize()
        # fallback, yielding the meaningless prompt directive "Respond in Zh."
        assert get_language_display_name("zh") == "Chinese"

    def test_zh_tw_maps_to_traditional_chinese(self):
        assert get_language_display_name("zh-tw") == "Traditional Chinese"
