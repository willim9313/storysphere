"""SSE 端點（N-09c、N-09f）：補抓、resync、終態後關閉。

事件直接放進 `app.state.event_bus`（監看迴圈另外測），連線前就放好，串流才會自己結束。
"""

from __future__ import annotations

import json

import pytest
from storysphere.store.tables import Job

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK


def read_frames(client, url, headers=None, *, limit=None):
    """Parse SSE frames until the stream closes (or ``limit`` frames were read)."""
    frames, current = [], {}
    with client.stream("GET", url, headers=headers or {}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        for line in response.iter_lines():
            if line == "":
                if current:
                    frames.append(current)
                    current = {}
                    if limit is not None and len(frames) >= limit:
                        break
                continue
            field, _, value = line.partition(": ")
            current[field] = json.loads(value) if field == "data" else value
    return frames


def _status(job_id, status):
    return {"jobId": job_id, "kind": "ingest", "status": status, "progress": 0,
            "stage": "s1", "errorKind": None}  # fmt: skip


@pytest.fixture
def running_job(db_file, client):
    async def fill(store):
        await add_book(store.session)
        store.session.add(Job(id="j1", kind="ingest", book_id=BOOK, status="running"))

    seed(db_file, fill)
    bus = client.app.state.event_bus
    bus.publish("ingest.step", {"step": "s1", "state": "running"}, job_id="j1", book_id=BOOK)
    bus.publish("ingest.unit", {"unitId": "u1"}, job_id="j1", book_id=BOOK)
    bus.publish("job.status", _status("j1", "done"), job_id="j1", book_id=BOOK)
    return "j1"


class TestJobEvents:
    def test_replay_from_the_start_and_close_after_the_terminal_status(self, client, running_job):
        frames = read_frames(client, f"{P}/jobs/{running_job}/events?after=0")
        assert [(f["id"], f["event"]) for f in frames] == [
            ("1", "ingest.step"), ("2", "ingest.unit"), ("3", "job.status"),
        ]  # fmt: skip
        assert frames[-1]["data"]["status"] == "done"

    def test_last_event_id_resumes_after_that_event(self, client, running_job):
        frames = read_frames(client, f"{P}/jobs/{running_job}/events", {"Last-Event-ID": "2"})
        assert [f["id"] for f in frames] == ["3"]

    def test_after_wins_over_last_event_id(self, client, running_job):
        frames = read_frames(client, f"{P}/jobs/{running_job}/events?after=1", {"Last-Event-ID": "2"})
        assert [f["id"] for f in frames] == ["2", "3"]

    def test_finished_job_sends_its_status_once_and_closes(self, db_file, client):
        seed(db_file, lambda store: _add(store, Job(id="j9", kind="method_run", status="error",
                                                     error_kind="internal", last_seq=4)))  # fmt: skip
        # 重啟後緩衝是空的：拿著最後的 seq 回來不用 resync，只收到最後狀態
        frames = read_frames(client, f"{P}/jobs/j9/events?after=4")
        assert [(f.get("id"), f["event"]) for f in frames] == [(None, "job.status")]
        assert frames[0]["data"]["status"] == "error" and frames[0]["data"]["errorKind"] == "internal"

    def test_seq_no_longer_buffered_gets_resync(self, db_file, client):
        seed(db_file, lambda store: _add(store, Job(id="j9", kind="ingest", status="done", last_seq=4)))
        frames = read_frames(client, f"{P}/jobs/j9/events?after=1")
        assert [f["event"] for f in frames] == ["resync", "job.status"]
        assert "id" not in frames[0]

    def test_bad_last_event_id_is_422(self, client, running_job):
        response = client.get(f"{P}/jobs/{running_job}/events", headers={"Last-Event-ID": "x"})
        assert response.status_code == 422

    def test_unknown_job_is_404(self, client):
        assert client.get(f"{P}/jobs/nope/events").status_code == 404


class TestBookEvents:
    def test_book_stream_carries_every_job_of_the_book(self, client, running_job):
        client.app.state.event_bus.publish("run.status", {"runId": "r"}, job_id="m1", book_id=BOOK)
        frames = read_frames(client, f"{P}/books/{BOOK}/events?after=1", limit=3)
        assert [(f["id"], f["event"]) for f in frames] == [
            ("2", "ingest.unit"), ("3", "job.status"), ("4", "run.status"),
        ]  # fmt: skip

    def test_unknown_book_is_404(self, client):
        assert client.get(f"{P}/books/nope/events").status_code == 404


async def _add(store, row):
    store.session.add(row)
