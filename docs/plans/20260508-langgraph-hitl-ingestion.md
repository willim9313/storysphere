# LangGraph HITL Ingestion Pipeline

**Date:** 2026-05-08  
**Status:** Implemented

## 背景

原有章節審閱暫停機制使用 `asyncio.Event` + module-level registry (`review_registry.py`) 在 in-process 阻塞等待用戶提交。每次 server restart / hot-reload 都會清空 `_events` dict，取消正在等待的 pipeline coroutine，導致用戶收到 409 且書無法完成處理。

## 解決方案

改用 LangGraph `interrupt()` + `AsyncSqliteSaver`：
- 圖狀態 checkpoint 到 SQLite → restart 後可 resume
- 不再需要 blocking coroutine
- 未來加更多 HITL 斷點只需加一個 node

## 架構

```
ingestion_graph.py
  ├─ phase1_node  → IngestionWorkflow.run_phase1() → set_awaiting_review
  ├─ chapter_review_node → interrupt() ← HITL 斷點
  └─ phase2_node  → IngestionWorkflow.run_phase2() → set_completed
```

Graph state (`IngestionState`) 輕量：只存 file_path、task_id、doc_id、結果統計。Document 物件（~160MB）不進 checkpoint。

## 檔案變動

### 新增
- `src/workflows/ingestion_graph.py` — IngestionState + 3 nodes + `build_ingestion_graph()`
- `docs/plans/20260508-langgraph-hitl-ingestion.md` — 本文件

### 修改
- `src/workflows/ingestion.py` — 拆出 `run_phase1()` / `run_phase2(doc_id)`；`run()` 改為直接呼叫 phase1+phase2（無 review 暫停）
- `src/api/store.py` — 兩個 store 各加 `get_task_id_by_book_id(book_id)`；module-level `get_task_id_by_book_id()` async helper
- `src/api/deps.py` — 加 `get_ingestion_graph()` / `set_ingestion_graph()` singleton
- `src/api/main.py` — lifespan 初始化 `AsyncSqliteSaver` + `build_ingestion_graph()`
- `src/api/routers/books.py` — `POST /upload` 改用 graph；review endpoints 改查 task_store；`POST /review` 改 Command(resume) + optimistic set_running
- `src/config/settings.py` — `task_store_backend` 預設改 `"sqlite"`；加 `ingestion_checkpoint_db_path`
- `tests/api/test_chapter_review.py` — 移除 TestReviewRegistry；更新 endpoint tests 使用 task_store

### 刪除
- `src/api/review_registry.py` — 完全被 LangGraph interrupt 取代

## 關鍵設計決策

1. **Optimistic status update in POST /review**: 呼叫 `task_store.set_running(task_id)` 在 return 204 前，確保重複提交會收到 409（background task 還沒跑到）
2. **AsyncSqliteSaver context manager**: 在 lifespan 的 `async with` block 內，checkpointer 連線存活整個 app 生命週期
3. **Checkpoint DB 與 Task DB 分開**: task_store → `./data/tasks.db`；ingestion checkpoint → `./data/ingestion_checkpoints.db`
4. **task_store_backend 預設改 sqlite**: LangGraph checkpoint 能跨 restart，task store 也需要能跨 restart 才能找到 task_id

## 相依套件

```toml
langgraph-checkpoint-sqlite = "^3.0.3"
```
