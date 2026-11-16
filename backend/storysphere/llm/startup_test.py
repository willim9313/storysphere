"""初次啟動測試：每個模型跑連線、structured output、延遲（docs/spec/04 N-08c、05 §6）。"""

from __future__ import annotations

import os
import time
from collections.abc import Callable

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from storysphere.llm.router import build_model
from storysphere.llm.settings import LlmSettings, SettingsError


class _Probe(BaseModel):
    ok: bool


class _Result(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LlmTestRow(_Result):
    model: str
    provider: str
    connect: bool
    structured_output: bool
    latency_ms: int | None
    error: str | None
    affected_tasks: list[str]


class LlmTestResult(_Result):
    rows: list[LlmTestRow]
    no_usable_model: bool  # true 時 UI 引導 Ollama／vLLM


def _describe(exc: Exception, secret: str | None) -> str:
    # 例外訊息可能夾帶 key（有些 SDK 會把請求內容印出來）；先遮掉再截斷，免得截斷處留下半截 key。
    message = str(exc).replace(secret, "***") if secret else str(exc)
    return f"{type(exc).__name__}: {message[:200]}"


async def _test_model(
    settings: LlmSettings,
    name: str,
    build: Callable[[LlmSettings, str], BaseChatModel],
) -> LlmTestRow:
    model = settings.models[name]
    provider = settings.providers[model.provider]
    secret = os.environ.get(provider.api_key_env) if provider.api_key_env else None

    connect = structured = False
    latency_ms: int | None = None
    error: str | None = None
    try:
        # 建不出來（缺 key、不支援的 provider、缺整合套件）也算這一列失敗。
        llm = build(settings, name)
        started = time.perf_counter()
        await llm.ainvoke("ping")
        latency_ms = int((time.perf_counter() - started) * 1000)
        connect = True
    except Exception as exc:  # 任何失敗都記成一列，不中斷整張表
        error = _describe(exc, secret)

    if connect:
        try:
            probe = await llm.with_structured_output(_Probe).ainvoke(
                "Return a JSON object with the field ok set to true."
            )
            structured = isinstance(probe, _Probe)
            if not structured:
                error = "structured output did not match the probe schema"
        except Exception as exc:
            error = _describe(exc, secret)

    affected: list[str] = []
    if not (connect and structured):
        affected = sorted(
            task
            for task, config in settings.tasks.items()
            if name in (config.model, *config.fallback)
        )
    return LlmTestRow(
        model=name,
        provider=model.provider,
        connect=connect,
        structured_output=structured,
        latency_ms=latency_ms,
        error=error,
        affected_tasks=affected,
    )


async def run_llm_test(
    settings: LlmSettings,
    models: list[str] | None = None,
    *,
    build: Callable[[LlmSettings, str], BaseChatModel] = build_model,
) -> LlmTestResult:
    """逐一（不並行）測試模型；`build` 參數是給測試注入假模型用的。"""
    names = list(settings.models) if models is None else models
    unknown = [name for name in names if name not in settings.models]
    if unknown:
        raise SettingsError(f"unknown model(s): {unknown}")
    rows = [await _test_model(settings, name, build) for name in names]
    return LlmTestResult(
        rows=rows,
        no_usable_model=not any(row.connect and row.structured_output for row in rows),
    )
