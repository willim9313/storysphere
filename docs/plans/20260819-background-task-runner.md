# 背景任務 runner 收斂與取消能力補齊

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/api/routers/*.py`、`backend/storysphere/api/task_registry.py`、新增 `backend/storysphere/api/task_runner.py`
**相關**: [TaskStore 介面收成 async](./20260819-task-store-async-interface.md)（強烈建議同一輪或緊接著做，理由見「與 TaskStore 的關係」）

---

## 1. 什麼是 runner

本文件中的 **runner** 指 router 裡那些 `async def _run_*` 函式 —— 端點收到請求後**不當場做完**，而是把真正的長工作丟給它在背景跑。

一個完整的三段式：

```python
# ① 端點：驗參數 → 建 task → 丟背景 → 立刻回 202
@router.post("/lines/group", response_model=TaskStatus, status_code=202)
async def group_tension_lines(req, background_tasks, tension_service, kg_service):
    task_id = str(uuid4())
    task_store.create(task_id, kind="tension", title="張力線分組")
    background_tasks.add_task(_run_group_lines, task_id, req, tension_service, kg_service)
    return TaskStatus(task_id=task_id, status="pending")

# ② runner：真正做事，並把進度／結果寫回 task_store
async def _run_group_lines(task_id, req, tension_service, kg_service) -> None:
    task_store.set_running(task_id)
    try:
        grouped = await tension_service.group_teus(..., progress_callback=...)
        task_store.set_completed(task_id, result={...})
    except Exception as exc:
        logger.exception(...)
        task_store.set_failed(task_id, error=str(exc))

# ③ 前端輪詢 GET /tasks/{id}/status 看 task_store 裡的狀態
```

runner 本身沒有回傳值也沒有 HTTP 語意，它唯一的對外管道就是 **task_store**。所以「runner 寫得對不對」直接決定使用者在任務中心看到什麼。

全後端目前有 **20 個 runner**，分佈在 11 支 router。

---

## 2. 現況清點（2026-08-19 實測）

| Router | runner 數 | 註冊 `task_registry` / 處理 `CancelledError` |
|---|---|---|
| `book_ingestion.py` | 1 | ✅ |
| `books.py` | 1 | ✅ |
| `narrative.py` | 4 | ❌ |
| `tension.py` | 3 | ❌ |
| `analysis.py` | 2 | ❌ |
| `book_entity_analysis.py` | 2 | ❌ |
| `book_event_analysis.py` | 2 | ❌ |
| `symbols.py` | 2 | ❌ |
| `book_graph.py` | 1 | ❌ |
| `book_timeline.py` | 1 | ❌ |
| `kg_settings.py` | 1 | ❌ |
| **合計** | **20** | **2 / 20** |

`task_store.set_running` / `set_completed` / `set_failed` / `set_progress` 的呼叫點共 **43 處**。

### 兩種啟動方式並存

| 方式 | 用在 | 能否取消 |
|---|---|---|
| `background_tasks.add_task(...)` | 18 個 runner | **不能** —— FastAPI 不交出 task handle |
| `asyncio.create_task(...)` + `task_registry.register(...)` | `books.py:293`、`book_ingestion.py` | 能 |

這才是取消能力落差的**結構性原因**，不是有人忘了寫 `except CancelledError`。

---

## 3. 問題（依嚴重度）

### 3.1 🔴 18 種背景任務無法取消（使用者可見缺陷）

`POST /tasks/{taskId}/cancel` 的實作（`api/routers/tasks.py:60`）走 `task_registry.cancel(task_id)`，查不到 handle 就回 **409 "Task is not cancellable"**。

受影響的包含**跑最久、燒最多 token** 的三個批次任務：

- 批次角色分析（`book_entity_analysis.py:279`）
- 批次事件分析（`book_event_analysis.py:406`）
- 批次象徵詮釋（`symbols.py:297`）

使用者按下取消 → 收到 409 → 任務繼續跑到完 → 配額繼續消耗。這不是理論風險，是現行行為。

### 3.2 🟡 43 處手抄簿記，行為逐份漂移

同一段「set_running → try → set_completed → except set_failed」抄了 20 次，實際內容各有出入：

- 只有 2 個有 `except asyncio.CancelledError` 分支
- 只有 2 個有 `finally: task_registry.unregister(task_id)`
- `logger.exception` 有的有、有的沒有
- 結果序列化有的是 `result.model_dump()`、有的是手組 dict、有的是 `model_dump(mode="json")`

改一次全域行為（例如「失敗時一併記錄耗時」）要動 20 個地方。

### 3.3 🟡 批次 runner 的中止路徑與「正常結束」撞型

`book_event_analysis.py:460` 的 rate-limit 中止是 `task_store.set_failed(...)` 後直接 `return`。這在**現行**寫法下正確，但一旦引入「runner 回傳結果、由外層統一 set_completed」的形狀，`return` 會被外層當成成功。設計時必須留一條明確的中止管道（見 4.3）。

---

## 4. 目標形狀

### 4.1 新增 `api/task_runner.py`

```python
class TaskAborted(Exception):
    """runner 主動中止且已有明確原因（如配額用盡），外層據此 set_failed。"""

def launch(task_id: str, coro) -> None:
    """建立 asyncio.Task、掛進 registry、由 _supervise 統一簿記。"""
    task = asyncio.create_task(_supervise(task_id, coro))
    task_registry.register(task_id, task)

async def _supervise(task_id: str, coro) -> None:
    task_store.set_running(task_id)
    try:
        result = await coro
        task_store.set_completed(task_id, result=result)
    except TaskAborted as exc:
        task_store.set_failed(task_id, error=str(exc))
    except asyncio.CancelledError:
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        task_registry.unregister(task_id)

def progress(task_id: str):
    """回傳 (pct, stage) 形式的 progress_callback，取代 20 份重複 lambda。"""
```

### 4.2 runner 改成「只做事、回傳結果」

```python
async def _group_lines(req, tension_service, kg_service) -> dict:
    grouped = await tension_service.group_teus(..., progress_callback=progress(task_id))
    return {"lines": [...], "coverage": grouped["coverage"]}
```

端點側：

```python
task_id = str(uuid4())
task_store.create(task_id, kind="tension", title="張力線分組")
task_runner.launch(task_id, _group_lines(req, tension_service, kg_service))
return TaskStatus(task_id=task_id, status="pending")
```

`task_id` 仍需傳進需要回報進度的 runner；純算完就回傳的 runner 可以完全不碰 `task_id`。

### 4.3 批次 runner 的中止改用 `TaskAborted`

```python
if _is_rate_limit_error(exc):
    raise TaskAborted(f"API 配額已達上限，已處理 {done}/{total} 個事件。請稍後再試。")
```

訊息字串**逐字不變**，前端顯示不受影響。

### 4.4 `BackgroundTasks` → `asyncio.create_task` 的行為差異

| | `BackgroundTasks` | `asyncio.create_task` |
|---|---|---|
| 開始時機 | response 送出**之後** | 立刻 |
| 例外 | 由 starlette 吞掉 | 由 `_supervise` 接住 |
| handle | 無 | 有，可取消 |

端點本來就在 `task_store.create()` 之後立刻回 202，開始時機提前不改變任何對外契約。**但**這代表 runner 可能在 response 送出前就開始寫 task_store —— 對輪詢模型無影響（前端拿到 taskId 才會開始問），仍需在測試中確認一次。

---

## 5. 與 TaskStore 的關係

`_supervise` 是**唯一**會呼叫 `task_store.set_*` 的地方之後，
[TaskStore 介面收成 async](./20260819-task-store-async-interface.md) 就從「要改 43 個呼叫點」變成「要改 1 個」。

反過來說，若先做 TaskStore 那份，43 個呼叫點都得加 `await`，然後本份再把它們刪掉 —— 白工。

**建議順序：先本份，再 TaskStore。**

---

## 6. 實作階段（每階段可獨立驗證與回滾）

| 階段 | 內容 | 檔案數 |
|---|---|---|
| P1 | 新增 `api/task_runner.py` + 單元測試（成功 / 例外 / 取消 / `TaskAborted` 四條路徑） | 2 新增 |
| P2 | 遷移 3 支「單純算完就回傳」的 router：`narrative.py`、`tension.py`、`analysis.py` | 3 修改 |
| P3 | 遷移 3 支批次 router：`book_entity_analysis.py`、`book_event_analysis.py`、`symbols.py`（含 `TaskAborted` 改寫） | 3 修改 |
| P4 | 遷移剩餘：`book_graph.py`、`book_timeline.py`、`kg_settings.py` | 3 修改 |
| P5 | 既有的 `books.py`、`book_ingestion.py` 收斂到同一套（**最後做** —— 這兩支是目前唯二正確的，先讓新機制在其他地方驗證過） | 2 修改 |

每階段 ≤ 3 檔，符合 CLAUDE.md 的紅線。

---

## 7. 驗證方式

- `python -m pytest tests/api/ -v` 無新增失敗（`test_task_cancel.py`、`test_tasks_list_endpoint.py`、`test_task_store_list.py` 是主要防線）
- **新增測試**：每支遷移過的 router 至少一個「送出 → 取消 → 狀態為 error/cancelled」的端點測試。這是本次的**核心交付**，不是附帶
- 手動：跑一次批次事件分析，中途按取消，確認任務真的停下且配額不再消耗（`GET /tokens/usage` 前後比對）

---

## 8. 明確不做

- **不改 `task_registry` 的單 worker 假設**。它的 docstring 已載明「Only valid within a single uvicorn worker process」，多 worker 是 B-011 的範圍
- **不改任何 endpoint 的路徑、request/response schema**。因此 `docs/API_CONTRACT.md` 不需更新
- **不動 `_supervise` 以外的錯誤訊息文案**
- **不順手重排 router 內其他程式碼**

---

## 9. 回滾

分階段 commit，每階段獨立可 revert。P1 只新增檔案，revert 無副作用；P2–P5 各自只碰 3 支 router。
