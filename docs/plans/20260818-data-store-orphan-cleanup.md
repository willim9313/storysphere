# 持久化落點的孤兒資料清理

**日期**: 2026-08-18
**狀態**: 規劃，尚未實作
**前置**: PR #39 已補上刪書時清 `symbol_store.db`（只對之後的刪除生效）

---

## 起因

盤點九個持久化落點時（見 [`docs/guides/data-stores.md`](../guides/data-stores.md)）
發現刪書沒有清 `symbol_store.db`。補上之後對現有資料做了一次稽核，確認還有兩處
會累積，加上一個獨立的欄位未填問題。

**稽核當下的實際數字**（`var/` 下的開發資料，3 本書）：

| 落點 | 現況 |
|------|------|
| `symbol_store.db` | 28 個 `book_id`，其中 **25 個已無對應書籍**；單一孤兒最多 425 列 occurrence |
| `ingestion_checkpoints.db` | **34 個 thread、125 個 checkpoint、916 列 writes**，761 KB |
| `token_usage.db` | 4,136 列，`book_id` 非 NULL 的 **0 列** |

稽核方式（可重跑）：以 `var/storysphere.db` 的 `documents.id` 為現存書籍名單，
逐一比對各檔案裡帶 `book_id` 的列。

---

## 三件獨立的事

刻意分開，因為性質不同：一件是一次性資料維護，一件是生命週期缺陷，一件是
功能從未生效。**不建議合併成一個 PR。**

---

### A. `symbol_store.db` 的歷史殘留 — 一次性清理腳本

**性質**：資料維護，不是程式碼缺陷。刪書路徑已經修好，這裡處理的是修好之前
累積的資料。

**做法**：新增 `scripts/prune_orphan_symbols.py`，比照 `scripts/renumber_chapters.py`
的既有慣例：

- 預設 dry-run，只列出將刪除的 `book_id` 與列數
- `--apply` 才真的刪，且在動手前把 `var/symbol_store.db` 備份到
  `var/backup-<timestamp>/`（`renumber_chapters.py` 已經是這個模式）
- 現存書籍名單從 `DocumentService` 取，不要直接開 SQLite——否則 `database_url`
  被 `.env` 改掉時會對到錯的檔案

**判準**：`imagery_entities` 與 `symbol_occurrences` 兩個表的 `book_id`
不在現存名單內即刪除。兩表都要清，`symbol_occurrences` 的量級更大。

**風險**：低。這些列沒有任何查詢路徑會讀到（所有查詢都帶 `book_id`）。
但仍必須備份——這是使用者的真實資料。

**不要做**：不要在應用啟動時自動清理。開機做破壞性資料操作是把一次性維護
偽裝成常態行為，出錯時無從察覺。

---

### B. `ingestion_checkpoints.db` 持續累積 — 生命週期缺陷

**性質**：真正的缺陷，會無限成長。

**累積機制**（三條路徑疊加）：

1. 匯入暫停等章節審閱時，checkpoint **必須**保留——resume 要靠它。
2. 使用者若從此不再 resume（關掉分頁、放棄那本書），沒有任何路徑會清它。
3. `_reconcile_stale_tasks`（`api/main.py`）本來會在啟動時清掉孤兒 task 的
   checkpoint，但它是從 task store 讀待清名單，而 repo 的 `.env` 設定
   `TASK_STORE_BACKEND=memory` —— **伺服器一重啟，任務狀態全失，名單是空的**，
   於是誰都不會被清。

第 3 點是關鍵：在 sqlite backend 下這個機制是有效的，memory backend 下形同虛設。

**候選解法**（需要先決定走哪條，別直接動手）：

| 解法 | 優點 | 代價 |
|------|------|------|
| 啟動時掃 checkpoint，thread_id 不在 task store 就刪 | 直接對症 | memory backend 下每次重啟都會清掉**還能用的** awaiting_review checkpoint，等於廢掉 HITL 續跑 |
| checkpoint 加 TTL（例如 7 天未動就清） | 不依賴 task store | 需要讀 checkpoint 的時間戳，LangGraph 的 schema 是它自己的，要確認可用欄位 |
| `.env` 改回 `TASK_STORE_BACKEND=sqlite` | 一行設定，讓既有機制生效 | 改變開發環境行為；要確認 sqlite backend 在單機 reload 模式下沒有鎖競爭 |
| 提供 `scripts/prune_checkpoints.py` 手動清 | 最安全 | 不會自動發生，等於接受它慢慢長大 |

**我的傾向**：先確認第三條的可行性。既有機制是對的，只是被設定架空了；
與其加新機制，不如讓舊的能動。但這需要實測 sqlite task store 在
`--reload` 下的行為，不能憑推測。

**先做的事**：確認 LangGraph 的 checkpoint schema 有沒有可用的時間欄位
（`checkpoints` 表已知有 `thread_id`，其餘欄位要實際查）。這決定 TTL 方案
是否可行。

---

### C. `token_usage.db` 的 `book_id` 從未填入 — 功能未生效

**性質**：與清理無關，是稽核時順帶發現的。欄位存在、寫入端也有傳，但值永遠是
NULL，所以「哪本書花了多少 token」查不出來。

**已知事實**：
- `core/token_store.py` 的 schema 有 `book_id TEXT`，`record()` 也收這個參數
- `core/token_callback.py` 三處呼叫都有傳 `book_id=book_id`
- 4,136 列實測全為 NULL

**待查**：`token_callback.py` 裡那個 `book_id` 變數的來源。多半是某個
context var 或參數在呼叫鏈上從來沒被設定過。要先找出斷點在哪，再決定是補上
設定的地方、還是這個欄位本來就該拿掉。

**不要做**：在確認斷點之前不要動 schema。欄位可能是刻意預留的。

---

## 建議順序

1. **C 的調查**（只讀，不改）——最便宜，而且結論可能影響要不要保留欄位
2. **A**（一次性腳本）——獨立、低風險、立刻回收 647 KB 裡的大部分
3. **B**（生命週期）——需要先做決定，實作前應確認 sqlite backend 的行為

三件事沒有相依關係，可以任意順序或並行。

---

## 驗收

- A：腳本 dry-run 的輸出與稽核數字一致；`--apply` 後重跑稽核，孤兒數為 0；
  現存 3 本書的意象列數不變
- B：視選定解法而定，但**必須**有一個測試證明 awaiting_review 的 checkpoint
  不會被誤清——那是 HITL 續跑的唯一依據
- C：調查產出一份說明斷點在哪的結論，不一定要有程式碼

---

## 範圍外

- **合併九個持久化落點**：另一件事，規模大得多，目前沒有排程
- **`.env` 的 `TASK_STORE_BACKEND` 改動**：只有在 B 選了第三條解法時才動，
  且要單獨評估
