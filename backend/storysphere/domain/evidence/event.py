"""`event` content (docs/spec/01 §6.1).

對應舊模型 `Event`；拿掉 `narrative_weight`（改由 EV1 產出）與 `chron_index`（改由 NS2 產出）。
參與者不在內容裡，放外殼的 subjects（role=`participant`）。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class EventContent(EvidenceContent):
    claim_type: ClassVar[str] = "event"

    title: str
    event_type: Literal[
        "plot",
        "conflict",
        "revelation",
        "turning_point",
        "meeting",
        "battle",
        "death",
        "romance",
        "alliance",
        "other",
    ]
    description: str
    chapter: int
    # 全書敘述順序，1 起算
    text_rank: int = Field(ge=1)
    narrative_mode: Literal["present", "flashback", "flashforward", "parallel", "unknown"] = (
        "unknown"
    )
    story_time_hint: str | None = None
    significance: str | None = None
    consequences: list[str] = Field(default_factory=list)
    visibility: Literal["public", "private", "secret"] = "public"
    tension_signal: Literal["none", "potential", "explicit"] = "none"
    emotional_intensity: float | None = Field(default=None, ge=0, le=1)
    emotional_valence: Literal["positive", "negative", "mixed", "neutral"] | None = None
