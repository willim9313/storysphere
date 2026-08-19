"""Tests for ingestion checkpoint TTL pruning (_prune_stale_checkpoints)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from storysphere.api.main import _prune_stale_checkpoints


def _tuple(thread_id: str, ts: datetime | str | None):
    """Build the parts of a CheckpointTuple that pruning actually reads."""
    return SimpleNamespace(
        config={"configurable": {"thread_id": thread_id}},
        checkpoint={"ts": ts.isoformat() if isinstance(ts, datetime) else ts},
    )


class FakeCheckpointer:
    """Stands in for AsyncSqliteSaver: lists tuples, records deleted threads."""

    def __init__(self, tuples, *, list_error=None, delete_error_on=()):
        self._tuples = tuples
        self._list_error = list_error
        self._delete_error_on = set(delete_error_on)
        self.deleted: list[str] = []

    async def alist(self, config):
        if self._list_error is not None:
            raise self._list_error
        for tup in self._tuples:
            yield tup

    async def adelete_thread(self, thread_id: str) -> None:
        if thread_id in self._delete_error_on:
            raise RuntimeError("boom")
        self.deleted.append(thread_id)


def _ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


class TestPruneStaleCheckpoints:
    @pytest.mark.asyncio
    async def test_deletes_thread_idle_past_ttl(self):
        cp = FakeCheckpointer([_tuple("old", _ago(60))])
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 1
        assert cp.deleted == ["old"]

    @pytest.mark.asyncio
    async def test_keeps_awaiting_review_thread_within_ttl(self):
        """The one guarantee that matters: a resumable review is not pruned.

        An import paused for chapter review keeps its checkpoint as the only
        way to continue. While it is inside the TTL window it must survive.
        """
        cp = FakeCheckpointer([_tuple("awaiting", _ago(1))])
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 0
        assert cp.deleted == []

    @pytest.mark.asyncio
    async def test_keeps_thread_whose_latest_checkpoint_is_recent(self):
        """Age is per thread, not per row — old history of a live thread stays."""
        cp = FakeCheckpointer(
            [
                _tuple("live", _ago(90)),
                _tuple("live", _ago(2)),
                _tuple("live", _ago(45)),
            ]
        )
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 0
        assert cp.deleted == []

    @pytest.mark.asyncio
    async def test_prunes_only_the_stale_threads(self):
        cp = FakeCheckpointer(
            [
                _tuple("old-a", _ago(60)),
                _tuple("fresh", _ago(3)),
                _tuple("old-b", _ago(31)),
            ]
        )
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 2
        assert sorted(cp.deleted) == ["old-a", "old-b"]

    @pytest.mark.asyncio
    async def test_keeps_thread_with_unreadable_timestamp(self):
        cp = FakeCheckpointer([_tuple("weird", "not-a-timestamp"), _tuple("none", None)])
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 0
        assert cp.deleted == []

    @pytest.mark.asyncio
    async def test_returns_zero_when_listing_fails(self):
        cp = FakeCheckpointer([], list_error=RuntimeError("db locked"))
        assert await _prune_stale_checkpoints(cp, older_than_days=30) == 0

    @pytest.mark.asyncio
    async def test_one_failed_delete_does_not_stop_the_rest(self):
        cp = FakeCheckpointer(
            [_tuple("bad", _ago(60)), _tuple("good", _ago(60))],
            delete_error_on=("bad",),
        )
        deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
        assert deleted == 1
        assert cp.deleted == ["good"]

    @pytest.mark.asyncio
    async def test_empty_store_is_a_noop(self):
        cp = FakeCheckpointer([])
        assert await _prune_stale_checkpoints(cp, older_than_days=30) == 0


class TestPruneAgainstRealCheckpointer:
    """End-to-end against AsyncSqliteSaver, so the API assumptions are verified."""

    @pytest.mark.asyncio
    async def test_stale_thread_dropped_recent_thread_resumable(self, tmp_path):
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        db = tmp_path / "checkpoints.db"

        def _checkpoint(cid: str, ts: datetime) -> dict:
            return {
                "v": 1,
                "id": cid,
                "ts": ts.isoformat(),
                "channel_values": {"stage": "awaiting_review"},
                "channel_versions": {},
                "versions_seen": {},
            }

        async with AsyncSqliteSaver.from_conn_string(str(db)) as cp:
            await cp.setup()
            for thread_id, ts in (("stale", _ago(60)), ("recent", _ago(1))):
                await cp.aput(
                    {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}},
                    _checkpoint(f"cp-{thread_id}", ts),
                    {"source": "loop", "step": 1, "parents": {}},
                    {},
                )

            deleted = await _prune_stale_checkpoints(cp, older_than_days=30)
            assert deleted == 1

            remaining = {
                t.config["configurable"]["thread_id"] async for t in cp.alist(None)
            }
            assert remaining == {"recent"}
