"""Unit tests for ParagraphEntityLinker."""

from __future__ import annotations

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph, ParagraphEntity
from domain.entities import Entity, EntityType
from pipelines.knowledge_graph.paragraph_entity_linker import ParagraphEntityLinker


def _make_entity(
    name: str,
    entity_type: EntityType = EntityType.CHARACTER,
    aliases: list[str] | None = None,
    entity_id: str | None = None,
) -> Entity:
    return Entity(
        id=entity_id or f"ent-{name.lower().replace(' ', '-')}",
        name=name,
        entity_type=entity_type,
        aliases=aliases or [],
    )


def _make_doc(paragraphs_text: list[str]) -> Document:
    paragraphs = [
        Paragraph(text=t, chapter_number=1, position=i)
        for i, t in enumerate(paragraphs_text)
    ]
    return Document(
        title="Test",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[Chapter(number=1, paragraphs=paragraphs)],
    )


class TestParagraphEntityLinker:
    def test_basic_english_match(self):
        doc = _make_doc(["Alice went to the market."])
        entities = [_make_entity("Alice")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 1
        assert para.entities[0].entity_name == "Alice"
        assert para.entities[0].start == 0
        assert para.entities[0].end == 5

    def test_multiple_entities(self):
        doc = _make_doc(["Alice met Bob at the park."])
        entities = [_make_entity("Alice"), _make_entity("Bob")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 2
        names = {e.entity_name for e in para.entities}
        assert names == {"Alice", "Bob"}

    def test_alias_match(self):
        doc = _make_doc(["The detective Sherlock investigated."])
        entities = [_make_entity("Sherlock Holmes", aliases=["Sherlock"])]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 1
        assert para.entities[0].entity_name == "Sherlock Holmes"  # canonical name

    def test_case_insensitive(self):
        doc = _make_doc(["alice spoke to ALICE."])
        entities = [_make_entity("Alice")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 2

    def test_cjk_match(self):
        doc = _make_doc(["林黛玉與賈寶玉在大觀園相遇。"])
        entities = [
            _make_entity("林黛玉", EntityType.CHARACTER),
            _make_entity("賈寶玉", EntityType.CHARACTER),
            _make_entity("大觀園", EntityType.LOCATION),
        ]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 3

    def test_longest_match_wins(self):
        doc = _make_doc(["New York City is big."])
        entities = [
            _make_entity("New York", EntityType.LOCATION, entity_id="ny"),
            _make_entity("New York City", EntityType.LOCATION, entity_id="nyc"),
        ]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 1
        assert para.entities[0].entity_id == "nyc"

    def test_no_entities(self):
        doc = _make_doc(["A paragraph with no known entities."])
        linker = ParagraphEntityLinker()
        linker.link(doc, [])

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is None

    def test_empty_paragraph(self):
        doc = _make_doc([""])
        entities = [_make_entity("Alice")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is None

    def test_word_boundary_english(self):
        """'Alice' should not match inside 'Malice'."""
        doc = _make_doc(["Malice was present but Alice was kind."])
        entities = [_make_entity("Alice")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 1
        assert para.entities[0].start == 23  # "Alice" in "but Alice"

    def test_entity_type_preserved(self):
        doc = _make_doc(["The castle stood tall."])
        entities = [_make_entity("castle", EntityType.LOCATION)]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert para.entities[0].entity_type == "location"

    def test_multiple_paragraphs_and_chapters(self):
        doc = Document(
            title="Test",
            file_path="/tmp/test.pdf",
            file_type=FileType.PDF,
            chapters=[
                Chapter(
                    number=1,
                    paragraphs=[
                        Paragraph(text="Alice arrived.", chapter_number=1, position=0),
                        Paragraph(text="No entities here.", chapter_number=1, position=1),
                    ],
                ),
                Chapter(
                    number=2,
                    paragraphs=[
                        Paragraph(text="Bob returned.", chapter_number=2, position=0),
                    ],
                ),
            ],
        )
        entities = [_make_entity("Alice"), _make_entity("Bob")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        assert doc.chapters[0].paragraphs[0].entities is not None
        assert len(doc.chapters[0].paragraphs[0].entities) == 1
        assert doc.chapters[0].paragraphs[1].entities is None
        assert doc.chapters[1].paragraphs[0].entities is not None
        assert len(doc.chapters[1].paragraphs[0].entities) == 1

    def test_repeated_entity_in_paragraph(self):
        doc = _make_doc(["Alice saw Alice in the mirror."])
        entities = [_make_entity("Alice")]
        linker = ParagraphEntityLinker()
        linker.link(doc, entities)

        para = doc.chapters[0].paragraphs[0]
        assert para.entities is not None
        assert len(para.entities) == 2
        assert para.entities[0].start == 0
        assert para.entities[1].start == 10
