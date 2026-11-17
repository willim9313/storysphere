"""N-08e–g：大腦設定與大腦測試（後端換成假的，不叫 LLM）。"""

from __future__ import annotations

import time

import pytest
import yaml
from storysphere.gateway import brain_test
from storysphere.llm.settings import SETTINGS_ENV

from tests.api.support import add_book, seed
from tests.api.test_agent import EchoBackend
from tests.store.conftest import BOOK

P = "/api/v2"


@pytest.fixture
def user_file(tmp_path, monkeypatch, client):
    """`var/settings.yaml` 還不存在的情況：寫入時要從預設檔補齊三層設定。"""
    path = tmp_path / "settings.yaml"
    monkeypatch.setenv(SETTINGS_ENV, str(path))
    return path


def wait_job(client, job_id: str) -> dict:
    deadline = time.monotonic() + 5
    while (job := client.get(f"{P}/jobs/{job_id}").json())["status"] not in ("done", "error"):
        assert time.monotonic() < deadline, job
        time.sleep(0.02)
    return job


class TestBrainSettings:
    def test_defaults(self, client):
        data = client.get(f"{P}/settings/brain").json()
        assert data == {
            "defaultBackend": "none",
            "deepagents": {"model": "flash"},
            "claudeCode": {
                "launchCommand": "npx -y @agentclientprotocol/claude-agent-acp",
                "available": None,
            },
        }

    def test_put_writes_brain_block_and_keeps_llm_settings(self, client, user_file):
        body = {
            "defaultBackend": "deepagents",
            "deepagents": {"model": "flash"},
            "claudeCode": {"launchCommand": "npx -y my-adapter"},
        }
        res = client.put(f"{P}/settings/brain", json=body)
        assert res.status_code == 200, res.text
        assert res.json()["defaultBackend"] == "deepagents"
        written = yaml.safe_load(user_file.read_text(encoding="utf-8"))
        assert written["brain"]["claude_code"]["launch_command"] == "npx -y my-adapter"
        assert written["tasks"]["brain"]["model"] == "flash"
        assert "gemini" in written["providers"]  # 從預設檔補齊，沒有被丟掉
        assert client.get(f"{P}/settings/llm").status_code == 200

    @pytest.mark.parametrize(
        "change",
        [
            {"deepagents": {"model": "nope"}},
            {"claudeCode": {"launchCommand": " "}},
            {"defaultBackend": "codex"},
            {"claudeCode": {"launchCommand": "x", "available": True}},
        ],
    )
    def test_bad_input_is_422_and_nothing_written(self, client, user_file, change):
        body = {
            "defaultBackend": "none",
            "deepagents": {"model": "flash"},
            "claudeCode": {"launchCommand": "npx x"},
        } | change
        assert client.put(f"{P}/settings/brain", json=body).status_code == 422
        assert not user_file.exists()


class TestBrainTest:
    def test_without_books_session_check_fails(self, client):
        res = client.post(f"{P}/settings/brain/test", json={"backend": "deepagents"})
        assert res.status_code == 202
        job = wait_job(client, res.json()["jobId"])
        assert job["kind"] == "brain_test"
        latest = client.get(f"{P}/settings/llm/test/latest").json()["brainTest"]
        assert latest["result"]["checks"] == [
            {"check": "session", "ok": False, "detail": "需要書庫裡至少有一本書"}
        ]

    def test_brain_that_never_calls_the_tool_fails_tool_call(self, client, db_file):
        seed(db_file, lambda store: add_book(store.session))
        backends = client.app.state.gateway.backends
        backends["deepagents"] = EchoBackend()
        res = client.post(f"{P}/settings/brain/test", json={"backend": "deepagents"})
        wait_job(client, res.json()["jobId"])
        result = client.get(f"{P}/settings/llm/test/latest").json()["brainTest"]["result"]
        assert [(c["check"], c["ok"]) for c in result["checks"]] == [
            ("session", True),
            ("tool_call", False),
        ]
        # 暫時 session 測完就關。
        sessions = client.get(f"{P}/books/{BOOK}/agent/sessions").json()
        assert all(s["status"] == "closed" for s in sessions)

    def test_claude_code_adapter_failure(self, client, db_file, monkeypatch):
        seed(db_file, lambda store: add_book(store.session))
        monkeypatch.setattr(brain_test, "claude_login_status", _logged_in)
        monkeypatch.setattr(brain_test.shutil, "which", lambda _cmd: "/usr/bin/npx")
        client.app.state.gateway.backends["claude-code"] = EchoBackend(fail=True)
        res = client.post(f"{P}/settings/brain/test", json={"backend": "claude-code"})
        wait_job(client, res.json()["jobId"])
        result = client.get(f"{P}/settings/llm/test/latest").json()["brainTest"]["result"]
        assert [(c["check"], c["ok"]) for c in result["checks"]] == [
            ("npx", True), ("login", True), ("adapter", False)
        ]
        assert "backend_start_failed" in result["checks"][2]["detail"]
        assert client.get(f"{P}/settings/brain").json()["claudeCode"]["available"] is False

    def test_claude_code_not_logged_in_stops_early(self, client, db_file, monkeypatch):
        seed(db_file, lambda store: add_book(store.session))

        async def logged_out():
            return False, "未登入"

        monkeypatch.setattr(brain_test, "claude_login_status", logged_out)
        monkeypatch.setattr(brain_test.shutil, "which", lambda _cmd: "/usr/bin/npx")
        res = client.post(f"{P}/settings/brain/test", json={"backend": "claude-code"})
        wait_job(client, res.json()["jobId"])
        result = client.get(f"{P}/settings/llm/test/latest").json()["brainTest"]["result"]
        assert [(c["check"], c["ok"]) for c in result["checks"]] == [("npx", True), ("login", False)]
        assert client.get(f"{P}/books/{BOOK}/agent/sessions").json() == []


async def _logged_in():
    return True, "已登入"
