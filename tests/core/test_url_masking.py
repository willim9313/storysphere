"""Tests for the shared connection-URL masking helper.

``mask_url`` is used by /settings/info and by every log line that prints a
Neo4j / Qdrant / database URL.
"""

from __future__ import annotations

from storysphere.core.utils.url_masking import mask_url


class TestMaskUrl:
    def test_strips_userinfo_and_path_from_postgres_url(self):
        result = mask_url("postgres://user:pass@db.host:5432/mydb")
        assert result == "postgres://db.host:5432"
        assert "user" not in result
        assert "pass" not in result
        assert "mydb" not in result

    def test_sqlite_url_without_host_returns_scheme_only(self):
        result = mask_url("sqlite+aiosqlite:///var/app.db")
        assert result == "sqlite+aiosqlite://"
        assert "var" not in result
        assert "app.db" not in result

    def test_empty_string_returns_empty_string(self):
        assert mask_url("") == ""

    def test_host_without_port_omits_colon(self):
        result = mask_url("postgres://user:pass@db.host/mydb")
        assert result == "postgres://db.host"

    def test_strips_credentials_from_bolt_url(self):
        result = mask_url("neo4j://neo4j:secret@graph.host:7687")
        assert result == "neo4j://graph.host:7687"
        assert "secret" not in result

    def test_url_without_credentials_is_unchanged(self):
        assert mask_url("http://localhost:6333") == "http://localhost:6333"
