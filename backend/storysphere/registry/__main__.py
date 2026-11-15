"""Registry command line.

    uv run python -m storysphere.registry check    # 閘門 3（CLAUDE.md）：六條檢查
    uv run python -m storysphere.registry dag      # 輸出證據 DAG（JSON）

從目前工作目錄的 `registry/` 讀取宣告檔。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from storysphere.registry.checks import build_dag, check_registry
from storysphere.registry.loader import Registry, RegistryLoadError, load_registry

USAGE = "usage: python -m storysphere.registry (check|dag)"


def _load(root: Path) -> Registry | None:
    try:
        return load_registry(root)
    except RegistryLoadError as exc:
        for problem in exc.problems:
            print(f"[load] {problem}", file=sys.stderr)
        return None


def check(root: Path) -> int:
    registry = _load(root)
    if registry is None:
        return 1
    problems = check_registry(registry)
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"registry check failed: {len(problems)} problem(s)", file=sys.stderr)
        return 1
    print(
        f"registry ok: {len(registry.methods)} methods, "
        f"{len(registry.methodologies)} methodologies, {len(registry.views)} views, "
        f"{len(registry.perspectives)} perspectives"
    )
    return 0


def dag(root: Path) -> int:
    registry = _load(root)
    if registry is None:
        return 1
    problems = check_registry(registry)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print(json.dumps(build_dag(registry), ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    root = Path.cwd() / "registry"
    if args == ["check"]:
        return check(root)
    if args == ["dag"]:
        return dag(root)
    print(USAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
