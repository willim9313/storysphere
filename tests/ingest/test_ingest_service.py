"""入庫服務：建 job → P1 → 審閱暫停 → 送出審閱跑完；真實 SQLite 與 checkpoint 檔（tmp_path）。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from sqlalchemy import func, select
from storysphere.domain.documents import ChapterRole, ParagraphRole
from storysphere.ingest.service import (
    CHECKPOINT_PATH,
    IngestService,
    ReviewStateError,
    open_checkpointer,
)
from storysphere.store.books import BookRow, ChapterRow, ParagraphRow, get_book
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.tables import Job

# 合成文本（不是 benchmark）。每段都超過 chunker 的最小長度；同章內相鄰的正文段會被併成一段，
# 第一章中間的分隔線讓它切成「正文、分隔線、正文」三段。全書攤平後共 5 段（索引 0–4）。
_A1 = "偵探在清晨抵達了莊園，大門敞開著，沒有人出來迎接他。他站在門廊下等了很久，只聽見遠處的鐘聲一下一下地敲著，霧氣慢慢散開。"
_A2 = "管家說主人昨夜就沒有離開過書房，房門從裡面反鎖了。僕人們聚在走廊盡頭低聲交談，沒有人敢去敲那扇門，直到偵探親自走上樓梯。"
_B1 = "書房的窗戶緊閉，地毯上留著一串潮濕的腳印，通向壁爐。偵探沿著腳印慢慢走過去，注意到每一步的間距都異常地短，像是有人刻意放輕了腳步。"
_B2 = "偵探蹲下來檢查灰燼，發現了一張燒了一半的信紙。紙上的墨跡還能辨認出幾個字，他小心地把它夾進筆記本裡，然後抬頭看了看壁爐上方的掛鐘。"
_C1 = "信紙上的筆跡屬於管家，他終於承認自己昨夜進過書房。他說自己只是去送一杯熱牛奶，離開的時候主人還坐在書桌前寫信，神情十分平靜。"
_C2 = "真相大白之後，偵探在黃昏時離開了莊園。馬車駛過長長的林蔭道，他回頭望了一眼那棟灰色的房子，窗戶裡的燈一盞接著一盞地亮了起來。"
BOOK_TEXT = (
    f"第一章 起\n\n{_A1}\n\n***\n\n{_A2}\n\n"
    f"第二章 承\n\n{_B1}\n\n{_B2}\n\n"
    f"第三章 轉\n\n{_C1}\n\n{_C2}\n"
)


@pytest.fixture
def book_file(tmp_path: Path) -> Path:
    path = tmp_path / "莊園疑案.txt"
    path.write_text(BOOK_TEXT, encoding="utf-8")
    return path


@asynccontextmanager
async def open_service(tmp_path: Path) -> AsyncIterator[tuple[IngestService, object]]:
    """在 tmp_path 的 neo.db 與 checkpoint 檔上開一組全新的 engine、checkpointer、服務。"""
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    session_factory = make_session_factory(engine)
    try:
        async with open_checkpointer(tmp_path / "ckpt" / "ingestion_checkpoints.db") as saver:
            yield IngestService(session_factory, saver), session_factory
    finally:
        await engine.dispose()


@pytest.fixture
async def env(tmp_path: Path):
    async with open_service(tmp_path) as (service, session_factory):
        yield service, session_factory


async def load_job(session_factory, job_id: str) -> Job:
    async with session_factory() as session:
        return await session.get(Job, job_id)


async def load_book(session_factory, book_id: str):
    async with session_factory() as session:
        return await get_book(session, book_id)


async def count(session_factory, table) -> int:
    async with session_factory() as session:
        return await session.scalar(select(func.count()).select_from(table))


async def to_review(service: IngestService, session_factory, book_file: Path) -> tuple[str, str]:
    job_id = await service.create_job(book_file)
    await service.run_to_review(job_id)
    job = await load_job(session_factory, job_id)
    assert job.status == "awaiting_review", job.error
    return job_id, job.book_id


class TestCheckpointPath:
    def test_default_is_under_repo_var(self):
        repo_root = Path(__file__).resolve().parents[2]
        assert CHECKPOINT_PATH == repo_root / "var" / "ingestion_checkpoints.db"


class TestCreateJob:
    async def test_pending_ingest_job_with_params(self, env, book_file):
        service, sf = env
        job_id = await service.create_job(book_file, title="書名", author="作者", language="zh")
        job = await load_job(sf, job_id)
        assert (job.kind, job.status, job.title) == ("ingest", "pending", "書名")
        assert job.book_id is None
        assert job.params_json == {
            "file_path": str(book_file),
            "title": "書名",
            "author": "作者",
            "language": "zh",
        }

    async def test_title_defaults_to_file_stem(self, env, book_file):
        service, sf = env
        job = await load_job(sf, await service.create_job(book_file))
        assert job.title == "莊園疑案"


class TestRunToReview:
    async def test_job_pauses_for_review(self, env, book_file):
        service, sf = env
        job_id = await service.create_job(book_file, title="莊園", author="某人")
        await service.run_to_review(job_id)

        job = await load_job(sf, job_id)
        assert job.status == "awaiting_review"
        assert job.stage == "review"
        assert job.started_at is not None
        assert job.finished_at is None
        assert job.result_json == {"bookId": job.book_id}

    async def test_book_rows_are_stored(self, env, book_file):
        service, sf = env
        job_id = await service.create_job(book_file, title="莊園", author="某人")
        await service.run_to_review(job_id)
        job = await load_job(sf, job_id)

        doc = await load_book(sf, job.book_id)
        assert (doc.title, doc.author) == ("莊園", "某人")
        assert [(c.number, c.title) for c in doc.chapters] == [(1, "起"), (2, "承"), (3, "轉")]
        assert [[p.role for p in c.paragraphs] for c in doc.chapters] == [
            [ParagraphRole.body, ParagraphRole.separator, ParagraphRole.body],
            [ParagraphRole.body],
            [ParagraphRole.body],
        ]
        assert await count(sf, BookRow) == 1
        assert await count(sf, ChapterRow) == 3
        assert await count(sf, ParagraphRow) == 5


class TestGetReviewData:
    async def test_returns_chapters_with_global_indices(self, env, book_file):
        service, sf = env
        _, book_id = await to_review(service, sf, book_file)

        data = await service.get_review_data(book_id)
        chapters = data["chapters"]
        assert [(c["chapter_idx"], c["title"], c["role"]) for c in chapters] == [
            (0, "起", "body"),
            (1, "承", "body"),
            (2, "轉", "body"),
        ]
        assert [[p["paragraph_index"] for p in c["paragraphs"]] for c in chapters] == [
            [0, 1, 2],
            [3],
            [4],
        ]
        first = chapters[0]["paragraphs"][0]
        assert first["title_span"] == [0, 1]
        assert first["text"].startswith("起\n偵探")
        assert len(first["sentences"]) > 1
        assert chapters[0]["paragraphs"][1]["role"] == "separator"

    async def test_unknown_book_is_review_not_open(self, env):
        service, _ = env
        with pytest.raises(ReviewStateError) as exc:
            await service.get_review_data("no-such-book")
        assert exc.value.code == "review_not_open"


class TestSubmitReviewAccept:
    """chapters 省略或空清單＝照系統判斷接受。"""

    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"chapters": None, "role_overrides": {}, "paragraph_splits": {}},
            {"chapters": []},
            # 沒給 chapters 時，角色覆寫與切段也不套用
            {"role_overrides": {"0": "epigraph"}, "paragraph_splits": {"3": [10]}},
        ],
    )
    async def test_job_done_and_rows_unchanged(self, env, book_file, payload):
        service, sf = env
        job_id, book_id = await to_review(service, sf, book_file)
        before = await load_book(sf, book_id)

        await service.submit_review(book_id, payload)

        job = await load_job(sf, job_id)
        assert job.status == "done", job.error
        assert job.progress == 100
        assert job.finished_at is not None
        assert job.result_json == {"bookId": book_id, "chapterCount": 3, "paragraphCount": 5}
        assert await load_book(sf, book_id) == before


class TestSubmitReviewEdited:
    async def test_merge_chapters_and_change_role(self, env, book_file):
        service, sf = env
        job_id, book_id = await to_review(service, sf, book_file)
        before = await load_book(sf, book_id)

        await service.submit_review(
            book_id,
            {
                "chapters": [
                    {"title": "楔子", "role": "preface", "start_paragraph_index": 0},
                    {"title": "正文", "role": "body", "start_paragraph_index": 3},
                ],
                "role_overrides": {},
                "paragraph_splits": {},
            },
        )

        doc = await load_book(sf, book_id)
        assert [(c.number, c.title, c.role) for c in doc.chapters] == [
            (0, "楔子", ChapterRole.preface),
            (1, "正文", ChapterRole.body),
        ]
        assert [len(c.paragraphs) for c in doc.chapters] == [3, 2]
        assert [p.position for p in doc.chapters[1].paragraphs] == [0, 1]
        assert {p.chapter_number for p in doc.chapters[1].paragraphs} == {1}
        # 段落本身沒被動到：id 與文字照舊
        flat_before = [(p.id, p.text) for c in before.chapters for p in c.paragraphs]
        assert [(p.id, p.text) for c in doc.chapters for p in c.paragraphs] == flat_before
        assert await count(sf, ChapterRow) == 2
        assert await count(sf, ParagraphRow) == 5

        job = await load_job(sf, job_id)
        assert job.status == "done", job.error
        # chapterCount 只算正文章
        assert job.result_json == {"bookId": book_id, "chapterCount": 1, "paragraphCount": 5}

    async def test_splits_and_role_overrides_applied(self, env, book_file):
        service, sf = env
        _, book_id = await to_review(service, sf, book_file)
        before = await load_book(sf, book_id)
        target = before.chapters[1].paragraphs[0].text  # 全書索引 3
        cut = target.index("偵探蹲下來")

        await service.submit_review(
            book_id,
            {
                # 切段後索引：0,1,2 | 3,4 | 5
                "paragraph_splits": {"3": [cut]},
                "role_overrides": {"2": "epigraph"},
                "chapters": [
                    {"title": "起", "role": "body", "start_paragraph_index": 0},
                    {"title": "承", "role": "body", "start_paragraph_index": 3},
                    {"title": "轉", "role": "body", "start_paragraph_index": 5},
                ],
            },
        )

        doc = await load_book(sf, book_id)
        assert [len(c.paragraphs) for c in doc.chapters] == [3, 2, 1]
        assert [p.text for p in doc.chapters[1].paragraphs] == [target[:cut], target[cut:]]
        assert doc.chapters[1].paragraphs[0].title_span == (0, 1)
        assert doc.chapters[1].paragraphs[1].title_span is None
        assert doc.chapters[0].paragraphs[2].role == ParagraphRole.epigraph
        assert await count(sf, ParagraphRow) == 6


class TestReviewState:
    async def test_second_submit_is_review_submitted(self, env, book_file):
        service, sf = env
        _, book_id = await to_review(service, sf, book_file)
        await service.submit_review(book_id, {})

        with pytest.raises(ReviewStateError) as exc:
            await service.submit_review(book_id, {})
        assert exc.value.code == "review_submitted"
        with pytest.raises(ReviewStateError) as exc:
            await service.get_review_data(book_id)
        assert exc.value.code == "review_submitted"

    async def test_submit_on_unknown_book_is_review_not_open(self, env):
        service, _ = env
        with pytest.raises(ReviewStateError) as exc:
            await service.submit_review("no-such-book", {})
        assert exc.value.code == "review_not_open"

    @pytest.mark.parametrize(
        ("status", "result", "code"),
        [
            ("error", {"bookId": "b"}, "review_closed"),
            ("cancelled", {"bookId": "b"}, "review_closed"),
            ("running", {"bookId": "b"}, "review_submitted"),
            ("done", {"bookId": "b"}, "review_submitted"),
            ("running", None, "review_not_open"),
            ("pending", {"bookId": "b"}, "review_not_open"),
            ("interrupted", {"bookId": "b"}, "review_not_open"),
        ],
    )
    async def test_code_by_job_status(self, env, status, result, code):
        service, sf = env
        async with sf() as session, session.begin():
            session.add(Job(kind="ingest", book_id="b", status=status, result_json=result))
        with pytest.raises(ReviewStateError) as exc:
            await service.get_review_data("b")
        assert exc.value.code == code

    async def test_only_ingest_jobs_count(self, env):
        service, sf = env
        async with sf() as session, session.begin():
            session.add(Job(kind="method_run", book_id="b", status="awaiting_review"))
        with pytest.raises(ReviewStateError) as exc:
            await service.get_review_data("b")
        assert exc.value.code == "review_not_open"


class TestP1Failure:
    async def run_failing(self, env, path: Path) -> Job:
        service, sf = env
        job_id = await service.create_job(path)
        await service.run_to_review(job_id)  # 不往外丟
        return await load_job(sf, job_id)

    async def test_unsupported_suffix(self, env, tmp_path):
        path = tmp_path / "book.xyz"
        path.write_text(BOOK_TEXT, encoding="utf-8")
        job = await self.run_failing(env, path)
        assert job.status == "error"
        assert job.error_kind == "unsupported_format"
        assert "Unsupported file type" in job.error
        assert job.finished_at is not None
        assert job.book_id is None

    async def test_empty_file(self, env, tmp_path):
        path = tmp_path / "empty.txt"
        path.write_text("", encoding="utf-8")
        job = await self.run_failing(env, path)
        assert job.status == "error"
        assert job.error_kind == "no_extractable_text"
        assert job.book_id is None
        assert await count(env[1], BookRow) == 0

    async def test_missing_file(self, env, tmp_path):
        job = await self.run_failing(env, tmp_path / "gone.txt")
        assert job.status == "error"
        assert job.error_kind == "file_not_found"

    async def test_review_after_failure_is_review_closed(self, env, book_file):
        """審閱開著的時候 job 進了 error（例如續跑失敗）→ review_closed。"""
        service, sf = env
        job_id, book_id = await to_review(service, sf, book_file)
        async with sf() as session, session.begin():
            (await session.get(Job, job_id)).status = "error"

        with pytest.raises(ReviewStateError) as exc:
            await service.get_review_data(book_id)
        assert exc.value.code == "review_closed"
        with pytest.raises(ReviewStateError) as exc:
            await service.submit_review(book_id, {})
        assert exc.value.code == "review_closed"

    async def test_resume_failure_marks_job_error(self, env, book_file):
        service, sf = env
        job_id, book_id = await to_review(service, sf, book_file)

        # start_paragraph_index 缺漏 → 重建章節時出錯
        await service.submit_review(book_id, {"chapters": [{"title": "壞掉"}]})

        job = await load_job(sf, job_id)
        assert job.status == "error"
        assert job.error_kind == "internal"
        assert job.finished_at is not None
        # 交易回滾，章節沒被動到
        assert await count(sf, ChapterRow) == 3
        assert await count(sf, ParagraphRow) == 5


class TestRestart:
    async def test_review_survives_restart(self, tmp_path, book_file):
        async with open_service(tmp_path) as (service, sf):
            job_id, book_id = await to_review(service, sf, book_file)
        # engine 已 dispose、checkpointer 已關；以下是同兩個檔上全新的一組。

        async with open_service(tmp_path) as (service, sf):
            job = await load_job(sf, job_id)
            assert job.status == "awaiting_review"
            assert job.book_id == book_id

            data = await service.get_review_data(book_id)
            assert [c["title"] for c in data["chapters"]] == ["起", "承", "轉"]

            await service.submit_review(
                book_id,
                {
                    "chapters": [
                        {"title": "上", "role": "body", "start_paragraph_index": 0},
                        {"title": "下", "role": "body", "start_paragraph_index": 3},
                    ]
                },
            )

            job = await load_job(sf, job_id)
            assert job.status == "done", job.error
            assert job.result_json == {"bookId": book_id, "chapterCount": 2, "paragraphCount": 5}
            doc = await load_book(sf, book_id)
            assert [c.title for c in doc.chapters] == ["上", "下"]
