"""API tests for /api/v1/symbols endpoints."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from storysphere.domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence
from storysphere.domain.symbol_analysis import (
    CoOccurringEntityRef,
    CoOccurringImageryRef,
    InterpretationBlock,
    SymbolInterpretation,
    SymbolOverview,
    SymbolOverviewItem,
)


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
    # No interpretations is the normal state, not the edge case: real books run
    # at 1-of-29 coverage.
    svc.list_interpretations = AsyncMock(return_value={})
    # Likewise no refusals — must be a real dict, since the router takes a set()
    # of it and a bare AsyncMock attribute would not be iterable.
    svc.list_blocks = AsyncMock(return_value={})
    return svc


@pytest.fixture
def mock_analysis_agent():
    agent = AsyncMock()
    # The sweep itself lives on the agent now; endpoint tests only care about
    # what gets handed to it, so a benign summary is enough.
    agent.analyze_symbols_batch = AsyncMock(
        return_value={
            "progress": 0, "total": 0, "failed": 0, "skipped": 0, "aborted": False,
        }
    )
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

    from storysphere.api.main import create_app
    from storysphere.api import deps

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


class TestSymbolOverview:
    """#15i — the single request the page opens with."""

    @staticmethod
    def _overview(interpretation=None) -> SymbolOverview:
        return SymbolOverview(
            book_id="book-1",
            body_chapter_count=2,
            body_paragraph_count=40,
            chapter_roles={-1: "preface", 1: "body", 2: "body"},
            global_chapter_max=3,
            items=[
                SymbolOverviewItem(
                    id="img-1",
                    book_id="book-1",
                    term="mirror",
                    imagery_type="object",
                    aliases=["looking glass"],
                    frequency=5,
                    chapter_distribution={1: 3, 2: 2},
                    first_chapter=1,
                    co_occurring_entities=[
                        CoOccurringEntityRef(
                            id="ent-alice",
                            name="Alice",
                            entity_type="character",
                            count=3,
                            body_count=3,
                            paragraph_count=8,
                        )
                    ],
                    self_match_count=4,
                    co_occurring_event_count=7,
                    co_occurring_imagery=[
                        CoOccurringImageryRef(
                            term="door",
                            imagery_id="img-2",
                            co_occurrence_count=3,
                            imagery_type="object",
                        )
                    ],
                    interpretation=interpretation,
                )
            ],
        )

    def test_returns_200_with_resolved_signals(self, client, mock_symbol_svc):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["body_chapter_count"] == 2
        assert body["global_chapter_max"] == 3
        item = body["items"][0]
        assert item["co_occurring_entities"][0]["name"] == "Alice"
        assert item["co_occurring_entities"][0]["entity_type"] == "character"
        assert item["self_match_count"] == 4
        assert item["co_occurring_event_count"] == 7
        assert item["co_occurring_imagery"][0]["term"] == "door"

    def test_exposes_the_pieces_of_an_attachment_lift(self, client, mock_symbol_svc):
        """Attachment is only meaningful against a base rate, so both sides ship."""
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        body = client.get("/api/v1/symbols/overview?book_id=book-1").json()
        assert body["body_paragraph_count"] == 40
        alice = body["items"][0]["co_occurring_entities"][0]
        assert alice["body_count"] == 3
        assert alice["paragraph_count"] == 8

    def test_chapter_roles_survive_json_round_trip(self, client, mock_symbol_svc):
        """Front matter uses negative chapter numbers, which JSON keys stringify."""
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.json()["chapter_roles"]["-1"] == "preface"

    def test_interpretation_is_null_when_none_generated(
        self, client, mock_symbol_svc
    ):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.json()["items"][0]["interpretation"] is None

    def test_overlays_interpretation_status_onto_items(
        self, client, mock_symbol_svc, mock_symbol_analysis_svc
    ):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        mock_symbol_analysis_svc.list_interpretations = AsyncMock(
            return_value={
                "img-1": SymbolInterpretation(
                    imagery_id="img-1",
                    book_id="book-1",
                    term="mirror",
                    polarity="mixed",
                    confidence=0.9,
                    review_status="pending",
                )
            }
        )
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        interp = resp.json()["items"][0]["interpretation"]
        assert interp == {
            "review_status": "pending",
            "polarity": "mixed",
            "confidence": 0.9,
        }

    def test_ignores_interpretations_for_other_imagery(
        self, client, mock_symbol_svc, mock_symbol_analysis_svc
    ):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        mock_symbol_analysis_svc.list_interpretations = AsyncMock(
            return_value={
                "img-other": SymbolInterpretation(
                    imagery_id="img-other", book_id="book-1", term="door"
                )
            }
        )
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.json()["items"][0]["interpretation"] is None

    def test_overlays_a_refusal_onto_items(
        self, client, mock_symbol_svc, mock_symbol_analysis_svc
    ):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        mock_symbol_analysis_svc.list_blocks = AsyncMock(
            return_value={
                "img-1": InterpretationBlock(
                    imagery_id="img-1",
                    book_id="book-1",
                    term="mirror",
                    reason="provider_blocked",
                    detail="PROHIBITED_CONTENT",
                )
            }
        )
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        block = resp.json()["items"][0]["interpretation_block"]
        assert block["reason"] == "provider_blocked"
        assert block["detail"] == "PROHIBITED_CONTENT"
        assert block["blocked_at"]

    def test_refusal_is_null_when_none_recorded(self, client, mock_symbol_svc):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.json()["items"][0]["interpretation_block"] is None

    def test_ignores_refusals_for_other_imagery(
        self, client, mock_symbol_svc, mock_symbol_analysis_svc
    ):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        mock_symbol_analysis_svc.list_blocks = AsyncMock(
            return_value={
                "img-other": InterpretationBlock(
                    imagery_id="img-other",
                    book_id="book-1",
                    term="door",
                    reason="provider_blocked",
                )
            }
        )
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.json()["items"][0]["interpretation_block"] is None

    def test_an_interpreted_symbol_can_also_carry_no_refusal(
        self, client, mock_symbol_svc, mock_symbol_analysis_svc
    ):
        """The two overlays are independent — one must not clobber the other."""
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        mock_symbol_analysis_svc.list_interpretations = AsyncMock(
            return_value={
                "img-1": SymbolInterpretation(
                    imagery_id="img-1", book_id="book-1", term="mirror",
                )
            }
        )
        mock_symbol_analysis_svc.list_blocks = AsyncMock(
            return_value={
                "img-1": InterpretationBlock(
                    imagery_id="img-1",
                    book_id="book-1",
                    term="mirror",
                    reason="provider_empty",
                )
            }
        )
        item = client.get("/api/v1/symbols/overview?book_id=book-1").json()["items"][0]
        assert item["interpretation"] is not None
        assert item["interpretation_block"]["reason"] == "provider_empty"

    def test_force_is_passed_through(self, client, mock_symbol_svc):
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        client.get("/api/v1/symbols/overview?book_id=book-1&force=true")
        assert mock_symbol_svc.assemble_overview.await_args.kwargs["force"] is True

    def test_missing_book_id_returns_422(self, client):
        assert client.get("/api/v1/symbols/overview").status_code == 422

    def test_not_shadowed_by_the_imagery_id_routes(self, client, mock_symbol_svc):
        """``/overview`` must not be read as an imagery id."""
        mock_symbol_svc.assemble_overview = AsyncMock(return_value=self._overview())
        resp = client.get("/api/v1/symbols/overview?book_id=book-1")
        assert resp.status_code == 200
        mock_symbol_svc.assemble_overview.assert_awaited_once()


class TestSymbolTimeline:
    def test_returns_occurrences(self, client):
        resp = client.get("/api/v1/symbols/img-1/timeline")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["chapter_number"] == 1
        assert data[0]["context_window"] == "She gazed into the mirror."
        assert data[0]["paragraph_id"] == "p1"

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
        from storysphere.domain.symbol_analysis import SEP

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
        from storysphere.domain.symbol_analysis import SymbolInterpretation
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


class TestAnalyzeAllSymbols:
    """#15j — the batch the overview's three buttons drive."""

    @staticmethod
    def _entities(*specs) -> list[ImageryEntity]:
        return [
            _make_entity(term=term, frequency=freq, entity_id=eid)
            for eid, term, freq in specs
        ]

    @staticmethod
    def _batch_call(agent):
        """The single call the endpoint makes into the agent's sweep."""
        agent.analyze_symbols_batch.assert_awaited_once()
        call = agent.analyze_symbols_batch.await_args
        ids = call.args[1] if len(call.args) > 1 else call.kwargs["imagery_ids"]
        return set(ids), call.kwargs

    def test_returns_202_with_a_task_id(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-1", "mirror", 5))
        )
        resp = client.post(
            "/api/v1/symbols/analyze-all", json={"book_id": "book-1"}
        )
        assert resp.status_code == 202
        assert resp.json()["taskId"]

    def test_default_scope_skips_single_occurrence_terms(
        self, client, mock_symbol_svc, mock_analysis_agent
    ):
        """A word occurring once has no behaviour to interpret and is the majority."""
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(
                ("img-1", "mirror", 5), ("img-tail", "dust", 1)
            )
        )
        client.post("/api/v1/symbols/analyze-all", json={"book_id": "book-1"})
        selected, _ = self._batch_call(mock_analysis_agent)
        assert selected == {"img-1"}

    def test_imagery_ids_overrides_the_frequency_floor(
        self, client, mock_symbol_svc, mock_analysis_agent
    ):
        """An explicit pick is a deliberate choice, so honour it even for the tail."""
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(
                ("img-1", "mirror", 5), ("img-tail", "dust", 1)
            )
        )
        client.post(
            "/api/v1/symbols/analyze-all",
            json={"book_id": "book-1", "imagery_ids": ["img-tail"]},
        )
        selected, _ = self._batch_call(mock_analysis_agent)
        assert selected == {"img-tail"}

    def test_refused_symbols_are_skipped(
        self, client, mock_symbol_svc, mock_analysis_agent, mock_symbol_analysis_svc
    ):
        """A refusal is deterministic — re-attempting it spends a call to relearn it."""
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(
                ("img-1", "mirror", 5), ("img-blocked", "hand", 7)
            )
        )
        mock_symbol_analysis_svc.list_blocks = AsyncMock(
            return_value={
                "img-blocked": InterpretationBlock(
                    imagery_id="img-blocked",
                    book_id="book-1",
                    term="hand",
                    reason="provider_blocked",
                    detail="PROHIBITED_CONTENT",
                )
            }
        )
        client.post("/api/v1/symbols/analyze-all", json={"book_id": "book-1"})
        selected, kwargs = self._batch_call(mock_analysis_agent)
        assert selected == {"img-1", "img-blocked"}
        # The refusal is handed over as a skip rather than dropped, so a later
        # force_refresh can still re-attempt it.
        assert kwargs["skip_ids"] == {"img-blocked"}

    def test_force_refresh_re_attempts_a_refused_symbol(
        self, client, mock_symbol_svc, mock_analysis_agent, mock_symbol_analysis_svc
    ):
        """The escape hatch for when a second provider appears."""
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-blocked", "hand", 7))
        )
        mock_symbol_analysis_svc.list_blocks = AsyncMock(
            return_value={
                "img-blocked": InterpretationBlock(
                    imagery_id="img-blocked",
                    book_id="book-1",
                    term="hand",
                    reason="provider_blocked",
                )
            }
        )
        client.post(
            "/api/v1/symbols/analyze-all",
            json={"book_id": "book-1", "force_refresh": True},
        )
        selected, kwargs = self._batch_call(mock_analysis_agent)
        assert selected == {"img-blocked"}
        assert kwargs["force_refresh"] is True

    def test_unknown_imagery_ids_are_silently_excluded(
        self, client, mock_symbol_svc, mock_analysis_agent
    ):
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-1", "mirror", 5))
        )
        resp = client.post(
            "/api/v1/symbols/analyze-all",
            json={"book_id": "book-1", "imagery_ids": ["img-1", "img-ghost"]},
        )
        assert resp.status_code == 202
        selected, _ = self._batch_call(mock_analysis_agent)
        assert selected == {"img-1"}

    def test_returns_400_when_nothing_is_in_scope(self, client, mock_symbol_svc):
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-tail", "dust", 1))
        )
        resp = client.post(
            "/api/v1/symbols/analyze-all", json={"book_id": "book-1"}
        )
        assert resp.status_code == 400

    def test_returns_400_when_the_subset_matches_nothing(
        self, client, mock_symbol_svc
    ):
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-1", "mirror", 5))
        )
        resp = client.post(
            "/api/v1/symbols/analyze-all",
            json={"book_id": "book-1", "imagery_ids": ["img-ghost"]},
        )
        assert resp.status_code == 400

    def test_missing_book_id_returns_422(self, client):
        resp = client.post("/api/v1/symbols/analyze-all", json={})
        assert resp.status_code == 422

    def test_not_shadowed_by_the_per_symbol_analyze_route(
        self, client, mock_symbol_svc
    ):
        """``analyze-all`` must not be parsed as an imagery id."""
        mock_symbol_svc.get_imagery_list = AsyncMock(
            return_value=self._entities(("img-1", "mirror", 5))
        )
        resp = client.post(
            "/api/v1/symbols/analyze-all", json={"book_id": "book-1"}
        )
        assert resp.status_code == 202
        mock_symbol_svc.get_imagery_list.assert_awaited()


class TestBatchSymbolAnalysisRunner:
    """The runner's only job now: mirror the agent's sweep into the task store.

    The sweep's own accounting (skip / failure tolerance / rate-limit abort)
    moved to ``AnalysisAgent.analyze_symbols_batch`` and is tested there.
    """

    @staticmethod
    async def _run(agent, imagery_ids):
        from uuid import uuid4

        from storysphere.api.routers.symbols import _run_batch_symbol_analysis
        from storysphere.api.store import task_store

        # task_store is a global singleton; a unique id keeps tests isolated.
        task_id = str(uuid4())
        task_store.create(task_id, kind="symbol", title="test")
        await _run_batch_symbol_analysis(
            task_id=task_id,
            book_id="book-1",
            imagery_ids=imagery_ids,
            language="zh-TW",
            force_refresh=False,
            skip_ids=set(),
            agent=agent,
        )
        return task_store.get(task_id)

    async def test_summary_is_stored_without_the_internal_aborted_flag(self):
        agent = AsyncMock()
        agent.analyze_symbols_batch = AsyncMock(
            return_value={
                "progress": 2, "total": 2, "failed": 0, "skipped": 1, "aborted": False,
            }
        )
        task = await self._run(agent, ["img-1", "img-2"])
        assert task.status == "done"
        assert task.result == {"progress": 2, "total": 2, "failed": 0, "skipped": 1}

    async def test_abort_becomes_a_failed_task_naming_what_got_through(self):
        agent = AsyncMock()
        agent.analyze_symbols_batch = AsyncMock(
            return_value={
                "progress": 1, "total": 3, "failed": 0, "skipped": 0, "aborted": True,
            }
        )
        task = await self._run(agent, ["img-1", "img-2", "img-3"])
        assert task.status == "error"
        assert "1/3" in task.error

    async def test_progress_callback_reaches_the_task_store(self):
        from storysphere.api.store import task_store

        seen = {}

        async def _batch(book_id, imagery_ids, **kwargs):
            kwargs["progress_callback"](1, 2)
            return {
                "progress": 2, "total": 2, "failed": 0, "skipped": 0, "aborted": False,
            }

        agent = AsyncMock()
        agent.analyze_symbols_batch = _batch

        from uuid import uuid4

        from storysphere.api.routers.symbols import _run_batch_symbol_analysis

        task_id = str(uuid4())
        task_store.create(task_id, kind="symbol", title="test")
        await _run_batch_symbol_analysis(
            task_id=task_id,
            book_id="book-1",
            imagery_ids=["img-1", "img-2"],
            language="zh-TW",
            force_refresh=False,
            skip_ids=set(),
            agent=agent,
        )
        seen = task_store.get(task_id)
        # completed overwrote progress, but sub_total proves the callback landed
        assert seen.sub_total == 2


class TestSymbolInterpretationGet:
    def test_returns_cached_interpretation(
        self, client, mock_symbol_analysis_svc
    ):
        from storysphere.domain.symbol_analysis import SymbolInterpretation
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
        from storysphere.domain.symbol_analysis import SymbolInterpretation
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
        from storysphere.domain.symbol_analysis import SymbolInterpretation
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
        from storysphere.workflows.ingestion import IngestionResult

        r = IngestionResult(document_id="d1", document_title="T")
        assert hasattr(r, "imagery_extracted")
        assert r.imagery_extracted == 0

    def test_ingestion_workflow_accepts_skip_symbols(self):
        from storysphere.workflows.ingestion import IngestionWorkflow

        wf = IngestionWorkflow(
            skip_qdrant=True,
            skip_kg=True,
            skip_summarization=True,
            skip_keywords=True,
            skip_symbols=True,
        )
        assert wf._skip_symbols is True
