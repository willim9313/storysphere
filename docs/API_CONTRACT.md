# StorySphere — API Contract

> 本文件為前後端對接的唯一 API 規格參考。
> UI_SPEC.md 中的 API 引用均以本文件編號為準（如「見 API_CONTRACT #1」）。
> 前端依本文件格式撰寫 mock data 進行開發，後端依本文件格式實作。

---

## Base URL

```
開發環境：http://localhost:8000/api/v1
```

> **注意**：所有端點路徑均相對於 `/api/v1`。
> 前端 Vite proxy 會將 `/api/*` 轉發至 `http://localhost:8000`。
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

interface Book {
  id: string;
  title: string;
  author?: string;
  status: 'processing' | 'ready' | 'analyzed' | 'error';
  chapterCount: number;
  entityCount?: number;
  uploadedAt: string;
  lastOpenedAt?: string;
}
```

**UI 使用頁面**：首頁 `/`

---

### #2-a GET /books/:bookId

單本書 metadata。

**Response 200**
```ts
Book  // 同 #1 的 Book interface，單筆
```

**Response 404**：書籍不存在

**UI 使用頁面**：閱讀頁、深度分析頁、知識圖譜頁（取書名、status 顯示用）

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
field: file  (PDF 檔案)
```

**Response 200**
```ts
{
  taskId: string;
}
```

**說明**：取得 taskId 後，前端開始 polling `GET /tasks/:taskId/status`（見 #8）追蹤處理進度。

**UI 使用頁面**：上傳頁 `/upload`

---

## 章節與內容

### #3 GET /books/:bookId

（同 #2-a，閱讀頁使用時另列以利查閱）

取得書籍基本資料，含摘要與統計數字供閱讀頁欄 1 顯示。

**Response 200**
```ts
{
  id: string;
  title: string;
  author?: string;
  status: 'processing' | 'ready' | 'analyzed' | 'error';
  summary?: string;          // 書籍摘要，供閱讀頁欄 1 顯示
  chapterCount: number;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  entityStats: {             // 各類型實體數量，供欄 1 分佈顯示
    character: number;
    location: number;
    concept: number;
    event: number;
  };
  uploadedAt: string;
  lastOpenedAt?: string;
}
```

**UI 使用頁面**：閱讀頁欄 1

---

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
  summary?: string;          // 章節摘要，點擊展開時顯示
  topEntities?: {            // 主要實體，供 pill 顯示，最多 5 筆
    id: string;
    name: string;
    type: 'character' | 'location' | 'concept' | 'event';
  }[];
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
  content: string;           // 純文字原文（備用）
  keywords: string[];
  segments: Segment[];       // 切分後的 inline 片段，含實體標記
}

interface Segment {
  text: string;
  entity?: {
    type: 'character' | 'location' | 'concept' | 'event';
    entityId: string;
    name: string;
  };
}
```

**說明**：一次拉取整個章節所有 chunks，TanStack Query 以 `['books', bookId, 'chapters', chapterId, 'chunks']` 做快取，同一章節不重複請求。

**UI 使用頁面**：閱讀頁欄 3

---

## 深度分析（書籍層級）

### #6 POST /books/:bookId/analyze

觸發整本書深度分析。需使用者確認（token 消耗提示）後才呼叫。

**Response 200**
```ts
{
  taskId: string;
}
```

**說明**：取得 taskId 後 polling #8。完成後書籍 `status` 變為 `'analyzed'`。

**UI 使用頁面**：閱讀頁（觸發按鈕）、首頁最近開啟（觸發分析快捷）

---

### #6a GET /books/:bookId/analysis/characters

取得角色分析清單（含已分析與未分析）。

**Response 200**
```ts
{
  analyzed: AnalysisItem[];
  unanalyzed: {
    id: string;
    name: string;
    type: 'character';
    chapterCount: number;
  }[];
}

interface AnalysisItem {
  id: string;
  entityId: string;
  section: 'characters';
  title: string;             // 角色名
  archetypeType?: string;    // 原型類型，如「革命者」
  chapterCount: number;
  content: string;           // 分析文本（Markdown）
  framework: 'jung' | 'schmidt';
  generatedAt: string;
}
```

**UI 使用頁面**：深度分析頁左側清單

---

### #6b GET /books/:bookId/analysis/events

取得事件分析清單（含已分析與未分析）。

**Response 200**
```ts
{
  analyzed: AnalysisItem[];   // section: 'events'
  unanalyzed: {
    id: string;
    name: string;
    type: 'event';
    chapterCount: number;
  }[];
}
```

**UI 使用頁面**：深度分析頁左側清單（切換至事件 tab）

---

### #6c POST /books/:bookId/analysis/:section/:itemId/regenerate

單一條目重新生成。需確認視窗（說明覆蓋現有結果 + token 消耗）後才呼叫。

```
section: characters | events | timeline | themes
```

**Response 200**
```ts
{
  taskId: string;
}
```

**說明**：polling #8。生成期間該條目顯示 loading，其他條目維持可讀。

**UI 使用頁面**：深度分析頁「覆蓋重新生成」按鈕

---

## 深度分析（實體層級）

### #7a GET /books/:bookId/entities/:entityId/analysis

取得實體深度分析結果。

**Response 200**
```ts
EntityAnalysis

interface EntityAnalysis {
  entityId: string;
  entityName: string;
  content: string;           // 分析文本（Markdown）
  generatedAt: string;
}
```

**Response 404**：尚未生成，前端顯示「未生成」狀態

**UI 使用頁面**：知識圖譜頁詳情面板、深度分析頁內容區

---

### #7b POST /books/:bookId/entities/:entityId/analyze

觸發實體深度分析。需確認視窗（說明 token 消耗 + 結果將同步至深度分析頁）後才呼叫。

**Response 200**
```ts
{
  taskId: string;
}
```

**說明**：polling #8。生成中面板其他內容維持可讀。完成後填入分析文字。

**UI 使用頁面**：知識圖譜頁詳情面板「生成深度分析」按鈕、深度分析頁「建立」按鈕

---

### #7c DELETE /books/:bookId/entities/:entityId/analysis

清除實體深度分析結果。通常與 #7b 連用（先 DELETE 再 POST）。

**Response 204**：清除成功，無 body

**UI 使用頁面**：知識圖譜頁「清除並重新生成」、深度分析頁「覆蓋重新生成」

---

## 知識圖譜

### #9 GET /books/:bookId/graph

取得圖譜節點與邊資料。

**Response 200**
```ts
GraphData

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  name: string;
  type: 'character' | 'location' | 'concept' | 'event';
  description?: string;
  chunkCount: number;        // 決定節點大小（20px–60px）
}

interface GraphEdge {
  id: string;
  source: string;            // node id
  target: string;            // node id
  label?: string;            // 關係類型，待後端確認實際清單
}
```

**說明**：節點詳情（名稱、類型、描述）從此資料直接取，不需額外 API。實體分析狀態另呼叫 #7a。

**UI 使用頁面**：知識圖譜頁

---

## 非同步任務狀態

### #8 GET /tasks/:taskId/status

輪詢任務進度。所有非同步任務共用同一個 endpoint。

**Response 200**
```ts
TaskStatus

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;          // 0–100
  stage: string;             // UI 顯示文字，如「建構知識圖譜中」
  result?: {
    bookId?: string;         // 上傳完成時提供，用於導向 /books/:bookId
  };
  error?: string;
}
```

**Polling 實作**
```ts
useQuery({
  queryKey: ['tasks', taskId],
  queryFn: () => fetchTaskStatus(taskId),
  enabled: !!taskId,
  refetchInterval: (data) => {
    if (!data) return 2000;
    if (data.status === 'done' || data.status === 'error') return false;
    return 2000;
  },
})
```

**觸發點對照**

| 觸發操作 | 對應 API | 說明 |
|----------|----------|------|
| PDF 上傳 | #2 | 完成後 `result.bookId` 供導向 |
| 整本書深度分析 | #6 | 完成後書籍 status 變 `analyzed` |
| 條目重新生成 | #6c | 完成後更新該條目內容 |
| 實體深度分析 | #7b | 完成後填入詳情面板 |

**UI 使用頁面**：上傳頁（步驟 timeline）、各確認視窗後的 loading 狀態

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
['books', bookId, 'graph']                                  // #9
['tasks', taskId]                                           // #8（polling）
```

---

## 實作狀態（2026-03-17 更新）

- [x] **後端路由對齊**：`src/api/routers/books.py` + `tasks.py` 已對齊本合約所有端點
- [x] **camelCase 輸出**：所有前端 API 回應均使用 camelCase（Pydantic alias_generator）
- [x] **TaskStatus 對齊**：status enum 改為 `done`/`error`，新增 `progress`/`stage`
- [x] **#9 GraphEdge.label**：使用 KG relation_type 作為 label
- [x] **#3 summary / entityStats**：已實作（entityStats 從 KG 計算）
- [x] **#4 Chapter.topEntities**：從 ingestion-time paragraph entity linking 聚合 unique entities（舊資料 fallback 到 KG runtime matching）
- [x] **#5 Chunk.segments entity 標注**：ingestion 時建立 paragraph ↔ entity 偏移量，API 直接從 stored offsets 建 segments（舊資料 fallback 到 runtime regex matching）
- [ ] **Document scoping**：KG 實體尚未按 document 分隔（單本書模式下無影響）
