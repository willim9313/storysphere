"""Document ingestion endpoints.

POST /api/v1/ingest   — upload a file, start background ingestion, return task_id
GET  /api/v1/ingest/{task_id} — poll task status
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, UploadFile

from api.schemas.common import TaskStatus
from api.store import get_task, task_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


async def _run_ingestion(task_id: str, file_path: Path, title: str) -> None:
    """Background task: run IngestionWorkflow and update task store."""
    task_store.set_running(task_id)
    try:
        from api.deps import get_kg_service  # noqa: PLC0415
        from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

        kg_service = get_kg_service()
        workflow = IngestionWorkflow(kg_service=kg_service)
        result = await workflow.run(file_path, title=title)
        task_store.set_completed(task_id, result=result.__dict__)
        logger.info("Ingestion task %s completed: %s entities", task_id, result.entities)
    except Exception as exc:
        logger.exception("Ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        # Clean up temp file
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass


@router.post("/", response_model=TaskStatus, status_code=202)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    title: str = Form(...),
) -> TaskStatus:
    """Upload a novel file (PDF or DOCX) and start ingestion in the background.

    Returns a ``task_id`` for polling via ``GET /api/v1/ingest/{task_id}``.
    """
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise HTTPException(
            status_code=422, detail="Only .pdf and .docx files are supported"
        )

    # Save to a temp file (IngestionWorkflow expects a Path)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()
    except Exception as exc:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {exc}") from exc

    task_id = str(uuid4())
    task_store.create(task_id)
    background_tasks.add_task(_run_ingestion, task_id, Path(tmp.name), title)

    return TaskStatus(task_id=task_id, status="pending")


@router.get("/{task_id}", response_model=TaskStatus)
async def get_ingest_status(task_id: str) -> TaskStatus:
    """Poll the status of a background ingestion task."""
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task
