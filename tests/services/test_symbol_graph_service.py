"""Tests for SymbolGraphService — the imagery co-occurrence graph.

``tests/api/test_symbols.py`` reaches this service only through a ``MagicMock``
whose ``get_co_occurrences`` is stubbed, so nothing has ever exercised the
graph construction itself. What it produces feeds the symbols page's
co-occurrence panel directly.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence
from storysphere.services.symbol_graph_service import SymbolGraphService

BOOK = "book-1"


def _imagery(imagery_id: str, term: str, frequency: int = 3) -> ImageryEntity:
    return ImageryEntity(
        id=imagery_id,
        book_id=BOOK,
        term=term,
        imagery_type=ImageryType.OBJECT,
        frequency=frequency,
    )


def _occurrence(imagery_id: str, paragraph_id: str, occ_id: str) -> SymbolOccurrence:
    return SymbolOccurrence(
        id=occ_id,
        imagery_id=imagery_id,
        book_id=BOOK,
        paragraph_id=paragraph_id,
        chapter_number=1,
        position=0,
        context_window="…",
    )


def _symbol_service(entities, occurrences):
    svc = AsyncMock()
    svc.get_imagery_list = AsyncMock(return_value=entities)
    svc.get_occurrences_by_book = AsyncMock(return_value=occurrences)
    return svc


@pytest.fixture
def service():
    return SymbolGraphService()


# ── build_graph ──────────────────────────────────────────────────────────────


class TestBuildGraph:
    async def test_one_node_per_imagery_term(self, service):
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]

        g = await service.build_graph(BOOK, _symbol_service(entities, []))

        assert set(g.nodes) == {"mirror", "door"}

    async def test_node_carries_its_imagery_metadata(self, service):
        entities = [_imagery("i1", "mirror", frequency=9)]

        g = await service.build_graph(BOOK, _symbol_service(entities, []))

        node = g.nodes["mirror"]
        assert node["imagery_id"] == "i1"
        assert node["frequency"] == 9
        assert node["imagery_type"] == ImageryType.OBJECT.value

    async def test_terms_in_the_same_paragraph_are_linked_both_ways(self, service):
        """Co-occurrence has no direction; the graph stores it as a symmetric pair."""
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]
        occurrences = [
            _occurrence("i1", "p1", "o1"),
            _occurrence("i2", "p1", "o2"),
        ]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert g["mirror"]["door"]["weight"] == 1
        assert g["door"]["mirror"]["weight"] == 1

    async def test_terms_in_different_paragraphs_are_not_linked(self, service):
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]
        occurrences = [
            _occurrence("i1", "p1", "o1"),
            _occurrence("i2", "p2", "o2"),
        ]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert not g.has_edge("mirror", "door")

    async def test_weight_counts_paragraphs_not_occurrences(self, service):
        """Two paragraphs sharing the pair → weight 2."""
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]
        occurrences = [
            _occurrence("i1", "p1", "o1"), _occurrence("i2", "p1", "o2"),
            _occurrence("i1", "p2", "o3"), _occurrence("i2", "p2", "o4"),
        ]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert g["mirror"]["door"]["weight"] == 2

    async def test_a_term_repeated_in_one_paragraph_counts_once(self, service):
        """Three mentions of "mirror" in p1 is still one paragraph of evidence."""
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]
        occurrences = [
            _occurrence("i1", "p1", "o1"),
            _occurrence("i1", "p1", "o2"),
            _occurrence("i1", "p1", "o3"),
            _occurrence("i2", "p1", "o4"),
        ]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert g["mirror"]["door"]["weight"] == 1

    async def test_a_term_alone_in_a_paragraph_gets_no_edge(self, service):
        entities = [_imagery("i1", "mirror")]
        occurrences = [_occurrence("i1", "p1", "o1")]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert g.number_of_edges() == 0

    async def test_occurrence_for_an_unknown_imagery_id_is_ignored(self, service):
        """A dangling occurrence must not invent a node or crash the build."""
        entities = [_imagery("i1", "mirror")]
        occurrences = [
            _occurrence("i1", "p1", "o1"),
            _occurrence("ghost", "p1", "o2"),
        ]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert set(g.nodes) == {"mirror"}
        assert g.number_of_edges() == 0

    async def test_three_terms_in_one_paragraph_link_pairwise(self, service):
        entities = [_imagery(f"i{i}", t) for i, t in enumerate(["mirror", "door", "sea"])]
        occurrences = [_occurrence(f"i{i}", "p1", f"o{i}") for i in range(3)]

        g = await service.build_graph(BOOK, _symbol_service(entities, occurrences))

        assert g.number_of_edges() == 6, "3 pairs, both directions"

    async def test_rebuilding_replaces_rather_than_accumulates(self, service):
        entities = [_imagery("i1", "mirror"), _imagery("i2", "door")]
        occurrences = [_occurrence("i1", "p1", "o1"), _occurrence("i2", "p1", "o2")]
        svc = _symbol_service(entities, occurrences)

        await service.build_graph(BOOK, svc)
        g = await service.build_graph(BOOK, svc)

        assert g["mirror"]["door"]["weight"] == 1, "weights carried over from the first build"

    async def test_empty_book_produces_an_empty_graph(self, service):
        g = await service.build_graph(BOOK, _symbol_service([], []))

        assert g.number_of_nodes() == 0


# ── get_co_occurrences ───────────────────────────────────────────────────────


class TestGetCoOccurrences:
    async def _built(self, service) -> None:
        entities = [_imagery(f"i{i}", t) for i, t in enumerate(["mirror", "door", "sea"])]
        occurrences = [
            # mirror+door share two paragraphs, mirror+sea only one
            _occurrence("i0", "p1", "o1"), _occurrence("i1", "p1", "o2"),
            _occurrence("i0", "p2", "o3"), _occurrence("i1", "p2", "o4"),
            _occurrence("i0", "p3", "o5"), _occurrence("i2", "p3", "o6"),
        ]
        await service.build_graph(BOOK, _symbol_service(entities, occurrences))

    async def test_unbuilt_book_raises_keyerror(self, service):
        with pytest.raises(KeyError):
            await service.get_co_occurrences(BOOK, "mirror")

    async def test_unknown_term_returns_empty_not_an_error(self, service):
        await self._built(service)

        assert await service.get_co_occurrences(BOOK, "no-such-term") == []

    async def test_sorted_by_weight_descending(self, service):
        await self._built(service)

        result = await service.get_co_occurrences(BOOK, "mirror")

        assert result == [("door", 2), ("sea", 1)]

    async def test_top_k_truncates_the_weakest(self, service):
        await self._built(service)

        result = await service.get_co_occurrences(BOOK, "mirror", top_k=1)

        assert result == [("door", 2)]

    async def test_graphs_are_kept_per_book(self, service):
        await self._built(service)

        with pytest.raises(KeyError):
            await service.get_co_occurrences("other-book", "mirror")
