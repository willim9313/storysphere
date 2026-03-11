"""Tests for GET /api/v1/documents/* endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock

from domain.documents import Chapter, Document, FileType, Paragraph


def test_list_documents(client):
    resp = client.get("/api/v1/documents/")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
    assert len(items) == 1
    assert items[0]["id"] == "doc-1"
    assert items[0]["title"] == "Test Novel"
    assert items[0]["file_type"] == "pdf"


def test_get_document_ok(client):
    resp = client.get("/api/v1/documents/doc-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "doc-1"
    assert data["title"] == "Test Novel"
    assert data["total_chapters"] == 2
    assert len(data["chapters"]) == 2
    assert data["chapters"][0]["number"] == 1
    assert data["chapters"][0]["title"] == "The Beginning"


def test_get_document_not_found(client):
    resp = client.get("/api/v1/documents/nonexistent")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_get_document_chapter_fields(client):
    resp = client.get("/api/v1/documents/doc-1")
    assert resp.status_code == 200
    ch = resp.json()["chapters"][0]
    assert "word_count" in ch
    assert "paragraph_count" in ch
    assert ch["paragraph_count"] >= 0
