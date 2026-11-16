"""S1 核心抽取＋訊號標記（02 §3）：每個單位兩次 LLM 呼叫，`s1a` 與 `s1b` 兩個 stage。

這裡只取回並解析 JSON、檢查必要 key，原樣存進 `ingest_unit_outputs.raw_json`；
Pydantic 驗證與正規化是 S2 的事。
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.ingest.unit_runner import UnitStage
from storysphere.ingest.units import IngestUnit
from storysphere.llm.errors import llm_text
from storysphere.llm.json_output import extract_json_from_text
from storysphere.llm.prompts import Prompt, load_prompt
from storysphere.llm.router import llm_for, primary_model_id
from storysphere.llm.settings import LlmSettings, load_settings

S1A_KEYS = ("characters", "events", "relation_states", "utterances")
S1B_KEYS = ("focalization", "imagery", "book_setting_hints", "signals")

_NO_CONTEXT = "(none)"
_SNIPPET_CHARS = 200


def _snippet(text: str) -> str:
    return text[:_SNIPPET_CHARS] + ("…" if len(text) > _SNIPPET_CHARS else "")


def make_stage(
    name: str,
    prompt: Prompt,
    llm: Any,
    model: str | None,
    required_keys: tuple[str, ...],
) -> UnitStage:
    """One S1 stage; ``llm`` is anything with an async ``ainvoke(messages)``."""

    async def call(unit: IngestUnit) -> dict[str, Any]:
        system, user = prompt.render(
            language_name=get_language_display_name(unit.language),
            context_text=unit.context_only.text if unit.context_only else _NO_CONTEXT,
            unit_text="\n\n".join(p.text for p in unit.paragraphs),
        )
        response = await llm.ainvoke([SystemMessage(system), HumanMessage(user)])
        text = llm_text(response)

        data, error = extract_json_from_text(text)
        if data is None:
            raise ValueError(f"{name}: no parsable JSON ({error}); response starts: {_snippet(text)!r}")
        if not isinstance(data, dict):
            raise ValueError(f"{name}: expected a JSON object, got {type(data).__name__}")
        missing = [k for k in required_keys if k not in data]
        if missing:
            raise ValueError(f"{name}: response is missing keys {missing}")
        return data

    return UnitStage(name=name, call=call, model=model, prompt_version=prompt.version)


def build_s1_stages(settings: LlmSettings | None = None) -> list[UnitStage]:
    """`s1a`（核心抽取）與 `s1b`（訊號標記）。沒有可用模型時丟 `LlmUnconfigured`。"""
    if settings is None:
        settings = load_settings()
    stages: list[UnitStage] = []
    for name, prompt_name, keys in (
        ("s1a", "ingest/core_extraction", S1A_KEYS),
        ("s1b", "ingest/signal_tagging", S1B_KEYS),
    ):
        prompt = load_prompt(prompt_name)
        llm = llm_for(prompt.task, settings=settings)
        model = primary_model_id(settings, prompt.task)
        stages.append(make_stage(name, prompt, llm, model, keys))
    return stages
