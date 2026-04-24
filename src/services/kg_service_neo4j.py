"""Neo4jKGService — Neo4j-backed knowledge graph.

Implements KGServiceBase using the official ``neo4j`` async driver (Bolt).

Graph schema
------------
Nodes
    (:Entity {id, name, entity_type, aliases, attributes, description,
              document_id, first_appearance_chapter, mention_count,
              extraction_method, confidence})
    (:Event  {id, document_id, title, event_type, description, chapter,
              participants, location_id, significance, consequences,
              narrative_mode, chronological_rank, story_time_hint})

Relationships
    (:Entity)-[:RELATION   {id, document_id, relation_type, description,
                             weight, chapters, is_bidirectional}]->(:Entity)
    (:Entity)-[:PARTICIPATES_IN]->(:Event)
    (:Event) -[:TEMPORAL   {id, document_id, relation_type, confidence,
                             evidence, derived_from_eep}]->(:Event)

Bidirectional flag
    Bidirectional relations are stored as a single RELATION edge with
    ``is_bidirectional=true``.  ``get_relations`` uses undirected matching
    when ``direction="both"`` to reproduce the NetworkX behaviour.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from neo4j import AsyncGraphDatabase, AsyncDriver

from domain.entities import Entity, EntityType
from domain.events import Event, EventType, NarrativeMode
from domain.relations import Relation, RelationType
from domain.temporal import TemporalRelation, TemporalRelationType
from services.kg_service_base import KGServiceBase
from services.query_models import PathNode, RelationPath, RelationStats, Subgraph, SubgraphEdge, SubgraphNode

logger = logging.getLogger(__name__)


class Neo4jKGService(KGServiceBase):
    """Neo4j async-driver-backed knowledge graph service."""

    def __init__(self, url: str, user: str, password: str) -> None:
        self._driver: AsyncDriver = AsyncGraphDatabase.driver(
            url, auth=(user, password)
        )

    async def close(self) -> None:
        """Close the driver connection pool."""
        await self._driver.close()

    async def verify_connectivity(self) -> None:
        """Raise if Neo4j is unreachable."""
        await self._driver.verify_connectivity()

    # ── Entity operations ────────────────────────────────────────────────────

    async def add_entity(self, entity: Entity) -> None:
        props = _entity_props(entity)
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (e:Entity {id: $id})
                SET e += $props
                """,
                id=entity.id,
                props=props,
            )
        logger.debug("Neo4jKGService.add_entity: %s (%s)", entity.name, entity.id)

    async def get_entity(self, entity_id: str) -> Entity | None:
        async with self._driver.session() as session:
            result = await session.run(
                "MATCH (e:Entity {id: $id}) RETURN e", id=entity_id
            )
            record = await result.single()
        if record is None:
            return None
        return _node_to_entity(record["e"])

    async def get_entity_by_name(self, name: str) -> Entity | None:
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (e:Entity)
                WHERE toLower(e.name) = toLower($name)
                   OR any(a IN e.aliases WHERE toLower(a) = toLower($name))
                RETURN e LIMIT 1
                """,
                name=name,
            )
            record = await result.single()
        if record is None:
            return None
        return _node_to_entity(record["e"])

    async def list_entities(
        self,
        entity_type: EntityType | None = None,
        document_id: str | None = None,
        extraction_method: str | None = None,
    ) -> list[Entity]:
        conditions: list[str] = []
        params: dict[str, Any] = {}
        if entity_type is not None:
            conditions.append("e.entity_type = $entity_type")
            params["entity_type"] = entity_type.value
        if document_id is not None:
            conditions.append("e.document_id = $document_id")
            params["document_id"] = document_id
        if extraction_method is not None:
            conditions.append("e.extraction_method = $extraction_method")
            params["extraction_method"] = extraction_method

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        async with self._driver.session() as session:
            result = await session.run(f"MATCH (e:Entity) {where} RETURN e", **params)
            records = await result.data()
        return [_node_to_entity(r["e"]) for r in records]

    # ── Relation operations ──────────────────────────────────────────────────

    async def add_relation(self, relation: Relation) -> None:
        props = _relation_props(relation)
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Entity {id: $src}), (b:Entity {id: $tgt})
                MERGE (a)-[r:RELATION {id: $id}]->(b)
                SET r += $props
                RETURN r
                """,
                src=relation.source_id,
                tgt=relation.target_id,
                id=relation.id,
                props=props,
            )
            record = await result.single()
        if record is None:
            logger.warning(
                "Neo4jKGService.add_relation: missing node(s) for relation %s. "
                "Ensure entities are added first.",
                relation.id,
            )
        else:
            logger.debug("Neo4jKGService.add_relation: %s", relation.id)

    async def get_relations(
        self, entity_id: str, *, direction: str = "both"
    ) -> list[Relation]:
        if direction == "out":
            cypher = """
                MATCH (e:Entity {id: $id})-[r:RELATION]->(other:Entity)
                RETURN properties(r) AS rprops, $id AS src, other.id AS tgt
            """
        elif direction == "in":
            cypher = """
                MATCH (other:Entity)-[r:RELATION]->(e:Entity {id: $id})
                RETURN properties(r) AS rprops, other.id AS src, $id AS tgt
                UNION
                MATCH (e:Entity {id: $id})-[r:RELATION]->(other:Entity)
                WHERE r.is_bidirectional = true
                RETURN properties(r) AS rprops, $id AS src, other.id AS tgt
            """
        else:  # both
            cypher = """
                MATCH (e:Entity {id: $id})-[r:RELATION]-(other:Entity)
                RETURN properties(r) AS rprops,
                    CASE WHEN startNode(r).id = $id THEN $id ELSE other.id END AS src,
                    CASE WHEN startNode(r).id = $id THEN other.id ELSE $id END AS tgt
            """

        async with self._driver.session() as session:
            result = await session.run(cypher, id=entity_id)
            records = await result.data()

        seen: set[str] = set()
        relations: list[Relation] = []
        for rec in records:
            rprops: dict = rec["rprops"]
            rid = rprops.get("id", "")
            if rid not in seen:
                seen.add(rid)
                relations.append(_record_to_relation(rprops, rec["src"], rec["tgt"]))
        return relations

    # ── Event operations ─────────────────────────────────────────────────────

    async def add_event(self, event: Event) -> None:
        props = _event_props(event)
        async with self._driver.session() as session:
            await session.run(
                "MERGE (ev:Event {id: $id}) SET ev += $props",
                id=event.id,
                props=props,
            )
            for participant_id in event.participants:
                await session.run(
                    """
                    MATCH (e:Entity {id: $eid}), (ev:Event {id: $evid})
                    MERGE (e)-[:PARTICIPATES_IN]->(ev)
                    """,
                    eid=participant_id,
                    evid=event.id,
                )
        logger.debug("Neo4jKGService.add_event: %s", event.id)

    async def get_event(self, event_id: str) -> Event | None:
        async with self._driver.session() as session:
            result = await session.run(
                "MATCH (ev:Event {id: $id}) RETURN ev", id=event_id
            )
            record = await result.single()
        if record is None:
            return None
        return _node_to_event(record["ev"])

    async def get_events(
        self,
        entity_id: str | None = None,
        document_id: str | None = None,
    ) -> list[Event]:
        if entity_id is not None:
            cypher = """
                MATCH (e:Entity {id: $eid})-[:PARTICIPATES_IN]->(ev:Event)
                WHERE ($doc_id IS NULL OR ev.document_id = $doc_id)
                RETURN ev
            """
            params: dict[str, Any] = {"eid": entity_id, "doc_id": document_id}
        else:
            cypher = """
                MATCH (ev:Event)
                WHERE ($doc_id IS NULL OR ev.document_id = $doc_id)
                RETURN ev
            """
            params = {"doc_id": document_id}

        async with self._driver.session() as session:
            result = await session.run(cypher, **params)
            records = await result.data()
        return [_node_to_event(r["ev"]) for r in records]

    # ── Temporal relation operations ──────────────────────────────────────────

    async def add_temporal_relation(self, tr: TemporalRelation) -> None:
        props = _temporal_props(tr)
        async with self._driver.session() as session:
            await session.run(
                """
                MATCH (a:Event {id: $src}), (b:Event {id: $tgt})
                MERGE (a)-[t:TEMPORAL {id: $id}]->(b)
                SET t += $props
                """,
                src=tr.source_event_id,
                tgt=tr.target_event_id,
                id=tr.id,
                props=props,
            )

    async def get_temporal_relations(
        self, document_id: str | None = None
    ) -> list[TemporalRelation]:
        cypher = """
            MATCH (a:Event)-[t:TEMPORAL]->(b:Event)
            WHERE ($doc_id IS NULL OR t.document_id = $doc_id)
            RETURN properties(t) AS tprops, a.id AS src, b.id AS tgt
        """
        async with self._driver.session() as session:
            result = await session.run(cypher, doc_id=document_id)
            records = await result.data()
        return [_record_to_temporal(r["tprops"], r["src"], r["tgt"]) for r in records]

    async def remove_temporal_relations(self, document_id: str) -> int:
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH ()-[t:TEMPORAL {document_id: $doc_id}]->()
                WITH t, count(t) AS n
                DELETE t
                RETURN sum(n) AS removed
                """,
                doc_id=document_id,
            )
            record = await result.single()
        return int(record["removed"]) if record else 0

    async def update_event_rank(self, event_id: str, rank: float) -> None:
        async with self._driver.session() as session:
            await session.run(
                "MATCH (ev:Event {id: $id}) SET ev.chronological_rank = $rank",
                id=event_id,
                rank=rank,
            )

    async def update_event_chron_index(self, event_id: str, chron_index: int) -> None:
        async with self._driver.session() as session:
            await session.run(
                "MATCH (ev:Event {id: $id}) SET ev.chron_index = $chron_index",
                id=event_id,
                chron_index=chron_index,
            )

    async def update_entity_chron_index(self, entity_id: str, first_chron_index: int) -> None:
        async with self._driver.session() as session:
            await session.run(
                "MATCH (en:Entity {id: $id}) SET en.first_chron_index = $idx",
                id=entity_id,
                idx=first_chron_index,
            )

    async def list_relations(
        self, document_id: str | None = None
    ) -> list[Relation]:
        raise NotImplementedError("list_relations not implemented for Neo4j backend")

    async def get_snapshot(
        self,
        book_id: str,
        mode: str,
        position: int,
    ) -> tuple:
        raise NotImplementedError("get_snapshot not implemented for Neo4j backend")

    # ── Timeline / Path / Subgraph queries ──────────────────────────────────

    async def get_entity_timeline(
        self, entity_id: str, sort_by: str = "narrative"
    ) -> list[Event]:
        events = await self.get_events(entity_id)
        if sort_by == "chronological":
            return sorted(
                events,
                key=lambda e: (
                    e.chronological_rank if e.chronological_rank is not None else float("inf"),
                    e.chapter,
                ),
            )
        return sorted(events, key=lambda e: e.chapter)

    async def get_relation_paths(
        self,
        source_id: str,
        target_id: str,
        max_length: int = 3,
    ) -> list[RelationPath]:
        cypher = f"""
            MATCH path = (a:Entity {{id: $src}})-[:RELATION*1..{max_length}]-(b:Entity {{id: $tgt}})
            RETURN [n IN nodes(path) | n.id] AS node_ids,
                   [n IN nodes(path) | n.name] AS node_names,
                   [r IN relationships(path) | {{
                       relation_type: r.relation_type,
                       description: r.description,
                       weight: r.weight
                   }}] AS rels
            LIMIT 20
        """
        async with self._driver.session() as session:
            result = await session.run(cypher, src=source_id, tgt=target_id)
            records = await result.data()

        paths: list[RelationPath] = []
        for rec in records:
            node_ids: list[str] = rec["node_ids"]
            node_names: list[str] = rec["node_names"]
            rels: list[dict] = rec["rels"]
            nodes: list[PathNode] = []
            for i, (nid, nname) in enumerate(zip(node_ids, node_names)):
                nodes.append(PathNode(
                    entity_id=nid,
                    name=nname,
                    relation_from_prev=rels[i - 1] if i > 0 else None,
                ))
            paths.append(RelationPath(nodes=nodes))
        return paths

    async def get_subgraph(self, entity_id: str, k_hops: int = 2) -> Subgraph:
        cypher = f"""
            MATCH (center:Entity {{id: $id}})
            OPTIONAL MATCH (center)-[:RELATION*0..{k_hops}]-(neighbor:Entity)
            WITH center, collect(DISTINCT neighbor) AS neighbors
            OPTIONAL MATCH (a:Entity)-[r:RELATION]-(b:Entity)
            WHERE (a = center OR a IN neighbors) AND (b = center OR b IN neighbors)
            RETURN center,
                   neighbors,
                   collect(DISTINCT {{
                       id: r.id,
                       src: startNode(r).id,
                       tgt: endNode(r).id,
                       relation_type: r.relation_type,
                       description: r.description,
                       weight: r.weight
                   }}) AS edges
        """
        async with self._driver.session() as session:
            result = await session.run(cypher, id=entity_id)
            record = await result.single()

        if record is None or record["center"] is None:
            return Subgraph(center=entity_id, nodes=[], edges=[])

        center_node = record["center"]
        all_nodes = [center_node] + [n for n in record["neighbors"] if n is not None]

        nodes: list[SubgraphNode] = []
        seen_nodes: set[str] = set()
        for n in all_nodes:
            nid = n["id"]
            if nid not in seen_nodes:
                seen_nodes.add(nid)
                nodes.append(SubgraphNode(
                    entity_id=nid,
                    name=n.get("name", nid),
                    entity_type=n.get("entity_type", "unknown"),
                ))

        edges: list[SubgraphEdge] = []
        seen_edges: set[str] = set()
        for e in record["edges"]:
            rid = e.get("id")
            if rid and rid not in seen_edges:
                seen_edges.add(rid)
                edges.append(SubgraphEdge(
                    source=e["src"],
                    target=e["tgt"],
                    relation_type=e.get("relation_type", "unknown"),
                    description=e.get("description"),
                    weight=e.get("weight", 1.0),
                ))

        return Subgraph(center=entity_id, nodes=nodes, edges=edges)

    async def get_relation_stats(self, entity_id: str | None = None) -> RelationStats:
        if entity_id is not None:
            cypher = """
                MATCH (e:Entity {id: $id})-[r:RELATION]-(o:Entity)
                RETURN r.relation_type AS rtype, r.weight AS weight
            """
            params: dict[str, Any] = {"id": entity_id}
        else:
            cypher = """
                MATCH ()-[r:RELATION]->()
                RETURN r.relation_type AS rtype, r.weight AS weight
            """
            params = {}

        async with self._driver.session() as session:
            result = await session.run(cypher, **params)
            records = await result.data()

        type_dist: dict[str, int] = {}
        weights: list[float] = []
        for rec in records:
            rtype = rec["rtype"] or "other"
            type_dist[rtype] = type_dist.get(rtype, 0) + 1
            if rec["weight"] is not None:
                weights.append(float(rec["weight"]))

        return RelationStats(
            total_relations=len(records),
            type_distribution=type_dist,
            weight_avg=sum(weights) / len(weights) if weights else 0.0,
            weight_min=min(weights) if weights else 0.0,
            weight_max=max(weights) if weights else 0.0,
        )

    # ── Document-scoped removal ─────────────────────────────────────────────

    async def remove_by_document(self, document_id: str) -> dict[str, int]:
        async with self._driver.session() as session:
            # Count before deleting
            en_result = await session.run(
                "MATCH (e:Entity {document_id: $doc_id}) RETURN count(e) AS cnt",
                doc_id=document_id,
            )
            en_rec = await en_result.single()
            entity_count = int(en_rec["cnt"]) if en_rec else 0

            ev_result = await session.run(
                "MATCH (ev:Event {document_id: $doc_id}) RETURN count(ev) AS cnt",
                doc_id=document_id,
            )
            ev_rec = await ev_result.single()
            event_count = int(ev_rec["cnt"]) if ev_rec else 0

            rel_result = await session.run(
                """
                MATCH (e:Entity {document_id: $doc_id})-[r:RELATION]-()
                RETURN count(DISTINCT r) AS cnt
                """,
                doc_id=document_id,
            )
            rel_rec = await rel_result.single()
            relation_count = int(rel_rec["cnt"]) if rel_rec else 0

            # Delete temporal relations
            await session.run(
                "MATCH ()-[t:TEMPORAL {document_id: $doc_id}]->() DELETE t",
                doc_id=document_id,
            )
            # Delete events (DETACH removes PARTICIPATES_IN edges too)
            await session.run(
                "MATCH (ev:Event {document_id: $doc_id}) DETACH DELETE ev",
                doc_id=document_id,
            )
            # Delete entity nodes and their RELATION edges
            await session.run(
                "MATCH (e:Entity {document_id: $doc_id}) DETACH DELETE e",
                doc_id=document_id,
            )

        counts = {
            "entities": entity_count,
            "relations": relation_count,
            "events": event_count,
        }
        logger.info(
            "Neo4jKGService.remove_by_document(%s): removed %d entities, %d relations, %d events",
            document_id,
            entity_count,
            relation_count,
            event_count,
        )
        return counts

    # ── Persistence (no-op — Neo4j auto-persists) ────────────────────────────

    async def save(self) -> None:
        """No-op: Neo4j persists writes automatically."""

    async def load(self) -> None:
        """No-op: Neo4j is always online."""
        logger.info("Neo4jKGService: connected to %s", self._driver)

    # ── Stats ────────────────────────────────────────────────────────────────

    @property
    def entity_count(self) -> int:
        raise NotImplementedError("Use async await neo4j_service.async_entity_count()")

    @property
    def relation_count(self) -> int:
        raise NotImplementedError("Use async await neo4j_service.async_relation_count()")

    @property
    def event_count(self) -> int:
        raise NotImplementedError("Use async await neo4j_service.async_event_count()")

    async def async_entity_count(self) -> int:
        async with self._driver.session() as session:
            result = await session.run("MATCH (e:Entity) RETURN count(e) AS cnt")
            record = await result.single()
        return int(record["cnt"]) if record else 0

    async def async_relation_count(self) -> int:
        async with self._driver.session() as session:
            result = await session.run("MATCH ()-[r:RELATION]->() RETURN count(r) AS cnt")
            record = await result.single()
        return int(record["cnt"]) if record else 0

    async def async_event_count(self) -> int:
        async with self._driver.session() as session:
            result = await session.run("MATCH (ev:Event) RETURN count(ev) AS cnt")
            record = await result.single()
        return int(record["cnt"]) if record else 0


# ── Conversion helpers ────────────────────────────────────────────────────────


def _entity_props(entity: Entity) -> dict[str, Any]:
    return {
        "name": entity.name,
        "entity_type": entity.entity_type.value,
        "aliases": entity.aliases,
        "attributes": json.dumps(entity.attributes, ensure_ascii=False),
        "description": entity.description,
        "document_id": entity.document_id,
        "first_appearance_chapter": entity.first_appearance_chapter,
        "mention_count": entity.mention_count,
        "extraction_method": entity.extraction_method,
        "inferred_by": entity.inferred_by,
        "confidence": entity.confidence,
    }


def _relation_props(relation: Relation) -> dict[str, Any]:
    return {
        "document_id": relation.document_id,
        "relation_type": relation.relation_type.value,
        "description": relation.description,
        "weight": relation.weight,
        "chapters": relation.chapters,
        "is_bidirectional": relation.is_bidirectional,
    }


def _event_props(event: Event) -> dict[str, Any]:
    story_time_json = None
    if event.story_time is not None:
        story_time_json = event.story_time.model_dump_json()
    return {
        "document_id": event.document_id,
        "title": event.title,
        "event_type": event.event_type.value,
        "description": event.description,
        "chapter": event.chapter,
        "participants": event.participants,
        "location_id": event.location_id,
        "significance": event.significance,
        "consequences": event.consequences,
        "narrative_position": event.narrative_position,
        "narrative_mode": event.narrative_mode.value,
        "story_time_hint": event.story_time_hint,
        "chronological_rank": event.chronological_rank,
        "tension_signal": event.tension_signal,
        "emotional_intensity": event.emotional_intensity,
        "emotional_valence": event.emotional_valence,
        "narrative_weight": event.narrative_weight,
        "narrative_weight_source": event.narrative_weight_source,
        "story_time": story_time_json,
    }


def _temporal_props(tr: TemporalRelation) -> dict[str, Any]:
    return {
        "document_id": tr.document_id,
        "relation_type": tr.relation_type.value,
        "confidence": tr.confidence,
        "evidence": tr.evidence,
        "derived_from_eep": tr.derived_from_eep,
    }


def _node_to_entity(node: Any) -> Entity:
    data = dict(node)
    attributes_raw = data.get("attributes", "{}")
    try:
        attributes = json.loads(attributes_raw) if isinstance(attributes_raw, str) else (attributes_raw or {})
    except (json.JSONDecodeError, TypeError):
        attributes = {}
    return Entity(
        id=data["id"],
        name=data["name"],
        entity_type=EntityType(data.get("entity_type", "other")),
        aliases=list(data.get("aliases") or []),
        attributes=attributes,
        description=data.get("description"),
        document_id=data.get("document_id"),
        first_appearance_chapter=data.get("first_appearance_chapter"),
        mention_count=int(data.get("mention_count") or 0),
        extraction_method=data.get("extraction_method", "ner"),
        inferred_by=data.get("inferred_by"),
        confidence=data.get("confidence"),
    )


def _node_to_event(node: Any) -> Event:
    from domain.events import StoryTimeRef  # noqa: PLC0415

    data = dict(node)
    story_time = None
    if data.get("story_time"):
        try:
            story_time = StoryTimeRef.model_validate_json(data["story_time"])
        except Exception:
            story_time = None
    return Event(
        id=data["id"],
        document_id=data.get("document_id"),
        title=data["title"],
        event_type=EventType(data.get("event_type", "plot")),
        description=data.get("description", ""),
        chapter=int(data.get("chapter") or 0),
        participants=list(data.get("participants") or []),
        location_id=data.get("location_id"),
        significance=data.get("significance"),
        consequences=list(data.get("consequences") or []),
        narrative_position=data.get("narrative_position"),
        narrative_mode=NarrativeMode(data.get("narrative_mode", "unknown")),
        story_time_hint=data.get("story_time_hint"),
        chronological_rank=data.get("chronological_rank"),
        tension_signal=data.get("tension_signal", "none"),
        emotional_intensity=data.get("emotional_intensity"),
        emotional_valence=data.get("emotional_valence"),
        narrative_weight=data.get("narrative_weight", "unclassified"),
        narrative_weight_source=data.get("narrative_weight_source"),
        story_time=story_time,
    )


def _record_to_relation(rel_data: Any, source_id: str, target_id: str) -> Relation:
    data = dict(rel_data)
    return Relation(
        id=data["id"],
        document_id=data.get("document_id"),
        source_id=source_id,
        target_id=target_id,
        relation_type=RelationType(data.get("relation_type", "other")),
        description=data.get("description"),
        weight=float(data.get("weight") or 1.0),
        chapters=list(data.get("chapters") or []),
        is_bidirectional=bool(data.get("is_bidirectional", False)),
    )


def _record_to_temporal(rel_data: Any, src: str, tgt: str) -> TemporalRelation:
    data = dict(rel_data)
    return TemporalRelation(
        id=data["id"],
        document_id=data["document_id"],
        source_event_id=src,
        target_event_id=tgt,
        relation_type=TemporalRelationType(data.get("relation_type", "unknown")),
        confidence=float(data.get("confidence") or 0.5),
        evidence=data.get("evidence", ""),
        derived_from_eep=bool(data.get("derived_from_eep", False)),
    )
