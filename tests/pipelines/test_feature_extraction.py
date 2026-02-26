"""Unit tests for the feature extraction pipeline."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from pipelines.feature_extraction.embedding_generator import EmbeddingGenerator
from pipelines.feature_extraction.pipeline import FeatureExtractionPipeline, FeatureExtractionResult


def _make_document(num_chapters: int = 2, paras_per_chapter: int = 3) -> Document:
    """Build a minimal Document for testing."""
    chapters = []
    for ch_num in range(1, num_chapters + 1):
        paragraphs = [
            Paragraph(
                text=f"Chapter {ch_num} paragraph {i} with enough text here.",
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


class TestEmbeddingGenerator:
    def test_empty_input_returns_empty(self):
        gen = EmbeddingGenerator()
        with patch(
            "pipelines.feature_extraction.embedding_generator._get_embeddings"
        ) as mock_get:
            result = gen.embed_texts([])
            mock_get.assert_not_called()
        assert result == []

    def test_embed_texts_calls_model(self):
        gen = EmbeddingGenerator()
        fake_embeddings = [[0.1] * 384, [0.2] * 384]
        mock_model = MagicMock()
        mock_model.embed_documents.return_value = fake_embeddings

        with patch(
            "pipelines.feature_extraction.embedding_generator._get_embeddings",
            return_value=mock_model,
        ):
            result = gen.embed_texts(["hello", "world"])

        assert len(result) == 2
        assert result[0] == [0.1] * 384

    @pytest.mark.asyncio
    async def test_aembed_texts_returns_vectors(self):
        gen = EmbeddingGenerator()
        fake_vectors = [[0.5] * 384, [0.6] * 384]
        mock_model = MagicMock()
        mock_model.embed_documents.return_value = fake_vectors

        with patch(
            "pipelines.feature_extraction.embedding_generator._get_embeddings",
            return_value=mock_model,
        ):
            result = await gen.aembed_texts(["text a", "text b"])

        assert len(result) == 2


class TestFeatureExtractionPipeline:
    @pytest.mark.asyncio
    async def test_empty_document_returns_zero_count(self):
        doc = Document(title="Empty", file_path="/tmp/x.pdf", file_type=FileType.PDF, chapters=[])
        gen = EmbeddingGenerator()
        pipeline = FeatureExtractionPipeline(embedding_generator=gen, qdrant_client=None)

        result = await pipeline.run(doc)

        assert result.paragraphs_embedded == 0
        assert result.qdrant_ids == []

    @pytest.mark.asyncio
    async def test_embeddings_written_to_paragraphs(self):
        doc = _make_document(num_chapters=1, paras_per_chapter=2)
        total_paras = doc.total_paragraphs

        fake_vectors = [[float(i)] * 384 for i in range(total_paras)]
        mock_gen = AsyncMock(spec=EmbeddingGenerator)
        mock_gen.aembed_texts = AsyncMock(return_value=fake_vectors)

        pipeline = FeatureExtractionPipeline(embedding_generator=mock_gen, qdrant_client=None)
        result = await pipeline.run(doc)

        assert result.paragraphs_embedded == total_paras
        # Check embeddings were set on paragraph objects
        all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
        for para in all_paras:
            assert para.embedding is not None
            assert len(para.embedding) == 384

    @pytest.mark.asyncio
    async def test_document_id_in_result(self):
        doc = _make_document(num_chapters=2, paras_per_chapter=2)
        total_paras = doc.total_paragraphs
        mock_gen = AsyncMock(spec=EmbeddingGenerator)
        mock_gen.aembed_texts = AsyncMock(return_value=[[0.0] * 384] * total_paras)

        pipeline = FeatureExtractionPipeline(embedding_generator=mock_gen, qdrant_client=None)
        result: FeatureExtractionResult = await pipeline.run(doc)

        assert result.document_id == doc.id
