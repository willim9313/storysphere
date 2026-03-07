"""Unit tests for AnalyzeEventTool."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from services.analysis_models import (
    CausalityAnalysis,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventImportance,
    EventSummary,
    ImpactAnalysis,
    ParticipantRole,
    ParticipantRoleType,
)
from tools.analysis_tools import AnalyzeEventTool
from tools.schemas import EventAnalysisOutput


def _make_event_result() -> EventAnalysisResult:
    return EventAnalysisResult(
        event_id="evt-1",
        title="The Great Battle",
        document_id="doc-1",
        eep=EventEvidenceProfile(
            state_before="Peace reigned.",
            state_after="War erupted.",
            structural_role="Turning Point",
            event_importance=EventImportance.KERNEL,
            thematic_significance="Marks the collapse of order.",
            causal_factors=["Old feud"],
            participant_roles=[
                ParticipantRole(
                    entity_id="ent-1",
                    entity_name="Alice",
                    role=ParticipantRoleType.INITIATOR,
                    impact_description="Led the charge.",
                )
            ],
            text_evidence=["Passage 1"],
            prior_event_ids=["evt-0"],
            subsequent_event_ids=["evt-2"],
        ),
        causality=CausalityAnalysis(
            root_cause="Ancient blood feud",
            causal_chain=["Feud began", "Alliance collapsed"],
            trigger_event_ids=["evt-0"],
            chain_summary="The battle was inevitable.",
        ),
        impact=ImpactAnalysis(
            affected_participant_ids=["ent-1"],
            participant_impacts=["Alice was wounded"],
            relation_changes=["Alice and Bob became enemies"],
            subsequent_event_ids=["evt-2"],
            impact_summary="The aftermath reshaped alliances.",
        ),
        summary=EventSummary(summary="The Great Battle changed everything forever."),
        coverage=EventCoverageMetrics(
            evidence_chunk_count=1,
            participant_count=1,
            causal_event_count=1,
            subsequent_event_count=1,
            gaps=[],
        ),
        analyzed_at=datetime.now(timezone.utc),
    )


def _make_mock_agent() -> AsyncMock:
    agent = AsyncMock()
    agent.analyze_event = AsyncMock(return_value=_make_event_result())
    return agent


# ── Test 10: analysis_agent=None returns error ────────────────────────────────


class TestAnalyzeEventToolNoAgent:
    @pytest.mark.asyncio
    async def test_no_agent_returns_error(self):
        tool = AnalyzeEventTool(analysis_agent=None)
        raw = await tool._arun("evt-1")
        result = json.loads(raw)
        assert "error" in result
        assert "analysis_agent" in result["error"]


# ── Test 11: delegates to analysis_agent.analyze_event() ─────────────────────


class TestAnalyzeEventToolDelegation:
    @pytest.mark.asyncio
    async def test_delegates_to_agent(self):
        agent = _make_mock_agent()
        tool = AnalyzeEventTool(analysis_agent=agent)
        await tool._arun("evt-1", document_id="doc-1")

        agent.analyze_event.assert_awaited_once_with("evt-1", "doc-1")

    @pytest.mark.asyncio
    async def test_has_description_and_schema(self):
        tool = AnalyzeEventTool()
        assert "event analysis" in tool.description.lower()
        assert tool.args_schema is not None


# ── Test 12: output JSON matches EventAnalysisOutput schema ──────────────────


class TestAnalyzeEventToolOutput:
    @pytest.mark.asyncio
    async def test_output_matches_schema(self):
        agent = _make_mock_agent()
        tool = AnalyzeEventTool(analysis_agent=agent)
        raw = await tool._arun("evt-1", document_id="doc-1")

        parsed = json.loads(raw)
        output = EventAnalysisOutput(**parsed)

        assert output.event_id == "evt-1"
        assert output.title == "The Great Battle"
        assert output.document_id == "doc-1"
        assert output.state_before == "Peace reigned."
        assert output.state_after == "War erupted."
        assert output.structural_role == "Turning Point"
        assert output.event_importance == "kernel"
        assert output.root_cause == "Ancient blood feud"
        assert output.causal_chain == ["Feud began", "Alliance collapsed"]
        assert output.chain_summary == "The battle was inevitable."
        assert output.impact_summary == "The aftermath reshaped alliances."
        assert len(output.relation_changes) == 1
        assert len(output.participant_roles) == 1
        assert output.participant_roles[0]["role"] == "initiator"
        assert output.thematic_significance == "Marks the collapse of order."
        assert "changed everything" in output.summary
        assert output.coverage_gaps == []
        assert output.analyzed_at != ""
