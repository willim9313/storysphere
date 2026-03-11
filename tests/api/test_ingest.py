"""Tests for POST/GET /api/v1/ingest endpoints."""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch


def test_ingest_returns_202(client):
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/ingest/",
        data={"title": "Test Novel"},
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "task_id" in data
    assert data["status"] == "pending"


def test_ingest_rejects_unsupported_format(client):
    resp = client.post(
        "/api/v1/ingest/",
        data={"title": "Test Novel"},
        files={"file": ("novel.txt", io.BytesIO(b"text"), "text/plain")},
    )
    assert resp.status_code == 422
    assert "pdf" in resp.json()["detail"].lower() or "docx" in resp.json()["detail"].lower()


def test_ingest_requires_title(client):
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/v1/ingest/",
        files={"file": ("novel.pdf", fake_pdf, "application/pdf")},
    )
    assert resp.status_code == 422


def test_ingest_poll_not_found(client):
    resp = client.get("/api/v1/ingest/nonexistent-task-id")
    assert resp.status_code == 404


def test_ingest_poll_tracks_status(client):
    """Task store is updated; poll returns the stored status."""
    from api.store import task_store

    # Manually create a task to simulate a completed ingestion
    task_id = "test-completed-task"
    task_store.create(task_id)
    task_store.set_completed(task_id, result={"entities": 5, "relations": 3})

    resp = client.get(f"/api/v1/ingest/{task_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == task_id
    assert data["status"] == "completed"
    assert data["result"]["entities"] == 5
