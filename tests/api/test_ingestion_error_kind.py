"""整本失敗的 ingestion 任務帶 errorKind（API_CONTRACT #8）。"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pypdf.errors import FileNotDecryptedError


async def _run_with_failure(exc: Exception, tmp_path):
    from storysphere.api.routers.book_ingestion import _run_ingestion_graph
    from storysphere.api.store import get_task, task_store

    task_id = str(uuid.uuid4())
    task_store.create(task_id, kind="ingestion", title="t")
    graph = MagicMock()
    graph.ainvoke = AsyncMock(side_effect=exc)
    with (
        patch("storysphere.api.deps.get_ingestion_graph", return_value=graph),
        patch("storysphere.api.routers.book_ingestion.cleanup_ingestion_checkpoint", new_callable=AsyncMock),
    ):
        await _run_ingestion_graph(task_id, tmp_path / "book.pdf", "t")
    return await get_task(task_id)


class TestIngestionErrorKind:
    @pytest.mark.asyncio
    async def test_encrypted_pdf_is_classified(self, tmp_path):
        task = await _run_with_failure(FileNotDecryptedError("File has not been decrypted"), tmp_path)
        assert (task.status, task.error, task.error_kind) == ("error", "File has not been decrypted", "encrypted")

    @pytest.mark.asyncio
    async def test_other_failure_is_internal(self, tmp_path):
        task = await _run_with_failure(RuntimeError("database is locked"), tmp_path)
        assert task.error_kind == "internal"

    @pytest.mark.asyncio
    async def test_restart_reconcile_marks_interrupted(self):
        from storysphere.api.main import _reconcile_stale_tasks
        from storysphere.api.store import get_task, task_store

        task_id = str(uuid.uuid4())
        task_store.create(task_id, kind="ingestion")
        task_store.set_running(task_id)
        await _reconcile_stale_tasks()
        assert (await get_task(task_id)).error_kind == "interrupted"

    def test_status_endpoint_exposes_it_camel_cased(self, client):
        from storysphere.api.store import task_store

        task_id = str(uuid.uuid4())
        task_store.create(task_id, kind="ingestion")
        task_store.set_failed(task_id, "File has not been decrypted", "encrypted")
        body = client.get(f"/api/v1/tasks/{task_id}/status").json()
        assert body["errorKind"] == "encrypted"
