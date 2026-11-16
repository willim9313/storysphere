"""Method engine: run one method over its scope with upstream back-fill (docs/spec/03 §3).

流程（每個 scope item 一筆 `runs`）：
  上游補跑 → plan → 逐 item：宣告式 preconditions → 方法的 `check()` → `run()` → 驗證草稿
  → `write_evidence`（只經這條）→ `complete_run`（取代同一分析的舊結果）。
一個 run 的檢查、執行、寫入在同一個交易：失敗就整個回滾，run 另開交易標 `failed`。
前提不成立（`not_applicable`）時不呼叫 `run()`，也就零次 LLM。

原型決定：
- 補跑的上游 run 記 `parent_run_id` ＝這次請求的**第一筆** run（scope item 要等上游補完、
  plan 出來才知道；所以第一筆 run 先建、事後補 scope_key）。
- item 依序跑（不併發）。
- 429（`rate_limited`）：該 run 標 `failed`（`summary_json.error_kind`）、後面的 item 不跑，
  結果的 `rate_limited=True`，由 job 層轉 `paused_quota`。
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.llm.errors import classify_step_failure, describe_exception
from storysphere.llm.router import llm_for, usable_models
from storysphere.llm.settings import REPO_ROOT, load_settings
from storysphere.methods.base import Method, Precheck, RunContext, ScopeItem
from storysphere.methods.implementations import MethodImplementations, default_implementations
from storysphere.methods.reader import EvidenceReader
from storysphere.registry.checks import execution_order, producers
from storysphere.registry.loader import Registry, load_registry
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft, WriteContext, write_evidence
from storysphere.store.lifecycle import complete_run
from storysphere.store.tables import Evidence, Run

logger = logging.getLogger(__name__)

TRIGGERS = ("auto", "user", "agent")
_PRODUCED_VIA = {"auto": "pipeline", "user": "ui", "agent": "agent"}

Outcome = Literal["done", "not_applicable", "failed", "not_implemented"]
ModelInfo = Callable[[str], tuple[str | None, str | None]]


class UnknownMethodError(LookupError):
    """The id is neither a method nor a methodology of the registry (API 422 `unknown_ref`)."""


class MethodContractError(ValueError):
    """A method produced drafts that break its declaration."""


def default_model_info(task: str) -> tuple[str | None, str | None]:
    """(provider, model id) the task would use; (None, None) when nothing is usable."""
    try:
        settings = load_settings()
        names = usable_models(settings, task)
        if not names:
            return None, None
        model = settings.models[names[0]]
        return model.provider, model.id
    except Exception:  # 設定問題不該擋住「記錄這次用了什麼模型」；真的不能用時 llm_for 會自己報
        return None, None


@dataclass
class RunSummary:
    run_id: str
    method_id: str
    scope_key: str
    status: str  # done / not_applicable / failed
    evidence_count: int = 0
    precheck: dict[str, Any] | None = None
    error: str | None = None
    error_kind: str | None = None


@dataclass
class MethodRunResult:
    method_id: str
    outcome: Outcome
    runs: list[RunSummary] = field(default_factory=list)
    upstream: list[MethodRunResult] = field(default_factory=list)  # 補跑的上游，依執行順序
    rate_limited: bool = False
    detail: str | None = None  # not_implemented 的原因

    def all_runs(self) -> list[RunSummary]:
        """上游先、本方法後。"""
        return [r for up in self.upstream for r in up.all_runs()] + self.runs

    def not_implemented_ids(self) -> list[str]:
        found = [self.method_id] if self.outcome == "not_implemented" else []
        for up in self.upstream:
            found.extend(up.not_implemented_ids())
        return found


@dataclass
class MethodPlan:
    """Dry run (04 N-04a `plan[]`)：不叫 LLM、不寫入。"""

    steps: list[str]  # 依 DAG 順序，含要補跑的上游，最後是請求的方法
    not_implemented: list[str] = field(default_factory=list)
    blocked: list[str] = field(default_factory=list)  # 補不了的缺項（第 1 層類型或沒有產出者）


@dataclass
class _Call:
    """One top-level `run_method` call: who triggered it and what already ran."""

    book_id: str
    triggered_by: str
    job_id: str | None
    agent_session_id: str | None
    done: dict[str, MethodRunResult] = field(default_factory=dict)  # 每個上游只補跑一次
    active: list[str] = field(default_factory=list)  # 防循環


def default_registry() -> Registry:
    return load_registry(REPO_ROOT / "registry")


class MethodEngine:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        registry: Registry,
        implementations: MethodImplementations,
        *,
        llm_factory: Callable[[str], Any] = llm_for,
        model_info: ModelInfo = default_model_info,
    ) -> None:
        self.session_factory = session_factory
        self.registry = registry
        self.implementations = implementations
        self._llm_factory = llm_factory
        self._model_info = model_info
        self._made_by = producers(registry)
        self._order = {node: i for i, node in enumerate(execution_order(registry))}

    # ── 公開介面 ──────────────────────────────────────────────

    def is_implemented(self, method_id: str) -> bool:
        return method_id in self.registry.methods and self.implementations.get(method_id) is not None

    async def run_method(
        self,
        book_id: str,
        method_id: str,
        *,
        params: dict[str, Any] | None = None,
        scope: Sequence[str] | None = None,
        triggered_by: str,
        parent_run_id: str | None = None,
        job_id: str | None = None,
        agent_session_id: str | None = None,
    ) -> MethodRunResult:
        """Run a method (and any missing upstream) now; returns what happened.

        `scope`＝主體證據 id（04 的 `subjectIds`），不給就照宣告。
        """
        if triggered_by not in TRIGGERS:
            raise ValueError(f"triggered_by must be one of {TRIGGERS}")
        call = _Call(book_id, triggered_by, job_id, agent_session_id)
        return await self._run(call, method_id, dict(params or {}), scope, parent_run_id)

    async def plan_method(self, book_id: str, method_id: str) -> MethodPlan:
        """Which methods would run, in order, for `method_id` on this book (no side effects)."""
        plan = MethodPlan(steps=[])
        await self._plan(book_id, method_id, plan, set())
        return plan

    async def has_done_run(self, book_id: str, method_id: str, job_id: str) -> bool:
        async with self.session_factory() as session:
            found = await session.scalar(
                select(Run.id)
                .where(
                    Run.book_id == book_id,
                    Run.ref_id == method_id,
                    Run.job_id == job_id,
                    Run.status == "done",
                )
                .limit(1)
            )
        return found is not None

    # ── 內部：一個方法 ────────────────────────────────────────

    async def _run(
        self,
        call: _Call,
        method_id: str,
        params: dict[str, Any],
        scope: Sequence[str] | None,
        parent_run_id: str | None,
    ) -> MethodRunResult:
        decl = self.registry.methods.get(method_id)
        if decl is None:
            if method_id in self.registry.methodologies:
                return MethodRunResult(method_id, "not_implemented", detail="methodology")
            raise UnknownMethodError(method_id)
        impl = self.implementations.get(method_id)
        if impl is None:
            return MethodRunResult(method_id, "not_implemented", detail="no_implementation")
        if method_id in call.active:
            raise RuntimeError(f"dependency cycle through '{method_id}'")

        call.active.append(method_id)
        try:
            result = await self._run_implemented(call, decl, impl, params, scope, parent_run_id)
        finally:
            call.active.pop()
        call.done[method_id] = result
        return result

    async def _run_implemented(
        self,
        call: _Call,
        decl: MethodDecl,
        impl: Method,
        params: dict[str, Any],
        scope: Sequence[str] | None,
        parent_run_id: str | None,
    ) -> MethodRunResult:
        result = MethodRunResult(decl.id, "done")
        first = await self._create_run(call, decl, impl, params, "", parent_run_id)

        # 1. 上游補跑
        unresolved = await self._fill_upstream(call, decl, first.id, result)
        if result.rate_limited:
            await self._finish_run(first.id, "failed", error="upstream rate limited",
                                   summary={"error_kind": "rate_limited"})
            result.runs.append(RunSummary(first.id, decl.id, "", "failed", error_kind="rate_limited"))
            result.outcome = "failed"
            return result
        if unresolved:
            precheck = self._unmet(unresolved)
            await self._finish_run(first.id, "not_applicable", precheck=precheck)
            result.runs.append(RunSummary(first.id, decl.id, "", "not_applicable",
                                          precheck=precheck.to_json()))
            result.outcome = "not_applicable"
            return result

        # 2. plan
        try:
            items = await self._plan_items(call, decl, impl, params, scope)
        except Exception as exc:
            return await self._fail_first(result, first.id, decl.id, exc)
        if not items:
            precheck = Precheck.unmet(
                ["scope"],
                f"沒有符合範圍的主體（{decl.scope_selector or decl.scope}）",
                "證據庫裡沒有這類主體時，重跑也不會有結果",
            )
            await self._finish_run(first.id, "not_applicable", precheck=precheck)
            result.runs.append(RunSummary(first.id, decl.id, "", "not_applicable",
                                          precheck=precheck.to_json()))
            result.outcome = "not_applicable"
            return result

        # 3. 逐 item
        seen: set[str] = set()
        for index, item in enumerate(items):
            if item.key in seen:
                continue
            seen.add(item.key)
            if index == 0:
                run_id = first.id
                await self._set_scope_key(run_id, item.key)
            else:
                run_id = (await self._create_run(call, decl, impl, params, item.key,
                                                 parent_run_id)).id
            summary = await self._execute_item(call, decl, impl, params, scope, run_id, item)
            result.runs.append(summary)
            if summary.error_kind == "rate_limited":
                result.rate_limited = True
                break
        statuses = {r.status for r in result.runs}
        result.outcome = (
            "failed" if "failed" in statuses else "done" if "done" in statuses else "not_applicable"
        )
        return result

    async def _fail_first(
        self, result: MethodRunResult, run_id: str, method_id: str, exc: Exception
    ) -> MethodRunResult:
        kind = classify_step_failure(exc)
        await self._finish_run(run_id, "failed", error=describe_exception(exc),
                               summary={"error_kind": kind})
        result.runs.append(RunSummary(run_id, method_id, "", "failed",
                                      error=describe_exception(exc), error_kind=kind))
        result.outcome = "failed"
        result.rate_limited = kind == "rate_limited"
        return result

    # ── 上游補跑 ──────────────────────────────────────────────

    def _required_types(self, decl: MethodDecl) -> list[str]:
        return list(dict.fromkeys(r.claim_type for r in decl.requires if not r.optional))

    async def _count(self, book_id: str, claim_type: str) -> int:
        async with self.session_factory() as session:
            reader = EvidenceReader(session, book_id, [claim_type])
            return await reader.count(claim_type)

    async def _fill_upstream(
        self, call: _Call, decl: MethodDecl, parent_run_id: str, result: MethodRunResult
    ) -> list[str]:
        """Back-fill missing required types; return the types that stay missing."""
        missing = [t for t in self._required_types(decl) if await self._count(call.book_id, t) == 0]
        missing.sort(key=lambda t: self._order.get(self._owner(t) or "", -1))
        unresolved: list[str] = []
        for claim_type in missing:
            owner = self._owner(claim_type)
            # 第 1 層類型由入庫步驟產出，方法補不了；沒有產出者／產出者是方法論也一樣
            if claim_type in self.registry.level_1 or owner not in self.registry.methods:
                unresolved.append(claim_type)
                continue
            if owner in call.done:
                upstream = call.done[owner]
            else:
                upstream = await self._run(call, owner, {}, None, parent_run_id)
                result.upstream.append(upstream)
            if upstream.rate_limited:
                result.rate_limited = True
                return unresolved
            if await self._count(call.book_id, claim_type) == 0:
                unresolved.append(claim_type)
        return unresolved

    def _owner(self, claim_type: str) -> str | None:
        owners = self._made_by.get(claim_type, [])
        return owners[0] if owners else None

    def _unmet(self, types: Sequence[str]) -> Precheck:
        """缺的證據類型 → 缺什麼、怎麼補、補了也沒用的情況。"""
        fixes: list[str] = []
        useless: list[str] = []
        for claim_type in types:
            level_1 = self.registry.level_1.get(claim_type)
            owner = self._owner(claim_type)
            if level_1 is not None:
                fixes.append(f"{claim_type}：重新執行入庫（第 1 層證據由入庫步驟抽取）")
                if level_1.mechanism:
                    useless.append(f"若這本書沒有「{level_1.mechanism}」機制，重新入庫也不會有 {claim_type}")
            elif owner in self.registry.methods and not self.is_implemented(owner):
                fixes.append(f"{claim_type}：由 {owner} 產出，但它尚未實作")
            elif owner is not None:
                fixes.append(f"{claim_type}：先執行 {owner}；若已執行過，表示它沒有產出（見它的 run）")
            else:
                fixes.append(f"{claim_type}：沒有任何方法產出它")
        return Precheck.unmet(types, "；".join(fixes), "；".join(useless))

    async def _plan(self, book_id: str, method_id: str, plan: MethodPlan, seen: set[str]) -> None:
        if method_id in seen:
            return
        seen.add(method_id)
        decl = self.registry.methods.get(method_id)
        if decl is None or not self.is_implemented(method_id):
            plan.not_implemented.append(method_id)
            return
        for claim_type in self._required_types(decl):
            if await self._count(book_id, claim_type) > 0:
                continue
            owner = self._owner(claim_type)
            if claim_type in self.registry.level_1 or owner not in self.registry.methods:
                plan.blocked.append(claim_type)
            else:
                await self._plan(book_id, owner, plan, seen)
        plan.steps.append(method_id)

    # ── plan 與 context ───────────────────────────────────────

    def _allowed_types(self, decl: MethodDecl) -> set[str]:
        return {r.claim_type for r in decl.requires} | {p.exists for p in decl.preconditions}

    def _context(
        self,
        session: AsyncSession,
        call: _Call,
        decl: MethodDecl,
        params: dict[str, Any],
        scope: Sequence[str] | None,
    ) -> RunContext:
        return RunContext(
            book_id=call.book_id,
            decl=decl,
            params=params,
            evidence=EvidenceReader(session, call.book_id, self._allowed_types(decl)),
            subject_ids=tuple(scope) if scope is not None else None,
            _llm_factory=self._llm_factory,
        )

    async def _plan_items(
        self,
        call: _Call,
        decl: MethodDecl,
        impl: Method,
        params: dict[str, Any],
        scope: Sequence[str] | None,
    ) -> list[ScopeItem]:
        async with self.session_factory() as session:
            return list(await impl.plan(self._context(session, call, decl, params, scope)))

    # ── 一個 scope item ───────────────────────────────────────

    async def _execute_item(
        self,
        call: _Call,
        decl: MethodDecl,
        impl: Method,
        params: dict[str, Any],
        scope: Sequence[str] | None,
        run_id: str,
        item: ScopeItem,
    ) -> RunSummary:
        try:
            async with self.session_factory() as session, session.begin():
                ctx = self._context(session, call, decl, params, scope)
                precheck = await self._declared_precheck(ctx)
                if precheck.ok:
                    precheck = await impl.check(ctx, item)
                if not precheck.ok:
                    await self._finish_run_in(
                        session, run_id, "not_applicable", precheck=precheck,
                        input_ids=ctx.read_ids,
                    )
                    return RunSummary(run_id, decl.id, item.key, "not_applicable",
                                      precheck=precheck.to_json())

                drafts = list(await impl.run(ctx, item))
                await self._validate_drafts(session, call.book_id, decl, drafts)
                write_ctx = WriteContext(
                    book_id=call.book_id,
                    source="method",
                    produced_via=_PRODUCED_VIA[call.triggered_by],
                    run_id=run_id,
                )
                for draft in drafts:
                    await write_evidence(session, write_ctx, draft)
                run = await session.get(Run, run_id)
                run.input_evidence_ids = ctx.read_ids
                run.summary_json = ctx.summary or None
                await complete_run(session, run_id)
                return RunSummary(run_id, decl.id, item.key, "done", evidence_count=len(drafts))
        except Exception as exc:
            logger.exception("Run %s of %s failed", run_id, decl.id)
            kind = classify_step_failure(exc)
            await self._finish_run(run_id, "failed", error=describe_exception(exc),
                                   summary={"error_kind": kind})
            return RunSummary(run_id, decl.id, item.key, "failed",
                              error=describe_exception(exc), error_kind=kind)

    async def _declared_precheck(self, ctx: RunContext) -> Precheck:
        """宣告式 `preconditions`（`exists: <type>`）：機械判斷，不叫 LLM。"""
        missing = [p.exists for p in ctx.decl.preconditions if await ctx.evidence.count(p.exists) == 0]
        return Precheck.passed() if not missing else self._unmet(missing)

    async def _validate_drafts(
        self, session: AsyncSession, book_id: str, decl: MethodDecl, drafts: list[EvidenceDraft]
    ) -> None:
        """產出類型要是宣告的 `produces`；`derived_from` 只能是宣告讀取的類型。"""
        for draft in drafts:
            if draft.claim_type != decl.produces:
                raise MethodContractError(
                    f"'{decl.id}' produces '{decl.produces}' but returned '{draft.claim_type}'"
                )
        upstream_ids = {uid for draft in drafts for uid in draft.derived_from}
        if not upstream_ids:
            return
        rows = await session.execute(
            select(Evidence.id, Evidence.claim_type).where(
                Evidence.id.in_(upstream_ids), Evidence.book_id == book_id
            )
        )
        types = {row.id: row.claim_type for row in rows}
        declared = {r.claim_type for r in decl.requires}
        for uid in sorted(upstream_ids):
            if uid not in types:
                raise MethodContractError(f"derived_from '{uid}' is not evidence of this book")
            if types[uid] not in declared:
                raise MethodContractError(
                    f"'{decl.id}' derives from a '{types[uid]}' it does not declare in requires"
                )

    # ── runs 表 ───────────────────────────────────────────────

    async def _create_run(
        self,
        call: _Call,
        decl: MethodDecl,
        impl: Method,
        params: dict[str, Any],
        scope_key: str,
        parent_run_id: str | None,
    ) -> Run:
        provider, model = (None, None)
        if decl.impl.llm_task:
            provider, model = self._model_info(decl.impl.llm_task)
        run = Run(
            book_id=call.book_id,
            ref_id=decl.id,
            ref_version=decl.version,
            prompt_version=getattr(impl, "prompt_version", None),
            provider=provider,
            model=model,
            params_json=params or None,
            scope_key=scope_key,
            status="running",
            parent_run_id=parent_run_id,
            job_id=call.job_id,
            triggered_by=call.triggered_by,
            agent_session_id=call.agent_session_id,
            started_at=datetime.now(UTC),
        )
        async with self.session_factory() as session, session.begin():
            session.add(run)
        return run

    async def _set_scope_key(self, run_id: str, scope_key: str) -> None:
        async with self.session_factory() as session, session.begin():
            (await session.get(Run, run_id)).scope_key = scope_key

    async def _finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        async with self.session_factory() as session, session.begin():
            await self._finish_run_in(session, run_id, status, **kwargs)

    @staticmethod
    async def _finish_run_in(
        session: AsyncSession,
        run_id: str,
        status: str,
        *,
        precheck: Precheck | None = None,
        error: str | None = None,
        summary: dict[str, Any] | None = None,
        input_ids: list[str] | None = None,
    ) -> None:
        run = await session.get(Run, run_id)
        run.status = status
        run.finished_at = datetime.now(UTC)
        if precheck is not None:
            run.precheck_json = precheck.to_json()
        if error is not None:
            run.error = error
        if summary is not None:
            run.summary_json = summary
        if input_ids is not None:
            run.input_evidence_ids = input_ids


def default_method_engine(session_factory: async_sessionmaker[AsyncSession]) -> MethodEngine:
    """正式的 registry 與實作；入庫的 S5 沒收到引擎時用這個。"""
    registry = default_registry()
    return MethodEngine(session_factory, registry, default_implementations(registry))
