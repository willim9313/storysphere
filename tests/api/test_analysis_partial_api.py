import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, "src")
from storysphere.services.analysis_models import (  # noqa: E402
    CausalityAnalysis,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventSummary,
    ImpactAnalysis,
)

from tests.api.conftest import poll_until_terminal
from tests.conftest import attach_get_as


def _partial_cached() -> dict:
    return CharacterAnalysisResult(
        entity_id="ent-1", entity_name="Bob", document_id="book-1",
        profile=CharacterProfile(summary="s"), cep=CEPResult(),
        archetypes=[], arc=[], coverage=CoverageMetrics(),
        failed_parts=["archetype:jung"]).model_dump(mode="json")


def _event_cached(failed_parts: list[str]) -> dict:
    from datetime import datetime, timezone
    return EventAnalysisResult(
        event_id="ev-1", title="Battle", document_id="book-1",
        eep=EventEvidenceProfile(state_before="a", state_after="b"),
        causality=CausalityAnalysis(), impact=ImpactAnalysis(),
        summary=EventSummary(), coverage=EventCoverageMetrics(),
        failed_parts=failed_parts,
        analyzed_at=datetime.now(timezone.utc)).model_dump(mode="json")


def _override_cache(client, cached):
    from storysphere.api import deps
    mock_cache = attach_get_as(AsyncMock())
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
        # The analysis runs under ``task_runner`` now, which does not block the
        # response the way ``BackgroundTasks`` did — drive the task before
        # asking what the agent was called with.
        poll_until_terminal(client, resp.json()["taskId"])
        _, kwargs = mock_analysis_agent.analyze_character.call_args
        assert kwargs.get("retry_parts") == ["archetype:jung"]


class TestListStatus:
    def test_partial_character_shows_partial_status_in_list(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.list_entities = AsyncMock(
            return_value=[SimpleNamespace(id="ent-1", name="Bob", mention_count=5)])
        _override_cache(client, _partial_cached())
        resp = client.get("/api/v1/books/book-1/analysis/characters")
        assert resp.status_code == 200
        analyzed = resp.json()["analyzed"]
        assert len(analyzed) == 1
        assert analyzed[0]["status"] == "partial"

    def test_complete_character_shows_complete_status(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.list_entities = AsyncMock(
            return_value=[SimpleNamespace(id="ent-1", name="Bob", mention_count=5)])
        cached = CharacterAnalysisResult(
            entity_id="ent-1", entity_name="Bob", document_id="book-1",
            profile=CharacterProfile(summary="s"), cep=CEPResult(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=[]).model_dump(mode="json")
        _override_cache(client, cached)
        resp = client.get("/api/v1/books/book-1/analysis/characters")
        assert resp.json()["analyzed"][0]["status"] == "complete"


class TestEventListStatus:
    def test_partial_event_shows_partial_status_in_list(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.get_events = AsyncMock(return_value=[
            SimpleNamespace(id="ev-1", title="Battle", chapter=1, narrative_mode=None)])
        _override_cache(client, _event_cached(["causality"]))
        resp = client.get("/api/v1/books/book-1/analysis/events")
        assert resp.status_code == 200
        analyzed = resp.json()["analyzed"]
        assert len(analyzed) == 1
        assert analyzed[0]["status"] == "partial"

    def test_complete_event_shows_complete_status(self, client, mock_kg, mock_doc):
        mock_doc.get_document = AsyncMock(return_value=SimpleNamespace(id="book-1"))
        mock_kg.get_events = AsyncMock(return_value=[
            SimpleNamespace(id="ev-1", title="Battle", chapter=1, narrative_mode=None)])
        _override_cache(client, _event_cached([]))
        resp = client.get("/api/v1/books/book-1/analysis/events")
        assert resp.json()["analyzed"][0]["status"] == "complete"


class TestCharacterStaleReporting:
    """B-111 — a feature-extraction rerun ages a CEP instead of deleting it.

    CEP is built from a vector search plus ``get_entity_keywords``, both this
    step's output, while the entity id it is keyed by survives untouched. The
    character side needs the flag for the same reason the event side does:
    preserving an analysis without saying it is outdated is worse than
    deleting it, because it looks current.
    """

    CREATED = datetime(2026, 8, 1, tzinfo=timezone.utc)

    @staticmethod
    def _document(feature_extraction_at):
        from storysphere.domain.documents import Document, FileType, PipelineStatus

        return Document(
            id="book-1", title="T", author="A", file_path="/tmp/x.pdf",
            file_type=FileType.PDF, chapters=[],
            pipeline_status=PipelineStatus(feature_extraction_at=feature_extraction_at),
        )

    def _arm(self, client, mock_kg, mock_doc, ran_at):
        mock_doc.get_document = AsyncMock(return_value=self._document(ran_at))
        mock_kg.get_entity = AsyncMock(
            return_value=SimpleNamespace(id="ent-1", name="Bob"))
        mock_kg.list_entities = AsyncMock(
            return_value=[SimpleNamespace(id="ent-1", name="Bob", mention_count=5)])
        cached = CharacterAnalysisResult(
            entity_id="ent-1", entity_name="Bob", document_id="book-1",
            profile=CharacterProfile(summary="s"), cep=CEPResult(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=[]).model_dump(mode="json")
        cache = _override_cache(client, cached)
        cache.created_at = AsyncMock(return_value=self.CREATED.timestamp())
        return cache

    def test_detail_reports_stale_after_a_rerun(self, client, mock_kg, mock_doc):
        self._arm(client, mock_kg, mock_doc, self.CREATED + timedelta(days=1))

        body = client.get("/api/v1/books/book-1/entities/ent-1/analysis").json()

        assert body["isStale"] is True
        assert body["staleReason"] == "feature-extraction"

    def test_detail_reports_fresh_when_the_rerun_predates_it(
        self, client, mock_kg, mock_doc
    ):
        self._arm(client, mock_kg, mock_doc, self.CREATED - timedelta(days=1))

        body = client.get("/api/v1/books/book-1/entities/ent-1/analysis").json()

        assert body["isStale"] is False
        assert body["staleReason"] is None

    def test_list_reports_stale_after_a_rerun(self, client, mock_kg, mock_doc):
        self._arm(client, mock_kg, mock_doc, self.CREATED + timedelta(days=1))

        body = client.get("/api/v1/books/book-1/analysis/characters").json()

        assert body["analyzed"][0]["isStale"] is True

    def test_a_failing_staleness_read_keeps_the_analysis_visible(
        self, client, mock_kg, mock_doc
    ):
        """The enclosing try turns anything it catches into a 404 / unanalyzed.

        So the guard has to sit inside the staleness call, not around it.
        """
        cache = self._arm(client, mock_kg, mock_doc, self.CREATED + timedelta(days=1))
        cache.created_at = AsyncMock(side_effect=RuntimeError("db gone"))

        detail = client.get("/api/v1/books/book-1/entities/ent-1/analysis")
        listing = client.get("/api/v1/books/book-1/analysis/characters")

        assert detail.status_code == 200
        assert detail.json()["isStale"] is False
        assert len(listing.json()["analyzed"]) == 1
