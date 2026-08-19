# StorySphere — API Contract

> 本文件為前後端對接的唯一 API 規格參考。
> UI_SPEC.md 中的 API 引用以本文件編號為準（如「見 API_CONTRACT #1」）。
> 欄位名稱規則：`api/schemas/` 下的 model 輸出 camelCase；`domain/` 下輸出 snake_case。詳見 `docs/type-generation.md`。

---

## 本文件與 `generated.ts` 的分工

本文件的 TypeScript 區塊**不是**型別來源。兩者各自負責的部分如下，衝突時依此判定：

| 資訊 | 準據 | 原因 |
|------|------|------|
| 欄位名稱、是否 optional、nullability | `frontend/src/api/generated.ts` | 由 `openapi.json` 自動產生，不會漂移 |
| 字串欄位的**值域**（如 `status: 'ready' \| 'error'`） | **本文件** | 後端多數為 `str`，OpenAPI 無從表達 |
| 欄位語意、邊界條件、已知未實作項 | **本文件** | 註解形式，產生器帶不出來 |
| UI 使用頁面、polling 方式、錯誤語意 | **本文件** | 契約層資訊，非型別 |

實作時型別一律 `import type { components } from "@/api/generated"`（見 CLAUDE.md）；
本文件的 TS 區塊供**理解語意**用。若兩者的欄位形狀不一致，以 `generated.ts` 為準並回頭修正本文件。

---

## 端點編號規則

`#N` 為端點的永久識別碼，UI_SPEC 與程式碼註解均以此引用，**編號一經指派不重用、不回收**。
同一資源群組共用數字、以字母區分（`#22a`–`#22d` 皆為章節審閱）；新增群組取下一個數字。

標題格式固定為 `### #<編號> <METHOD> <path>`，路徑省略 `/api/v1` 前綴（見 Base URL）。
本文件中**每一個 `###` 標題都是一個端點**，不作他用——說明性小節一律用 `##`。
自動化漂移檢查依賴此規則解析本文件，破壞格式會讓檢查靜默失效。

---

## Base URL

```
開發環境：http://localhost:8000/api/v1
```

> Vite proxy 將 `/api/*` 轉發至 `http://localhost:8000`。
> 前端 `client.ts` 的 `BASE_URL` 預設為 `/api/v1`。

---

## 通用規則

- 所有請求 / 回應均為 JSON，除上傳為 `multipart/form-data`
- 單一用戶平台，所有 API 不帶用戶識別參數
- 錯誤回傳格式統一：`{ "error": { "code": string, "message": string } }`
- 時間欄位格式：ISO 8601 字串（`"2024-01-01T00:00:00Z"`）

---

## 書庫

### #1 GET /books

書庫列表。

**說明**：進行中任務（`pending` / `running` / `awaiting_review`）的書籍不出現在此列表，由前端另行以 `ProcessingBookCard` 呈現。

**Response 200**
```ts
Book[]

interface PipelineStatus {
  summarization: 'pending' | 'done' | 'failed';
  featureExtraction: 'pending' | 'done' | 'failed';
  knowledgeGraph: 'pending' | 'done' | 'failed';
  symbolDiscovery: 'pending' | 'done' | 'failed';
}

interface Book {
  id: string;
  title: string;
  author?: string;
  status: 'processing' | 'ready' | 'analyzed' | 'error';
  chapterCount: number;    // 只計 body 章；序/目次/後記不計入（與閱讀頁章節列表一致）
  entityCount?: number;
  uploadedAt: string;
  lastOpenedAt?: string;   // 後端尚未實作寫入，目前永遠為 undefined
  pipelineStatus: PipelineStatus;
}
```

**UI 使用頁面**：首頁 `/`

---

### #2-a GET /books/:bookId

單本書 metadata（書庫列表欄位）。

**Response 200**：同 `Book`（#1 的 Book interface，含 `pipelineStatus`）

**Response 404**：書籍不存在

**UI 使用頁面**：閱讀頁、知識圖譜頁（取書名、status 顯示用）

---

### #2-b DELETE /books/:bookId

刪除書籍。若該書仍有進行中的 ingestion 任務（`running` / `awaiting_review`），
會先取消該任務（標為 `error: "cancelled"`）並刪除其 LangGraph checkpoint，
再刪除書籍資料——因此審閱頁「放棄」與處理卡「終止」只需呼叫本 endpoint。

**Response 204**：刪除成功，無 body

**UI 使用頁面**：首頁（刪除操作，待實作）

---

## 上傳

### #2 POST /books/upload

上傳 PDF、DOCX、TXT 或 EPUB，觸發後端處理流程。

**Request**：`multipart/form-data`
```
file      (PDF、DOCX、TXT 或 EPUB 檔案，必填；最大 200 MB)
title     (書名字串，選填；省略時自動取檔名 stem)
author    (作者字串，選填)
language  (ISO 639-1 語言代碼，選填；省略時由後端自動偵測，見 #2b)
```

**Response 202**
```ts
{
  taskId: string;
  duplicateTitle: boolean;  // true 表示已有同名書籍（不分大小寫）；僅警告，不阻擋上傳
}
```

**Response 413**：檔案超過 200 MB

**Response 422**：非 .pdf / .docx / .txt / .epub 格式

**說明**：取得 taskId 後，前端 polling `GET /tasks/:taskId/status`（見 #8）追蹤處理進度。流程中可能出現 `awaiting_review` 狀態（章節審閱暫停），見 #8「特殊狀態」說明。

**UI 使用頁面**：上傳頁 `/upload`

---

### #2b POST /books/detect-language

在使用者確認上傳前，快速偵測檔案語系，讓上傳頁的語系下拉選單可以預先帶入偵測結果（而非空白的「自動偵測」）。內部重用與 `#2 POST /books/upload` 相同的 PDF/DOCX/TXT/EPUB 讀取邏輯，但不跑章節偵測、不建立背景任務，純同步回應。

**Request**：`multipart/form-data`
```
file    (PDF、DOCX、TXT 或 EPUB 檔案，必填)
```

**Response 200**
```ts
{ language: string }  // 例如 "zh-cn", "zh-tw", "en"
```

**Response 422**：非 .pdf / .docx / .txt / .epub 格式

**說明**：檔案無法解析時（例如檔案損毀）不會回傳錯誤，會 fallback 回傳 `"en"`；純預覽用途，不影響後續 `#2 POST /books/upload` 的實際語系偵測。

**UI 使用頁面**：上傳頁 `/upload`（選擇檔案後立即呼叫）

---

## 書籍詳情

### #3 GET /books/:bookId

（與 #2-a 同一 endpoint，以下記錄完整 BookDetail 結構，閱讀頁欄 1 使用此格式）

**Response 200**
```ts
interface BookDetail extends Book {
  summary?: string;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  eventCount: number;
  entityStats: {
    character: number;
    location: number;
    organization: number;
    object: number;
    concept: number;
    other: number;
  };
  keywords?: Record<string, number>;
}
```

**UI 使用頁面**：閱讀頁欄 1

---

## 章節與內容

### #4 GET /books/:bookId/chapters

章節列表。只回傳 `role` 為 `body` 的章節——目錄、序、跋等非正文章節屬於前後附加內容，不算閱讀流程的一部分，會被排除（但仍保留在資料庫中，供未來跨書籍查閱功能使用）。

**Response 200**
```ts
Chapter[]

interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  chunkCount: number;
  entityCount: number;
  summary?: string;
  topEntities?: {
    id: string;
    name: string;
    type: EntityType;   // 見下方 EntityType
  }[];
  keywords?: Record<string, number>;   // TF-IDF 關鍵字 → 權重
}
```

**UI 使用頁面**：閱讀頁欄 2

---

### #5 GET /books/:bookId/chapters/:chapterId/chunks

該章節全部 chunks，含實體標記。

**Response 200**
```ts
Chunk[]

interface Chunk {
  id: string;
  chapterId: string;
  order: number;
  content: string;
  keywords: string[];
  segments: Segment[];
}

interface Segment {
  text: string;
  entity?: {
    type: EntityType;
    entityId: string;
    name: string;
  };
}

type EntityType =
  | 'character' | 'location' | 'organization'
  | 'object' | 'concept' | 'other' | 'event';
```

**說明**：一次拉取整個章節所有 chunks，TanStack Query key：`['books', bookId, 'chapters', chapterId, 'chunks']`。

**UI 使用頁面**：閱讀頁欄 3

---

## 深度分析（書籍層級）

### #6 POST /books/:bookId/analyze

觸發整本書深度分析。需確認視窗（token 消耗提示）後才呼叫。

**Response 200**：`{ taskId: string }`

**說明**：polling #8，完成後書籍 `status` 變為 `'analyzed'`。

**UI 使用頁面**：閱讀頁（觸發按鈕）

---

### #6a GET /books/:bookId/analysis/characters

取得角色分析清單（含已分析與未分析）。

**Response 200**
```ts
{
  analyzed: AnalysisItem[];
  unanalyzed: UnanalyzedEntity[];
}

interface AnalysisItem {
  id: string;
  entityId: string;
  section: 'characters' | 'events';
  title: string;
  archetypes: Record<string, string>;  // framework → primary archetype id（characters 才會填，events 為空 map）
  chapterCount: number;                // @deprecated 恆為 0（歷史現況，未曾接上真實資料），保留供相容，不要用來排序/顯示
  mentionCount: number;                // 角色分析頁 #0 修復新增：從 KG entity.mention_count 填入，可作重要度 proxy
  content: string;
  status: 'complete' | 'partial';     // partial = 該角色分析有子步驟失敗；左側清單狀態點據此上色（complete=綠 / partial=琥珀）
  generatedAt: string;
  // ── event-only optional fields（characters 為 null） ──
  chapter?: number | null;            // 事件所在章節（單一章節編號）
  narrativeMode?: string | null;      // 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown'
  importance?: string | null;         // 'KERNEL' | 'SATELLITE'
}

interface UnanalyzedEntity {
  id: string;
  name: string;
  type: EntityType;
  chapterCount: number;                // @deprecated 恆為 0，同上
  mentionCount: number;                // 同上，未分析角色也會填入真實值
  // ── event-only optional fields（characters 為 null） ──
  chapter?: number | null;
  narrativeMode?: string | null;
  importance?: string | null;
}
```

**UI 使用頁面**：角色分析頁左側清單

---

### #6b GET /books/:bookId/analysis/events

取得事件分析清單（含已分析與未分析）。

**Response 200**：同 #6a 格式，`section: 'events'`；事件清單會額外填入 `chapter` / `narrativeMode` / `importance` 三個欄位（已分析事件的 `importance` 來自 cached EEP；未分析事件 `importance` 為 `null`）。`status` 同 #6a：`partial` = 該事件分析有子步驟（causality / impact）失敗，左側清單狀態點據此上色（complete=綠 / partial=琥珀）。`mentionCount` 為角色專用欄位，事件清單不填，恆為 `0`。

**UI 使用頁面**：事件分析頁左側清單 — KERNEL/SATELLITE letter badge、章節標籤、narrative_mode mini-chip 皆依賴這三個欄位

---

### #6d GET /books/:bookId/analysis/factions

派系結構偵測（F-16）。對角色子圖跑 NetworkX `greedy_modularity_communities`，正向關係（ALLY/FAMILY/FRIENDSHIP/MEMBER_OF/ROMANCE）作為加權邊；ENEMY 邊另行彙整為跨派系 rivalry。

**Query**：
- `chapter` (int, optional, ≥ 1) — 指定章節時回傳該章閱讀順序快照下的派系；省略則使用全書狀態
- `resolution` (float, optional, 0.1–4.0, default 1.0) — modularity 解析度；越大 → 派系數量多但每個小，越小 → 派系少而大
- `min_cluster_size` (int, optional, ≥ 2, default 2) — 小於此值的社群歸入 `unaffiliatedEntityIds`

**Response 200**：`FactionAnalysisResponse`
```ts
interface FactionAnalysisResponse {
  bookId: string;
  chapter: number | null;
  factions: Array<{
    id: string;            // "faction:0", "faction:1"…
    label: string;         // "Faction 1"…
    memberIds: string[];
    cohesionScore: number; // intra-faction edge weight / member count
    topMemberNames: string[]; // up to 3, descending by mention_count
  }>;
  relations: Array<{
    sourceFactionId: string;
    targetFactionId: string;
    cooperation: number;   // [0, 1], normalised by |fa| × |fb|
    rivalry: number;       // [0, 1]
  }>;
  unaffiliatedEntityIds: string[];
  unaffiliatedNames: string[];
}
```

**說明**：同步端點，純圖計算，無 task polling；空書 / 無角色 → `factions: []`、200。

**UI 使用頁面**：圖譜頁工具列「社群」模式 → `ClusterOverviewPanel` 派系卡與底部 N×N 關係矩陣

---

### #6e GET /books/:bookId/analysis/character-metrics

角色中心性指標（角色分析頁翻新 #1 定位象限視圖用）。對**全實體圖**（角色/地點/組織…全部節點與關係邊，非僅角色子圖）建無向、無權重 NetworkX 圖，跑 `nx.pagerank` 與 degree，僅回傳 character 型別實體的結果。同步端點，純圖計算，無 LLM、無 task polling，模式同 #6d。

**Response 200**：`CharacterMetricsResponse`
```ts
interface CharacterMetricsResponse {
  bookId: string;
  metrics: Array<{
    entityId: string;
    name: string;
    pagerank: number;  // nx.pagerank 結果，未加權；空圖/單節點也有明確值（不會噴錯）
    degree: number;     // 該角色在全實體關係圖上的邊數 —— 包含對地點/組織等非角色實體的邊，不只角色對角色
  }>;
}
```

**Response 404**：書本不存在

**說明**：空書 / 無角色 / 無關係邊 → `metrics: []`、200（pagerank 對空圖或單節點的邊界已處理）。`degree` 刻意取自全實體圖而非 #6d 的角色子圖，因此與「派系」端點的連結定義不同，兩者不可互換比較。

**UI 使用頁面**：角色分析頁總覽 landing 定位象限視圖（Y 軸 = pagerank、泡泡大小 = degree）、hero card「關係連結 N 條」

---

### #6c POST /books/:bookId/analysis/:section/:itemId/regenerate

單一條目重新生成。需確認視窗後才呼叫。

```
section: characters | events
```

**Response 200**：`{ taskId: string }`

**說明**：polling #8。

**UI 使用頁面**：角色分析頁 / 事件分析頁「覆蓋重新生成」按鈕

---

## 深度分析（角色實體層級）

### #7a GET /books/:bookId/entities/:entityId/analysis

取得角色實體深度分析結果（結構化多維度）。

**Response 200**
```ts
interface CharacterAnalysisDetail {
  entityId: string;
  entityName: string;
  profileSummary: string;
  archetypes: ArchetypeDetail[];
  cep: CepData | null;
  arc: ArcSegment[];
  status: 'complete' | 'partial';   // partial = 部分子步驟生成失敗
  failedParts: string[];            // 失敗 part，如 ['archetype:jung']；前端據此區分「生成失敗，可重試」與「未生成」
  generatedAt: string;
}

interface ArchetypeDetail {
  framework: string;
  primary: string;
  secondary: string | null;
  confidence: number;
  evidence: string[];
}

interface ArcSegment {
  chapterRange: string;
  phase: string;
  description: string;
}
```

**Response 404**：尚未生成，前端顯示「未生成」引導按鈕

**UI 使用頁面**：知識圖譜頁詳情面板、角色分析頁內容區

---

### #7b POST /books/:bookId/entities/:entityId/analyze

觸發角色實體深度分析。需確認視窗（說明 token 消耗 + 結果將同步至角色分析頁）後才呼叫。

**Request body**（選填）：`{ mode?: 'full' | 'retryFailed' }`，預設 `full`。
- `full`：完整重跑（force_refresh），重抽 CEP 與所有 part。
- `retryFailed`：只重跑快取結果的 `failedParts`（沿用快取的 CEP 與已成功 part）。server 自行從快取推算 part，前端不需傳。

**Response 200**：`{ taskId: string }`

**說明**：每次觸發**一律同時產生 Jung 與 Schmidt 兩種 archetype**，無需傳 framework 參數。前端的 framework 切換僅影響顯示，不影響 trigger 行為。

**UI 使用頁面**：知識圖譜頁「生成深度分析」按鈕、角色分析頁「建立」按鈕

---

### #7c DELETE /books/:bookId/entities/:entityId/analysis

清除角色實體深度分析結果。通常與 #7b 連用（先 DELETE 再 POST）。

**Response 204**

**UI 使用頁面**：角色分析頁「覆蓋重新生成」

---

### #7h POST /books/:bookId/entities/analyze-all

批次觸發未分析角色（`entity_type=character`）的深度分析（已分析自動跳過）。Archetype frameworks 固定為 `["jung", "schmidt"]`。

**Request Body**（選填，全省略即整本書行為不變）
```ts
interface BatchAnalysisRequest {
  entityIds?: string[];  // 提供時只對這個子集執行（角色分層批次 #11「先生成前 10 位要角」用）；省略 = 全部未分析角色
}
```

**Response 202**：`{ taskId: string }`

**Response 404**：書本不存在
**Response 400**：書本內無 character 類型實體（含 `entityIds` 提供但子集內無任何有效角色的情況——視為同一種空結果）

**說明**：TaskStatus.result 的進度格式與事件批次共用 `BatchEepResult`（見 #7g）；`total` 為實際執行的角色數（有 `entityIds` 時為子集大小，非全書角色數）。`entityIds` 中不存在的 id 直接排除，不計入任何統計欄位（不算 skipped/failed）。仍會 skip 已分析角色（cache hit）。polling #8。

**UI 使用頁面**：角色分析頁「一鍵生成全部角色分析」、分層批次「先生成前 10 位要角」（#11）

---

## 深度分析（事件層級）

### #7d GET /books/:bookId/events/:eventId/analysis

取得單一事件深度分析結果（EEP + 因果 + 影響）。

**Response 200**
```ts
interface EventAnalysisDetail {
  eventId: string;
  title: string;
  eep: EventEvidenceProfile;
  causality: CausalityAnalysis;
  impact: ImpactAnalysis;
  summary: { summary: string };
  status: 'complete' | 'partial';   // partial = causality / impact 子步驟生成失敗
  failedParts: string[];            // 失敗 part，如 ['impact']
  analyzedAt: string;
  chapter?: number | null;        // 事件所在章節
  chunk?: number | null;          // 事件在章節內的位置（目前對應 Event.narrative_position，未來改用 chunk_id 時不變動此欄位語意）
  narrativeMode?: string | null;  // present | flashback | flashforward | parallel | unknown
}

interface EventEvidenceProfile {
  stateBefore: string;
  stateAfter: string;
  causalFactors: string[];
  priorEventIds: string[];
  subsequentEventIds: string[];
  participantRoles: ParticipantRole[];
  consequences: string[];
  structuralRole: string;
  eventImportance: string;   // 'KERNEL' | 'SATELLITE'
  thematicSignificance: string;
  textEvidence: string[];
  keyQuotes: string[];
  topTerms: Record<string, number>;
}
```

**Response 404**：尚未生成

**UI 使用頁面**：事件分析頁內容區

---

### #7e POST /books/:bookId/events/:eventId/analyze

觸發單一事件深度分析（EEP）。

**Request body**（選填）：`{ mode?: 'full' | 'retryFailed' }`，預設 `full`。語意同 #7b（`retryFailed` 只重跑快取的 `failedParts`）。

**Response 200**：`{ taskId: string }`

**UI 使用頁面**：事件分析頁「建立」按鈕

---

### #7f DELETE /books/:bookId/events/:eventId/analysis

清除事件深度分析結果。

**Response 204**

**UI 使用頁面**：事件分析頁「覆蓋重新生成」

---

### #7i GET /books/:bookId/events/:eventId/source

取得「最可能描述該事件」的原文段落，供未分析事件在花費 LLM 前先判斷。

**Query Parameters**

| 參數 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `limit` | `integer` | `3` | 回傳段落數，伺服器端 clamp 到 1–10 |

**Response 200**
```ts
interface EventSourceResponse {
  eventId: string;
  passages: {
    id: string;              // Qdrant point id
    text: string;
    chapterNumber: number | null;
    score: number;           // cosine similarity
  }[];
}
```

> ⚠️ **這是檢索結果，不是事件的正規來源文字。** `Event` 沒有任何 chunk /
> 文字位置欄位（`narrative_position` 從未被寫入），因此無法精確定位。本端點
> 用的是 EEP builder 產生 `textEvidence` 時的同一組向量查詢
> （`"{title} {description}"`）。UI 必須以「最相關段落」呈現，不得宣稱為原文出處。
> 向量服務不可用時回傳空陣列而非錯誤。

**UI 使用頁面**：事件分析頁未分析事件狀態

---

### #7g POST /books/:bookId/events/analyze-all

批次觸發未分析事件的 EEP 分析（已分析自動跳過）。

**Request Body**（選填）：`{ eventIds?: string[] }`

`eventIds` 省略 → 全書所有事件；提供時只跑該子集（仍會跳過已有快取者），
不存在的 id 靜默忽略。若子集比對後為空，回 `400`（同「本書沒有事件」）。
語意與 #7c 的 `entityIds` 一致。

**Response 202**：`{ taskId: string }`

**說明**：TaskStatus.result 的進度格式見下方 BatchEepResult。polling #8。

```ts
interface BatchEepResult {
  progress: number;
  total: number;
  failed: number;
  skipped: number;
}
```

**UI 使用頁面**：事件分析頁「一鍵生成全部 EEP」、批次子集（只生成本章 / 勾選多筆）

---

## 非同步任務狀態

### #8 GET /tasks/:taskId/status

輪詢任務進度。大多數非同步任務共用此 endpoint。

> **注意**：張力分析（#14 系列）與 KG 遷移（#19c）有各自的 polling endpoint，不走此路徑。

**Query Parameters**

| 參數 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `after` | `integer` | `0` | 只回傳 `seq >= after` 的 murmur events（delta 語意，client 負責累積） |

**Response 200**
```ts
type MurmurStepKey = 'pdfParsing' | 'summarization' | 'featureExtraction' | 'knowledgeGraph' | 'symbolExploration';
type MurmurEventType = 'character' | 'location' | 'org' | 'event' | 'topic' | 'symbol' | 'raw';

interface MurmurEvent {
  seq: number;             // server 端原子配發，client 排序 / 去重用
  stepKey: MurmurStepKey;
  type: MurmurEventType;
  content: string;         // 截斷上限 1 KB
  meta?: Record<string, unknown>;  // e.g. { chapter: 1, role: "天體物理學家" }
  rawContent?: string;     // type === 'raw' 時使用，截斷上限 4 KB
}

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'awaiting_review';
  progress: number;        // 0–100
  stage: string;           // UI 顯示文字，如「知識圖譜擷取」（後端統一中文）
  stepKey?: string;        // machine-readable pipeline 步驟 key（ingestion 任務提供）：
                           // pdfParsing | languageDetect | summarization | featureExtraction
                           // | knowledgeGraph | symbolExploration | dataStorage
                           // 前端 ProcessingTimeline 優先以此判斷步驟狀態，缺省時 fallback 百分比區間
  subProgress?: number;    // 子任務進度（批次任務使用）
  subTotal?: number;
  subStage?: string;
  result?: {
    bookId?: string;        // 上傳完成 or awaiting_review 時提供，用於導向 /books/:bookId
    failedSteps?: string[]; // 上傳任務：部分步驟失敗時回傳失敗描述列表
    [key: string]: unknown;
  };
  error?: string;
  kind?: string;           // 任務種類（如 'tension' / 'symbol' / 'ingestion'），任務中心據此導向；未提供則不可跳轉
  title?: string;          // 顯示標題；未提供時前端 fallback 用 stage
  createdAt?: string;      // ISO 時間字串，任務中心排序用
  murmurEvents?: MurmurEvent[];  // delta slice（seq >= after 的事件）
}
```

**Polling 實作**
```ts
useQuery({
  queryKey: ['tasks', taskId],
  queryFn: () => fetchTaskStatus(taskId, cursor),  // cursor 由 client 累積
  enabled: !!taskId,
  refetchInterval: (data) => {
    if (!data) return 2000;
    if (data.status === 'done' || data.status === 'error') return false;
    return 2000;
  },
})
```

**特殊狀態：`awaiting_review`**

上傳流程在 PDF/DOCX 解析、章節偵測完成後，會**暫停**並將任務置為 `awaiting_review`，等待使用者確認章節邊界。

- 此時 `result.bookId` 已有值（書籍已入庫）
- 前端應導向章節審閱畫面，呼叫 `#22a GET /books/:bookId/review-data` 取得章節與段落資料
- 使用者確認後呼叫 `#22b POST /books/:bookId/review`，pipeline 繼續執行
- 完整流程：`pending → running → awaiting_review → (review submitted) → running → done`

**觸發點對照**

| 觸發操作 | 對應 API |
|----------|----------|
| PDF / DOCX 上傳 | #2 |
| 整本書深度分析 | #6 |
| 條目重新生成 | #6c |
| 角色實體深度分析 | #7b |

---

### #8b POST /tasks/:taskId/cancel

中止正在執行的 background task（真正中斷 asyncio.Task）。

`awaiting_review` 的任務（暫停於章節審閱、無 asyncio task）也可取消：直接標為
`error`（`error: "cancelled"`）並刪除對應 LangGraph checkpoint thread，任務不再可 resume。

**Response 204**：中止成功

**Response 404**：task 不存在

**Response 409**：task 已完成或無法中止

---

### #8c GET /tasks

列出全系統任務，供「任務中心」面板總覽。回傳**所有非終態任務**（`pending` / `running` / `awaiting_review`）加上**最近 N 筆終態任務**（`done` / `error`），依 `createdAt` 新到舊排序。

> 與 #8 不同，本 endpoint 為**清單**用途，回傳的 `TaskStatus` **不含 `murmurEvents`**（逐句 murmur 請走 #8）。

**Query Parameters**

| 參數 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `recent_limit` | `integer` | `20` | 納入的最近終態任務數上限（`ge=0`）。非終態任務不受此限，一律全列。 |

**Response 200**
```ts
type TaskListResponse = TaskStatus[];  // TaskStatus 定義見 #8；murmurEvents 一律為 []
```

**說明**：
- 書進庫**前**取消 → 書不存在，等同上傳失敗
- 書進庫**後**取消 → 書留在庫裡，剩餘 enrichment 步驟中斷，`pipelineStatus` 中未完成步驟標為 `failed`，可透過 #8d 補跑

---

### #8d POST /books/:bookId/rerun/:step

對單一失敗步驟觸發補跑，回傳 taskId 供 polling（走 #8）。

**Path Parameters**

| 參數 | 說明 |
|------|------|
| `bookId` | 書籍 UUID |
| `step` | `summarization` \| `feature-extraction` \| `knowledge-graph` \| `symbol-discovery` |

**Response 202**
```ts
{ taskId: string }
```

**Response 404**：書籍不存在

**Response 422**：step 名稱無效

**說明**：補跑完成後，對應 `pipelineStatus` 欄位更新為 `done` 或 `failed`。前端完成後需 invalidate `['book', bookId]` query 以重整書籍資料；若從建構概覽頁觸發，另需 invalidate `['buildOverview', bookId]`。

`summarization` 與 `feature-extraction` 的產物（章節摘要、章節關鍵字）寫在 Document 上，補跑會在步驟結束時落盤，**失敗時也會存下已完成的部分** —— summarization 會跳過已有摘要的章節，因此中斷後再次補跑是續跑而非重跑。`knowledge-graph` 與 `symbol-discovery` 的產物寫在 KG / symbol store，不經此路徑。
| 事件深度分析（單一） | #7e |
| 批次事件 EEP | #7g |
| 時序計算 | #13b |
| 可見性分類 | #12d |

---

## 知識圖譜

### #9 GET /books/:bookId/graph

取得圖譜節點與邊資料。

**Query Params**（均選填）

| 參數 | 說明 |
|------|------|
| `mode` | `chapter` 或 `story`，搭配 `position` 做 temporal snapshot |
| `position` | 章節序號（integer），`mode` 存在時必填 |
| `include_inferred` | `true` → 回傳中含推斷邊 |

**Response 200**
```ts
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  description?: string;
  chunkCount: number;
  eventType?: string;   // type === 'event' 時有值
  chapter?: number;     // type === 'event' 時有值
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  inferred?: boolean;       // 推斷關係標記
  confidence?: number;      // 推斷關係信心度
  inferredId?: string;      // 對應 InferredRelation ID
}
```

**UI 使用頁面**：知識圖譜頁

---

### #9b GET /books/:bookId/entities/:entityId/chunks

取得特定實體出現的所有段落。

**Response 200**
```ts
interface EntityChunksResponse {
  entityId: string;
  entityName: string;
  total: number;
  chunks: EntityChunkItem[];
}

interface EntityChunkItem {
  id: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber: number;
  order: number;
  content: string;
  segments: Segment[];   // 同 #5 的 Segment interface
}
```

**UI 使用頁面**：知識圖譜頁「相關段落」面板

---

## 推斷關係（Link Prediction）

### #10a POST /books/:bookId/inferred-relations/run

執行 Common Neighbors + Adamic-Adar 演算法，計算候選推斷關係。

**Request Body**
```ts
{ forceRefresh?: boolean }
```

**Response 200**：`InferredRelationsResponse`（見 #10b）

**UI 使用頁面**：知識圖譜頁工具欄「執行推論」按鈕

---

### #10b GET /books/:bookId/inferred-relations

取得推斷關係列表。

**Query Params**（選填）：`status=pending|confirmed|rejected`

**Response 200**
```ts
interface InferredRelationsResponse {
  // 結構見 generated.ts: components['schemas']['InferredRelationsResponse']
}
```

**UI 使用頁面**：知識圖譜頁工具欄「顯示推斷關係」

---

### #10c POST /books/:bookId/inferred-relations/:irId/confirm

確認（採用）推斷關係，將其加入正式圖譜。

**Request Body（選填）**
```ts
{ relationType?: string }   // 整個 body 可省略
```

省略 `relationType` 時，後端依下表將 `InferredRelationType` 提升為 `RelationType`：

| InferredRelationType | → RelationType |
|---|---|
| `potential_ally` | `ally` |
| `potential_enemy` | `enemy` |
| `potential_friendship` | `friendship` |
| `potential_associate` | `other` |
| `unknown` | `other` |

完整對照表定義於 `domain.inferred_relations.INFERRED_TO_CANONICAL`。

帶 `relationType` 則覆寫自動映射，必須是有效的 `RelationType` 值，否則 422。

**Response 201**：`{ relationId: string }`

**UI 使用頁面**：知識圖譜頁 InferredEdgePanel「採用」按鈕（預設不傳 body，使用後端映射）

---

### #10d POST /books/:bookId/inferred-relations/:irId/reject

拒絕推斷關係。

**Response 204**

**UI 使用頁面**：知識圖譜頁 InferredEdgePanel「Reject」按鈕

---

## 事件詳情

### #11 GET /books/:bookId/events/:eventId

取得事件基本詳情（圖譜頁 EventDetailPanel 使用）。

**Response 200**
```ts
interface EventDetail {
  id: string;
  title: string;
  eventType: string;
  description: string;
  chapter: number;
  significance?: string;
  consequences: string[];
  participants: { id: string; name: string; type: EntityType }[];
  location?: { id: string; name: string };
}
```

**UI 使用頁面**：知識圖譜頁 EventDetailPanel、時間軸頁事件詳情面板

---

## 知識圖譜 — 附加設定與視角

### #12a GET /books/:bookId/timeline-config

取得圖譜頁 TimelineControls 的章節設定。

**Response 200**：`TimelineConfigResponse`（見 generated.ts）

**UI 使用頁面**：知識圖譜頁 TimelineControls

---

### #12b PUT /books/:bookId/timeline-config

更新圖譜頁的 TimelineControls 設定。

**Request Body**：`TimelineConfigUpdate`（見 generated.ts）

**Response 200**：`TimelineConfigResponse`

**UI 使用頁面**：知識圖譜頁 TimelineControls

---

### #12c POST /books/:bookId/detect-timeline

偵測圖譜中的時間軸結構（知識圖譜頁用）。

**Response 200**：`TimelineDetectionResponse`（見 generated.ts）

**UI 使用頁面**：知識圖譜頁（內部觸發）

---

### #12d POST /books/:bookId/classify-visibility

觸發事件可見性分類（epistemic 視角所需前置步驟）。

**Response 202**：`{ taskId: string }`

**說明**：polling #8。

**UI 使用頁面**：知識圖譜頁 EpistemicOverlay（內部觸發）

---

### #12e GET /books/:bookId/entities/:entityId/epistemic-state

取得角色在指定章節前的認知狀態。

**Query Params**：`up_to_chapter=<number>`（必填）

**Response 200**：`EpistemicStateResponse`（見 generated.ts）

**UI 使用頁面**：知識圖譜頁 EpistemicOverlay、閱讀頁 EpistemicSidePanel

---

## 時間軸頁

### #13a GET /books/:bookId/timeline

取得時間軸資料。

**Query Params**：`order=narrative|chronological|matrix`

**Response 200**
```ts
interface TimelineData {
  events: TimelineEvent[];
  temporalRelations: TemporalRelation[];
  quality: TimelineQuality;
  temporalAnalyzed: boolean;          // #21h 是否跑過且覆蓋率足夠
  temporalStructure?: string | null;  // linear | partially_linear | non_linear | unknown
  temporalIsStale: boolean;           // 分析產出後又重跑過 pipeline 步驟
  temporalStaleReason?: string | null; // 造成過期的步驟名，如 "feature-extraction"
}

interface TimelineEvent {
  id: string;
  title: string;
  eventType: string;
  description: string;
  chapter: number;
  chapterTitle?: string;
  chronologicalRank: number | null;   // null = 尚未計算
  narrativeMode: 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown';
  eventImportance: 'KERNEL' | 'SATELLITE' | null;
  hasAnalysis: boolean;               // 是否已跑過事件分析（EEP 快取存在）
  temporalDisplacement?: TemporalDisplacement | null;  // #21h 判定，null = 該筆無判定
  storyTimeHint?: string;
  participants: { id: string; name: string; type: EntityType }[];
  location?: { id: string; name: string };
}

interface TemporalDisplacement {
  type: 'analepsis' | 'prolepsis' | 'linear';
  displacement: number;   // storyRank - textRank；負值＝倒敘
  textRank: number;
  storyRank: number;
}

interface TemporalRelation {
  source: string;    // event id
  target: string;    // event id
  type: string;      // 'before' | 'causes'
  confidence: number;
}

interface TimelineQuality {
  eepCoverage: number;
  analyzedCount: number;
  totalCount: number;
  hasChronologicalRanks: boolean;
}
```

**說明**：`temporalDisplacement` 與 `temporalStructure` 來自 #21h 的分析快取
（`temporal_analysis:{bookId}`）。快取若是覆蓋率不足提早返回的產物，一律視同沒跑過：
`temporalAnalyzed` 為 `false`、不帶任何 displacement。

> `temporalDisplacement`（LLM 判定）與 `chronologicalRank`（#13b 計算）是**兩條獨立的路**。
> 前端譜面上的倒敘／預敘標註若只有 `chronologicalRank`，是幾何推導的結果，不代表 #21h 跑過。

**UI 使用頁面**：時間軸頁

---

### #13b POST /books/:bookId/timeline/compute

觸發時序計算（計算 `chronological_rank`）。

**Response 202**：`{ taskId: string }`

**說明**：polling #8，完成後重新拉取 #13a。

**UI 使用頁面**：時間軸頁工具列「重新計算時序」

---

## 張力分析

> **URL 前綴**：張力分析 API 使用 `/tension/` 前綴，而非 `/books/:bookId/tension/`。
> **Polling 模式**：各步驟有專用的 polling endpoint（而非走 #8 的 `/tasks/:taskId/status`）。

### #14a POST /tension/analyze

Step 1：觸發全書 TEU 組裝。

**Request Body**
```ts
{
  document_id: string;
  language?: string;    // 'zh'（預設）
  force?: boolean;
  concurrency?: number; // 預設 5
}
```

**Response 202**：`TaskStatus`（含 taskId）

---

### #14b GET /tension/analyze/:taskId

Step 1 專用 polling endpoint。

**Response 200**：`TaskStatus`（同 #8）

---

### #14c POST /tension/lines/group

Step 2：觸發 TensionLine 聚合。

**Request Body**
```ts
{
  document_id: string;
  language?: string;
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

---

### #14d GET /tension/lines/group/:taskId

Step 2 專用 polling endpoint。

**Response 200**：`TaskStatus`

完成時 `result` 內容：

```ts
{
  lines: TensionLine[];
  // 聚合覆蓋率。cache hit（force=false 且已有結果）時為 null，
  // 因為沒有重新聚合、也就沒有新的缺口可回報。
  coverage: {
    total_teus: number;
    covered_teus: number;
    uncovered_teus: number;      // > 0 表示 LLM 漏掉了 TEU
    uncovered_teu_ids: string[];
    uncovered_chapters: number[]; // 整章消失時特別重要
  } | null;
}
```

> 聚合由單一 LLM 呼叫完成，模型可自由略過任何 TEU；被略過者不會出現在任何
> TensionLine 中，也不會有其他跡象。`coverage` 就是用來揭露這個缺口的。

---

### #14d-2 GET /tension/teus

取得書籍的**全部 TEU**（Step 1 產出），依章節排序，並標示每筆是否已被某條
TensionLine 收錄。

聚合（Step 2）由單一 LLM 呼叫完成，模型可自由略過任何 TEU；被略過者不會出現在
`GET /tension/lines` 的任何地方。**此 endpoint 是唯一能看見「Step 1 做出來、
Step 2 丟掉」的管道。**

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**

```ts
TEUDetail[]

interface TEUDetail {
  id: string;
  chapter: number;
  intensity: number;            // 0..1
  tension_description: string;
  evidence: string[];
  pole_a_concept: string;
  pole_b_concept: string;
  pole_a_carriers: Carrier[];   // 定義見 #14e
  pole_b_carriers: Carrier[];
  pole_a_stance: string | null;
  pole_b_stance: string | null;
  line_id: string | null;       // null = 未被任何張力線收錄
}
```

尚未執行 Step 1 時回傳空陣列（非 404）。

> 欄位為 snake_case：此 schema 未套用 `alias_generator=to_camel`，與同區的
> `TensionLineDetail` 一致。

---

### #14d-3 PATCH /tension/teus/:teuId/assign

把聚合階段漏掉的 TEU 人工指派給一條 TensionLine —— `#14d` 的 `coverage` 與
`#14d-2` 的 `line_id: null` 揭露了缺口，這支是對應的修補動作。

**Request Body**
```ts
{
  document_id: string;
  line_id: string;
}
```

**Response 200**：`TensionLine`（更新後，欄位同 `#14e` 但不含 `teus`）

| 狀態碼 | 情形 |
|--------|------|
| 200 | 已指派；或該 TEU 本來就在這條線上（**冪等**，不重複加入） |
| 404 | TEU 或 TensionLine 在該 document 下不存在 |
| 409 | 該 TEU 已被**另一條**線收錄 |

> **不提供「搬移」語意。** TEU 已屬於別條線時回 409，而不是默默地從舊線移除再
> 加到新線 —— 那會一次改動兩條線的 `teu_ids` 與衍生值，呼叫端卻只看得到一條。
> 要搬移請先在來源線上處理。

> **`chapter_range` 與 `intensity_summary` 由後端重算**，公式與聚合階段相同
> （`[min(chapters), max(chapters)]`、強度算術平均）。人工修好的線因此與模型
> 一次做對的線形狀完全一致，前端不需要為「這條線被修過」寫第二套計算。
>
> **例外：線上有 TEU 已被 invalidate 清除時不重算平均。** 對倖存的子集取平均會產出一個
> 「看起來一樣權威但其實是錯的」數字，因此該情形只把 `chapter_range` 撐大到
> 涵蓋新加入的 TEU，`intensity_summary` 維持原值。
>
> `assembled_by` / `assembled_at` **不會變動** —— 它們記錄的是哪一版聚合步驟
> 產出這條線，人工指派不改變這件事。

**UI 使用頁面**：張力分析頁 章節格點的未歸入清單、TEU 逐章模式的未歸入卡片

---

### #14e GET /tension/lines

取得書籍的 TensionLine 清單，**並內嵌每條線的 TEU 證據**（供審核頁直接顯示，不需第二次請求）。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**
```ts
TensionLineDetail[]

// 欄位為 snake_case（domain/ model，無 alias_generator）
interface TensionLineDetail {
  id: string;
  document_id: string;
  teu_ids: string[];
  canonical_pole_a: string;
  canonical_pole_b: string;
  intensity_summary: number;            // 0–1
  chapter_range: number[];              // [firstChapter, ..., lastChapter]
  thematic_note?: string | null;        // LLM 在分組時提出的全線主題註記
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  assembled_by: string;                 // 產生此線的聚合步驟版本（'tension_grouper_v1'）
  assembled_at: string | null;          // 聚合時間；provenance 上線前的舊快取為 null
  edit: TensionLineEdit | null;         // 人工改寫極點標籤後才有
  teus: TEUSummary[];                   // 構成此線的 TEU 證據，依 teu_ids 順序
}

interface TensionLineEdit {
  original_pole_a: string;              // 聚合階段原本產出的標籤
  original_pole_b: string;
  note: string | null;                  // 改寫理由
  edited_at: string;
}

interface TEUSummary {
  id: string;
  chapter: number;
  intensity: number;                    // 0–1
  tension_description: string;
  evidence: string[];                   // 1–3 段文本引用
  pole_a_carriers: Carrier[];           // 體現 pole A 的實體
  pole_b_carriers: Carrier[];
  pole_a_stance?: string | null;        // 這些載體如何體現該極
  pole_b_stance?: string | null;
  flipped: boolean;                     // 此 TEU 的 A/B 指派與同線多數相反
}

interface Carrier {
  id: string | null;
  name: string;
  entity_type: string | null;           // KG 實體型別；查不到時為 null
}
```

> `entity_type` 為 null 的情形約佔五分之一——LLM 指認的載體名未必對得上 KG 實體。
> UI 不得假設型別必然存在（現行前端 fallback 至 `other` 樣式）。

> **`flipped` 的判定方式**：聚合階段不會統一極點順序，同一組對立可能在某場景是
> `A=X, B=Y`、下一場景卻是 `A=Y, B=X`。不理會這件事直接跨 TEU 聚合載體，兩極會
> 得到完全相同的 pill 清單（這正是審核抽屜「A/B 指派不穩定」警告要揭露的問題）。
>
> 後端以**載體名稱重疊**對照該線中載體最多的那一筆 TEU 定出方向，再依多數決反轉
> 基準，因此結果不受挑到哪一筆當基準影響。**平手時以基準 TEU 的方向為多數。**
>
> 兩種情況無從判定，一律回 `false`（寧可少報也不要無中生有）：
> - 該 TEU 與全線沒有任何共同載體名
> - 該 TEU 自己兩極的載體名相同
>
> `flipped` 是**衍生值、不落地**，門檻或演算法調整不需 migration。同一批 TEU 在
> `#14d-2` 不帶此欄位——翻轉只在「所屬張力線」的脈絡下才有意義。

**UI 使用頁面**：張力分析頁（hero / 章節格點 / 審核抽屜證據區）

**備註**：`teus[]` 由 `TensionService.get_lines_with_teus()` 透過 `AnalysisCache.list_by_prefix("teu:")` 一次取出，過濾掉與 `teu_ids` 不匹配的條目；若該 TEU 已被 `invalidate()` 清除，該條 line 的 `teus` 為空陣列（line 仍照常回傳）。

---

### #14f PATCH /tension/lines/:lineId/review

審核 TensionLine（approve / modify / reject）。

**Request Body**
```ts
{
  document_id: string;
  review_status: 'approved' | 'modified' | 'rejected';
  canonical_pole_a?: string;   // modify 時填入
  canonical_pole_b?: string;
  note?: string;               // 改寫理由；僅 modified 時會被記錄
}
```

**Response 200**：`TensionLine`（更新後，含 `edit`）

> **`modified` 會留下 `edit` 紀錄。** `canonical_pole_a/b` 是原地覆寫，模型原本的
> 用字若不另存就永久消失，而審核抽屜要同時顯示「現在的標籤」與「原始：舊 A vs 舊 B」。
>
> - **`original_*` 永遠是聚合階段的用字，不是上一次改寫的。** 二次改寫只更新 `note`
>   與 `edited_at`；審核者要看的是標籤離模型多遠，不是離自己上次的版本多遠。
> - **`note` 不會沿用**。沒帶 `note` 的改寫其 `note` 為 `null` —— 舊理由解釋的是舊
>   標籤，掛在新標籤上是錯的歸因。
> - **標籤沒變也沒給理由的 `modified` 不產生 `edit`**，否則抽屜會出現無意義的
>   「原始：自由 vs 自由」。只給 `note` 不改標籤則會產生。
> - `approved` / `rejected` 帶 `note` **不會**被記錄——`edit` 專指標籤改寫。
>
> **沒有 `edited_by`。** 本專案沒有任何使用者身分概念，硬填一個值是假資料。

**UI 使用頁面**：張力分析頁 審核抽屜的「人工修改註記」與標籤編輯器

---

### #14g POST /tension/theme/synthesize

Step 3：觸發 TensionTheme 合成。

**Request Body**
```ts
{
  document_id: string;
  language?: string;
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

---

### #14h GET /tension/theme/synthesize/:taskId

Step 3 專用 polling endpoint。

**Response 200**：`TaskStatus`

---

### #14i GET /tension/theme

取得書籍的 TensionTheme。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**
```ts
// 欄位為 snake_case（domain/ model）
interface TensionTheme {
  id: string;
  document_id: string;
  tension_line_ids: string[];
  proposition: string;
  frye_mythos?: string | null;   // 'romance' | 'comedy' | 'tragedy' | 'irony_satire'
  booker_plot?: string | null;   // 'overcoming_the_monster' | 'rags_to_riches' |
                                 // 'the_quest' | 'voyage_and_return' | 'comedy' |
                                 // 'tragedy' | 'rebirth'
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  is_stale: boolean;             // 主題是否已不反映目前的 TensionLine
  stale_reason: 'no_lines' | 'lines_regrouped' | 'review_changed' | null;
  reviewed_line_count: number | null;  // 合成當下已審核的線數
  total_line_count: number | null;     // 合成當下的線總數
}
```

> **`is_stale` 的判定方式**：比對 `tension_line_ids` 與「現在重新合成會用到的那組
> 線」（規則同合成：有已審核的就用已審核的，否則全用）。兩者不同即為過期。
>
> - `lines_regrouped` — 完全沒有交集，代表 Step 2 重跑過、舊 id 全成孤兒
> - `review_changed` — 有交集但集合不同，代表審核決定改變了輸入範圍
> - `no_lines` — 已無任何 TensionLine
>
> **已知限制**：抓不到「線沒變、只有極點標籤被 `modified` 改寫」的情形——集合相同。
>
> `#14f` 的 `edit.edited_at` 已提供可比對的時間戳，但 theme 這端仍缺一個對應的
> 基準（`assembled_at` 是合成時間，不是輸入線的最後修改時間），因此**行為未變**。
> 要涵蓋此情形需另行決定比對基準，屬獨立工項。
>
> 過期後要重新合成必須送 `force=true`，否則 `POST /tension/theme/synthesize`
> 會直接命中快取、回報成功卻毫無變化。

> **`reviewed_line_count` / `total_line_count` 是「合成當下」的凍結值。** 主題 hero
> 要顯示「合成時有 n 條尚未審核」與「依 n / m 條已審核張力線」，這兩句一旦繼續
> 審核就無法從現在的線推回去——用當下的計數會讓警告自己消失，但那則命題仍然是
> 用未審核的線合成的。
>
> - 未審核數 = `total_line_count - reviewed_line_count`
> - 「已審核」= `review_status` 為 `approved` 或 `modified`（與合成的選線規則同一份定義）
> - **計的是全部的線，不是實際餵給 LLM 的那些**。合成會 fallback 成「有已審核的就
>   只用已審核的」，但警告問的是「當時有幾條還沒審」，分母得是全集
> - 這兩個欄位上線前就存在的舊主題為 `null`，UI 需容忍（不顯示該警告即可）

> **`frye_mythos` / `booker_plot` 保證是 id，不是顯示名。** 合成 prompt 給模型的
> 是 `**悲劇** (tragedy)` 這種格式，模型常回粗體中文名，因此後端在寫入與讀取兩端
> 都會正規化回 id；認不得的值一律存成 `null`（前端無從 key 的值比 null 更糟）。
> 讀取端也會正規化，所以早期存進去的顯示名不需重跑 LLM 即可正確讀出。
>
> 前端據此以 id 查 i18n（`tension.frye.<id>`）與 CSS（`[data-mode="<id>"]`）。

**UI 使用頁面**：張力分析頁 TensionThemePanel

---

### #14j PATCH /tension/theme/:themeId/review

審核 TensionTheme。

**Request Body**
```ts
{
  document_id: string;
  review_status: 'approved' | 'modified' | 'rejected';
  proposition?: string;   // modify 時填入
}
```

**Response 200**：`TensionTheme`（更新後）

**UI 使用頁面**：張力分析頁 TensionThemePanel 審核按鈕

---

## 象徵意象

> **URL 前綴**：象徵意象 API 使用 `/symbols/` 前綴，非 `/books/:bookId/symbols/`。
> **欄位格式**：回應欄位為 snake_case（直接對應 domain model）。

### #15a GET /symbols

取得象徵意象列表。

**Query Params**

| 參數 | 說明 |
|------|------|
| `book_id` | 必填 |
| `imagery_type` | 選填，篩選類型（object / nature / spatial / body / color / other） |
| `min_frequency` | 選填，最低出現次數 |
| `limit` | 選填，最大回傳數 |

**Response 200**
```ts
interface ImageryListResponse {
  items: ImageryEntity[];
  total: number;
  book_id: string;
}

interface ImageryEntity {
  id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  aliases: string[];
  frequency: number;
  chapter_distribution: Record<string, number>;  // { "1": 3, "2": 1, ... }
  first_chapter: number | null;
}
```

**UI 使用頁面**：象徵意象頁左側清單

---

### #15i GET /symbols/overview

一次取得全書所有意象的行為訊號 —— 象徵意象頁進頁唯一請求。純資料彙整，無 LLM。

**存在理由**：本頁依「行為」而非頻率排序，因此畫第一屏前就需要每個意象的共現實體、事件數、
結盟意象與審核狀態。用 #15a + 逐個 #15d + #9 + 逐個 #15g 拼出來要 40+ 個請求，
而且 **#15d 每次呼叫都會重新載入整本書與全部事件**（29 個意象的書＝11 次整本載入）。
本端點把三份資料各載入一次。

刻意**不含**逐段全文（`occurrence_contexts` / `paragraph_text`）—— 引文只在選定意象後由 #15b 取。

**Query Params**

| 參數 | 說明 |
|------|------|
| `book_id` | 必填 |
| `force` | 選填，繞過快取重新彙整 |

**Response 200**
```ts
// 欄位為 snake_case（domain/ model）
interface SymbolOverview {
  book_id: string;
  body_chapter_count: number;          // 正文章數（不含前置頁與後記）
  body_paragraph_count: number;        // 正文段落總數 —— 角色依附基準率的分母
  chapter_roles: Record<string, string>;  // { chapterNum: ChapterRole }，前置／正文／後記的權威依據
  global_chapter_max: number;          // 跨意象的正文單章最大值；熱圖與密度條共用此色階
  items: SymbolOverviewItem[];
  assembled_by: string;
  assembled_at: string;
}

interface SymbolOverviewItem {
  // 與 #15a 的 ImageryEntity 相同
  id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  aliases: string[];
  frequency: number;
  chapter_distribution: Record<string, number>;
  first_chapter: number | null;

  // 已解析的共現實體（#15d 只給 entity UUID）；已濾掉與意象同名的 KG 實體
  co_occurring_entities: CoOccurringEntityRef[];
  self_match_count: number | null;     // 被濾掉的同名實體共現次數

  co_occurring_event_count: number;    // 只計正文章節的事件
  co_occurring_imagery: CoOccurrenceEntry[];   // 欄位同 #15c

  interpretation: InterpretationStatus | null;       // null = 尚未生成
  interpretation_block: InterpretationBlockStatus | null; // null = 未被 provider 拒絕
}

interface CoOccurringEntityRef {
  id: string;
  name: string;
  entity_type: string;   // character / location / organization / object / concept / other
  count: number;           // 與該意象同段的出現次數（含非正文）
  body_count: number;      // 同上，只計正文章節
  paragraph_count: number; // 全書有提到此實體的正文段落數 —— 基準率
}

interface InterpretationStatus {
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  polarity: 'positive' | 'negative' | 'neutral' | 'mixed';
  confidence: number;
}

interface InterpretationBlockStatus {
  reason: 'provider_blocked' | 'provider_empty';
  detail: string;        // provider 自己的標籤，如 'PROHIBITED_CONTENT'；provider_empty 時為空字串
  blocked_at: string;    // ISO 8601
}
```

**Response 404**：書本不存在

**說明**

- **敘事負載等排序分數不由本端點計算。** 權重待上線後以真實資料校準，留在前端純函數層。
- `co_occurring_entities` 已依 `count` 遞減排序，並移除與意象同名的 KG 實體
  （「海」的 top-1 是地點「海」共現 12 次，取它當訊號等於說「這個意象總是跟自己一起出現」）。
  被移除的次數由 `self_match_count` 回報，供 UI 交代而非靜默丟棄。
- `co_occurring_event_count` **只計 `chapter_roles` 為 `body` 的章節** —— 版權頁所在章的事件
  不構成敘事關聯。
- **`interpretation_block` 用來分辨「還沒花 token」與「試過且無法成功」。** 少了它，被
  provider 拒絕的意象在清單裡與從未生成過的長得一模一樣；而被拒絕的往往是訊號強的意象
  （《名字的潮汐》的「海」旁邊就是「手」），於是頁面會一再把讀者推向唯一產不出來的那個。
  `interpretation` 與 `interpretation_block` **彼此獨立**，可同時非 null（曾成功、後續重生成
  被拒）。與 `interpretation` 同樣是請求時即時疊上，不進 `symbol_overview:` 快取。
- **角色依附必須算成倍率（lift），不能只看比例。** 「71% 的出現與某角色同段」單獨看沒有意義 ——
  若該角色本來就出現在 70% 的段落裡，71% 正是機率該給的數字。因此每個共現實體同時回傳
  分子與基準率：

  ```
  observed = body_count / <該意象的正文出現次數>
  expected = paragraph_count / body_paragraph_count
  lift     = observed / expected          // > 1 才是真的依附
  ```

  分子用 `body_count` 而非 `count`，因為分母只數正文段落；混用兩個宇宙會把前置頁的
  失真重新帶回來。
- 結構性彙整快取於 `symbol_overview:{book_id}`；`interpretation` 每次請求即時疊上
  （HITL 審核會獨立變動，混進同一份快取會回傳過期的審核狀態）。

**UI 使用頁面**：象徵意象頁左欄清單、排序、全書意象地圖

---

### #15b GET /symbols/:imageryId/timeline

取得意象的所有出現紀錄（含前後文 context window）。

**Response 200**
```ts
SymbolTimelineEntry[]

interface SymbolTimelineEntry {
  chapter_number: number;
  position: number;
  context_window: string;
  co_occurring_terms: string[];
  occurrence_id: string;
  paragraph_id: string;
}
```

**UI 使用頁面**：象徵意象頁詳情區「出現紀錄」

---

### #15c GET /symbols/:imageryId/co-occurrences

取得意象的共現詞列表。

**Query Params**：`top_k=<number>`（選填，預設 10）

**Response 200**
```ts
CoOccurrenceEntry[]

interface CoOccurrenceEntry {
  term: string;
  imagery_id: string;
  co_occurrence_count: number;
  imagery_type: string;
}
```

**UI 使用頁面**：象徵意象頁詳情區「共現詞」

---

### #15d GET /symbols/:imageryId/sep

取得 Symbol Evidence Profile（SEP）——純資料彙整，無 LLM。

**Query Params**：`force=true`（選填，繞過快取重新組裝）

**Response 200**
```ts
// 欄位為 snake_case（domain/ model）
interface SEP {
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  frequency: number;
  occurrence_contexts: {
    occurrence_id: string;
    paragraph_id: string;
    chapter_number: number;
    position: number;
    paragraph_text: string;
    context_window: string;
  }[];
  excluded_front_matter_count: number;   // 被排除的前置頁出現筆數，見下
  co_occurring_entity_ids: string[];
  co_occurring_entity_counts: Record<string, number>;  // { entityId: N occurrences whose paragraph mentions this entity }
  co_occurring_event_ids: string[];
  chapter_distribution: Record<string, number>;   // { "1": 3, "2": 1, ... }
  peak_chapters: number[];
  assembled_by: string;   // "symbol_service_v2"；v1 快取不再被採用，見下
  assembled_at: string;
}
```

**Response 404**：imagery 不存在

**說明**

- **`occurrence_contexts` 排除前置頁**（B-074，2026-08-10）。判準與前端 `trust` 乘數
  同一條線：**正文之前的章節排除、後記保留**。版權頁的「臨海市」是雜訊，但後記某一句
  可能是全書最清楚的象徵陳述，兩者一起丟掉等於丟掉好的那一半。
- 這件事比看起來嚴重：occurrences 依章節排序，而 prompt 只帶前 20 筆 —— 未過濾時前置頁
  不只是「被包含」，它是**模型最先讀到的證據**。《名字的潮汐》的「海」13 筆出現有 5 筆
  是版權頁與書名頁，正好佔據 `[1]`–`[5]`。
- `frequency` 與 `chapter_distribution` **不受影響**，仍是全書計數 —— 被過濾的只有送進
  LLM 的證據。前端用 `excluded_front_matter_count / frequency` 說明可用比例。
- 若整份文件沒有任何 `body` 章節，則不排除任何筆數（沒有「正文之前」可言）。
- **`assembled_by` 是版本閘門**：讀快取時比對，不符即視為 miss 重新組裝。v1 的快取
  帶著前置頁證據，直接沿用等於對所有既有書繼續餵版權頁文字。**不需清除腳本。**

**UI 使用頁面**：象徵意象頁（內部前置步驟，觸發 #15e 前呼叫）

---

### #15e POST /symbols/:imageryId/analyze

觸發 LLM 象徵詮釋（B-040）。

**Request Body**
```ts
{
  book_id: string;
  language?: string;      // 預設 'en'
  force_refresh?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**說明**：polling 走 #15f（不走 #8）。完成後結果存入快取，可由 #15g 取得。

**UI 使用頁面**：象徵意象頁詳情區「生成詮釋」按鈕

---

### #15j POST /symbols/analyze-all

批次觸發 LLM 象徵詮釋 —— 象徵意象頁總覽的三顆批次鈕（訊號最強前 N 名／全部／勾選多筆）。

**Request Body**
```ts
{
  book_id: string;          // 必填
  imagery_ids?: string[];   // 提供時只跑這個子集；不存在的 id 直接排除（不計入任何統計）
  language?: string;        // 省略時由後端取該書語言
  force_refresh?: boolean;  // true = 連已有詮釋的也重跑
}
```

**Response 202**：`TaskStatus`（含 `taskId`）
**Response 400**：範圍內無任何意象（含 `imagery_ids` 提供但子集內無有效 id 的情況）

**說明**

- **省略 `imagery_ids` 時的預設範圍是 `frequency > 1` 的意象**，與頁面清單範圍一致。
  只出現 1 次的詞沒有分布、沒有結盟、沒有依附，佔全書意象多數，
  「全部生成」不該把成本花在它們身上。**明確列進 `imagery_ids` 則照跑** —— 那是使用者的決定。
- 已有詮釋者計入 `skipped`（除非 `force_refresh`）。
- **已被 provider 拒絕者同樣計入 `skipped`**（除非 `force_refresh`）。拒絕是確定性的 ——
  重送同一個 prompt 必然再被拒，掃一輪只是每筆花一次呼叫去換一個已經記錄過的答案。
  `force_refresh` 是逃生口：日後補上第二家 provider 時用它重跑。
- **序列執行，非併發**：每一筆都是付費 LLM 呼叫，併發會讓 rate limit 中止時損失已計費的工作。
- 遇到 rate limit **整批中止**並回報已完成數，不繼續消耗額度。
- `TaskStatus.result` 用與角色／事件批次共通的 `BatchEepResult`（見 #7g）；
  進度另填 `sub_progress` / `sub_total`，讓 BatchEepPanel 顯示件數而非百分比。
- polling 走 **#8**（不是 #15f —— #15f 是單一意象的專用 polling）。

**UI 使用頁面**：象徵意象頁全書意象地圖的批次按鈕與進度面板

---

### #15f GET /symbols/:imageryId/analyze/:taskId

#15e 專用 polling endpoint。

**Response 200**：`TaskStatus`（同 #8）

---

### #15g GET /symbols/:imageryId/interpretation

取得快取的 SymbolInterpretation（LLM 詮釋結果）。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**
```ts
// 欄位為 snake_case（domain/ model）
interface SymbolInterpretation {
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  theme: string;                // 1-2 句主題命題
  polarity: 'positive' | 'negative' | 'neutral' | 'mixed';
  evidence_summary: string;     // 2-3 句 SEP 佐證綜述
  linked_characters: string[];  // 關聯 entity IDs
  linked_events: string[];      // 關聯 event IDs
  confidence: number;           // 0–1
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}
```

**Response 404**：尚未生成（需先呼叫 #15e）

**UI 使用頁面**：象徵意象頁詳情區「詮釋」面板

---

### #15h PATCH /symbols/:imageryId/interpretation

HITL 審核 / 修改 SymbolInterpretation。

**Request Body**
```ts
{
  book_id: string;
  review_status: 'approved' | 'modified' | 'rejected';
  theme?: string;     // modified 時填入
  polarity?: 'positive' | 'negative' | 'neutral' | 'mixed';
}
```

**Response 200**：`SymbolInterpretation`（更新後）

**Response 404**：interpretation 不存在

**UI 使用頁面**：象徵意象頁詳情區「審核」按鈕

---

## 語音風格

### #16a GET /books/:bookId/entities/:entityId/voice

取得角色語音風格分析結果（VoiceProfile）。

**行為說明**：Lazy 生成 — 第一次呼叫時直接計算並快取，後續從快取回傳。無「尚未生成」的 404；404 僅在 book 或 entity 不存在時回傳。

**Query Params**：
- `cached_only` (boolean, optional, default `false`) — `true` 時只讀快取，絕不觸發生成：有快取 → 200（同一般行為）；無快取 → **404**（此時才代表「尚未生成」）。`false`（省略）維持既有 lazy 生成行為不變。

**Response 200**：`VoiceProfileResponse`（見 generated.ts）

新增欄位（用於語音風格 tab 的圖表）：
```ts
interface ToneSegment {
  label: string;   // 'declarative' | 'interrogative' | 'exclamatory'
  value: number;   // 0.0–1.0；同陣列內各 segment 加總接近 1
}
interface HistogramBucket {
  bucket: string;  // '1-10' | '11-20' | '21-30' | '31-40' | '41-50' | '51+'
  value: number;   // 該區間的句子數（int）
}
// VoiceProfileResponse 新增：
toneDistribution: ToneSegment[];          // 3 segments；依 question/exclamation ratio 推導
sentenceLengthHistogram: HistogramBucket[]; // 6 buckets；依實際句長分桶
```

`toneDistribution` 由 backend 直接從 `question_ratio` / `exclamation_ratio` 推導（declarative = 1 − Q − E），不額外打 LLM。`sentenceLengthHistogram` 由 `_compute_metrics` 計算句長後分桶。兩欄位皆為**可選**（舊快取 entries 預設為空陣列），不會破壞既有資料。

**Response 404**：book 或 entity 不存在；或 `cached_only=true` 且尚無快取

**Response 422**：entity 無對話段落可分析

**UI 使用頁面**：角色分析頁 voice tab — VoiceProfilingPanel（ToneDistribution 堆疊條 + SentenceHistogram 直方圖）；`cached_only` 供 #8 伺服器判定生成狀態用（取代 localStorage gate）

---

### #16b DELETE /books/:bookId/entities/:entityId/voice

清除語音風格分析結果（搭配重新生成使用）。

**Response 204**

**UI 使用頁面**：角色分析頁 voice tab — VoiceProfilingPanel「重新生成」

---

## Token 用量

### #17 GET /token-usage

取得 Token 用量統計。

**Query Params**：
- `range=today|7d|30d|all`
- `bookId`（選填）：限定單一本書。傳 `__unattributed__` 代表歸不了書的呼叫
  （全站 chat、2026-08-19 歸因修正之前的舊記錄）。**篩選會作用在每一個區塊**
  ——`summary`、`byService`、`byModel`、`daily` 全部跟著限定。

**Response 200**
```ts
interface TokenUsageResponse {
  summary: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCalls: number;
  };
  byService: Record<string, TokenBucket>;
  byModel: Record<string, TokenBucket>;
  byBook: BookUsage[];
  daily: DailyUsage[];
}

interface TokenBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

interface BookUsage extends TokenBucket {
  bookId: string | null;   // null = 歸不了書的呼叫
  title: string | null;    // null 但 bookId 有值 = 書已被刪除
}

interface DailyUsage extends TokenBucket {
  date: string;   // 'YYYY-MM-DD'
}
```

`byBook` 是陣列而非 `Record`：`bookId` 為 `null` 是有意義的一組，當不了物件的
key。各列 `totalTokens` 相加等於 `summary.totalTokens`。

刪書時**刻意不清** `token_usage`（花費記錄，刪書不代表沒花那筆錢），所以
`byBook` 會出現查不到書名的 `bookId`，`title` 為 `null`。

**UI 使用頁面**：Token 用量頁 `/token-usage`

---

## KG 設定

### #18a GET /kg/status

取得知識圖譜後端狀態（NetworkX / Neo4j 及連線狀態）。

**Response 200**：`KgStatusResponse`（見 generated.ts）

**UI 使用頁面**：設定頁 `/settings`

---

### #18b POST /kg/switch

切換 KG 後端模式。

**Request Body**：`{ mode: 'networkx' | 'neo4j' }`

**Response 200**：`KgSwitchResponse`（見 generated.ts）

**UI 使用頁面**：設定頁 KG Backend 區塊切換按鈕

---

### #18c POST /kg/migrate

觸發 KG 資料遷移。

**Request Body**：`{ direction: 'nx_to_neo4j' | 'neo4j_to_nx' }`

**Response 202**：`TaskStatus`（立即回傳 running 狀態，含 taskId）

> **注意**：此 endpoint 直接回傳 TaskStatus，polling 走 #18d（不走 #8）。

---

### #18d GET /kg/migrate/:taskId

KG 遷移專用 polling endpoint。

**Response 200**：`TaskStatus`

完成時 `result` 含遷移數量：
```ts
result: {
  entities?: number;
  relations?: number;
  events?: number;
}
```

**UI 使用頁面**：設定頁資料遷移區塊

---

## 建構概覽

### #19 GET /books/:bookId/unraveling

取得書籍資料層 DAG 狀態（各節點完整度）。

**Response 200**
```ts
interface UnravelingManifest {
  bookId: string;
  nodes: UnravelingNode[];
  edges: UnravelingEdge[];
}

interface UnravelingNode {
  nodeId: string;
  layer: number;             // 0 = Text / 1 = KG / 2 = Analysis
  label: string;
  status: 'complete' | 'partial' | 'empty';
  counts: Record<string, number>;
  meta: Record<string, string | number | boolean>;
  parentId?: string;
}

interface UnravelingEdge {
  source: string;
  target: string;
}
```

**UI 使用頁面**：建構概覽頁 `/books/:bookId/unraveling`

---

### #19b GET /books/:bookId/unraveling/chapter-distribution

取得 chapter-aware 節點的章節分佈計數（用於建構概覽 detail panel 的章節分佈 sparkline）。

**Response 200**
```ts
interface ChapterDistribution {
  bookId: string;
  totalChapters: number;   // 只計 body 章
  // nodeId → 12-cell（依書籍實際 body 章節數）counts；
  // 不在此 map 中的 nodeId 表示該節點無 chapter-aware 資料
  distributions: Record<string, number[]>;
}
```

**支援的 `nodeId`**（其他節點不會出現在 `distributions`）：

| nodeId | 計算邏輯 |
|--------|---------|
| `paragraphs` | 每章 `paragraphs` 數量 |
| `summaries` | 每章 `summary` 是否存在（0/1） |
| `keywords` | 每章 `keywords` 是否存在（0/1） |
| `kg_event` | 每章 events 數量（`event.chapter == n`） |
| `symbols` | 每章意象出現次數（`imagery.chapter_distribution` 加總） |

**404**：當 `bookId` 不存在。

**UI 使用頁面**：建構概覽頁 `/books/:bookId/unraveling`（NodeDetail panel）

---

## 深度分析（通用非同步路由）

> **URL 前綴**：`/analysis/`，不帶 bookId。bookId 由 request body 的 `document_id` 傳入。
> **Polling 模式**：各端點有專用 polling（不走 #8）。

### #20a POST /analysis/character

觸發角色深度分析（cache-first，已有快取則直接回傳舊結果除非 `force_refresh`）。

**Request Body**
```ts
{
  entity_name: string;        // 必須與 KG entity name 完全一致
  document_id: string;
  archetype_frameworks?: string[];  // ['jung'] | ['schmidt'] | ['jung','schmidt']，預設 ['jung']
  language?: string;          // 預設 'en'
  force_refresh?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**說明**：polling 走 #20b。

---

### #20b GET /analysis/character/:taskId

#20a 專用 polling endpoint。

**Response 200**：`TaskStatus`（同 #8；`result` 為 CharacterAnalysisResult）

---

### #20c POST /analysis/event

觸發事件深度分析（EEP + 因果 + 影響）。

**Request Body**
```ts
{
  event_id: string;
  document_id: string;
  language?: string;
  force_refresh?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**說明**：polling 走 #20d。

---

### #20d GET /analysis/event/:taskId

#20c 專用 polling endpoint。

**Response 200**：`TaskStatus`（同 #8；`result` 為 EventAnalysisResult）

---

## 敘事結構分析

> **URL 前綴**：`/narrative/`，不帶 bookId。bookId 由 request body 的 `document_id` 或 query param `book_id` 傳入。
> **Polling 模式**：各非同步端點有專用 polling（不走 #8）。

### #21a POST /narrative/classify

觸發啟發式 Kernel / Satellite 分類（B-036）。

**Request Body**
```ts
{
  document_id: string;
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**Response 409**：本次執行只會摧毀既有分類，拒絕啟動任務。

分類的唯一輸入是 `event:{document_id}:{event_id}` 快取（EEP 分析結果）；**沒有快取的
事件一律被寫回 `narrative_weight="unclassified"`**。因此當快取全數遺失、而 KG 中仍有
kernel/satellite 事件時，跑一次分類等於把既有分類全部抹成未分類——書庫兩本測試書的
未分類比例（9/47、59/62）就是這樣來的。

判定條件（最保守，只擋真正會損失資訊的情況）：

> EEP 命中數 == 0 **且** KG 中至少有一個事件目前是 kernel/satellite

全新書（尚無任何分類）不受阻擋：拿 `unclassified` 覆寫 `unclassified` 不損失任何資訊。

`detail` 會帶出實際數字（總事件數、將被抹除的已分類數），前端可直接顯示。

> **同一守衛也存在於 service 層**（`classify_from_eep`），因為 `GET /narrative/kernel-spine`
> 與 `POST /narrative/refine` 在「全書皆未分類」時會自動呼叫它——前者每次進敘事結構頁
> 都會執行。service 層命中守衛時記 warning、回傳既有快取結構、**完全不寫 KG**，不拋例外
> （一個 GET 不該因此讓整頁壞掉）。

**說明**：polling 走 #21b。

---

### #21b GET /narrative/classify/:taskId

#21a 專用 polling endpoint。

**Response 200**：`TaskStatus`（`result` 為 NarrativeStructure）

---

### #21c POST /narrative/refine

觸發 LLM 精煉 Kernel/Satellite 分類（B-036）。需先執行 #21a。

**Request Body**
```ts
{
  document_id: string;
  event_ids?: string[];   // 指定特定 event；null = 精煉所有 satellite
  language?: string;      // 預設 'en'
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**說明**：polling 走 #21d。

---

### #21d GET /narrative/refine/:taskId

#21c 專用 polling endpoint。

**Response 200**：`TaskStatus`（`result` 為 NarrativeStructure）

---

### #21e POST /narrative/hero-journey

觸發 Campbell 英雄旅程階段映射（B-037）。

**Request Body**
```ts
{
  document_id: string;
  language?: string;
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId；`result.stages` 為 HeroJourneyStage[]）

**說明**：polling 走 #21f。

---

### #21f GET /narrative/hero-journey/:taskId

#21e 專用 polling endpoint。

**Response 200**：`TaskStatus`

---

### #21g GET /narrative/temporal/coverage

檢查 `story_time_hint` 覆蓋率（同步，無 LLM）。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**：`TemporalCoverageStats`（含覆蓋率 fraction 及是否達 60% 門檻）

**說明**：覆蓋率 ≥ 60% 才能觸發 #21h。

---

### #21h POST /narrative/temporal

觸發 Genette 時間序分析（B-037）。

**Request Body**
```ts
{
  document_id: string;
  language?: string;
  force?: boolean;
}
```

**Response 202**：`TaskStatus`（含 taskId）

**說明**：polling 走 #21i。需先確認 #21g 覆蓋率 ≥ 60%。

---

### #21i GET /narrative/temporal/:taskId

#21h 專用 polling endpoint。

**Response 200**：`TaskStatus`

---

### #21j GET /narrative/kernel-spine

取得 Kernel 事件清單（情節骨幹），依章節和敘事位置排序。若尚未分類則自動觸發啟發式分類。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**
```ts
{
  id: string;
  title: string;
  chapter: number;
  event_type: string;
  description: string;
  significance?: string;
  narrative_weight: number;
  narrative_weight_source: string;
  narrative_position: number;
}[]
```

---

### #21k GET /narrative

取得書籍快取的 NarrativeStructure（含 Kernel/Satellite 分類 + 英雄旅程）。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**：`NarrativeStructure`（model_dump 格式）+ 下列兩個衍生欄位

```ts
{
  // …NarrativeStructure 既有欄位（snake_case，domain model）
  is_stale: boolean;          // 快取分析早於它所依賴的 pipeline 步驟最後一次執行
  stale_reason: string | null; // 造成過期的步驟名，如 "feature-extraction"
}
```

`is_stale` 每次請求即時推導（比對快取條目的寫入時間與 `PipelineStatus` 的步驟完成
時間），**不寫入快取**。重跑 pipeline 步驟時，後端不再刪除本書層級的分析——包含
`review_status`——而是留著並在此回報過期，由使用者決定要不要重跑。

無法判定時一律回報 `false`：步驟沒有完成時間戳（代表它上次執行早於此機制引入）
不會被當成過期，否則全書庫會一次被標記。

快取條目遺失但 KG 中的事件仍帶有 `narrative_weight` 時，後端會從 KG 事件權重與
`hero_journey` 快取重建 NarrativeStructure 後回傳 200，不需重跑 #21a／#21e。
重建無法還原 `review_status`，該欄位會回到 `pending`。

**`hero_journey_stages[].representative_event_ids` 亦為讀取時推導**，與 `is_stale`
同類：欄位本身早已存在於 `HeroJourneyStage`，但生成端（`map_hero_journey`）從未寫入。
本端點回傳前以每個階段的 `chapter_range`（取首尾為區間）與 kernel 骨幹取交集補上，
沿用 #21j 的章節遞增順序，每階段上限 4 筆。**不寫入快取**，因此既有快取無需 force
重跑即生效，重複呼叫結果穩定。

推導時讀 KG 事件但**不觸發自動分類**（`get_kernel_spine` 在全書皆未分類時會呼叫
`classify_from_eep` 並寫回 KG；本端點走的是無副作用的讀取路徑）。

階段共用同一段 `chapter_range` 時會拿到相同的事件，落在 kernel 事件範圍之外的階段
則為空陣列——階段是章節級、事件在章節內，兩者本就不是一對一。快取中若已帶有值，
一律保留不覆寫。

**Response 404**：尚未執行 #21a，且 KG 中沒有任何已分類事件

---

### #22a GET /books/:bookId/review-data

上傳流程章節審閱：取得系統偵測的章節與段落資料，供前端顯示。只在任務狀態為 `awaiting_review` 時有效。

**Response 404**：書籍不存在

**Response 409**：書籍目前不在 `awaiting_review` 狀態（包含已完成、尚未開始、重複呼叫）

**Response 200**
```ts
{
  chapters: Array<{
    chapterIdx: number;
    title: string | null;
    role: string;             // chapter-level: "body" | "toc" | "preface" | "afterword" | "other"
    paragraphs: Array<{
      paragraphIndex: number;  // book-level global index
      text: string;
      role: string;            // paragraph-level: "body" | "separator" | "section" | "epigraph" | "preamble"
      titleSpan: [number, number] | null;  // char offsets of heading within text
      sentences: string[];
    }>;
  }>;
}
```

---

### #22b POST /books/:bookId/review

提交審閱後的章節邊界，解除流程暫停並繼續後續分析（LangGraph graph resume）。

**Request Body**
```ts
{
  chapters?: Array<{     // 省略（或送 {}）= 「接受系統判斷」捷徑：
    title: string;       // pipeline 直接以偵測結構 resume，不重建章節，
    role: string;        // roleOverrides / paragraphSplits 一併忽略。
    startParagraphIndex: number;  // book-level global index
  }>;
  roleOverrides: Record<string, string>;  // str(globalParagraphIdx) → 段落層級 role value; omitted = {}
  paragraphSplits: Record<string, number[]>;  // str(原globalParagraphIdx) → 段內切分字元 offset（升冪）; omitted = {}
}
```

**`paragraphSplits`（段內切分）**：預處理可能把多個邏輯段落融成一段，導致章節
邊界困在段落中間。前端「選取文字 → 切分為新段落」產生此欄位：key 為**切分前**
的全域段落索引，value 為該段內的切分字元 offset。後端 resume 時**先**依此切開
段落（新段落繼承原角色、`titleSpan` 依 offset 調整），**再**套用 `roleOverrides`
與 `chapters`——因此 `startParagraphIndex` 與 `roleOverrides` 的索引一律指
**切分後**的 flat 順序。無效項目（索引不存在、offset 越界／未排序、切出純空白
片段）忽略不套用，不會使 resume 失敗。

**Response 204**：無 body

**409**：任務不在 `awaiting_review` 狀態（包含重複提交）

---

### #22c POST /books/:bookId/suggest-roles

「邊界輔助辨識」：使用者於章節審閱頁觸發，用 LLM 找出黏在書籍頭尾的**非正文段落**
（版權頁 / 目錄 / 序 / 作者・譯者簡介 / 推薦語 / 跋 / 書目…），回傳建議標為
非正文的段落供覆核。**純建議**：不修改文件、不 resume pipeline。只在任務狀態為
`awaiting_review` 時有效。

只走 **body 章節**（已是非正文的章節如目錄不再進去），從書首/書尾**逐段往內回推**，
每段送一次 LLM 判 body / 非正文，讀到第一段故事正文即停（中段正文不送）。回傳前後附的
**段落邊界**；前端據此把受影響的 body 章節切開，將前/後附段落切成獨立的非正文章節
（左側章節列表即時更新），最終走既有 `#22b POST /review`（章節 `startParagraphIndex`
+ `role`）送出。語言無關，不依賴關鍵詞表。

**Response 404**：書籍不存在

**Response 409**：書籍目前不在 `awaiting_review` 狀態

**Response 503**：未設定可用的 LLM provider（AI 判讀不可用）

**Response 200**（book-global 段落索引，對應 #22a review-data 的 `paragraphIndex`）
```ts
{
  frontMatterEnd: number | null;   // 排除界：全域索引 < 此值的 body-章節段落為前附；null = 無前附
  backMatterStart: number | null;  // 包含界：全域索引 >= 此值的 body-章節段落為後附；null = 無後附
  frontRole: string | null;        // 切出的前附章節 role（由 LLM 內容判定並聚合：toc/preface/afterword/other）
  backRole: string | null;         // 切出的後附章節 role（同上，通常 afterword 或 other）
}
```

---

### #22d POST /books/:bookId/parse-toc

「目錄對照提示」：使用者於章節審閱頁、在被判為**目錄**（`role==toc`）的章節區塊內觸發，用
LLM 讀取偵測到的目錄段落文字，抽出**書本自己聲明的章節清單與順序**，供前端與偵測結構
並排、由人眼核對切分是否有誤（漏切／多切）。**純顯示**：不修改文件、不驅動切分、不自動
配對、不 resume pipeline。只在任務狀態為 `awaiting_review` 時有效，與 `#22c` 對稱。

**Request Body**（optional，camelCase；可省略整個 body）
```ts
{
  tocText?: string | null;  // 審閱者「當前編輯中」的目錄文字（前端串接所有 role==toc 章節段落）
}
```

有帶非空 `tocText` 時，後端**直接解析該文字**——審閱者可能在審閱過程中改了哪一章是目錄、
或編輯了目錄內容，這些即時變更尚未寫回文件，故以前端送來的文字為準（重新解析會反映最新
編輯）。`tocText` 省略或為空白時，後端 fallback 為**載入已存文件、串接所有 `role==toc`
章節段落文字**。兩種來源皆送一次 LLM 解析；無目錄文字或解析不出（非標準目錄格式）時回傳
空 `entries`（前端顯示 fallback）。數量對比由前端計算（目錄 body 條目數 vs 偵測 body 章節數）。

**Response 404**：書籍不存在（僅 fallback 讀檔路徑；有帶 `tocText` 時不讀檔）

**Response 409**：書籍目前不在 `awaiting_review` 狀態

**Response 503**：未設定可用的 LLM provider（AI 解析不可用）

**Response 200**（有序，依書本目錄宣告順序；`isBody=false` 的條目為序/跋/目錄等非正文，
前端標「非正文」且不計入數量對比）
```ts
{
  entries: Array<{
    title: string;         // 條目標題（已剝除點引導線與尾端頁碼）
    page: number | null;   // 頁碼；null = 目錄未標
    level: number;         // 0 = 頂層章；巢狀 part/section 遞增
    isBody: boolean;       // true = 一般敘事章節；false = 非正文（序/跋/目錄/版權/作者簡介…）
  }>;
}
```

---

### #21l PATCH /narrative/:documentId/review

HITL 審核 NarrativeStructure（approved / rejected）。

**Request Body**
```ts
{
  review_status: 'approved' | 'rejected';
}
```

**Response 200**：`NarrativeStructure`（更新後）

**副作用**：`review_status='approved'` 會一併把 `classification_source` 推進為
`human_verified`。該列舉值一直存在於 domain model，但先前沒有任何寫入點，導致
「已核可」與「未審閱」的分類在來源上無法區分。

撤回核可（已是 `human_verified` 時改為 `rejected`）必須把來源放回去，而先前的值
從未被保存——改由事件自身的 `narrative_weight_source` 還原：任一事件為
`llm_classified` 則回到 `llm_classified`，否則回到 `summary_heuristic`。

未曾核可過的結構改為 `rejected` 時，`classification_source` 不變。

---

## 跨書搜尋

### #23a POST /search/

跨書段落搜尋，全文與語意兩種模式。注意路徑**含尾斜線**（router `prefix="/search"` + route `"/"`），前端 `api/search.ts` 亦以 `/search/` 呼叫。

**Request body**（camelCase）：

```json
{
  "query": "描述主角內心動搖的段落",
  "bookId": null,
  "topK": 20,
  "mode": "fulltext"
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `query` | `string` | 查詢字串 |
| `bookId` | `string \| null` | `null` = 跨書；傳入 UUID = 限定單書 |
| `topK` | `integer` | 回傳筆數，1–50，**後端預設 10**（前端一律明給 20） |
| `mode` | `'fulltext' \| 'semantic'` | 預設 `fulltext`。`fulltext` 走 SQLite 全文檢索（`DocumentService.search_paragraphs_by_text`）；`semantic` 走 Qdrant 向量檢索（`VectorService.search`） |

> **`score` 的意義隨 `mode` 改變**，見下方 Response 說明——兩種模式的數值不可互相比較。

**Response 200**：`SearchResult[]`

```json
[
  {
    "id": "uuid",
    "text": "段落文本",
    "score": 0.94,
    "metadata": {
      "documentId": "book-uuid",
      "chapterNumber": 3,
      "position": 28
    }
  }
]
```

| 欄位 | 說明 |
|------|------|
| `score` | **語意隨 `mode` 改變**：`semantic` = Qdrant 相關度 0–1（前端顯示為百分比）；`fulltext` = 關鍵詞命中次數（整數，前端顯示為「N 次」） |
| `metadata.documentId` | 所屬書籍 UUID，對應 `GET /api/v1/books/` 的 `id` |
| `metadata.chapterNumber` | 所在章節（1-based） |
| `metadata.position` | 段落在章節內的位置（1-based） |

**前端封裝**：`frontend/src/api/search.ts`  
**頁面**：`/search`（Sidebar Search 圖示）  
**實作狀態（2026-06-13）**：已完整實作；`metadata` 欄位修復（原回傳空 `{}`）。

---

## 全域實體查詢

本節的端點**不帶 book 範圍**，走獨立的 `/entities` router（`backend/storysphere/api/routers/entities.py`）。
同 router 下的其餘路由沒有呼叫端，見「未納入契約的端點」。

### #24a GET /entities/:entityId

單一實體詳情，不需 bookId。象徵意象頁用它把 SEP 的 `relatedEntityIds` 換成實體名稱與類型。

> **欄位為 snake_case。** `EntityResponse` 定義在 `api/schemas/entity.py` 但**沒有**
> `alias_generator=to_camel`，因此輸出與 `domain/` 同樣是 snake_case，與同目錄下多數
> schema 的慣例相反。接這條時別套 camelCase。

**Response 200**
```ts
interface EntityResponse {
  id: string;
  name: string;
  entity_type: 'character' | 'location' | 'organization' | 'object' | 'concept' | 'other';
  aliases: string[];
  attributes: Record<string, unknown>;
  description: string | null;
  first_appearance_chapter: number | null;
  mention_count: number;
}
```

**Response 404**：實體不存在

**UI 使用頁面**：象徵意象頁 `/books/:bookId/symbols`（`fetchEntityById`）

---

## 系統資訊

### #25a GET /settings/info

執行環境的唯讀快照，供設定頁顯示。不含祕密：`databaseUrl` 已遮罩（`_mask_db_url`）。

**Response 200**（camelCase）
```ts
interface SettingsInfoResponse {
  appVersion: string;
  appEnv: string;
  primaryLlmProvider: string;      // 'gemini' | 'openai' | 'anthropic' | 'local'
  primaryModel: string;            // 依 primaryLlmProvider 解析出的實際 model 名
  analysisTemperature: number;
  chatAgentTemperature: number;
  localLlmModel: string;           // 未設定時為 '(none)'
  databaseUrl: string;             // 已遮罩
  analysisCacheDbPath: string;
  qdrantLocalPath: string;
  kgPersistencePath: string;
  frontendPackages: string[][];    // [[名稱, 版本], ...]
  backendPackages: string[][];     // 同上；版本由 importlib.metadata 取得，取不到為 '(not installed)'
}
```

**UI 使用頁面**：設定頁 `/settings`（`fetchSettingsInfo`）

---

### #25b GET /metrics

`MetricsCollector` 的即時快照。**ops / 除錯用途，前端沒有頁面接它**，保留是因為
收集端是活的：`core/token_callback.py` 記 LLM 呼叫、`agents/chat_agent.py` 記
agent query 的延遲與成功率。對應 CORE.md 的 Phase 7 監控。

**Response 200**（snake_case，無 Pydantic schema —— 直接回傳 `get_stats()` 的 dict）
```ts
interface MetricsSnapshot {
  tool_selection: Record<string, Record<string, number>>;
  tool_execution: Record<string, {
    total: number; success: number; failure: number; success_rate: number;
    latency_p50_ms: number; latency_p95_ms: number; latency_p99_ms: number;
  }>;
  cache_events: Record<string, {
    total: number; hit: number; miss: number; hit_rate: number;
  }>;
  agent_query: { all: {
    total: number; success: number; failure: number; success_rate: number;
    latency_p50_ms: number; latency_p95_ms: number; latency_p99_ms: number;
    routes: Record<string, number>; errors: Record<string, number>;
  } };
  llm_calls: {
    total: number; success: number; failure: number;
    prompt_tokens: number; completion_tokens: number; total_tokens: number;
    by_provider: Record<string, Record<string, number>>;
    by_service: Record<string, Record<string, number>>;
  };
}
```

計數器在進程記憶體中，重啟即歸零；不做持久化。永不回傳 404。

**UI 使用頁面**：無

---

## 未納入契約的端點

以下路由存在於程式碼，但**沒有任何呼叫端**——前端 API 層沒有對應的包裝函式，
也沒有繞過 `apiFetch` 的直接呼叫，`tests/` 亦無覆蓋。

**已判定移除，另案執行。新功能請勿接這些端點。**

| 路徑 | Router |
|------|--------|
| `GET /documents` | `documents.py` |
| `GET /documents/:documentId` | `documents.py` |
| `GET /documents/:documentId/chapters/:chapterNumber/paragraphs` | `documents.py` |
| `GET /entities` | `entities.py` |
| `GET /entities/:entityId/relations` | `entities.py` |
| `GET /entities/:entityId/timeline` | `entities.py` |
| `GET /entities/:entityId/subgraph` | `entities.py` |
| `GET /entities/:entityId/relation-stats` | `entities.py` |
| `GET /relations/paths` | `relations.py` |
| `GET /relations/stats` | `relations.py` |

**移除它們不會影響 chat agent。** 這些端點與 `tools/graph_tools/` 下的工具是同一組
`KGService` 方法的兩個平行外殼——agent 走工具那條路，直接呼叫 service，不經 HTTP：

| KGService 方法 | agent 走這條（活的） | HTTP 外殼（無呼叫端） |
|---|---|---|
| `get_entity_relations` | `tools/graph_tools/get_entity_relations.py` | `GET /entities/:id/relations` |
| `get_entity_timeline` | `tools/graph_tools/get_entity_timeline.py` | `GET /entities/:id/timeline` |
| `get_subgraph` | `tools/graph_tools/get_subgraph.py` | `GET /entities/:id/subgraph` |
| `get_relation_paths` | `tools/graph_tools/get_relation_paths.py` | `GET /relations/paths` |
| `get_relation_stats` | `tools/graph_tools/get_relation_stats.py` | `GET /relations/stats` |

> 維護方式：路由刪除後，這張表也要一併清掉——`tests/docs/test_docs_drift.py::TestApiContractCoverage::test_unlisted_routes_still_exist` 會檢查表裡的路由是否仍存在。

---

## TanStack Query Key 對照

```ts
['books']                                                    // #1
['books', bookId]                                            // #2-a / #3
['books', bookId, 'chapters']                               // #4
['books', bookId, 'chapters', chapterId, 'chunks']          // #5
['books', bookId, 'review-data']                            // #22a
['books', bookId, 'analysis', 'characters']                 // #6a
['books', bookId, 'analysis', 'events']                     // #6b
['books', bookId, 'analysis', 'factions']                   // #6d
['books', bookId, 'entities', entityId, 'analysis']         // #7a
['books', bookId, 'events', eventId, 'analysis']            // #7d
['books', bookId, 'events', eventId, 'source']              // #7i
['books', bookId, 'entities', entityId, 'chunks']           // #9b
['books', bookId, 'graph']                                  // #9
['books', bookId, 'inferred-relations']                     // #10b
['books', bookId, 'timeline-config']                        // #12a
['books', bookId, 'timeline']                               // #13a
['books', bookId, 'events', eventId]                        // #11
['books', bookId, 'entities', entityId, 'epistemic-state']  // #12e
['books', bookId, 'entities', entityId, 'voice']            // #16a
['books', bookId, 'unraveling']                             // #19
['tension', 'lines', bookId]                                // #14e
['tension', 'theme', bookId]                                // #14i
['symbols', bookId]                                         // #15a
['symbols', bookId, 'overview']                             // #15i
['symbols', imageryId, 'timeline']                          // #15b
['symbols', imageryId, 'co-occurrences']                    // #15c
['symbols', imageryId, 'sep']                               // #15d
['symbols', imageryId, 'interpretation']                    // #15g
['narrative', bookId]                                       // #21k
['narrative', bookId, 'kernel-spine']                       // #21j
['narrative', bookId, 'temporal-coverage']                  // #21g
['token-usage', range]                                      // #17
['kg', 'status']                                            // #18a
['tasks', taskId]                                           // #8（polling）
```

---

## 實作狀態（滾動更新，最後異動 2026-08-14）

- [x] **後端路由對齊**：`backend/storysphere/api/routers/` 已對齊本合約所有已知端點
- [x] **camelCase / snake_case 分區**：`api/schemas/` 輸出 camelCase；`domain/` 輸出 snake_case（見 `docs/type-generation.md`）
- [x] **TaskStatus 欄位**：`subProgress`、`subTotal`、`subStage` 已加入（批次任務使用）
- [x] **#9 GraphEdge 推斷欄位**：`inferred`、`confidence`、`inferredId` 已加入
- [x] **#14 張力分析系列**：專用 polling pattern 已實作（非走 #8）
- [x] **#15d-#15h 象徵意象進階分析**：SEP + LLM 詮釋 + HITL 審核已實作（`backend/storysphere/api/routers/symbols.py`）
- [x] **#16a VoiceProfile**：GET lazy 生成（無 404 表示未生成），DELETE 清快取；無另外的 POST trigger
- [x] **#18c KG 遷移**：直接回傳 TaskStatus，polling 走 #18d（非走 #8）
- [x] **#20 系列 `/analysis` 路由**：character + event 非同步深度分析，各有專用 polling（`backend/storysphere/api/routers/analysis.py`）
- [x] **#21 系列 `/narrative` 路由**：Kernel/Satellite 分類 + LLM 精煉 + Hero's Journey + Genette 時間序（`backend/storysphere/api/routers/narrative.py`）
  - 2026-06-01：#21k / #21l 加 `response_model=NarrativeStructure`，#21j 加 `response_model=list[KernelSpineEvent]`（新增 schema），讓 `generated.ts` 取得 `NarrativeStructure` / `HeroJourneyStage` / `KernelSpineEvent` 型別。回傳 JSON shape 不變（皆為既有 snake_case domain dump）。前端封裝於 `frontend/src/api/narrative.ts`，頁面為 `/books/:bookId/narrative`（B-045）。
  - 2026-08-12：#21k 的 `representative_event_ids` 改為讀取時推導（response schema 不變，欄位早已存在）。詳見 #21k 段落。
  - 2026-08-12：#21a 新增 409（分類會抹除既有分類時拒絕啟動），service 層同步加守衛。詳見 #21a 段落。
  - 2026-08-12：#21l 核可時一併寫入 `classification_source='human_verified'`（撤回核可時由事件來源還原）。詳見 #21l 段落。
- [ ] **#2-a / #3 lastOpenedAt**：後端尚未在開啟書籍時寫入此欄位
- [x] **#23a 跨書語意搜尋**：`POST /api/v1/search/`，metadata 欄位（`documentId`、`chapterNumber`、`position`）已修復；前端頁面 `/search` 已實作，Sidebar 圖示已啟用（2026-06-13）
- [ ] **Document scoping**：KG 實體尚未按 document 分隔（單本書模式下無影響）
