# TaskStore 介面收成 async（拆掉 sync-over-async 橋接）

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/api/store.py`
**前置**: [背景任務 runner 收斂](./20260819-background-task-runner.md) —— 先做那份，本份的呼叫端從 43 處降為 1 處

---

## 1. 現況

`api/store.py` 有兩個 backend，靠 `Settings.task_store_backend`（`memory` / `sqlite`）選擇：

| | `MemoryTaskStore` | `SQLiteTaskStore` |
|---|---|---|
| 介面 | 天生同步（操作 dict） | **同步方法包非同步實作** |
| 持久化 | 無，重啟即失 | 有 |
| 測試覆蓋 | 有（`tests/api/test_task_store_list.py` 等） | **零** |

`SQLiteTaskStore` 為了讓介面「長得跟 MemoryTaskStore 一樣」，用 `_run()` 把 coroutine 塞進同步方法：

```python
# api/store.py:301
def _run(self, coro):
    """Run an async method from sync context (background tasks call sync methods)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(coro)      # ← fire-and-forget
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        asyncio.run(coro)
```

---

## 2. 問題

### 2.1 🔴 讀取在 uvicorn 底下必定回空值

```python
# api/store.py:330
def get(self, task_id):
    loop = asyncio.get_event_loop()
    if loop.is_running():
        _future = asyncio.ensure_future(self._async_get(task_id))  # fire-and-forget
        return None            # ← 註解自承「polling will pick it up shortly」

# api/store.py:395
def list(self, *, recent_limit=20):
    if loop.is_running():
        asyncio.ensure_future(self._async_list(recent_limit=recent_limit))
        return []              # ← 註解自承「use async variant in router code」
```

在 uvicorn 底下 loop **永遠**是 running，所以這兩個同步方法在生產環境下是**恆定回 `None` / `[]` 的空殼**。

目前沒炸，是因為 router 全部走 `get_task()` / `list_tasks()` 兩個 async wrapper（`store.py:511`、`store.py:518`）繞過去了。但同步版仍是公開介面，下一個照著 `MemoryTaskStore` 的樣子呼叫 `task_store.get(...)` 的人會拿到 `None`，而且**不會有任何錯誤訊息**。

### 2.2 🔴 寫入是 fire-and-forget，例外被吞

`create` / `set_running` / `set_progress` / `set_completed` / `set_failed` 全部走 `_run()`。在 loop running 時 `asyncio.ensure_future(coro)` 建立的 future **沒有人 await、沒有人加 done callback**：

- SQL 寫失敗（磁碟滿、schema 不符、DB 鎖住）→ 靜默丟失，任務永遠停在上一個狀態
- 寫入順序無保證 → `set_running` 有可能在 `set_progress` 之後才落地
- `create()` 回傳的 `TaskStatus` 是**當場捏出來的**，不是 DB 讀回的 —— 就算 INSERT 失敗，端點照樣回 202 給前端一個不存在的 taskId

### 2.3 🟡 每次操作開一條新連線

`aiosqlite.connect(...)` 在檔內出現 7 次，全是 per-call context manager。批次任務每筆進度回報開關一次連線 —— 批次事件分析對 500 個事件就是 500 次。

### 2.4 🟡 零測試

`SQLiteTaskStore` 沒有任何測試涵蓋（全 repo 只有 `api/main.py:255,257` 引用它）。`task_store_backend` 預設是 `memory`，所以這條路徑從未在 CI 或日常開發中被執行過。**上述三點沒有一項會被現有測試抓到。**

---

## 3. 目標形狀

### 3.1 介面統一為 async

兩個 backend 的公開方法一律 `async def`。`MemoryTaskStore` 的實作維持同步邏輯，只是簽章加 `async`（操作 dict 不需要 await，但介面一致比省一個關鍵字重要）。

`_run()` 整個刪除。`get()` / `list()` 的同步版整個刪除，`_async_get` / `_async_list` 升為公開的 `get` / `list`。`store.py:511-556` 那四個 async wrapper 也一併刪除 —— 它們存在的唯一理由就是繞過同步版。

### 3.2 呼叫端

**若已完成 runner 收斂**：`task_store.set_*` 的呼叫點只剩 `api/task_runner.py:_supervise` 一處，加 `await` 即可。

**若未完成**：43 處呼叫點全要加 `await`，且它們散在 12 支 router 的 `_run_*` 裡 —— 那些函式本來就是 `async def`，改動機械但量大且易漏。**這就是要先做 runner 那份的理由。**

### 3.3 連線復用

`SQLiteTaskStore` 持有一條長連線（`aiosqlite.connect` 在 `_ensure_init` 建立、由 `close()` 釋放），搭配 `asyncio.Lock` 序列化寫入。

若嫌範圍太大，可拆為獨立的後續階段 —— 2.1／2.2 是正確性問題，2.3 只是效率問題。

---

## 4. 實作階段

| 階段 | 內容 |
|---|---|
| P1 | **先補測試**：針對 `SQLiteTaskStore` 寫 `tests/api/test_sqlite_task_store.py`（`tmp_path` 真實 SQLite），涵蓋 create → set_running → set_progress → set_completed → get 的完整往返。**這批測試在改動前應該有一部分是紅的** —— 那正是 2.1／2.2 的證據 |
| P2 | 介面改 async、刪 `_run()` 與同步 `get`/`list`、刪四個 wrapper、呼叫端加 `await` |
| P3 | （可選，獨立）連線復用 |

P1 先行是刻意的：這條路徑目前零覆蓋，沒有測試就改等於盲改。

---

## 5. 驗證方式

- `python -m pytest tests/api/ -v` 無新增失敗
- P1 新增的測試在 P2 後全綠
- 手動：`.env` 設 `TASK_STORE_BACKEND=sqlite`，跑一次完整 ingestion，確認任務中心的進度、完成、以及重啟後任務仍在

---

## 6. 明確不做

- **不改 `Settings.task_store_backend` 的預設值**（維持 `memory`）。切換預設是部署決策，屬 B-011
- **不改 `TaskStatus` schema**，因此 `docs/API_CONTRACT.md` 不需更新
- **不動 murmur 事件的儲存方式**（`append_murmur` / `get_murmur_events` 本來就是 async，不在本次範圍）

---

## 7. 回滾

P1 純新增測試，無風險。P2 是單檔改動加呼叫端加 `await`，revert 該 commit 即還原。
