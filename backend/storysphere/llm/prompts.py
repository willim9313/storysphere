"""Prompt 載入器：讀 `prompts/<name>.md` 的 `## meta`、`## system`、`## user` 三節。

改 prompt 就升 `meta.version`；呼叫端把 `Prompt.version` 寫進 `runs.prompt_version`。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from storysphere.llm.settings import REPO_ROOT

PROMPTS_DIR = REPO_ROOT / "prompts"

_SECTION_RE = re.compile(r"^## (meta|system|user)[ \t]*$", re.MULTILINE)
_YAML_BLOCK_RE = re.compile(r"```yaml\s*\n(.*?)\n```", re.DOTALL)
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")
_META_KEYS = ("id", "version", "task")


@dataclass(frozen=True)
class Prompt:
    id: str
    version: str
    task: str
    system: str
    user: str

    def render(self, **variables: str) -> tuple[str, str]:
        """回傳 `(system, user)`；缺變數丟 `KeyError`。

        單次 regex 取代：變數值裡的 `{{...}}`（書的正文可能有）不會被再展開。
        """

        def fill(text: str) -> str:
            def sub(match: re.Match[str]) -> str:
                name = match.group(1)
                if name not in variables:
                    raise KeyError(name)
                return str(variables[name])

            return _PLACEHOLDER_RE.sub(sub, text)

        return fill(self.system), fill(self.user)


def load_prompt(name: str, *, base_dir: Path | None = None) -> Prompt:
    """載入 `prompts/<name>.md`（例：`"ingest/core_extraction"`）。"""
    path = (base_dir or PROMPTS_DIR) / f"{name}.md"
    text = path.read_text(encoding="utf-8")

    matches = list(_SECTION_RE.finditer(text))
    sections: dict[str, str] = {}
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections.setdefault(match.group(1), text[match.end() : end].strip())
    for key in ("meta", "system", "user"):
        if not sections.get(key):
            raise ValueError(f"prompt {name!r}: missing section '## {key}'")

    block = _YAML_BLOCK_RE.search(sections["meta"])
    if block is None:
        raise ValueError(f"prompt {name!r}: '## meta' has no yaml block")
    meta = yaml.safe_load(block.group(1))
    if not isinstance(meta, dict):
        raise ValueError(f"prompt {name!r}: '## meta' yaml is not a mapping")
    for key in _META_KEYS:
        if meta.get(key) in (None, ""):
            raise ValueError(f"prompt {name!r}: meta is missing {key!r}")

    return Prompt(
        id=str(meta["id"]),
        version=str(meta["version"]),
        task=str(meta["task"]),
        system=sections["system"],
        user=sections["user"],
    )
