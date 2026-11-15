"""Load the registry YAML files into validated declarations (docs/spec/03 §1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TypeVar

import yaml
from pydantic import BaseModel, ValidationError

from storysphere.registry.models import (
    ClaimTypeCatalog,
    Level1Type,
    Mechanism,
    MechanismCatalog,
    MethodDecl,
    MethodologyDecl,
    Orphan,
    OrphanList,
    PerspectiveDecl,
    ViewCatalog,
    ViewDecl,
)

T = TypeVar("T", bound=BaseModel)

MECHANISMS_FILE = "mechanisms.yaml"  # 放在 perspectives/ 下（03 §5）


class RegistryLoadError(ValueError):
    """A registry file is missing, unreadable or does not match its schema."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("\n".join(problems))


@dataclass
class Registry:
    methods: dict[str, MethodDecl] = field(default_factory=dict)
    methodologies: dict[str, MethodologyDecl] = field(default_factory=dict)
    views: dict[str, ViewDecl] = field(default_factory=dict)
    perspectives: dict[str, PerspectiveDecl] = field(default_factory=dict)
    mechanisms: dict[str, Mechanism] = field(default_factory=dict)
    level_1: dict[str, Level1Type] = field(default_factory=dict)
    orphans: dict[str, Orphan] = field(default_factory=dict)


def _parse(path: Path, model: type[T], problems: list[str]) -> T | None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return model.model_validate(data)
    except (OSError, yaml.YAMLError, ValidationError) as exc:
        problems.append(f"{path}: {exc}")
        return None


def _put(target: dict, key: str, value, path: Path, problems: list[str]) -> None:
    if key in target:
        problems.append(f"{path}: duplicate id '{key}'")
    else:
        target[key] = value


def load_registry(root: Path) -> Registry:
    """Read every declaration under `root`. Raises RegistryLoadError listing all bad files."""
    registry = Registry()
    problems: list[str] = []

    for path in sorted((root / "methods").glob("*.yaml")):
        if decl := _parse(path, MethodDecl, problems):
            _put(registry.methods, decl.id, decl, path, problems)
    for path in sorted((root / "methodologies").glob("*.yaml")):
        if decl := _parse(path, MethodologyDecl, problems):
            _put(registry.methodologies, decl.id, decl, path, problems)
    for path in sorted((root / "views").glob("*.yaml")):
        if catalog := _parse(path, ViewCatalog, problems):
            for view in catalog.views:
                _put(registry.views, view.view_type, view, path, problems)
    for path in sorted((root / "perspectives").glob("*.yaml")):
        if path.name == MECHANISMS_FILE:
            if catalog := _parse(path, MechanismCatalog, problems):
                for mechanism in catalog.mechanisms:
                    _put(registry.mechanisms, mechanism.id, mechanism, path, problems)
        elif decl := _parse(path, PerspectiveDecl, problems):
            _put(registry.perspectives, decl.genre, decl, path, problems)

    claim_types_path = root / "claim_types.yaml"
    if claim_types_path.exists():
        if catalog := _parse(claim_types_path, ClaimTypeCatalog, problems):
            for item in catalog.level_1:
                _put(registry.level_1, item.claim_type, item, claim_types_path, problems)
    orphans_path = root / "orphans_allowed.yaml"
    if orphans_path.exists():
        if orphan_list := _parse(orphans_path, OrphanList, problems):
            for orphan in orphan_list.orphans:
                _put(registry.orphans, orphan.claim_type, orphan, orphans_path, problems)

    shared = registry.methods.keys() & registry.methodologies.keys()
    problems.extend(f"id '{key}' is used by both a method and a methodology" for key in shared)
    if problems:
        raise RegistryLoadError(problems)
    return registry
