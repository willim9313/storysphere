from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class TimelineConfig(BaseModel):
    """Per-book timeline snapshot configuration, confirmed by user after ingestion."""

    chapter_mode_enabled: bool = False
    story_mode_enabled: bool = False          # requires TemporalPipeline to have run
    default_mode: Literal["chapter", "story"] = "chapter"
    total_chapters: int = 0
    total_events: int = 0
    total_ranked_events: int = 0             # events with chronological_rank set
    chapter_mode_configured: bool = False    # user has confirmed chapter mode setting
    story_mode_configured: bool = False      # user has confirmed story mode setting
    configured_at: Optional[datetime] = None


class TimelineDetectionResult(BaseModel):
    """Result of auto-detecting timeline structure for a book."""

    book_id: str
    chapter_count: int                       # distinct chapter values across events
    event_count: int
    ranked_event_count: int                  # events with chronological_rank != None
    chapter_mode_viable: bool                # chapter_count > 1
    story_mode_viable: bool                  # ranked_event_count > 0
