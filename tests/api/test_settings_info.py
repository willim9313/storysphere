"""Tests for the /settings/info database_url masking helper.

GET /api/v1/settings/info
"""

from __future__ import annotations

from storysphere.api.routers.settings_info import _mask_db_url


class TestMaskDbUrl:
    def test_strips_userinfo_and_path_from_postgres_url(self):
        result = _mask_db_url("postgres://user:pass@db.host:5432/mydb")
        assert result == "postgres://db.host:5432"
        assert "user" not in result
        assert "pass" not in result
        assert "mydb" not in result

    def test_sqlite_url_without_host_returns_scheme_only(self):
        result = _mask_db_url("sqlite+aiosqlite:///var/app.db")
        assert result == "sqlite+aiosqlite://"
        assert "var" not in result
        assert "app.db" not in result

    def test_empty_string_returns_empty_string(self):
        assert _mask_db_url("") == ""

    def test_host_without_port_omits_colon(self):
        result = _mask_db_url("postgres://user:pass@db.host/mydb")
        assert result == "postgres://db.host"
