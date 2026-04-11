"""Shared helpers for the tool layer.

All tools are thin wrappers: validate → forward to service → format output.
These helpers standardise formatting and error handling.
"""

from __future__ import annotations

from typing import Any


def format_entity(entity: Any) -> dict:
    """Return a serialisable dict for an Entity domain object."""
    return {
        "id": entity.id,
        "name": entity.name,
        "entity_type": entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type),
        "aliases": entity.aliases,
        "description": entity.description,
        "attributes": entity.attributes,
        "first_appearance_chapter": entity.first_appearance_chapter,
        "mention_count": entity.mention_count,
    }


def format_relation(relation: Any) -> dict:
    """Return a serialisable dict for a Relation domain object."""
    return {
        "id": relation.id,
        "source_id": relation.source_id,
        "target_id": relation.target_id,
        "relation_type": relation.relation_type.value if hasattr(relation.relation_type, "value") else str(relation.relation_type),
        "description": relation.description,
        "weight": relation.weight,
        "chapters": relation.chapters,
        "is_bidirectional": relation.is_bidirectional,
    }


def format_event(event: Any) -> dict:
    """Return a serialisable dict for an Event domain object."""
    d = {
        "id": event.id,
        "title": event.title,
        "event_type": event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
        "description": event.description,
        "chapter": event.chapter,
        "participants": event.participants,
        "location_id": event.location_id,
        "significance": event.significance,
        "consequences": event.consequences,
        "narrative_mode": getattr(event, "narrative_mode", "unknown"),
        "story_time_hint": getattr(event, "story_time_hint", None),
        "chronological_rank": getattr(event, "chronological_rank", None),
    }
    # Resolve enum value if present
    nm = d["narrative_mode"]
    if hasattr(nm, "value"):
        d["narrative_mode"] = nm.value
    return d


async def resolve_entity(kg_service: Any, entity_id_or_name: str) -> Any | None:
    """Resolve an entity by ID, falling back to name lookup."""
    entity = await kg_service.get_entity(entity_id_or_name)
    if entity is None:
        entity = await kg_service.get_entity_by_name(entity_id_or_name)
    return entity


def handle_not_found(entity_name_or_id: str) -> str:
    """Return a standard not-found message for the agent."""
    return f"Entity '{entity_name_or_id}' not found in the knowledge graph."


def _json_default(obj: Any) -> Any:
    """JSON default encoder that serialises Pydantic models as dicts."""
    try:
        from pydantic import BaseModel  # noqa: PLC0415
        if isinstance(obj, BaseModel):
            return obj.model_dump()
    except ImportError:
        pass
    return str(obj)


def format_tool_output(data: Any) -> str:
    """Convert data to a JSON-like string for LangChain tool output."""
    import json

    return json.dumps(data, ensure_ascii=False, indent=2, default=_json_default)
