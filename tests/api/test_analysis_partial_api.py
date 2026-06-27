import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, "src")
from services.analysis_models import (  # noqa: E402
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)


def _partial_cached() -> dict:
    return CharacterAnalysisResult(
        entity_id="ent-1", entity_name="Bob", document_id="book-1",
        profile=CharacterProfile(summary="s"), cep=CEPResult(),
        archetypes=[], arc=[], coverage=CoverageMetrics(),
        failed_parts=["archetype:jung"]).model_dump(mode="json")


def _override_cache(client, cached):
    from api import deps
    mock_cache = AsyncMock()
    mock_cache.get = AsyncMock(return_value=cached)
    mock_cache.set = AsyncMock()
    client.app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
    return mock_cache


class TestEntityAnalysisStatus:
    def test_partial_result_exposes_status_and_failed_parts(self, client, mock_kg):
        mock_kg.get_entity = AsyncMock(return_value=SimpleNamespace(id="ent-1", name="Bob"))
        _override_cache(client, _partial_cached())
        resp = client.get("/api/v1/books/book-1/entities/ent-1/analysis")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "partial"
        assert body["failedParts"] == ["archetype:jung"]

    def test_complete_result_status(self, client, mock_kg):
        mock_kg.get_entity = AsyncMock(return_value=SimpleNamespace(id="ent-1", name="Bob"))
        cached = CharacterAnalysisResult(
            entity_id="ent-1", entity_name="Bob", document_id="book-1",
            profile=CharacterProfile(summary="s"), cep=CEPResult(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=[]).model_dump(mode="json")
        _override_cache(client, cached)
        resp = client.get("/api/v1/books/book-1/entities/ent-1/analysis")
        assert resp.json()["status"] == "complete"


class TestRetryFailedMode:
    def test_retry_failed_passes_retry_parts_to_agent(self, client, mock_kg, mock_doc, mock_analysis_agent):
        mock_kg.get_entity = AsyncMock(return_value=SimpleNamespace(id="ent-1", name="Bob"))
        mock_doc.get_document_language.return_value = "zh"
        _override_cache(client, _partial_cached())
        mock_analysis_agent.analyze_character = AsyncMock(return_value=CharacterAnalysisResult(
            entity_id="ent-1", entity_name="Bob", document_id="book-1",
            profile=CharacterProfile(summary="s"), cep=CEPResult(),
            archetypes=[], arc=[], coverage=CoverageMetrics(), failed_parts=[]))

        resp = client.post(
            "/api/v1/books/book-1/entities/ent-1/analyze", json={"mode": "retryFailed"})
        assert resp.status_code in (200, 202)
        _, kwargs = mock_analysis_agent.analyze_character.call_args
        assert kwargs.get("retry_parts") == ["archetype:jung"]


class TestListStatus:
    def test_partial_character_shows_partial_status_in_list(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.list_entities = AsyncMock(
            return_value=[SimpleNamespace(id="ent-1", name="Bob")])
        _override_cache(client, _partial_cached())
        resp = client.get("/api/v1/books/book-1/analysis/characters")
        assert resp.status_code == 200
        analyzed = resp.json()["analyzed"]
        assert len(analyzed) == 1
        assert analyzed[0]["status"] == "partial"

    def test_complete_character_shows_complete_status(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.list_entities = AsyncMock(
            return_value=[SimpleNamespace(id="ent-1", name="Bob")])
        cached = CharacterAnalysisResult(
            entity_id="ent-1", entity_name="Bob", document_id="book-1",
            profile=CharacterProfile(summary="s"), cep=CEPResult(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=[]).model_dump(mode="json")
        _override_cache(client, cached)
        resp = client.get("/api/v1/books/book-1/analysis/characters")
        assert resp.json()["analyzed"][0]["status"] == "complete"
