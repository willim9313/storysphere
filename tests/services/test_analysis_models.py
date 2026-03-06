"""Tests for services.analysis_models — Pydantic model validation."""

from services.analysis_models import (
    ArcSegment,
    ArchetypeResult,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)


class TestAnalysisModels:
    def test_cep_result_defaults(self):
        cep = CEPResult()
        assert cep.actions == []
        assert cep.top_terms == {}

    def test_archetype_result_validation(self):
        ar = ArchetypeResult(framework="jung", primary="hero", confidence=0.85)
        assert ar.framework == "jung"
        assert ar.secondary is None

    def test_character_analysis_result_full(self):
        result = CharacterAnalysisResult(
            entity_id="ent-1",
            entity_name="Alice",
            document_id="doc-1",
            profile=CharacterProfile(summary="Alice is the protagonist."),
            cep=CEPResult(
                actions=["fought the dragon"],
                traits=["brave"],
                relations=[{"target": "Bob", "type": "ally", "description": "trusted friend"}],
            ),
            archetypes=[ArchetypeResult(framework="jung", primary="hero", confidence=0.9)],
            arc=[ArcSegment(chapter_range="1-5", phase="Setup", description="Introduction")],
            coverage=CoverageMetrics(action_count=1, trait_count=1, relation_count=1),
        )
        assert result.entity_name == "Alice"
        assert len(result.archetypes) == 1
        assert result.coverage.action_count == 1
        # analyzed_at should be auto-set
        assert result.analyzed_at is not None
