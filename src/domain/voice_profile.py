"""Voice profile domain model — F-04."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ToneSegment(BaseModel):
    """One segment of the tone distribution bar."""

    label: str
    value: float  # 0.0–1.0, segments should sum to ~1


class HistogramBucket(BaseModel):
    """One bucket of the sentence length histogram."""

    bucket: str  # e.g. "1-10", "11-20", "51+"
    value: int   # sentence count in this bucket


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

    # Distribution data for charts (default empty for backward-compat with old cache entries)
    tone_distribution: list[ToneSegment] = Field(default_factory=list)
    sentence_length_histogram: list[HistogramBucket] = Field(default_factory=list)

    # LLM qualitative description
    speech_style: str
    distinctive_patterns: list[str]
    tone: str
    representative_quotes: list[str]

    analyzed_at: datetime
