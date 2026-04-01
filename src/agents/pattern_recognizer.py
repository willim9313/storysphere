"""QueryPatternRecognizer — query pattern classification for entity tracking.

Classifies user queries into known patterns and extracts entity mentions.
Results are used to update entity tracking state (pronoun resolution) before
the LangGraph ReAct loop runs. The agent loop always handles response generation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PatternMatch:
    """Result of pattern recognition."""

    pattern_name: str
    confidence: float
    suggested_tools: list[str] = field(default_factory=list)
    extracted_entities: list[str] = field(default_factory=list)


# Each pattern: (name, keywords_regex, tool_list, base_confidence)
_PATTERNS: list[tuple[str, re.Pattern, list[str], float]] = [
    (
        "entity_info",
        re.compile(
            r"(?:是誰|who\s+is|tell\s+me\s+about|背景|profile\s+of|介紹|describe)\b",
            re.IGNORECASE,
        ),
        ["get_entity_profile"],
        0.85,
    ),
    (
        "relationship",
        re.compile(
            r"(?:關係|relationship|和.{1,20}之間|between\s+.+\s+and|how\s+are\s+.+\s+connected|connection)",
            re.IGNORECASE,
        ),
        ["get_entity_relationship"],
        0.85,
    ),
    (
        "timeline",
        re.compile(
            r"(?:時間線|timeline|發展|arc|character\s+development|how\s+does\s+.+\s+(?:change|develop|evolve|grow))",
            re.IGNORECASE,
        ),
        ["get_character_arc"],
        0.85,
    ),
    (
        "comparison",
        re.compile(
            r"(?:比較|compare|對比|和.{1,20}的區別|differences?\s+between|similarities?\s+between|vs\.?)",
            re.IGNORECASE,
        ),
        ["compare_characters"],
        0.85,
    ),
    (
        "summary",
        re.compile(
            r"(?:摘要|summary|概述|chapter\s+\d+|summarize|overview)",
            re.IGNORECASE,
        ),
        ["get_summary"],
        0.8,
    ),
    (
        "search",
        re.compile(
            r"(?:搜索|search|find|哪裡提到|where\s+is|mentioned|引用|passage\s+about)",
            re.IGNORECASE,
        ),
        ["vector_search"],
        0.8,
    ),
]

# Entity extraction: quoted strings, "X and Y", or CamelCase names
_ENTITY_PATTERNS = [
    re.compile(r'"([^"]+)"'),  # "quoted name"
    re.compile(r"「([^」]+)」"),  # 「中文引號」
    re.compile(r"(?:about|of|is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", re.ASCII),
    re.compile(r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:and|vs\.?|與|和)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)"),
]


class QueryPatternRecognizer:
    """Classify user queries to enable fast-routing for common patterns."""

    def recognize(self, query: str) -> Optional[PatternMatch]:
        """Attempt to match the query against known patterns.

        Returns a ``PatternMatch`` if confidence >= 0.8, else ``None``.
        """
        best: Optional[PatternMatch] = None

        for name, regex, tools, base_conf in _PATTERNS:
            if regex.search(query):
                entities = self._extract_entities(query)
                # Boost confidence if entities found
                confidence = min(base_conf + 0.05 * len(entities), 0.95)
                match = PatternMatch(
                    pattern_name=name,
                    confidence=confidence,
                    suggested_tools=tools,
                    extracted_entities=entities,
                )
                if best is None or match.confidence > best.confidence:
                    best = match

        if best is not None and best.confidence >= 0.8:
            return best
        return None

    @staticmethod
    def _extract_entities(query: str) -> list[str]:
        """Extract entity names from the query using heuristic patterns."""
        entities: list[str] = []
        seen: set[str] = set()
        for pattern in _ENTITY_PATTERNS:
            for match in pattern.finditer(query):
                for group_idx in range(1, match.lastindex + 1 if match.lastindex else 1):
                    name = match.group(group_idx)
                    if name and name.lower() not in seen:
                        seen.add(name.lower())
                        entities.append(name)
        return entities
