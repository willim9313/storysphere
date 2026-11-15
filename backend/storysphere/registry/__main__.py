"""Registry command line.

    uv run python -m storysphere.registry check

閘門 3（CLAUDE.md）。T01 只有骨架：列出 registry/ 下各組宣告檔的數量；
docs/spec/03 §2 的六條檢查在 T05 實作，屆時有任何宣告檔而檢查未通過就要回非 0。
"""

from __future__ import annotations

import sys
from pathlib import Path

GROUPS = ("methods", "methodologies", "views", "perspectives")


def count_declarations(root: Path) -> dict[str, int]:
    return {group: len(list((root / group).glob("*.yaml"))) for group in GROUPS}


def check(root: Path) -> int:
    counts = count_declarations(root)
    for group, n in counts.items():
        print(f"{group}: {n} declaration file(s)")
    if any(counts.values()):
        # 有宣告檔卻還沒有檢查器時不能假裝通過。
        print("registry checks are not implemented yet (T05)", file=sys.stderr)
        return 1
    print("registry is empty; nothing to check")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args != ["check"]:
        print("usage: python -m storysphere.registry check", file=sys.stderr)
        return 2
    return check(Path.cwd() / "registry")


if __name__ == "__main__":
    raise SystemExit(main())
