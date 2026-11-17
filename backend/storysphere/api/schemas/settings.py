"""Schemas of the LLM settings endpoints (docs/spec/04 N-08a–N-08d).

金鑰只以環境變數「名稱」出現；回應不含 key 值。
"""

from __future__ import annotations

from typing import Any

from pydantic import ConfigDict

from storysphere.api.schemas.common import ApiModel, UtcDatetime
from storysphere.llm.startup_test import LlmTestResult


class ProviderOut(ApiModel):
    name: str
    type: str  # api_key／subscription／openai_compatible
    api_key_env: str | None
    configured: bool  # 推得：環境變數有沒有值（訂閱來源一律 true，登入狀態由測試驗）
    via: str | None
    base_url: str | None
    risk_notice: str | None  # 推得：subscription 才有


class ModelOut(ApiModel):
    name: str
    provider: str
    model_id: str  # `<整合>:<模型>`，例如 google_genai:gemini-2.5-flash
    caps: list[str]


class TaskOut(ApiModel):
    task: str
    model: str | None  # 設定檔沒有這個 task 時是 null
    fallback: list[str]
    requires: list[str]
    caps_ok: bool  # 推得：主模型與備援都具備 requires 的能力


class LlmSettingsOut(ApiModel):
    """N-08a。"""

    providers: list[ProviderOut]
    models: list[ModelOut]
    tasks: list[TaskOut]


class _In(ApiModel):
    # 多出來的 key 拒絕；N-08a 的推得欄位（configured、riskNotice、capsOk）允許帶回來但不採用。
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ProviderIn(_In):
    name: str
    type: str
    api_key_env: str | None = None
    via: str | None = None
    base_url: str | None = None
    configured: Any = None
    risk_notice: Any = None


class ModelIn(_In):
    name: str
    provider: str
    model_id: str
    caps: list[str] = []


class TaskIn(_In):
    task: str
    model: str | None
    fallback: list[str] = []
    requires: list[str] = []
    caps_ok: Any = None


class LlmSettingsIn(_In):
    """N-08b：N-08a 的形狀。"""

    providers: list[ProviderIn]
    models: list[ModelIn]
    tasks: list[TaskIn]


class LlmTestIn(_In):
    models: list[str] | None = None  # 省略＝全部模型


class LatestTest(ApiModel):
    # 大腦測試（T25）的形狀不同，到時再改成 union。
    result: LlmTestResult | None
    finished_at: UtcDatetime | None


class LatestTests(ApiModel):
    """N-08d：沒測過的是 null。大腦測試（brain_test）在 T25 之後才有。"""

    llm_test: LatestTest | None
    brain_test: LatestTest | None
