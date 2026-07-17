"""Tests for GET /books/:bookId/entities/:entityId/voice (#16a) — cached_only param."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from storysphere.domain.voice_profile import VoiceProfile

BOOK_ID = "doc-1"
ENTITY_ID = "ent-alice"


def _profile() -> VoiceProfile:
    return VoiceProfile(
        character_id=ENTITY_ID,
        character_name="Alice",
        document_id=BOOK_ID,
        avg_sentence_length=8.0,
        question_ratio=0.1,
        exclamation_ratio=0.05,
        lexical_diversity=0.5,
        paragraphs_analyzed=5,
        speech_style="Direct and confident.",
        distinctive_patterns=["short sentences"],
        tone="assertive",
        representative_quotes=["I will not yield."],
        analyzed_at=datetime(2026, 1, 1),
    )


@pytest.fixture
def voice_client(mock_kg, mock_doc):
    """TestClient with VoiceProfilingService overridden by an AsyncMock.

    Local fixture (not in shared conftest.py) per docs/guides/TESTING.md —
    the voice endpoint needs a dependency conftest.py doesn't cover.
    """
    import sys

    sys.path.insert(0, "src")

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    mock_doc.get_document_language = AsyncMock(return_value="en")
    mock_voice = AsyncMock()

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_voice_profiling_service] = lambda: mock_voice

    with TestClient(app, raise_server_exceptions=True) as client:
        client.mock_voice = mock_voice  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


class TestVoiceCachedOnly:
    def test_default_behaviour_unchanged(self, voice_client):
        """cached_only omitted → same as False, generation path used as before."""
        voice_client.mock_voice.get_voice_profile.return_value = _profile()

        resp = voice_client.get(
            f"/api/v1/books/{BOOK_ID}/entities/{ENTITY_ID}/voice"
        )
        assert resp.status_code == 200
        voice_client.mock_voice.get_voice_profile.assert_awaited_once_with(
            document_id=BOOK_ID,
            character_id=ENTITY_ID,
            language="en",
            cached_only=False,
        )

    def test_cached_only_true_returns_200_when_cached(self, voice_client):
        voice_client.mock_voice.get_voice_profile.return_value = _profile()

        resp = voice_client.get(
            f"/api/v1/books/{BOOK_ID}/entities/{ENTITY_ID}/voice?cached_only=true"
        )
        assert resp.status_code == 200
        assert resp.json()["characterName"] == "Alice"
        voice_client.mock_voice.get_voice_profile.assert_awaited_once_with(
            document_id=BOOK_ID,
            character_id=ENTITY_ID,
            language="en",
            cached_only=True,
        )

    def test_cached_only_true_returns_404_when_not_cached(self, voice_client):
        """cached_only=true with no cache → 404, and must not trigger generation."""
        voice_client.mock_voice.get_voice_profile.return_value = None

        resp = voice_client.get(
            f"/api/v1/books/{BOOK_ID}/entities/{ENTITY_ID}/voice?cached_only=true"
        )
        assert resp.status_code == 404
        voice_client.mock_voice.get_voice_profile.assert_awaited_once_with(
            document_id=BOOK_ID,
            character_id=ENTITY_ID,
            language="en",
            cached_only=True,
        )
