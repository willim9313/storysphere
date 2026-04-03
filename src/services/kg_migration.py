"""kg_migration — migrate KG data from NetworkX JSON to Neo4j.

Usage (CLI):
    python -m services.kg_migration \\
        --from ./data/knowledge_graph.json \\
        --neo4j-url bolt://localhost:7687 \\
        --user neo4j \\
        --password <password>

The migration is idempotent: running it twice on the same JSON will
MERGE (not duplicate) nodes and edges because Neo4j MERGE matches on the
``id`` property.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


async def migrate_networkx_to_neo4j(
    json_path: str,
    neo4j_url: str,
    user: str,
    password: str,
    *,
    batch_size: int = 100,
    verbose: bool = False,
) -> dict[str, int]:
    """Load the NetworkX JSON dump and write it into Neo4j.

    Args:
        json_path:  Path to the ``knowledge_graph.json`` file produced by
                    ``KGService.save()``.
        neo4j_url:  Bolt URL, e.g. ``bolt://localhost:7687``.
        user:       Neo4j username.
        password:   Neo4j password.
        batch_size: Number of records to write per transaction batch.
        verbose:    Emit progress logs when True.

    Returns:
        Dict with counts: ``{entities, relations, events, temporal_relations}``.
    """
    from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415
    from domain.entities import Entity  # noqa: PLC0415
    from domain.events import Event  # noqa: PLC0415
    from domain.relations import Relation, RelationType  # noqa: PLC0415
    from domain.temporal import TemporalRelation  # noqa: PLC0415

    path = Path(json_path)
    if not path.exists():
        raise FileNotFoundError(f"Migration source not found: {json_path}")

    with open(path, encoding="utf-8") as fh:
        payload: dict[str, Any] = json.load(fh)

    entities_raw: dict[str, Any] = payload.get("entities", {})
    events_raw: dict[str, Any] = payload.get("events", {})
    temporal_raw: dict[str, Any] = payload.get("temporal_relations", {})
    edges_raw: list[dict[str, Any]] = payload.get("edges", [])

    svc = Neo4jKGService(url=neo4j_url, user=user, password=password)
    await svc.verify_connectivity()
    logger.info("Connected to Neo4j at %s", neo4j_url)

    counts: dict[str, int] = {
        "entities": 0,
        "relations": 0,
        "events": 0,
        "temporal_relations": 0,
    }

    # ── Entities ─────────────────────────────────────────────────────────────
    entity_list = list(entities_raw.values())
    for i in range(0, len(entity_list), batch_size):
        batch = entity_list[i : i + batch_size]
        for edata in batch:
            entity = Entity.model_validate(edata)
            await svc.add_entity(entity)
            counts["entities"] += 1
        if verbose:
            logger.info("Entities: %d / %d", counts["entities"], len(entity_list))

    # ── Events ────────────────────────────────────────────────────────────────
    event_list = list(events_raw.values())
    for i in range(0, len(event_list), batch_size):
        batch = event_list[i : i + batch_size]
        for evdata in batch:
            event = Event.model_validate(evdata)
            await svc.add_event(event)
            counts["events"] += 1
        if verbose:
            logger.info("Events: %d / %d", counts["events"], len(event_list))

    # ── Relations (from edge list, skip _rev duplicates) ─────────────────────
    seen_ids: set[str] = set()
    for edge in edges_raw:
        key: str = edge.get("key", "")
        if key.endswith("_rev"):
            continue
        if key in seen_ids:
            continue
        seen_ids.add(key)
        relation = Relation(
            id=key,
            document_id=edge.get("document_id"),
            source_id=edge["source"],
            target_id=edge["target"],
            relation_type=RelationType(edge.get("relation_type", "other")),
            description=edge.get("description"),
            weight=float(edge.get("weight", 1.0)),
            chapters=edge.get("chapters", []),
            is_bidirectional=bool(edge.get("is_bidirectional", False)),
        )
        await svc.add_relation(relation)
        counts["relations"] += 1
        if verbose and counts["relations"] % batch_size == 0:
            logger.info("Relations: %d", counts["relations"])

    # ── Temporal relations ────────────────────────────────────────────────────
    tr_list = list(temporal_raw.values())
    for i in range(0, len(tr_list), batch_size):
        batch = tr_list[i : i + batch_size]
        for trdata in batch:
            tr = TemporalRelation.model_validate(trdata)
            await svc.add_temporal_relation(tr)
            counts["temporal_relations"] += 1
        if verbose:
            logger.info(
                "Temporal relations: %d / %d",
                counts["temporal_relations"],
                len(tr_list),
            )

    await svc.close()

    logger.info(
        "Migration complete: %d entities, %d relations, %d events, %d temporal_relations",
        counts["entities"],
        counts["relations"],
        counts["events"],
        counts["temporal_relations"],
    )
    return counts


async def migrate_neo4j_to_networkx(
    neo4j_url: str,
    user: str,
    password: str,
    json_path: str,
    *,
    verbose: bool = False,
) -> dict[str, int]:
    """Read all data from Neo4j and write it into a NetworkX JSON file.

    Args:
        neo4j_url:  Bolt URL, e.g. ``bolt://localhost:7687``.
        user:       Neo4j username.
        password:   Neo4j password.
        json_path:  Destination path for ``knowledge_graph.json``.
        verbose:    Emit progress logs when True.

    Returns:
        Dict with counts: ``{entities, relations, events, temporal_relations}``.
    """
    from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415
    from services.kg_service import KGService  # noqa: PLC0415

    neo4j_svc = Neo4jKGService(url=neo4j_url, user=user, password=password)
    await neo4j_svc.verify_connectivity()
    logger.info("Connected to Neo4j at %s", neo4j_url)

    nx_svc = KGService(persistence_path=json_path)

    # ── Entities ─────────────────────────────────────────────────────────────
    entities = await neo4j_svc.list_entities()
    for entity in entities:
        await nx_svc.add_entity(entity)
    if verbose:
        logger.info("Migrated %d entities", len(entities))

    # ── Events ────────────────────────────────────────────────────────────────
    events = await neo4j_svc.get_events()
    for event in events:
        await nx_svc.add_event(event)
    if verbose:
        logger.info("Migrated %d events", len(events))

    # ── Relations (collect unique outgoing relations across all entities) ─────
    seen_rel_ids: set[str] = set()
    relation_count = 0
    for entity in entities:
        rels = await neo4j_svc.get_relations(entity.id, direction="out")
        for rel in rels:
            if rel.id not in seen_rel_ids:
                seen_rel_ids.add(rel.id)
                await nx_svc.add_relation(rel)
                relation_count += 1
    if verbose:
        logger.info("Migrated %d relations", relation_count)

    # ── Temporal relations ────────────────────────────────────────────────────
    temporal_rels = await neo4j_svc.get_temporal_relations()
    for tr in temporal_rels:
        await nx_svc.add_temporal_relation(tr)
    if verbose:
        logger.info("Migrated %d temporal relations", len(temporal_rels))

    await nx_svc.save()
    await neo4j_svc.close()

    counts = {
        "entities": len(entities),
        "relations": relation_count,
        "events": len(events),
        "temporal_relations": len(temporal_rels),
    }
    logger.info(
        "Neo4j → NetworkX migration complete: %d entities, %d relations, %d events, %d temporal_relations",
        counts["entities"],
        counts["relations"],
        counts["events"],
        counts["temporal_relations"],
    )
    return counts


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m services.kg_migration",
        description="Migrate StorySphere KG data from NetworkX JSON to Neo4j.",
    )
    parser.add_argument(
        "--from",
        dest="json_path",
        default="./data/knowledge_graph.json",
        help="Path to knowledge_graph.json (default: ./data/knowledge_graph.json)",
    )
    parser.add_argument(
        "--neo4j-url",
        default="bolt://localhost:7687",
        help="Neo4j Bolt URL (default: bolt://localhost:7687)",
    )
    parser.add_argument(
        "--user",
        default="neo4j",
        help="Neo4j username (default: neo4j)",
    )
    parser.add_argument(
        "--password",
        default="",
        help="Neo4j password",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Records per write batch (default: 100)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show per-batch progress",
    )
    return parser


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        stream=sys.stdout,
    )

    args = _build_parser().parse_args()

    result = asyncio.run(
        migrate_networkx_to_neo4j(
            json_path=args.json_path,
            neo4j_url=args.neo4j_url,
            user=args.user,
            password=args.password,
            batch_size=args.batch_size,
            verbose=args.verbose,
        )
    )

    print(
        f"\nMigration done — "
        f"{result['entities']} entities, "
        f"{result['relations']} relations, "
        f"{result['events']} events, "
        f"{result['temporal_relations']} temporal relations."
    )
