"""N-08a–N-08d：LLM 設定與初次啟動測試。寫入一律指到 tmp_path，不碰 repo 的預設檔。"""

from __future__ import annotations

import time

import pytest
import yaml
from storysphere.api.routes import settings as settings_routes
from storysphere.llm.settings import DEFAULT_SETTINGS_PATH, SETTINGS_ENV
from storysphere.llm.startup_test import LlmTestResult, LlmTestRow

from tests.api.support import P

SUBSCRIPTION = """
providers:
  gemini: { type: api_key, api_key_env: GEMINI_API_KEY }
  claude: { type: subscription, via: claude_agent_sdk }
models:
  flash: { provider: gemini, id: "google_genai:gemini-2.5-flash", caps: [structured_output] }
tasks:
  core_extraction: { model: flash, requires: [structured_output] }
brain: { default_backend: none }
"""


@pytest.fixture
def settings_file(tmp_path, monkeypatch, client):
    path = tmp_path / "settings.yaml"
    path.write_text(SUBSCRIPTION, encoding="utf-8")
    monkeypatch.setenv(SETTINGS_ENV, str(path))
    return path


class TestGetSettings:
    def test_default_file_when_there_is_no_user_file(self, client, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "x")
        body = client.get(f"{P}/settings/llm").json()
        (provider,) = body["providers"]
        assert provider == {"name": "gemini", "type": "api_key", "apiKeyEnv": "GEMINI_API_KEY",
                            "configured": True, "via": None, "baseUrl": None, "riskNotice": None}  # fmt: skip
        assert body["models"][0]["modelId"] == "google_genai:gemini-2.5-flash"
        assert {t["task"] for t in body["tasks"]} >= {"core_extraction", "method_strong", "method_light"}

    def test_key_value_is_never_returned(self, client, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "secret-value-123")
        assert "secret-value-123" not in client.get(f"{P}/settings/llm").text

    def test_unconfigured_key_and_subscription_notice(self, settings_file, client, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        body = client.get(f"{P}/settings/llm").json()
        providers = {p["name"]: p for p in body["providers"]}
        assert providers["gemini"]["configured"] is False
        assert providers["claude"]["riskNotice"] and providers["claude"]["via"] == "claude_agent_sdk"
        tasks = {t["task"]: t for t in body["tasks"]}
        assert tasks["core_extraction"]["capsOk"] is True
        # 設定檔沒寫的 task 也列出來
        assert tasks["method_light"] == {"task": "method_light", "model": None, "fallback": [],
                                         "requires": [], "capsOk": False}  # fmt: skip


class TestPutSettings:
    def test_round_trip_writes_the_file_and_keeps_other_keys(self, settings_file, client):
        body = client.get(f"{P}/settings/llm").json()
        body["models"].append({"name": "pro", "provider": "gemini",
                               "modelId": "google_genai:gemini-2.5-pro", "caps": ["structured_output"]})
        for task in body["tasks"]:
            if task["task"] == "method_strong":
                task.update(model="pro", requires=["structured_output"])
        client.app.state.ingest_service = object()  # 舊設定建的服務

        response = client.put(f"{P}/settings/llm", json=body)  # 推得欄位帶回來也可以
        assert response.status_code == 200
        saved = yaml.safe_load(settings_file.read_text(encoding="utf-8"))
        assert saved["tasks"]["method_strong"] == {"model": "pro", "fallback": [], "requires": ["structured_output"]}
        assert saved["brain"] == {"default_backend": "none"}  # 這個端點不管的 key 留著
        assert "method_light" not in saved["tasks"]  # 沒指定模型的 task 不寫
        assert client.app.state.ingest_service is None
        assert client.get(f"{P}/settings/llm").json() == response.json()

    @pytest.mark.parametrize(
        ("change", "expected"),
        [
            (lambda b: b["providers"][0].update(apiKeyEnv="AIzaSy-real-key"), "environment variable name"),
            (lambda b: b["tasks"][0].update(model="missing"), "unknown model"),
            (lambda b: b["models"][0].update(caps=[]), "lacks caps"),
            (lambda b: b["providers"][0].update(apiKey="AIzaSy"), "apiKey"),
        ],
    )
    def test_bad_settings_are_422_and_nothing_is_written(self, settings_file, client, change, expected):
        body = client.get(f"{P}/settings/llm").json()
        change(body)
        response = client.put(f"{P}/settings/llm", json=body)
        assert response.status_code == 422 and expected in response.json()["detail"]
        assert "AIzaSy" not in response.text  # 誤貼的 key 不會被回顯
        assert settings_file.read_text(encoding="utf-8") == SUBSCRIPTION

    def test_writes_go_to_the_user_file_not_the_repo_default(self, settings_file, client):
        before = DEFAULT_SETTINGS_PATH.read_text(encoding="utf-8")
        client.put(f"{P}/settings/llm", json=client.get(f"{P}/settings/llm").json())
        assert DEFAULT_SETTINGS_PATH.read_text(encoding="utf-8") == before


def _fake_result(models):
    return LlmTestResult(
        rows=[LlmTestRow(model=name, provider="gemini", connect=True, structured_output=True,
                         latency_ms=12, error=None, affected_tasks=["core_extraction"])
              for name in models or ["flash"]],
        no_usable_model=False,
    )  # fmt: skip


class TestLlmTest:
    def test_runs_as_a_job_and_shows_up_as_latest(self, client, monkeypatch):
        calls = []

        async def fake(settings, models):
            calls.append(models)
            return _fake_result(models)

        monkeypatch.setattr(settings_routes, "run_llm_test", fake)
        assert client.get(f"{P}/settings/llm/test/latest").json() == {"llmTest": None, "brainTest": None}

        response = client.post(f"{P}/settings/llm/test", json={"models": ["flash"]})
        assert response.status_code == 202
        job_id = response.json()["jobId"]
        deadline = time.monotonic() + 5
        while (job := client.get(f"{P}/jobs/{job_id}").json())["status"] != "done":
            assert time.monotonic() < deadline, job
            time.sleep(0.02)
        assert job["kind"] == "llm_test" and calls == [["flash"]]

        latest = client.get(f"{P}/settings/llm/test/latest").json()
        row = latest["llmTest"]["result"]["rows"][0]
        assert row["structuredOutput"] is True and row["latencyMs"] == 12
        assert latest["llmTest"]["finishedAt"].endswith("Z") and latest["brainTest"] is None

    def test_unknown_model_is_422(self, client):
        response = client.post(f"{P}/settings/llm/test", json={"models": ["nope"]})
        assert response.status_code == 422 and client.get(f"{P}/jobs").json() == []
