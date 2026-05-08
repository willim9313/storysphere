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

刪除書籍。

**Response 204**：刪除成功，無 body

**UI 使用頁面**：首頁（刪除操作，待實作）

---

## 上傳

### #2 POST /books/upload

上傳 PDF，觸發後端處理流程。

**Request**：`multipart/form-data`
```
file    (PDF 檔案，必填)
title   (書名字串，必填)
author  (作者字串，選填)
```

**Response 202**
```ts
{ taskId: string }
```

**說明**：取得 taskId 後，前端 polling `GET /tasks/:taskId/status`（見 #8）追蹤處理進度。

**UI 使用頁面**：上傳頁 `/upload`

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

章節列表。

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
  archetypeType?: string;
  chapterCount: number;
  content: string;
  framework: 'jung' | 'schmidt';
  generatedAt: string;
}

interface UnanalyzedEntity {
  id: string;
  name: string;
  type: EntityType;
  chapterCount: number;
}
```

**UI 使用頁面**：角色分析頁左側清單

---

### #6b GET /books/:bookId/analysis/events

取得事件分析清單（含已分析與未分析）。

**Response 200**：同 #6a 格式，`section: 'events'`

**UI 使用頁面**：事件分析頁左側清單

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

**Response 200**：`{ taskId: string }`

**UI 使用頁面**：知識圖譜頁「生成深度分析」按鈕、角色分析頁「建立」按鈕

---

### #7c DELETE /books/:bookId/entities/:entityId/analysis

清除角色實體深度分析結果。通常與 #7b 連用（先 DELETE 再 POST）。

**Response 204**

**UI 使用頁面**：角色分析頁「覆蓋重新生成」

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
  analyzedAt: string;
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
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;        // 0–100
  stage: string;           // UI 顯示文字，如「建構知識圖譜中」
  subProgress?: number;    // 子任務進度（批次任務使用）
  subTotal?: number;
  subStage?: string;
  result?: {
    bookId?: string;        // 上傳完成時提供，用於導向 /books/:bookId
    failedSteps?: string[]; // 上傳任務：部分步驟失敗時回傳失敗描述列表
    [key: string]: unknown;
  };
  error?: string;
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

**觸發點對照**

| 觸發操作 | 對應 API |
|----------|----------|
| PDF 上傳 | #2 |
| 整本書深度分析 | #6 |
| 條目重新生成 | #6c |
| 角色實體深度分析 | #7b |

---

### #8b POST /tasks/:taskId/cancel

中止正在執行的 background task（真正中斷 asyncio.Task）。

**Response 204**：中止成功

**Response 404**：task 不存在

**Response 409**：task 已完成或無法中止

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

確認推斷關係，將其加入正式圖譜。

**Request Body**
```ts
{ relationType: string }
```

**Response 201**：`{ relationId: string }`

**UI 使用頁面**：知識圖譜頁 InferredEdgePanel「Confirm」按鈕

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

取得書籍的 TensionLine 清單。

**Query Params**：`book_id=<bookId>`（必填）

**Response 200**
```ts
TensionLine[]

// TensionLine 欄位為 snake_case（domain/ model，無 alias_generator）
interface TensionLine {
  id: string;
  document_id: string;
  teu_ids: string[];
  canonical_pole_a: string;
  canonical_pole_b: string;
  intensity_summary: number;   // 0–1
  chapter_range: number[];     // [firstChapter, lastChapter]
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}
```

**UI 使用頁面**：張力分析頁（軌跡圖 + 審核列表）

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

**Response 404**：book 或 entity 不存在

**Response 422**：entity 無對話段落可分析

**UI 使用頁面**：角色分析頁 voice tab — VoiceProfilingPanel

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

## 展開卷軸

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

**UI 使用頁面**：展開卷軸頁 `/books/:bookId/unraveling`

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

## TanStack Query Key 對照

```ts
['books']                                                    // #1
['books', bookId]                                            // #2-a / #3
['books', bookId, 'chapters']                               // #4
['books', bookId, 'chapters', chapterId, 'chunks']          // #5
['books', bookId, 'analysis', 'characters']                 // #6a
['books', bookId, 'analysis', 'events']                     // #6b
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

- [x] **後端路由對齊**：`src/api/routers/` 已對齊本合約所有已知端點
- [x] **camelCase / snake_case 分區**：`api/schemas/` 輸出 camelCase；`domain/` 輸出 snake_case（見 `docs/type-generation.md`）
- [x] **TaskStatus 欄位**：`subProgress`、`subTotal`、`subStage` 已加入（批次任務使用）
- [x] **#9 GraphEdge 推斷欄位**：`inferred`、`confidence`、`inferredId` 已加入
- [x] **#14 張力分析系列**：專用 polling pattern 已實作（非走 #8）
- [x] **#15d-#15h 象徵意象進階分析**：SEP + LLM 詮釋 + HITL 審核已實作（`src/api/routers/symbols.py`）
- [x] **#16a VoiceProfile**：GET lazy 生成（無 404 表示未生成），DELETE 清快取；無另外的 POST trigger
- [x] **#18c KG 遷移**：直接回傳 TaskStatus，polling 走 #18d（非走 #8）
- [x] **#20 系列 `/analysis` 路由**：character + event 非同步深度分析，各有專用 polling（`src/api/routers/analysis.py`）
- [x] **#21 系列 `/narrative` 路由**：Kernel/Satellite 分類 + LLM 精煉 + Hero's Journey + Genette 時間序（`src/api/routers/narrative.py`）
- [ ] **#2-a / #3 lastOpenedAt**：後端尚未在開啟書籍時寫入此欄位
- [ ] **Document scoping**：KG 實體尚未按 document 分隔（單本書模式下無影響）
