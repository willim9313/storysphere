# TaskStore 介面收成 async（拆掉 sync-over-async 橋接）

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/api/store.py`
**前置**: [背景任務 runner 收斂](./20260819-background-task-runner.md) —— 先做那份，本份的呼叫端從 43 處降為 1 處

---

> ## ⚠️ 2026-08-19 更正（同日、實作 runner P1 時查證）
>
> 本文件原有**兩處事實錯誤**，都朝「低估嚴重度」的方向錯。已在 §2.4、§4、§5、§6
> 就地更正，此處先總述，避免只讀前半段的人被誤導。
>
> **原記「`SQLiteTaskStore` 零測試」—— 該說法是錯的。**
> 它有測試：`tests/api/test_murmur.py`、`test_chapter_review.py`、`test_task_store_list.py`。
> 但實情比原本寫的更值得注意，詳見 §2.4。
>
> **原記「`task_store_backend` 預設是 `memory`」—— 該說法是錯的。**
> 程式預設是 **`sqlite`**（`config/settings.py`），只有 `.env` 把它蓋成 `memory`。
> 任何沒有 `.env` 的環境（新 clone、容器、CI、git worktree）跑的都是 sqlite。
>
> **連帶的結論改變**：原文把這條路徑描述成「從未被執行過」的休眠風險。實測後不成立
> —— **既有測試在 sqlite 下有 22 項失敗**（見 §2.5）。這不是待防範的風險，是現行狀態。

---

## 1. 現況

`api/store.py` 有兩個 backend，靠 `Settings.task_store_backend`（`memory` / `sqlite`）選擇：

| | `MemoryTaskStore` | `SQLiteTaskStore` |
|---|---|---|
| 介面 | 天生同步（操作 dict） | **同步方法包非同步實作** |
| 持久化 | 無，重啟即失 | 有 |
| 測試覆蓋 | 有（`tests/api/test_task_store_list.py` 等） | 有，但**只測得到能動的那條分支**（見 §2.4） |

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

### 2.4 🔴 有測試，但測的是唯一能動的那條分支

> **本節已於 2026-08-19 重寫。** 原標題為「🟡 零測試」，內容宣稱
> 「`SQLiteTaskStore` 沒有任何測試涵蓋（全 repo 只有 `api/main.py:255,257` 引用它）」。
> **該說法是錯的** —— 原始查證只 grep 了 `backend/`，沒有 grep `tests/`。

`SQLiteTaskStore` 有測試，分佈在三個檔案：

| 檔案 | 測什麼 |
|---|---|
| `tests/api/test_task_store_list.py` | `create(kind=, title=)` 往返、`list()` 的排序與 `recent_limit` |
| `tests/api/test_murmur.py` | `append_murmur` / `get_murmur_events`、跨連線持久化 |
| `tests/api/test_chapter_review.py` | 章節審閱路徑上的 store 操作 |

**但它們全部是同步 test function，用 `asyncio.run(...)` 驅動**：

```python
def test_create_with_kind_and_title_round_trips(self, tmp_path):   # ← 同步
    store = SQLiteTaskStore(str(tmp_path / "tasks.db"))
    store.create("t1", kind="symbol", title="符號意象生成")
    task = asyncio.run(store._async_get("t1"))                     # ← 私有 async 方法
```

兩個後果，正好各對應一個缺陷：

1. **寫入走的是「沒有 running loop」分支** —— `_run()` 落到 `run_until_complete` / `asyncio.run`，寫入**同步完成**。§2.2 的 fire-and-forget 從未被觸及
2. **讀取繞開同步 `get()`**，直接呼叫私有的 `_async_get`。§2.1 那個「恆回 `None`」的公開方法，沒有任何測試碰過

也就是說：測試存在、會過、且**給出假的信心** —— 它們跑的是生產環境永遠不會走的那條路徑。

**這比「零測試」更糟。** 零測試至少誠實地顯示為未覆蓋；這裡是綠燈蓋住紅燈。

### 2.5 🔴 既有測試在 sqlite 下有 22 項失敗

2026-08-19 於 main 實測（worktree 無 `.env`，因此吃到 `sqlite` 的程式預設）：

| backend | 結果 |
|---|---|
| `TASK_STORE_BACKEND=memory` | 1550 passed / **0 failed** |
| `sqlite`（**程式預設**） | 1528 passed / **22 failed** |

失敗訊息直指本文件的診斷，例如：

```
AttributeError: 'NoneType' object has no attribute 'status'      ← §2.1，get() 回 None
AttributeError: 'SQLiteTaskStore' object has no attribute '_store'
AssertionError: assert 'pending' == 'error'                       ← §2.2，寫入沒落地
AssertionError: assert 'running' == 'error'
```

**失敗數還跑跑不一樣**（同日另一次跑出 19），因為 fire-and-forget 寫入加上 `task_store` 是全域單例，測試順序會改變結果。非決定性本身就是 §2.2 的直接證據。

**這推翻了原文「這條路徑從未在 CI 或日常開發中被執行過」的判斷** —— 它天天被執行，只是被 `.env` 蓋成 memory 而看不見；一旦環境少了 `.env`，紅的就是這 22 個。

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
| P1 | **先補測試**：針對 `SQLiteTaskStore` 寫 `tests/api/test_sqlite_task_store.py`（`tmp_path` 真實 SQLite），且**必須從 async test function 呼叫**（`async def`，不是 `asyncio.run`）—— 那才是生產環境的執行條件，也是既有三個測試檔漏掉的。涵蓋 create → set_running → set_progress → set_completed → get 的完整往返。**這批測試在改動前應該是紅的** |
| P2 | 介面改 async、刪 `_run()` 與同步 `get`/`list`、刪四個 wrapper、呼叫端加 `await` |
| P3 | （可選，獨立）連線復用 |

> **2026-08-19 更正**：原文此處寫「P1 先行是刻意的：這條路徑目前零覆蓋，沒有測試就改
> 等於盲改」。前半仍成立，理由要換 —— 不是沒有測試，而是**既有測試測錯分支**（§2.4），
> 且 §2.5 那 22 個紅測試已經是現成的驗收標的。P1 的產出因此有兩個用途：補上缺的
> async 覆蓋，以及在 P2 之後讓那 22 個一起轉綠。

---

## 5. 驗證方式

- **兩種 backend 各跑一次**，比對基線與改動後。只跑一種驗不出東西 —— `.env` 存不存在會決定跑到哪條路徑（§2.5）：

  ```bash
  TASK_STORE_BACKEND=memory python -m pytest    # 基線 1550 passed / 0 failed
  TASK_STORE_BACKEND=sqlite python -m pytest    # 基線 1528 passed / 22 failed
  ```

- **驗收標的**：§2.5 那 22 項在 P2 之後應轉綠，且兩種 backend 的結果**一致**。這是本份計畫是否成功的單一判準
- P1 新增的測試在 P2 後全綠
- 手動：`.env` 設 `TASK_STORE_BACKEND=sqlite`，跑一次完整 ingestion，確認任務中心的進度、完成、以及重啟後任務仍在

---

## 6. 明確不做

- **不改 `Settings.task_store_backend` 的預設值**。切換預設是部署決策，屬 B-011

  > **2026-08-19 更正**：原文括號寫「維持 `memory`」，**該說法是錯的** —— 程式預設是
  > `sqlite`，只有 `.env` 把它蓋成 `memory`。本條的結論不變（本次不動預設值），但理由
  > 相反：正因為預設是 sqlite，修好它才是唯一的解，把預設改成 memory 只是把問題藏回去。
- **不改 `TaskStatus` schema**，因此 `docs/API_CONTRACT.md` 不需更新
- **不動 murmur 事件的儲存方式**（`append_murmur` / `get_murmur_events` 本來就是 async，不在本次範圍）

---

## 7. 回滾

P1 純新增測試，無風險。P2 是單檔改動加呼叫端加 `await`，revert 該 commit 即還原。
