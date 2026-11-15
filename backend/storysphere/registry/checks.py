"""Registry consistency checks and the evidence DAG (docs/spec/03 §2; contract v2 一致性規則).

`check_registry` 回傳所有問題；有任何一筆，啟動就要拒絕。六條規則的代號：
  R1 每種產出只能有一個方法產出
  R2 每種第 1 層類型至少被一個方法讀，或明列在 orphans_allowed
  R3 通用方法不讀題材證據、不讀題材擴充欄位
  R4 依賴不得有環
  R5 類型要有 Pydantic model、view 要在目錄裡、引用的 id 要存在
  R6 讀使用者／agent 詮釋要明確宣告 allow_interpretation
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from storysphere.domain.evidence import CONTENT_MODELS
from storysphere.registry.loader import Registry
from storysphere.registry.models import MethodDecl, MethodologyDecl

# 終端產出：不由方法產生，也不是第 1 層（契約 v2 規則 1）。
TERMINAL_TYPES = frozenset({"note", "interpretation"})


@dataclass(frozen=True)
class Problem:
    rule: str
    message: str

    def __str__(self) -> str:
        return f"[{self.rule}] {self.message}"


def _synthesis(methodology: MethodologyDecl):
    return next((step.synthesis for step in methodology.steps if step.synthesis), None)


def _step_ids(methodology: MethodologyDecl) -> list[str]:
    return [step.method for step in methodology.steps if step.method]


def producers(registry: Registry) -> dict[str, list[str]]:
    """claim_type → ids of the methods / methodologies that produce it."""
    result: dict[str, list[str]] = {}
    for method in registry.methods.values():
        result.setdefault(method.produces, []).append(method.id)
    for methodology in registry.methodologies.values():
        if synthesis := _synthesis(methodology):
            result.setdefault(synthesis.produces, []).append(methodology.id)
    return result


def methodology_layer(registry: Registry, methodology_id: str, _seen: frozenset = frozenset()):
    """方法論的層＝步驟中只要有一個題材方法就是 genre。"""
    if methodology_id in _seen:
        return "universal"  # 環由 R4 回報
    methodology = registry.methodologies[methodology_id]
    for step_id in _step_ids(methodology):
        if step_id in registry.methods:
            if registry.methods[step_id].layer == "genre":
                return "genre"
        elif step_id in registry.methodologies:
            if methodology_layer(registry, step_id, _seen | {methodology_id}) == "genre":
                return "genre"
    return "universal"


def _owner_layer(registry: Registry, owner_id: str) -> str:
    if owner_id in registry.methods:
        return registry.methods[owner_id].layer
    return methodology_layer(registry, owner_id)


def claim_type_layers(registry: Registry) -> dict[str, str]:
    """claim_type → universal / genre（第 1 層看 claim_types.yaml，其餘看產出它的方法）。"""
    layers = {name: item.layer for name, item in registry.level_1.items()}
    for claim_type, owner_ids in producers(registry).items():
        layers.setdefault(claim_type, _owner_layer(registry, owner_ids[0]))
    return layers


def _edges(registry: Registry) -> dict[str, set[str]]:
    """上游 → 下游（方法與方法論之間）。"""
    made_by = producers(registry)
    edges: dict[str, set[str]] = {
        key: set() for key in [*registry.methods, *registry.methodologies]
    }
    for method in registry.methods.values():
        for requirement in method.requires:
            for owner in made_by.get(requirement.claim_type, []):
                edges.setdefault(owner, set()).add(method.id)
    for methodology in registry.methodologies.values():
        for step_id in _step_ids(methodology):
            edges.setdefault(step_id, set()).add(methodology.id)
    return edges


def execution_order(registry: Registry) -> list[str]:
    """Topological order of methods and methodologies. Raises ValueError on a cycle."""
    edges = _edges(registry)
    indegree = dict.fromkeys(edges, 0)
    for targets in edges.values():
        for target in targets:
            indegree[target] = indegree.get(target, 0) + 1
    ready = sorted(node for node, degree in indegree.items() if degree == 0)
    order: list[str] = []
    while ready:
        node = ready.pop(0)
        order.append(node)
        for target in sorted(edges.get(node, ())):
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    if len(order) != len(indegree):
        stuck = sorted(node for node, degree in indegree.items() if degree > 0)
        raise ValueError(f"dependency cycle among: {', '.join(stuck)}")
    return order


def claim_type_levels(registry: Registry) -> dict[str, int]:
    """Nominal level of each claim type: level 1 as declared, others 1 + highest input."""
    levels = dict.fromkeys(registry.level_1, 1)
    made_by = producers(registry)
    output_of = {owner: claim for claim, owners in made_by.items() for owner in owners}
    for node in execution_order(registry):
        if node in registry.methods:
            method = registry.methods[node]
            inputs = [levels.get(req.claim_type, 1) for req in method.requires]
            levels[method.produces] = 1 + max(inputs, default=0)
        elif node in output_of:
            methodology = registry.methodologies[node]
            inputs = [
                levels[output_of[step_id]]
                for step_id in _step_ids(methodology)
                if step_id in output_of and output_of[step_id] in levels
            ]
            levels[output_of[node]] = 1 + max(inputs, default=0)
    return levels


def _check_single_producer(registry: Registry) -> Iterable[Problem]:
    for claim_type, owner_ids in sorted(producers(registry).items()):
        if len(owner_ids) > 1:
            yield Problem(
                "R1", f"'{claim_type}' is produced by more than one: {', '.join(sorted(owner_ids))}"
            )
        if claim_type in registry.level_1:
            yield Problem("R1", f"'{claim_type}' is declared level 1 but also produced by a method")


def _check_level_1_has_reader(registry: Registry) -> Iterable[Problem]:
    read = {req.claim_type for method in registry.methods.values() for req in method.requires}
    for claim_type in sorted(registry.level_1):
        if claim_type not in read and claim_type not in registry.orphans:
            yield Problem(
                "R2", f"level 1 type '{claim_type}' is read by no method and is not an allowed orphan"
            )


def _check_universal_isolation(registry: Registry) -> Iterable[Problem]:
    layers = claim_type_layers(registry)
    for method in registry.methods.values():
        if method.layer != "universal":
            continue
        for requirement in method.requires:
            if requirement.genre_ext:
                yield Problem(
                    "R3",
                    f"universal method '{method.id}' reads genre extension "
                    f"'{requirement.genre_ext}' of '{requirement.claim_type}'",
                )
            if layers.get(requirement.claim_type) == "genre":
                yield Problem(
                    "R3",
                    f"universal method '{method.id}' reads genre evidence '{requirement.claim_type}'",
                )


def _check_acyclic(registry: Registry) -> Iterable[Problem]:
    try:
        execution_order(registry)
    except ValueError as exc:
        yield Problem("R4", str(exc))


def _check_references(registry: Registry, content_models: dict[str, Any]) -> Iterable[Problem]:
    made_by = producers(registry)
    for claim_type in sorted(made_by):
        if claim_type not in content_models:
            yield Problem("R5", f"produced type '{claim_type}' has no content model")
    for claim_type in sorted(registry.level_1):
        if claim_type not in content_models:
            yield Problem("R5", f"level 1 type '{claim_type}' has no content model")
    declared = made_by.keys() | registry.level_1.keys() | TERMINAL_TYPES
    for claim_type in sorted(content_models.keys() - declared):
        yield Problem("R5", f"content model '{claim_type}' is not declared in the registry")
    for name, item in sorted(registry.level_1.items()):
        if item.layer == "genre" and not item.mechanism:
            yield Problem("R5", f"genre level 1 type '{name}' must name its mechanism")

    def owner_checks(owner: MethodDecl | MethodologyDecl) -> Iterable[Problem]:
        if owner.view is not None and owner.view not in registry.views:
            yield Problem("R5", f"'{owner.id}' uses unknown view '{owner.view}'")

    for method in registry.methods.values():
        yield from owner_checks(method)
        for claim_type in [
            *(req.claim_type for req in method.requires),
            *(pre.exists for pre in method.preconditions),
        ]:
            if claim_type not in content_models:
                yield Problem("R5", f"method '{method.id}' refers to unknown type '{claim_type}'")
    for methodology in registry.methodologies.values():
        yield from owner_checks(methodology)
        for position, step in enumerate(methodology.steps, start=1):
            if (step.method is None) == (step.synthesis is None):
                yield Problem(
                    "R5",
                    f"methodology '{methodology.id}' step {position} must be exactly one of "
                    "method / synthesis",
                )
            if step.synthesis and position != len(methodology.steps):
                yield Problem(
                    "R5", f"methodology '{methodology.id}': synthesis must be the last step"
                )
            if (
                step.method
                and step.method not in registry.methods
                and step.method not in registry.methodologies
            ):
                yield Problem(
                    "R5", f"methodology '{methodology.id}' uses unknown step '{step.method}'"
                )
    for perspective in registry.perspectives.values():
        for card in perspective.cards:
            if card.ref not in registry.methods and card.ref not in registry.methodologies:
                yield Problem(
                    "R5", f"perspective '{perspective.genre}' has a card for unknown '{card.ref}'"
                )


def _check_interpretation_opt_in(registry: Registry) -> Iterable[Problem]:
    for method in registry.methods.values():
        if method.allow_interpretation:
            continue
        for requirement in method.requires:
            if requirement.source in ("user", "agent") or requirement.claim_type == "interpretation":
                yield Problem(
                    "R6",
                    f"method '{method.id}' reads user/agent interpretation "
                    f"('{requirement.claim_type}') without allow_interpretation",
                )


def check_registry(
    registry: Registry, content_models: dict[str, Any] | None = None
) -> list[Problem]:
    """Run all six rules. An empty list means the registry is consistent."""
    models = CONTENT_MODELS if content_models is None else content_models
    problems: list[Problem] = []
    problems.extend(_check_single_producer(registry))
    problems.extend(_check_level_1_has_reader(registry))
    problems.extend(_check_universal_isolation(registry))
    problems.extend(_check_acyclic(registry))
    problems.extend(_check_references(registry, models))
    problems.extend(_check_interpretation_opt_in(registry))
    return problems


def build_dag(registry: Registry) -> dict[str, list[dict[str, Any]]]:
    """Evidence DAG in the shape of N-07f: claim types, methods and methodologies as nodes."""
    layers = claim_type_layers(registry)
    levels = claim_type_levels(registry)
    made_by = producers(registry)
    mechanism_of = {name: item.mechanism for name, item in registry.level_1.items()}
    for claim_type, owner_ids in made_by.items():
        owner = registry.methods.get(owner_ids[0])
        mechanism_of.setdefault(claim_type, owner.mechanism if owner else None)

    nodes: list[dict[str, Any]] = [
        {
            "id": claim_type,
            "kind": "claim_type",
            "layer": layers.get(claim_type),
            "mechanism": mechanism_of.get(claim_type),
            "level": levels.get(claim_type),
        }
        for claim_type in sorted(layers)
    ]
    edges: list[dict[str, str]] = []
    for method in registry.methods.values():
        nodes.append(
            {"id": method.id, "kind": "method", "layer": method.layer, "mechanism": method.mechanism}
        )
        edges.extend(
            {"from": req.claim_type, "to": method.id, "kind": "requires"} for req in method.requires
        )
        edges.append({"from": method.id, "to": method.produces, "kind": "produces"})
    for methodology in registry.methodologies.values():
        nodes.append(
            {
                "id": methodology.id,
                "kind": "methodology",
                "layer": methodology_layer(registry, methodology.id),
                "mechanism": None,
            }
        )
        edges.extend(
            {"from": step_id, "to": methodology.id, "kind": "step"}
            for step_id in _step_ids(methodology)
        )
        if synthesis := _synthesis(methodology):
            edges.append({"from": methodology.id, "to": synthesis.produces, "kind": "produces"})
    return {"nodes": nodes, "edges": edges}
