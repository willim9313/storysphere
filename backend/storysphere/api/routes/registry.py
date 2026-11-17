"""N-07a–d、N-07f、N-07g：registry 的唯讀端點（N-07e 另存方法論在 T27）。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from storysphere.api.deps import MethodEngineDep, RegistryDep
from storysphere.api.errors import not_found
from storysphere.api.schemas.registry import (
    Dag,
    DagEdge,
    DagNode,
    ImplOut,
    MethodDetail,
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


@router.get("/methodologies", response_model=list[MethodologyOut])
async def list_methodologies(registry: RegistryDep, engine: MethodEngineDep) -> list[MethodologyOut]:
    """N-07c 方法論清單（原型只有內建的；使用者方法論 N-07e 在 T27）。"""
    decls = sorted(registry.methodologies.values(), key=lambda decl: decl.code or decl.id)
    return [_methodology_out(decl, engine) for decl in decls]


@router.get("/methodologies/{methodology_id}", response_model=MethodologyOut)
async def get_methodology(
    methodology_id: str, registry: RegistryDep, engine: MethodEngineDep
) -> MethodologyOut:
    """N-07d 單一方法論的宣告。"""
    decl = registry.methodologies.get(methodology_id)
    if decl is None:
        raise not_found("Methodology", methodology_id)
    return _methodology_out(decl, engine)


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
