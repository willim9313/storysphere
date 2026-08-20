"""Integration tests for pipelines.symbol_discovery.SymbolDiscoveryPipeline."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.domain.imagery import ImageryEntity, ImageryType, SymbolCluster, SymbolOccurrence
from storysphere.pipelines.symbol_discovery.pipeline import SymbolDiscoveryPipeline, SymbolDiscoveryResult


def _make_doc(book_id: str = "book-1") -> Document:
    paras = [
        Paragraph(id="p1", text="She looked into the mirror.", chapter_number=1, position=0),
        Paragraph(id="p2", text="The door creaked open.", chapter_number=1, position=1),
    ]
    return Document(
        id=book_id,
        title="Test Novel",
        file_path="/tmp/novel.pdf",
        file_type=FileType.PDF,
        chapters=[Chapter(number=1, title="Ch1", paragraphs=paras)],
        language="en",
    )


def _make_entity(book_id: str, term: str = "mirror") -> ImageryEntity:
    return ImageryEntity(
        book_id=book_id,
        term=term,
        imagery_type=ImageryType.OBJECT,
        frequency=2,
        chapter_distribution={1: 2},
    )


class TestSymbolDiscoveryPipelineRun:
    async def test_successful_run_returns_counts(self, tmp_path):
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(return_value=[
            {
                "term": "mirror",
                "imagery_type": "object",
                "context_sentence": "She looked into the mirror.",
                "chapter_number": 1,
                "paragraph_id": "p1",
                "position": 0,
                "co_occurring_terms": [],
            }
        ])
        mock_extractor.cluster_synonyms = AsyncMock(return_value=[
            SymbolCluster(
                canonical_term="mirror",
                variants=[],
                semantic_similarity_scores={},
                book_id="",
            )
        ])
        mock_extractor.build_imagery_entities = AsyncMock(return_value=(
            [_make_entity(doc.id)],
            [SymbolOccurrence(
                imagery_id="img-1",
                book_id=doc.id,
                paragraph_id="p1",
                chapter_number=1,
                position=0,
            )],
        ))

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor,
            symbol_service=svc,
        )
        result = await pipeline.run(doc)

        assert result.book_id == doc.id
        assert result.imagery_count == 1
        assert result.occurrence_count == 1
        assert result.errors == []

    async def test_re_ingest_clears_old_data(self, tmp_path):
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()

        # Pre-seed old data
        old_entity = _make_entity(doc.id, term="old-term")
        await svc.save_imagery(old_entity)
        assert len(await svc.get_imagery_list(doc.id)) == 1

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(return_value=[])
        mock_extractor.cluster_synonyms = AsyncMock(return_value=[])
        mock_extractor.build_imagery_entities = AsyncMock(return_value=([], []))

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor,
            symbol_service=svc,
        )
        await pipeline.run(doc)

        # Old data must be gone
        assert await svc.get_imagery_list(doc.id) == []

    async def test_extraction_failure_returns_error(self, tmp_path):
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(
            side_effect=RuntimeError("LLM timeout")
        )

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor,
            symbol_service=svc,
        )
        result = await pipeline.run(doc)

        assert result.imagery_count == 0
        assert len(result.errors) == 1
        assert "LLM timeout" in result.errors[0]

    async def test_empty_extraction_returns_zero_counts(self, tmp_path):
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(return_value=[])
        mock_extractor.cluster_synonyms = AsyncMock(return_value=[])
        mock_extractor.build_imagery_entities = AsyncMock(return_value=([], []))

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor,
            symbol_service=svc,
        )
        result = await pipeline.run(doc)

        assert isinstance(result, SymbolDiscoveryResult)
        assert result.imagery_count == 0
        assert result.occurrence_count == 0
        assert result.errors == []

    async def test_persisted_entities_retrievable(self, tmp_path):
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()
        entity = _make_entity(doc.id)

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(return_value=[
            {
                "term": "mirror",
                "imagery_type": "object",
                "context_sentence": "ctx",
                "chapter_number": 1,
                "paragraph_id": "p1",
                "position": 0,
                "co_occurring_terms": [],
            }
        ])
        mock_extractor.cluster_synonyms = AsyncMock(return_value=[
            SymbolCluster(
                canonical_term="mirror", variants=[], semantic_similarity_scores={}, book_id=""
            )
        ])
        mock_extractor.build_imagery_entities = AsyncMock(return_value=(
            [entity],
            [],
        ))

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor,
            symbol_service=svc,
        )
        await pipeline.run(doc)

        entities = await svc.get_imagery_list(doc.id)
        assert len(entities) == 1
        assert entities[0].term == "mirror"


def _chapter(texts: list[str], number: int = 1) -> Chapter:
    return Chapter(
        number=number,
        title=f"Ch{number}",
        paragraphs=[
            Paragraph(id=f"p{i}", text=t, chapter_number=number, position=i)
            for i, t in enumerate(texts)
        ],
    )


class TestOccurrenceAnchoringToday:
    """B-079 characterization — what the anchoring helpers do *right now*.

    These pin the parts that must survive the fix (chapter fidelity, paragraph
    ordering) and record the part that is the bug, so the change shows up as an
    explicit flip rather than a silent one.
    """

    def test_exact_context_match_finds_its_paragraph(self):
        ch = _chapter(["She looked into the mirror.", "The door creaked open."])

        assert SymbolDiscoveryPipeline._find_paragraph_id(ch, "The door creaked") == "p1"
        assert SymbolDiscoveryPipeline._find_position(ch, "The door creaked") == 1

    def test_empty_chapter_yields_empty_id(self):
        ch = Chapter(number=1, title="Ch1", paragraphs=[])

        assert SymbolDiscoveryPipeline._find_paragraph_id(ch, "anything") == ""
        assert SymbolDiscoveryPipeline._find_position(ch, "anything") == 0

    def test_unmatched_context_silently_falls_back_to_first_paragraph(self):
        """**This is B-079.**

        ``context_sentence`` is LLM-generated and under no obligation to quote
        the text. When the substring match fails the helpers hand back a
        perfectly legal-looking paragraph that has nothing to do with the term —
        19.7% of stored occurrences got their paragraph this way.
        """
        ch = _chapter(["She looked into the mirror.", "The door creaked open."])

        # A paraphrase of paragraph 1 — the model's words, not the book's.
        paraphrase = "A door opened with a creak."

        assert SymbolDiscoveryPipeline._find_paragraph_id(ch, paraphrase) == "p0"
        assert SymbolDiscoveryPipeline._find_position(ch, paraphrase) == 0
