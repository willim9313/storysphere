"""Tests for reader-related endpoints and helper functions.

Coverage:
  - _build_entity_segments()     — regex-based entity tagging (old data path)
  - _build_segments_from_stored() — offset-based tagging (new data path)
  - GET /books/:bookId/chapters   — list chapters (stored + KG fallback paths)
  - GET /books/:bookId/chapters/:chapterId/chunks — get chunks (stored + KG paths, id/number lookup)
  - GET /books/:bookId/entities/:entityId/epistemic-state
"""

from __future__ import annotations

import sys

sys.path.insert(0, "src")

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph, ParagraphEntity
from domain.entities import Entity, EntityType
from domain.epistemic_state import CharacterEpistemicState
from domain.events import Event, EventType

# ── Fixtures ─────────────────────────────────────────────────────────────────


def _make_paragraph(pid: str, text: str, position: int = 0, entities=None) -> Paragraph:
    return Paragraph(
        id=pid,
        text=text,
        chapter_number=1,
        position=position,
        entities=entities,
    )


def _make_document(chapters: list[Chapter], doc_id: str = "book-1") -> Document:
    return Document(
        id=doc_id,
        title="Test Novel",
        file_path="/tmp/t.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


@pytest.fixture
def epistemic_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """TestClient that additionally mocks the epistemic-state service dependency."""
    from fastapi.testclient import TestClient

    from api import deps
    from api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop(app):
        yield

    app.router.lifespan_context = _noop

    mock_epistemic = AsyncMock()
    mock_epistemic.get_character_knowledge = AsyncMock(
        return_value=CharacterEpistemicState(
            character_id="ent-alice",
            character_name="Alice",
            up_to_chapter=3,
            known_events=[],
            unknown_events=[],
            misbeliefs=[],
        )
    )

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_epistemic_state_service] = lambda: mock_epistemic

    with TestClient(app, raise_server_exceptions=True) as c:
        c._mock_epistemic = mock_epistemic
        yield c

    app.dependency_overrides.clear()


# ── _build_entity_segments (regex path) ──────────────────────────────────────


class TestBuildEntitySegments:
    def _seg(self, text: str, entities: list):
        from api.routers.books import _build_entity_segments
        return _build_entity_segments(text, entities)

    def _make_entity(self, name: str, eid: str = "e1", aliases: list | None = None) -> Entity:
        return Entity(
            id=eid,
            name=name,
            entity_type=EntityType.CHARACTER,
            aliases=aliases or [],
        )

    def test_no_entities_returns_single_segment(self):
        result = self._seg("Hello world.", [])
        assert len(result) == 1
        assert result[0].text == "Hello world."
        assert result[0].entity is None

    def test_entity_match_produces_three_segments(self):
        alice = self._make_entity("Alice", "e-alice")
        result = self._seg("Hello Alice, welcome!", [alice])
        texts = [s.text for s in result]
        assert "Alice" in texts
        entity_seg = next(s for s in result if s.entity is not None)
        assert entity_seg.entity.entity_id == "e-alice"
        assert entity_seg.entity.name == "Alice"

    def test_entity_not_present_returns_single_segment(self):
        alice = self._make_entity("Alice")
        result = self._seg("No characters here.", [alice])
        assert len(result) == 1
        assert result[0].entity is None

    def test_multiple_entities_tagged(self):
        alice = self._make_entity("Alice", "e-alice")
        bob = self._make_entity("Bob", "e-bob")
        result = self._seg("Alice met Bob.", [alice, bob])
        entity_names = {s.entity.name for s in result if s.entity}
        assert "Alice" in entity_names
        assert "Bob" in entity_names

    def test_alias_match_uses_canonical_entity(self):
        alice = self._make_entity("Alice", "e-alice", aliases=["Allie"])
        result = self._seg("Allie ran away.", [alice])
        entity_segs = [s for s in result if s.entity]
        assert len(entity_segs) == 1
        assert entity_segs[0].entity.entity_id == "e-alice"

    def test_longer_match_wins_over_shorter(self):
        alice = self._make_entity("Alice Wonderland", "e-alice-full")
        alice_short = self._make_entity("Alice", "e-alice-short")
        result = self._seg("Alice Wonderland smiled.", [alice, alice_short])
        entity_segs = [s for s in result if s.entity]
        assert len(entity_segs) == 1
        assert entity_segs[0].entity.entity_id == "e-alice-full"

    def test_case_insensitive_match(self):
        alice = self._make_entity("Alice", "e-alice")
        result = self._seg("ALICE arrived.", [alice])
        entity_segs = [s for s in result if s.entity]
        assert len(entity_segs) == 1
        assert entity_segs[0].entity.entity_id == "e-alice"

    def test_no_partial_word_match(self):
        alice = self._make_entity("Ali")
        result = self._seg("Alice walked.", [alice])
        assert all(s.entity is None for s in result), "Partial word 'Ali' inside 'Alice' must not match"

    def test_empty_text_returns_single_empty_segment(self):
        alice = self._make_entity("Alice")
        result = self._seg("", [alice])
        assert len(result) == 1
        assert result[0].text == ""


# ── _build_segments_from_stored (offset path) ────────────────────────────────


class TestBuildSegmentsFromStored:
    def _seg(self, text: str, entities: list[ParagraphEntity]):
        from api.routers.books import _build_segments_from_stored
        return _build_segments_from_stored(text, entities)

    def _ent(self, eid: str, name: str, start: int, end: int, etype: str = "character") -> ParagraphEntity:
        return ParagraphEntity(
            entity_id=eid,
            entity_name=name,
            entity_type=etype,
            start=start,
            end=end,
        )

    def test_no_entities_returns_single_segment(self):
        result = self._seg("Hello world.", [])
        assert len(result) == 1
        assert result[0].text == "Hello world."
        assert result[0].entity is None

    def test_entity_at_start(self):
        # "Alice walked." — Alice is 0:5
        ent = self._ent("e1", "Alice", 0, 5)
        result = self._seg("Alice walked.", [ent])
        assert result[0].text == "Alice"
        assert result[0].entity.entity_id == "e1"
        assert result[1].text == " walked."
        assert result[1].entity is None

    def test_entity_in_middle(self):
        # "Hello Alice, goodbye" — Alice is 6:11
        ent = self._ent("e1", "Alice", 6, 11)
        result = self._seg("Hello Alice, goodbye", [ent])
        assert result[0].text == "Hello "
        assert result[1].text == "Alice"
        assert result[1].entity.entity_id == "e1"
        assert result[2].text == ", goodbye"

    def test_entity_at_end(self):
        ent = self._ent("e1", "Bob", 7, 10)
        result = self._seg("Greets Bob", [ent])
        assert result[-1].text == "Bob"
        assert result[-1].entity is not None

    def test_multiple_entities_sorted_by_offset(self):
        # "Alice and Bob" — Alice: 0:5, Bob: 10:13
        e1 = self._ent("e1", "Alice", 0, 5)
        e2 = self._ent("e2", "Bob", 10, 13)
        result = self._seg("Alice and Bob", [e2, e1])  # pass out of order
        entity_names = [s.entity.name for s in result if s.entity]
        assert entity_names == ["Alice", "Bob"]

    def test_entity_type_preserved(self):
        ent = self._ent("e1", "Camelot", 0, 7, etype="location")
        result = self._seg("Camelot shines.", [ent])
        assert result[0].entity.type == "location"


# ── GET /books/:bookId/chapters ───────────────────────────────────────────────


class TestListChapters:
    def test_returns_404_for_unknown_book(self, client):
        resp = client.get("/api/v1/books/no-such-book/chapters")
        assert resp.status_code == 404

    def test_returns_chapters_list(self, client):
        resp = client.get("/api/v1/books/doc-1/chapters")
        assert resp.status_code == 200
        chapters = resp.json()
        assert isinstance(chapters, list)
        assert len(chapters) == 2

    def test_chapter_response_fields(self, client):
        resp = client.get("/api/v1/books/doc-1/chapters")
        ch = resp.json()[0]
        for field in ("id", "bookId", "title", "order", "chunkCount", "entityCount"):
            assert field in ch, f"Missing field: {field}"

    def test_chapter_order_is_sequential(self, client):
        resp = client.get("/api/v1/books/doc-1/chapters")
        orders = [ch["order"] for ch in resp.json()]
        assert orders == sorted(orders)

    def test_chapter_title_fallback(self, client, mock_doc):
        """A chapter with title=None should fall back to 'Chapter N'."""
        doc = _make_document(
            chapters=[Chapter(number=1, title=None, paragraphs=[])],
            doc_id="book-notitle",
        )
        def _get(did):
            return doc if did == "book-notitle" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-notitle/chapters")
        assert resp.status_code == 200
        assert resp.json()[0]["title"] == "Chapter 1"

    def test_stored_entities_aggregated_per_chapter(self, client, mock_doc):
        """Chapters with stored paragraph entities return correct entityCount."""
        paras = [
            Paragraph(
                id="p1",
                text="Alice walked in.",
                chapter_number=1,
                position=0,
                entities=[
                    ParagraphEntity(entity_id="e1", entity_name="Alice", entity_type="character", start=0, end=5),
                ],
            ),
            Paragraph(
                id="p2",
                text="Alice and Bob talked.",
                chapter_number=1,
                position=1,
                entities=[
                    ParagraphEntity(entity_id="e1", entity_name="Alice", entity_type="character", start=0, end=5),
                    ParagraphEntity(entity_id="e2", entity_name="Bob", entity_type="character", start=10, end=13),
                ],
            ),
        ]
        doc = _make_document(
            chapters=[Chapter(number=1, title="Ch1", paragraphs=paras)],
            doc_id="book-stored",
        )
        def _get(did):
            return doc if did == "book-stored" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-stored/chapters")
        assert resp.status_code == 200
        # 2 unique entities: Alice and Bob
        assert resp.json()[0]["entityCount"] == 2

    def test_kg_fallback_when_no_stored_entities(self, client, mock_doc, mock_kg):
        """When paragraphs have no stored entities, falls back to KG text matching."""
        paras = [
            Paragraph(id="p1", text="Alice entered the garden.", chapter_number=1, position=0),
        ]
        doc = _make_document(
            chapters=[Chapter(number=1, title="Ch1", paragraphs=paras)],
            doc_id="book-kg-fallback",
        )
        def _get(did):
            return doc if did == "book-kg-fallback" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-kg-fallback/chapters")
        assert resp.status_code == 200
        mock_kg.list_entities.assert_called()


# ── GET /books/:bookId/chapters/:chapterId/chunks ─────────────────────────────


class TestGetChapterChunks:
    def _doc_with_chapter(self, ch_id_override: str | None = None) -> Document:
        paras = [
            _make_paragraph("p1", "First paragraph text.", 0),
            _make_paragraph("p2", "Second paragraph text.", 1),
        ]
        ch = Chapter(number=1, title="Ch1", paragraphs=paras)
        if ch_id_override:
            ch.id = ch_id_override
        return _make_document([ch], doc_id="book-chunks")

    def test_returns_404_for_unknown_book(self, client):
        resp = client.get("/api/v1/books/no-such-book/chapters/1/chunks")
        assert resp.status_code == 404

    def test_returns_404_for_unknown_chapter(self, client, mock_doc):
        doc = self._doc_with_chapter()
        def _get(did):
            return doc if did == "book-chunks" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-chunks/chapters/99/chunks")
        assert resp.status_code == 404

    def test_lookup_by_chapter_number(self, client, mock_doc):
        doc = self._doc_with_chapter()
        def _get(did):
            return doc if did == "book-chunks" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-chunks/chapters/1/chunks")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_lookup_by_chapter_id(self, client, mock_doc):
        doc = self._doc_with_chapter()
        chapter_id = doc.chapters[0].id
        def _get(did):
            return doc if did == "book-chunks" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get(f"/api/v1/books/book-chunks/chapters/{chapter_id}/chunks")
        assert resp.status_code == 200

    def test_chunk_response_fields(self, client, mock_doc):
        doc = self._doc_with_chapter()
        def _get(did):
            return doc if did == "book-chunks" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-chunks/chapters/1/chunks")
        chunk = resp.json()[0]
        for field in ("id", "chapterId", "order", "content", "keywords", "segments"):
            assert field in chunk, f"Missing field: {field}"

    def test_chunk_order_matches_paragraph_position(self, client, mock_doc):
        doc = self._doc_with_chapter()
        def _get(did):
            return doc if did == "book-chunks" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-chunks/chapters/1/chunks")
        orders = [c["order"] for c in resp.json()]
        assert orders == sorted(orders)

    def test_segments_built_from_stored_entities(self, client, mock_doc):
        """Paragraphs with stored entities produce tagged segments."""
        paras = [
            Paragraph(
                id="p1",
                text="Alice smiled.",
                chapter_number=1,
                position=0,
                entities=[
                    ParagraphEntity(entity_id="e1", entity_name="Alice", entity_type="character", start=0, end=5),
                ],
            )
        ]
        doc = _make_document([Chapter(number=1, paragraphs=paras)], doc_id="book-seg-stored")
        def _get(did):
            return doc if did == "book-seg-stored" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-seg-stored/chapters/1/chunks")
        assert resp.status_code == 200
        segments = resp.json()[0]["segments"]
        entity_segs = [s for s in segments if s.get("entity")]
        assert len(entity_segs) == 1
        assert entity_segs[0]["entity"]["entityId"] == "e1"

    def test_segments_fallback_to_kg_when_no_stored(self, client, mock_doc, mock_kg):
        """Paragraphs without stored entities fall back to KG text matching."""
        paras = [_make_paragraph("p1", "Alice walked.", 0)]
        doc = _make_document([Chapter(number=1, paragraphs=paras)], doc_id="book-seg-kg")
        def _get(did):
            return doc if did == "book-seg-kg" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-seg-kg/chapters/1/chunks")
        assert resp.status_code == 200
        mock_kg.list_entities.assert_called()

    def test_keywords_included_when_present(self, client, mock_doc):
        para = Paragraph(
            id="p1",
            text="A mysterious journey.",
            chapter_number=1,
            position=0,
            keywords={"mystery": 0.9, "journey": 0.7},
        )
        doc = _make_document([Chapter(number=1, paragraphs=[para])], doc_id="book-kw")
        def _get(did):
            return doc if did == "book-kw" else None
        mock_doc.get_document.side_effect = _get

        resp = client.get("/api/v1/books/book-kw/chapters/1/chunks")
        keywords = resp.json()[0]["keywords"]
        assert set(keywords) == {"mystery", "journey"}


# ── GET /books/:bookId/entities/:entityId/epistemic-state ─────────────────────


class TestEpistemicStateEndpoint:
    def test_returns_404_for_unknown_book(self, epistemic_client, mock_doc):
        resp = epistemic_client.get(
            "/api/v1/books/no-such-book/entities/ent-alice/epistemic-state?up_to_chapter=3"
        )
        assert resp.status_code == 404

    def test_returns_404_for_unknown_entity(self, epistemic_client, mock_kg):
        mock_kg.get_entity.return_value = None
        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/no-such-entity/epistemic-state?up_to_chapter=3"
        )
        assert resp.status_code == 404

    def test_missing_up_to_chapter_param_is_422(self, epistemic_client):
        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/ent-alice/epistemic-state"
        )
        assert resp.status_code == 422

    def test_up_to_chapter_must_be_positive(self, epistemic_client):
        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/ent-alice/epistemic-state?up_to_chapter=0"
        )
        assert resp.status_code == 422

    def test_happy_path_returns_expected_shape(self, epistemic_client):
        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/ent-alice/epistemic-state?up_to_chapter=3"
        )
        assert resp.status_code == 200
        data = resp.json()
        for field in ("characterId", "characterName", "upToChapter", "knownEvents", "unknownEvents", "misbeliefs", "dataComplete"):
            assert field in data, f"Missing field: {field}"

    def test_data_complete_false_when_all_events_public(self, epistemic_client, mock_kg):
        """data_complete is False when no event has a non-public visibility."""
        from domain.events import Event, EventType
        public_event = Event(
            title="Public Battle",
            event_type=EventType.CONFLICT,
            description="A public battle.",
            chapter=1,
            participants=["ent-alice"],
            visibility="public",
        )
        mock_kg.get_events = AsyncMock(return_value=[public_event])

        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/ent-alice/epistemic-state?up_to_chapter=3"
        )
        assert resp.status_code == 200
        assert resp.json()["dataComplete"] is False

    def test_data_complete_true_when_private_event_exists(self, epistemic_client, mock_kg):
        """data_complete is True when at least one event has non-public visibility."""
        private_event = Event(
            title="Secret Meeting",
            event_type=EventType.MEETING,
            description="A secret meeting.",
            chapter=1,
            participants=["ent-alice"],
            visibility="secret",
        )
        mock_kg.get_events = AsyncMock(return_value=[private_event])

        resp = epistemic_client.get(
            "/api/v1/books/doc-1/entities/ent-alice/epistemic-state?up_to_chapter=3"
        )
        assert resp.status_code == 200
        assert resp.json()["dataComplete"] is True
