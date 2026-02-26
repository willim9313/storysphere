"""Unit tests for the knowledge graph pipeline components."""

from __future__ import annotations

import pytest

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from domain.relations import Relation, RelationType
from pipelines.knowledge_graph.entity_linker import EntityLinker


# ── EntityLinker tests ───────────────────────────────────────────────────────


class TestEntityLinker:
    def test_empty_input(self):
        linker = EntityLinker()
        assert linker.link([]) == []

    def test_no_duplicates_unchanged(self):
        entities = [
            Entity(name="Alice", entity_type=EntityType.CHARACTER, mention_count=5),
            Entity(name="Bob", entity_type=EntityType.CHARACTER, mention_count=3),
        ]
        linker = EntityLinker()
        result = linker.link(entities)
        assert len(result) == 2

    def test_exact_name_duplicates_merged(self):
        e1 = Entity(name="Alice", entity_type=EntityType.CHARACTER, mention_count=5)
        e2 = Entity(name="Alice", entity_type=EntityType.CHARACTER, mention_count=3)
        linker = EntityLinker()
        result = linker.link([e1, e2])
        assert len(result) == 1
        # mention counts summed
        assert result[0].mention_count == 8

    def test_alias_match_merges_entities(self):
        """Entity whose alias matches another entity's name should be merged."""
        e1 = Entity(
            name="Lord Voldemort",
            entity_type=EntityType.CHARACTER,
            aliases=["Tom Riddle"],
            mention_count=10,
        )
        e2 = Entity(name="Tom Riddle", entity_type=EntityType.CHARACTER, mention_count=3)
        linker = EntityLinker()
        result = linker.link([e1, e2])
        assert len(result) == 1
        assert result[0].mention_count == 13

    def test_canonical_entity_is_highest_mention_count(self):
        e1 = Entity(name="Harry", entity_type=EntityType.CHARACTER, mention_count=100)
        e2 = Entity(name="Harry", entity_type=EntityType.CHARACTER, mention_count=5)
        linker = EntityLinker()
        result = linker.link([e1, e2])
        assert result[0].id == e1.id  # e1 has more mentions, should win

    def test_earliest_chapter_is_preserved(self):
        e1 = Entity(
            name="Alice",
            entity_type=EntityType.CHARACTER,
            mention_count=5,
            first_appearance_chapter=3,
        )
        e2 = Entity(
            name="Alice",
            entity_type=EntityType.CHARACTER,
            mention_count=2,
            first_appearance_chapter=1,
        )
        linker = EntityLinker()
        result = linker.link([e1, e2])
        assert result[0].first_appearance_chapter == 1

    def test_attributes_merged(self):
        e1 = Entity(
            name="Alice",
            entity_type=EntityType.CHARACTER,
            mention_count=5,
            attributes={"role": "hero"},
        )
        e2 = Entity(
            name="Alice",
            entity_type=EntityType.CHARACTER,
            mention_count=1,
            attributes={"gender": "female"},
        )
        linker = EntityLinker()
        result = linker.link([e1, e2])
        assert "role" in result[0].attributes
        assert "gender" in result[0].attributes


# ── LLM extractor stubs (unit tests without real API calls) ─────────────────


class TestEntityExtractorParsing:
    """Test the JSON parsing logic without making real LLM calls."""

    def test_parse_valid_json(self):
        from pipelines.knowledge_graph.entity_extractor import _parse_json_response

        json_str = '{"entities": [{"name": "Alice", "entity_type": "character"}]}'
        result = _parse_json_response(json_str)
        assert len(result.entities) == 1
        assert result.entities[0].name == "Alice"

    def test_parse_markdown_fenced_json(self):
        from pipelines.knowledge_graph.entity_extractor import _parse_json_response

        fenced = '```json\n{"entities": [{"name": "Bob", "entity_type": "character"}]}\n```'
        result = _parse_json_response(fenced)
        assert result.entities[0].name == "Bob"

    def test_empty_entities_list(self):
        from pipelines.knowledge_graph.entity_extractor import _parse_json_response

        result = _parse_json_response('{"entities": []}')
        assert result.entities == []


class TestRelationExtractorParsing:
    def test_parse_valid_extraction_result(self):
        from pipelines.knowledge_graph.relation_extractor import _parse_extraction_response

        json_str = """{
            "relations": [
                {"source_name": "Alice", "target_name": "Bob", "relation_type": "friendship"}
            ],
            "events": [
                {"title": "First Meeting", "event_type": "meeting", "description": "They met."}
            ]
        }"""
        result = _parse_extraction_response(json_str)
        assert len(result.relations) == 1
        assert result.relations[0].source_name == "Alice"
        assert len(result.events) == 1
        assert result.events[0].title == "First Meeting"

    def test_empty_result(self):
        from pipelines.knowledge_graph.relation_extractor import _parse_extraction_response

        result = _parse_extraction_response('{"relations": [], "events": []}')
        assert result.relations == []
        assert result.events == []
