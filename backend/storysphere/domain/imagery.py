"""Imagery and symbol domain models for semiotics analysis.

Pure Pydantic data models — no I/O, no side effects.
Modelled after src/domain/temporal.py conventions.
"""

from __future__ import annotations

import uuid
from enum import Enum

from pydantic import BaseModel, Field


class ImageryType(str, Enum):
    OBJECT = "object"    # 鏡子、門、鑰匙、書
    NATURE = "nature"    # 水、光、火、風、月、雨
    SPATIAL = "spatial"  # 房間、門檻、道路、橋
    BODY = "body"        # 手、眼、血（被強調時）
    COLOR = "color"      # 紅、白（作為主要意象而非形容詞時）
    OTHER = "other"


class ImageryEntity(BaseModel):
    """A recurring symbolic imagery element extracted from a book."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    book_id: str
    term: str                                    # canonical form，用原文語言
    imagery_type: ImageryType
    aliases: list[str] = Field(default_factory=list)   # 語義變體（火焰、燭光 → 光）
    frequency: int = 0
    chapter_distribution: dict[int, int] = Field(default_factory=dict)  # {chapter_num: count}


class SymbolOccurrence(BaseModel):
    """A single occurrence of an imagery element within a paragraph."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    imagery_id: str
    book_id: str
    paragraph_id: str
    chapter_number: int
    position: int                                # 0-based position within chapter
    context_window: str = ""                     # ~200 chars surrounding context
    co_occurring_terms: list[str] = Field(default_factory=list)


class SymbolCluster(BaseModel):
    """A cluster of semantically similar imagery terms."""

    canonical_term: str
    variants: list[str]
    semantic_similarity_scores: dict[str, float]  # variant → cosine similarity
    book_id: str
