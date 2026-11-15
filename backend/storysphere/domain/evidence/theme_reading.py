"""`theme_reading` content (docs/spec/01 §6.3, method TM3).

對應舊模型 `TensionTheme`。Frye mythos、Booker plot 的清單在 config。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class ThemeReadingContent(EvidenceContent):
    claim_type: ClassVar[str] = "theme_reading"

    proposition: str
    frye_mythos: str | None = None
    booker_plot: str | None = None
    tension_line_ids: list[str] = Field(default_factory=list)
    supporting_ids: list[str] = Field(default_factory=list)
