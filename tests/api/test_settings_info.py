"""Settings info endpoint (#25a) — the LLM readiness the settings page shows.

Someone sent here by a 503 「尚未設定 LLM provider」 must see the same verdict the
503 came from, plus which .env variable fixes it. The suite-wide
``llm_provider_configured`` fixture pins the pre-flight to "configured"; here it
is put back to the real check, fed one real ``Settings``, so the endpoint
answers from the actual verdict rather than a mocked one.
"""

from __future__ import annotations

import pytest
from storysphere.config.settings import Settings
from storysphere.core.llm_client import LLMClient


@pytest.fixture
def use_settings(monkeypatch):
    def _use(**overrides):
        s = Settings(_env_file=None, **overrides)
        monkeypatch.setattr("storysphere.config.settings.get_settings", lambda: s)
        monkeypatch.setattr(
            "storysphere.api.llm_guard._primary_config_error",
            lambda: LLMClient(s).primary_config_error(),
        )
    return _use


class TestPrimaryProviderReadiness:
    def test_unset_key_reports_not_ready_and_names_the_variable(self, client, use_settings):
        use_settings(primary_llm_provider="openai", openai_api_key="")
        body = client.get("/api/v1/settings/info").json()

        assert body["primaryProviderReady"] is False
        assert body["primaryCredentialEnv"] == "OPENAI_API_KEY"

    def test_set_key_reports_ready(self, client, use_settings):
        use_settings(primary_llm_provider="anthropic", anthropic_api_key="sk-ant-real-looking")
        body = client.get("/api/v1/settings/info").json()

        assert body["primaryProviderReady"] is True
        assert body["primaryCredentialEnv"] == "ANTHROPIC_API_KEY"

    def test_local_provider_names_the_model_variable(self, client, use_settings):
        """Local needs no key — its "credential" is the model name."""
        use_settings(primary_llm_provider="local", local_llm_model="")
        body = client.get("/api/v1/settings/info").json()

        assert body["primaryProviderReady"] is False
        assert body["primaryCredentialEnv"] == "LOCAL_LLM_MODEL"

    def test_never_returns_the_key_itself(self, client, use_settings):
        secret = "sk-ant-should-never-leave-the-server"
        use_settings(primary_llm_provider="anthropic", anthropic_api_key=secret)
        raw = client.get("/api/v1/settings/info").text

        assert secret not in raw
