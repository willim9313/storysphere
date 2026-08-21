"""Tests for GET /api/v1/books/{book_id} — book detail fields.

`language` is the reason this file exists: analysis endpoints take a language
and feed it to `get_language_display_name` for the prompt's "Respond in {name}.",
so a caller that cannot read the book's own language has to guess. It was stored
on the document all along but never exposed (B-062).
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


def _make_document(language: str):
    from storysphere.domain.documents import Chapter, Document, FileType, Paragraph

    return Document(
        id="book-1",
        title="名字的潮汐",
        author="Author",
        file_path="/tmp/tide.epub",
        file_type=FileType.EPUB,
        language=language,
        chapters=[
            Chapter(
                number=1,
                title="第一章",
                summary="開場。",
                paragraphs=[Paragraph(id="p1", text="海。", chapter_number=1, position=0)],
            )
        ],
        summary="一個關於名字的故事。",
    )


@pytest.fixture
def detail_client(mock_kg, mock_vector, mock_analysis_agent, mock_chat_agent):
    """A doc service whose document carries an explicit, non-default language.

    The shared `mock_doc` document leaves `language` at its "en" default, which
    is also the schema default — so it cannot tell a wired-up field apart from a
    field that is merely defaulting.
    """
    from storysphere.api import deps
    from storysphere.api.main import create_app

    doc_svc = AsyncMock()
    holder = {"doc": _make_document("zh-tw")}

    async def _get_doc(doc_id):
        return holder["doc"] if doc_id == "book-1" else None

    doc_svc.get_document = AsyncMock(side_effect=_get_doc)

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: doc_svc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector
    app.dependency_overrides[deps.get_analysis_agent] = lambda: mock_analysis_agent
    app.dependency_overrides[deps.get_chat_agent] = lambda: mock_chat_agent

    with TestClient(app) as c:
        c.holder = holder
        yield c

    app.dependency_overrides.clear()


class TestBookDetailLanguage:
    def test_returns_the_documents_language(self, detail_client):
        resp = detail_client.get("/api/v1/books/book-1")
        assert resp.status_code == 200
        assert resp.json()["language"] == "zh-tw"

    def test_language_is_not_the_schema_default(self, detail_client):
        """Guards the wiring, not the value.

        `BookDetailResponse.language` defaults to "en" to match the domain
        default, so a router that forgot to pass the field would still return a
        plausible-looking language. Only a document that disagrees with the
        default can catch that.
        """
        detail_client.holder["doc"] = _make_document("ja")
        assert detail_client.get("/api/v1/books/book-1").json()["language"] == "ja"

    def test_unknown_book_still_404s(self, detail_client):
        assert detail_client.get("/api/v1/books/no-such-book").status_code == 404
