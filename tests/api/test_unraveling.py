"""API tests for GET /books/{book_id}/unraveling."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from domain.documents import Chapter, Document, FileType, Paragraph
from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.imagery import ImageryEntity, ImageryType

sys.path.insert(0, "src")


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_paragraph(pid: str, chapter: int = 1, pos: int = 0) -> Paragraph:
    return Paragraph(id=pid, text="Some text.", chapter_number=chapter, position=pos)


def _make_chapter(number: int, *, summary: str | None = "A summary.", keywords: dict | None = None) -> Chapter:
    return Chapter(
        number=number,
        title=f"Chapter {number}",
        summary=summary,
        keywords=keywords,
        paragraphs=[_make_paragraph(f"p{number}-1", chapter=number)],
    )


def _make_doc(chapters: list[Chapter] | None = None) -> Document:
    if chapters is None:
        chapters = [_make_chapter(1), _make_chapter(2)]
    return Document(
        id="book-1",
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
        summary="A summary.",
    )


def _make_entity(name: str, eid: str, etype: EntityType = EntityType.CHARACTER, extraction_method: str = "ner") -> Entity:
    return Entity(id=eid, name=name, entity_type=etype, extraction_method=extraction_method)


def _make_event(eid: str, chapter: int = 1, *, chronological_rank: int | None = None, narrative_weight: str = "unclassified") -> Event:
    return Event(
        id=eid,
        title=f"Event {eid}",
        event_type=EventType.PLOT,
        description="Something happened.",
        chapter=chapter,
        participants=[],
        chronological_rank=chronological_rank,
        narrative_weight=narrative_weight,
    )


def _make_imagery(iid: str = "img-1", frequency: int = 3) -> ImageryEntity:
    return ImageryEntity(
        id=iid,
        book_id="book-1",
        term="mirror",
        imagery_type=ImageryType.OBJECT,
        frequency=frequency,
    )


def _make_mocks(
    doc: Document | None = None,
    entities: list[Entity] | None = None,
    events: list[Event] | None = None,
    temporal_rels: list | None = None,
    imagery: list | None = None,
    cep_count: int = 0,
    eep_count: int = 0,
    teu_count_per_event: int = 0,
    narrative_present: bool = False,
    hero_journey_present: bool = False,
    tension_lines_present: bool = False,
    tension_theme_present: bool = False,
    temporal_analysis_present: bool = False,
):
    doc = doc or _make_doc()
    entities = entities if entities is not None else [
        _make_entity("Alice", "ent-alice"),
        _make_entity("Bob", "ent-bob"),
    ]
    events = events if events is not None else [_make_event("evt-1")]
    temporal_rels = temporal_rels or []
    imagery = imagery if imagery is not None else []

    mock_doc_svc = AsyncMock()
    mock_doc_svc.get_document = AsyncMock(side_effect=lambda bid: doc if bid == "book-1" else None)

    mock_kg = MagicMock()
    mock_kg.list_entities = AsyncMock(return_value=entities)
    mock_kg.get_events = AsyncMock(return_value=events)
    mock_kg.get_temporal_relations = AsyncMock(return_value=temporal_rels)
    mock_kg.relation_count = 5

    mock_symbol_svc = AsyncMock()
    mock_symbol_svc.get_imagery_list = AsyncMock(return_value=imagery)

    # Cache: count_keys returns counts, get returns None unless flagged
    def _count_keys(pattern: str) -> int:
        if pattern.startswith("character:"):
            return cep_count
        if pattern.startswith("event:"):
            return eep_count
        if pattern.startswith("teu:"):
            return teu_count_per_event
        return 0

    def _cache_get(key: str):
        flags = {
            "narrative_structure:book-1": narrative_present,
            "hero_journey:book-1": hero_journey_present,
            "tension_lines:book-1": tension_lines_present,
            "tension_theme:book-1": tension_theme_present,
            "temporal_analysis:book-1": temporal_analysis_present,
        }
        return {} if flags.get(key) else None

    mock_cache = AsyncMock()
    mock_cache.count_keys = AsyncMock(side_effect=_count_keys)
    mock_cache.get = AsyncMock(side_effect=_cache_get)

    return mock_doc_svc, mock_kg, mock_cache, mock_symbol_svc


@pytest.fixture
def client_factory():
    """Return a factory that builds a TestClient with custom mocks."""
    @contextmanager
    def _make(mock_doc_svc, mock_kg, mock_cache, mock_symbol_svc):
        from api import deps
        from api.main import create_app

        app = create_app()

        @asynccontextmanager
        async def _noop_lifespan(app):
            yield

        app.router.lifespan_context = _noop_lifespan
        app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc_svc
        app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
        app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
        app.dependency_overrides[deps.get_symbol_service] = lambda: mock_symbol_svc

        with TestClient(app, raise_server_exceptions=True) as c:
            yield c

        app.dependency_overrides.clear()

    return _make


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestUnravelingManifestStructure:
    """Verify node IDs, edges, and parentId for compound KG group."""

    def test_returns_200_with_expected_node_ids(self, client_factory):
        mocks = _make_mocks()
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")
        assert resp.status_code == 200

        data = resp.json()
        node_ids = {n["nodeId"] for n in data["nodes"]}

        expected = {
            "book_meta", "chapters", "paragraphs",
            "summaries", "keywords", "symbols",
            "kg_entity", "kg_concept", "kg_relation", "kg_event", "kg_temporal_relation",
            "cep", "eep", "teu", "sep",
            "character_analysis_result", "causality_analysis", "impact_analysis",
            "tension_lines", "narrative_structure", "hero_journey_stage", "temporal_analysis",
            "tension_theme", "chronological_rank",
        }
        assert expected == node_ids

    def test_kg_children_have_parent_id(self, client_factory):
        mocks = _make_mocks()
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes_by_id = {n["nodeId"]: n for n in resp.json()["nodes"]}
        for child_id in ("kg_entity", "kg_concept", "kg_relation", "kg_event", "kg_temporal_relation"):
            assert nodes_by_id[child_id]["parentId"] == "kg_features", f"{child_id} should have parentId=kg_features"

    def test_non_kg_nodes_have_no_parent_id(self, client_factory):
        mocks = _make_mocks()
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes_by_id = {n["nodeId"]: n for n in resp.json()["nodes"]}
        for nid in ("cep", "eep", "teu", "summaries", "tension_theme"):
            assert nodes_by_id[nid].get("parentId") is None, f"{nid} should not have parentId"

    def test_key_edges_present(self, client_factory):
        mocks = _make_mocks()
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        edges = {(e["source"], e["target"]) for e in resp.json()["edges"]}
        required = [
            ("paragraphs", "keywords"),
            ("kg_entity", "cep"),
            ("keywords", "cep"),
            ("kg_event", "eep"),
            ("kg_concept", "teu"),
            ("summaries", "teu"),
            ("cep", "character_analysis_result"),
            ("eep", "causality_analysis"),
            ("eep", "impact_analysis"),
            ("eep", "kg_temporal_relation"),
            ("kg_temporal_relation", "chronological_rank"),
            ("teu", "tension_lines"),
            ("tension_lines", "tension_theme"),
            ("summaries", "hero_journey_stage"),
        ]
        for src, tgt in required:
            assert (src, tgt) in edges, f"Missing edge: {src} → {tgt}"

    def test_404_for_missing_book(self, client_factory):
        mocks = _make_mocks()
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/no-such-book/unraveling")
        assert resp.status_code == 404


class TestNodeStatus:
    """Verify status logic for key nodes."""

    def test_summaries_complete_when_all_chapters_have_summary(self, client_factory):
        doc = _make_doc([_make_chapter(1, summary="S1"), _make_chapter(2, summary="S2")])
        mocks = _make_mocks(doc=doc)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["summaries"]["status"] == "complete"

    def test_summaries_partial_when_some_chapters_missing(self, client_factory):
        doc = _make_doc([_make_chapter(1, summary="S1"), _make_chapter(2, summary=None)])
        mocks = _make_mocks(doc=doc)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["summaries"]["status"] == "partial"

    def test_keywords_complete_when_all_chapters_have_keywords(self, client_factory):
        doc = _make_doc([
            _make_chapter(1, keywords={"hero": 0.9}),
            _make_chapter(2, keywords={"storm": 0.8}),
        ])
        mocks = _make_mocks(doc=doc)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["keywords"]["status"] == "complete"

    def test_keywords_empty_when_no_keywords(self, client_factory):
        doc = _make_doc([_make_chapter(1, keywords=None), _make_chapter(2, keywords=None)])
        mocks = _make_mocks(doc=doc)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["keywords"]["status"] == "empty"

    def test_cep_complete_when_all_characters_analyzed(self, client_factory):
        entities = [_make_entity("Alice", "e1"), _make_entity("Bob", "e2")]
        mocks = _make_mocks(entities=entities, cep_count=2)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["cep"]["status"] == "complete"
        assert nodes["character_analysis_result"]["status"] == "complete"

    def test_cep_partial_when_some_analyzed(self, client_factory):
        entities = [_make_entity("Alice", "e1"), _make_entity("Bob", "e2")]
        mocks = _make_mocks(entities=entities, cep_count=1)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["cep"]["status"] == "partial"

    def test_eep_drives_causality_and_impact_status(self, client_factory):
        events = [_make_event("e1"), _make_event("e2")]
        mocks = _make_mocks(events=events, eep_count=2)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["eep"]["status"] == "complete"
        assert nodes["causality_analysis"]["status"] == "complete"
        assert nodes["impact_analysis"]["status"] == "complete"

    def test_concept_counts_split_by_extraction_method(self, client_factory):
        entities = [
            _make_entity("Power", "c1", EntityType.CONCEPT, extraction_method="ner"),
            _make_entity("Freedom", "c2", EntityType.CONCEPT, extraction_method="inferred"),
            _make_entity("Alice", "e1", EntityType.CHARACTER),
        ]
        mocks = _make_mocks(entities=entities)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        concept_node = nodes["kg_concept"]
        assert concept_node["counts"]["ner"] == 1
        assert concept_node["counts"]["inferred"] == 1
        # Concept entities should NOT appear in kg_entity counts
        assert nodes["kg_entity"]["counts"]["concept"] == 0 if "concept" in nodes["kg_entity"]["counts"] else True

    def test_chronological_rank_complete_when_all_events_ranked(self, client_factory):
        events = [
            _make_event("e1", chronological_rank=1),
            _make_event("e2", chronological_rank=2),
        ]
        temporal_rels = [MagicMock(), MagicMock()]
        mocks = _make_mocks(events=events, temporal_rels=temporal_rels)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["chronological_rank"]["status"] == "complete"
        assert nodes["chronological_rank"]["counts"]["events_ranked"] == 2

    def test_hero_journey_independent_from_narrative_structure(self, client_factory):
        mocks = _make_mocks(narrative_present=True, hero_journey_present=False)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["narrative_structure"]["status"] == "complete"
        assert nodes["hero_journey_stage"]["status"] == "empty"

    def test_tension_chain_statuses(self, client_factory):
        mocks = _make_mocks(tension_lines_present=True, tension_theme_present=True)
        with client_factory(*mocks) as client:
            resp = client.get("/api/v1/books/book-1/unraveling")

        nodes = {n["nodeId"]: n for n in resp.json()["nodes"]}
        assert nodes["tension_lines"]["status"] == "complete"
        assert nodes["tension_theme"]["status"] == "complete"
