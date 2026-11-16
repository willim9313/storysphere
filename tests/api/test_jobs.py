from __future__ import annotations

from datetime import UTC, datetime

from storysphere.store.tables import Job

from tests.api.support import P, seed


def _at(day: int) -> datetime:
    return datetime(2026, 11, day, tzinfo=UTC)


async def _jobs(store):
    store.session.add_all(
        [
            Job(id="done-1", kind="ingest", book_id="b1", status="done", created_at=_at(1)),
            Job(id="done-2", kind="method_run", book_id="b1", status="cancelled", created_at=_at(2)),
            Job(id="done-3", kind="method_run", book_id="b2", status="error", created_at=_at(3),
                error="boom", error_kind="internal"),
            Job(id="live-1", kind="ingest", book_id="b2", status="paused_quota", created_at=_at(1),
                progress=40, stage="s1", result_json={"bookId": "b2"}, last_seq=7),
        ]
    )  # fmt: skip


class TestListJobs:
    def test_all_active_plus_recent_finished_newest_first(self, db_file, client):
        seed(db_file, _jobs)
        jobs = client.get(f"{P}/jobs?recentLimit=2").json()
        # done-1 是第三舊的終態，被 recentLimit 擋掉；非終態的不受限
        assert [job["id"] for job in jobs] == ["done-3", "done-2", "live-1"]

    def test_filter_by_book(self, db_file, client):
        seed(db_file, _jobs)
        assert {job["id"] for job in client.get(f"{P}/jobs?bookId=b2").json()} == {"done-3", "live-1"}


class TestGetJob:
    def test_job_fields(self, db_file, client):
        seed(db_file, _jobs)
        job = client.get(f"{P}/jobs/live-1").json()
        assert job["status"] == "paused_quota" and job["progress"] == 40 and job["stage"] == "s1"
        assert job["result"] == {"bookId": "b2"} and job["lastSeq"] == 7
        assert job["createdAt"] == "2026-11-01T00:00:00Z" and job["finishedAt"] is None

    def test_unknown_job_is_404(self, client):
        response = client.get(f"{P}/jobs/nope")
        assert response.status_code == 404 and response.json()["code"] == "not_found"
