"""Tests for GET /api/v1/relations/* endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock


def test_get_relation_paths(client):
    resp = client.get("/api/v1/relations/paths?source_id=ent-alice&target_id=ent-bob")
    assert resp.status_code == 200
    data = resp.json()
    assert data["source_id"] == "ent-alice"
    assert data["target_id"] == "ent-bob"
    assert "paths" in data
    assert isinstance(data["paths"], list)


def test_get_relation_paths_source_not_found(client):
    resp = client.get("/api/v1/relations/paths?source_id=nonexistent&target_id=ent-bob")
    assert resp.status_code == 404


def test_get_relation_paths_target_not_found(client):
    resp = client.get("/api/v1/relations/paths?source_id=ent-alice&target_id=nonexistent")
    assert resp.status_code == 404


def test_get_relation_paths_missing_params(client):
    resp = client.get("/api/v1/relations/paths?source_id=ent-alice")
    assert resp.status_code == 422


def test_get_relation_stats_global(client):
    resp = client.get("/api/v1/relations/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "stats" in data
    assert data["stats"]["total_relations"] == 1


def test_get_relation_stats_scoped(client):
    resp = client.get("/api/v1/relations/stats?entity_id=ent-alice")
    assert resp.status_code == 200
    data = resp.json()
    assert "stats" in data


def test_get_relation_stats_entity_not_found(client):
    resp = client.get("/api/v1/relations/stats?entity_id=nonexistent")
    assert resp.status_code == 404
