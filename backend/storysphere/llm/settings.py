"""LLM settings: provider → model → task (docs/spec/04 N-08a, 架構文件「Pipeline 模型配置」)."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal, get_args

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from storysphere.registry.models import LlmTask

# backend/storysphere/llm/settings.py → repo 根目錄
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SETTINGS_PATH = REPO_ROOT / "config" / "settings.default.yaml"
SETTINGS_ENV = "STORYSPHERE_SETTINGS"

Cap = Literal["structured_output", "long_context", "reasoning"]

# 02 §11 的 5 個入庫 task。
INGEST_TASKS: tuple[str, ...] = (
    "core_extraction",
    "signal_tagging",
    "genre_detection",
    "deep_extraction",
    "consolidation",
)
# 加上 03 方法用到的 llm_task。
KNOWN_TASKS: tuple[str, ...] = INGEST_TASKS + get_args(LlmTask)

# 環境變數「名稱」的樣子；貼進 key 值（含小寫、連字號）會被擋下。
_ENV_NAME = re.compile(r"^[A-Z_][A-Z0-9_]*$")

SUBSCRIPTION_RISK_NOTICE = (
    "訂閱來源有條款風險：訂閱登入以一般個人使用為前提，整本書的批次入庫超出這個範圍，"
    "服務方可不另行通知就限制或變更政策。訂閱另有用量時間窗，入庫途中可能撞到上限而暫停，"
    "可用模型也受方案限制。發生時請把 task 改指到 API key 或本地模型。"
)


class SettingsError(Exception):
    """The settings file is unreadable, malformed, or fails a check."""


class _Config(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProviderConfig(_Config):
    type: Literal["api_key", "subscription", "openai_compatible"]
    api_key_env: str | None = None  # 只存環境變數名，不存 key
    via: Literal["chatgpt_login", "claude_agent_sdk"] | None = None
    base_url: str | None = None


class ModelConfig(_Config):
    provider: str
    id: str
    caps: list[Cap] = Field(default_factory=list)


class TaskConfig(_Config):
    model: str
    fallback: list[str] = Field(default_factory=list)
    requires: list[Cap] = Field(default_factory=list)


class LlmSettings(BaseModel):
    # 其他頂層 key（例如之後的 `brain:`）不歸這裡管，略過。
    model_config = ConfigDict(extra="ignore")

    providers: dict[str, ProviderConfig] = Field(default_factory=dict)
    models: dict[str, ModelConfig] = Field(default_factory=dict)
    tasks: dict[str, TaskConfig] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_structure(self) -> LlmSettings:
        problems: list[str] = []
        for name, provider in self.providers.items():
            if provider.type == "api_key" and not provider.api_key_env:
                problems.append(f"provider {name!r}: type api_key requires api_key_env")
            if provider.type == "subscription" and not provider.via:
                problems.append(f"provider {name!r}: type subscription requires via")
            if provider.type == "openai_compatible" and not provider.base_url:
                problems.append(f"provider {name!r}: type openai_compatible requires base_url")
            if provider.api_key_env is not None and not _ENV_NAME.match(provider.api_key_env):
                # 不把值印出來：它可能就是一把 key。
                problems.append(
                    f"provider {name!r}: api_key_env must be an environment variable name, "
                    "not a key value"
                )
        for name, model in self.models.items():
            if model.provider not in self.providers:
                problems.append(f"model {name!r}: unknown provider {model.provider!r}")
        for name, task in self.tasks.items():
            if name not in KNOWN_TASKS:
                problems.append(f"task {name!r}: unknown task name")
            for model_name in (task.model, *task.fallback):
                if model_name not in self.models:
                    problems.append(f"task {name!r}: unknown model {model_name!r}")
        if problems:
            raise ValueError("; ".join(problems))
        return self


def settings_path() -> Path:
    """使用者設定檔的位置：`STORYSPHERE_SETTINGS`，否則 `var/settings.yaml`。"""
    override = os.environ.get(SETTINGS_ENV)
    return Path(override) if override else REPO_ROOT / "var" / "settings.yaml"


def load_settings(path: Path | None = None) -> LlmSettings:
    """讀設定檔；檔案不存在時改讀 repo 的預設檔，不自動建檔（N-08b 才寫入 `var/`）。"""
    target = path if path is not None else settings_path()
    if not target.exists():
        target = DEFAULT_SETTINGS_PATH
    try:
        data = yaml.safe_load(target.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise SettingsError(f"{target}: cannot read settings: {exc}") from exc
    if not isinstance(data, dict):
        raise SettingsError(f"{target}: settings must be a mapping at the top level")
    try:
        return LlmSettings.model_validate(data)
    except ValidationError as exc:
        # 只列位置與訊息，不帶輸入值（輸入值可能是誤貼的 key）。
        lines = [
            f"{'.'.join(str(part) for part in error['loc']) or '<root>'}: {error['msg']}"
            for error in exc.errors()
        ]
        raise SettingsError(f"{target}: invalid settings:\n" + "\n".join(lines)) from None


def _task_caps_problems(settings: LlmSettings, task: str) -> list[str]:
    config = settings.tasks[task]
    problems: list[str] = []
    for model_name in (config.model, *config.fallback):
        missing = sorted(set(config.requires) - set(settings.models[model_name].caps))
        if missing:
            problems.append(f"task {task!r}: model {model_name!r} lacks caps {missing}")
    return problems


def caps_problems(settings: LlmSettings) -> list[str]:
    """task 的 `requires` 與模型 `caps` 不符的清單；主模型與每個備援都檢查。"""
    return [problem for task in settings.tasks for problem in _task_caps_problems(settings, task)]


def caps_ok(settings: LlmSettings, task: str) -> bool:
    return not _task_caps_problems(settings, task)


def check_capabilities(settings: LlmSettings) -> None:
    """能力檢查（架構文件「能力檢查」）：不符就直接報錯。"""
    problems = caps_problems(settings)
    if problems:
        raise SettingsError("capability mismatch:\n" + "\n".join(problems))


def provider_configured(provider: ProviderConfig) -> bool:
    """憑證是否到位。訂閱的登入狀態由初次啟動測試驗證，這裡不查。"""
    if provider.type == "api_key":
        return bool(os.environ.get(provider.api_key_env or ""))
    return True
