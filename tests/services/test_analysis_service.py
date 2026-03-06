"""Unit tests for AnalysisService."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.analysis_models import (
    ArcSegment,
    ArchetypeResult,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)
from services.analysis_service import AnalysisService


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="A deep literary insight.")
    )
    return llm


@pytest.fixture
def service(mock_llm):
    return AnalysisService(llm=mock_llm)


# ── generate_insight (Phase 3 — backward compat) ──────────────────────────


class TestGenerateInsight:
    @pytest.mark.asyncio
    async def test_returns_insight_string(self, service):
        result = await service.generate_insight("Theme of betrayal", "Some context.")
        assert result == "A deep literary insight."

    @pytest.mark.asyncio
    async def test_passes_topic_and_context_to_llm(self, service, mock_llm):
        await service.generate_insight("Symbolism", "The rose represents...")

        call_args = mock_llm.ainvoke.call_args[0][0]
        human_msg = call_args[1].content
        assert "Topic: Symbolism" in human_msg
        assert "The rose represents..." in human_msg

    @pytest.mark.asyncio
    async def test_handles_empty_context(self, service, mock_llm):
        await service.generate_insight("Theme")

        human_msg = mock_llm.ainvoke.call_args[0][0][1].content
        assert "No additional context provided" in human_msg

    @pytest.mark.asyncio
    async def test_lazy_llm_resolution(self):
        svc = AnalysisService(llm=None)
        assert svc._llm is None


# ── CEP Extraction ─────────────────────────────────────────────────────────


class TestExtractCEP:
    @pytest.fixture
    def cep_llm(self):
        """LLM that returns a valid CEP JSON."""
        llm = AsyncMock()
        cep_data = {
            "actions": ["fought the dragon", "saved the village"],
            "traits": ["brave", "stubborn"],
            "relations": [{"target": "Bob", "type": "ally", "description": "trusted friend"}],
            "key_events": [{"event": "Battle of X", "chapter": 5, "significance": "turning point"}],
            "quotes": ["I will not yield!"],
        }
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=f"```json\n{json.dumps(cep_data)}\n```")
        )
        return llm

    @pytest.mark.asyncio
    async def test_extract_cep_no_services(self, cep_llm):
        svc = AnalysisService(llm=cep_llm)
        cep = await svc._extract_cep("Alice", "doc-1")
        assert isinstance(cep, CEPResult)
        assert len(cep.actions) == 2
        assert "brave" in cep.traits

    @pytest.mark.asyncio
    async def test_extract_cep_with_kg(self, cep_llm):
        kg = AsyncMock()
        entity_mock = MagicMock(id="ent-1")
        kg.get_entity_by_name = AsyncMock(return_value=entity_mock)
        kg.get_relations = AsyncMock(return_value=[
            MagicMock(source_id="ent-1", relation_type="KNOWS", target_id="ent-2"),
        ])
        kg.get_entity_timeline = AsyncMock(return_value=[
            MagicMock(chapter_number=1, description="Arrived in town"),
        ])

        svc = AnalysisService(llm=cep_llm, kg_service=kg)
        cep = await svc._extract_cep("Alice", "doc-1")
        assert len(cep.actions) == 2
        kg.get_entity_by_name.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_cep_with_vector(self, cep_llm):
        vector = AsyncMock()
        vector.search = AsyncMock(return_value=[
            {"id": "c1", "score": 0.9, "text": "Alice fought bravely.", "document_id": "doc-1",
             "chapter_number": 3, "position": 1},
        ])

        svc = AnalysisService(llm=cep_llm, vector_service=vector)
        cep = await svc._extract_cep("Alice", "doc-1")
        assert isinstance(cep, CEPResult)
        vector.search.assert_awaited_once()


# ── Archetype Classification ──────────────────────────────────────────────


class TestClassifyArchetype:
    @pytest.fixture
    def archetype_llm(self):
        llm = AsyncMock()
        data = {
            "primary": "hero",
            "secondary": "rebel",
            "confidence": 0.85,
            "evidence": ["Fights bravely", "Challenges authority"],
        }
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=json.dumps(data))
        )
        return llm

    @pytest.mark.asyncio
    async def test_classify_archetype(self, archetype_llm):
        svc = AnalysisService(llm=archetype_llm)
        cep = CEPResult(actions=["fought"], traits=["brave"])
        result = await svc._classify_archetype(cep, "jung", "en")
        assert isinstance(result, ArchetypeResult)
        assert result.primary == "hero"
        assert result.confidence == 0.85


# ── Character Arc Generation ──────────────────────────────────────────────


class TestGenerateCharacterArc:
    @pytest.fixture
    def arc_llm(self):
        llm = AsyncMock()
        data = [
            {"chapter_range": "1-3", "phase": "Setup", "description": "Introduction to Alice"},
            {"chapter_range": "4-7", "phase": "Crisis", "description": "Alice faces the trial"},
        ]
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=json.dumps(data))
        )
        return llm

    @pytest.mark.asyncio
    async def test_generate_arc(self, arc_llm):
        svc = AnalysisService(llm=arc_llm)
        cep = CEPResult(actions=["fought"])
        result = await svc._generate_character_arc(cep)
        assert len(result) == 2
        assert isinstance(result[0], ArcSegment)
        assert result[0].phase == "Setup"


# ── Profile Summary ───────────────────────────────────────────────────────


class TestGenerateProfile:
    @pytest.fixture
    def profile_llm(self):
        llm = AsyncMock()
        data = {"summary": "Alice is a brave hero who fights for justice."}
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content=json.dumps(data))
        )
        return llm

    @pytest.mark.asyncio
    async def test_generate_profile(self, profile_llm):
        svc = AnalysisService(llm=profile_llm)
        cep = CEPResult(actions=["fought"])
        result = await svc._generate_profile("Alice", cep)
        assert isinstance(result, CharacterProfile)
        assert "Alice" in result.summary

    @pytest.mark.asyncio
    async def test_profile_fallback_raw_text(self):
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(
            return_value=MagicMock(content="Alice is a complex character with no JSON.")
        )
        svc = AnalysisService(llm=llm)
        cep = CEPResult()
        result = await svc._generate_profile("Alice", cep)
        assert isinstance(result, CharacterProfile)
        assert len(result.summary) > 0


# ── Coverage Metrics ──────────────────────────────────────────────────────


class TestComputeCoverage:
    def test_full_coverage(self):
        cep = CEPResult(
            actions=["a1"], traits=["t1"], relations=[{"target": "B"}],
            key_events=[{"event": "E"}], quotes=["Q"],
        )
        cov = AnalysisService._compute_coverage(cep)
        assert cov.action_count == 1
        assert cov.gaps == []

    def test_empty_cep_has_gaps(self):
        cep = CEPResult()
        cov = AnalysisService._compute_coverage(cep)
        assert len(cov.gaps) == 5


# ── Full analyze_character pipeline ────────────────────────────────────────


class TestAnalyzeCharacterFull:
    @pytest.mark.asyncio
    async def test_full_pipeline(self):
        """Mock LLM returns appropriate JSON for each sub-call."""
        call_count = 0

        async def mock_ainvoke(messages):
            nonlocal call_count
            call_count += 1
            responses = [
                # CEP
                json.dumps({
                    "actions": ["fought"], "traits": ["brave"],
                    "relations": [], "key_events": [], "quotes": [],
                }),
                # Archetype
                json.dumps({
                    "primary": "hero", "secondary": None,
                    "confidence": 0.9, "evidence": ["fights"],
                }),
                # Arc
                json.dumps([
                    {"chapter_range": "1-5", "phase": "Setup", "description": "Intro"},
                ]),
                # Profile
                json.dumps({"summary": "Alice is a brave hero."}),
            ]
            idx = min(call_count - 1, len(responses) - 1)
            return MagicMock(content=responses[idx])

        llm = AsyncMock()
        llm.ainvoke = mock_ainvoke

        svc = AnalysisService(llm=llm)
        result = await svc.analyze_character("Alice", "doc-1", ["jung"], "en")

        assert isinstance(result, CharacterAnalysisResult)
        assert result.entity_name == "Alice"
        assert result.document_id == "doc-1"
        assert len(result.archetypes) == 1
        assert result.archetypes[0].primary == "hero"
        assert len(result.arc) == 1
        assert "Alice" in result.profile.summary
