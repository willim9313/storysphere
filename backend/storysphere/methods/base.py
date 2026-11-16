"""Method interface (docs/spec/03 §6): the contract every analysis method implements.

一個方法只做三件事：`plan` 決定要跑哪些主體、`check` 判斷前提是否成立、`run` 讀證據庫並產出草稿。
三者都不直接碰資料庫寫入；寫入、run 紀錄、交易邊界都由引擎（`engine.py`）負責。
`RunContext` 是方法唯一的資料入口：它只提供唯讀的證據查詢（`EvidenceReader`），
**沒有讀原文段落的途徑**（CLAUDE.md：方法只讀證據庫）。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from storysphere.methods.reader import EvidenceReader
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft


@dataclass(frozen=True)
class ScopeItem:
    """One subject a method is run on; one item ⇒ one `runs` row.

    - `subject_id`：主體的證據 id（角色、事件、意象、真相、詭計）；`book` 範圍沒有。
    - `chapter`：只有 `per_character_chapter` 用。
    - `focus_ids`：`book` 範圍加 `scope_selector` 時選出的主體（例：NS1 的主角），
      不進 `scope_key`——同一本書的 NS1 仍是同一個分析。
    """

    subject_id: str | None = None
    chapter: int | None = None
    label: str = ""
    focus_ids: tuple[str, ...] = ()

    @property
    def key(self) -> str:
        """`runs.scope_key`：book＝空字串；否則 `subject:<id>` 或 `subject:<id>|chapter:<n>`。"""
        parts = []
        if self.subject_id is not None:
            parts.append(f"subject:{self.subject_id}")
        if self.chapter is not None:
            parts.append(f"chapter:{self.chapter}")
        return "|".join(parts)


@dataclass(frozen=True)
class Precheck:
    """前提檢查結果（03 §3「花 token 之前說清楚」）；不成立時不呼叫 LLM。"""

    ok: bool = True
    # 缺什麼：證據類型或條件描述
    missing: tuple[str, ...] = ()
    how_to_fix: str = ""
    # 補了也沒用的情況（例：這本書根本沒有該機制）
    when_useless_even_if_fixed: str = ""

    @classmethod
    def passed(cls) -> Precheck:
        return cls()

    @classmethod
    def unmet(
        cls,
        missing: Sequence[str],
        how_to_fix: str = "",
        when_useless_even_if_fixed: str = "",
    ) -> Precheck:
        return cls(False, tuple(missing), how_to_fix, when_useless_even_if_fixed)

    def to_json(self) -> dict[str, Any]:
        """`runs.precheck_json`（snake_case；API 層再轉 camelCase）。"""
        return {
            "missing": list(self.missing),
            "how_to_fix": self.how_to_fix,
            "when_useless_even_if_fixed": self.when_useless_even_if_fixed,
        }


@dataclass
class RunContext:
    """What a method gets. Built by the engine, one per scope item (plus one for `plan`)."""

    book_id: str
    decl: MethodDecl
    params: dict[str, Any]
    evidence: EvidenceReader
    # 使用者／agent 指定的主體 id（04 N-04a 的 subjectIds）；None＝照宣告的 scope_selector
    subject_ids: tuple[str, ...] | None = None
    # 方法可以填：寫進 `runs.summary_json`（書層級結論，例如 NS2 的 story_time_structure）
    summary: dict[str, Any] = field(default_factory=dict)
    _llm_factory: Callable[[str], Any] | None = None

    def llm(self, task: str | None = None) -> Any:
        """The model for `task` (default: the method's declared `llm_task`) via `llm_for`.

        方法一律經這裡取模型，不自己寫死 provider 或模型名；測試時引擎換成計數用的假物件。
        """
        task = task or self.decl.impl.llm_task
        if task is None:
            raise ValueError(f"Method '{self.decl.id}' declares no llm_task")
        if self._llm_factory is None:
            raise RuntimeError("This context has no LLM access")
        return self._llm_factory(task)

    @property
    def read_ids(self) -> list[str]:
        """這次讀過的證據 id（→ `runs.input_evidence_ids`）。"""
        return self.evidence.read_ids


@runtime_checkable
class Method(Protocol):
    decl: MethodDecl

    async def plan(self, ctx: RunContext) -> list[ScopeItem]:
        """依 scope／scope_selector 決定要跑哪些主體；不叫 LLM。"""
        ...

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        """方法自己的前提條件與涵蓋率；不成立時回原因，不叫 LLM。"""
        ...

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        """讀證據庫、產出草稿；不直接寫資料庫。"""
        ...


class MethodBase:
    """預設的 `plan`（照宣告的範圍選擇器）與 `check`（一律成立）；個別方法可覆寫。

    可選屬性 `prompt_version: str | None`：引擎寫進 `runs.prompt_version`（改 prompt 就要升版）。
    """

    prompt_version: str | None = None

    def __init__(self, decl: MethodDecl) -> None:
        self.decl = decl

    async def plan(self, ctx: RunContext) -> list[ScopeItem]:
        from storysphere.methods.selectors import default_plan

        return await default_plan(ctx)

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        return Precheck.passed()

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        raise NotImplementedError
