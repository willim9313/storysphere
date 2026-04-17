"""KG Settings endpoints — query status, switch backend, trigger migration.

GET  /api/v1/kg/status       — current mode + entity/relation/event counts
POST /api/v1/kg/switch       — switch backend at runtime (no restart needed)
POST /api/v1/kg/migrate      — async migration between backends (returns task_id)
GET  /api/v1/kg/migrate/{task_id} — poll migration task status (uses shared task store)
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from api.schemas.common import TaskStatus
from api.schemas.kg_settings import (
    KgMigrateRequest,
    KgStatusResponse,
    KgSwitchRequest,
    KgSwitchResponse,
)
from api.store import get_task, task_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kg", tags=["kg-settings"])


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/status", response_model=KgStatusResponse)
async def get_kg_status() -> KgStatusResponse:
    """Return current KG backend mode and data counts."""
    from api.deps import get_kg_service, _runtime_kg_mode  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415
    from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415

    settings = get_settings()
    kg = get_kg_service()
    mode = _runtime_kg_mode or settings.kg_mode

    neo4j_connected = False
    entity_count = 0
    relation_count = 0
    event_count = 0

    if isinstance(kg, Neo4jKGService):
        try:
            await kg.verify_connectivity()
            neo4j_connected = True
            entity_count = await kg.async_entity_count()
            relation_count = await kg.async_relation_count()
            event_count = await kg.async_event_count()
        except Exception as exc:
            logger.warning("Neo4j connectivity check failed: %s", exc)
    else:
        entity_count = kg.entity_count
        relation_count = kg.relation_count
        event_count = kg.event_count
        # Check if Neo4j is reachable even when not in use
        try:
            from neo4j import AsyncGraphDatabase  # noqa: PLC0415
            driver = AsyncGraphDatabase.driver(
                settings.neo4j_url,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
            await driver.verify_connectivity()
            await driver.close()
            neo4j_connected = True
        except Exception:
            neo4j_connected = False

    return KgStatusResponse(
        mode=mode,
        entity_count=entity_count,
        relation_count=relation_count,
        event_count=event_count,
        graph_db_connected=neo4j_connected,
        persistence_path=settings.kg_persistence_path if mode == "networkx" else None,
    )


@router.post("/switch", response_model=KgSwitchResponse)
async def switch_kg_mode(body: KgSwitchRequest) -> KgSwitchResponse:
    """Switch the active KG backend without restarting the server.

    The new backend is immediately used for all subsequent API requests.
    Existing in-memory data from the old backend is NOT automatically migrated.
    """
    from api.deps import get_kg_service, set_kg_mode_override  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415
    from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415

    settings = get_settings()
    new_mode = body.mode

    # Validate Neo4j connectivity before switching to it
    if new_mode == "neo4j":
        try:
            from neo4j import AsyncGraphDatabase  # noqa: PLC0415
            driver = AsyncGraphDatabase.driver(
                settings.neo4j_url,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
            await driver.verify_connectivity()
            await driver.close()
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Neo4j unreachable at {settings.neo4j_url}: {exc}",
            ) from exc

    # Close old Neo4j driver if switching away from it
    try:
        old_svc = get_kg_service()
        if isinstance(old_svc, Neo4jKGService):
            await old_svc.close()
    except Exception:
        pass

    set_kg_mode_override(new_mode)

    # Warm up the new service
    new_svc = get_kg_service()
    await new_svc.load()

    return KgSwitchResponse(
        mode=new_mode,
        message=f"Switched to {new_mode}.",
    )


@router.post("/migrate", response_model=TaskStatus, status_code=202)
async def start_migration(
    body: KgMigrateRequest,
    background_tasks: BackgroundTasks,
) -> TaskStatus:
    """Start an async migration between KG backends.

    - ``nx_to_neo4j``: Load NetworkX JSON → write to Neo4j (idempotent MERGE)
    - ``neo4j_to_nx``: Read Neo4j → write NetworkX JSON file

    Returns a task_id for polling via ``GET /api/v1/kg/migrate/{task_id}``.
    """
    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_migration, task_id, body.direction)
    return TaskStatus(task_id=task_id, status="pending")


@router.get("/migrate/{task_id}", response_model=TaskStatus)
async def get_migration_status(task_id: str) -> TaskStatus:
    """Poll migration task status."""
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Migration task not found")
    return task


# ── Background task ───────────────────────────────────────────────────────────


async def _run_migration(task_id: str, direction: str) -> None:
    """Background coroutine: execute migration and update task store."""
    from config.settings import get_settings  # noqa: PLC0415
    from services.kg_migration import (  # noqa: PLC0415
        migrate_networkx_to_neo4j,
        migrate_neo4j_to_networkx,
    )

    settings = get_settings()
    task_store.set_running(task_id)

    try:
        if direction == "nx_to_neo4j":
            counts = await migrate_networkx_to_neo4j(
                json_path=settings.kg_persistence_path,
                neo4j_url=settings.neo4j_url,
                user=settings.neo4j_user,
                password=settings.neo4j_password,
                verbose=True,
            )
        else:  # neo4j_to_nx
            counts = await migrate_neo4j_to_networkx(
                neo4j_url=settings.neo4j_url,
                user=settings.neo4j_user,
                password=settings.neo4j_password,
                json_path=settings.kg_persistence_path,
                verbose=True,
            )

        task_store.set_completed(task_id, result={
            "direction": direction,
            **counts,
        })
        logger.info("Migration task %s completed: %s", task_id, counts)
    except Exception as exc:
        logger.exception("Migration task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
