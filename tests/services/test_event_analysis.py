"""Unit tests for event analysis pipeline in AnalysisService."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.analysis_models import (
    CausalityAnalysis,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventImportance,
    ImpactAnalysis,
    ParticipantRole,
    ParticipantRoleType,
)
from services.analysis_service import AnalysisService


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_event(
    event_id: str = "evt-1",
    title: str = "The Great Battle",
    chapter: int = 5,
    participants: list[str] | None = None,
    consequences: list[str] | None = None,
):
    from domain.events import Event, EventType

    return Event(
        id=event_id,
        title=title,
        event_type=EventType.BATTLE,
        description="A fierce battle broke out.",
        chapter=chapter,
        participants=participants or [],
        consequences=consequences or ["Many were wounded"],
        significance="A turning point",
    )


def _make_entity(entity_id: str = "ent-1", name: str = "Alice"):
    from domain.entities import Entity, EntityType

    return Entity(id=entity_id, name=name, entity_type=EntityType.CHARACTER)


def _make_eep_llm_response():
    return {
        "state_before": "The kingdom was at peace.",
        "state_after": "The kingdom fell into chaos.",
        "causal_factors": ["Ancient rivalry", "Betrayal by the king"],
        "participant_roles": [
            {
                "entity_name": "Alice",
                "role": "initiator",
                "impact_description": "Led the charge",
            }
        ],
        "structural_role": "Turning Point",
        "event_importance": "kernel",
        "thematic_significance": "Symbolizes the collapse of order.",
    }


# ── Test 1: _extract_eep — fields populated correctly ─────────────────────────


class TestExtractEEP:
    @pytest.mark.asyncio
    async def test_eep_fields_populated(self):
        eep_data = _make_eep_llm_response()
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=json.dumps(eep_data))
        )

        kg = AsyncMock()
        entity = _make_entity("ent-1", "Alice")
        prior_event = _make_event("evt-0", "The Incident", chapter=3, participants=["ent-1"])
        kg.get_entity = AsyncMock(return_value=entity)
        kg.get_entity_timeline = AsyncMock(return_value=[prior_event, _make_event(chapter=5)])
        kg.get_event = AsyncMock(return_value=prior_event)

        svc = AnalysisService(llm=llm, kg_service=kg)
        event = _make_event(participants=["ent-1"])
        eep = await svc._extract_eep(event, "doc-1")

        assert isinstance(eep, EventEvidenceProfile)
        assert eep.state_before == "The kingdom was at peace."
        assert eep.state_after == "The kingdom fell into chaos."
        assert eep.structural_role == "Turning Point"
        assert eep.event_importance == EventImportance.KERNEL
        assert len(eep.causal_factors) == 2
        assert len(eep.participant_roles) == 1
        assert eep.participant_roles[0].role == ParticipantRoleType.INITIATOR
        assert len(eep.prior_event_ids) == 1

    @pytest.mark.asyncio
    async def test_eep_empty_participants(self):
        """Gracefully handles event with no participants."""
        eep_data = _make_eep_llm_response()
        eep_data["participant_roles"] = []
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps(eep_data)))

        svc = AnalysisService(llm=llm)
        event = _make_event(participants=[])
        eep = await svc._extract_eep(event, "doc-1")

        assert isinstance(eep, EventEvidenceProfile)
        assert eep.participant_roles == []
        assert eep.prior_event_ids == []
        assert eep.subsequent_event_ids == []


# ── Test 3: _analyze_causality ─────────────────────────────────────────────────


class TestAnalyzeCausality:
    @pytest.mark.asyncio
    async def test_causality_fields(self):
        causality_data = {
            "root_cause": "Ancient blood feud",
            "causal_chain": ["Feud began", "Tensions rose", "War declared"],
            "trigger_event_ids": ["evt-0"],
            "chain_summary": "The battle was inevitable given the feud.",
        }
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=json.dumps(causality_data))
        )

        kg = AsyncMock()
        kg.get_event = AsyncMock(return_value=_make_event("evt-0", "The Feud", chapter=2))

        svc = AnalysisService(llm=llm, kg_service=kg)
        eep = EventEvidenceProfile(
            state_before="Peace",
            state_after="War",
            causal_factors=["Feud", "Betrayal"],
            prior_event_ids=["evt-0"],
        )
        event = _make_event()
        result = await svc._analyze_causality(eep, event)

        assert isinstance(result, CausalityAnalysis)
        assert result.root_cause == "Ancient blood feud"
        assert len(result.causal_chain) == 3
        assert "evt-0" in result.trigger_event_ids
        assert "inevitable" in result.chain_summary

    @pytest.mark.asyncio
    async def test_causality_empty_prior_events(self):
        causality_data = {
            "root_cause": "Unknown",
            "causal_chain": ["Event occurred"],
            "trigger_event_ids": [],
            "chain_summary": "No prior context.",
        }
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps(causality_data)))

        svc = AnalysisService(llm=llm)
        eep = EventEvidenceProfile(state_before="", state_after="", prior_event_ids=[])
        result = await svc._analyze_causality(eep, _make_event())

        assert isinstance(result, CausalityAnalysis)
        assert result.trigger_event_ids == []


# ── Test 4: _analyze_impact ────────────────────────────────────────────────────


class TestAnalyzeImpact:
    @pytest.mark.asyncio
    async def test_impact_fields(self):
        impact_data = {
            "affected_participant_ids": ["ent-1"],
            "participant_impacts": ["Alice lost her homeland"],
            "relation_changes": ["Alice and Bob became enemies"],
            "subsequent_event_ids": ["evt-2"],
            "impact_summary": "The battle reshaped alliances.",
        }
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps(impact_data)))

        kg = AsyncMock()
        kg.get_event = AsyncMock(return_value=_make_event("evt-2", "The Aftermath", chapter=7))

        svc = AnalysisService(llm=llm, kg_service=kg)
        eep = EventEvidenceProfile(
            state_before="",
            state_after="",
            subsequent_event_ids=["evt-2"],
            participant_roles=[
                ParticipantRole(
                    entity_id="ent-1",
                    entity_name="Alice",
                    role=ParticipantRoleType.INITIATOR,
                    impact_description="Led the charge",
                )
            ],
        )
        result = await svc._analyze_impact(eep, _make_event())

        assert isinstance(result, ImpactAnalysis)
        assert "ent-1" in result.affected_participant_ids
        assert len(result.participant_impacts) == 1
        assert len(result.relation_changes) == 1
        assert result.impact_summary == "The battle reshaped alliances."


# ── Test 5: _compute_event_coverage — pure function ───────────────────────────


class TestComputeEventCoverage:
    def test_full_coverage_no_gaps(self):
        eep = EventEvidenceProfile(
            state_before="before",
            state_after="after",
            prior_event_ids=["e0"],
            subsequent_event_ids=["e2"],
            text_evidence=["passage 1"],
            participant_roles=[
                ParticipantRole(
                    entity_id="ent-1",
                    entity_name="Alice",
                    role=ParticipantRoleType.ACTOR,
                    impact_description="Active",
                )
            ],
        )
        cov = AnalysisService._compute_event_coverage(eep)
        assert isinstance(cov, EventCoverageMetrics)
        assert cov.gaps == []
        assert cov.evidence_chunk_count == 1
        assert cov.participant_count == 1
        assert cov.causal_event_count == 1
        assert cov.subsequent_event_count == 1

    def test_empty_eep_has_gaps(self):
        eep = EventEvidenceProfile(state_before="", state_after="")
        cov = AnalysisService._compute_event_coverage(eep)
        assert len(cov.gaps) == 4
        assert cov.evidence_chunk_count == 0
        assert cov.participant_count == 0


# ── Test 6: analyze_event() full pipeline ─────────────────────────────────────


class TestAnalyzeEventFull:
    @pytest.mark.asyncio
    async def test_full_pipeline_sets_analyzed_at(self):
        call_count = 0

        async def mock_ainvoke(messages):
            nonlocal call_count
            call_count += 1
            responses = [
                # EEP
                json.dumps(_make_eep_llm_response()),
                # Causality
                json.dumps({
                    "root_cause": "Old feud",
                    "causal_chain": ["Step 1", "Step 2"],
                    "trigger_event_ids": [],
                    "chain_summary": "The feud escalated.",
                }),
                # Impact
                json.dumps({
                    "affected_participant_ids": ["ent-1"],
                    "participant_impacts": ["Alice was wounded"],
                    "relation_changes": [],
                    "subsequent_event_ids": [],
                    "impact_summary": "Alice recovered slowly.",
                }),
                # Summary
                json.dumps({"summary": "The Great Battle changed everything."}),
            ]
            idx = min(call_count - 1, len(responses) - 1)
            return MagicMock(content=responses[idx])

        llm = AsyncMock()
        llm.ainvoke = mock_ainvoke

        kg = AsyncMock()
        event = _make_event(participants=[])
        kg.get_event = AsyncMock(return_value=event)
        kg.get_entity_timeline = AsyncMock(return_value=[])

        svc = AnalysisService(llm=llm, kg_service=kg)
        result = await svc.analyze_event("evt-1", "doc-1")

        assert isinstance(result, EventAnalysisResult)
        assert result.event_id == "evt-1"
        assert result.document_id == "doc-1"
        assert result.title == event.title
        assert result.analyzed_at is not None
        assert "changed everything" in result.summary.summary
