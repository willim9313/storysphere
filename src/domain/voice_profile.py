"""Voice profile domain model — F-04."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class VoiceProfile(BaseModel):
    character_id: str
    character_name: str
    document_id: str

    # Quantitative metrics (pure computation)
    avg_sentence_length: float
    question_ratio: float
    exclamation_ratio: float
    lexical_diversity: float
    paragraphs_analyzed: int

    # LLM qualitative description
    speech_style: str
    distinctive_patterns: list[str]
    tone: str
    representative_quotes: list[str]

    analyzed_at: datetime
