"""Background tasks of ingest jobs in this process (N-01b、N-02e、N-09d、N-09e).

`method_run` 的背景工作由 `MethodJobs` 自己管；這裡只管入庫類 job。單一行程有效（同 `MethodJobs`）。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

# 取消時等工作停下來的上限；超過就不等了，照樣把 job 標成 cancelled。
STOP_TIMEOUT = 10.0


class JobTasks:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[Any]] = {}

    def spawn(self, job_id: str, coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
        task = asyncio.create_task(coro)
        self._tasks[job_id] = task
        task.add_done_callback(lambda done, jid=job_id: self._finished(jid, done))
        return task

    def get(self, job_id: str) -> asyncio.Task[Any] | None:
        return self._tasks.get(job_id)

    def _finished(self, job_id: str, task: asyncio.Task[Any]) -> None:
        if self._tasks.get(job_id) is task:
            del self._tasks[job_id]
        if not task.cancelled() and task.exception() is not None:
            logger.error("background job %s crashed", job_id, exc_info=task.exception())

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def stop(task: asyncio.Task[Any] | None) -> None:
    """Cancel ``task`` and wait (bounded) until it has really stopped writing."""
    if task is None or task.done():
        return
    task.cancel()
    await asyncio.wait({task}, timeout=STOP_TIMEOUT)
