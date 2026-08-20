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


class TestFindAnchor:
    """B-079 — the term anchors the occurrence, not the LLM's sentence."""

    @staticmethod
    def _anchor(ch, term, aliases=(), ctx=""):
        return SymbolDiscoveryPipeline._find_anchor(ch, term, list(aliases), ctx)

    def test_single_paragraph_with_the_term_wins(self):
        ch = _chapter(["She looked into the mirror.", "The door creaked open."])

        assert self._anchor(ch, "door") == ("p1", 1)

    def test_paraphrased_context_no_longer_lands_on_the_first_paragraph(self):
        """The flip. Previously this returned ``("p0", 0)`` — a paragraph with
        no bearing on the term — because the substring match failed and the
        helper fell back to the chapter's opener."""
        ch = _chapter(["She looked into the mirror.", "The door creaked open."])

        # The model's words, not the book's.
        assert self._anchor(ch, "door", ctx="A door opened with a creak.") == ("p1", 1)

    def test_alias_rescues_a_term_that_is_absent_verbatim(self):
        ch = _chapter(["The looking-glass hung crooked.", "Nothing else here."])

        assert self._anchor(ch, "mirror", aliases=["looking-glass"]) == ("p0", 0)

    def test_term_beats_alias_when_both_are_present(self):
        ch = _chapter(["The looking-glass hung crooked.", "She held the mirror."])

        assert self._anchor(ch, "mirror", aliases=["looking-glass"]) == ("p1", 1)

    def test_context_sentence_breaks_a_tie(self):
        ch = _chapter(["The mirror was dusty.", "She held the mirror up."])

        assert self._anchor(ch, "mirror", ctx="She held the mirror up.") == ("p1", 1)

    def test_tie_with_unmatched_context_takes_the_earliest(self):
        ch = _chapter(["The mirror was dusty.", "She held the mirror up."])

        assert self._anchor(ch, "mirror", ctx="Somewhere a mirror gleamed.") == ("p0", 0)

    def test_term_split_by_a_pdf_space_is_still_found(self):
        """``pypdf`` breaks CJK words across lines into ``礁 石``.

        Two thirds of the paragraphs in this repo's PDF books carry at least one
        such split, so this is the ordinary case, not a curiosity — and before
        this, the one occurrence that landed on a split was written off as an
        LLM hallucination.
        """
        ch = _chapter(["她站起來，走下了礁 石。", "海退開了。"])

        assert self._anchor(ch, "礁石") == ("p0", 0)

    def test_a_split_paragraph_still_competes_with_an_unsplit_one(self):
        """Where ``pypdf`` put a space must not decide which paragraph is
        eligible — otherwise the answer depends on typesetting. Both are
        candidates and the context sentence picks."""
        ch = _chapter(["那塊礁石很滑。", "她走下了礁 石，海在退。"])

        assert self._anchor(ch, "礁石", ctx="她走下了礁石，海在退。") == ("p1", 1)
        # With no context to go on, the earliest candidate still wins.
        assert self._anchor(ch, "礁石") == ("p0", 0)

    def test_alias_split_by_a_pdf_space_is_still_found(self):
        ch = _chapter(["The looking- glass hung crooked.", "Nothing else here."])

        assert self._anchor(ch, "mirror", aliases=["looking-glass"]) == ("p0", 0)

    def test_context_tiebreaker_ignores_pdf_spacing(self):
        ch = _chapter(["礁石很滑。", "她走下了礁 石，海在退。"])

        assert self._anchor(ch, "礁石", ctx="她走下了礁石，海在退。") == ("p1", 1)

    def test_absent_term_and_aliases_yield_none(self):
        """The one case the old code could not express, and the reason a fifth
        of stored occurrences pointed at the wrong paragraph.

        Terms come out of the text, so a sound run never gets here — this is the
        guard for a model returning something it was never shown.
        """
        ch = _chapter(["She looked into the mirror.", "The door creaked open."])

        assert self._anchor(ch, "reef", aliases=["shoal"]) is None

    def test_empty_chapter_yields_none(self):
        assert self._anchor(Chapter(number=1, title="Ch1", paragraphs=[]), "x") is None


class TestAnchorExtractions:
    """Dropping is a policy decision, so it gets its own tests."""

    @staticmethod
    def _doc_with(texts: list[str]) -> Document:
        return Document(
            id="book-1", title="T", file_path="/tmp/x.pdf", file_type=FileType.PDF,
            chapters=[_chapter(texts)], language="en",
        )

    @staticmethod
    def _cluster(canonical: str, variants: list[str] | None = None) -> SymbolCluster:
        return SymbolCluster(
            canonical_term=canonical, variants=variants or [],
            semantic_similarity_scores={}, book_id="",
        )

    def _run(self, doc, extractions, clusters):
        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=AsyncMock(), symbol_service=AsyncMock()
        )
        return pipeline._anchor_extractions(doc, extractions, clusters)

    def test_anchored_extraction_gets_real_paragraph_coordinates(self):
        doc = self._doc_with(["Nothing here.", "The door creaked open."])
        out = self._run(
            doc,
            [{"term": "door", "chapter_number": 1, "context_sentence": "paraphrase"}],
            [self._cluster("door")],
        )

        assert len(out) == 1
        assert out[0]["paragraph_id"] == "p1"
        assert out[0]["position"] == 1

    def test_unanchorable_extraction_is_dropped(self):
        doc = self._doc_with(["Nothing here."])
        out = self._run(
            doc,
            [{"term": "reef", "chapter_number": 1, "context_sentence": "the reef"}],
            [self._cluster("reef")],
        )

        assert out == []

    def test_alias_from_the_cluster_is_used(self):
        """The clusters are why anchoring waits until after extraction."""
        doc = self._doc_with(["The looking-glass hung crooked."])
        out = self._run(
            doc,
            [{"term": "mirror", "chapter_number": 1, "context_sentence": ""}],
            [self._cluster("mirror", ["looking-glass"])],
        )

        assert len(out) == 1
        assert out[0]["paragraph_id"] == "p0"

    def test_extraction_naming_an_absent_chapter_is_dropped(self):
        doc = self._doc_with(["The door creaked open."])
        out = self._run(
            doc,
            [{"term": "door", "chapter_number": 99, "context_sentence": ""}],
            [self._cluster("door")],
        )

        assert out == []


class TestEvidencelessImageryIsNotPersisted:
    async def test_entity_whose_occurrences_all_dropped_is_not_saved(self, tmp_path):
        """Half the stored imagery has a single occurrence, so "all dropped" is
        the ordinary case, not a corner one."""
        from storysphere.services.symbol_service import SymbolService

        svc = SymbolService(db_path=str(tmp_path / "sym.db"))
        doc = _make_doc()

        mock_extractor = AsyncMock()
        mock_extractor.extract_chapter_imagery = AsyncMock(return_value=[
            {"term": "reef", "imagery_type": "nature",
             "context_sentence": "the reef", "chapter_number": 1},
        ])
        mock_extractor.cluster_synonyms = AsyncMock(
            return_value=[SymbolCluster(
                canonical_term="reef", variants=[],
                semantic_similarity_scores={}, book_id="",
            )]
        )
        # Real building, so frequency reflects what actually anchored. This
        # side_effect is one of the rare ones that has to be async — it awaits
        # the real method rather than standing in for it.
        from storysphere.services.imagery_extractor import ImageryExtractor

        async def _build(**kw):
            return await ImageryExtractor.build_imagery_entities(mock_extractor, **kw)

        mock_extractor.build_imagery_entities = AsyncMock(side_effect=_build)

        pipeline = SymbolDiscoveryPipeline(
            imagery_extractor=mock_extractor, symbol_service=svc
        )
        result = await pipeline.run(doc)

        # Guard against passing for the wrong reason: run() swallows exceptions
        # into errors, which would also leave the counts at zero.
        assert result.errors == []
        assert result.imagery_count == 0
        assert result.occurrence_count == 0
        assert await svc.get_imagery_list(doc.id) == []
