"""Tests for services.imagery_extractor — LLM extraction and clustering."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from domain.imagery import ImageryType, SymbolCluster
from services.imagery_extractor import ImageryExtractor


def _make_llm_response(items: list[dict]) -> MagicMock:
    """Create a mock LLM response with the given items as JSON content."""
    import json

    content = json.dumps({"items": items})
    mock_resp = MagicMock()
    mock_resp.content = content
    return mock_resp


class TestParseResponse:
    def test_parses_items_list(self):
        import json

        content = json.dumps({"items": [
            {"term": "mirror", "imagery_type": "object", "context_sentence": "She looked in the mirror."},
        ]})
        result = ImageryExtractor._parse_response(content)
        assert len(result) == 1
        assert result[0]["term"] == "mirror"
        assert result[0]["imagery_type"] == "object"

    def test_strips_empty_terms(self):
        import json

        content = json.dumps({"items": [
            {"term": "", "imagery_type": "object", "context_sentence": "x"},
            {"term": "fire", "imagery_type": "nature", "context_sentence": "The fire burned."},
        ]})
        result = ImageryExtractor._parse_response(content)
        assert len(result) == 1
        assert result[0]["term"] == "fire"

    def test_normalises_unknown_imagery_type(self):
        import json

        content = json.dumps({"items": [
            {"term": "fog", "imagery_type": "weather", "context_sentence": "Fog rolled in."},
        ]})
        result = ImageryExtractor._parse_response(content)
        assert result[0]["imagery_type"] == "other"

    def test_handles_bare_list(self):
        import json

        content = json.dumps([
            {"term": "door", "imagery_type": "spatial", "context_sentence": "He knocked on the door."},
        ])
        result = ImageryExtractor._parse_response(content)
        assert len(result) == 1
        assert result[0]["term"] == "door"

    def test_raises_on_unparseable(self):
        with pytest.raises(ValueError, match="Failed to parse imagery JSON"):
            ImageryExtractor._parse_response("not json at all ::::")


class TestCallLlm:
    async def test_calls_llm_and_returns_items(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response([
            {"term": "mirror", "imagery_type": "object", "context_sentence": "ctx"},
        ]))
        extractor = ImageryExtractor(llm=mock_llm)
        result = await extractor._call_llm("Some paragraph text", chapter_number=1)
        assert len(result) == 1
        assert result[0]["term"] == "mirror"

    async def test_set_llm_service_context_called(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response([]))
        extractor = ImageryExtractor(llm=mock_llm)

        with patch("services.imagery_extractor.ImageryExtractor._parse_response", return_value=[]):
            with patch("core.token_callback.set_llm_service_context") as mock_ctx:
                await extractor._call_llm("text", 1)
                mock_ctx.assert_called_once_with("imagery")


class TestExtractChapterImagery:
    async def test_empty_text_returns_empty(self):
        extractor = ImageryExtractor(llm=AsyncMock())
        result = await extractor.extract_chapter_imagery("", chapter_number=1)
        assert result == []

    async def test_stamps_chapter_number(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response([
            {"term": "water", "imagery_type": "nature", "context_sentence": "Water flowed."},
        ]))
        extractor = ImageryExtractor(llm=mock_llm)
        result = await extractor.extract_chapter_imagery("Water flowed past.", chapter_number=5)
        assert result[0]["chapter_number"] == 5

    async def test_llm_failure_returns_empty(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(side_effect=ConnectionError("network error"))
        extractor = ImageryExtractor(llm=mock_llm)
        result = await extractor.extract_chapter_imagery("Some text", chapter_number=1)
        assert result == []


class TestClusterSynonyms:
    async def test_empty_input_returns_empty(self):
        extractor = ImageryExtractor()
        result = await extractor.cluster_synonyms([])
        assert result == []

    async def test_single_term_forms_single_cluster(self):
        mock_embeddings = [[1.0, 0.0, 0.0]]
        with patch(
            "pipelines.feature_extraction.embedding_generator.EmbeddingGenerator.aembed_texts",
            new=AsyncMock(return_value=mock_embeddings),
        ):
            extractor = ImageryExtractor()
            result = await extractor.cluster_synonyms(["mirror"])
        assert len(result) == 1
        assert result[0].canonical_term == "mirror"
        assert result[0].variants == []

    async def test_similar_terms_merged_into_cluster(self):
        # mirror and looking-glass are very similar (sim ≈ 1.0)
        # fire and water are dissimilar (sim ≈ 0.0)
        vec_mirror = [1.0, 0.0]
        vec_glass = [0.99, 0.14]   # high similarity to mirror
        vec_fire = [0.0, 1.0]      # orthogonal

        # Normalise
        def norm(v):
            n = sum(x**2 for x in v) ** 0.5
            return [x / n for x in v]

        vecs = [norm(vec_mirror), norm(vec_glass), norm(vec_fire)]

        with patch(
            "pipelines.feature_extraction.embedding_generator.EmbeddingGenerator.aembed_texts",
            new=AsyncMock(return_value=vecs),
        ):
            extractor = ImageryExtractor()
            # mirror appears 3x, glass 1x, fire 2x → order: mirror, fire, glass
            result = await extractor.cluster_synonyms(
                ["mirror", "mirror", "mirror", "looking-glass", "fire", "fire"]
            )

        terms_in_clusters = {c.canonical_term: c.variants for c in result}
        # mirror should be canonical with looking-glass as variant
        assert "mirror" in terms_in_clusters
        assert "looking-glass" in terms_in_clusters["mirror"]
        # fire should be its own cluster
        assert "fire" in terms_in_clusters
        assert terms_in_clusters["fire"] == []

    async def test_canonical_is_highest_frequency(self):
        # Both have identical embeddings so sim=1.0; the most frequent becomes canonical
        vec = [1.0, 0.0]

        def norm(v):
            n = sum(x**2 for x in v) ** 0.5
            return [x / n for x in v]

        vecs = [norm(vec), norm(vec)]

        with patch(
            "pipelines.feature_extraction.embedding_generator.EmbeddingGenerator.aembed_texts",
            new=AsyncMock(return_value=vecs),
        ):
            extractor = ImageryExtractor()
            # "fire" appears 5x, "flame" 2x
            result = await extractor.cluster_synonyms(
                ["fire"] * 5 + ["flame"] * 2
            )
        assert len(result) == 1
        assert result[0].canonical_term == "fire"
        assert "flame" in result[0].variants


class TestBuildImageryEntities:
    async def test_builds_entities_and_occurrences(self):
        raw = [
            {
                "term": "mirror",
                "imagery_type": "object",
                "context_sentence": "She gazed into the mirror.",
                "chapter_number": 1,
                "paragraph_id": "p1",
                "position": 0,
                "co_occurring_terms": [],
            },
            {
                "term": "mirror",
                "imagery_type": "object",
                "context_sentence": "The mirror cracked.",
                "chapter_number": 2,
                "paragraph_id": "p2",
                "position": 1,
                "co_occurring_terms": [],
            },
        ]
        clusters = [
            SymbolCluster(
                canonical_term="mirror",
                variants=[],
                semantic_similarity_scores={},
                book_id="",
            )
        ]
        extractor = ImageryExtractor()
        entities, occurrences = await extractor.build_imagery_entities(raw, "book-1", clusters)

        assert len(entities) == 1
        entity = entities[0]
        assert entity.term == "mirror"
        assert entity.frequency == 2
        assert entity.chapter_distribution == {1: 1, 2: 1}
        assert entity.book_id == "book-1"

        assert len(occurrences) == 2
        occ_chapters = sorted(o.chapter_number for o in occurrences)
        assert occ_chapters == [1, 2]

    async def test_variant_mapped_to_canonical(self):
        raw = [
            {
                "term": "looking-glass",
                "imagery_type": "object",
                "context_sentence": "The looking-glass reflected her.",
                "chapter_number": 1,
                "paragraph_id": "p1",
                "position": 0,
                "co_occurring_terms": [],
            }
        ]
        clusters = [
            SymbolCluster(
                canonical_term="mirror",
                variants=["looking-glass"],
                semantic_similarity_scores={"looking-glass": 0.98},
                book_id="",
            )
        ]
        extractor = ImageryExtractor()
        entities, occurrences = await extractor.build_imagery_entities(raw, "book-1", clusters)

        assert len(entities) == 1
        assert entities[0].term == "mirror"
        assert entities[0].frequency == 1
        assert len(occurrences) == 1
        assert occurrences[0].imagery_id == entities[0].id
