"""Base class for evidence content models (docs/spec/01 §6–§7).

每種證據類型一個 `EvidenceContent` 子類，放在 `domain/evidence/<claim_type>.py`。
Pydantic model 為準：內容表 `ev_<claim_type>` 由它產生（`store/content_tables.py`）。
"""

from __future__ import annotations

import types
from typing import Any, ClassVar, Literal, Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, model_validator

OTHER = "other"


class ContentPart(BaseModel):
    """Nested object inside a content field (stored as JSON), e.g. `pole_a`, `misbeliefs[]`."""

    model_config = ConfigDict(extra="forbid")


def _literal_values(annotation: Any) -> tuple[Any, ...] | None:
    """Return the allowed values if `annotation` is `Literal[...]` or `Literal[...] | None`."""
    origin = get_origin(annotation)
    if origin is Literal:
        return get_args(annotation)
    if origin in (Union, types.UnionType):
        for arg in get_args(annotation):
            if get_origin(arg) is Literal:
                return get_args(arg)
    return None


class EvidenceContent(BaseModel):
    """Content fields of one claim type.

    枚舉用 `Literal[...]`。LLM 給出不在枚舉內的字串時：枚舉含 `"other"` 就改成 `"other"`，
    原字串留在 `raw_label`（01 §6 共同慣例）；枚舉不含 `"other"` 則照常驗證失敗。
    """

    model_config = ConfigDict(extra="forbid")

    claim_type: ClassVar[str]

    raw_label: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_unknown_enum_to_other(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        coerced: list[str] = []
        patched = dict(data)
        for name, field in cls.model_fields.items():
            allowed = _literal_values(field.annotation)
            value = patched.get(name)
            if allowed and OTHER in allowed and isinstance(value, str) and value not in allowed:
                patched[name] = OTHER
                coerced.append(value)
        if coerced and not patched.get("raw_label"):
            patched["raw_label"] = " | ".join(coerced)
        return patched
