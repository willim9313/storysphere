import asyncio
import sys
from unittest.mock import AsyncMock

sys.path.insert(0, "src")
from storysphere.services.analysis_models import (  # noqa: E402
    ArchetypeResult,
    ArcSegment,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)


def _cep():
    return CEPResult(actions=["a"], traits=["t"], relations=[])


def _service():
    from storysphere.services.analysis_service import AnalysisService
    svc = AnalysisService.__new__(AnalysisService)
    svc._kg_service = None
    svc._extract_cep = AsyncMock(return_value=_cep())
    svc._compute_coverage = lambda cep: CoverageMetrics()
    return svc


class TestCharacterPartialFailure:
    def test_archetype_failure_marks_failed_parts_keeps_others(self):
        svc = _service()
        svc._classify_archetype = AsyncMock(side_effect=RuntimeError("429"))
        svc._generate_character_arc = AsyncMock(return_value=[ArcSegment(
            chapter_range="1-2", phase="Setup", description="d")])
        svc._generate_profile = AsyncMock(return_value=CharacterProfile(summary="s"))

        result = asyncio.run(svc.analyze_character(
            entity_name="Bob", document_id="doc1",
            archetype_frameworks=["jung"], language="en"))

        assert result.failed_parts == ["archetype:jung"]
        assert result.profile.summary == "s"
        assert result.archetypes == []

    def test_retry_parts_reuses_cep_and_succeeded(self):
        svc = _service()
        base = CharacterAnalysisResult(
            entity_id="Bob", entity_name="Bob", document_id="doc1",
            profile=CharacterProfile(summary="kept"), cep=_cep(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=["archetype:jung"])
        svc._classify_archetype = AsyncMock(return_value=ArchetypeResult(
            framework="jung", primary="hero", confidence=0.8))
        svc._generate_profile = AsyncMock()
        svc._generate_character_arc = AsyncMock()

        result = asyncio.run(svc.analyze_character(
            entity_name="Bob", document_id="doc1",
            archetype_frameworks=["jung"], language="en",
            retry_parts=["archetype:jung"], base_result=base))

        svc._extract_cep.assert_not_called()
        svc._generate_profile.assert_not_called()
        assert result.failed_parts == []
        assert result.archetypes[0].primary == "hero"
        assert result.profile.summary == "kept"


class TestAgentPartial:
    def test_agent_retry_loads_cache_and_recaches(self):
        from storysphere.agents.analysis_agent import AnalysisAgent
        agent = AnalysisAgent.__new__(AnalysisAgent)
        cached = {
            "entity_id": "Bob", "entity_name": "Bob", "document_id": "doc1",
            "profile": {"summary": "kept"},
            "cep": {"actions": [], "traits": [], "relations": []},
            "archetypes": [], "arc": [], "coverage": {}, "failed_parts": ["arc"],
        }
        agent._cache = AsyncMock()
        agent._cache.get = AsyncMock(return_value=cached)
        agent._service = AsyncMock()
        agent._service.analyze_character = AsyncMock(return_value=CharacterAnalysisResult(
            entity_id="Bob", entity_name="Bob", document_id="doc1",
            profile=CharacterProfile(summary="kept"), cep=_cep(),
            archetypes=[], arc=[ArcSegment(chapter_range="1", phase="p", description="d")],
            coverage=CoverageMetrics(), failed_parts=[]))

        result = asyncio.run(agent.analyze_character(
            entity_name="Bob", document_id="doc1", retry_parts=["arc"]))

        agent._cache.set.assert_awaited_once()
        assert result.failed_parts == []


class TestEventPartialFailure:
    def _svc(self):
        from storysphere.services.analysis_service import AnalysisService
        from storysphere.services.analysis_models import (
            CausalityAnalysis, EventCoverageMetrics, EventEvidenceProfile, EventSummary)
        svc = AnalysisService.__new__(AnalysisService)
        ev = type("E", (), {"title": "T"})()
        svc._kg_service = AsyncMock()
        svc._kg_service.get_event = AsyncMock(return_value=ev)
        svc._extract_eep = AsyncMock(return_value=EventEvidenceProfile(
            state_before="", state_after=""))
        svc._analyze_causality = AsyncMock(return_value=CausalityAnalysis(root_cause="rc"))
        svc._analyze_impact = AsyncMock(return_value=type("I", (), {})())
        svc._generate_event_summary = AsyncMock(return_value=EventSummary(summary="s"))
        svc._compute_event_coverage = lambda eep: EventCoverageMetrics()
        return svc

    def test_impact_failure_marks_failed_parts(self):
        svc = self._svc()
        svc._analyze_impact = AsyncMock(side_effect=RuntimeError("429"))
        result = asyncio.run(svc.analyze_event(
            event_id="e1", document_id="doc1", language="en"))
        assert result.failed_parts == ["impact"]
        assert result.causality.root_cause == "rc"

    def test_event_retry_reuses_eep(self):
        from storysphere.services.analysis_models import (
            CausalityAnalysis, EventAnalysisResult, EventCoverageMetrics,
            EventEvidenceProfile, EventSummary, ImpactAnalysis)
        svc = self._svc()
        base = EventAnalysisResult(
            event_id="e1", title="T", document_id="doc1",
            eep=EventEvidenceProfile(state_before="B", state_after="A"),
            causality=CausalityAnalysis(root_cause="rc"), impact=ImpactAnalysis(),
            summary=EventSummary(summary="s"), coverage=EventCoverageMetrics(),
            failed_parts=["impact"], analyzed_at=__import__("datetime").datetime.now())
        svc._analyze_impact = AsyncMock(return_value=ImpactAnalysis(impact_summary="done"))

        result = asyncio.run(svc.analyze_event(
            event_id="e1", document_id="doc1", language="en",
            retry_parts=["impact"], base_result=base))

        svc._extract_eep.assert_not_called()
        svc._analyze_causality.assert_not_called()
        assert result.failed_parts == []
        assert result.impact.impact_summary == "done"
        assert result.eep.state_before == "B"
