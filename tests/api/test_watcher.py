"""監看迴圈：比對資料庫，產生 SSE 事件並寫回 progress／last_seq（04 §3.4、§3.5）。"""

from __future__ import annotations

import pytest
from storysphere.api.events import EventBus, book_stream, job_stream
from storysphere.api.watcher import JobWatcher, ingest_progress
from storysphere.methods.engine import default_registry
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.tables import Job, Run

BOOK = "b1"


def _unit(index: int, stage: str = "s1a", status: str = "pending") -> IngestUnitRow:
    return IngestUnitRow(
        book_id=BOOK, stage=stage, unit_id=f"{BOOK}:{index}:0", chapter=index,
        paragraph_ids=[f"p{index}"], status=status,
    )  # fmt: skip


@pytest.fixture
async def sf(tmp_path):
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    yield make_session_factory(engine)
    await engine.dispose()


@pytest.fixture
def bus() -> EventBus:
    return EventBus()


@pytest.fixture
def watcher(sf, bus) -> JobWatcher:
    return JobWatcher(sf, bus, default_registry())


async def _change(sf, model, key, **values):
    async with sf() as session, session.begin():
        row = await session.get(model, key)
        for name, value in values.items():
            setattr(row, name, value)


def _events(bus, key):
    return [(e.type, e.data) for e in bus.replay(key, 0)]


async def _job(sf, job_id="j1"):
    async with sf() as session:
        return await session.get(Job, job_id)


class TestIngestProgress:
    def test_s1_moves_with_finished_units(self):
        units = [_unit(1, status="done"), _unit(2, status="failed"), _unit(3), _unit(4)]
        assert ingest_progress("s1", units) == 5 + (70 - 5) * 2 // 4

    def test_other_steps_sit_at_their_start(self):
        assert ingest_progress("s3", []) == 75 and ingest_progress("p1", []) == 0
        assert ingest_progress(None, []) is None


class TestJobWatcher:
    async def test_first_sight_reports_status_but_not_existing_units(self, sf, bus, watcher):
        async with sf() as session, session.begin():
            session.add(Job(id="j1", kind="ingest", book_id=BOOK, status="interrupted", stage="s1"))
            session.add_all([_unit(1, status="done"), _unit(2)])
        await watcher.poll_once()
        assert [t for t, _ in _events(bus, job_stream("j1"))] == ["job.status"]
        job = await _job(sf)
        assert job.last_seq == 1 and job.progress == 5 + 65 // 2  # 1／2 個單位完成

    async def test_ingest_run_produces_step_unit_run_and_status_events(self, sf, bus, watcher):
        async with sf() as session, session.begin():
            session.add(Job(id="j1", kind="ingest", book_id=BOOK, status="running", stage="review"))
            session.add_all([_unit(1), _unit(2)])
        await watcher.poll_once()

        await _change(sf, Job, "j1", stage="s1")
        async with sf() as session, session.begin():
            unit = await session.get(IngestUnitRow, (BOOK, "s1a", f"{BOOK}:1:0"))
            unit.status, unit.attempts = "done", 1
            session.add(IngestUnitOutputRow(
                book_id=BOOK, stage="s1a", unit_id=f"{BOOK}:1:0",
                raw_json={"characters": [{"name": n} for n in "ABCDEF"], "events": [{"title": "相遇"}]},
            ))  # fmt: skip
            unit = await session.get(IngestUnitRow, (BOOK, "s1a", f"{BOOK}:2:0"))
            unit.status, unit.error = "failed", "boom"
            session.add(Run(id="r1", book_id=BOOK, ref_id="character.network", job_id="j1",
                            status="not_applicable", precheck_json={"how_to_fix": "x"}))  # fmt: skip
        await watcher.poll_once()

        events = _events(bus, job_stream("j1"))
        types = [t for t, _ in events]
        assert types == [
            "job.status", "ingest.step", "ingest.step", "ingest.unit", "ingest.unit",
            "run.status", "job.status",
        ]  # fmt: skip
        assert events[1][1]["step"] == "review" and events[1][1]["state"] == "done"
        assert events[2][1]["step"] == "s1" and events[2][1]["state"] == "running"
        done, failed = events[3][1], events[4][1]
        assert done["status"] == "done" and done["preview"] == {
            "characters": ["A", "B", "C", "D", "E"], "events": ["相遇"],
        }  # fmt: skip
        assert failed["status"] == "failed" and failed["error"] == "boom"
        run = events[5][1]
        assert (run["code"], run["status"], run["precheck"]) == ("CH4", "not_applicable", {"howToFix": "x"})
        assert events[6][1]["progress"] == 70  # 兩個單位都結束了
        # 書的串流收到同樣的事件
        assert [t for t, _ in _events(bus, book_stream(BOOK))] == types
        job = await _job(sf)
        assert job.last_seq == 7 and job.progress == 70

    async def test_no_change_no_event(self, sf, bus, watcher):
        async with sf() as session, session.begin():
            session.add(Job(id="j1", kind="method_run", book_id=BOOK, status="running"))
        await watcher.poll_once()
        await watcher.poll_once()
        assert len(_events(bus, job_stream("j1"))) == 1

    async def test_terminal_status_is_reported_once_then_the_job_is_dropped(self, sf, bus, watcher):
        async with sf() as session, session.begin():
            session.add(Job(id="j1", kind="ingest", book_id=BOOK, status="running", stage="s5"))
        await watcher.poll_once()
        await _change(sf, Job, "j1", status="done", progress=100)
        await watcher.poll_once()
        await watcher.poll_once()
        events = _events(bus, job_stream("j1"))
        assert [(t, d.get("step"), d.get("state")) for t, d in events] == [
            ("job.status", None, None), ("ingest.step", "s5", "done"), ("job.status", None, None),
        ]  # fmt: skip
        assert events[-1][1]["status"] == "done"

    async def test_jobs_finished_before_start_are_ignored(self, sf, bus, watcher):
        async with sf() as session, session.begin():
            session.add(Job(id="j1", kind="ingest", book_id=BOOK, status="done"))
        await watcher.poll_once()
        assert _events(bus, job_stream("j1")) == []
