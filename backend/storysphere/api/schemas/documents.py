"""Response schemas for document query endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class DocumentSummary(BaseModel):
    """Lightweight document entry for list responses."""

    id: str
    title: str
    file_type: str
