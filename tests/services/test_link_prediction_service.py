"""Tests for LinkPredictionService's rule layer.

``tests/api/test_inferred_relations.py`` exercises the endpoints with the whole
service replaced by an ``AsyncMock``, so it verifies the router's wiring and
nothing about these rules. They are pure functions over their arguments — the
cheapest thing in the untested-services plan to pin down, and the part that
decides what a reader is actually shown.
"""

from __future__ import annotations

import pytest
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.inferred_relations import InferredRelationType
from storysphere.domain.relations import RelationType
from storysphere.services.link_prediction_service import LinkPredictionService

DOC = "book-1"


@pytest.fixture
def service():
    """The rules read nothing off the instance, so the collaborators are unused."""
    return LinkPredictionService(kg_service=None, store=None)


def _entity(entity_id: str, name: str, chapter: int | None = None) -> Entity:
    return Entity(
        id=entity_id,
        name=name,
        entity_type=EntityType.CHARACTER,
        document_id=DOC,
        first_appearance_chapter=chapter,
    )


def _entity_map(*entities: Entity) -> dict[str, Entity]:
    return {e.id: e for e in entities}


def _index(*pairs: tuple[str, str, RelationType]) -> dict:
    """Build the relation index the rules read.

    Keys are endpoint pairs sorted lexically — the same normalisation the
    caller applies, so getting it wrong here would silently match nothing.
    """
    out: dict[tuple[str, str], list[RelationType]] = {}
    for left, right, rel_type in pairs:
        key = (left, right) if left <= right else (right, left)
        out.setdefault(key, []).append(rel_type)
    return out


# ── _infer_type ──────────────────────────────────────────────────────────────


class TestInferType:
    """Rule order matters: the first matching branch wins."""

    def test_enemy_of_both_reads_as_a_potential_ally(self, service):
        """The enemy of my enemy — the one rule with its own wording."""
        rel_type, reasoning = service._infer_type(
            "a", "b", ["x"],
            _index(("a", "x", RelationType.ENEMY), ("b", "x", RelationType.ENEMY)),
            _entity_map(_entity("x", "Villain")),
        )

        assert rel_type is InferredRelationType.POTENTIAL_ALLY
        assert "敵人的敵人" in reasoning
        assert "Villain" in reasoning

    @pytest.mark.parametrize(
        "friendly",
        [
            RelationType.FAMILY,
            RelationType.FRIENDSHIP,
            RelationType.ALLY,
            RelationType.ROMANCE,
        ],
    )
    def test_friendly_with_both_reads_as_potential_friendship(self, service, friendly):
        """All four friendly types must count, not just FRIENDSHIP."""
        rel_type, _ = service._infer_type(
            "a", "b", ["x"],
            _index(("a", "x", friendly), ("b", "x", friendly)),
            _entity_map(_entity("x", "Mutual")),
        )

        assert rel_type is InferredRelationType.POTENTIAL_FRIENDSHIP

    def test_enemy_with_only_one_side_reads_as_potential_enemy(self, service):
        rel_type, _ = service._infer_type(
            "a", "b", ["x"],
            _index(("a", "x", RelationType.ENEMY)),
            _entity_map(_entity("x", "Foe")),
        )

        assert rel_type is InferredRelationType.POTENTIAL_ENEMY

    def test_neutral_shared_neighbour_reads_as_associate(self, service):
        rel_type, _ = service._infer_type(
            "a", "b", ["x"],
            _index(("a", "x", RelationType.OTHER), ("b", "x", RelationType.OTHER)),
            _entity_map(_entity("x", "Bystander")),
        )

        assert rel_type is InferredRelationType.POTENTIAL_ASSOCIATE

    def test_no_common_neighbours_is_unknown(self, service):
        rel_type, reasoning = service._infer_type("a", "b", [], {}, {})

        assert rel_type is InferredRelationType.UNKNOWN
        assert "（不明）" in reasoning

    def test_ally_wins_over_friendship_when_both_would_match(self, service):
        """Mixed evidence: mutual enemy *and* mutual friend on the same pair."""
        rel_type, _ = service._infer_type(
            "a", "b", ["x", "y"],
            _index(
                ("a", "x", RelationType.ENEMY), ("b", "x", RelationType.ENEMY),
                ("a", "y", RelationType.ALLY), ("b", "y", RelationType.ALLY),
            ),
            _entity_map(_entity("x", "Foe"), _entity("y", "Friend")),
        )

        assert rel_type is InferredRelationType.POTENTIAL_ALLY


class TestInferTypeReasoning:
    """The reasoning string is user-facing — it lands in the UI verbatim."""

    def test_names_the_shared_neighbours(self, service):
        _, reasoning = service._infer_type(
            "a", "b", ["x", "y"], {},
            _entity_map(_entity("x", "Alice"), _entity("y", "Bob")),
        )

        assert "Alice" in reasoning
        assert "Bob" in reasoning
        assert "、" in reasoning

    def test_caps_the_list_at_five_names(self, service):
        ids = [f"n{i}" for i in range(8)]
        entities = _entity_map(*(_entity(i, f"Name{i}") for i in ids))

        _, reasoning = service._infer_type("a", "b", ids, {}, entities)

        assert reasoning.count("、") == 4, "more than five names listed"

    def test_neighbours_missing_from_the_map_are_skipped(self, service):
        """A dangling id must not put a blank into the sentence."""
        _, reasoning = service._infer_type(
            "a", "b", ["known", "ghost"], {},
            _entity_map(_entity("known", "Alice")),
        )

        assert "Alice" in reasoning
        assert "、" not in reasoning


# ── _visible_from_chapter ────────────────────────────────────────────────────


class TestVisibleFromChapter:
    """A pair is only visible once *both* endpoints have appeared."""

    def test_returns_the_later_of_the_two_first_appearances(self, service):
        result = service._visible_from_chapter(
            "a", "b", _entity_map(_entity("a", "Alice", 2), _entity("b", "Bob", 7))
        )

        assert result == 7

    def test_order_does_not_matter(self, service):
        entities = _entity_map(_entity("a", "Alice", 7), _entity("b", "Bob", 2))

        assert service._visible_from_chapter("a", "b", entities) == 7

    def test_none_when_one_endpoint_has_no_chapter(self, service):
        result = service._visible_from_chapter(
            "a", "b", _entity_map(_entity("a", "Alice", 2), _entity("b", "Bob", None))
        )

        assert result is None

    def test_none_when_an_endpoint_is_missing_entirely(self, service):
        result = service._visible_from_chapter(
            "a", "b", _entity_map(_entity("a", "Alice", 2))
        )

        assert result is None

    def test_none_for_an_empty_map(self, service):
        assert service._visible_from_chapter("a", "b", {}) is None

    def test_chapter_zero_counts_as_known(self, service):
        """0 is a real chapter index here, not "unset" — don't let it fall to None."""
        result = service._visible_from_chapter(
            "a", "b", _entity_map(_entity("a", "Alice", 0), _entity("b", "Bob", 0))
        )

        assert result == 0
