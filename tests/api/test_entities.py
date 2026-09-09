"""`GET /entities/:id` —— 唯一有呼叫端的實體端點。

其餘五個（list / relations / timeline / subgraph / relation-stats）於 2026-09-07
隨端點一起移除：它們是 KGService 方法的 HTTP 外殼，而 chat agent 走
`tools/graph_tools/` 直接呼叫 service，從不經過 HTTP。契約的「未納入契約的端點」
早已把它們列為待移除。
"""

from __future__ import annotations


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
