"""`voice_profile` content (docs/spec/01 §6.3, method CH3).

對應舊模型 `VoiceProfile`（`paragraphs_analyzed` 改成 `utterances_analyzed`）。
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from storysphere.domain.evidence.base import ContentPart, EvidenceContent


class ToneSegment(ContentPart):
    """語氣分布的一段；各段 `value` 加總約為 1。"""

    label: str
    value: float = Field(ge=0, le=1)


class VoiceProfileContent(EvidenceContent):
    claim_type: ClassVar[str] = "voice_profile"

    character_id: str
    avg_sentence_length: float
    question_ratio: float
    exclamation_ratio: float
    lexical_diversity: float
    utterances_analyzed: int
    speech_style: str
    tone: str
    tone_distribution: list[ToneSegment] = Field(default_factory=list)
    distinctive_patterns: list[str] = Field(default_factory=list)
