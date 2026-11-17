"""N-07a–g：registry 端點。只有 N-07e（另存使用者方法論）會寫入，寫的是 `methodologies` 表。"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body
from pydantic import ValidationError
from sqlalchemy import select

from storysphere.api.deps import MethodEngineDep, RegistryDep, SessionDep
from storysphere.api.errors import ApiError, not_found, validation_error
from storysphere.api.schemas.registry import (
    Dag,
    DagEdge,
    DagNode,
    ImplOut,
    MethodDetail,
    MethodologyIn,
    MethodologyOut,
    MethodSummary,
    PerspectiveCard,
    PerspectiveOut,
    PreconditionOut,
    RequirementOut,
    StepOut,
    SynthesisOut,
    ViewCatalogOut,
    ViewTypeOut,
)
from storysphere.methods.engine import MethodEngine
from storysphere.registry.checks import build_dag
from storysphere.registry.models import MethodDecl, MethodologyDecl
from storysphere.store.agent import AgentSessionRow
from storysphere.store.evidence_writer import SystemFieldForbiddenError, assert_no_system_fields
from storysphere.store.methodologies import MethodologyRow, save_methodology, turn_steps

router = APIRouter(prefix="/registry", tags=["registry"])


def _summary_fields(decl: MethodDecl, engine: MethodEngine) -> dict[str, Any]:
    return {
        "id": decl.id,
        "code": decl.code,
        "version": decl.version,
        "layer": decl.layer,
        "mechanism": decl.mechanism,
        "question": decl.question,
        "basis": decl.basis,
        "grade": decl.grade,
        "produces": decl.produces,
        "requires": [RequirementOut(**req.model_dump()) for req in decl.requires],
        "preconditions": [PreconditionOut(**pre.model_dump()) for pre in decl.preconditions],
        "scope": decl.scope,
        "scope_selector": decl.scope_selector,
        "view": decl.view,
        "impl_kind": decl.impl.kind,
        "llm_task": decl.impl.llm_task,
        "priority": decl.priority,
        "implemented": engine.is_implemented(decl.id),
    }


@router.get("/methods", response_model=list[MethodSummary])
async def list_methods(
    registry: RegistryDep,
    engine: MethodEngineDep,
    layer: str | None = None,
    mechanism: str | None = None,
) -> list[MethodSummary]:
    """N-07a 方法清單，依代碼排序。"""
    decls = sorted(registry.methods.values(), key=lambda decl: decl.code)
    return [
        MethodSummary(**_summary_fields(decl, engine))
        for decl in decls
        if (layer is None or decl.layer == layer)
        and (mechanism is None or decl.mechanism == mechanism)
    ]


@router.get("/methods/{method_id}", response_model=MethodDetail)
async def get_method(method_id: str, registry: RegistryDep, engine: MethodEngineDep) -> MethodDetail:
    """N-07b 單一方法的完整宣告。"""
    decl = registry.methods.get(method_id)
    if decl is None:
        raise not_found("Method", method_id)
    return MethodDetail(
        **_summary_fields(decl, engine),
        allow_interpretation=decl.allow_interpretation,
        impl=ImplOut(**decl.impl.model_dump()),
        used_by_methodologies=sorted(
            methodology.id
            for methodology in registry.methodologies.values()
            if any(step.method == method_id for step in methodology.steps)
        ),
        downstream_methods=sorted(
            other.id
            for other in registry.methods.values()
            if any(req.claim_type == decl.produces for req in other.requires)
        ),
    )


def _methodology_out(decl: MethodologyDecl, engine: MethodEngine) -> MethodologyOut:
    return MethodologyOut(
        id=decl.id,
        code=decl.code,
        version=decl.version,
        owner=decl.owner,
        question=decl.question,
        basis=decl.basis,
        grade=decl.grade,
        steps=[
            StepOut(
                method=step.method,
                synthesis=SynthesisOut(**step.synthesis.model_dump()) if step.synthesis else None,
            )
            for step in decl.steps
        ],
        view=decl.view,
        priority=decl.priority,
        # 原型沒有方法論執行器（STATUS）：內建的都標尚未實作。
        implemented=engine.is_implemented(decl.id),
    )


def _user_methodology_out(row: MethodologyRow) -> MethodologyOut:
    return MethodologyOut(
        id=row.id,
        code=None,
        version=row.version,
        owner="user",
        question=row.question,
        basis=None,
        grade="使用者自建",
        steps=[
            StepOut(method=step["method"], synthesis=None, input=step.get("input"))
            for step in row.steps_json
        ],
        view=None,
        priority=None,
        # 原型沒有方法論執行器。
        implemented=False,
    )


@router.get("/methodologies", response_model=list[MethodologyOut])
async def list_methodologies(
    registry: RegistryDep, engine: MethodEngineDep, session: SessionDep
) -> list[MethodologyOut]:
    """N-07c 方法論清單：內建的（依代碼）在前，使用者存的（依建立時間）在後。"""
    decls = sorted(registry.methodologies.values(), key=lambda decl: decl.code or decl.id)
    users = await session.scalars(select(MethodologyRow).order_by(MethodologyRow.created_at))
    return [
        *(_methodology_out(decl, engine) for decl in decls),
        *(_user_methodology_out(row) for row in users),
    ]


@router.get("/methodologies/{methodology_id}", response_model=MethodologyOut)
async def get_methodology(
    methodology_id: str, registry: RegistryDep, engine: MethodEngineDep, session: SessionDep
) -> MethodologyOut:
    """N-07d 單一方法論的宣告。"""
    decl = registry.methodologies.get(methodology_id)
    if decl is not None:
        return _methodology_out(decl, engine)
    row = await session.get(MethodologyRow, methodology_id)
    if row is None:
        raise not_found("Methodology", methodology_id)
    return _user_methodology_out(row)


@router.post("/methodologies", response_model=MethodologyOut, status_code=201)
async def create_methodology(
    registry: RegistryDep, session: SessionDep, raw: Annotated[dict[str, Any], Body()]
) -> MethodologyOut:
    """N-07e 另存方法論。原型只做 `fromSession`：步驟＝該輪的 `run_method` 順序（05 §3.3）。"""
    try:
        assert_no_system_fields(raw)
    except SystemFieldForbiddenError as exc:
        raise ApiError(422, "system_field_forbidden", str(exc)) from exc
    try:
        body = MethodologyIn.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise validation_error(f"{'.'.join(map(str, first['loc']))}: {first['msg']}") from exc
    if body.from_session is None:
        raise validation_error("Only fromSession is supported in the prototype.")

    source = body.from_session
    if await session.get(AgentSessionRow, source.session_id) is None:
        raise not_found("Agent session", source.session_id)
    steps = await turn_steps(session, source.session_id, source.turn_id)
    if not steps:
        raise ApiError(
            422, "no_steps", "This turn ran no method (run_method); there are no steps to save."
        )
    # 步驟只能是已登錄的方法或方法論（契約 v2 風險表）。沒有 synthesis，不產生新的證據類型，
    # 所以 03 §2 的 DAG 檢查只剩這一條。
    known = registry.methods.keys() | registry.methodologies.keys()
    unknown = sorted({step["method"] for step in steps} - known)
    if unknown:
        raise validation_error(f"Unregistered steps: {', '.join(unknown)}.")

    row = await save_methodology(
        session,
        question=body.question,
        steps=steps,
        source={"session_id": source.session_id, "turn_id": source.turn_id},
    )
    await session.commit()
    return _user_methodology_out(row)


@router.get("/dag", response_model=Dag)
async def get_dag(registry: RegistryDep) -> Dag:
    """N-07f 證據 DAG。"""
    dag = build_dag(registry)
    return Dag(
        nodes=[DagNode(**node) for node in dag["nodes"]],
        edges=[DagEdge(**edge) for edge in dag["edges"]],
    )


@router.get("/views", response_model=ViewCatalogOut)
async def get_views(registry: RegistryDep) -> ViewCatalogOut:
    """N-07g view 目錄與視角設定。"""
    used_by: dict[str, list[str]] = {}
    for decl in [*registry.methods.values(), *registry.methodologies.values()]:
        if decl.view:
            used_by.setdefault(decl.view, []).append(decl.id)
    return ViewCatalogOut(
        view_types=[
            ViewTypeOut(
                view_type=view.view_type,
                description=view.description,
                used_by=sorted(used_by.get(view.view_type, [])),
            )
            for view in registry.views.values()
        ],
        perspectives=[
            PerspectiveOut(
                genre=perspective.genre,
                cards=[
                    PerspectiveCard(ref_id=card.ref, question=card.question)
                    for card in perspective.cards
                ],
            )
            for perspective in registry.perspectives.values()
        ],
    )
