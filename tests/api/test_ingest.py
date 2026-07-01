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
