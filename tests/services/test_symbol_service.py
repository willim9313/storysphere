"""Tests for services.symbol_service — SQLite persistence round-trips."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence
from services.analysis_cache import AnalysisCache
from services.symbol_service import SymbolService


@pytest.fixture
def svc(tmp_path):
    return SymbolService(db_path=str(tmp_path / "symbol_test.db"))


def _make_entity(**kw) -> ImageryEntity:
    defaults = dict(
        book_id="book-1",
        term="mirror",
        imagery_type=ImageryType.OBJECT,
        aliases=["looking glass"],
        frequency=3,
        chapter_distribution={1: 2, 3: 1},
    )
    defaults.update(kw)
    return ImageryEntity(**defaults)


def _make_occurrence(imagery_id: str, **kw) -> SymbolOccurrence:
    defaults = dict(
        imagery_id=imagery_id,
        book_id="book-1",
        paragraph_id="para-1",
        chapter_number=1,
        position=0,
        context_window="She gazed into the mirror.",
        co_occurring_terms=["door"],
    )
    defaults.update(kw)
    return SymbolOccurrence(**defaults)


class TestInitDb:
    async def test_init_db_creates_tables(self, svc):
        await svc.init_db()
        # Verify by saving and retrieving
        entity = _make_entity()
        await svc.save_imagery(entity)
        result = await svc.get_imagery_list("book-1")
        assert len(result) == 1


class TestImageryEntityRoundTrip:
    async def test_save_and_get_list(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        entities = await svc.get_imagery_list("book-1")
        assert len(entities) == 1
        e = entities[0]
        assert e.term == "mirror"
        assert e.imagery_type == ImageryType.OBJECT
        assert e.aliases == ["looking glass"]
        assert e.frequency == 3
        assert e.chapter_distribution == {1: 2, 3: 1}

    async def test_get_imagery_by_id(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        fetched = await svc.get_imagery_by_id(entity.id)
        assert fetched is not None
        assert fetched.id == entity.id
        assert fetched.term == "mirror"

    async def test_get_imagery_by_id_missing(self, svc):
        result = await svc.get_imagery_by_id("nonexistent-id")
        assert result is None

    async def test_get_imagery_list_empty_book(self, svc):
        result = await svc.get_imagery_list("other-book")
        assert result == []

    async def test_save_upserts(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        entity.frequency = 10
        await svc.save_imagery(entity)
        entities = await svc.get_imagery_list("book-1")
        assert len(entities) == 1
        assert entities[0].frequency == 10

    async def test_multiple_entities_ordered_by_frequency(self, svc):
        e1 = _make_entity(term="mirror", frequency=5)
        e2 = _make_entity(term="door", imagery_type=ImageryType.SPATIAL, frequency=10)
        await svc.save_imagery(e1)
        await svc.save_imagery(e2)
        entities = await svc.get_imagery_list("book-1")
        assert entities[0].term == "door"  # higher frequency first
        assert entities[1].term == "mirror"


class TestSymbolOccurrenceRoundTrip:
    async def test_save_and_get_occurrences(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        occ = _make_occurrence(imagery_id=entity.id)
        await svc.save_occurrence(occ)
        occurrences = await svc.get_occurrences(entity.id)
        assert len(occurrences) == 1
        o = occurrences[0]
        assert o.chapter_number == 1
        assert o.context_window == "She gazed into the mirror."
        assert o.co_occurring_terms == ["door"]

    async def test_get_occurrences_by_book(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        occ1 = _make_occurrence(imagery_id=entity.id, chapter_number=1)
        occ2 = _make_occurrence(imagery_id=entity.id, chapter_number=3)
        await svc.save_occurrence(occ1)
        await svc.save_occurrence(occ2)
        occs = await svc.get_occurrences_by_book("book-1")
        assert len(occs) == 2
        assert occs[0].chapter_number == 1
        assert occs[1].chapter_number == 3

    async def test_get_occurrences_sorted(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        for ch, pos in [(2, 5), (1, 0), (1, 3)]:
            await svc.save_occurrence(_make_occurrence(entity.id, chapter_number=ch, position=pos))
        occs = await svc.get_occurrences(entity.id)
        chapters = [(o.chapter_number, o.position) for o in occs]
        assert chapters == sorted(chapters)


class TestDeleteByBook:
    async def test_delete_removes_all_records(self, svc):
        entity = _make_entity()
        await svc.save_imagery(entity)
        await svc.save_occurrence(_make_occurrence(entity.id))
        deleted = await svc.delete_by_book("book-1")
        assert deleted >= 2
        assert await svc.get_imagery_list("book-1") == []
        assert await svc.get_occurrences_by_book("book-1") == []

    async def test_delete_other_book_unaffected(self, svc):
        e1 = _make_entity(book_id="book-1")
        e2 = _make_entity(book_id="book-2", term="fire")
        await svc.save_imagery(e1)
        await svc.save_imagery(e2)
        await svc.delete_by_book("book-1")
        assert await svc.get_imagery_list("book-1") == []
        assert len(await svc.get_imagery_list("book-2")) == 1


class TestAssembleSEP:
    @pytest.fixture
    def cache(self, tmp_path):
        return AnalysisCache(db_path=str(tmp_path / "analysis_cache.db"))

    @staticmethod
    def _doc_service(paragraphs_by_id: dict):
        paragraphs = list(paragraphs_by_id.values())
        chapter = SimpleNamespace(paragraphs=paragraphs)
        doc = SimpleNamespace(chapters=[chapter])
        svc = SimpleNamespace()
        svc.get_document = AsyncMock(return_value=doc)
        return svc

    @staticmethod
    def _kg_service(events: list):
        svc = SimpleNamespace()
        svc.get_events = AsyncMock(return_value=events)
        return svc

    async def test_assembles_sep_and_persists_to_cache(self, svc, cache):
        entity = _make_entity(chapter_distribution={1: 2, 3: 1, 5: 3})
        await svc.save_imagery(entity)
        await svc.save_occurrence(
            _make_occurrence(entity.id, paragraph_id="p1", chapter_number=1, position=0)
        )
        await svc.save_occurrence(
            _make_occurrence(entity.id, paragraph_id="p2", chapter_number=3, position=2)
        )

        para1 = SimpleNamespace(
            id="p1",
            text="She gazed into the mirror and saw Alice.",
            entities=[SimpleNamespace(entity_id="ent-alice")],
        )
        para2 = SimpleNamespace(
            id="p2",
            text="The mirror shattered.",
            entities=None,
        )
        doc_svc = self._doc_service({"p1": para1, "p2": para2})
        kg_svc = self._kg_service([
            SimpleNamespace(id="ev-1", chapter=1),
            SimpleNamespace(id="ev-2", chapter=2),  # not in imagery chapters
            SimpleNamespace(id="ev-3", chapter=3),
        ])

        sep = await svc.assemble_sep(
            imagery_id=entity.id,
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            cache=cache,
        )

        assert sep.imagery_id == entity.id
        assert sep.term == "mirror"
        assert sep.frequency == 3
        assert len(sep.occurrence_contexts) == 2
        assert sep.occurrence_contexts[0].paragraph_text.startswith("She gazed")
        assert sep.co_occurring_entity_ids == ["ent-alice"]
        assert sep.co_occurring_event_ids == ["ev-1", "ev-3"]
        assert sep.chapter_distribution == {1: 2, 3: 1, 5: 3}
        assert sep.peak_chapters == [5, 1, 3]  # sorted by count desc

        cached = await cache.get(f"sep:book-1:{entity.id}")
        assert cached is not None
        assert cached["imagery_id"] == entity.id

    async def test_cache_hit_skips_reassembly(self, svc, cache):
        entity = _make_entity()
        await svc.save_imagery(entity)
        doc_svc = self._doc_service({})
        kg_svc = self._kg_service([])

        await svc.assemble_sep(
            imagery_id=entity.id,
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            cache=cache,
        )
        doc_svc.get_document.reset_mock()
        kg_svc.get_events.reset_mock()

        await svc.assemble_sep(
            imagery_id=entity.id,
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            cache=cache,
        )
        doc_svc.get_document.assert_not_called()
        kg_svc.get_events.assert_not_called()

    async def test_missing_imagery_raises(self, svc, cache):
        doc_svc = self._doc_service({})
        kg_svc = self._kg_service([])
        with pytest.raises(ValueError, match="imagery not found"):
            await svc.assemble_sep(
                imagery_id="missing",
                book_id="book-1",
                doc_service=doc_svc,
                kg_service=kg_svc,
                cache=cache,
            )

    async def test_book_id_mismatch_raises(self, svc, cache):
        entity = _make_entity(book_id="book-1")
        await svc.save_imagery(entity)
        doc_svc = self._doc_service({})
        kg_svc = self._kg_service([])
        with pytest.raises(ValueError, match="belongs to book"):
            await svc.assemble_sep(
                imagery_id=entity.id,
                book_id="book-2",
                doc_service=doc_svc,
                kg_service=kg_svc,
                cache=cache,
            )

    async def test_get_sep_returns_none_when_missing(self, svc, cache):
        result = await svc.get_sep("any", "book-1", cache)
        assert result is None
