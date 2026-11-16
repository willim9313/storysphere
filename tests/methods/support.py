"""方法引擎測試的共用零件：測試專用的 registry 宣告、假方法、假 llm、播種第 1 層證據。

假方法的宣告全在測試裡建（不往 `registry/` 加 YAML）。
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from storysphere.methods.base import MethodBase, Precheck, RunContext, ScopeItem
from storysphere.methods.engine import MethodEngine
from storysphere.methods.implementations import MethodImplementations
from storysphere.registry.loader import Registry
from storysphere.registry.models import Impl, Level1Type, MethodDecl, Requirement
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    SubjectRef,
    WriteContext,
    write_evidence,
)

from tests.domain.minimal_content import MINIMAL_CONTENT
from tests.store.conftest import DEFAULT_QUOTE, FakeParagraphs, make_draft

BOOK = "book-m"

LEVEL_1 = {
    name: Level1Type(claim_type=name, layer="universal")
    for name in ("event", "character", "utterance", "imagery_motif", "relation_state")
}


def decl(
    method_id: str,
    requires: list[str | tuple[str, bool]],
    produces: str,
    *,
    scope: str = "book",
    selector: str | None = None,
    preconditions: list[str] | None = None,
    llm_task: str | None = "method_light",
) -> MethodDecl:
    """A test method declaration; `requires` items are a type or `(type, optional)`."""
    reqs = [
        Requirement(claim_type=r[0], optional=r[1]) if isinstance(r, tuple)
        else Requirement(claim_type=r)
        for r in requires
    ]
    return MethodDecl(
        kind="method",
        id=method_id,
        code=method_id.upper(),
        version=3,
        layer="universal",
        mechanism="測試",
        question=f"{method_id}?",
        basis="test",
        grade="衍生",
        preconditions=[{"exists": t} for t in preconditions or []],
        requires=reqs,
        produces=produces,
        scope=scope,
        scope_selector=selector,
        impl=Impl(kind="llm", module="test", llm_task=llm_task),
        view="evidence_list",
        priority="P0",
    )


def make_registry(*decls: MethodDecl) -> Registry:
    return Registry(level_1=dict(LEVEL_1), methods={d.id: d for d in decls})


class CountingLlm:
    """計數用的假 llm：`ainvoke` 每呼叫一次加一。"""

    def __init__(self, error: Exception | None = None, delay: float = 0.0) -> None:
        self.calls = 0
        self.error = error
        self.delay = delay

    async def ainvoke(self, _messages: Any = None) -> str:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error is not None:
            raise self.error
        return "ok"


class FakeMethod(MethodBase):
    """預設行為：呼叫一次 llm、讀第一個 requires 類型的證據，產出一筆衍生自它們的草稿。"""

    def __init__(
        self,
        method_decl: MethodDecl,
        *,
        check: Callable[[RunContext, ScopeItem], Awaitable[Precheck]] | None = None,
        run: Callable[[RunContext, ScopeItem], Awaitable[list[EvidenceDraft]]] | None = None,
        prompt_version: str | None = "p1",
    ) -> None:
        super().__init__(method_decl)
        self._check = check
        self._run = run
        self.prompt_version = prompt_version
        self.run_calls = 0

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        return await self._check(ctx, item) if self._check else Precheck.passed()

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        self.run_calls += 1
        if self._run is not None:
            return await self._run(ctx, item)
        await ctx.llm().ainvoke("prompt")
        upstream = await ctx.evidence.list(self.decl.requires[0].claim_type)
        return [draft_for(self.decl, [u.id for u in upstream])]


def draft_for(method_decl: MethodDecl, derived_from: list[str], **overrides: Any) -> EvidenceDraft:
    fields: dict[str, Any] = {
        "claim_type": method_decl.produces,
        "summary": f"{method_decl.id} 的結果",
        "confidence": 0.7,
        "content": MINIMAL_CONTENT[method_decl.produces],
        "derived_from": derived_from,
    }
    fields.update(overrides)
    return EvidenceDraft(**fields)


def make_engine(sf, registry: Registry, *methods: FakeMethod, llm: CountingLlm | None = None):
    impls = MethodImplementations()
    for method in methods:
        impls.register(method)
    llm = llm or CountingLlm()
    engine = MethodEngine(
        sf, registry, impls, llm_factory=lambda _task: llm, model_info=lambda _t: ("fake", "fake-1")
    )
    return engine, llm


async def seed(
    sf, claim_type: str, *, subjects: list[tuple[str, str]] | None = None, book_id: str = BOOK,
    discourse_chapter: int | None = None, **content: Any,
) -> str:
    """寫一筆第 1 層證據（走正式寫入路徑），回傳 id。"""
    ctx = WriteContext(book_id=book_id, source="extraction", produced_via="pipeline")
    draft = make_draft(
        claim_type,
        confidence=0.9,
        content={**MINIMAL_CONTENT[claim_type], **content},
        quotes=[DEFAULT_QUOTE],
        subjects=[SubjectRef(subject_id=s, role=r) for s, r in subjects or []],
        discourse_chapter=discourse_chapter,
    )
    async with sf() as session, session.begin():
        evidence = await write_evidence(session, ctx, draft, FakeParagraphs())
    return evidence.id


def no_method_engine(sf) -> MethodEngine:
    """S5 用的引擎，刻意不註冊任何實作：入庫圖測試不該去呼叫正式方法（它們會用真的 LLM）。"""
    from storysphere.methods.engine import default_registry

    return MethodEngine(
        sf, default_registry(), MethodImplementations(),
        llm_factory=lambda _task: CountingLlm(), model_info=lambda _t: (None, None),
    )
