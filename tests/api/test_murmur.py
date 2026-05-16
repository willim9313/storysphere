"""Tests for the murmur event stream introduced in 88369bb.

Coverage:
  - MemoryTaskStore.append_murmur / get_murmur_events: seq auto-assignment,
    after= filter
  - SQLiteTaskStore.append_murmur / get_murmur_events: same contract,
    persists across reconnect
  - GET /api/v1/tasks/:taskId/status returns murmur_events as camelCase list
  - GET /api/v1/tasks/:taskId/status?after=N returns delta only
"""

from __future__ import annotations

import asyncio
import sys
from uuid import uuid4

import pytest

sys.path.insert(0, "src")

from api.schemas.common import MurmurEvent  # noqa: E402


def _ev(step_key: str = "summarization", type_: str = "topic", content: str = "x") -> MurmurEvent:
    return MurmurEvent(seq=0, step_key=step_key, type=type_, content=content)


# ── MemoryTaskStore ──────────────────────────────────────────────────────────


class TestMemoryStoreMurmur:
    def test_append_assigns_monotonic_seq(self):
        from api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")

        asyncio.run(store.append_murmur("t1", _ev(content="a")))
        asyncio.run(store.append_murmur("t1", _ev(content="b")))
        asyncio.run(store.append_murmur("t1", _ev(content="c")))

        events = asyncio.run(store.get_murmur_events("t1"))
        assert [e.seq for e in events] == [0, 1, 2]
        assert [e.content for e in events] == ["a", "b", "c"]

    def test_after_filter_returns_slice(self):
        from api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")
        for ch in "abcde":
            asyncio.run(store.append_murmur("t1", _ev(content=ch)))

        delta = asyncio.run(store.get_murmur_events("t1", after=2))
        assert [e.content for e in delta] == ["c", "d", "e"]
        assert [e.seq for e in delta] == [2, 3, 4]

    def test_after_beyond_last_returns_empty(self):
        from api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")
        asyncio.run(store.append_murmur("t1", _ev(content="x")))

        assert asyncio.run(store.get_murmur_events("t1", after=10)) == []

    def test_unknown_task_returns_empty(self):
        from api.store import MemoryTaskStore

        store = MemoryTaskStore()
        assert asyncio.run(store.get_murmur_events("no-such-task")) == []

    def test_per_task_isolation(self):
        from api.store import MemoryTaskStore

        store = MemoryTaskStore()
        store.create("t1")
        store.create("t2")
        asyncio.run(store.append_murmur("t1", _ev(content="t1-a")))
        asyncio.run(store.append_murmur("t2", _ev(content="t2-a")))
        asyncio.run(store.append_murmur("t1", _ev(content="t1-b")))

        t1 = asyncio.run(store.get_murmur_events("t1"))
        t2 = asyncio.run(store.get_murmur_events("t2"))
        assert [e.content for e in t1] == ["t1-a", "t1-b"]
        assert [e.content for e in t2] == ["t2-a"]
        # Per-task seq starts at 0
        assert [e.seq for e in t1] == [0, 1]
        assert [e.seq for e in t2] == [0]


# ── SQLiteTaskStore ──────────────────────────────────────────────────────────


class TestSQLiteStoreMurmur:
    def test_append_assigns_monotonic_seq(self, tmp_path):
        from api.store import SQLiteTaskStore

        db = str(tmp_path / "tasks.db")
        store = SQLiteTaskStore(db)
        store.create("t1")

        asyncio.run(store.append_murmur("t1", _ev(content="a")))
        asyncio.run(store.append_murmur("t1", _ev(content="b")))

        events = asyncio.run(store.get_murmur_events("t1"))
        assert [e.seq for e in events] == [0, 1]
        assert [e.content for e in events] == ["a", "b"]

    def test_after_filter(self, tmp_path):
        from api.store import SQLiteTaskStore

        db = str(tmp_path / "tasks.db")
        store = SQLiteTaskStore(db)
        store.create("t1")
        for ch in "abcd":
            asyncio.run(store.append_murmur("t1", _ev(content=ch)))

        delta = asyncio.run(store.get_murmur_events("t1", after=2))
        assert [e.content for e in delta] == ["c", "d"]

    def test_persists_across_new_connection(self, tmp_path):
        """Murmur rows survive opening a new SQLiteTaskStore on the same file."""
        from api.store import SQLiteTaskStore

        db = str(tmp_path / "tasks.db")
        s1 = SQLiteTaskStore(db)
        s1.create("t1")
        asyncio.run(s1.append_murmur("t1", _ev(content="persisted")))

        s2 = SQLiteTaskStore(db)
        events = asyncio.run(s2.get_murmur_events("t1"))
        assert len(events) == 1
        assert events[0].content == "persisted"

    def test_meta_round_trips_as_json(self, tmp_path):
        from api.store import SQLiteTaskStore

        db = str(tmp_path / "tasks.db")
        store = SQLiteTaskStore(db)
        store.create("t1")
        event = MurmurEvent(
            seq=0,
            step_key="knowledgeGraph",
            type="character",
            content="Alice",
            meta={"chapter": 3, "entity_id": "ent-alice"},
        )
        asyncio.run(store.append_murmur("t1", event))

        out = asyncio.run(store.get_murmur_events("t1"))
        assert out[0].meta == {"chapter": 3, "entity_id": "ent-alice"}


# ── /tasks/:id/status endpoint ───────────────────────────────────────────────


def _seed_task_with_events(events: list[tuple[str, str]]) -> str:
    """Create a task in the global store and append events. Returns task_id."""
    from api.store import task_store

    task_id = f"murmur-{uuid4()}"
    task_store.create(task_id)
    for content, type_ in events:
        asyncio.run(task_store.append_murmur(task_id, _ev(content=content, type_=type_)))
    return task_id


class TestTaskStatusEndpointMurmur:
    def test_status_returns_all_murmur_events_by_default(self, client):
        task_id = _seed_task_with_events([("a", "topic"), ("b", "character")])
        resp = client.get(f"/api/v1/tasks/{task_id}/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "murmurEvents" in body  # camelCase per alias_generator=to_camel
        events = body["murmurEvents"]
        assert [e["content"] for e in events] == ["a", "b"]
        assert [e["seq"] for e in events] == [0, 1]

    def test_after_query_returns_delta_only(self, client):
        task_id = _seed_task_with_events([(c, "topic") for c in "abcde"])
        resp = client.get(f"/api/v1/tasks/{task_id}/status?after=3")
        assert resp.status_code == 200
        events = resp.json()["murmurEvents"]
        assert [e["content"] for e in events] == ["d", "e"]
        assert [e["seq"] for e in events] == [3, 4]

    def test_after_beyond_last_returns_empty_events_list(self, client):
        task_id = _seed_task_with_events([("a", "topic")])
        resp = client.get(f"/api/v1/tasks/{task_id}/status?after=99")
        assert resp.status_code == 200
        assert resp.json()["murmurEvents"] == []

    def test_unknown_task_returns_404(self, client):
        resp = client.get("/api/v1/tasks/no-such-task/status")
        assert resp.status_code == 404

    def test_negative_after_rejected_by_validation(self, client):
        task_id = _seed_task_with_events([("a", "topic")])
        resp = client.get(f"/api/v1/tasks/{task_id}/status?after=-1")
        # `after: int = Query(default=0, ge=0)` → 422 for negative values
        assert resp.status_code == 422


# ── Step-key contract (smoke) ────────────────────────────────────────────────


class TestMurmurEventSchema:
    @pytest.mark.parametrize(
        "step_key",
        [
            "pdfParsing",
            "summarization",
            "featureExtraction",
            "knowledgeGraph",
            "symbolExploration",
        ],
    )
    def test_all_pipeline_step_keys_accepted(self, step_key):
        MurmurEvent(seq=0, step_key=step_key, type="topic", content="x")

    def test_invalid_step_key_rejected(self):
        with pytest.raises(ValueError):
            MurmurEvent(seq=0, step_key="bogus", type="topic", content="x")

    @pytest.mark.parametrize(
        "type_",
        ["character", "location", "org", "event", "topic", "symbol", "raw"],
    )
    def test_all_event_types_accepted(self, type_):
        MurmurEvent(seq=0, step_key="summarization", type=type_, content="x")
