# StorySphere — API Contract

> 本文件為前後端對接的唯一 API 規格參考。
> UI_SPEC.md 中的 API 引用以本文件編號為準（如「見 API_CONTRACT #1」）。
> 欄位名稱規則：`api/schemas/` 下的 model 輸出 camelCase；`domain/` 下輸出 snake_case。詳見 `docs/type-generation.md`。

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
  chapterCount: number;
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
  chapterCount: number;
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
  chapterCount: number;
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

**Response 200**：同 #6a 格式，`section: 'events'`；事件清單會額外填入 `chapter` / `narrativeMode` / `importance` 三個欄位（已分析事件的 `importance` 來自 cached EEP；未分析事件 `importance` 為 `null`）。`status` 同 #6a：`partial` = 該事件分析有子步驟（causality / impact）失敗，左側清單狀態點據此上色（complete=綠 / partial=琥珀）。

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

批次觸發所有未分析角色（`entity_type=character`）的深度分析（已分析自動跳過）。Archetype frameworks 固定為 `["jung", "schmidt"]`。

**Response 202**：`{ taskId: string }`

**Response 404**：書本不存在
**Response 400**：書本內無 character 類型實體

**說明**：TaskStatus.result 的進度格式與事件批次共用 `BatchEepResult`（見 #7g）。polling #8。

**UI 使用頁面**：角色分析頁「一鍵生成全部角色分析」

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

### #7g POST /books/:bookId/events/analyze-all

批次觸發所有未分析事件的 EEP 分析（已分析自動跳過）。

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

**UI 使用頁面**：事件分析頁「一鍵生成全部 EEP」

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
- 書進庫**後**取消 → 書留在庫裡，剩餘 enrichment 步驟中斷，`pipelineStatus` 中未完成步驟標為 `failed`，可透過 #8c 補跑

---

### #8c POST /books/:bookId/rerun/:step

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

**說明**：補跑完成後，對應 `pipelineStatus` 欄位更新為 `done` 或 `failed`。前端完成後需 invalidate `['book', bookId]` query 以重整書籍資料。
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
  storyTimeHint?: string;
  participants: { id: string; name: string; type: EntityType }[];
  location?: { id: string; name: string };
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
  teus: TEUSummary[];                   // 構成此線的 TEU 證據，依 teu_ids 順序
}

interface TEUSummary {
  id: string;
  chapter: number;
  intensity: number;                    // 0–1
  tension_description: string;
  evidence: string[];                   // 1–3 段文本引用
  pole_a_carriers: string[];            // 對應 pole A 的角色名（denormalized）
  pole_b_carriers: string[];
}
```

**UI 使用頁面**：張力分析頁（hero / 軌跡圖 dashboard / 審核 LineCard 證據區）

**備註**：`teus[]` 由 `TensionService.get_lines_with_teus()` 透過 `AnalysisCache.list_by_prefix("teu:")` 一次取出，過濾掉與 `teu_ids` 不匹配的條目；若 TEU 已逾 TTL，該條 line 的 `teus` 為空陣列（line 仍照常回傳）。

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
}
```

**Response 200**：`TensionLine`（更新後）

**UI 使用頁面**：張力分析頁 TensionLineCard 審核按鈕

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
  frye_mythos?: string;   // 'romance' | 'tragedy' | 'comedy' | 'irony'
  booker_plot?: string;
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}
```

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
  co_occurring_entity_ids: string[];
  co_occurring_entity_counts: Record<string, number>;  // { entityId: N occurrences whose paragraph mentions this entity }
  co_occurring_event_ids: string[];
  chapter_distribution: Record<string, number>;   // { "1": 3, "2": 1, ... }
  peak_chapters: number[];
  assembled_by: string;
  assembled_at: string;
}
```

**Response 404**：imagery 不存在

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

**Response 404**：book 或 entity 不存在

**Response 422**：entity 無對話段落可分析

**UI 使用頁面**：角色分析頁 voice tab — VoiceProfilingPanel（ToneDistribution 堆疊條 + SentenceHistogram 直方圖）

---

### #16b DELETE /books/:bookId/entities/:entityId/voice

清除語音風格分析結果（搭配重新生成使用）。

**Response 204**

**UI 使用頁面**：角色分析頁 voice tab — VoiceProfilingPanel「重新生成」

---

## Token 用量

### #17 GET /token-usage

取得 Token 用量統計。

**Query Params**：`range=today|7d|30d|all`

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
  daily: DailyUsage[];
}

interface TokenBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

interface DailyUsage extends TokenBucket {
  date: string;   // 'YYYY-MM-DD'
}
```

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
  totalChapters: number;
  // nodeId → 12-cell（依書籍實際章節數）counts；
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

**Response 200**：`NarrativeStructure`（model_dump 格式）

**Response 404**：尚未執行 #21a

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

後端載入已存文件、串接所有 `role==toc` 章節的段落文字送一次 LLM 解析。無目錄章節或
解析不出（非標準目錄格式）時回傳空 `entries`（前端顯示 fallback）。數量對比由前端計算
（目錄 body 條目數 vs 偵測 body 章節數）。

**Response 404**：書籍不存在

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

---

## 跨書搜尋

### #22a `POST /api/v1/search/` — 語意搜尋

**Request body**（camelCase）：

```json
{
  "query": "描述主角內心動搖的段落",
  "bookId": null,
  "topK": 20
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `query` | `string` | 自然語言查詢 |
| `bookId` | `string \| null` | `null` = 跨書；傳入 UUID = 限定單書 |
| `topK` | `integer` | 回傳筆數，1–50，預設 20 |

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
| `score` | Qdrant 語意相關度，0–1 |
| `metadata.documentId` | 所屬書籍 UUID，對應 `GET /api/v1/books/` 的 `id` |
| `metadata.chapterNumber` | 所在章節（1-based） |
| `metadata.position` | 段落在章節內的位置（1-based） |

**前端封裝**：`frontend/src/api/search.ts`  
**頁面**：`/search`（Sidebar Search 圖示）  
**實作狀態（2026-06-13）**：已完整實作；`metadata` 欄位修復（原回傳空 `{}`）。

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

## 實作狀態（2026-04-28 更新）

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
- [ ] **#2-a / #3 lastOpenedAt**：後端尚未在開啟書籍時寫入此欄位
- [x] **#22a 跨書語意搜尋**：`POST /api/v1/search/`，metadata 欄位（`documentId`、`chapterNumber`、`position`）已修復；前端頁面 `/search` 已實作，Sidebar 圖示已啟用（2026-06-13）
- [ ] **Document scoping**：KG 實體尚未按 document 分隔（單本書模式下無影響）
