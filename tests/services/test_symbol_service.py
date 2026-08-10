"""Tests for services.symbol_service — SQLite persistence round-trips."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from storysphere.domain.documents import ChapterRole
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence
from storysphere.services.analysis_cache import AnalysisCache
from storysphere.services.symbol_service import SymbolService


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
    def _doc_service(paragraphs_by_id: dict, chapters=None):
        """A document service returning one all-body chapter unless told otherwise.

        Chapters carry ``number`` and ``role`` because assemble_sep reads them to
        find where the body starts (B-074). Ch.1 body means nothing is excluded,
        which is what the pre-B-074 tests assume.
        """
        paragraphs = list(paragraphs_by_id.values())
        if chapters is None:
            chapters = [
                SimpleNamespace(
                    number=1, role=ChapterRole.body, paragraphs=paragraphs
                )
            ]
        doc = SimpleNamespace(chapters=chapters)
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
        # ent-alice is mentioned in p1 (which has 1 occurrence of the imagery);
        # p2 has no entities, so total count is 1.
        assert sep.co_occurring_entity_counts == {"ent-alice": 1}
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


class TestSEPFrontMatterExclusion:
    """B-074 — front matter must not reach the LLM as evidence."""

    @pytest.fixture
    def cache(self, tmp_path):
        return AnalysisCache(db_path=str(tmp_path / "analysis_cache.db"))

    @staticmethod
    def _tide_doc_service(paragraphs_by_id: dict):
        """名字的潮汐's shape: preface -1, toc 0, body 1–2, afterword 3."""
        paragraphs = list(paragraphs_by_id.values())
        chapters = [
            SimpleNamespace(number=-1, role=ChapterRole.preface, paragraphs=paragraphs),
            SimpleNamespace(number=0, role=ChapterRole.toc, paragraphs=[]),
            SimpleNamespace(number=1, role=ChapterRole.body, paragraphs=[]),
            SimpleNamespace(number=2, role=ChapterRole.body, paragraphs=[]),
            SimpleNamespace(number=3, role=ChapterRole.afterword, paragraphs=[]),
        ]
        doc = SimpleNamespace(chapters=chapters)
        svc = SimpleNamespace()
        svc.get_document = AsyncMock(return_value=doc)
        return svc

    @staticmethod
    def _kg_service():
        svc = SimpleNamespace()
        svc.get_events = AsyncMock(return_value=[])
        return svc

    async def _assemble(self, svc, cache, chapters: list[int]):
        entity = _make_entity(
            chapter_distribution=dict.fromkeys(chapters, 1),
            frequency=len(chapters),
        )
        await svc.save_imagery(entity)
        paragraphs = {}
        for i, ch in enumerate(chapters):
            pid = f"p{i}"
            await svc.save_occurrence(
                _make_occurrence(
                    entity.id, paragraph_id=pid, chapter_number=ch, position=i
                )
            )
            paragraphs[pid] = SimpleNamespace(
                id=pid, text=f"text in chapter {ch}", entities=None
            )
        return await svc.assemble_sep(
            imagery_id=entity.id,
            book_id="book-1",
            doc_service=self._tide_doc_service(paragraphs),
            kg_service=self._kg_service(),
            cache=cache,
        )

    async def test_front_matter_is_dropped_and_counted(self, svc, cache):
        sep = await self._assemble(svc, cache, [-1, 0, 1, 2])
        assert [c.chapter_number for c in sep.occurrence_contexts] == [1, 2]
        assert sep.excluded_front_matter_count == 2

    async def test_the_afterword_is_kept(self, svc, cache):
        # The line the UI's `trust` multiplier draws: a colophon's 「臨海市」 is
        # noise, an afterword sentence can be the book's clearest statement.
        sep = await self._assemble(svc, cache, [1, 3])
        assert [c.chapter_number for c in sep.occurrence_contexts] == [1, 3]
        assert sep.excluded_front_matter_count == 0

    async def test_frequency_still_counts_every_occurrence(self, svc, cache):
        # Only the evidence is filtered. frequency is what the book contains, and
        # the UI divides by it to show what share was usable.
        sep = await self._assemble(svc, cache, [-1, 0, 1, 2])
        assert sep.frequency == 4
        assert len(sep.occurrence_contexts) == 2

    async def test_a_v1_cached_sep_is_not_served(self, svc, cache):
        """The stale-cache path — otherwise the fix misses every existing book."""
        sep = await self._assemble(svc, cache, [-1, 1])
        key = f"sep:book-1:{sep.imagery_id}"
        poisoned = sep.model_copy(
            update={"assembled_by": "symbol_service_v1", "term": "STALE"}
        )
        await cache.set(key, poisoned.model_dump(mode="json"))

        again = await svc.assemble_sep(
            imagery_id=sep.imagery_id,
            book_id="book-1",
            doc_service=self._tide_doc_service({}),
            kg_service=self._kg_service(),
            cache=cache,
        )
        assert again.term != "STALE"
        assert again.assembled_by == "symbol_service_v2"

    async def test_a_document_with_no_body_chapters_excludes_nothing(
        self, svc, cache
    ):
        entity = _make_entity(chapter_distribution={-1: 1})
        await svc.save_imagery(entity)
        await svc.save_occurrence(
            _make_occurrence(entity.id, paragraph_id="p0", chapter_number=-1, position=0)
        )
        doc = SimpleNamespace(
            chapters=[SimpleNamespace(number=-1, role=ChapterRole.preface, paragraphs=[])]
        )
        doc_svc = SimpleNamespace(get_document=AsyncMock(return_value=doc))

        sep = await svc.assemble_sep(
            imagery_id=entity.id,
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=self._kg_service(),
            cache=cache,
        )
        # With no body to be "before", every occurrence is as good as it gets —
        # dropping them all would leave the LLM nothing at all.
        assert len(sep.occurrence_contexts) == 1
        assert sep.excluded_front_matter_count == 0


class TestAssembleOverview:
    """Book-wide signal assembly — the projection the symbols page ranks on."""

    @pytest.fixture
    def cache(self, tmp_path):
        return AnalysisCache(db_path=str(tmp_path / "analysis_cache.db"))

    @staticmethod
    def _doc_service(chapters: list):
        """A document whose chapters carry real ChapterRole values.

        ``body_chapter_count`` is derived the same way the domain property does,
        so the fixture cannot disagree with production about what a body chapter is.
        """
        doc = SimpleNamespace(
            chapters=chapters,
            body_chapter_count=sum(
                1 for c in chapters if c.role == ChapterRole.body
            ),
        )
        svc = SimpleNamespace()
        svc.get_document = AsyncMock(return_value=doc)
        return svc

    @staticmethod
    def _chapter(number: int, role: ChapterRole, paragraphs: list | None = None):
        return SimpleNamespace(number=number, role=role, paragraphs=paragraphs or [])

    @staticmethod
    def _kg_service(events: list, entities: list):
        svc = SimpleNamespace()
        svc.get_events = AsyncMock(return_value=events)
        svc.list_entities = AsyncMock(return_value=entities)
        return svc

    @staticmethod
    def _graph(co_pairs: list[tuple[str, int]], built: bool = True):
        graph = SimpleNamespace()
        graph._ensure_graph = lambda book_id: built
        graph.build_graph = AsyncMock()
        graph.get_co_occurrences = AsyncMock(return_value=co_pairs)
        return graph

    @staticmethod
    def _entity(entity_id: str, name: str, entity_type: EntityType) -> Entity:
        return Entity(id=entity_id, name=name, entity_type=entity_type)

    async def _setup_sea_book(self, svc):
        """A book shaped like the real fixture: front matter, body, afterword.

        「sea」 occurs twice in front matter, once in ch1, three times in ch2, once
        in the afterword — the distribution shape that broke the old charts.
        """
        sea = _make_entity(
            term="sea",
            imagery_type=ImageryType.NATURE,
            frequency=7,
            chapter_distribution={-1: 2, 1: 1, 2: 3, 3: 1},
        )
        salt = _make_entity(
            term="salt", imagery_type=ImageryType.OTHER, frequency=1,
            chapter_distribution={1: 1},
        )
        await svc.save_imagery(sea)
        await svc.save_imagery(salt)
        # Only the ch1 occurrence has a paragraph carrying entities.
        await svc.save_occurrence(
            _make_occurrence(sea.id, paragraph_id="p1", chapter_number=1, position=0)
        )
        await svc.save_occurrence(
            _make_occurrence(sea.id, paragraph_id="p2", chapter_number=2, position=0)
        )
        await svc.save_occurrence(
            _make_occurrence(salt.id, paragraph_id="p1", chapter_number=1, position=1)
        )
        return sea, salt

    def _sea_book_deps(self):
        para1 = SimpleNamespace(
            id="p1",
            text="The sea took Ines to the salt marsh.",
            entities=[
                SimpleNamespace(entity_id="ent-sea"),
                SimpleNamespace(entity_id="ent-ines"),
                SimpleNamespace(entity_id="ent-marsh"),
            ],
        )
        para2 = SimpleNamespace(id="p2", text="The sea again.", entities=None)
        # Ines is also named in a paragraph the imagery never touches, so her base
        # rate (2 of 3 body paragraphs) differs from her co-occurrence count.
        para3 = SimpleNamespace(
            id="p3",
            text="Ines walked home.",
            entities=[SimpleNamespace(entity_id="ent-ines")],
        )
        # A front-matter paragraph naming Ines must not inflate the base rate.
        para_front = SimpleNamespace(
            id="p-front",
            text="Colophon mentioning Ines.",
            entities=[SimpleNamespace(entity_id="ent-ines")],
        )
        chapters = [
            self._chapter(-1, ChapterRole.preface, [para_front]),
            self._chapter(0, ChapterRole.toc),
            self._chapter(1, ChapterRole.body, [para1, para3]),
            self._chapter(2, ChapterRole.body, [para2]),
            self._chapter(3, ChapterRole.afterword),
        ]
        doc_svc = self._doc_service(chapters)
        kg_svc = self._kg_service(
            events=[
                SimpleNamespace(id="ev-front", chapter=-1),
                SimpleNamespace(id="ev-a", chapter=1),
                SimpleNamespace(id="ev-b", chapter=1),
                SimpleNamespace(id="ev-c", chapter=2),
                SimpleNamespace(id="ev-after", chapter=3),
            ],
            entities=[
                self._entity("ent-sea", "sea", EntityType.LOCATION),
                self._entity("ent-ines", "Ines", EntityType.CHARACTER),
                self._entity("ent-marsh", "salt marsh", EntityType.LOCATION),
            ],
        )
        return doc_svc, kg_svc, self._graph([("salt", 2)])

    async def _overview(self, svc, cache, **kw):
        doc_svc, kg_svc, graph = self._sea_book_deps()
        return await svc.assemble_overview(
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            symbol_graph=graph,
            cache=cache,
            **kw,
        )

    async def test_returns_every_imagery_entity(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        assert {item.term for item in overview.items} == {"sea", "salt"}
        assert overview.book_id == "book-1"

    async def test_resolves_entity_ids_to_name_and_type(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        assert [(e.name, e.entity_type) for e in sea.co_occurring_entities] == [
            ("Ines", "character"),
            ("salt marsh", "location"),
        ]

    async def test_filters_same_named_entity_and_reports_the_count(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        assert "sea" not in [e.name for e in sea.co_occurring_entities]
        assert sea.self_match_count == 1

    async def test_self_match_count_is_none_without_a_same_named_entity(
        self, svc, cache
    ):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        salt = next(i for i in overview.items if i.term == "salt")
        assert salt.self_match_count is None

    async def test_reports_body_paragraph_count_as_the_base_rate_denominator(
        self, svc, cache
    ):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        # p1 + p3 in ch1, p2 in ch2. The front-matter paragraph does not count.
        assert overview.body_paragraph_count == 3

    async def test_entity_paragraph_count_measures_the_whole_book(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        ines = next(e for e in sea.co_occurring_entities if e.name == "Ines")
        # Ines is in 2 of 3 body paragraphs (p1, p3) — she co-occurs with the sea
        # in only one of them, so her base rate is not her co-occurrence count.
        assert ines.paragraph_count == 2
        assert ines.count == 1

    async def test_entity_paragraph_count_excludes_front_matter(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        ines = next(e for e in sea.co_occurring_entities if e.name == "Ines")
        # Ines is named in the colophon too; counting it would understate her lift.
        assert ines.paragraph_count == 2

    async def test_body_count_excludes_non_body_occurrences(self, svc, cache):
        """The lift numerator must live in the same universe as its denominator."""
        sea, _ = await self._setup_sea_book(svc)
        # An extra front-matter occurrence sharing p1, where Ines is named.
        await svc.save_occurrence(
            _make_occurrence(sea.id, paragraph_id="p1", chapter_number=-1, position=9)
        )
        overview = await self._overview(svc, cache)
        item = next(i for i in overview.items if i.term == "sea")
        ines = next(e for e in item.co_occurring_entities if e.name == "Ines")
        assert ines.count == 2  # both occurrences sit in p1
        assert ines.body_count == 1  # only the ch1 one is body text

    async def test_event_count_excludes_front_and_back_matter(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        # ch1 (2 events) + ch2 (1). The preface and afterword events are dropped
        # even though the imagery occurs in both chapters.
        assert sea.co_occurring_event_count == 3

    async def test_global_chapter_max_ignores_non_body_chapters(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        # ch2 holds 3; the preface holds 2 and must not set the scale.
        assert overview.global_chapter_max == 3

    async def test_reports_chapter_roles_and_body_count(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        assert overview.body_chapter_count == 2
        assert overview.chapter_roles == {
            -1: "preface", 0: "toc", 1: "body", 2: "body", 3: "afterword",
        }

    async def test_includes_allies_from_the_co_occurrence_graph(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        sea = next(i for i in overview.items if i.term == "sea")
        assert [(a.term, a.co_occurrence_count) for a in sea.co_occurring_imagery] == [
            ("salt", 2)
        ]

    async def test_builds_the_graph_when_it_is_missing(self, svc, cache):
        await self._setup_sea_book(svc)
        doc_svc, kg_svc, _ = self._sea_book_deps()
        graph = self._graph([], built=False)
        await svc.assemble_overview(
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            symbol_graph=graph,
            cache=cache,
        )
        graph.build_graph.assert_awaited_once()

    async def test_never_sets_interpretation(self, svc, cache):
        await self._setup_sea_book(svc)
        overview = await self._overview(svc, cache)
        assert all(item.interpretation is None for item in overview.items)

    async def test_persists_to_cache(self, svc, cache):
        await self._setup_sea_book(svc)
        await self._overview(svc, cache)
        cached = await cache.get("symbol_overview:book-1")
        assert cached is not None
        assert len(cached["items"]) == 2

    async def test_cache_hit_skips_reassembly(self, svc, cache):
        await self._setup_sea_book(svc)
        await self._overview(svc, cache)

        doc_svc, kg_svc, graph = self._sea_book_deps()
        await svc.assemble_overview(
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            symbol_graph=graph,
            cache=cache,
        )
        doc_svc.get_document.assert_not_called()
        kg_svc.list_entities.assert_not_called()

    async def test_force_bypasses_cache(self, svc, cache):
        await self._setup_sea_book(svc)
        await self._overview(svc, cache)

        doc_svc, kg_svc, graph = self._sea_book_deps()
        await svc.assemble_overview(
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            symbol_graph=graph,
            cache=cache,
            force=True,
        )
        doc_svc.get_document.assert_called_once()

    async def test_missing_book_raises(self, svc, cache):
        doc_svc = self._doc_service([])
        doc_svc.get_document = AsyncMock(return_value=None)
        kg_svc = self._kg_service([], [])
        with pytest.raises(ValueError, match="book not found"):
            await svc.assemble_overview(
                book_id="book-1",
                doc_service=doc_svc,
                kg_service=kg_svc,
                symbol_graph=self._graph([]),
                cache=cache,
            )

    async def test_empty_book_returns_no_items(self, svc, cache):
        doc_svc, kg_svc, graph = self._sea_book_deps()
        overview = await svc.assemble_overview(
            book_id="book-1",
            doc_service=doc_svc,
            kg_service=kg_svc,
            symbol_graph=graph,
            cache=cache,
        )
        assert overview.items == []
        # A book with nothing to shade still needs a usable divisor.
        assert overview.global_chapter_max == 1
