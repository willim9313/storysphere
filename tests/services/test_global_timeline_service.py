"""Unit tests for GlobalTimelineService (pure DAG algorithm, no LLM)."""

from __future__ import annotations

import pytest

from domain.events import Event, EventType, NarrativeMode
from domain.temporal import TemporalRelation, TemporalRelationType
from services.global_timeline_service import GlobalTimelineService


def _event(eid: str, chapter: int = 1, narrative_position: int | None = None) -> Event:
    return Event(
        id=eid,
        title=f"Event {eid}",
        event_type=EventType.PLOT,
        description="",
        chapter=chapter,
        narrative_position=narrative_position,
    )


def _rel(
    src: str,
    tgt: str,
    rtype: TemporalRelationType = TemporalRelationType.BEFORE,
    confidence: float = 0.9,
) -> TemporalRelation:
    return TemporalRelation(
        document_id="doc-1",
        source_event_id=src,
        target_event_id=tgt,
        relation_type=rtype,
        confidence=confidence,
    )


@pytest.fixture
def svc() -> GlobalTimelineService:
    return GlobalTimelineService()


# ── Linear chain ────────────────────────────────────────────────────────────


class TestLinearChain:
    def test_abc_produces_ascending_ranks(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B"), _event("C")]}
        rels = [_rel("A", "B"), _rel("B", "C")]
        ranks = svc.build_and_rank(rels, events)
        assert ranks["A"] < ranks["B"] < ranks["C"]
        assert ranks["A"] == pytest.approx(0.0)
        assert ranks["C"] == pytest.approx(1.0)

    def test_causes_treated_as_before(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B")]}
        rels = [_rel("A", "B", TemporalRelationType.CAUSES)]
        ranks = svc.build_and_rank(rels, events)
        assert ranks["A"] < ranks["B"]

    def test_during_treated_as_before(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B")]}
        rels = [_rel("A", "B", TemporalRelationType.DURING)]
        ranks = svc.build_and_rank(rels, events)
        assert ranks["A"] < ranks["B"]


# ── Simultaneous ────────────────────────────────────────────────────────────


class TestSimultaneous:
    def test_simultaneous_events_share_rank(self, svc: GlobalTimelineService):
        events = {
            e.id: e for e in [_event("A"), _event("B"), _event("C")]
        }
        rels = [
            _rel("A", "B"),
            _rel("A", "C"),
            _rel("B", "C", TemporalRelationType.SIMULTANEOUS),
        ]
        ranks = svc.build_and_rank(rels, events)
        assert ranks["B"] == ranks["C"]
        assert ranks["A"] < ranks["B"]


# ── Cycle resolution ───────────────────────────────────────────────────────


class TestCycleResolution:
    def test_cycle_resolved_by_removing_weakest_edge(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B"), _event("C")]}
        rels = [
            _rel("A", "B", confidence=0.9),
            _rel("B", "C", confidence=0.8),
            _rel("C", "A", confidence=0.3),  # weakest — should be removed
        ]
        ranks = svc.build_and_rank(rels, events)
        # After removing C→A, order should be A→B→C
        assert ranks["A"] < ranks["B"] < ranks["C"]

    def test_resolve_cycles_returns_count(self, svc: GlobalTimelineService):
        import networkx as nx

        G = nx.DiGraph()
        G.add_edge("A", "B", confidence=0.9)
        G.add_edge("B", "A", confidence=0.3)
        _, removed = svc.resolve_cycles(G)
        assert removed == 1
        assert nx.is_directed_acyclic_graph(G)


# ── Edge cases ──────────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_empty_input(self, svc: GlobalTimelineService):
        ranks = svc.build_and_rank([], {})
        assert ranks == {}

    def test_single_event_no_relations(self, svc: GlobalTimelineService):
        events = {"A": _event("A")}
        ranks = svc.build_and_rank([], events)
        # No relations → no nodes in DAG → empty ranks
        assert ranks == {}

    def test_unknown_relations_skipped(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B")]}
        rels = [_rel("A", "B", TemporalRelationType.UNKNOWN)]
        ranks = svc.build_and_rank(rels, events)
        assert ranks == {}

    def test_two_events_single_edge(self, svc: GlobalTimelineService):
        events = {e.id: e for e in [_event("A"), _event("B")]}
        rels = [_rel("A", "B")]
        ranks = svc.build_and_rank(rels, events)
        assert ranks["A"] == pytest.approx(0.0)
        assert ranks["B"] == pytest.approx(1.0)


# ── Disconnected components ─────────────────────────────────────────────────


class TestDisconnectedComponents:
    def test_independent_chains_both_normalised(self, svc: GlobalTimelineService):
        events = {
            e.id: e
            for e in [_event("A"), _event("B"), _event("X"), _event("Y")]
        }
        rels = [_rel("A", "B"), _rel("X", "Y")]
        ranks = svc.build_and_rank(rels, events)
        # Both chains are present; normalisation covers the whole range
        assert len(ranks) == 4
        assert min(ranks.values()) == pytest.approx(0.0)
        assert max(ranks.values()) == pytest.approx(1.0)


# ── Tiebreaker ──────────────────────────────────────────────────────────────


class TestTiebreaker:
    def test_narrative_position_used_within_same_layer(
        self, svc: GlobalTimelineService
    ):
        # A→B and A→C (B and C are in the same topological layer)
        # B has narrative_position=10, C has narrative_position=5
        events = {
            e.id: e
            for e in [
                _event("A", chapter=1, narrative_position=1),
                _event("B", chapter=2, narrative_position=10),
                _event("C", chapter=2, narrative_position=5),
            ]
        }
        rels = [_rel("A", "B"), _rel("A", "C")]
        ranks = svc.build_and_rank(rels, events)
        # C (position 5) should rank before B (position 10) within the same layer
        assert ranks["C"] < ranks["B"]

    def test_chapter_fallback_when_no_narrative_position(
        self, svc: GlobalTimelineService
    ):
        events = {
            e.id: e
            for e in [
                _event("A", chapter=1),
                _event("B", chapter=3),
                _event("C", chapter=2),
            ]
        }
        rels = [_rel("A", "B"), _rel("A", "C")]
        ranks = svc.build_and_rank(rels, events)
        # C (chapter 2) should rank before B (chapter 3)
        assert ranks["C"] < ranks["B"]


# ── AFTER normalisation ─────────────────────────────────────────────────────


class TestAfterNormalisation:
    def test_after_relation_normalised_to_before(self):
        rel = TemporalRelation(
            document_id="doc-1",
            source_event_id="B",
            target_event_id="A",
            relation_type=TemporalRelationType.AFTER,
            confidence=0.8,
        )
        # After normalisation: A→B (BEFORE)
        assert rel.relation_type == TemporalRelationType.BEFORE
        assert rel.source_event_id == "A"
        assert rel.target_event_id == "B"
