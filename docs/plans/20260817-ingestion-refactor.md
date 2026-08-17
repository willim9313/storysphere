# Ingestion 後端效率與可讀性改善

**日期：** 2026-08-17　**分支：** `feat/ingestion-refactor`　**範圍：** 純後端，前端零異動

> 本文是規劃當下的評估快照，實作後凍結。與現況衝突時以程式碼為準。

---

## 一、動機

Ingestion 是全系統最慢、也最難讀的一段。目標兩個：降低一本書的處理時間，
以及讓 `run_phase2` 這種 260 行、五段結構重複的函式變得能讀。

規劃過程中兩度推翻自己的判斷，記錄於此以免後人重蹈：

1. 一開始把「ingestion」窄化成 `workflows/` + `pipelines/`，漏掉上傳端點、
   LangGraph 驅動、HITL 審閱端點，以及 `_run_rerun_step` 這個第二入口。
2. 一開始假設「既有測試是重構的安全網」。實測覆蓋率後發現，**要改的地方
   幾乎都沒有測試**，這個假設完全不成立，導致整個任務順序倒轉。

---

## 二、完整流程（查證後）

### Stage 0｜HTTP 上傳
`POST /api/v1/books/upload` → `api/routers/books.py:779 upload_book`

副檔名檢查 → title 缺省退回檔名 stem → `title_exists()` 查重（**僅警告不擋**）
→ 分塊串流寫入 `NamedTemporaryFile`（超過上限 413）→ `task_store.create()`
→ `asyncio.create_task(_run_ingestion_graph(...))` → 回 202 + `task_id`。

### Stage 1｜LangGraph 驅動
`books.py:154 _run_ingestion_graph`

`graph.ainvoke(config={"thread_id": task_id})`。**`GraphInterrupt` 是預期的暫停**，
不是錯誤。失敗／取消 → `set_failed` + `_cleanup_checkpoint`；`finally` 必刪暫存檔。

圖在 lifespan 建立（`api/main.py:198`），checkpoint 存 SQLite，
結構為 `START → phase1 → chapter_review → phase2 → END`。

### Stage 2｜phase1_node — 解析與入庫
`workflows/ingestion_graph.py:50` → `workflows/ingestion.py:266 run_phase1`

| 進度 | 動作 |
|---|---|
| 5% | `DocumentProcessingPipeline`：loader → `detect_chapters` → `chunk_segments` |
| 10% | 語言偵測；`zh` 再細分 `zh-tw`／`zh-cn` |
| 15% | `save_document()` — **書此時就進書庫，之後任何失敗都不會讓它消失** |

章節編號經 `assign_chapter_numbers`，前後附錄不吃故事章號。

### Stage 3｜chapter_review_node — HITL 暫停
`interrupt()` 拋 GraphInterrupt，state 落 checkpoint。此時可用
`GET /review-data`、`POST /suggest-roles`（LLM）、`POST /parse-toc`。

`POST /review` 驗證仍在 `awaiting_review`（否則 409）後恢復圖。恢復後
**三個函式的順序有嚴格依賴**：`_apply_paragraph_splits` → `_apply_role_overrides`
→ `_rebuild_chapters`，因為後兩者的 index 指的是切分**後**的扁平段落序。

### Stage 4｜phase2_node — 五個分析步驟
每步骨架相同：`_progress` → `try/except` → `mark_done` 或 `StepStatus.failed`
→ `update_pipeline_status` → （選擇性）`save_document`。

| 進度 | 步驟 | LLM 粒度 | 續跑 |
|---|---|---|---|
| 25% | 摘要 | 每章 | ✅ `chapter.summary is not None` |
| 45% | 特徵擷取 | embedding 每章批次；keyword **每段落**\* | ✅ `chapter.keywords is not None` |
| 65% | 知識圖譜 | entity **每段落**；relation/event 每章 | ❌ |
| 82% | 符號探索 | 每章 | ❌（開頭 `delete_by_book`） |
| — | timeline 偵測 | 無 LLM | — |
| 92% | 快取失效 | — | — |

\* 取決於 `KEYWORD_EXTRACTOR_TYPE`：預設 `yake`（本機 CPU），設為 `llm` 時才是 LLM 呼叫。

### Stage 5｜收尾與重啟復原
`finally` 做 `task_registry.unregister` + `_cleanup_checkpoint`。

`api/main.py:106 _reconcile_stale_tasks`：重啟後把 `pending`/`running`
強制標記失敗並刪 checkpoint——**`awaiting_review` 是唯一能存活重啟的狀態**。

### 第二入口
`POST /books/{id}/rerun/{step}` → `books.py:437 _run_rerun_step`，是同樣五條
pipeline 的**第二套實作**，且直接存取 `IngestionWorkflow` 的私有屬性
（`wf._summarization_pipeline` 等）。這是 `run_phase2` 重複的根因：
`IngestionWorkflow` 缺一個「執行單一 step」的公開介面。

---

## 三、查證出的事實

### 覆蓋率實測（規劃當下）

| 檔案 | 覆蓋率 |
|---|---|
| `workflows/ingestion_graph.py` | **0%** |
| `knowledge_graph/pipeline.py` | **21%**（`run()` 完全未覆蓋） |
| `workflows/ingestion.py` | 52%（`run_phase1` 與 KG/符號/timeline 三步未覆蓋） |
| `chapter_detector.py` / `chunker.py` / `entity_linker.py` | 100% |

覆蓋好的都是不打算動的；要動的幾乎都沒測。**這推翻了「純重構只要測試全綠」的判準。**

### 效率瓶頸
唯一的瓶頸是 **LLM 呼叫全序列**。真正 per-paragraph 的只有 KG 實體抽取
（以及 `KEYWORD_EXTRACTOR_TYPE=llm` 時的關鍵詞）。

Embedding **不是**瓶頸——已正確丟 executor 且由模型批次處理。

`services/tension_service.py:771` 有 bounded-semaphore 樣板可參考，但
**不可照抄**：它的 `except Exception` 會吞掉 rate limit，而各 pipeline 刻意
在 rate limit 時往上拋以保住已完成的部分。照抄會造成「KG 缺一半卻標成 done」
的無聲失敗。（tension 本身不在 ingestion 路徑上，本次不動它。）

### CPU 熱點
- `kg/pipeline.py:128` `chapter_text.lower()` 在 per-entity 迴圈內，每個實體複製整章文字
- `kg/pipeline.py:280-288` `_remove_merged_relations` 用 `pop(i)`，O(n²)
- `kg/pipeline.py:180-185` chapter_entities 每章重掃全體 entity
- `kg/pipeline.py:198` `ParagraphEntityLinker.link` 同步跑在 event loop 上，
  而 `:154` 的 `EntityLinker` 有丟 executor——不一致

### 既有 bug
`kg/pipeline.py:60-70` 的 `_ENTITY_TYPE_MAP` **完全是死的**。`EntityType` 是
`(str, Enum)` mixin 而非 `StrEnum`，`str(EntityType.LOCATION)` 得到
`"EntityType.LOCATION"`，lower 後對不上任何 key，全部退回 `"topic"`。
效果是 murmur 串流中角色／地點／組織顯示成同一種。

### 死碼與冗餘（已裁決）
- `IngestionWorkflow.run()`（`:630`）零呼叫者 → **刪**。
  注意 `BaseWorkflow.run` 是 `@abstractmethod` 且 `IngestionWorkflow` 是唯一子類，
  直接刪會使 class 無法實例化，需連帶處理繼承關係。
- `run_phase2(task_id=...)` 接了但從未使用 → **拿掉**
- 五個 `skip_*` flag 只有測試在用 → **標記為 test-only**

---

## 四、任務拆解

### Task 0｜特徵化測試（已完成）
新增 `tests/pipelines/test_knowledge_graph_pipeline.py`、
`tests/workflows/test_ingestion_phase2.py`。零 production 異動。
KG pipeline 21% → 99%，ingestion.py 52% → 62%。

### Task 1｜`kg/pipeline.py` 熱點與 bug
四個 CPU／event-loop 熱點，加上 `_ENTITY_TYPE_MAP` 的 `.value` 修正。
其中 `run_in_executor` 包裝與 bug 修正是行為改動，各自獨立 commit。

### Task 2｜消除 `run_phase2` 與 `_run_rerun_step` 的重複
在 `IngestionWorkflow` 上開公開的 per-step 介面，兩邊共用，同時解掉私有屬性耦合。
併入死碼刪除與 `task_id` 移除。安全網是 `tests/api/test_books_rerun.py`。

### Task 3｜實體抽取併發控制
新增 `core/concurrency.py`（重新設計，非搬運），加 `ingestion_concurrency` 設定
（預設保守），套用到 `kg/pipeline.py` 的 per-paragraph 迴圈。
回滾方式是把設定調成 1，不必 revert 程式碼。

**不做：**符號探索的併發（其 docstring 明載為刻意的 rate-limit 決定）、
`keyword_service` 的小 fan-out、`tension_service` 遷移（不在 ingestion 路徑上）。

### Task 4｜Resume 能力（本輪不做）
`Chapter` 沒有任何欄位可記錄 KG 抽取進度，`PipelineStatus` 只有整本書層級；
符號探索的 `delete_by_book()` 本質是全有全無。補這個要動 domain model 與 DB schema，
性質與前三項不同。待 Task 3 落地、量到實際耗時後再評估。

關聯待議題目：**ingestion 的續跑／冪等行為與其他 service 差多少**——
答案會決定 Task 4 是給 ingestion 補欄位，還是各 service 都有同樣缺口而需統一機制。
