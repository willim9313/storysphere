"""503 when the primary LLM provider is not configured (DS v3 batch 3, Q1).

The analysis triggers launch a background task, so with no provider the request
used to be accepted and the failure surfaced only inside the task. Each endpoint
that will actually call the LLM now answers 503 first, after its own
404/409/422 validation.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from storysphere.api.llm_guard import require_llm_provider
from storysphere.config.settings import Settings
from storysphere.core.llm_client import LLMClient

from tests.api.conftest import MEETING

UNCONFIGURED = "PRIMARY_LLM_PROVIDER=gemini but GEMINI_API_KEY is not set."

# (label, method, url, json body, expected status when the provider IS configured)
ENDPOINTS = [
    ("entity-analyze", "post", "/api/v1/books/doc-1/entities/ent-alice/analyze", None, 200),
    ("entity-analyze-all", "post", "/api/v1/books/doc-1/entities/analyze-all", None, 202),
    ("voice-generate", "get", "/api/v1/books/doc-1/entities/ent-alice/voice", None, 200),
    ("voice-force", "get", "/api/v1/books/doc-1/entities/ent-alice/voice?force=true", None, 200),
    ("event-analyze", "post", "/api/v1/books/doc-1/events/evt-1/analyze", None, 200),
    ("event-analyze-all", "post", "/api/v1/books/doc-1/events/analyze-all", None, 202),
    ("rerun-summarization", "post", "/api/v1/books/doc-1/rerun/summarization", None, 202),
    ("rerun-knowledge-graph", "post", "/api/v1/books/doc-1/rerun/knowledge-graph", None, 202),
    ("rerun-symbol-discovery", "post", "/api/v1/books/doc-1/rerun/symbol-discovery", None, 202),
    ("classify-visibility", "post", "/api/v1/books/doc-1/classify-visibility", None, 202),
    ("symbol-analyze", "post", "/api/v1/symbols/img-1/analyze", {"book_id": "doc-1"}, 202),
    ("symbol-analyze-all", "post", "/api/v1/symbols/analyze-all", {"book_id": "doc-1"}, 202),
]


def _profile():
    from datetime import datetime

    from storysphere.domain.voice_profile import VoiceProfile

    return VoiceProfile(
        character_id="ent-alice",
        character_name="Alice",
        document_id="doc-1",
        avg_sentence_length=8.0,
        question_ratio=0.1,
        exclamation_ratio=0.05,
        lexical_diversity=0.5,
        paragraphs_analyzed=5,
        speech_style="Direct.",
        distinctive_patterns=[],
        tone="assertive",
        representative_quotes=[],
        analyzed_at=datetime(2026, 1, 1),
    )


@pytest.fixture
def guard_client(mock_kg, mock_doc, mock_analysis_agent):
    """TestClient with every dependency the guarded endpoints touch mocked."""
    from storysphere.api import deps
    from storysphere.api.main import create_app
    mock_doc.get_document_language = AsyncMock(return_value="en")
    mock_kg.get_events = AsyncMock(return_value=[MEETING])
    mock_kg.get_event = AsyncMock(return_value=MEETING)

    mock_cache = AsyncMock()
    mock_cache.get = AsyncMock(return_value=None)
    mock_cache.get_as = AsyncMock(return_value=None)

    def _voice(**kw):
        if kw.get("cached_only"):
            return None  # nothing cached → the request would generate
        return _profile()

    mock_voice = AsyncMock()
    mock_voice.get_voice_profile = AsyncMock(side_effect=_voice)

    imagery = SimpleNamespace(id="img-1", frequency=2)
    mock_symbol = AsyncMock()
    mock_symbol.get_imagery_by_id = AsyncMock(return_value=imagery)
    mock_symbol.get_imagery_list = AsyncMock(return_value=[imagery])
    mock_symbol_analysis = AsyncMock()
    mock_symbol_analysis.list_interpretations = AsyncMock(return_value={})
    mock_symbol_analysis.list_blocks = AsyncMock(return_value={})

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
    app.dependency_overrides[deps.get_voice_profiling_service] = lambda: mock_voice
    app.dependency_overrides[deps.get_symbol_service] = lambda: mock_symbol
    app.dependency_overrides[deps.get_symbol_analysis_service] = lambda: mock_symbol_analysis
    app.dependency_overrides[deps.get_epistemic_state_service] = lambda: AsyncMock()

    with TestClient(app, raise_server_exceptions=True) as c:
        c.mock_voice = mock_voice  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()


def _unconfigured(monkeypatch):
    monkeypatch.setattr("storysphere.api.llm_guard._primary_config_error", lambda: UNCONFIGURED)


def _send(client, method, url, body, launch=None):
    """Send the request with the background runner stubbed out."""
    launch = launch or MagicMock(side_effect=lambda _id, coro: coro.close())
    with patch("storysphere.api.task_runner.launch", launch):
        if body:
            return getattr(client, method)(url, json=body)
        return getattr(client, method)(url)


class TestUnconfiguredProvider:
    @pytest.mark.parametrize(
        ("method", "url", "body"),
        [pytest.param(m, u, b, id=label) for label, m, u, b, _ in ENDPOINTS],
    )
    def test_returns_503_with_detail(self, guard_client, monkeypatch, method, url, body):
        _unconfigured(monkeypatch)
        launch = MagicMock()

        resp = _send(guard_client, method, url, body, launch)

        assert resp.status_code == 503
        assert "GEMINI_API_KEY" in resp.json()["detail"]
        launch.assert_not_called()

    @pytest.mark.parametrize(
        ("method", "url", "body", "ok"),
        [pytest.param(m, u, b, ok, id=label) for label, m, u, b, ok in ENDPOINTS],
    )
    def test_configured_behaves_as_before(self, guard_client, method, url, body, ok):
        resp = _send(guard_client, method, url, body)
        assert resp.status_code == ok

    def test_existing_404_wins_over_503(self, guard_client, monkeypatch):
        _unconfigured(monkeypatch)
        resp = _send(guard_client, "post", "/api/v1/books/no-such-book/entities/analyze-all", None)
        assert resp.status_code == 404


class TestVoiceOnlyGuardsGeneration:
    def test_cached_only_never_checked(self, guard_client, monkeypatch):
        _unconfigured(monkeypatch)
        resp = guard_client.get("/api/v1/books/doc-1/entities/ent-alice/voice?cached_only=true")
        assert resp.status_code == 404  # nothing cached, but not 503

    def test_cache_hit_not_blocked(self, guard_client, monkeypatch):
        _unconfigured(monkeypatch)
        guard_client.mock_voice.get_voice_profile = AsyncMock(return_value=_profile())
        resp = guard_client.get("/api/v1/books/doc-1/entities/ent-alice/voice")
        assert resp.status_code == 200


class TestRerunOnlyGuardsLlmSteps:
    def test_feature_extraction_with_yake_not_checked(self, guard_client, monkeypatch):
        _unconfigured(monkeypatch)
        with patch(
            "storysphere.config.settings.get_settings",
            return_value=MagicMock(keyword_extractor_type="yake"),
        ):
            resp = _send(guard_client, "post", "/api/v1/books/doc-1/rerun/feature-extraction", None)
        assert resp.status_code == 202

    @pytest.mark.parametrize("kind", ["llm", "composite", "LLM"])
    def test_feature_extraction_with_llm_keywords_checked(self, guard_client, monkeypatch, kind):
        _unconfigured(monkeypatch)
        with patch(
            "storysphere.config.settings.get_settings",
            return_value=MagicMock(keyword_extractor_type=kind),
        ):
            resp = _send(guard_client, "post", "/api/v1/books/doc-1/rerun/feature-extraction", None)
        assert resp.status_code == 503

    def test_unknown_step_still_422(self, guard_client, monkeypatch):
        _unconfigured(monkeypatch)
        resp = _send(guard_client, "post", "/api/v1/books/doc-1/rerun/nope", None)
        assert resp.status_code == 422


def _settings(**kw) -> Settings:
    base = {
        "primary_llm_provider": "gemini",
        "gemini_api_key": "",
        "openai_api_key": "",
        "anthropic_api_key": "",
        "local_llm_model": "",
    }
    return Settings(_env_file=None, **{**base, **kw})


class TestPrimaryConfigError:
    """The real Settings-based decision (what the autouse stub replaces)."""

    @pytest.mark.parametrize(
        ("provider", "key"),
        [
            ("gemini", "GEMINI_API_KEY"),
            ("openai", "OPENAI_API_KEY"),
            ("anthropic", "ANTHROPIC_API_KEY"),
            ("local", "LOCAL_LLM_MODEL"),
        ],
    )
    def test_names_the_env_key_for_each_provider(self, provider, key):
        error = LLMClient(_settings(primary_llm_provider=provider)).primary_config_error()
        assert error is not None
        assert key in error

    def test_none_when_primary_is_set(self):
        assert LLMClient(_settings(gemini_api_key="k")).primary_config_error() is None

    def test_other_provider_key_does_not_count(self):
        """Primary is gemini; an OpenAI key alone must not satisfy the check."""
        assert LLMClient(_settings(openai_api_key="k")).primary_config_error() is not None

    def test_resolve_primary_raises_the_same_message(self):
        client = LLMClient(_settings())
        with pytest.raises(RuntimeError) as exc:
            client.get_primary()
        assert str(exc.value) == client.primary_config_error()


class TestRequireLlmProvider:
    def test_raises_503_with_the_message(self, monkeypatch):
        _unconfigured(monkeypatch)
        with pytest.raises(HTTPException) as exc:
            require_llm_provider()
        assert exc.value.status_code == 503
        assert UNCONFIGURED in exc.value.detail

    def test_silent_when_configured(self):
        require_llm_provider()  # autouse stub: configured
