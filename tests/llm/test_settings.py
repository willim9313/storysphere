from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from storysphere.llm.settings import (
    DEFAULT_SETTINGS_PATH,
    KNOWN_TASKS,
    SUBSCRIPTION_RISK_NOTICE,
    ProviderConfig,
    SettingsError,
    caps_ok,
    caps_problems,
    check_capabilities,
    load_settings,
    provider_configured,
    settings_path,
)


def base_config() -> dict:
    return {
        "providers": {"gemini": {"type": "api_key", "api_key_env": "GEMINI_API_KEY"}},
        "models": {
            "flash": {
                "provider": "gemini",
                "id": "google_genai:gemini-2.5-flash",
                "caps": ["structured_output", "long_context"],
            }
        },
        "tasks": {"core_extraction": {"model": "flash", "requires": ["structured_output"]}},
    }


def write(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "settings.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


class TestDefaultFile:
    def test_default_file_covers_all_eight_tasks(self):
        settings = load_settings(DEFAULT_SETTINGS_PATH)

        assert len(KNOWN_TASKS) == 8  # 7 個 pipeline task＋brain（T25）
        assert set(settings.tasks) == set(KNOWN_TASKS)
        assert list(settings.providers) == ["gemini"]
        assert settings.models["flash"].id == "google_genai:gemini-2.5-flash"
        assert all(task.model == "flash" for task in settings.tasks.values())
        assert caps_problems(settings) == []

    def test_known_tasks_include_method_tasks(self):
        assert {"method_strong", "method_light"} <= set(KNOWN_TASKS)


class TestSettingsPath:
    def test_missing_file_falls_back_to_default_without_writing(self, tmp_path):
        missing = tmp_path / "var" / "settings.yaml"

        settings = load_settings(missing)

        assert settings == load_settings(DEFAULT_SETTINGS_PATH)
        assert not missing.exists()
        assert list(tmp_path.iterdir()) == []

    def test_env_override_is_honoured(self, tmp_path, monkeypatch):
        config = base_config()
        config["models"]["flash"]["id"] = "google_genai:other"
        path = write(tmp_path, config)
        monkeypatch.setenv("STORYSPHERE_SETTINGS", str(path))

        assert settings_path() == path
        assert load_settings().models["flash"].id == "google_genai:other"

    def test_default_location_is_var_settings(self, monkeypatch):
        monkeypatch.delenv("STORYSPHERE_SETTINGS", raising=False)

        assert settings_path() == DEFAULT_SETTINGS_PATH.parents[1] / "var" / "settings.yaml"

    def test_other_top_level_keys_are_ignored(self, tmp_path):
        config = base_config()
        config["brain"] = {"default_backend": "none"}

        assert "flash" in load_settings(write(tmp_path, config)).models

    def test_missing_task_is_allowed(self, tmp_path):
        settings = load_settings(write(tmp_path, base_config()))

        assert "signal_tagging" not in settings.tasks


class TestStructuralErrors:
    def _fails(self, tmp_path, config: dict, fragment: str) -> str:
        with pytest.raises(SettingsError) as excinfo:
            load_settings(write(tmp_path, config))
        assert fragment in str(excinfo.value)
        return str(excinfo.value)

    def test_model_with_unknown_provider(self, tmp_path):
        config = base_config()
        config["models"]["flash"]["provider"] = "nope"
        self._fails(tmp_path, config, "unknown provider 'nope'")

    def test_task_with_unknown_model(self, tmp_path):
        config = base_config()
        config["tasks"]["core_extraction"]["model"] = "nope"
        self._fails(tmp_path, config, "unknown model 'nope'")

    def test_task_with_unknown_fallback_model(self, tmp_path):
        config = base_config()
        config["tasks"]["core_extraction"]["fallback"] = ["nope"]
        self._fails(tmp_path, config, "unknown model 'nope'")

    def test_unknown_task_name(self, tmp_path):
        config = base_config()
        config["tasks"]["summarise"] = {"model": "flash"}
        self._fails(tmp_path, config, "task 'summarise': unknown task name")

    def test_unknown_cap(self, tmp_path):
        config = base_config()
        config["models"]["flash"]["caps"] = ["telepathy"]
        self._fails(tmp_path, config, "models.flash.caps")

    def test_unknown_field(self, tmp_path):
        config = base_config()
        config["providers"]["gemini"]["api_key"] = "x"
        self._fails(tmp_path, config, "providers.gemini.api_key")

    def test_api_key_provider_without_env_name(self, tmp_path):
        config = base_config()
        config["providers"]["gemini"] = {"type": "api_key"}
        self._fails(tmp_path, config, "requires api_key_env")

    def test_subscription_without_via(self, tmp_path):
        config = base_config()
        config["providers"]["sub"] = {"type": "subscription"}
        self._fails(tmp_path, config, "requires via")

    def test_openai_compatible_without_base_url(self, tmp_path):
        config = base_config()
        config["providers"]["local"] = {"type": "openai_compatible"}
        self._fails(tmp_path, config, "requires base_url")

    def test_key_value_in_api_key_env_is_rejected_and_not_echoed(self, tmp_path):
        config = base_config()
        config["providers"]["gemini"]["api_key_env"] = "AIzaSy-abc123"
        message = self._fails(tmp_path, config, "must be an environment variable name")
        assert "AIzaSy-abc123" not in message

    def test_broken_yaml(self, tmp_path):
        path = tmp_path / "settings.yaml"
        path.write_text("providers: [unclosed", encoding="utf-8")

        with pytest.raises(SettingsError):
            load_settings(path)

    def test_non_mapping_yaml(self, tmp_path):
        path = tmp_path / "settings.yaml"
        path.write_text("- a\n- b\n", encoding="utf-8")

        with pytest.raises(SettingsError):
            load_settings(path)


class TestCapabilities:
    def _mismatched(self, tmp_path):
        config = base_config()
        config["models"]["weak"] = {"provider": "gemini", "id": "google_genai:weak", "caps": []}
        config["tasks"]["core_extraction"] = {
            "model": "flash",
            "fallback": ["weak"],
            "requires": ["structured_output"],
        }
        config["tasks"]["method_strong"] = {"model": "flash", "requires": ["reasoning"]}
        config["tasks"]["method_light"] = {"model": "flash", "requires": ["long_context"]}
        return load_settings(write(tmp_path, config))

    def test_problems_listed_for_primary_and_fallback(self, tmp_path):
        problems = caps_problems(self._mismatched(tmp_path))

        assert problems == [
            "task 'core_extraction': model 'weak' lacks caps ['structured_output']",
            "task 'method_strong': model 'flash' lacks caps ['reasoning']",
        ]

    def test_caps_ok_per_task(self, tmp_path):
        settings = self._mismatched(tmp_path)

        assert caps_ok(settings, "method_light") is True
        assert caps_ok(settings, "core_extraction") is False
        assert caps_ok(settings, "method_strong") is False

    def test_check_capabilities_raises_with_every_problem(self, tmp_path):
        with pytest.raises(SettingsError) as excinfo:
            check_capabilities(self._mismatched(tmp_path))

        assert "'weak'" in str(excinfo.value)
        assert "'reasoning'" in str(excinfo.value)

    def test_check_capabilities_passes_when_matching(self, tmp_path):
        check_capabilities(load_settings(write(tmp_path, base_config())))


class TestProviderConfigured:
    def test_api_key_follows_env_var(self, monkeypatch):
        provider = ProviderConfig(type="api_key", api_key_env="GEMINI_API_KEY")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
        assert provider_configured(provider) is True

        monkeypatch.setenv("GEMINI_API_KEY", "")
        assert provider_configured(provider) is False

        monkeypatch.delenv("GEMINI_API_KEY")
        assert provider_configured(provider) is False

    def test_openai_compatible_and_subscription_count_as_configured(self):
        local = ProviderConfig(type="openai_compatible", base_url="http://localhost:8000/v1")
        sub = ProviderConfig(type="subscription", via="claude_agent_sdk")

        assert provider_configured(local) is True
        assert provider_configured(sub) is True

    def test_risk_notice_is_present(self):
        assert "訂閱" in SUBSCRIPTION_RISK_NOTICE
