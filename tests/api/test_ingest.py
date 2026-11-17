"""入庫端點（N-01b、N-02a–N-02e）與取消、續跑（N-09d、N-09e）。

LLM 一律假的：`app.state.ingest_service` 先換成用假 stage 的 `IngestService`。
"""

from __future__ import annotations

import time

import pytest
from storysphere.api.routes import ingest as ingest_routes
from storysphere.ingest.service import IngestService
from storysphere.ingest.unit_runner import UnitStage
from storysphere.store.tables import Job

from tests.api.support import P, seed
from tests.ingest.test_unit_runner import BOOK_TEXT, CHAPTER_COUNT, FakeCall
from tests.methods.support import no_method_engine

TERMINAL = ("done", "error", "cancelled")


@pytest.fixture
def llm_key(monkeypatch):
    # 預設設定的 Gemini 讀這個環境變數；有值＝core_extraction 有可用模型（不會真的呼叫）。
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")


@pytest.fixture
def fake_service(client, llm_key) -> FakeCall:
    state = client.app.state
    call = FakeCall()
    state.ingest_service = IngestService(
        state.session_factory,
        state.checkpointer,
        stages=[UnitStage(name="s1a", call=call, model="fake:model", prompt_version="1")],
        retry_delay=0,
        concurrency=1,
        method_engine=no_method_engine(state.session_factory),
    )
    return call


def wait_job(client, job_id: str, *, until=lambda job: job["status"] in TERMINAL, timeout=10.0):
    deadline = time.monotonic() + timeout
    while True:
        job = client.get(f"{P}/jobs/{job_id}").json()
        if until(job):
            return job
        assert time.monotonic() < deadline, f"job stuck at {job['status']}"
        time.sleep(0.02)


def upload(client, name="七日.txt", data=BOOK_TEXT.encode(), **form):
    return client.post(f"{P}/books/upload", files={"file": (name, data, "text/plain")}, data=form)


def upload_to_review(client) -> tuple[str, str]:
    response = upload(client, title="七日")
    assert response.status_code == 202, response.text
    job = wait_job(client, response.json()["jobId"], until=lambda j: j["status"] != "pending" and j["status"] != "running")
    assert job["status"] == "awaiting_review", job["error"]
    return job["id"], job["result"]["bookId"]


class TestUpload:
    def test_upload_runs_p1_and_stops_for_review(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        book = client.get(f"{P}/books/{book_id}").json()
        assert book["title"] == "七日" and book["ingestStatus"] == "awaiting_review"
        assert fake_service.calls == []  # S1 要等審閱送出才跑

    def test_duplicate_title_is_flagged(self, client, fake_service):
        upload_to_review(client)
        assert upload(client, title="七日").json()["duplicateTitle"] is True
        assert upload(client, title="別本").json()["duplicateTitle"] is False

    def test_unsupported_format_is_422_and_creates_no_job(self, client, fake_service):
        response = upload(client, name="x.mobi")
        assert response.status_code == 422 and response.json()["code"] == "validation_error"
        assert client.get(f"{P}/jobs").json() == []

    def test_too_large_is_413(self, client, fake_service, monkeypatch):
        monkeypatch.setattr(ingest_routes, "MAX_UPLOAD_BYTES", 10)
        response = upload(client)
        assert response.status_code == 413 and response.json()["code"] == "file_too_large"
        assert client.get(f"{P}/jobs").json() == []

    def test_no_model_is_503_and_creates_no_job(self, client, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        response = upload(client)
        assert response.status_code == 503 and response.json()["code"] == "llm_unconfigured"
        assert "core_extraction" in response.json()["detail"]
        assert client.get(f"{P}/jobs").json() == []


class TestReview:
    def test_review_data_then_submit_runs_to_the_end(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        data = client.get(f"{P}/books/{book_id}/review-data").json()
        assert len(data["chapters"]) == CHAPTER_COUNT
        paragraph = data["chapters"][0]["paragraphs"][0]
        assert set(paragraph) == {"paragraphIndex", "text", "role", "titleSpan", "sentences"}

        assert client.post(f"{P}/books/{book_id}/review", json={}).status_code == 204
        job = wait_job(client, job_id)
        assert job["status"] == "done" and job["progress"] == 100
        assert len(fake_service.calls) == CHAPTER_COUNT

    def test_submitted_chapters_are_applied(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        body = {"chapters": [{"title": "全部", "role": "body", "startParagraphIndex": 0}]}
        assert client.post(f"{P}/books/{book_id}/review", json=body).status_code == 204
        wait_job(client, job_id)
        chapters = client.get(f"{P}/books/{book_id}/chapters").json()
        assert [(c["title"], c["paragraphCount"]) for c in chapters] == [("全部", CHAPTER_COUNT)]

    def test_second_submission_is_409_review_submitted(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        client.post(f"{P}/books/{book_id}/review", json={})
        response = client.post(f"{P}/books/{book_id}/review", json={})
        assert response.status_code == 409 and response.json()["code"] == "review_submitted"
        wait_job(client, job_id)
        assert client.get(f"{P}/books/{book_id}/review-data").json()["code"] == "review_submitted"

    def test_review_of_a_book_with_no_ingest_job_is_409_review_not_open(self, db_file, client):
        from tests.api.support import add_book

        seed(db_file, lambda store: add_book(store.session))
        response = client.get(f"{P}/books/book-1/review-data")
        assert response.status_code == 409 and response.json()["code"] == "review_not_open"
        response = client.post(f"{P}/books/book-1/review", json={})
        assert response.status_code == 409 and response.json()["code"] == "review_not_open"

    def test_unknown_book_is_404(self, client):
        assert client.get(f"{P}/books/nope/review-data").status_code == 404


class TestIngestStatus:
    def test_steps_and_units_after_a_finished_ingest(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        assert [s["state"] for s in client.get(f"{P}/books/{book_id}/ingest").json()["steps"]] == [
            "done", "running", "pending", "pending", "pending", "pending", "pending",
        ]  # fmt: skip
        client.post(f"{P}/books/{book_id}/review", json={})
        wait_job(client, job_id)

        status = client.get(f"{P}/books/{book_id}/ingest").json()
        assert status["jobId"] == job_id and status["jobStatus"] == "done"
        # S2 有單位輸出就會跑（假輸出整併出 0 筆）；沒有 s1b 訊號 → S3、S4 跳過；書裡沒證據 → S5 跳過
        steps = {s["step"]: s for s in status["steps"]}
        assert {step: s["state"] for step, s in steps.items()} == {
            "p1": "done", "review": "done", "s1": "done",
            "s2": "done", "s3": "skipped", "s4": "skipped", "s5": "skipped",
        }  # fmt: skip
        assert steps["s2"]["runId"] and steps["s2"]["finishedAt"].endswith("Z")
        assert status["units"]["s1a"] == {"total": CHAPTER_COUNT, "done": CHAPTER_COUNT, "failed": 0, "pending": 0}
        assert status["units"]["s4a"]["total"] == 0 and status["failedUnits"] == []

    def test_units_list_and_detail(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        client.post(f"{P}/books/{book_id}/review", json={})
        wait_job(client, job_id)

        page = client.get(f"{P}/books/{book_id}/ingest/units?stage=s1a&limit=3").json()
        assert page["total"] == CHAPTER_COUNT and page["nextCursor"]
        assert [u["chapter"] for u in page["items"]] == [1, 2, 3]
        first, second = page["items"][0], page["items"][1]
        assert first["status"] == "done" and first["model"] == "fake:model"

        detail = client.get(f"{P}/books/{book_id}/ingest/units/{second['unitId']}?stage=s1a").json()
        assert detail["rawOutput"] == {"unit": second["unitId"], "chapter": 2}  # 原樣，不轉
        first_detail = client.get(f"{P}/books/{book_id}/ingest/units/{first['unitId']}?stage=s1a").json()
        assert first_detail["contextParagraphId"] is None
        assert detail["contextParagraphId"] == first_detail["paragraphIds"][-1]

        assert client.get(f"{P}/books/{book_id}/ingest/units?stage=s1a&chapter=4").json()["total"] == 1
        assert client.get(f"{P}/books/{book_id}/ingest/units?stage=s9").status_code == 422
        assert client.get(f"{P}/books/{book_id}/ingest/units/nope?stage=s1a").status_code == 404


class TestCancel:
    def test_cancel_a_job_waiting_for_review(self, client, fake_service):
        job_id, book_id = upload_to_review(client)
        assert client.post(f"{P}/jobs/{job_id}/cancel").status_code == 204
        job = client.get(f"{P}/jobs/{job_id}").json()
        assert job["status"] == "cancelled" and job["finishedAt"]
        assert client.get(f"{P}/books/{book_id}/review-data").json()["code"] == "review_closed"

    def test_cancel_a_finished_job_is_409(self, db_file, client):
        seed(db_file, lambda store: _add_job(store, "j1", "done"))
        response = client.post(f"{P}/jobs/j1/cancel")
        assert response.status_code == 409 and response.json()["code"] == "invalid_state"

    def test_cancel_resets_running_units_and_runs(self, db_file, client):
        from storysphere.store.ingest_units import IngestUnitRow
        from storysphere.store.tables import Run

        async def fill(store):
            await _add_job(store, "j1", "interrupted", book_id="b1")
            store.session.add(IngestUnitRow(book_id="b1", stage="s1a", unit_id="b1:1:0",
                                            chapter=1, paragraph_ids=["p"], status="running"))
            store.session.add(Run(id="r1", book_id="b1", ref_id="character.arc", job_id="j1",
                                  status="running"))  # fmt: skip

        seed(db_file, fill)
        assert client.post(f"{P}/jobs/j1/cancel").status_code == 204
        units = client.get(f"{P}/books/b1/ingest/units?stage=s1a")
        assert units.status_code == 404  # 沒有 books 列；直接查資料庫
        state = client.app.state

        async def check():
            async with state.session_factory() as session:
                unit = await session.get(IngestUnitRow, ("b1", "s1a", "b1:1:0"))
                run = await session.get(Run, "r1")
                return unit.status, run.status

        assert client.portal.call(check) == ("pending", "cancelled")

    def test_unknown_job_is_404(self, client):
        assert client.post(f"{P}/jobs/nope/cancel").status_code == 404


async def _add_job(store, job_id, status, kind="ingest", book_id=None):
    store.session.add(Job(id=job_id, kind=kind, status=status, book_id=book_id))


class TestResume:
    def test_resume_a_job_paused_by_quota(self, client, fake_service):
        # 第 3 次呼叫遇到 429：job 暫停，已完成的單位留著
        fake_service.plan = {3: RuntimeError("429 quota exhausted")}
        job_id, book_id = upload_to_review(client)
        client.post(f"{P}/books/{book_id}/review", json={})
        job = wait_job(client, job_id, until=lambda j: j["status"] == "paused_quota")
        assert client.get(f"{P}/books/{book_id}/ingest").json()["units"]["s1a"]["done"] == 2

        response = client.post(f"{P}/jobs/{job_id}/resume")
        assert response.status_code == 202 and response.json() == {"jobId": job_id}
        assert wait_job(client, job_id)["status"] == "done"
        # 第 3 個單位重跑一次，前兩個不重跑
        assert len(fake_service.calls) == CHAPTER_COUNT + 1
        assert job["id"] == job_id

    def test_resume_a_paused_method_job(self, db_file, client, monkeypatch):
        seed(db_file, lambda store: _add_job(store, "m1", "paused_quota", kind="method_run"))
        started = []
        monkeypatch.setattr(client.app.state.method_jobs, "start", started.append)
        assert client.post(f"{P}/jobs/m1/resume").status_code == 202
        assert started == ["m1"] and client.get(f"{P}/jobs/m1").json()["status"] == "pending"

    @pytest.mark.parametrize("status", ["running", "done", "awaiting_review"])
    def test_only_paused_or_interrupted_jobs_resume(self, db_file, client, status):
        seed(db_file, lambda store: _add_job(store, "j1", status))
        response = client.post(f"{P}/jobs/j1/resume")
        assert response.status_code == 409 and response.json()["code"] == "invalid_state"

    def test_unknown_job_is_404(self, client):
        assert client.post(f"{P}/jobs/nope/resume").status_code == 404
