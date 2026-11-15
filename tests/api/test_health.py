from __future__ import annotations


class TestHealth:
    def test_health_returns_ok(self, client):
        response = client.get("/api/v2/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_not_served_under_v1(self, client):
        assert client.get("/api/v1/health").status_code == 404
