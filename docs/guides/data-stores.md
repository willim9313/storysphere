# 持久化落點 — 誰擁有哪個檔案

**狀態**: ✅ 已實作
**內容**: 執行期產生的每個資料檔、它的擁有者、設定鍵，以及刪掉它會失去什麼

系統沒有單一資料庫。九個獨立的檔案各自由不同的服務管理連線與建表，彼此沒有
外鍵關係，也沒有跨檔交易。這份文件是它們的索引。

---

## 落點在哪裡

所有預設路徑都是**相對路徑** `./var/…`，因此實際落點取決於**啟動時的工作目錄**。
README 與 `.claude/skills/verify/SKILL.md` 的指令都在 repo 根目錄執行：

```bash
uv run uvicorn storysphere.api.main:app --host 0.0.0.0 --port 8000 --reload
```

所以正式的資料目錄是 repo 根的 `var/`。從別的目錄啟動會在那裡另外長出一份空的
`var/`，看起來像「資料不見了」——2026-08-18 清掉的 `backend/var/` 就是這樣來的
（四個檔案全是 0 筆的空 schema）。

---

## 九個檔案

| 檔案 | 擁有者 | 設定鍵 | 內容 |
|------|--------|--------|------|
| `storysphere.db` | `services/document_service.py` | `database_url` | 書、章節、段落。SQLAlchemy + aiosqlite，唯一用 ORM 的一個 |
| `knowledge_graph.json` | `services/kg_service.py` | `kg_persistence_path` | NetworkX 知識圖譜快照。**不是 SQLite**；`kg_mode=neo4j` 時 `deps.py` 走另一個分支，這個檔完全不建立 |
| `qdrant_local/` | `services/vector_service.py` | `qdrant_local_path` | 段落向量，每本書一個 collection。非 lightweight 模式改連遠端 Qdrant |
| `analysis_cache.db` | `services/analysis_cache.py` | `analysis_cache_db_path` | 深度分析結果快取。key 形如 `character:{book}:{entity}`，永不自動過期，靠 `services/cache_invalidation.py` 明確清除 |
| `symbol_store.db` | `services/symbol_service.py` | **無**（見下方註記） | 意象實體與出現位置 |
| `token_usage.db` | `core/token_store.py` | `token_usage_db_path` | LLM token 用量記錄。非書本綁定 |
| `inferred_relations.db` | `services/link_prediction_store.py` | `link_prediction_db_path` | 隱性關係推論結果（F-01）與人工審核狀態 |
| `tasks.db` | `api/store.py` | `task_store_db_path` | 背景任務狀態。`task_store_backend` **預設就是 `sqlite`**，所以這個檔平常有在用 |
| `ingestion_checkpoints.db` | LangGraph（`api/main.py` 的 lifespan 建立） | `ingestion_checkpoint_db_path` | 章節審閱的 HITL checkpoint，`thread_id` == `task_id` |

> **`symbol_store.db` 是唯一不可設定的**：路徑寫死在 `SymbolService.__init__` 的
> 預設參數 `db_path: str = "./var/symbol_store.db"`，沒有對應的 settings 欄位，
> 也不吃環境變數。其餘八個都能透過 `.env` 覆寫。

`var/backup-*/` 不是殘留——那是 `scripts/renumber_chapters.py` 在 `--apply` 之前
自動備份被改動檔案的落點。沒有任何執行期程式碼讀取它們。

---

## 刪一本書時，誰會被清掉

跨檔清理沒有交易保護，靠 `delete_book`（`api/routers/books.py`）逐一呼叫：

| 目標 | 怎麼清 |
|------|--------|
| `qdrant_local/` | `vector.delete_collection(book_id)` |
| `knowledge_graph.json` | `kg.remove_by_document(book_id)` |
| `analysis_cache.db` | `cache.invalidate("%{book_id}%")` + 逐一清 TEU key |
| `inferred_relations.db` | `lp.delete_by_document(book_id)` |
| `ingestion_checkpoints.db` | `cleanup_ingestion_checkpoint(task_id)`（僅當該書還有進行中的任務） |
| `symbol_store.db` | `symbols.delete_by_book(book_id)` |
| `storysphere.db` | `doc.delete_document(book_id)`，最後一步 |

九個檔案中只有 `token_usage.db` 不參與——它記錄的是全域 LLM 用量，不綁書。

> **歷史註記**：`symbol_store.db` 一度是漏掉的那一個。`SymbolService.delete_by_book()`
> 早就存在，但唯一的呼叫端是 `pipelines/symbol_discovery/pipeline.py`（重新匯入前
> 先清空），`delete_book` 沒有呼叫它，所以刪書會留下孤兒意象資料。2026-08-18 補上。
> 在那之前刪過的書，其意象列仍留在 `symbol_store.db` 裡；不影響功能（所有查詢都
> 帶 `book_id`），只是佔空間。

TEU key 必須在 `kg.remove_by_document` **之前**收集：它們只帶 event id、不帶
book id，無法用 pattern 匹配，KG 的列一旦刪掉就再也找不回那些 id。

---

## 刪掉某個檔案會怎樣

沒有任何一個檔案是「刪了就自動重建內容」的——重建的只有 schema。

| 刪掉 | 後果 |
|------|------|
| `storysphere.db` | 書全部消失。其他檔案裡的資料變成孤兒（它們只存 book id，不存書本身） |
| `knowledge_graph.json` | 實體、關係、事件全失。需重跑 knowledge-graph 步驟 |
| `qdrant_local/` | 語意搜尋與 chat 檢索失效。需重跑 feature-extraction |
| `analysis_cache.db` | 深度分析、SEP、敘事結構、張力全部要重新花錢生成 |
| `symbol_store.db` | 意象與出現位置全失。需重跑 symbol-discovery |
| `token_usage.db` | 只失去歷史統計，不影響功能 |
| `inferred_relations.db` | 推論結果與人工審核狀態全失，需重跑推論 |
| `tasks.db` | 失去歷史任務清單；進行中的任務會在下次啟動被標記為失敗 |
| `ingestion_checkpoints.db` | 正在等待章節審閱的上傳無法續跑；已完成的書不受影響 |

---

## 為什麼是九個而不是一個

這是演進的結果，不是設計決定。每個服務加進來時各自選了自己的儲存方式，共通點
只有「都放在 `var/`」。實務上的後果：

- **沒有跨檔一致性**。刪書靠 `delete_book` 逐一清，漏一處就留孤兒，而且沒有任何
  機制會提醒你漏了——`symbol_store.db` 就這樣被漏了一段時間。新增 book-scoped
  的儲存時，記得回來補這裡。
- **備份要整個目錄一起做**，單獨備份 `storysphere.db` 沒有意義。
- **`analysis_cache.db` 會長得很大**（實測 2.8 MB 對 3 本書），因為它存的是 LLM
  的完整輸出。

要合併並非不可行，但那是一次會動到八個服務的重構，目前沒有排程。
