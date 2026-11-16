from __future__ import annotations

import pytest
from langchain_core.runnables import RunnableWithFallbacks
from pydantic import BaseModel
from storysphere.llm import router
from storysphere.llm.router import (
    LlmUnconfigured,
    build_model,
    llm_for,
    primary_model_id,
    task_available,
    usable_models,
)
from storysphere.llm.settings import (
    DEFAULT_SETTINGS_PATH,
    KNOWN_TASKS,
    LlmSettings,
    SettingsError,
    load_settings,
)


class Answer(BaseModel):
    text: str


class StubModel:
    """假的 chat model：記下 with_structured_output 收到的 schema。"""

    def __init__(self, model_id: str, kwargs: dict) -> None:
        self.model_id = model_id
        self.kwargs = kwargs
        self.schema = None
        self.fallbacks: list | None = None

    def with_structured_output(self, schema):
        bound = StubModel(self.model_id, self.kwargs)
        bound.schema = schema
        return bound

    def with_fallbacks(self, fallbacks):
        self.fallbacks = list(fallbacks)
        return self


@pytest.fixture
def init_calls(monkeypatch) -> list[StubModel]:
    calls: list[StubModel] = []

    def fake_init(model_id, **kwargs):
        stub = StubModel(model_id, kwargs)
        calls.append(stub)
        return stub

    monkeypatch.setattr(router, "init_chat_model", fake_init)
    return calls


def multi_settings() -> LlmSettings:
    return LlmSettings.model_validate(
        {
            "providers": {
                "gemini": {"type": "api_key", "api_key_env": "GEMINI_API_KEY"},
                "openai": {"type": "api_key", "api_key_env": "OPENAI_API_KEY"},
                "local-vllm": {"type": "openai_compatible", "base_url": "http://localhost:8000/v1"},
                "local-keyed": {
                    "type": "openai_compatible",
                    "base_url": "http://localhost:9000/v1",
                    "api_key_env": "LOCAL_LLM_KEY",
                },
                "claude-sub": {"type": "subscription", "via": "claude_agent_sdk"},
                "codex-sub": {"type": "subscription", "via": "chatgpt_login"},
            },
            "models": {
                "flash": {"provider": "gemini", "id": "google_genai:gemini-2.5-flash"},
                "strong": {"provider": "openai", "id": "openai:gpt-strong"},
                "local": {"provider": "local-vllm", "id": "qwen3-32b"},
                "local2": {"provider": "local-keyed", "id": "qwen3-8b"},
                "claude": {"provider": "claude-sub", "id": "sonnet"},
                "codex": {"provider": "codex-sub", "id": "gpt-codex"},
            },
            "tasks": {
                "core_extraction": {"model": "strong", "fallback": ["flash", "local"]},
                "signal_tagging": {"model": "codex"},
                "genre_detection": {"model": "codex", "fallback": ["claude"]},
            },
        }
    )


@pytest.fixture
def no_keys(monkeypatch):
    for name in ("GEMINI_API_KEY", "OPENAI_API_KEY", "LOCAL_LLM_KEY"):
        monkeypatch.delenv(name, raising=False)


class TestDefaultSettings:
    def test_all_tasks_resolve_with_gemini_key(self, monkeypatch, init_calls):
        monkeypatch.setenv("STORYSPHERE_SETTINGS", str(DEFAULT_SETTINGS_PATH))
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
        settings = load_settings()

        for task in KNOWN_TASKS:
            assert task_available(settings, task) is True
            assert usable_models(settings, task) == ["flash"]
            assert primary_model_id(settings, task) == "google_genai:gemini-2.5-flash"
            llm = llm_for(task)  # settings 省略 → load_settings()
            assert llm is init_calls[-1]
            assert llm.model_id == "google_genai:gemini-2.5-flash"
            assert llm.kwargs == {"api_key": "test-key-123"}

    def test_without_key_raises_unconfigured(self, monkeypatch, no_keys, init_calls):
        settings = load_settings(DEFAULT_SETTINGS_PATH)

        assert task_available(settings, "core_extraction") is False
        with pytest.raises(LlmUnconfigured) as excinfo:
            llm_for("core_extraction", settings=settings)
        assert excinfo.value.task == "core_extraction"
        with pytest.raises(LlmUnconfigured):
            primary_model_id(settings, "core_extraction")
        assert init_calls == []

    def test_task_not_in_settings_is_unconfigured(self):
        settings = multi_settings()

        assert usable_models(settings, "consolidation") == []
        with pytest.raises(LlmUnconfigured) as excinfo:
            llm_for("consolidation", settings=settings)
        assert excinfo.value.task == "consolidation"


class TestFallback:
    def test_unconfigured_primary_is_skipped(self, monkeypatch, no_keys, init_calls):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
        settings = multi_settings()

        assert usable_models(settings, "core_extraction") == ["flash", "local"]
        assert primary_model_id(settings, "core_extraction") == "google_genai:gemini-2.5-flash"

    def test_single_usable_model_is_returned_bare(self, no_keys, init_calls):
        llm = llm_for("core_extraction", settings=multi_settings())

        assert [call.model_id for call in init_calls] == ["qwen3-32b"]
        assert llm is init_calls[0]
        assert llm.fallbacks is None

    def test_several_usable_models_are_chained_in_order(self, monkeypatch, no_keys, init_calls):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
        monkeypatch.setenv("OPENAI_API_KEY", "test-key-456")

        llm = llm_for("core_extraction", settings=multi_settings())

        assert llm.model_id == "openai:gpt-strong"
        assert [m.model_id for m in llm.fallbacks] == ["google_genai:gemini-2.5-flash", "qwen3-32b"]

    def test_schema_is_applied_to_every_model(self, monkeypatch, no_keys, init_calls):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")

        llm = llm_for("core_extraction", schema=Answer, settings=multi_settings())

        assert llm.schema is Answer
        assert [m.schema for m in llm.fallbacks] == [Answer]
        assert all(call.schema is None for call in init_calls)  # 原本的模型沒被改動

    def test_real_models_combine_into_runnable_with_fallbacks(self, monkeypatch, no_keys):
        from langchain_core.language_models.fake_chat_models import FakeListChatModel

        monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
        monkeypatch.setattr(
            router, "init_chat_model", lambda *a, **k: FakeListChatModel(responses=["hi"])
        )

        llm = llm_for("core_extraction", settings=multi_settings())

        assert isinstance(llm, RunnableWithFallbacks)
        assert len(llm.fallbacks) == 1


class TestBuildModel:
    def test_api_key_missing_env_raises_settings_error(self, no_keys, init_calls):
        with pytest.raises(SettingsError, match="GEMINI_API_KEY"):
            build_model(multi_settings(), "flash")
        assert init_calls == []

    def test_openai_compatible_without_key(self, no_keys, init_calls):
        build_model(multi_settings(), "local")

        assert init_calls[0].model_id == "qwen3-32b"
        assert init_calls[0].kwargs == {
            "model_provider": "openai",
            "base_url": "http://localhost:8000/v1",
            "api_key": "not-needed",
        }

    def test_openai_compatible_with_key_env(self, monkeypatch, init_calls):
        monkeypatch.setenv("LOCAL_LLM_KEY", "test-key-789")

        build_model(multi_settings(), "local2")

        assert init_calls[0].kwargs["api_key"] == "test-key-789"
        assert init_calls[0].kwargs["base_url"] == "http://localhost:9000/v1"

    def test_claude_subscription_builds_isolated_agent(self, init_calls):
        from langchain_claude_agent_sdk import ChatClaudeAgent

        llm = build_model(multi_settings(), "claude")

        assert isinstance(llm, ChatClaudeAgent)
        assert llm.model == "sonnet"
        assert llm.append_system_prompt is False
        assert llm.max_turns == 1
        assert llm.extra_options == {
            "tools": [],
            "setting_sources": [],
            "mcp_servers": {},
            "strict_mcp_config": True,
        }
        assert init_calls == []

    def test_chatgpt_login_is_not_supported(self):
        with pytest.raises(SettingsError, match="not supported"):
            build_model(multi_settings(), "codex")

    def test_chatgpt_login_is_not_usable(self, no_keys):
        settings = multi_settings()

        assert usable_models(settings, "signal_tagging") == []
        assert task_available(settings, "signal_tagging") is False
        assert usable_models(settings, "genre_detection") == ["claude"]
