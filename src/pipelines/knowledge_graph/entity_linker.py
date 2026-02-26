"""Entity linker — deduplication and alias merging.

After extracting entities from all chapters we may have many duplicates
(same character mentioned with slightly different spellings or titles).
This module merges them into canonical entities using name / alias matching.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

from domain.entities import Entity

logger = logging.getLogger(__name__)


class EntityLinker:
    """Deduplicate a list of ``Entity`` objects by name/alias similarity.

    Strategy (in order):
    1. **Exact name match** — same canonical name → merge into one entity.
    2. **Alias match** — an entity's alias equals another's canonical name.
    3. **Normalised match** — strip punctuation, lowercase, compare.

    The entity with the highest ``mention_count`` is chosen as the canonical
    representative.  All aliases and attributes are merged into it.
    """

    def link(self, entities: list[Entity]) -> list[Entity]:
        """Return a deduplicated list of entities.

        Args:
            entities: Raw entities from all chapters (may contain duplicates).

        Returns:
            Merged list with unique canonical entities.
            The ``mention_count`` field reflects the total across merged copies.
        """
        if not entities:
            return []

        # Group by normalised name key
        groups: dict[str, list[Entity]] = defaultdict(list)
        for entity in entities:
            key = self._canonical_key(entity)
            groups[key].append(entity)

        # Also group across alias cross-references
        groups = self._merge_alias_groups(groups)

        merged: list[Entity] = []
        for group in groups.values():
            merged.append(self._merge_group(group))

        logger.info(
            "EntityLinker: %d raw → %d unique entities", len(entities), len(merged)
        )
        return merged

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _canonical_key(entity: Entity) -> str:
        """Normalise entity name for matching (lowercase, strip punctuation)."""
        return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", entity.name.lower())

    def _merge_alias_groups(
        self, groups: dict[str, list[Entity]]
    ) -> dict[str, list[Entity]]:
        """Merge groups where one entity's alias equals another group's key."""
        # Build a mapping: alias_key → canonical_key of the owning group
        alias_map: dict[str, str] = {}
        for key, group in groups.items():
            for entity in group:
                for alias in entity.aliases:
                    akey = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", alias.lower())
                    if akey and akey != key:
                        alias_map[akey] = key

        # Absorb groups whose key appears as an alias in another group
        merged: dict[str, list[Entity]] = {}
        for key, group in groups.items():
            target = alias_map.get(key, key)
            if target not in merged:
                merged[target] = []
            merged[target].extend(group)

        return merged

    @staticmethod
    def _merge_group(group: list[Entity]) -> Entity:
        """Merge a list of duplicate entities into one canonical entity."""
        # The entity with the most mentions (or the first, if equal) wins
        canonical = max(group, key=lambda e: e.mention_count)

        # Aggregate aliases, attributes, mention counts
        all_aliases: set[str] = set(canonical.aliases)
        merged_attrs = dict(canonical.attributes)
        total_mentions = 0
        earliest_chapter: int | None = canonical.first_appearance_chapter

        for entity in group:
            all_aliases.update(entity.aliases)
            all_aliases.discard(canonical.name)  # don't self-alias
            merged_attrs.update(entity.attributes)
            total_mentions += entity.mention_count
            if entity.first_appearance_chapter is not None:
                if earliest_chapter is None or entity.first_appearance_chapter < earliest_chapter:
                    earliest_chapter = entity.first_appearance_chapter

        canonical.aliases = sorted(all_aliases)
        canonical.attributes = merged_attrs
        canonical.mention_count = total_mentions
        canonical.first_appearance_chapter = earliest_chapter

        return canonical
