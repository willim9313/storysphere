"""Knowledge-graph views of a book — split out of ``books.py``.

The graph payload (#9), link-prediction / inferred relations (F-01), and
the epistemic-state endpoints (F-03).  Shares the ``/books`` prefix with
``books.py``; the endpoint paths are unchanged.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
)

from storysphere.api import task_runner
from storysphere.api.deps import (
    DocServiceDep,
    EpistemicStateServiceDep,
    KGServiceDep,
    LinkPredictionServiceDep,
)
from storysphere.api.schemas.book_graph import (
    ClassifyVisibilityResponse,
    ConfirmInferredRequest,
    EpistemicStateResponse,
    GraphDataResponse,
    GraphEdge,
    GraphNode,
    InferredRelationResponse,
    InferredRelationsResponse,
    MisbeliefItemSchema,
    RunInferenceRequest,
)
from storysphere.api.schemas.books import (
    TaskIdResponse,
)
from storysphere.api.store import task_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


# ── #9 GET /books/:bookId/graph ──────────────────────────────────────────────


@router.get("/{book_id}/graph", response_model=GraphDataResponse)
async def get_book_graph(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
    mode: str | None = None,
    position: int | None = None,
    include_inferred: bool = False,
) -> dict:
    """Get knowledge graph data for a book.

    Optional snapshot parameters:
    - mode: "chapter" (reading order) or "story" (chronological)
    - position: chapter number or chron_index depending on mode
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    # Snapshot mode: use get_snapshot() when mode+position provided
    if mode is not None and position is not None:
        if mode not in ("chapter", "story"):
            raise HTTPException(
                status_code=422,
                detail="mode must be 'chapter' or 'story'",
            )
        events, entities, relations = await kg.get_snapshot(book_id, mode, position)
    else:
        entities = await kg.list_entities(document_id=book_id)
        relations = await kg.list_relations(document_id=book_id)
        events = await kg.get_events(document_id=book_id)

    entity_ids = {e.id for e in entities}

    nodes = [
        GraphNode(
            id=e.id,
            name=e.name,
            type=e.entity_type.value,
            description=e.description,
            chunk_count=e.mention_count,
        ).model_dump(by_alias=True)
        for e in entities
    ]

    edges: list[dict] = [
        GraphEdge(
            id=rel.id,
            source=rel.source_id,
            target=rel.target_id,
            label=rel.relation_type.value,
        ).model_dump(by_alias=True)
        for rel in relations
        if rel.source_id in entity_ids and rel.target_id in entity_ids
    ]

    for event in events:
        nodes.append(
            GraphNode(
                id=event.id,
                name=event.title,
                type="event",
                description=event.description,
                chunk_count=len(event.participants),
                event_type=event.event_type.value,
                chapter=event.chapter,
            ).model_dump(by_alias=True)
        )
        for pid in event.participants:
            if pid in entity_ids:
                edges.append(
                    GraphEdge(
                        id=f"evt-{event.id}-{pid}",
                        source=event.id,
                        target=pid,
                        label="participates_in",
                    ).model_dump(by_alias=True)
                )
        if event.location_id and event.location_id in entity_ids:
            edges.append(
                GraphEdge(
                    id=f"evt-{event.id}-loc",
                    source=event.id,
                    target=event.location_id,
                    label="occurs_at",
                ).model_dump(by_alias=True)
            )

    if include_inferred:
        from storysphere.domain.inferred_relations import InferenceStatus  # noqa: PLC0415
        inferred = await lp.list_inferred(book_id, status=InferenceStatus.PENDING)
        for ir in inferred:
            if ir.source_id not in entity_ids or ir.target_id not in entity_ids:
                continue
            if position is not None and ir.visible_from_chapter is not None:
                if ir.visible_from_chapter > position:
                    continue
            edges.append(
                GraphEdge(
                    id=f"ir-{ir.id}",
                    source=ir.source_id,
                    target=ir.target_id,
                    label=ir.suggested_relation_type.value,
                    confidence=ir.confidence,
                    inferred=True,
                    inferred_id=ir.id,
                ).model_dump(by_alias=True)
            )

    return GraphDataResponse(nodes=nodes, edges=edges).model_dump(by_alias=True)


# ── Link Prediction / Inferred Relations (F-01) ──────────────────────────────


@router.post("/{book_id}/inferred-relations/run", response_model=InferredRelationsResponse)
async def run_link_inference(
    book_id: str,
    body: RunInferenceRequest,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
) -> dict:
    """Run Common Neighbors + Adamic-Adar inference on the full book graph."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from storysphere.config.settings import get_settings  # noqa: PLC0415
    settings = get_settings()
    entity_map = {e.id: e for e in await kg.list_entities(document_id=book_id)}
    items = await lp.run_inference(
        document_id=book_id,
        max_candidates=settings.link_prediction_max_candidates,
        min_common_neighbors=settings.link_prediction_min_common_neighbors,
        force_refresh=body.force_refresh,
    )
    responses = [_ir_to_response(ir, entity_map) for ir in items]
    return InferredRelationsResponse(items=responses, total=len(responses)).model_dump(by_alias=True)


@router.get("/{book_id}/inferred-relations", response_model=InferredRelationsResponse)
async def list_inferred_relations(
    book_id: str,
    doc: DocServiceDep,
    kg: KGServiceDep,
    lp: LinkPredictionServiceDep,
    status: str | None = None,
) -> dict:
    """List inferred relation candidates for a book."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from storysphere.domain.inferred_relations import InferenceStatus  # noqa: PLC0415
    status_filter = None
    if status is not None:
        try:
            status_filter = InferenceStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status '{status}'") from None

    entity_map = {e.id: e for e in await kg.list_entities(document_id=book_id)}
    items = await lp.list_inferred(book_id, status=status_filter)
    responses = [_ir_to_response(ir, entity_map) for ir in items]
    return InferredRelationsResponse(items=responses, total=len(responses)).model_dump(by_alias=True)


@router.post("/{book_id}/inferred-relations/{ir_id}/confirm", status_code=201)
async def confirm_inferred_relation(
    book_id: str,
    ir_id: str,
    doc: DocServiceDep,
    lp: LinkPredictionServiceDep,
    body: ConfirmInferredRequest | None = None,
) -> dict:
    """Confirm an inferred relation; writes it as a real Relation to the KG.

    Body is optional. When `relationType` is omitted, the inferred relation's
    suggested_relation_type is promoted to its canonical RelationType via
    INFERRED_TO_CANONICAL (see domain.inferred_relations).
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    ir = await lp.get_inferred(ir_id)
    if ir is None or ir.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")

    from storysphere.domain.inferred_relations import promote_inferred_type  # noqa: PLC0415
    from storysphere.domain.relations import RelationType  # noqa: PLC0415

    override = body.relation_type if body is not None else None
    if override is not None:
        try:
            relation_type = RelationType(override)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid relation_type '{override}'",
            ) from exc
    else:
        relation_type = promote_inferred_type(ir.suggested_relation_type)

    relation = await lp.confirm(ir_id, relation_type)
    if relation is None:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")
    return {"relationId": relation.id}


@router.post("/{book_id}/inferred-relations/{ir_id}/reject", status_code=204)
async def reject_inferred_relation(
    book_id: str,
    ir_id: str,
    doc: DocServiceDep,
    lp: LinkPredictionServiceDep,
) -> None:
    """Reject (dismiss) an inferred relation candidate."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    ir = await lp.get_inferred(ir_id)
    if ir is None or ir.document_id != book_id:
        raise HTTPException(status_code=404, detail=f"InferredRelation '{ir_id}' not found")

    await lp.reject(ir_id)
    return None


def _ir_to_response(ir: Any, entity_map: dict) -> InferredRelationResponse:
    src = entity_map.get(ir.source_id)
    tgt = entity_map.get(ir.target_id)
    return InferredRelationResponse(
        id=ir.id,
        document_id=ir.document_id,
        source_id=ir.source_id,
        target_id=ir.target_id,
        source_name=src.name if src else ir.source_id,
        target_name=tgt.name if tgt else ir.target_id,
        common_neighbor_count=ir.common_neighbor_count,
        adamic_adar_score=ir.adamic_adar_score,
        confidence=ir.confidence,
        suggested_relation_type=ir.suggested_relation_type.value,
        reasoning=ir.reasoning,
        status=ir.status.value,
        visible_from_chapter=ir.visible_from_chapter,
        confirmed_relation_id=ir.confirmed_relation_id,
        created_at=ir.created_at,
    )


# ── F-03 GET /books/:bookId/entities/:entityId/epistemic-state ───────────────


@router.get(
    "/{book_id}/entities/{entity_id}/epistemic-state",
    response_model=EpistemicStateResponse,
)
async def get_entity_epistemic_state(
    book_id: str,
    entity_id: str,
    up_to_chapter: int = Query(..., ge=1),
    epistemic_svc: EpistemicStateServiceDep = None,
    doc: DocServiceDep = None,
    kg: KGServiceDep = None,
) -> dict:
    """Return what a character knows and doesn't know up to a given chapter."""
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    state = await epistemic_svc.get_character_knowledge(
        character_id=entity_id,
        document_id=book_id,
        up_to_chapter=up_to_chapter,
    )

    # data_complete = False when the book was ingested before F-03 added visibility.
    # Check ALL events in the book (not just the current chapter range) so that
    # chapters with legitimately all-public events don't produce false negatives.
    all_book_events = await kg.get_events(document_id=book_id)
    data_complete = any(ev.visibility != "public" for ev in all_book_events)

    return EpistemicStateResponse(
        character_id=state.character_id,
        character_name=state.character_name,
        up_to_chapter=state.up_to_chapter,
        known_events=[ev.model_dump() for ev in state.known_events],
        unknown_events=[ev.model_dump() for ev in state.unknown_events],
        misbeliefs=[
            MisbeliefItemSchema(
                character_belief=m.character_belief,
                actual_truth=m.actual_truth,
                source_event_id=m.source_event_id,
                confidence=m.confidence,
            )
            for m in state.misbeliefs
        ],
        data_complete=data_complete,
    ).model_dump(by_alias=True)


# ── F-03b POST /books/:bookId/classify-visibility (temporary) ───────────────
# TODO: replace with re-ingest pipeline once a per-book re-extraction endpoint exists


async def _classify_visibility(task_id: str, book_id: str, svc: Any) -> dict:
    counts = await svc.classify_event_visibility(
        document_id=book_id,
        progress_callback=task_runner.progress(task_id),
    )
    return ClassifyVisibilityResponse(
        classified=counts["classified"],
        skipped=counts["skipped"],
        total=counts["classified"] + counts["skipped"],
    ).model_dump(by_alias=True)


@router.post(
    "/{book_id}/classify-visibility",
    response_model=TaskIdResponse,
    status_code=202,
)
async def classify_book_visibility(
    book_id: str,
    epistemic_svc: EpistemicStateServiceDep = None,
    doc: DocServiceDep = None,
) -> dict:
    """Retroactively classify event visibility for a book using LLM.

    Temporary endpoint — may be replaced once a full re-ingest pipeline is available.
    """
    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    task_id = str(uuid4())
    task_store.create(task_id, title="可見性分類")
    task_runner.launch(task_id, _classify_visibility(task_id, book_id, epistemic_svc))
    return TaskIdResponse(task_id=task_id).model_dump(by_alias=True)
