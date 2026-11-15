"""`anachrony` content (docs/spec/01 §6.3, method NS2).

每事件一筆。對應舊模型 `TemporalDisplacement`、`TemporalAnalysis`。
`story_rank` 與外殼欄位同名，是規格 §6.3 明列的內容欄位。
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from storysphere.domain.evidence.base import EvidenceContent


class AnachronyContent(EvidenceContent):
    claim_type: ClassVar[str] = "anachrony"

    event_id: str
    text_rank: int = Field(ge=1)
    story_rank: float
    # story_rank - text_rank；負值＝倒敘
    displacement: float
    displacement_type: Literal["analepsis", "prolepsis", "linear"]
