from __future__ import annotations

import pytest
from storysphere.llm.settings import LlmSettings, SettingsError
from storysphere.llm.startup_test import LlmTestResult, _Probe, run_llm_test

KEY = "test-key-123"


class FakeLlm:
    """假模型：可指定連線或 structured output 那一步要丟的例外／回傳值。"""

    def __init__(self, *, connect_error=None, structured_error=None, structured_result=None):
        self.connect_error = connect_error
        self.structured_error = structured_error
        self.structured_result = _Probe(ok=True) if structured_result is None else structured_result
        self.structured_called = False

    async def ainvoke(self, _prompt):
        if self.connect_error:
            raise self.connect_error
        return "pong"

    def with_structured_output(self, schema):
        assert schema is _Probe
        outer = self

        class Bound:
            async def ainvoke(self, _prompt):
                outer.structured_called = True
                if outer.structured_error:
                    raise outer.structured_error
                return outer.structured_result

        return Bound()


def make_settings() -> LlmSettings:
    return LlmSettings.model_validate(
        {
            "providers": {
                "gemini": {"type": "api_key", "api_key_env": "GEMINI_API_KEY"},
                "local-vllm": {"type": "openai_compatible", "base_url": "http://localhost:8000/v1"},
            },
            "models": {
                "flash": {"provider": "gemini", "id": "google_genai:gemini-2.5-flash"},
                "local": {"provider": "local-vllm", "id": "qwen3-32b"},
            },
            "tasks": {
                "signal_tagging": {"model": "flash"},
                "core_extraction": {"model": "flash", "fallback": ["local"]},
                "deep_extraction": {"model": "local"},
            },
        }
    )


def builder(fakes: dict):
    def build(_settings, name):
        fake = fakes[name]
        if isinstance(fake, Exception):
            raise fake
        return fake

    return build


@pytest.fixture(autouse=True)
def gemini_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", KEY)


class TestRunLlmTest:
    async def test_all_pass(self):
        result = await run_llm_test(
            make_settings(), build=builder({"flash": FakeLlm(), "local": FakeLlm()})
        )

        assert [row.model for row in result.rows] == ["flash", "local"]
        row = result.rows[0]
        assert row.provider == "gemini"
        assert row.connect is True
        assert row.structured_output is True
        assert isinstance(row.latency_ms, int) and row.latency_ms >= 0
        assert row.error is None
        assert row.affected_tasks == []
        assert result.no_usable_model is False

    async def test_connect_failure_skips_structured_output(self):
        fake = FakeLlm(connect_error=ConnectionError("refused"))

        result = await run_llm_test(
            make_settings(), build=builder({"flash": fake, "local": FakeLlm()})
        )

        row = result.rows[0]
        assert row.connect is False
        assert row.structured_output is False
        assert row.latency_ms is None
        assert row.error == "ConnectionError: refused"
        assert row.affected_tasks == ["core_extraction", "signal_tagging"]
        assert fake.structured_called is False
        assert result.no_usable_model is False

    async def test_structured_output_failure(self):
        fake = FakeLlm(structured_error=ValueError("bad json"))

        result = await run_llm_test(make_settings(), ["local"], build=builder({"local": fake}))

        row = result.rows[0]
        assert row.connect is True
        assert row.structured_output is False
        assert row.latency_ms is not None
        assert row.error == "ValueError: bad json"
        assert row.affected_tasks == ["core_extraction", "deep_extraction"]
        assert result.no_usable_model is True

    async def test_structured_output_of_wrong_type_fails(self):
        fake = FakeLlm(structured_result={"ok": True})

        result = await run_llm_test(make_settings(), ["local"], build=builder({"local": fake}))

        assert result.rows[0].structured_output is False
        assert result.rows[0].error is not None

    async def test_build_failure_is_a_failed_row(self):
        result = await run_llm_test(
            make_settings(),
            build=builder({"flash": SettingsError("no key"), "local": ImportError("no pkg")}),
        )

        assert [row.connect for row in result.rows] == [False, False]
        assert result.rows[0].error == "SettingsError: no key"
        assert result.rows[1].error == "ImportError: no pkg"
        assert result.no_usable_model is True

    async def test_error_text_is_redacted_and_truncated(self):
        fake = FakeLlm(connect_error=RuntimeError(f"401 for key={KEY} " + "x" * 500))

        result = await run_llm_test(make_settings(), ["flash"], build=builder({"flash": fake}))

        error = result.rows[0].error
        assert KEY not in error
        assert "key=***" in error
        assert len(error) <= len("RuntimeError: ") + 200

    async def test_models_filter(self):
        result = await run_llm_test(make_settings(), ["local"], build=builder({"local": FakeLlm()}))

        assert [row.model for row in result.rows] == ["local"]

    async def test_unknown_model_name(self):
        with pytest.raises(SettingsError, match="nope"):
            await run_llm_test(make_settings(), ["nope"], build=builder({}))

    async def test_default_build_reports_missing_key(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY")

        result = await run_llm_test(make_settings(), ["flash"])

        assert result.rows[0].connect is False
        assert result.rows[0].error.startswith("SettingsError")


class TestResultShape:
    async def test_dump_by_alias_matches_n08c(self):
        result = await run_llm_test(
            make_settings(), ["local"], build=builder({"local": FakeLlm()})
        )

        dumped = result.model_dump(by_alias=True)

        assert set(dumped) == {"rows", "noUsableModel"}
        assert set(dumped["rows"][0]) == {
            "model",
            "provider",
            "connect",
            "structuredOutput",
            "latencyMs",
            "error",
            "affectedTasks",
        }
        assert LlmTestResult.model_validate(dumped) == result
