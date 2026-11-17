"""Task routing: pipeline code only writes `llm_for("<task>")` (架構文件「Pipeline 模型配置」)."""

from __future__ import annotations

import os

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable
from pydantic import BaseModel

from storysphere.llm.settings import (
    LlmSettings,
    SettingsError,
    load_settings,
    provider_configured,
)


class LlmUnconfigured(Exception):
    """The task has no usable model (docs/spec/04 §1.6 → 503 `llm_unconfigured`)."""

    def __init__(self, task: str) -> None:
        self.task = task
        super().__init__(f"no usable model for task {task!r}")


def build_model(settings: LlmSettings, model_name: str) -> BaseChatModel:
    """依 provider 類型建出 chat model。key 在呼叫當下從環境變數讀，不進 log 或例外訊息。"""
    model = settings.models[model_name]
    provider = settings.providers[model.provider]

    if provider.type == "api_key":
        api_key = os.environ.get(provider.api_key_env or "")
        if not api_key:
            raise SettingsError(
                f"model {model_name!r}: environment variable {provider.api_key_env} is not set"
            )
        # model.id 帶 `<整合>:<模型>` 前綴，整合由前綴決定。
        return init_chat_model(model.id, api_key=api_key)

    if provider.type == "openai_compatible":
        api_key = os.environ.get(provider.api_key_env or "") or "not-needed"
        return init_chat_model(
            model.id, model_provider="openai", base_url=provider.base_url, api_key=api_key
        )

    if provider.via == "claude_agent_sdk":
        from langchain_claude_agent_sdk import ChatClaudeAgent

        # Pipeline 是單次 LLM 呼叫：harness 不帶工具、不讀使用者／專案設定、不接 MCP。
        return ChatClaudeAgent(
            model=model.id,
            append_system_prompt=False,
            max_turns=1,
            extra_options={
                "tools": [],
                "setting_sources": [],
                "mcp_servers": {},
                "strict_mcp_config": True,
            },
        )

    # chatgpt_login：接法待使用者決定，原型先不支援。
    raise SettingsError(
        f"model {model_name!r}: subscription via {provider.via!r} "
        "is not supported in this prototype yet"
    )


def _model_usable(settings: LlmSettings, model_name: str) -> bool:
    provider = settings.providers[settings.models[model_name].provider]
    if provider.type == "subscription" and provider.via == "chatgpt_login":
        return False
    return provider_configured(provider)


def usable_models(settings: LlmSettings, task: str) -> list[str]:
    """task 的主模型＋備援（依序），只留 provider 憑證到位的。"""
    config = settings.tasks.get(task)
    if config is None:
        return []
    return [name for name in (config.model, *config.fallback) if _model_usable(settings, name)]


def task_available(settings: LlmSettings, task: str) -> bool:
    return bool(usable_models(settings, task))


def llm_for(
    task: str,
    *,
    schema: type[BaseModel] | None = None,
    settings: LlmSettings | None = None,
) -> Runnable:
    """回傳這個 task 的 runnable；有備援時包成 fallback 鏈。

    `schema` 是參數而不是讓呼叫端自己接 `.with_structured_output()`：有備援時回傳的是
    `RunnableWithFallbacks`，它沒有 `with_structured_output`，所以要在組合之前逐一套到每個模型上。
    """
    if settings is None:
        settings = load_settings()
    names = usable_models(settings, task)
    if not names:
        raise LlmUnconfigured(task)
    runnables: list[Runnable] = []
    for name in names:
        llm = build_model(settings, name)
        runnables.append(llm.with_structured_output(schema) if schema is not None else llm)
    first, *rest = runnables
    return first.with_fallbacks(rest) if rest else first


def chat_model_for(
    task: str, *, settings: LlmSettings | None = None, model_name: str | None = None
) -> BaseChatModel:
    """單一個 chat model（不包 fallback 鏈）：給要 `bind_tools` 的大腦（deepagents）用。

    ``model_name`` 是 `models` 的 key，覆蓋 task 的設定（N-10a 的 `model`）；否則取第一個可用的。
    """
    if settings is None:
        settings = load_settings()
    if model_name is not None:
        if model_name not in settings.models or not _model_usable(settings, model_name):
            raise LlmUnconfigured(task)
        return build_model(settings, model_name)
    names = usable_models(settings, task)
    if not names:
        raise LlmUnconfigured(task)
    return build_model(settings, names[0])


def primary_model_id(settings: LlmSettings, task: str) -> str:
    """第一個可用模型的 `id`；呼叫端寫進 `runs.model`。"""
    names = usable_models(settings, task)
    if not names:
        raise LlmUnconfigured(task)
    return settings.models[names[0]].id
