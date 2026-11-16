from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from storysphere.api.main import app
from storysphere.llm.settings import SettingsError

MISMATCHED = """
providers:
  gemini: { type: api_key, api_key_env: GEMINI_API_KEY }
models:
  weak: { provider: gemini, id: "google_genai:weak", caps: [] }
tasks:
  core_extraction: { model: weak, requires: [structured_output] }
"""


class TestStartupCapabilityCheck:
    def test_caps_mismatch_fails_startup(self, tmp_path, monkeypatch):
        path = tmp_path / "settings.yaml"
        path.write_text(MISMATCHED, encoding="utf-8")
        monkeypatch.setenv("STORYSPHERE_SETTINGS", str(path))

        with pytest.raises(SettingsError, match="core_extraction"):
            with TestClient(app):
                pass

    def test_broken_settings_file_fails_startup(self, tmp_path, monkeypatch):
        path = tmp_path / "settings.yaml"
        path.write_text("tasks: {nope: {model: missing}}", encoding="utf-8")
        monkeypatch.setenv("STORYSPHERE_SETTINGS", str(path))

        with pytest.raises(SettingsError):
            with TestClient(app):
                pass
