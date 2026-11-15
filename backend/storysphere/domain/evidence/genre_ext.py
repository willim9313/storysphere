"""Genre-extension fields stored in `evidence_genre_ext` (docs/spec/01 §6.1–§6.2 推理擴充).

題材擴充欄位不屬於內容表，所以不放進各類型的 content model。
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart


class MysteryCharacterExt(ContentPart):
    """`character` 的推理擴充。不放「是否為犯人」——那是 `hidden_truth` 的內容。"""

    mystery_role: Literal["detective", "suspect", "victim", "witness", "accomplice", "other"]
    motive: str | None = None
    opportunity: str | None = None


class MysteryHiddenTruthExt(ContentPart):
    """`hidden_truth` 的推理擴充。"""

    case_type: Literal["murder", "theft", "disappearance", "fraud", "other"]
    mystery_type: Literal["whodunit", "howdunit", "whydunit"]
    victim_ids: list[str] = Field(default_factory=list)


# key＝(genre, claim_type)
GENRE_EXT_MODELS: dict[tuple[str, str], type[ContentPart]] = {
    ("mystery", "character"): MysteryCharacterExt,
    ("mystery", "hidden_truth"): MysteryHiddenTruthExt,
}
