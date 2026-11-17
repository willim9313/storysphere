"""Card state and no-LLM prechecks (docs/spec/04 N-03b、N-03c、N-04a)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.queries.runs import is_superseded, latest_done
from storysphere.methods.engine import MethodEngine
from storysphere.methods.jobs import METHOD_JOB_KIND, TERMINAL_STATUSES
from storysphere.store.tables import Evidence, Job, Run


@dataclass
class CardState:
    state: str
    run_id: str | None = None
    job_id: str | None = None
    max_level: int | None = None
    finished_at: Any = None
    precheck: dict[str, Any] | None = None


async def open_method_jobs(session: AsyncSession, book_id: str) -> dict[str, str]:
    """{method_id: job_id} of the book's unfinished `method_run` jobs."""
    jobs = await session.scalars(
        select(Job).where(
            Job.book_id == book_id,
            Job.kind == METHOD_JOB_KIND,
            Job.status.not_in(TERMINAL_STATUSES),
        )
    )
    return {(job.params_json or {}).get("method_id"): job.id for job in jobs}


async def card_state(
    session: AsyncSession, book_id: str, ref_id: str, open_jobs: dict[str, str]
) -> CardState:
    """State of one card, from the newest run of ``ref_id`` (04 N-03b 的規則)."""
    runs = list(
        await session.scalars(
            select(Run)
            .where(Run.book_id == book_id, Run.ref_id == ref_id)
            .order_by(Run.created_at.desc(), Run.id)
        )
    )
    job_id = open_jobs.get(ref_id)
    if job_id is not None or any(run.status in ("queued", "running") for run in runs):
        running = next((run for run in runs if run.status in ("queued", "running")), None)
        if running is not None:
            return CardState("running", run_id=running.id, job_id=job_id or running.job_id)
        return CardState("running", job_id=job_id)
    if not runs:
        return CardState("not_run")

    newest = await latest_done(session, book_id)
    # 每個 scope（例如每個角色）最新的那筆才算數。
    current = [run for run in runs if not is_superseded(run, newest)]
    current_ids = [run.id for run in current]
    # 每個主體一筆 run 的方法（CH2、CH5、MY4）常常只有部分主體適用：
    # 任一 scope 完成就算完成，卡片連到最新完成的那筆（使用者 2026-11-17 決定，04 N-03b）。
    latest = next((run for run in current if run.status == "done"), runs[0])
    max_level, changed = (
        await session.execute(
            select(func.max(Evidence.level), func.max(Evidence.basis_changed.cast(Integer)))
            .where(Evidence.run_id.in_(current_ids), Evidence.status == "current")
        )
    ).one()
    state = latest.status
    if state == "done" and changed:
        state = "basis_changed"
    elif state not in ("done", "not_applicable", "failed"):
        state = "failed"  # cancelled 等：卡片只有六態，當成要重跑
    return CardState(
        state,
        run_id=latest.id,
        job_id=latest.job_id,
        max_level=max_level,
        finished_at=latest.finished_at,
        precheck=latest.precheck_json,
    )


async def static_precheck(engine: MethodEngine, book_id: str, ref_id: str) -> dict[str, Any] | None:
    """Precheck that needs no LLM: required level-1 types the book does not have.

    方法自己的 `check()`（數量門檻等）要在 job 裡跑；這裡只看 `plan_method` 補不了的缺項。
    """
    if not engine.is_implemented(ref_id):
        return None
    plan = await engine.plan_method(book_id, ref_id)
    if not plan.blocked:
        return None
    return {
        "missing": sorted(set(plan.blocked)),
        "how_to_fix": "這些證據類型要由入庫抽取，方法補不出來；重新入庫或確認入庫有跑到該步驟",
        "when_useless_even_if_fixed": "書裡本來就沒有這類內容時，重新入庫也不會有",
    }
