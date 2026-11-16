"""S1 stage：假 llm 回 `AIMessage`，檢查 prompt 組裝、JSON 解析與必要 key。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage
from storysphere.ingest import s1
from storysphere.ingest.s1 import S1A_KEYS, S1B_KEYS, build_s1_stages, make_stage
from storysphere.ingest.units import IngestUnit, UnitParagraph
from storysphere.llm.errors import LLMResponseBlocked
from storysphere.llm.prompts import load_prompt
from storysphere.llm.settings import DEFAULT_SETTINGS_PATH, load_settings

FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"


def sample_text(task: str) -> str:
    return json.loads((FIXTURES / task / "sample.json").read_text(encoding="utf-8"))["response_text"]


class FakeLlm:
    def __init__(self, text: str) -> None:
        self.text = text
        self.messages: list = []

    async def ainvoke(self, messages):
        self.messages = messages
        return AIMessage(content=self.text)


def unit(context: str | None = "前一段。", language: str = "zh-TW") -> IngestUnit:
    return IngestUnit(
        id="b:1:0",
        book_id="b",
        chapter=1,
        language=language,
        paragraphs=(UnitParagraph("p0", "第一段。"), UnitParagraph("p1", "第二段。")),
        context_only=UnitParagraph("p-1", context) if context is not None else None,
    )


def stage_a(llm):
    return make_stage("s1a", load_prompt("ingest/core_extraction"), llm, "m", S1A_KEYS)


class TestMakeStage:
    async def test_plain_json(self):
        stage = stage_a(FakeLlm(sample_text("core_extraction")))
        data = await stage.call(unit())
        assert set(S1A_KEYS) <= set(data)
        assert data["characters"][0]["name"] == "林默"

    async def test_fenced_json_for_s1b(self):
        text = sample_text("signal_tagging")
        assert text.startswith("```json")
        stage = make_stage("s1b", load_prompt("ingest/signal_tagging"), FakeLlm(text), "m", S1B_KEYS)
        assert set(S1B_KEYS) <= set(await stage.call(unit()))

    async def test_not_json(self):
        with pytest.raises(ValueError, match="no parsable JSON"):
            await stage_a(FakeLlm("抱歉，我無法處理。")).call(unit())

    async def test_not_an_object(self):
        with pytest.raises(ValueError, match="JSON object"):
            await stage_a(FakeLlm("[1, 2]")).call(unit())

    async def test_missing_key(self):
        text = json.dumps({"characters": [], "events": [], "utterances": []})
        with pytest.raises(ValueError, match="relation_states"):
            await stage_a(FakeLlm(text)).call(unit())

    async def test_error_message_is_truncated(self):
        with pytest.raises(ValueError) as info:
            await stage_a(FakeLlm("x" * 5000)).call(unit())
        assert len(str(info.value)) < 400

    async def test_empty_response_is_blocked(self):
        with pytest.raises(LLMResponseBlocked):
            await stage_a(FakeLlm("")).call(unit())

    async def test_messages_carry_context_passage_and_language(self):
        llm = FakeLlm(sample_text("core_extraction"))
        await stage_a(llm).call(unit())
        system, human = llm.messages
        assert "Traditional Chinese" in system.content
        assert "CONTEXT:\n前一段。" in human.content
        assert "PASSAGE:\n第一段。\n\n第二段。" in human.content

    async def test_no_context_is_none_marker(self):
        llm = FakeLlm(sample_text("core_extraction"))
        await stage_a(llm).call(unit(context=None))
        assert "CONTEXT:\n(none)" in llm.messages[1].content

    def test_stage_carries_model_and_prompt_version(self):
        stage = stage_a(FakeLlm(""))
        assert (stage.name, stage.model, stage.prompt_version) == ("s1a", "m", "1")


class TestBuildS1Stages:
    def test_two_stages(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        settings = load_settings(DEFAULT_SETTINGS_PATH)
        tasks: list[str] = []

        def fake_llm_for(task, *, settings=None):
            tasks.append(task)
            return FakeLlm("")

        monkeypatch.setattr(s1, "llm_for", fake_llm_for)
        stages = build_s1_stages(settings)

        assert tasks == ["core_extraction", "signal_tagging"]
        assert [s.name for s in stages] == ["s1a", "s1b"]
        assert all(s.prompt_version == "1" for s in stages)
        assert all(s.model for s in stages)
