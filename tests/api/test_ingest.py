"""Tests for book upload and task status endpoints.

Upload: POST /api/v1/books/upload
Status: GET  /api/v1/tasks/{task_id}/status
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch


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
