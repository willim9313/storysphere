# 象徵意象頁重設計 — Phase 0：API 整併

> 日期：2026-08-07
> 前置：`docs/plans/20260807-symbols-design-crosscheck.md`（B2／B3／B4／B5 四項落差）
> 範圍：**只做後端與契約**。前端重建在 Phase 1–5，本文不涉及。

---

## 1. 為什麼是「一支端點」而不是「調整三支」

核對後端後，問題比 HTTP 往返次數嚴重。

`SymbolService.assemble_sep()`（`backend/storysphere/services/symbol_service.py:296`）每次呼叫都會：

```python
entity, occurrences, document, events = await asyncio.gather(
    self.get_imagery_by_id(imagery_id),
    self.get_occurrences(imagery_id),
    doc_service.get_document(book_id),      # ← 整本書
    kg_service.get_events(document_id=book_id),  # ← 全部事件
)
```

**整本書與全部事件，每個意象各載入一次。** 新設計的排序需要 11 個主清單意象的 SEP，
所以照現行 API 拼出第一屏要付出：

| 項目 | 請求數 | 後端代價 |
|---|---|---|
| #15a 意象清單 | 1 | 輕 |
| #15d SEP × 11 | 11 | **11 次整本書載入 + 11 次全事件載入** |
| entity UUID 解析（#9 graph） | 1 | 一次全圖 |
| #15g 詮釋 × 29 | 29 | 28 個 404 |
| #15c 意象叢 | 1 | 輕 |
| **合計** | **43** | 11 次整本載入 |

換成一支彙總端點：**1 個請求、1 次整本載入、1 次全事件載入、1 次實體清單載入。**

而且 B2（UUID 沒有 name/type）在後端是**免費**的——`KGService.list_entities(document_id=...)`
一次就拿到全部實體的 `id` / `name` / `entity_type`，前端反而要多繞一支 #9。

所以答案不是「調整 API」，是**加一支專門服務這個頁面的彙總端點**，原有 #15a–#15h 一律不動。

---

## 2. 新增 #15i `GET /symbols/overview`

一次回傳左欄清單、排序、總覽地圖所需的全部資料。**不含**任何逐段全文
（`occurrence_contexts` / `paragraph_text` 只在詳情頁用 #15b 取）。

### Query Params

| 參數 | 說明 |
|---|---|
| `book_id` | 必填 |
| `force` | 選填，繞過快取重算 |

### Response 200

```ts
interface SymbolOverviewResponse {
  book_id: string;
  body_chapter_count: number;          // BODY_N，前端不再從別處猜
  global_chapter_max: number;          // 跨意象的正文單章最大值（熱圖色階用）
  items: SymbolOverviewItem[];
}

interface SymbolOverviewItem {
  // ── 與 #15a 的 ImageryEntity 相同 ──
  id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  aliases: string[];
  frequency: number;
  chapter_distribution: Record<string, number>;
  first_chapter: number | null;

  // ── 解 B2：後端已把 UUID 解析成 name/type，並已濾掉同名自我匹配 ──
  co_occurring_entities: CoOccurringEntityRef[];
  self_match_count: number | null;     // 被濾掉的同名實體共現次數（D8 說明文字用）

  // ── 解 B3：設計只顯示數字，不回傳 id 清單 ──
  co_occurring_event_count: number;

  // ── 解決議 02：全書共現，不必逐個打 #15c ──
  co_occurring_imagery: CoOccurrenceEntry[];

  // ── 解 B4：不再對每個意象打一次 #15g 收 404 ──
  interpretation: InterpretationStatus | null;
}

interface CoOccurringEntityRef {
  id: string;
  name: string;
  entity_type: string;   // character / location / concept / object / organization / other
  count: number;
}

interface InterpretationStatus {
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  polarity: 'positive' | 'negative' | 'neutral' | 'mixed';
  confidence: number;
}
```

### 三個刻意的設計取捨

**a. 不在後端算 `load`。** 敘事負載的五個權重要照決議 06 上線後回頭校準，
放在前端的 `symbolSignals.ts`（純函數 + 單元測試 + 常數 `W`）改起來不必動後端、不必重佈署。
後端只當資料彙整器，維持與 SEP 一致的定位。

**b. 自我匹配在後端過濾。** 後端同時握有意象詞與實體名稱，過濾一行就好；
`self_match_count` 另外回傳，讓 D8 那句「已過濾自我匹配：同名 KG 實體共現 12 次」能講真話。

**c. `co_occurring_event_count` 只算正文章節。** 見第 4 節。

### 實作方式

`SymbolService` 新增 `assemble_overview()`：整本書 / 全事件 / 全實體各載入一次，
再對所有意象跑同一套「段落 → 實體計數」邏輯。

該段邏輯目前寫在 `assemble_sep()` 的迴圈裡（`symbol_service.py:320–342`），
會抽成模組層級 helper 供兩者共用，**避免兩份計數規則漂移**。`assemble_sep()` 的
對外行為與回傳不變。

快取 `symbol_overview:{book_id}`，只快取結構性彙整；`interpretation` 欄位在請求時
即時疊上（詮釋隨時會被 #15e／#15h 改動，混進同一份快取會過期）。

---

## 3. 新增 #15j `POST /symbols/analyze-all`

完全比照 `#7h POST /books/:bookId/entities/analyze-all` 與 `#7g` 的事件批次。

```ts
// Request Body（全省略 = 全部未詮釋且 frequency > 1 的意象）
interface SymbolBatchAnalysisRequest {
  book_id: string;
  imagery_ids?: string[];   // 提供時只跑這個子集（「前 5 名」「勾選多筆」用）
  language?: string;
  force_refresh?: boolean;
}

// Response 202: { taskId: string }
// TaskStatus.result 用既有的 BatchEepResult { progress, total, failed, skipped }
// polling 走 #8
```

**預設範圍排除 `frequency === 1` 的長尾**（決議 06：「批次的預設範圍就該等於清單範圍」）。
已有詮釋者 skip，與 #7h 的 cache-hit 行為一致。

`imagery_ids` 中不存在的 id 直接排除、不計入任何統計欄位——沿用 #7h 的既定語意。

---

## 4. 核對時發現的一個資料品質問題（~~需你裁示~~ → 2026-08-10 已收攏為 B-078）

> **結論（2026-08-10）**：第 1 點已做（`co_occurring_event_count` 只計正文章節）。
> 第 2 點**暫不實作** —— 它是新的度量定義，超出設計要求；決議 06 校準時把 `W.ev`
> 調低是可接受的收法。已轉為 `docs/BACKLOG.md` 的 B-078，觸發時機為決議 06 權重校準。
> 以下保留當時的分析原文。

`assemble_sep()` 的事件關聯是**章節層級**的：

```python
chapters_with_imagery = set(entity.chapter_distribution.keys())
event_ids = [ev.id for ev in events if ev.chapter in chapters_with_imagery]
```

也就是「這個意象出現過的章，其中所有的事件」——不是「與這個意象同段的事件」。
`Event` 沒有 paragraph / chunk 參照（只有 `chapter` 與 `participants`），所以段落層級目前做不到。

兩個後果：

1. **「海」的 25 個事件包含 `-1` 與 `0` 章**（版權頁、目次）的事件。這與設計自己
   「非正文不進分布形狀」的規則矛盾。
2. **事件依附與貫穿度高度共線** —— 出現在越多章 → 涵蓋越多事件。設計把它當成
   權重 0.18 的獨立訊號（`W.ev`），實際上它有一部分只是 `span` 的重複計票。

**我在這輪要做的**：`co_occurring_event_count` **只計正文章節**，修掉第 1 點。
這是設計規則的直接推論，不算擴充範圍。

**我不打算自作主張做的**：第 2 點可以用
`event.participants ∩ 該意象的共現實體` 收斂成真正的「同場事件」，資料是現成的。
但這是新的度量定義、超出設計要求，**要你點頭我才做**。不做的話，決議 06 校準時
把 `W.ev` 調低即可，也是可接受的收法。

`assemble_sep()` 既有的 `co_occurring_event_ids` **不動**（它餵 LLM prompt，改了會影響詮釋輸出）。

---

## 5. CLAUDE.md 開發前 Checkpoint

**1. 哪些檔案會被異動？**

| 檔案 | 動作 |
|---|---|
| `backend/storysphere/api/schemas/symbols.py` | 修改 — 新增 4 個 response model |
| `backend/storysphere/services/symbol_service.py` | 修改 — 新增 `assemble_overview()`；抽出共用計數 helper（`assemble_sep()` 對外行為不變） |
| `backend/storysphere/api/routers/symbols.py` | 修改 — 新增 2 個路由 |
| `tests/api/test_symbols.py` | 修改 — 新增 `TestSymbolOverview` / `TestSymbolAnalyzeAll` |
| `tests/services/test_symbol_service.py` | 修改 — 新增 `assemble_overview` 整合測試 |
| `docs/API_CONTRACT.md` | 修改 — 新增 #15i / #15j |
| `frontend/src/api/generated.ts` | 重新產生（`npm run gen:types`） |
| `frontend/src/api/symbols.ts` | 修改 — 新增 2 個 client 函式 |

**2. 有沒有現成工具或函式可用？**
有，而且刻意全部沿用：`KGService.list_entities()`（實體解析）、
`SymbolGraphService.get_co_occurrences()`（結盟意象，#15c 已在用）、
`AnalysisCache`（快取）、`BatchEepResult` + `task_store` + #8 polling（批次進度）、
`assemble_sep()` 的段落→實體計數邏輯（抽成共用 helper）。
**沒有任何新的計算規則**——`load` 留在前端。

**3. 會不會引入新依賴或新結構？**
無新套件。新結構只有 2 支端點與 4 個 response model，都在既有 router / schemas 檔內。
`symbol_overview:{book_id}` 是既有 `AnalysisCache` 的新 key，不是新機制。

**4. 改錯怎麼還原？**
兩支端點皆為**純新增**，#15a–#15h 的行為與回傳完全不變，前端在 Phase 1 接上前
沒有任何消費者。還原 = `git revert` 該 commit，現有頁面不受影響。
唯一有回歸風險的是 `assemble_sep()` 抽 helper 的重構——由 `tests/services/test_symbol_service.py`
的既有 SEP 測試把關，重構前後必須全綠。

**文件同步確認**
- 新增 #15i / #15j → 依「API Contract 維護紀律」更新 `docs/API_CONTRACT.md`，commit 標 `[api-contract updated]`
- 無 CSS token 變動 → 不動 `docs/DESIGN_TOKENS.md`
- 無 UI 元件變動 → `docs/UI_SPEC.md` 留待 Phase 2–5

**子任務拆分**（CLAUDE.md：一次超過 3 個檔案要拆）

| 子任務 | 檔案 |
|---|---|
| **0a** `GET /symbols/overview` | schemas + service + router + 2 個測試檔 |
| **0b** `POST /symbols/analyze-all` | schemas + router + 測試 |
| **0c** 契約與型別 | `API_CONTRACT.md` + `gen:types` + `api/symbols.ts` |

每個子任務各自過 `python -m pytest` / `ruff check backend/` / `npm run lint` /
`npm run build`，判準為「無新增錯誤」（依 CLAUDE.md 的 main 基線 diff 流程）。

---

## 6. 整併後的前端請求數

| 時機 | 請求 |
|---|---|
| 進頁 | **1**（#15i） |
| 點進某個意象 | 3（#15b timeline、#15c 該意象的共現、#15g 詮釋全文） |
| 觸發批次 | 1（#15j）+ polling |

從 43 降到 1。
