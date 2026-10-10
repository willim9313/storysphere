"""Tests for the per-event analysis detail endpoint (#7d GET).

Written after the endpoint returned 500 for every analyzed event: the schema
classes it imports were moved to ``schemas.book_event_analysis`` (3c978af) but
this function-level import kept naming ``schemas.books``. A lazy import inside
a handler is invisible to both startup and ruff, so only a request reaches it —
and there was no test that made one.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.events import Event, EventType
from storysphere.services.analysis_models import (
    CausalityAnalysis,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventSummary,
    ImpactAnalysis,
)

BOOK_ID = "doc-1"
EVENT_ID = "evt-1"


def _make_event() -> Event:
    return Event(
        id=EVENT_ID,
        title="The Meeting",
        event_type=EventType.MEETING,
        description="Alice met Bob.",
        chapter=3,
        narrative_position=7,
    )


def _make_result(failed_parts: list[str] | None = None) -> EventAnalysisResult:
    return EventAnalysisResult(
        event_id=EVENT_ID,
        title="The Meeting",
        document_id=BOOK_ID,
        eep=EventEvidenceProfile(
            state_before="Strangers",
            state_after="Allies",
            thematic_significance="Trust is forged.",
        ),
        causality=CausalityAnalysis(root_cause="A shared enemy."),
        impact=ImpactAnalysis(impact_summary="The alliance holds."),
        summary=EventSummary(summary="A pivotal meeting."),
        coverage=EventCoverageMetrics(),
        failed_parts=failed_parts or [],
        analyzed_at=datetime(2026, 1, 1),
    )


@pytest.fixture
def cache_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    """Client with the analysis cache overridden.

    ``conftest.py`` does not cover ``get_analysis_cache``, so it is extended
    here rather than in the shared fixture (see docs/guides/TESTING.md).
    """
    from contextlib import asynccontextmanager

    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    cache = AsyncMock()
    cache.get_as = AsyncMock(return_value=None)

    # Own Document rather than conftest's: staleness dates an entry against
    # `pipeline_status`, so the tests need to set that field directly.
    from storysphere.domain.documents import Document, FileType

    document = Document(
        id=BOOK_ID,
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=[],
    )
    mock_doc.get_document = AsyncMock(
        side_effect=lambda doc_id: document if doc_id == BOOK_ID else None
    )

    mock_kg.get_event = AsyncMock(return_value=_make_event())

    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent
    app.dependency_overrides[deps.get_analysis_cache] = lambda: cache

    with TestClient(app, raise_server_exceptions=True) as c:
        c.cache = cache
        c.kg = mock_kg
        c.doc_fixture = document
        yield c

    app.dependency_overrides.clear()


class TestGetEventAnalysis:
    def _get(self, client, event_id: str = EVENT_ID):
        return client.get(f"/api/v1/books/{BOOK_ID}/events/{event_id}/analysis")

    def test_returns_cached_analysis(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result()

        resp = self._get(cache_client)

        assert resp.status_code == 200
        body = resp.json()
        assert body["eventId"] == EVENT_ID
        assert body["title"] == "The Meeting"
        assert body["eep"]["stateBefore"] == "Strangers"
        assert body["eep"]["eventImportance"] == "SATELLITE"
        assert body["causality"]["rootCause"] == "A shared enemy."
        assert body["impact"]["impactSummary"] == "The alliance holds."
        assert body["summary"]["summary"] == "A pivotal meeting."
        assert body["status"] == "complete"

    def test_reads_event_metadata_from_the_graph(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result()

        body = self._get(cache_client).json()

        # chapter / chunk come from the KG event, not from the cached result.
        assert body["chapter"] == 3
        assert body["chunk"] == 7

    def test_failed_parts_report_partial_status(self, cache_client):
        cache_client.cache.get_as.return_value = _make_result(failed_parts=["impact"])

        body = self._get(cache_client).json()

        assert body["status"] == "partial"
        assert body["failedParts"] == ["impact"]

    def test_returns_404_when_no_analysis_cached(self, cache_client):
        cache_client.cache.get_as.return_value = None

        assert self._get(cache_client).status_code == 404

    def test_returns_404_for_unknown_event(self, cache_client):
        cache_client.kg.get_event = AsyncMock(return_value=None)

        assert self._get(cache_client, "no-such-event").status_code == 404


class TestStaleReporting:
    """B-111 — a feature-extraction rerun ages an EEP instead of deleting it.

    The step replaces the vector evidence and keywords the analysis was built
    from but regenerates no id, so the entry stays readable. Saying so is the
    whole point of keeping it: a preserved analysis nobody flags as outdated is
    worse than a deleted one, because it looks current.
    """

    CREATED = datetime(2026, 8, 1, tzinfo=UTC)

    def _get(self, client):
        return client.get(f"/api/v1/books/{BOOK_ID}/events/{EVENT_ID}/analysis")

    def _arm(self, client, ran_at):
        client.cache.get_as.return_value = _make_result()
        client.cache.created_at = AsyncMock(return_value=self.CREATED.timestamp())
        client.doc_fixture.pipeline_status.feature_extraction_at = ran_at

    def test_rerun_after_the_analysis_reports_stale(self, cache_client):
        self._arm(cache_client, self.CREATED + timedelta(days=1))

        body = self._get(cache_client).json()

        assert body["isStale"] is True
        assert body["staleReason"] == "feature-extraction"

    def test_rerun_before_the_analysis_reports_fresh(self, cache_client):
        self._arm(cache_client, self.CREATED - timedelta(days=1))

        body = self._get(cache_client).json()

        assert body["isStale"] is False
        assert body["staleReason"] is None

    def test_step_never_run_reports_fresh(self, cache_client):
        """No recorded completion means the run predates these timestamps.

        Guessing "stale" there would flag the entire library at once.
        """
        self._arm(cache_client, None)

        assert self._get(cache_client).json()["isStale"] is False

    def test_a_failing_staleness_read_does_not_hide_the_analysis(self, cache_client):
        """The endpoint must still answer 200 with the payload.

        Reported fresh rather than raising — an exception here would surface as
        a 500 and take a perfectly readable analysis off screen.
        """
        self._arm(cache_client, self.CREATED + timedelta(days=1))
        cache_client.cache.created_at = AsyncMock(side_effect=RuntimeError("db gone"))

        resp = self._get(cache_client)

        assert resp.status_code == 200
        assert resp.json()["isStale"] is False

    def test_list_carries_the_flag_too(self, cache_client):
        """#6b is where the reader scans; the badge has to be visible there."""
        self._arm(cache_client, self.CREATED + timedelta(days=1))
        cache_client.kg.get_events = AsyncMock(return_value=[_make_event()])

        body = cache_client.get(f"/api/v1/books/{BOOK_ID}/analysis/events").json()

        assert len(body["analyzed"]) == 1
        assert body["analyzed"][0]["isStale"] is True
        assert body["analyzed"][0]["staleReason"] == "feature-extraction"


# ── #7m quote sources ─────────────────────────────────────────────────────────


def _paragraphs(*rows):
    """``(id, chapter, text)`` rows in the shape ``_locate_quote`` takes."""
    from storysphere.api.routers.book_event_analysis import _normalize_quote

    return [(pid, ch, _normalize_quote(text)) for pid, ch, text in rows]


class TestLocateQuote:
    def _locate(self, quote, rows, chapter=3):
        from storysphere.api.routers.book_event_analysis import _locate_quote

        return _locate_quote(quote, _paragraphs(*rows), chapter)

    def test_whole_quote_inside_a_paragraph(self):
        rows = [("p1", 3, "她轉身離開。「鹽醒了。」伊內絲喘著氣說。"), ("p2", 3, "海很安靜。")]
        assert self._locate("「鹽醒了。」伊內絲喘著氣說。", rows) == ("p1", 3)

    def test_ignores_spaces_inside_words(self):
        """pypdf puts spaces inside CJK words; the quote has none."""
        rows = [("p1", 3, "伊內 絲・科爾沃是在四月的 第九個清晨")]
        assert self._locate("伊內絲・科爾沃是在四月的第九個清晨", rows) == ("p1", 3)

    def test_prefix_when_the_quote_runs_past_the_paragraph(self):
        rows = [("p1", 3, "孩子，我教了妳七年讀鹽，可讀鹽真正的那一課。")]
        quote = "孩子，我教了妳七年讀鹽，可讀鹽真正的那一課。是怎麼放手。"
        assert self._locate(quote, rows) == ("p1", 3)

    def test_short_quote_gets_no_prefix_fallback(self):
        rows = [("p1", 3, "鹽醒")]
        assert self._locate("鹽醒了。", rows) is None

    def test_prefers_the_events_chapter(self):
        rows = [("p1", 1, "「鹽醒了。」"), ("p2", 3, "「鹽醒了。」她說。")]
        assert self._locate("鹽醒了。", rows) == ("p2", 3)

    def test_ambiguous_within_the_chapter_is_none(self):
        rows = [("p1", 3, "「鹽醒了。」"), ("p2", 3, "又一次，「鹽醒了。」")]
        assert self._locate("鹽醒了。", rows) is None

    def test_single_hit_outside_the_chapter(self):
        rows = [("p1", 5, "這裡的人不入土。")]
        assert self._locate("這裡的人不入土。", rows) == ("p1", 5)

    def test_ambiguous_outside_the_chapter_is_none(self):
        rows = [("p1", 5, "這裡的人不入土。"), ("p2", 6, "這裡的人不入土。")]
        assert self._locate("這裡的人不入土。", rows) is None

    def test_not_in_the_book(self):
        assert self._locate("完全不存在的句子", [("p1", 3, "海很安靜。")]) is None


class TestGetEventQuoteSources:
    def _get(self, client, event_id: str = EVENT_ID):
        return client.get(f"/api/v1/books/{BOOK_ID}/events/{event_id}/quote-sources")

    @pytest.fixture
    def quotes_client(self, cache_client):
        from storysphere.domain.documents import Chapter, Paragraph

        cache_client.doc_fixture.chapters = [
            Chapter(
                number=3,
                paragraphs=[
                    Paragraph(id="para-a", text="Alice met Bob at noon.", chapter_number=3, position=0),
                    Paragraph(id="para-b", text="They shook hands.", chapter_number=3, position=1),
                ],
            )
        ]
        event = _make_event()
        event.document_id = BOOK_ID
        cache_client.kg.get_event = AsyncMock(return_value=event)
        result = _make_result()
        result.eep.key_quotes = ["They shook hands.", "Nobody said this."]
        cache_client.cache.get_as.return_value = result
        return cache_client

    def test_pins_each_quote_or_leaves_it_null(self, quotes_client):
        resp = self._get(quotes_client)

        assert resp.status_code == 200
        assert resp.json() == {
            "eventId": EVENT_ID,
            "quotes": [
                {"text": "They shook hands.", "paragraphId": "para-b", "chapterNumber": 3},
                {"text": "Nobody said this.", "paragraphId": None, "chapterNumber": None},
            ],
        }

    def test_404_when_not_analyzed(self, quotes_client):
        quotes_client.cache.get_as.return_value = None
        assert self._get(quotes_client).status_code == 404

    def test_404_for_an_event_of_another_book(self, quotes_client):
        event = _make_event()
        event.document_id = "other-book"
        quotes_client.kg.get_event = AsyncMock(return_value=event)
        assert self._get(quotes_client).status_code == 404

    def test_404_for_unknown_event(self, quotes_client):
        quotes_client.kg.get_event = AsyncMock(return_value=None)
        assert self._get(quotes_client).status_code == 404
