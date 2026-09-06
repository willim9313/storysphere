"""兩個 TaskStore 實作必須表現一致 —— B-091 走查（2026-09-07）。

`MemoryTaskStore` 與 `SQLiteTaskStore` 是同一組介面的兩份實作，而**哪一份在跑
取決於設定**（`task_store_backend` 預設 sqlite，`.env` 設成 memory）。先前沒有
任何測試同時跑兩個 backend：`test_sqlite_task_store.py` 只驗 SQLite，其餘 API
測試只驗當下設定的那一個。這個缺口已經咬過一次 —— 2026-08-19 曾出現 22 項只在
其中一個 backend 下紅的測試。

判準沿用 B-048（雙 KG 後端）那次學到的：**parity 測試要驗行為，不是驗結構**。
方法名對得上不代表做同一件事，所以這裡每一項都是「做同一串操作、比對可觀察結果」。

**兩處刻意不驗的差異**（2026-09-07 實測，生產路徑不會走到）:

* `create()` 對**已存在的 task_id**：Memory 覆寫、SQLite 是 `INSERT OR IGNORE`
  保留舊列。task_id 是 uuid4，生產上不會重用；把任一邊釘死等於凍結一個沒人
  依賴的偶然行為。
* `create()` **回傳物件**的 `created_at`：Memory 有、SQLite 沒有（SQLite 的時間戳
  由 DB 預設值產生，要 `get()` 才讀得到）。全 repo 沒有任何呼叫端使用 `create()`
  的回傳值，八個呼叫點一律丟棄。
"""

from __future__ import annotations

import pytest
from storysphere.api.schemas.common import MurmurEvent


@pytest.fixture(params=["memory", "sqlite"])
def store(request, tmp_path):
    from storysphere.api.store import MemoryTaskStore, SQLiteTaskStore

    if request.param == "memory":
        return MemoryTaskStore()
    return SQLiteTaskStore(str(tmp_path / "tasks.db"))


def _murmur(content: str) -> MurmurEvent:
    # seq 由 store 指派，傳什麼都會被覆寫 —— 兩邊都是。
    return MurmurEvent(seq=0, step_key="knowledgeGraph", type="character", content=content)


class TestLifecycle:
    def test_create_then_get_roundtrips_the_fields(self, store):
        store.create("t1", kind="ingestion", title="解析")
        task = store.get("t1")
        assert (task.task_id, task.kind, task.title) == ("t1", "ingestion", "解析")
        assert task.status == "pending"
        assert task.progress == 0

    def test_unknown_task_reads_as_none(self, store):
        assert store.get("nope") is None

    def test_running_then_completed_carries_the_result(self, store):
        store.create("t1")
        store.set_running("t1")
        assert store.get("t1").status == "running"

        store.set_completed("t1", {"ok": 1})
        task = store.get("t1")
        # stage 一起驗：它是任務中心顯示的那行字，而兩邊各自寫死一份中文字串。
        assert (task.status, task.progress, task.stage, task.result) == (
            "done", 100, "完成", {"ok": 1},
        )

    def test_failed_carries_the_message_and_stage(self, store):
        store.create("t1")
        store.set_failed("t1", "boom")
        task = store.get("t1")
        assert (task.status, task.stage, task.error) == ("error", "失敗", "boom")

    def test_setters_on_an_unknown_id_are_no_ops(self, store):
        """不存在的 task 不該炸，也不該被憑空建出來。"""
        store.set_running("nope")
        store.set_progress("nope", 50, "x")
        store.set_completed("nope", {})
        store.set_failed("nope", "e")
        assert store.get("nope") is None


class TestProgress:
    def test_every_progress_field_is_written(self, store):
        store.create("t1")
        store.set_progress(
            "t1", 40, "半路",
            step_key="knowledgeGraph", sub_progress=2, sub_total=5, sub_stage="章 2",
        )
        task = store.get("t1")
        assert (task.progress, task.stage) == (40, "半路")
        assert (task.step_key, task.sub_progress, task.sub_total, task.sub_stage) == (
            "knowledgeGraph", 2, 5, "章 2",
        )


class TestAwaitingReview:
    def test_awaiting_review_is_findable_by_book(self, store):
        store.create("t1", kind="ingestion")
        store.set_awaiting_review("t1", "book-1")
        task = store.get("t1")
        assert (task.status, task.stage) == ("awaiting_review", "章節審閱")
        # result 是前端拿 bookId 的地方 —— SQLite 存 JSON 字串、Memory 存 dict，
        # 讀回來必須都是 dict。
        assert task.result == {"bookId": "book-1"}
        assert store.get_task_id_by_book_id("book-1") == "t1"

    def test_unknown_book_has_no_task(self, store):
        assert store.get_task_id_by_book_id("no-such-book") is None


class TestList:
    def test_active_tasks_come_before_terminal_ones(self, store):
        store.create("done-1")
        store.set_completed("done-1", {})
        store.create("active-1")

        ids = [t.task_id for t in store.list()]
        assert ids.index("active-1") < ids.index("done-1")

    def test_recent_limit_caps_terminal_tasks_only(self, store):
        for i in range(3):
            store.create(f"done-{i}")
            store.set_completed(f"done-{i}", {})
        store.create("active-1")

        listed = store.list(recent_limit=1)
        assert [t.task_id for t in listed if t.status == "done"].__len__() == 1
        assert "active-1" in [t.task_id for t in listed]


class TestMurmur:
    @pytest.mark.asyncio
    async def test_seq_is_assigned_ascending_from_zero(self, store):
        store.create("t1")
        for i in range(3):
            await store.append_murmur("t1", _murmur(f"m{i}"))

        events = await store.get_murmur_events("t1")
        assert [(e.seq, e.content) for e in events] == [(0, "m0"), (1, "m1"), (2, "m2")]

    @pytest.mark.asyncio
    async def test_after_is_inclusive_of_that_seq(self, store):
        """`after=1` 從 seq 1 開始回傳 —— 名字像「之後」，行為是「含」。

        兩邊實作路徑不同（Memory 切片索引、SQLite `seq >= ?`），結果必須相同。
        """
        store.create("t1")
        for i in range(3):
            await store.append_murmur("t1", _murmur(f"m{i}"))

        events = await store.get_murmur_events("t1", after=1)
        assert [e.seq for e in events] == [1, 2]

    @pytest.mark.asyncio
    async def test_unknown_task_has_no_events(self, store):
        assert await store.get_murmur_events("nope") == []
