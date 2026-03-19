"""Paragraph-level entity linker — maps deduplicated entities to paragraph offsets.

Pure algorithm (no LLM). Uses regex text matching to find entity name/alias
occurrences in each paragraph and records character offsets as ParagraphEntity.
"""

from __future__ import annotations

import logging
import re

from domain.documents import Document, ParagraphEntity
from domain.entities import Entity

logger = logging.getLogger(__name__)

_ASCII_RE = re.compile(r"^[\w\s]+$", re.ASCII)


class ParagraphEntityLinker:
    """Link deduplicated entities to paragraphs via text matching."""

    def link(self, document: Document, entities: list[Entity]) -> None:
        """Mutate *document* in-place, populating ``paragraph.entities``.

        Args:
            document: Fully parsed document with chapters and paragraphs.
            entities: Deduplicated entity list (post entity-linker).
        """
        if not entities:
            return

        # Build name→entity lookup (longest match first)
        name_map: dict[str, Entity] = {}  # lowercase surface → Entity
        for ent in entities:
            lower = ent.name.lower()
            if lower not in name_map or len(ent.name) > len(name_map[lower].name):
                name_map[lower] = ent
            for alias in ent.aliases:
                a_lower = alias.lower()
                if a_lower not in name_map or len(alias) > len(name_map[a_lower].name):
                    name_map[a_lower] = ent

        if not name_map:
            return

        # Compile regex once for all paragraphs
        pattern = self._compile_pattern(sorted(name_map.keys(), key=len, reverse=True))

        total_linked = 0
        for chapter in document.chapters:
            for para in chapter.paragraphs:
                para_entities: list[ParagraphEntity] = []
                for m in pattern.finditer(para.text):
                    ent = name_map[m.group(0).lower()]
                    para_entities.append(
                        ParagraphEntity(
                            entity_id=ent.id,
                            entity_name=ent.name,
                            entity_type=ent.entity_type.value,
                            start=m.start(),
                            end=m.end(),
                        )
                    )
                para.entities = para_entities if para_entities else None
                total_linked += len(para_entities)

        logger.info(
            "ParagraphEntityLinker: linked %d mentions across %d paragraphs",
            total_linked,
            document.total_paragraphs,
        )

    @staticmethod
    def _compile_pattern(sorted_names: list[str]) -> re.Pattern:
        """Build a single regex pattern for all entity names (longest first)."""
        parts: list[str] = []
        for name in sorted_names:
            escaped = re.escape(name)
            if _ASCII_RE.match(name):
                parts.append(rf"(?<!\w){escaped}(?!\w)")
            else:
                parts.append(escaped)
        return re.compile("(" + "|".join(parts) + ")", re.IGNORECASE)
