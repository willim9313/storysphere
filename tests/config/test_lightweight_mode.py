"""Tests for I-001 lightweight deployment mode (5d1754a, b6cdd53, 2c2061f).

Coverage:
  - Settings.deploy_mode default + override
  - enforce_lightweight_constraints: kg_mode coerced to networkx when lightweight
  - qdrant_mode property branches on deploy_mode
  - qdrant_local_path_absolute returns an absolute Path
  - VectorService.__init__ routes to local-path client when qdrant_mode='local'
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, "src")

from config.settings import Settings  # noqa: E402

# ── Settings: deploy_mode + constraints ──────────────────────────────────────


class TestDeployMode:
    def test_default_deploy_mode_is_lightweight(self):
        s = Settings()
        assert s.deploy_mode == "lightweight"

    def test_lightweight_forces_kg_mode_networkx_even_if_neo4j_requested(self):
        """Lightweight mode disallows Neo4j; the validator silently coerces."""
        s = Settings(deploy_mode="lightweight", kg_mode="neo4j")
        assert s.kg_mode == "networkx"

    def test_standard_mode_preserves_kg_mode(self):
        s = Settings(deploy_mode="standard", kg_mode="neo4j")
        assert s.kg_mode == "neo4j"

    def test_standard_mode_default_kg_mode(self):
        s = Settings(deploy_mode="standard")
        assert s.kg_mode == "networkx"  # base default


# ── qdrant_mode property ─────────────────────────────────────────────────────


class TestQdrantMode:
    def test_lightweight_implies_local_qdrant(self):
        s = Settings(deploy_mode="lightweight")
        assert s.qdrant_mode == "local"

    def test_standard_implies_remote_qdrant(self):
        s = Settings(deploy_mode="standard")
        assert s.qdrant_mode == "remote"

    def test_qdrant_local_path_absolute_is_absolute(self, tmp_path):
        s = Settings(qdrant_local_path=str(tmp_path / "qd"))
        absolute = s.qdrant_local_path_absolute
        assert isinstance(absolute, Path)
        assert absolute.is_absolute()

    def test_qdrant_local_path_absolute_resolves_relative(self):
        s = Settings(qdrant_local_path="./relative/path")
        # Path.resolve() makes it absolute even if the path doesn't exist
        assert s.qdrant_local_path_absolute.is_absolute()


# ── VectorService init branching ─────────────────────────────────────────────


class TestVectorServiceLightweightInit:
    """VectorService picks the local-file Qdrant client when qdrant_mode='local'."""

    def test_local_mode_creates_local_path_client(self, tmp_path):
        from services import vector_service as vs_mod

        local_dir = tmp_path / "qdrant_local"
        settings = Settings(
            deploy_mode="lightweight",
            qdrant_local_path=str(local_dir),
        )

        with patch("config.settings.get_settings", return_value=settings), patch.object(
            vs_mod, "QdrantClient"
        ) as fake_client:
            vs_mod.VectorService()
            fake_client.assert_called_once()
            kwargs = fake_client.call_args.kwargs
            # local-path init uses path=, not url=
            assert "path" in kwargs
            assert Path(kwargs["path"]).resolve() == local_dir.resolve()

        # Side effect: the directory is created up-front
        assert local_dir.exists()

    def test_standard_mode_uses_remote_url_client_and_validates(self):
        from services import vector_service as vs_mod

        settings = Settings(
            deploy_mode="standard",
            qdrant_url="http://qdrant:6333",
            qdrant_api_key="",
        )

        fake_instance = MagicMock()
        # standard mode calls get_collections() to validate connectivity
        fake_instance.get_collections.return_value = []

        with patch("config.settings.get_settings", return_value=settings), patch.object(
            vs_mod, "QdrantClient", return_value=fake_instance
        ) as fake_client:
            vs_mod.VectorService()
            kwargs = fake_client.call_args.kwargs
            assert kwargs.get("url") == "http://qdrant:6333"
            fake_instance.get_collections.assert_called_once()

    def test_standard_mode_raises_when_qdrant_unreachable(self):
        from services import vector_service as vs_mod

        settings = Settings(deploy_mode="standard", qdrant_url="http://nope:6333")
        fake_instance = MagicMock()
        fake_instance.get_collections.side_effect = ConnectionError("refused")

        with patch("config.settings.get_settings", return_value=settings), patch.object(
            vs_mod, "QdrantClient", return_value=fake_instance
        ), pytest.raises(RuntimeError, match="cannot connect to Qdrant"):
            vs_mod.VectorService()
