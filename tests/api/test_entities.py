"""Tests for GET /api/v1/entities/* endpoints."""

from __future__ import annotations

import pytest


def test_get_entity_ok(client):
    resp = client.get("/api/v1/entities/ent-alice")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "ent-alice"
    assert data["name"] == "Alice"
    assert data["entity_type"] == "character"


def test_get_entity_not_found(client):
    resp = client.get("/api/v1/entities/nonexistent")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_list_entities(client):
    resp = client.get("/api/v1/entities/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_list_entities_pagination(client):
    resp = client.get("/api/v1/entities/?limit=1&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["total"] == 2


def test_get_entity_relations(client):
    resp = client.get("/api/v1/entities/ent-alice/relations")
    assert resp.status_code == 200
    relations = resp.json()
    assert len(relations) == 1
    assert relations[0]["relation_type"] == "friendship"


def test_get_entity_relations_not_found(client):
    resp = client.get("/api/v1/entities/nonexistent/relations")
    assert resp.status_code == 404


def test_get_entity_relations_filter(client, mock_kg):
    from domain.relations import Relation, RelationType
    from unittest.mock import AsyncMock

    mock_kg.get_relations = AsyncMock(return_value=[
        Relation(source_id="ent-alice", target_id="ent-bob", relation_type=RelationType.FRIENDSHIP),
        Relation(source_id="ent-alice", target_id="ent-bob", relation_type=RelationType.ENEMY),
    ])

    resp = client.get("/api/v1/entities/ent-alice/relations?relation_type=friendship")
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["relation_type"] == "friendship" for r in data)


def test_get_entity_timeline(client):
    resp = client.get("/api/v1/entities/ent-alice/timeline")
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    assert events[0]["title"] == "The Meeting"
    assert events[0]["chapter"] == 1


def test_get_entity_timeline_not_found(client):
    resp = client.get("/api/v1/entities/nonexistent/timeline")
    assert resp.status_code == 404


def test_get_entity_subgraph(client):
    resp = client.get("/api/v1/entities/ent-alice/subgraph")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) == 1


def test_get_entity_subgraph_not_found(client):
    resp = client.get("/api/v1/entities/nonexistent/subgraph")
    assert resp.status_code == 404


def test_get_entity_relation_stats(client):
    resp = client.get("/api/v1/entities/ent-alice/relation-stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["total_relations"] == 1


def test_get_entity_relation_stats_not_found(client):
    resp = client.get("/api/v1/entities/nonexistent/relation-stats")
    assert resp.status_code == 404
