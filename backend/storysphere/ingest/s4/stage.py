"""S4a 單位抽取（02 §6）：`UnitStage(name="s4a")`，每個被選中的單位一次 LLM 呼叫。

只取回並解析 JSON、檢查最外層 key，原樣存進 `ingest_unit_outputs`；驗證與正規化在 S4b 之前
的候選組裝（`candidates.py`）。
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.ingest.s4.plan import S4Plan
from storysphere.ingest.unit_runner import UnitStage
from storysphere.ingest.units import IngestUnit
from storysphere.llm.errors import llm_text
from storysphere.llm.json_output import extract_json_from_text
from storysphere.llm.prompts import Prompt

STAGE_NAME = "s4a"
COMMON_KEYS = ("hidden_truth", "reveal")
MYSTERY_KEYS = ("clue_points_to", "trick")
_SNIPPET_CHARS = 200


def stage_prompt_version(deep: Prompt, mystery: Prompt | None) -> str:
    """有推理擴充時看得出兩份 prompt 的版本，例：`"1+m1"`。"""
    return deep.version if mystery is None else f"{deep.version}+m{mystery.version}"


def required_keys(mystery: bool) -> tuple[str, ...]:
    return COMMON_KEYS + (MYSTERY_KEYS if mystery else ())


def make_s4a_stage(
    plan: S4Plan,
    deep: Prompt,
    mystery_prompt: Prompt | None,
    llm: Any,
    model: str | None,
) -> UnitStage:
    """``llm`` 是任何有 async ``ainvoke(messages)`` 的物件。"""
    language_name = get_language_display_name(plan.language)
    # 擴充段裡也有 {{language_name}}，要先自己填好再塞進主 prompt（載入器只代換一次）。
    extension = mystery_prompt.render(language_name=language_name)[0] if mystery_prompt else ""
    characters = plan.characters.prompt_lines(with_aliases=True)
    keys = required_keys(mystery_prompt is not None)

    async def call(unit: IngestUnit) -> dict[str, Any]:
        system, user = deep.render(
            language_name=language_name,
            mystery_extension=extension,
            characters=characters,
            unit_signals=plan.signals.get(unit.id, "(none)"),
            unit_text="\n\n".join(p.text for p in unit.paragraphs),
        )
        text = llm_text(await llm.ainvoke([SystemMessage(system), HumanMessage(user)]))
        data, error = extract_json_from_text(text)
        if data is None:
            snippet = text[:_SNIPPET_CHARS]
            raise ValueError(f"s4a: no parsable JSON ({error}); response starts: {snippet!r}")
        if not isinstance(data, dict):
            raise ValueError(f"s4a: expected a JSON object, got {type(data).__name__}")
        missing = [k for k in keys if k not in data]
        if missing:
            raise ValueError(f"s4a: response is missing keys {missing}")
        return data

    return UnitStage(
        name=STAGE_NAME,
        call=call,
        model=model,
        prompt_version=stage_prompt_version(deep, mystery_prompt),
    )
