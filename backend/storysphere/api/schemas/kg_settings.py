"""Response/request schemas for KG settings endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class KgStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    mode: str
    deploy_mode: str
    entity_count: int
    relation_count: int
    event_count: int
    graph_db_connected: bool
    persistence_path: str | None
    qdrant_local_path: str | None
    vector_count: int | None
    #: Feature ids that stop working under each selectable backend, including
    #: the ones with nothing to report — the settings page needs to warn before
    #: the switch, so it has to be able to ask about a backend it is not on.
    unsupported_by_mode: dict[str, list[str]] = {}


class KgSwitchRequest(BaseModel):
    mode: Literal["networkx", "neo4j"]


class KgSwitchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    mode: str
    message: str


class KgMigrateRequest(BaseModel):
    direction: Literal["nx_to_neo4j", "neo4j_to_nx"]
