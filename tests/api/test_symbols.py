"""API tests for /api/v1/symbols endpoints."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_entity(
    book_id: str = "book-1",
    term: str = "mirror",
    imagery_type: ImageryType = ImageryType.OBJECT,
    frequency: int = 5,
    entity_id: str = "img-1",
) -> ImageryEntity:
    return ImageryEntity(
        id=entity_id,
        book_id=book_id,
        term=term,
        imagery_type=imagery_type,
        aliases=["looking glass"],
        frequency=frequency,
        chapter_distribution={1: 3, 2: 2},
    )


def _make_occurrence(imagery_id: str = "img-1", book_id: str = "book-1") -> SymbolOccurrence:
    return SymbolOccurrence(
        id="occ-1",
        imagery_id=imagery_id,
        book_id=book_id,
        paragraph_id="p1",
        chapter_number=1,
        position=0,
        context_window="She gazed into the mirror.",
        co_occurring_terms=["door"],
    )


@pytest.fixture
def mock_symbol_svc():
    svc = AsyncMock()
    entity = _make_entity()
    svc.get_imagery_list = AsyncMock(return_value=[entity])
    svc.get_imagery_by_id = AsyncMock(return_value=entity)
    svc.get_occurrences = AsyncMock(return_value=[_make_occurrence()])
    svc.get_occurrences_by_book = AsyncMock(return_value=[_make_occurrence()])
    return svc


@pytest.fixture
def mock_symbol_graph():
    graph = MagicMock()
    graph._ensure_graph = MagicMock(return_value=True)
    graph.get_co_occurrences = AsyncMock(return_value=[("door", 3)])
    graph.build_graph = AsyncMock()
    return graph


@pytest.fixture
def mock_doc_service():
    return AsyncMock()


@pytest.fixture
def mock_kg_service():
    svc = AsyncMock()
    svc.get_events = AsyncMock(return_value=[])
    return svc


@pytest.fixture
def mock_cache():
    cache = AsyncMock()
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()
    return cache


@pytest.fixture
def mock_symbol_analysis_svc():
    svc = AsyncMock()
    svc.get_interpretation = AsyncMock(return_value=None)
    svc.update_interpretation_review = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def mock_analysis_agent():
    agent = AsyncMock()
    return agent


@pytest.fixture
def client(
    mock_symbol_svc,
    mock_symbol_graph,
    mock_doc_service,
    mock_kg_service,
    mock_cache,
    mock_symbol_analysis_svc,
    mock_analysis_agent,
):
    import sys

    sys.path.insert(0, "src")

    from api.main import create_app
    from api import deps

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[deps.get_symbol_service] = lambda: mock_symbol_svc
    app.dependency_overrides[deps.get_symbol_graph_service] = lambda: mock_symbol_graph
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc_service
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg_service
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
    app.dependency_overrides[deps.get_symbol_analysis_service] = (
        lambda: mock_symbol_analysis_svc
    )
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestListSymbols:
    def test_returns_200_with_items(self, client):
        resp = client.get("/api/v1/symbols?book_id=book-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["book_id"] == "book-1"
        assert data["total"] == 1
        assert data["items"][0]["term"] == "mirror"
        assert data["items"][0]["imagery_type"] == "object"
        assert data["items"][0]["first_chapter"] == 1

    def test_missing_book_id_returns_422(self, client):
        resp = client.get("/api/v1/symbols")
        assert resp.status_code == 422

    def test_filter_by_imagery_type(self, client, mock_symbol_svc):
        resp = client.get("/api/v1/symbols?book_id=book-1&imagery_type=object")
        assert resp.status_code == 200

    def test_invalid_imagery_type_returns_400(self, client):
        resp = client.get("/api/v1/symbols?book_id=book-1&imagery_type=invalid")
        assert resp.status_code == 400

    def test_min_frequency_filter(self, client, mock_symbol_svc):
        # entity has frequency=5, filter >=10 → empty
        resp = client.get("/api/v1/symbols?book_id=book-1&min_frequency=10")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_limit_respected(self, client, mock_symbol_svc):
        resp = client.get("/api/v1/symbols?book_id=book-1&limit=1")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 1


class TestSymbolTimeline:
    def test_returns_occurrences(self, client):
        resp = client.get("/api/v1/symbols/img-1/timeline")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["chapter_number"] == 1
        assert data[0]["context_window"] == "She gazed into the mirror."

    def test_imagery_not_found_returns_404(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_by_id = AsyncMock(return_value=None)
        resp = client.get("/api/v1/symbols/nonexistent/timeline")
        assert resp.status_code == 404


class TestCoOccurrences:
    def test_returns_co_occurrence_list(self, client, mock_symbol_svc):
        door_entity = _make_entity(term="door", entity_id="img-2", imagery_type=ImageryType.SPATIAL)
        mock_symbol_svc.get_imagery_list = AsyncMock(return_value=[
            _make_entity(),
            door_entity,
        ])
        resp = client.get("/api/v1/symbols/img-1/co-occurrences")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data[0]["term"] == "door"
        assert data[0]["co_occurrence_count"] == 3

    def test_imagery_not_found_returns_404(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_by_id = AsyncMock(return_value=None)
        resp = client.get("/api/v1/symbols/nonexistent/co-occurrences")
        assert resp.status_code == 404

    def test_auto_builds_graph_if_not_built(self, client, mock_symbol_graph, mock_symbol_svc):
        mock_symbol_graph._ensure_graph = MagicMock(return_value=False)
        door_entity = _make_entity(term="door", entity_id="img-2", imagery_type=ImageryType.SPATIAL)
        mock_symbol_svc.get_imagery_list = AsyncMock(return_value=[_make_entity(), door_entity])
        client.get("/api/v1/symbols/img-1/co-occurrences")
        mock_symbol_graph.build_graph.assert_called_once()


class TestSEPEndpoint:
    def test_returns_assembled_sep(self, client, mock_symbol_svc):
        from domain.symbol_analysis import SEP

        sep = SEP(
            imagery_id="img-1",
            book_id="book-1",
            term="mirror",
            imagery_type="object",
            frequency=5,
            chapter_distribution={1: 3, 2: 2},
            peak_chapters=[1, 2],
            co_occurring_entity_ids=["ent-alice"],
            co_occurring_event_ids=["ev-1"],
        )
        mock_symbol_svc.assemble_sep = AsyncMock(return_value=sep)

        resp = client.get("/api/v1/symbols/img-1/sep")
        assert resp.status_code == 200
        data = resp.json()
        assert data["imagery_id"] == "img-1"
        assert data["term"] == "mirror"
        assert data["peak_chapters"] == [1, 2]
        assert data["co_occurring_entity_ids"] == ["ent-alice"]
        mock_symbol_svc.assemble_sep.assert_called_once()

    def test_imagery_not_found_returns_404(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_by_id = AsyncMock(return_value=None)
        resp = client.get("/api/v1/symbols/missing/sep")
        assert resp.status_code == 404


class TestSymbolAnalyze:
    def test_analyze_returns_202(self, client, mock_analysis_agent):
        from domain.symbol_analysis import SymbolInterpretation
        mock_analysis_agent.analyze_symbol = AsyncMock(
            return_value=SymbolInterpretation(
                imagery_id="img-1", book_id="book-1", term="mirror",
                theme="self-doubt", polarity="negative",
            )
        )
        resp = client.post(
            "/api/v1/symbols/img-1/analyze",
            json={"book_id": "book-1", "language": "en"},
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "taskId" in data
        assert data["status"] == "pending"

    def test_analyze_imagery_not_found_returns_404(
        self, client, mock_symbol_svc
    ):
        mock_symbol_svc.get_imagery_by_id = AsyncMock(return_value=None)
        resp = client.post(
            "/api/v1/symbols/missing/analyze",
            json={"book_id": "book-1"},
        )
        assert resp.status_code == 404


class TestSymbolInterpretationGet:
    def test_returns_cached_interpretation(
        self, client, mock_symbol_analysis_svc
    ):
        from domain.symbol_analysis import SymbolInterpretation
        interp = SymbolInterpretation(
            imagery_id="img-1", book_id="book-1", term="mirror",
            theme="self-recognition", polarity="mixed", confidence=0.7,
        )
        mock_symbol_analysis_svc.get_interpretation = AsyncMock(return_value=interp)
        resp = client.get(
            "/api/v1/symbols/img-1/interpretation?book_id=book-1"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imagery_id"] == "img-1"
        assert data["theme"] == "self-recognition"
        assert data["polarity"] == "mixed"

    def test_missing_returns_404(self, client, mock_symbol_analysis_svc):
        mock_symbol_analysis_svc.get_interpretation = AsyncMock(return_value=None)
        resp = client.get(
            "/api/v1/symbols/img-1/interpretation?book_id=book-1"
        )
        assert resp.status_code == 404

    def test_imagery_not_found_returns_404(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_by_id = AsyncMock(return_value=None)
        resp = client.get(
            "/api/v1/symbols/missing/interpretation?book_id=book-1"
        )
        assert resp.status_code == 404


class TestSymbolInterpretationReview:
    def test_patch_approves(self, client, mock_symbol_analysis_svc):
        from domain.symbol_analysis import SymbolInterpretation
        updated = SymbolInterpretation(
            imagery_id="img-1", book_id="book-1", term="mirror",
            theme="self-doubt", polarity="negative", review_status="approved",
        )
        mock_symbol_analysis_svc.update_interpretation_review = AsyncMock(
            return_value=updated
        )
        resp = client.patch(
            "/api/v1/symbols/img-1/interpretation",
            json={"book_id": "book-1", "review_status": "approved"},
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "approved"

    def test_patch_modifies_theme(self, client, mock_symbol_analysis_svc):
        from domain.symbol_analysis import SymbolInterpretation
        updated = SymbolInterpretation(
            imagery_id="img-1", book_id="book-1", term="mirror",
            theme="new theme", polarity="positive", review_status="modified",
        )
        mock_symbol_analysis_svc.update_interpretation_review = AsyncMock(
            return_value=updated
        )
        resp = client.patch(
            "/api/v1/symbols/img-1/interpretation",
            json={
                "book_id": "book-1",
                "review_status": "modified",
                "theme": "new theme",
                "polarity": "positive",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["theme"] == "new theme"
        assert data["polarity"] == "positive"

    def test_patch_missing_returns_404(self, client, mock_symbol_analysis_svc):
        mock_symbol_analysis_svc.update_interpretation_review = AsyncMock(
            return_value=None
        )
        resp = client.patch(
            "/api/v1/symbols/img-1/interpretation",
            json={"book_id": "book-1", "review_status": "approved"},
        )
        assert resp.status_code == 404


class TestIngestionRegression:
    """Ensure skip_symbols=True does not break existing IngestionWorkflow."""

    def test_ingestion_result_has_imagery_extracted_field(self):
        from workflows.ingestion import IngestionResult

        r = IngestionResult(document_id="d1", document_title="T")
        assert hasattr(r, "imagery_extracted")
        assert r.imagery_extracted == 0

    def test_ingestion_workflow_accepts_skip_symbols(self):
        from workflows.ingestion import IngestionWorkflow

        wf = IngestionWorkflow(
            skip_qdrant=True,
            skip_kg=True,
            skip_summarization=True,
            skip_keywords=True,
            skip_symbols=True,
        )
        assert wf._skip_symbols is True
