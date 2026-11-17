"""`method_run` jobs: create, de-duplicate, execute (docs/spec/04 §3).

去重（04 §3.3「同一分析並發觸發接到同一個 job」）：在**行程內的一把鎖**之內「查未結束的同一分析 job →
沒有才建」，查與建同在一個鎖區間，所以同一行程內任意多個並發呼叫只會產生一個 job。
限制：鎖只在單一行程內有效；多行程（例如多個 uvicorn worker）要改成資料庫層的唯一約束，
原型只跑單一行程。鎖掛在這個物件上，不是模組全域（asyncio.Lock 綁事件迴圈）。

「同一分析」＝同書、同方法、同 `params`、同 `scope`（subjectIds）。它比 01 §4 的
`(book, ref_id, scope_key)` 細：觸發當下 plan 還沒跑，算不出 scope_key。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from storysphere.methods.engine import MethodEngine, MethodRunResult, UnknownMethodError
from storysphere.store.tables import Job

logger = logging.getLogger(__name__)

METHOD_JOB_KIND = "method_run"
# 04 §3.3：入庫類 job 未完成時不能觸發方法
INGEST_JOB_KINDS = ("ingest", "ingest_retry", "ingest_rerun", "genre_s4")
TERMINAL_STATUSES = ("done", "error", "cancelled")


class JobConflictError(Exception):
    """An ingestion job of the book is still unfinished (API 409 `job_conflict`)."""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        super().__init__(f"Ingestion job {job_id} is not finished")


@dataclass(frozen=True)
class TriggerResult:
    job_id: str
    attached: bool  # True＝接到既有的同一分析（04 `status: "attached"`）


def dedupe_key(
    book_id: str, method_id: str, params: dict[str, Any], scope: Sequence[str] | None
) -> str:
    return json.dumps(
        {
            "book_id": book_id,
            "method_id": method_id,
            "params": params,
            "scope": sorted(scope) if scope is not None else None,
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _run_ids(result: MethodRunResult) -> list[str]:
    return [r.run_id for r in result.all_runs()]


class MethodJobs:
    def __init__(self, engine: MethodEngine) -> None:
        self.engine = engine
        self._lock = asyncio.Lock()
        self._tasks: dict[str, asyncio.Task[None]] = {}

    async def trigger_method(
        self,
        book_id: str,
        method_id: str,
        *,
        params: dict[str, Any] | None = None,
        scope: Sequence[str] | None = None,
        triggered_by: str,
        agent_session_id: str | None = None,
        start: bool = True,
    ) -> TriggerResult:
        """Create a `method_run` job (or attach to the same analysis in flight) and start it."""
        registry = self.engine.registry
        if method_id not in registry.methods and method_id not in registry.methodologies:
            raise UnknownMethodError(method_id)
        params = dict(params or {})
        key = dedupe_key(book_id, method_id, params, scope)

        async with self._lock:
            async with self.engine.session_factory() as session, session.begin():
                open_jobs = list(
                    await session.scalars(
                        select(Job).where(
                            Job.book_id == book_id,
                            Job.status.not_in(TERMINAL_STATUSES),
                            Job.kind.in_((*INGEST_JOB_KINDS, METHOD_JOB_KIND)),
                        )
                    )
                )
                for job in open_jobs:
                    if job.kind in INGEST_JOB_KINDS:
                        raise JobConflictError(job.id)
                for job in open_jobs:
                    if (job.params_json or {}).get("dedupe_key") == key:
                        return TriggerResult(job.id, attached=True)
                decl = registry.methods.get(method_id)
                job = Job(
                    kind=METHOD_JOB_KIND,
                    book_id=book_id,
                    title=f"{decl.code} {decl.question}" if decl else method_id,
                    status="pending",
                    stage=method_id,
                    params_json={
                        "method_id": method_id,
                        "params": params,
                        "scope": list(scope) if scope is not None else None,
                        "triggered_by": triggered_by,
                        "agent_session_id": agent_session_id,
                        "dedupe_key": key,
                    },
                )
                session.add(job)
            job_id = job.id

        if start:
            self.start(job_id)
        return TriggerResult(job_id, attached=False)

    def start(self, job_id: str) -> asyncio.Task[None]:
        """Run a `pending` job in the background (also used to resume a paused one)."""
        task = asyncio.create_task(self.execute_job(job_id))
        self._tasks[job_id] = task
        task.add_done_callback(lambda _t, jid=job_id: self._tasks.pop(jid, None))
        return task

    def task(self, job_id: str) -> asyncio.Task[None] | None:
        """The background task of `job_id` in this process, if it is still running."""
        return self._tasks.get(job_id)

    async def wait(self, job_id: str) -> None:
        """Wait until the background task of `job_id` (if still running here) finishes."""
        task = self._tasks.get(job_id)
        if task is not None:
            await asyncio.shield(task)

    async def execute_job(self, job_id: str) -> None:
        """Run a `pending` job to its end state (04 §3.2). Never raises."""
        sf = self.engine.session_factory
        async with sf() as session, session.begin():
            job = await session.get(Job, job_id)
            params = dict(job.params_json or {})
            job.status = "running"
            job.started_at = datetime.now(UTC)
            book_id = job.book_id

        try:
            result = await self.engine.run_method(
                book_id,
                params["method_id"],
                params=params.get("params"),
                scope=params.get("scope"),
                triggered_by=params["triggered_by"],
                job_id=job_id,
                agent_session_id=params.get("agent_session_id"),
            )
        except Exception as exc:
            logger.exception("Method job %s failed", job_id)
            async with sf() as session, session.begin():
                job = await session.get(Job, job_id)
                job.status = "error"
                job.error = str(exc) or type(exc).__name__
                job.error_kind = "unknown_ref" if isinstance(exc, UnknownMethodError) else "internal"
                job.finished_at = datetime.now(UTC)
            return

        runs = result.all_runs()
        async with sf() as session, session.begin():
            job = await session.get(Job, job_id)
            # result_json 要整個換掉；原地改 dict，SQLAlchemy 不會發現有變動。
            job.result_json = {
                "methodId": result.method_id,
                "outcome": result.outcome,
                "runIds": _run_ids(result),
                "failedRunCount": sum(1 for r in runs if r.status == "failed"),
                "notImplemented": result.not_implemented_ids(),
            }
            if result.rate_limited:
                # 429 不算失敗（04 §3.2）：可稍後續跑
                job.status = "paused_quota"
            else:
                job.status = "done"
                job.progress = 100
                job.finished_at = datetime.now(UTC)
