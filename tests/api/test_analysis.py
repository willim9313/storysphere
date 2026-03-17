"""Tests for POST/GET /api/v1/analysis/* endpoints."""

from __future__ import annotations

import time


# ── Character analysis ─────────────────────────────────────────────────────────

def test_analyze_character_returns_202(client):
    resp = client.post("/api/v1/analysis/character", json={
        "entity_name": "Alice",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data
    assert data["status"] == "pending"


def test_analyze_character_missing_fields(client):
    resp = client.post("/api/v1/analysis/character", json={"entity_name": "Alice"})
    assert resp.status_code == 422  # document_id is required


def test_analyze_character_poll_not_found(client):
    resp = client.get("/api/v1/analysis/character/nonexistent-id")
    assert resp.status_code == 404


def test_analyze_character_background_completes(client):
    """After the background task runs, polling returns done status."""
    resp = client.post("/api/v1/analysis/character", json={
        "entity_name": "Alice",
        "document_id": "doc-1",
        "archetype_frameworks": ["jung"],
        "language": "en",
    })
    assert resp.status_code == 202
    task_id = resp.json()["taskId"]

    # TestClient runs background tasks before context exits;
    # poll a few times to account for async scheduling
    for _ in range(5):
        poll = client.get(f"/api/v1/analysis/character/{task_id}")
        assert poll.status_code == 200
        if poll.json()["status"] in ("done", "error"):
            break
        time.sleep(0.05)

    final = client.get(f"/api/v1/analysis/character/{task_id}").json()
    assert final["status"] == "done"
    assert final["result"]["entity_name"] == "Alice"


# ── Event analysis ─────────────────────────────────────────────────────────────

def test_analyze_event_returns_202(client):
    resp = client.post("/api/v1/analysis/event", json={
        "event_id": "evt-1",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    data = resp.json()
    assert "taskId" in data
    assert data["status"] == "pending"


def test_analyze_event_missing_fields(client):
    resp = client.post("/api/v1/analysis/event", json={"event_id": "evt-1"})
    assert resp.status_code == 422


def test_analyze_event_poll_not_found(client):
    resp = client.get("/api/v1/analysis/event/nonexistent-id")
    assert resp.status_code == 404


def test_analyze_event_background_completes(client):
    resp = client.post("/api/v1/analysis/event", json={
        "event_id": "evt-1",
        "document_id": "doc-1",
    })
    assert resp.status_code == 202
    task_id = resp.json()["taskId"]

    for _ in range(5):
        poll = client.get(f"/api/v1/analysis/event/{task_id}")
        assert poll.status_code == 200
        if poll.json()["status"] in ("done", "error"):
            break
        time.sleep(0.05)

    final = client.get(f"/api/v1/analysis/event/{task_id}").json()
    assert final["status"] == "done"
    assert final["result"]["event_id"] == "evt-1"
