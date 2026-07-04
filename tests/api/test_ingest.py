"""Tests for book upload and task status endpoints.

Upload: POST /api/v1/books/upload
Status: GET  /api/v1/tasks/{task_id}/status
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch

import pytest


def test_ingest_returns_202(client):
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Test Novel"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data


def test_ingest_rejects_unsupported_format(client):
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Test Novel"},
        files={"file": ("novel.xyz", io.BytesIO(b"text"), "application/octet-stream")},
    )
    assert resp.status_code == 422
    assert "pdf" in resp.json()["detail"].lower() or "docx" in resp.json()["detail"].lower()


def test_ingest_accepts_epub_format(client):
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Test Novel"},
        files={"file": ("novel.epub", io.BytesIO(b"fake epub bytes"), "application/epub+zip")},
    )
    assert resp.status_code == 202
    assert "taskId" in resp.json()


def test_ingest_requires_file(client):
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Test Novel"},
    )
    assert resp.status_code == 422


def test_ingest_poll_not_found(client):
    resp = client.get("/api/v1/tasks/nonexistent-task-id/status")
    assert resp.status_code == 404


def test_ingest_poll_tracks_status(client):
    """Task store is updated; poll returns the stored status."""
    from storysphere.api.store import task_store

    task_id = "test-completed-task"
    task_store.create(task_id)
    task_store.set_completed(task_id, result={"entities": 5, "relations": 3})

    resp = client.get(f"/api/v1/tasks/{task_id}/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["taskId"] == task_id
    assert data["status"] == "done"
    assert data["result"]["entities"] == 5


def test_ingest_with_author_returns_202(client):
    """Uploading with an optional author field is accepted."""
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Test Novel", "author": "Jane Austen"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    assert "taskId" in resp.json()


def test_ingest_without_author_still_accepted(client):
    """author field is optional — omitting it must not cause a 422."""
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "No Author Novel"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202


# ── Duplicate title detection (warn, don't block) ───────────────────────────


def test_ingest_warns_on_duplicate_title(client, mock_doc):
    """A title matching an existing book still uploads (202), just flagged."""
    mock_doc.title_exists = AsyncMock(return_value=True)
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Existing Novel"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data
    assert data["duplicateTitle"] is True


def test_ingest_no_warning_for_new_title(client, mock_doc):
    """A title with no existing match uploads normally with no warning flag."""
    mock_doc.title_exists = AsyncMock(return_value=False)
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "Brand New Novel"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    assert resp.json()["duplicateTitle"] is False


def test_ingest_duplicate_check_is_case_insensitive(client, mock_doc):
    """title_exists is called with the submitted title regardless of case;
    the service layer owns the case-insensitive comparison."""
    mock_doc.title_exists = AsyncMock(return_value=True)
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/books/upload",
        data={"title": "ExIsTiNg NoVeL"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    assert resp.json()["duplicateTitle"] is True
    mock_doc.title_exists.assert_called_once_with("ExIsTiNg NoVeL")


# ── POST /books/detect-language ──────────────────────────────────────────────


def test_detect_language_returns_zh_for_chinese_txt(client):
    text = ("這是一段很長的繁體中文文字用來測試上傳前的語言偵測功能。" * 3).encode("utf-8")
    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.txt", io.BytesIO(text), "text/plain")},
    )
    assert resp.status_code == 200
    assert resp.json()["language"].startswith("zh")


def test_detect_language_returns_en_for_english_txt(client):
    text = (
        b"It was a dark and stormy night. The wind howled through the "
        b"empty streets as the old clock tower struck midnight."
    )
    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.txt", io.BytesIO(text), "text/plain")},
    )
    assert resp.status_code == 200
    assert resp.json()["language"] == "en"


def test_detect_language_rejects_unsupported_format(client):
    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.xyz", io.BytesIO(b"text"), "application/octet-stream")},
    )
    assert resp.status_code == 422


def test_detect_language_returns_zh_for_chinese_epub(client, tmp_path):
    try:
        from ebooklib import epub
    except ImportError:
        pytest.skip("ebooklib not installed")

    book = epub.EpubBook()
    book.set_identifier("test-detect-lang")
    book.set_title("測試小說")
    book.set_language("zh")
    c1 = epub.EpubHtml(title="第一章", file_name="chap1.xhtml", lang="zh")
    c1.content = "<h1>第一章</h1><p>這是一段很長的繁體中文文字用來測試上傳前的語言偵測功能。</p>" * 3
    book.add_item(c1)
    book.toc = (c1,)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", c1]

    epub_file = tmp_path / "novel.epub"
    epub.write_epub(str(epub_file), book)

    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.epub", epub_file.open("rb"), "application/epub+zip")},
    )
    assert resp.status_code == 200
    assert resp.json()["language"].startswith("zh")


def test_detect_language_falls_back_gracefully_on_corrupt_pdf(client):
    """A file that fails to parse must not crash the request — it should
    degrade to a default language instead of a 500."""
    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.pdf", io.BytesIO(b"%PDF-1.4 not a real pdf"), "application/pdf")},
    )
    assert resp.status_code == 200
    assert resp.json()["language"] == "en"


def test_detect_language_does_not_create_a_task(client):
    """This is a lightweight preview call — it must not touch task_store."""
    from storysphere.api.store import task_store

    before = len(task_store._store)
    text = b"Some plain English text."
    resp = client.post(
        "/api/v1/books/detect-language",
        files={"file": ("novel.txt", io.BytesIO(text), "text/plain")},
    )
    assert resp.status_code == 200
    assert set(resp.json().keys()) == {"language"}
    assert len(task_store._store) == before
