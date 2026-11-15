"""`character` content (docs/spec/01 §6.1).

對應舊模型 `Entity`（只取 character／organization；`organization` → `kind=group`）。
推理擴充欄位（`mystery_role` 等）不在這裡，見 `genre_ext.py`。
"""

from __future__ import annotations

from typing import Any, ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class CharacterContent(EvidenceContent):
    claim_type: ClassVar[str] = "character"

    canonical_name: str
    kind: Literal["person", "group", "animal"]
    aliases: list[str] = Field(default_factory=list)
    description: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    first_chapter: int | None = None
    last_chapter: int | None = None
    mention_count: int = Field(default=0, ge=0)
