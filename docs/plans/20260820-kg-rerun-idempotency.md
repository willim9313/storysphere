# KG 重跑非冪等：實體 / 關係 / 事件三者都會累積

**日期**: 2026-08-20
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/pipelines/knowledge_graph/pipeline.py`、`backend/storysphere/workflows/ingestion.py`
**性質**: 資料正確性缺陷。已在真實資料上發生，非理論風險
**Backlog**: B-082（本文件同時開立）

> 本文是規劃當下的評估快照，實作後凍結。與現況衝突時以程式碼為準。

---

## 1. 症狀

`var/knowledge_graph.json` 四本書的實測（2026-08-20）：

| 書 | entities | 相異 (name, type) | events | 相異標題 | edges | 相異簽章 |
|---|---|---|---|---|---|---|
| **dd129f3d** Age of Fire (併發驗證) | **195** | 73 | **101** | 67 | **326** | 168 |
| 1a1a7266 大唐雙龍傳 | 202 | 202 | 62 | 62 | 224 | 222 |
| 8f18dd59 名字的潮汐 | 39 | 39 | 47 | 47 | 84 | 84 |
| be6b8d99 3pigredhood | 34 | 34 | 25 | 25 | 62 | 62 |

edges 的簽章取 `(來源名, 目標名, relation_type, chapters)` —— 把 `chapters` 納入是為了不把
**合法的時序分期**誤算成重複（`_fill_relation_valid_to` 會為同一對實體產生多個階段）。
納入後其餘三本書的「重複」降到 2 / 0 / 0，可視為雜訊；dd129f3d 仍有 158。

具體長相（ch5，同一章）：

```
林素卿召集家人宣讀遺囑   ×3
吳大偉承認洩密           ×3
蘇曉琳中毒案調查結果     ×3
陳雅婷決定隱藏親子鑑定書 / 陳雅婷決定不公開親子鑑定書 / 陳雅婷決定獨立撫養孩子
```

前三組是**逐字同名**，第四組是同一件事的三種措辭 —— LLM 每次抽取的用詞不同，所以
連「用標題去重」都救不了已經寫進去的資料。

---

## 2. 根因

`_persist_to_kg`（`pipelines/knowledge_graph/pipeline.py:266`）逐一呼叫 `add_*`：

```python
for entity in result.entities:
    entity.document_id = document_id
    await self._kg_service.add_entity(entity)
for relation in result.relations: ...
for event in result.events: ...
```

而三個 `add_*` 都**以物件自己的 id 為 key**：

| 方法 | memory backend | neo4j backend |
|---|---|---|
| `add_entity` | `self._entities[entity.id] = entity`（`kg_service.py:66`） | `MERGE (e:Entity {id: $id})` |
| `add_event` | `self._events[event.id] = event`（`:163`） | `MERGE (ev:Event {id: $id})`（`kg_service_neo4j.py:206`） |
| `add_relation` | `self._graph.add_edge(..., key=relation.id)`（`:111`） | 同型 |

而那個 id 是**每次抽取現生的 `uuid4`**（`domain/entities.py`、`domain/events.py` 的
`default_factory`）。所以 `MERGE`／dict 賦值在語意上是「覆蓋同一個 id」，實際上永遠是新增。

**去重只發生在單次執行內**：`EntityLinker`、`_remove_merged_relations`、
`_annotate_relation_phases` 都在 `result` 還在記憶體時作用。跨執行沒有任何一段程式碼看得到
上一次的產出。

### 對照組：符號探索沒有這個問題

`pipelines/symbol_discovery/pipeline.py` 開頭第 63 行：

```python
await self._symbol_service.delete_by_book(doc.id)
```

模組 docstring 第 7 行明寫 `- Re-ingest safe: delete_by_book() before extraction`。
**同一個 repo 裡兩條平行的 pipeline，一條做了、一條沒做。**

---

## 3. 觸發路徑

`POST /books/{id}/rerun/knowledge-graph`（`api/routers/books.py:263`）
→ `_rerun_step` → `IngestionWorkflow.rerun_step("knowledge-graph", book_id)`（`ingestion.py:323`）
→ `run_step` → `KnowledgeGraphPipeline.run()` → `_persist_to_kg`。

`rerun_step` 的 docstring 詳細寫了它與 ingestion 的兩點差異（失敗即失敗、成功才失效快取），
**唯獨沒提「舊資料怎麼辦」** —— 因為從沒被當成問題處理過。

dd129f3d 之所以中三次，是它本來就是併發驗證（PR #35 Task 3）的實驗書，同一步驟被反覆跑。
換句話說：**這個缺陷只要有人按第二次「重新執行」就會發生。**

---

## 4. 查證出的事實

### 4.1 修復所需的原語已經存在

`kg_service.remove_by_document(document_id)`（`kg_service.py:484`）已經在刪書路徑
（`books.py:210`）使用，且**三種都清**：

- entities：`document_id == document_id` 的全數
- relations：連到那些 entity 的所有 edge
- events：`ev.document_id == document_id` 的全數

回傳 `dict[str, int]` 的移除計數。不需要新寫刪除邏輯。

### 4.2 entity id 重生的連帶影響已被涵蓋（大部分）

刪掉再重建 → 所有 entity id 全換一批。以 entity id 當快取 key 的家族，
`cache_invalidation.py:53` 的 `knowledge-graph` 條目已經涵蓋：

```python
"knowledge-graph": (
    "character:{book}:%",
    "epistemic:{book}:%",
    "voice_profile:{book}:%",
    "symbol_overview:{book}",
),
```

而 `rerun_step` 在成功後就會呼叫 `invalidate_for_steps`。**這條路是通的。**

### 4.3 但 `inferred_relations` 不在涵蓋範圍內

`var/inferred_relations.db` 的 `source_id` / `target_id` 存的是 entity id。
刪書路徑有 `lp.delete_by_document(book_id)`（`books.py:216`），**rerun 路徑沒有對應動作**。

實測目前 40 筆全部有效（0 筆孤兒）—— 因為唯一有推論關係的書 `1a1a7266` 沒被重跑過。
一旦本計畫的 delete-first 落地，重跑 KG 就會**製造孤兒**。這是本計畫必須一併處理的連帶，
不是可選項。

### 4.4 `symbol_occurrences.co_occurring_json` 不受影響

142 筆全是 `[]`（見 `20260820-imagery-occurrence-anchoring.md` §4.3），沒有存 entity id，
所以不在連帶清單裡。

---

## 5. 做法

### Task 1｜pipeline 層 delete-first

在 `_persist_to_kg` 開頭、寫入任何東西之前：

```python
if document_id:
    removed = await self._kg_service.remove_by_document(document_id)
    logger.info("KGPipeline: cleared prior graph for %s: %s", document_id, removed)
```

**放在 pipeline 而非 `rerun_step` 的理由**：與 symbol_discovery 對稱，讓「跑這條 pipeline」
本身就是冪等的，而不是要求每個呼叫端記得先清。首次 ingestion 走這條路時
`remove_by_document` 是 no-op（回傳全 0），無副作用。

**風險與界線**：`_persist_to_kg` 只有 `KnowledgeGraphPipeline.run()` 一個呼叫端
（已查證，見 §3），沒有「逐章增量寫入」的用法會被這個刪除毀掉。若日後要做增量，
delete-first 必須改成按章節範圍刪 —— 屆時再議，本次不預留。

### Task 2｜補上 `inferred_relations` 的連帶清理

`rerun_step` 在 `step == "knowledge-graph"` 且成功後，比照刪書路徑呼叫
`delete_by_document`。落點在 `rerun_step` 而非 pipeline：推論關係是 KG 的**下游衍生物**，
不是 KG 本身，讓 pipeline 去刪別人的資料是反向相依（同 `refactor/workflows-reporter-port`
處理過的那類問題）。

### Task 3｜特徵化測試

依 §2 的判準，測試要釘住的是**冪等性**而非實作細節：

- 同一份 `KGExtractionResult` 連跑兩次 `_persist_to_kg`，圖上的 entity / event / edge
  數量與跑一次相同
- 跑第二次時 entity id 換了一批，但 `get_entities(document_id=)` 的**數量**不變
- 跨書隔離：A 書重跑不影響 B 書的節點數
- `remove_by_document` 的回傳計數與實際刪除數一致

兩種 backend 各跑一次（memory / sqlite 的 task_store 設定不影響 KG，但依
`project_task_store_sqlite_default_breaks_tests` 的紀律仍兩邊驗）。

### 不做

- **既有髒資料的自動清理**。dd129f3d 是可丟棄的實驗書（標題自帶「併發驗證」），
  正確處置是直接刪書重跑，不值得為它寫遷移腳本。若日後真實書中招，
  §5 Task 1 落地後「重跑一次」就會自癒。
- **內容層級去重**（用標題／描述相似度合併跨執行的重複）。ch5 第四組的三種措辭證明
  這條路不可靠，而且 delete-first 之後根本不需要。
- **B-068**（同一場戲被切成多個 event）。那是抽取粒度問題，與本文的持久化問題無關，
  混在一起做會讓兩邊都說不清楚。

---

## 6. 回滾

Task 1 是單一函式開頭的三行；revert 該 commit 即回到現況（重新開始累積，但不會
反向損毀已有資料）。Task 2 同理。沒有 schema 異動、沒有資料遷移，因此沒有不可逆的一步。

---

## 7. 文件同步

- 無 endpoint 異動 → `docs/API_CONTRACT.md` 不需更新
- 無 CSS token 異動 → `docs/DESIGN_TOKENS.md` 不需更新
- 前端零改動
- `docs/BACKLOG.md` 新增 B-082 並在狀態表補列
