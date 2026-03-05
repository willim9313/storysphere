"""Unit tests for keyword extraction in the feature extraction pipeline (Phase 2b)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from pipelines.feature_extraction.pipeline import (
    FeatureExtractionPipeline,
    FeatureExtractionResult,
)
from services.keyword_service import KeywordAggregator, YakeKeywordExtractor


def _make_document(num_chapters: int = 2, paras_per_chapter: int = 2) -> Document:
    chapters = []
    for ch_num in range(1, num_chapters + 1):
        paragraphs = [
            Paragraph(
                text=f"Chapter {ch_num} paragraph {i}. The brave hero fought the dark villain.",
                chapter_number=ch_num,
                position=i,
            )
            for i in range(paras_per_chapter)
        ]
        chapters.append(Chapter(number=ch_num, paragraphs=paragraphs))
    return Document(
        title="Test Novel",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


def _mock_embedder():
    embedder = MagicMock()
    embedder.aembed_texts = AsyncMock(
        side_effect=lambda texts: [[0.1] * 384 for _ in texts]
    )
    return embedder


def _mock_keyword_extractor(keywords: dict[str, float] | None = None):
    kws = keywords or {"hero": 0.9, "villain": 0.7}
    ext = AsyncMock()
    ext.extract = AsyncMock(return_value=kws)
    return ext


class TestPipelineBackwardCompat:
    """Verify pipeline works without keyword extractor (backward compat)."""

    async def test_no_keyword_extractor(self):
        doc = _make_document()
        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=None,
        )
        result = await pipeline.run(doc)
        assert result.paragraphs_embedded == 4
        assert result.keywords_extracted == 0
        # Paragraphs should not have keywords
        for ch in doc.chapters:
            for para in ch.paragraphs:
                assert para.keywords is None


class TestPipelineKeywordExtraction:
    """Verify keyword extraction is performed per paragraph."""

    async def test_paragraph_keywords_set(self):
        doc = _make_document()
        extractor = _mock_keyword_extractor()
        aggregator = KeywordAggregator(strategy="sum")

        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=extractor,
            keyword_aggregator=aggregator,
        )
        result = await pipeline.run(doc)

        assert result.keywords_extracted == 4
        for ch in doc.chapters:
            for para in ch.paragraphs:
                assert para.keywords == {"hero": 0.9, "villain": 0.7}

    async def test_chapter_keywords_aggregated(self):
        doc = _make_document()
        extractor = _mock_keyword_extractor()
        aggregator = KeywordAggregator(strategy="sum")

        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=extractor,
            keyword_aggregator=aggregator,
        )
        await pipeline.run(doc)

        for ch in doc.chapters:
            assert ch.keywords is not None
            assert "hero" in ch.keywords
            assert "villain" in ch.keywords

    async def test_book_keywords_aggregated(self):
        doc = _make_document()
        extractor = _mock_keyword_extractor()
        aggregator = KeywordAggregator(strategy="sum")

        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=extractor,
            keyword_aggregator=aggregator,
        )
        await pipeline.run(doc)

        assert doc.keywords is not None
        assert "hero" in doc.keywords

    async def test_no_aggregator_skips_chapter_aggregation(self):
        doc = _make_document()
        extractor = _mock_keyword_extractor()

        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=extractor,
            keyword_aggregator=None,
        )
        result = await pipeline.run(doc)

        assert result.keywords_extracted == 4
        # Paragraph keywords set, but chapter keywords not aggregated
        for ch in doc.chapters:
            assert ch.keywords is None


class TestPipelineKeywordErrorResilience:
    """Verify pipeline handles keyword extraction failures gracefully."""

    async def test_extractor_failure_does_not_break_pipeline(self):
        doc = _make_document(num_chapters=1, paras_per_chapter=2)
        extractor = AsyncMock()
        extractor.extract = AsyncMock(side_effect=RuntimeError("LLM down"))
        aggregator = KeywordAggregator()

        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            keyword_extractor=extractor,
            keyword_aggregator=aggregator,
        )
        result = await pipeline.run(doc)

        # Embedding still works
        assert result.paragraphs_embedded == 2
        # Keywords count should be 0 since all failed
        assert result.keywords_extracted == 0


class TestPipelineQdrantKeywordPayload:
    """Verify Qdrant payload includes keyword data."""

    async def test_qdrant_payload_includes_keywords(self):
        doc = _make_document(num_chapters=1, paras_per_chapter=1)
        extractor = _mock_keyword_extractor({"hero": 0.9, "quest": 0.5})

        mock_qdrant = MagicMock()
        pipeline = FeatureExtractionPipeline(
            embedding_generator=_mock_embedder(),
            qdrant_client=mock_qdrant,
            keyword_extractor=extractor,
            keyword_aggregator=KeywordAggregator(),
        )
        await pipeline.run(doc)

        # Verify qdrant.upsert was called
        assert mock_qdrant.upsert.called
        call_args = mock_qdrant.upsert.call_args
        points = call_args.kwargs.get("points") or call_args[1].get("points")
        assert len(points) == 1
        payload = points[0].payload
        assert "keywords" in payload
        assert "keyword_scores" in payload
        assert set(payload["keywords"]) == {"hero", "quest"}
        assert payload["keyword_scores"]["hero"] == 0.9
