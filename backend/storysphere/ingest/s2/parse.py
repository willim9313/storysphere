"""容錯讀取 S1 的原始輸出（02 §3）。

`raw_json` 沒驗證過：不是 dict、欄位缺、型別不對都要能活下來。這裡只做「取出該有的容器」，
壞掉的項目丟掉並記警告，不讓整個 S2 失敗。
"""

from __future__ import annotations

from typing import Any

from storysphere.ingest.s2.report import MALFORMED_ITEM, S2Report


def as_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def clean_str(value: Any) -> str | None:
    """Stripped non-empty string, or None."""
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def str_list(value: Any) -> list[str]:
    """A list of non-empty strings; a bare string counts as a one-item list."""
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [s for item in value if (s := clean_str(item)) is not None]


def list_items(
    raw: Any, key: str, report: S2Report, unit_id: str, *, required: bool = True
) -> list[dict[str, Any]]:
    """The dict items of ``raw[key]``; anything else is dropped with a warning."""
    container = as_dict(raw)
    if container is None:
        if raw is not None:
            report.warn(f"{unit_id}: output is not an object ({type(raw).__name__})")
        return []
    if key not in container:
        if required:
            report.warn(f"{unit_id}: output has no '{key}'")
        return []
    value = container[key]
    if not isinstance(value, list):
        report.warn(f"{unit_id}: '{key}' is not a list ({type(value).__name__})")
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            items.append(item)
        else:
            report.drop(MALFORMED_ITEM, f"{unit_id}: '{key}' item is not an object")
    return items
