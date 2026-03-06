"""Tests for keyword extraction service — extractors, aggregator, and factory."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.keyword_service import (
    BaseKeywordExtractor,
    CompositeKeywordExtractor,
    KeywordAggregator,
    KeywordService,
    LLMKeywordExtractor,
    TfidfKeywordExtractor,
    YakeKeywordExtractor,
    build_keyword_extractor,
)

# ── Sample text for testing ──────────────────────────────────────────────────

SAMPLE_TEXT = (
    "Elizabeth Bennet walked through the gardens of Pemberley, thinking about "
    "Mr. Darcy and his surprising proposal. The grand estate stretched across "
    "the rolling hills of Derbyshire. She reflected on the letter he had written "
    "after she refused him at Hunsford. Jane had always seen the good in everyone, "
    "but Elizabeth prided herself on her discernment."
)


# ── YakeKeywordExtractor ────────────────────────────────────────────────────


class TestYakeKeywordExtractor:
    async def test_extract_returns_keywords(self):
        extractor = YakeKeywordExtractor()
        result = await extractor.extract(SAMPLE_TEXT, max_keywords=5)
        assert isinstance(result, dict)
        assert len(result) <= 5
        assert all(isinstance(v, float) for v in result.values())
        assert all(0.0 <= v <= 1.0 for v in result.values())

    async def test_extract_empty_text(self):
        extractor = YakeKeywordExtractor()
        result = await extractor.extract("", max_keywords=5)
        assert result == {}

    async def test_extract_whitespace_text(self):
        extractor = YakeKeywordExtractor()
        result = await extractor.extract("   \n\t  ", max_keywords=5)
        assert result == {}

    async def test_keywords_are_lowercase(self):
        extractor = YakeKeywordExtractor()
        result = await extractor.extract(SAMPLE_TEXT, max_keywords=10)
        for kw in result:
            assert kw == kw.lower()


# ── TfidfKeywordExtractor ───────────────────────────────────────────────────


class TestTfidfKeywordExtractor:
    async def test_extract_returns_keywords(self):
        extractor = TfidfKeywordExtractor()
        result = await extractor.extract(SAMPLE_TEXT, max_keywords=5)
        assert isinstance(result, dict)
        assert len(result) <= 5
        assert all(0.0 <= v <= 1.0 for v in result.values())

    async def test_extract_empty_text(self):
        extractor = TfidfKeywordExtractor()
        result = await extractor.extract("")
        assert result == {}

    async def test_stops_words_excluded(self):
        extractor = TfidfKeywordExtractor()
        result = await extractor.extract("the the the and and and")
        assert result == {}

    async def test_max_score_is_one(self):
        extractor = TfidfKeywordExtractor()
        result = await extractor.extract(SAMPLE_TEXT, max_keywords=10)
        if result:
            max_score = max(result.values())
            assert max_score == 1.0


# ── LLMKeywordExtractor ─────────────────────────────────────────────────────


class TestLLMKeywordExtractor:
    async def test_parse_response_valid(self):
        content = json.dumps(
            {"keywords": [{"keyword": "darcy", "score": 0.9}, {"keyword": "estate", "score": 0.7}]}
        )
        result = LLMKeywordExtractor._parse_response(content)
        assert result == {"darcy": 0.9, "estate": 0.7}

    async def test_parse_response_with_markdown_fences(self):
        content = '```json\n{"keywords": [{"keyword": "hero", "score": 0.8}]}\n```'
        result = LLMKeywordExtractor._parse_response(content)
        assert result == {"hero": 0.8}

    async def test_parse_response_clamps_score(self):
        content = json.dumps({"keywords": [{"keyword": "test", "score": 1.5}]})
        result = LLMKeywordExtractor._parse_response(content)
        assert result["test"] == 1.0

    async def test_extract_empty_text(self):
        extractor = LLMKeywordExtractor(llm=MagicMock())
        result = await extractor.extract("")
        assert result == {}


# ── CompositeKeywordExtractor ────────────────────────────────────────────────


class TestCompositeKeywordExtractor:
    async def test_weighted_merge(self):
        ext1 = AsyncMock(spec=BaseKeywordExtractor)
        ext1.extract = AsyncMock(return_value={"hero": 0.8, "villain": 0.6})
        ext2 = AsyncMock(spec=BaseKeywordExtractor)
        ext2.extract = AsyncMock(return_value={"hero": 0.9, "quest": 0.7})

        composite = CompositeKeywordExtractor([(ext1, 0.4), (ext2, 0.6)])
        result = await composite.extract("test text", max_keywords=10)

        assert "hero" in result
        assert "villain" in result
        assert "quest" in result

    async def test_handles_sub_extractor_failure(self):
        ext_ok = AsyncMock(spec=BaseKeywordExtractor)
        ext_ok.extract = AsyncMock(return_value={"hero": 0.8})
        ext_fail = AsyncMock(spec=BaseKeywordExtractor)
        ext_fail.extract = AsyncMock(side_effect=RuntimeError("LLM down"))

        composite = CompositeKeywordExtractor([(ext_ok, 0.5), (ext_fail, 0.5)])
        result = await composite.extract("test text", max_keywords=10)
        assert "hero" in result

    async def test_empty_text(self):
        ext = AsyncMock(spec=BaseKeywordExtractor)
        ext.extract = AsyncMock(return_value={})
        composite = CompositeKeywordExtractor([(ext, 1.0)])
        result = await composite.extract("")
        assert result == {}

    def test_no_extractors_raises(self):
        with pytest.raises(ValueError, match="at least one"):
            CompositeKeywordExtractor([])


# ── KeywordAggregator ───────────────────────────────────────────────────────


class TestKeywordAggregator:
    def test_sum_strategy(self):
        agg = KeywordAggregator(strategy="sum")
        result = agg.aggregate(
            [{"hero": 0.8, "villain": 0.5}, {"hero": 0.6, "quest": 0.9}],
            top_k=10,
        )
        assert "hero" in result
        assert "villain" in result
        assert "quest" in result

    def test_avg_strategy(self):
        agg = KeywordAggregator(strategy="avg")
        result = agg.aggregate(
            [{"hero": 0.8}, {"hero": 0.4}],
            top_k=10,
        )
        # avg of 0.8, 0.4 = 0.6, normalised to 1.0 (only keyword)
        assert result["hero"] == 1.0

    def test_max_strategy(self):
        agg = KeywordAggregator(strategy="max")
        result = agg.aggregate(
            [{"hero": 0.3}, {"hero": 0.9}],
            top_k=10,
        )
        assert result["hero"] == 1.0

    def test_weighted_sum_strategy(self):
        agg = KeywordAggregator(strategy="weighted_sum")
        result = agg.aggregate(
            [{"hero": 0.8}, {"hero": 0.8}, {"rare": 0.9}],
            top_k=10,
        )
        # "hero" appears 2x → log(3) boost; "rare" 1x → log(2) boost
        assert "hero" in result
        assert "rare" in result

    def test_empty_input(self):
        agg = KeywordAggregator()
        assert agg.aggregate([]) == {}

    def test_top_k_limit(self):
        agg = KeywordAggregator(strategy="sum")
        kws = {f"word{i}": 0.5 for i in range(50)}
        result = agg.aggregate([kws], top_k=5)
        assert len(result) == 5

    def test_invalid_strategy_raises(self):
        with pytest.raises(ValueError, match="Unknown strategy"):
            KeywordAggregator(strategy="invalid")

    def test_normalised_to_zero_one(self):
        agg = KeywordAggregator(strategy="sum")
        result = agg.aggregate(
            [{"a": 0.5, "b": 1.0}, {"a": 0.5, "b": 0.0}],
            top_k=10,
        )
        assert all(0.0 <= v <= 1.0 for v in result.values())
        assert max(result.values()) == 1.0


# ── KeywordService ──────────────────────────────────────────────────────────


class TestKeywordService:
    async def test_delegates_to_doc_service(self):
        doc_svc = AsyncMock()
        doc_svc.get_chapter_keywords = AsyncMock(return_value={"hero": 0.8})
        doc_svc.get_book_keywords = AsyncMock(return_value={"quest": 0.9})

        svc = KeywordService(doc_service=doc_svc)
        assert await svc.get_chapter_keywords("doc1", 1) == {"hero": 0.8}
        assert await svc.get_book_keywords("doc1") == {"quest": 0.9}

        doc_svc.get_chapter_keywords.assert_awaited_once_with("doc1", 1)
        doc_svc.get_book_keywords.assert_awaited_once_with("doc1")

    async def test_get_entity_keywords_with_timeline(self):
        """When KG has timeline events, aggregate keywords from those chapters."""
        doc_svc = AsyncMock()
        doc_svc.get_chapter_keywords = AsyncMock(
            side_effect=lambda _doc, ch: {"battle": 0.8, "sword": 0.6} if ch == 1 else {"peace": 0.7}
        )
        doc_svc.get_book_keywords = AsyncMock(return_value={})

        kg_svc = AsyncMock()
        entity_mock = MagicMock(id="ent-1")
        kg_svc.get_entity_by_name = AsyncMock(return_value=entity_mock)
        event1 = MagicMock(chapter_number=1)
        event2 = MagicMock(chapter_number=3)
        kg_svc.get_entity_timeline = AsyncMock(return_value=[event1, event2])

        svc = KeywordService(doc_service=doc_svc, kg_service=kg_svc)
        result = await svc.get_entity_keywords("doc1", "Alice", top_k=5)

        assert isinstance(result, dict)
        assert len(result) > 0
        # Should have aggregated from chapters 1 and 3
        assert doc_svc.get_chapter_keywords.await_count == 2

    async def test_get_entity_keywords_no_kg_fallback(self):
        """Without kg_service, falls back to book keywords."""
        doc_svc = AsyncMock()
        doc_svc.get_book_keywords = AsyncMock(return_value={"hero": 0.9, "quest": 0.8})

        svc = KeywordService(doc_service=doc_svc, kg_service=None)
        result = await svc.get_entity_keywords("doc1", "Alice", top_k=5)

        assert result == {"hero": 0.9, "quest": 0.8}
        doc_svc.get_book_keywords.assert_awaited_once()

    async def test_get_entity_keywords_entity_not_found(self):
        """Entity not found in KG → fall back to book keywords."""
        doc_svc = AsyncMock()
        doc_svc.get_book_keywords = AsyncMock(return_value={"theme": 0.7})

        kg_svc = AsyncMock()
        kg_svc.get_entity_by_name = AsyncMock(return_value=None)

        svc = KeywordService(doc_service=doc_svc, kg_service=kg_svc)
        result = await svc.get_entity_keywords("doc1", "NonExistent")

        assert result == {"theme": 0.7}


# ── Factory ─────────────────────────────────────────────────────────────────


class TestBuildKeywordExtractor:
    def test_build_yake(self):
        ext = build_keyword_extractor("yake")
        assert isinstance(ext, YakeKeywordExtractor)

    def test_build_tfidf(self):
        ext = build_keyword_extractor("tfidf")
        assert isinstance(ext, TfidfKeywordExtractor)

    def test_build_llm(self):
        mock_llm = MagicMock()
        ext = build_keyword_extractor("llm", llm=mock_llm)
        assert isinstance(ext, LLMKeywordExtractor)

    def test_build_none(self):
        ext = build_keyword_extractor("none")
        assert ext is None

    @patch("config.settings.get_settings")
    def test_build_composite(self, mock_settings):
        mock_settings.return_value = MagicMock(keyword_composite_weights="yake:0.5,tfidf:0.5")
        ext = build_keyword_extractor("composite")
        assert isinstance(ext, CompositeKeywordExtractor)

    def test_build_unknown_falls_back_to_yake(self):
        ext = build_keyword_extractor("unknown_type")
        assert isinstance(ext, YakeKeywordExtractor)
