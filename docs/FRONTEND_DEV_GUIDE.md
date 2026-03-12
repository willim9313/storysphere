# 智能小說閱讀器 — 前端開發規格文件

> 本文件為前端開發的唯一規格參考，供 Claude Code 開發時使用。
> 後端 API 由同一人開發，採分離整合方式對接。

---

## 專案概述

基於 React + TypeScript 的小說閱讀應用，核心功能為 PDF 上傳、AI 分析、章節閱讀、實體高亮與知識圖譜探索。

---

## 技術架構

| 項目 | 選型 | 說明 |
|------|------|------|
| 框架 | React 18 + TypeScript | — |
| 樣式 | Tailwind CSS + CSS Variables | Tailwind 負責 layout / spacing；排版 token 用 CSS variables 統一管理 |
| Routing | React Router v6 | URL 帶 bookId，支援直接連結 |
| Server State | TanStack Query (React Query) | API 資料快取、loading/error、polling |
| UI State | React Context | dark mode、選中章節等跨元件 UI 狀態 |
| 知識圖譜 | Cytoscape.js | 單一框架，不引入其他圖形引擎 |
| 圖示 | Lucide React | — |

### 狀態管理原則

- **Server state**（來自 API）一律交給 TanStack Query 管理，不自己寫 `useEffect + fetch`
- **UI state**（dark mode、選中章節、側欄狀態等）用 React Context
- 不引入 Zustand 或其他額外狀態管理庫

---

## 視覺設計規格

### 設計語言

**Editorial 風格** — 字體優先、留白節奏、內容主導。參考：Readwise Reader、Instapaper。

- 排版驅動設計，UI chrome 最小化
- 閱讀區讓文字本身呼吸，不堆砌裝飾

### 字體系統

```css
/* 正文（英文）*/
font-family: 'Libre Baskerville', Georgia, serif;

/* 正文（中文）*/
font-family: 'Noto Sans TC', sans-serif;

/* UI 元素（導覽、標籤、meta 資訊）*/
font-family: 'DM Sans', system-ui, sans-serif;
```

Google Fonts 引入：
```
Libre Baskerville: ital,wght@0,400;0,700;1,400
Noto Sans TC: wght@400;500
DM Sans: wght@400;500
```

### CSS Variables — 主題 Token

```css
/* Light Mode */
:root {
  --bg-primary:    #faf8f4;
  --bg-secondary:  #f4ede0;
  --bg-tertiary:   #efe8d8;

  --fg-primary:    #1c1814;
  --fg-secondary:  #5a4f42;
  --fg-muted:      #8a7a68;

  --border:        #e0d4c4;
  --accent:        #8b5e3c;

  /* 實體高亮 */
  --entity-character-bg:     #dbeafe;
  --entity-character-text:   #1e40af;
  --entity-character-border: #bfdbfe;

  --entity-location-bg:     #dcfce7;
  --entity-location-text:   #166534;
  --entity-location-border: #bbf7d0;

  --entity-concept-bg:     #ede9fe;
  --entity-concept-text:   #5b21b6;
  --entity-concept-border: #ddd6fe;

  --entity-event-bg:     #fee2e2;
  --entity-event-text:   #991b1b;
  --entity-event-border: #fecaca;
}

/* Dark Mode */
[data-theme="dark"] {
  --bg-primary:    #1a1814;
  --bg-secondary:  #221e18;
  --bg-tertiary:   #2a2520;

  --fg-primary:    #e2d9cc;
  --fg-secondary:  #b0a090;
  --fg-muted:      #7a7060;

  --border:        #2e2820;
  --accent:        #c4956a;

  --entity-character-bg:     #1e3a5f;
  --entity-character-text:   #93c5fd;
  --entity-character-border: #1e40af;

  --entity-location-bg:     #14532d;
  --entity-location-text:   #86efac;
  --entity-location-border: #166534;

  --entity-concept-bg:     #2e1065;
  --entity-concept-text:   #c4b5fd;
  --entity-concept-border: #5b21b6;

  --entity-event-bg:     #450a0a;
  --entity-event-text:   #fca5a5;
  --entity-event-border: #991b1b;
}
```

### 實體 Inline 高亮規則

閱讀區文本中，實體直接 inline 高亮，不彈窗、不跳頁。

```tsx
// 高亮樣式範例
<mark style={{
  background: 'var(--entity-character-bg)',
  color: 'var(--entity-character-text)',
  borderBottom: '1.5px solid var(--entity-character-border)',
  borderRadius: '2px',
  padding: '0 2px',
}}>
  汪淼
</mark>
```

實體類型對應：
- `character` → 角色（藍）
- `location` → 地點（綠）
- `concept` → 概念（紫）
- `event` → 事件（紅）

---

## 頁面結構與路由

```
/                          首頁（書庫列表）
/upload                    上傳頁面
/books/:bookId             閱讀頁面（預設第一章）
/books/:bookId/analysis    深度分析頁面
/books/:bookId/graph       知識圖譜頁面
```

### 各頁面說明

#### 首頁 `/`
- 顯示所有已上傳書籍的卡片列表
- 每張卡片顯示：書名、章節數、處理狀態、最後開啟時間
- 入口按鈕：「上傳新書」

#### 上傳頁面 `/upload`
- 拖曳或點擊上傳 PDF
- 上傳後觸發後端處理，顯示進度（見「非同步任務」章節）
- 完成後導向 `/books/:bookId`

#### 閱讀頁面 `/books/:bookId`
- 左右分割版面
  - 左側：章節列表（固定寬度，可收合）
  - 右側：chunk 內容，inline 實體高亮
- 點擊章節 → 右側更新對應 chunks
- 右側下方顯示該 chunk 的關鍵字標籤
- 提供「深度分析」觸發按鈕（若該書尚未分析）

#### 深度分析頁面 `/books/:bookId/analysis`

> 此頁面需要書籍已完成深度分析（`status: 'analyzed'`）才能進入，否則顯示引導提示。

頁面集結該本書所有深度分析結果，分為以下區塊：

- **角色分析** — 每個主要角色的詳細描述、性格、關係
- **事件分析** — 重要事件的梳理與解析
- **時間軸** — 故事事件的時序排列
- **主題 / 概念分析** — 核心主題與概念的深度解讀

**重新生成規則：**
- 每個條目（例如「葉文潔」這個角色）可以**獨立重新生成**，不影響其他條目
- 點擊「重新生成」前跳出確認視窗，說明將消耗 token
- 重新生成期間該條目顯示 loading 狀態，其他條目維持可讀
- 生成結果存於後端，下次進入頁面直接讀取快取

#### 知識圖譜頁面 `/books/:bookId/graph`
- 視覺風格與閱讀頁不同，偏工具感
- 使用 Cytoscape.js 渲染圖譜
- 功能：節點點擊查看詳情、搜尋節點、過濾實體類型
- 側欄顯示實體類型統計

**節點點擊側欄（實體詳情面板）：**

點擊節點後，右側展開詳情面板，包含：
1. 實體基本資訊（名稱、類型、描述）
2. **相關文本段落**：該實體出現的 chunk 列表，可展開閱讀原文
3. **深度分析區塊**：

| 狀態 | 顯示內容 |
|------|----------|
| 尚未生成 | 顯示「尚未進行深度分析」提示 + 「生成深度分析」按鈕 |
| 點擊生成 | 跳出確認視窗（說明 token 消耗），確認後開始 polling 進度 |
| 生成中 | 顯示進度狀態，面板其他內容維持可讀 |
| 已生成 | 直接展開顯示深度分析文本內容 |
| 已生成（操作） | 提供「清除並重新生成」按鈕，點擊後跳出確認視窗 |

深度分析結果**存於後端**，節點存在已生成結果時，點擊節點直接展開顯示，不需重新生成。

---

## API 對接規格

### Base URL

開發環境：`http://localhost:8000`（待後端確認）

### Endpoints

```
# 書庫
GET    /books                           書庫列表
GET    /books/:bookId                   單本書 metadata
DELETE /books/:bookId                   刪除書

# 上傳
POST   /books/upload                    上傳 PDF（multipart/form-data）
                                        → { taskId: string }

# 章節與內容
GET    /books/:bookId/chapters                        章節列表
GET    /books/:bookId/chapters/:chapterId/chunks      該章節全部 chunks（含實體）

# 深度分析（書籍層級）
POST   /books/:bookId/analyze                                      觸發整本書深度分析 → { taskId }
GET    /books/:bookId/analysis                                     取得全部分析結果
GET    /books/:bookId/analysis/:section                            取得特定區塊結果
                                                                   section: characters | events | timeline | themes
POST   /books/:bookId/analysis/:section/:itemId/regenerate         單一條目重新生成 → { taskId }

# 深度分析（實體層級，從知識圖譜觸發）
GET    /books/:bookId/entities/:entityId/analysis                  取得實體深度分析（無結果回傳 404）
POST   /books/:bookId/entities/:entityId/analyze                   觸發實體深度分析 → { taskId }
DELETE /books/:bookId/entities/:entityId/analysis                  清除實體深度分析結果

# 知識圖譜
GET    /books/:bookId/graph             節點 + 邊資料

# 非同步任務狀態
GET    /tasks/:taskId/status            進度查詢（polling 用）
```

### TanStack Query Key 規範

```ts
// 保持 query key 與 endpoint 結構對應
['books']                                                    // 書庫列表
['books', bookId]                                            // 單本書
['books', bookId, 'chapters']                               // 章節列表
['books', bookId, 'chapters', chapterId, 'chunks']          // 該章節全部 chunks
['books', bookId, 'analysis']                               // 全部深度分析結果
['books', bookId, 'analysis', section]                      // 特定區塊（characters/events/timeline/themes）
['books', bookId, 'entities', entityId, 'analysis']         // 實體深度分析
['books', bookId, 'graph']                                  // 圖譜資料
['tasks', taskId]                                           // 任務狀態（polling）
```

### 預期資料結構

```ts
// 書籍
interface Book {
  id: string;
  title: string;
  status: 'processing' | 'ready' | 'analyzed' | 'error';
  chapterCount: number;
  uploadedAt: string;
  lastOpenedAt?: string;
}

// 章節
interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  chunkCount: number;
}

// Chunk（章節內全部，API 回傳陣列）
interface Chunk {
  id: string;
  chapterId: string;
  order: number;
  content: string;
  keywords: string[];
  segments: Segment[];   // 切分後的 inline 片段，含實體標記
}

interface Segment {
  text: string;
  entity?: {
    type: 'character' | 'location' | 'concept' | 'event';
    entityId: string;
    name: string;
  };
}

// 知識圖譜
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  name: string;
  type: 'character' | 'location' | 'concept' | 'event';
  description?: string;
  chunkCount: number;
}

interface GraphEdge {
  id: string;
  source: string;   // node id
  target: string;   // node id
  label?: string;
}

// 深度分析條目（書籍層級）
type AnalysisSection = 'characters' | 'events' | 'timeline' | 'themes';

interface AnalysisItem {
  id: string;
  section: AnalysisSection;
  title: string;             // 例如角色名、事件名
  content: string;           // 生成的分析文本（Markdown）
  generatedAt: string;
}

interface BookAnalysis {
  bookId: string;
  characters: AnalysisItem[];
  events: AnalysisItem[];
  timeline: AnalysisItem[];
  themes: AnalysisItem[];
}

// 實體深度分析（知識圖譜層級）
interface EntityAnalysis {
  entityId: string;
  entityName: string;
  content: string;           // 生成的分析文本（Markdown）
  generatedAt: string;
}

// 任務狀態
interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;         // 0–100
  stage: string;            // UI 顯示文字，如「建構知識圖譜中」
  result?: {
    bookId?: string;        // 上傳完成時提供
  };
  error?: string;
}
```

---

## 非同步任務（進度顯示）

### 觸發點

1. **PDF 上傳處理**：`POST /books/upload` 後取得 taskId
2. **整本書深度分析**：`POST /books/:bookId/analyze` 後取得 taskId
3. **單一條目重新生成**：`POST /books/:bookId/analysis/:section/:itemId/regenerate` 後取得 taskId
4. **實體深度分析**：`POST /books/:bookId/entities/:entityId/analyze` 後取得 taskId

所有任務均透過相同的 `GET /tasks/:taskId/status` 輪詢，taskId 各自獨立互不干擾。

### Polling 實作

```ts
useQuery({
  queryKey: ['tasks', taskId],
  queryFn: () => fetchTaskStatus(taskId),
  enabled: !!taskId,
  refetchInterval: (data) => {
    if (!data) return 2000;
    if (data.status === 'done' || data.status === 'error') return false;
    return 2000;  // 每 2 秒查詢一次
  },
})
```

### 進度條 UI 規則（配合 Editorial 風格）

- 進度條：細線（height: 2px）、無漸變、純色
- 階段文字：小字（12px）、`var(--fg-muted)`、DM Sans
- 不使用 Modal，inline 呈現於頁面中
- 完成後：進度條消失，直接顯示「開始閱讀」或「查看分析」入口
- 出錯後：顯示錯誤訊息 + 重試按鈕

---

## 知識圖譜（Cytoscape.js）

### 框架選型

使用 **Cytoscape.js** 作為唯一圖形引擎，不引入 Sigma.js 或其他替代方案。

### 節點樣式對應

```ts
const nodeColors = {
  character: { bg: '#2563eb', border: '#1d4ed8' },
  location:  { bg: '#16a34a', border: '#15803d' },
  concept:   { bg: '#7c3aed', border: '#6d28d9' },
  event:     { bg: '#dc2626', border: '#b91c1c' },
};
```

Dark mode 時節點顏色對應調整（飽和度降低、亮度提升）。

節點大小根據 `chunkCount`（出現次數）動態調整，範圍 20px–60px。

### 互動功能

- 左鍵點擊節點 → 右側面板顯示節點詳情（名稱、類型、描述、關聯節點列表）
- 搜尋欄 → 即時過濾節點，命中節點高亮
- 類型過濾 → checkbox 切換顯示/隱藏各實體類型
- 重置按鈕 → 回到初始 viewport

### 資料轉換

後端 `GraphData` → Cytoscape elements 格式：

```ts
function toCytoscapeElements(graph: GraphData): cytoscape.ElementDefinition[] {
  const nodes = graph.nodes.map(n => ({
    data: { id: n.id, label: n.name, type: n.type, ...n },
  }));
  const edges = graph.edges.map(e => ({
    data: { id: e.id, source: e.source, target: e.target, label: e.label },
  }));
  return [...nodes, ...edges];
}
```

---

## 已確認事項

### 深度分析觸發方式
- **手動觸發**，上傳完成後不自動執行
- 使用者點擊「深度分析」按鈕後，**先跳出確認視窗**
- 確認視窗需明確說明：此操作會消耗大量 token，請確認後再執行
- 使用者確認後才呼叫 `POST /books/:bookId/analyze`

### Chunk 載入策略
- 點擊章節時，**一次拉取該章節全部 chunks**（`GET /books/:bookId/chapters/:chapterId/chunks`）
- 切換到不同章節時重新 call API
- TanStack Query 以 `['books', bookId, 'chapters', chapterId, 'chunks']` 為 key 做快取，同一章節不重複請求

### 知識圖譜關係類型
- Edge 的預設關係類型（`label`）待開發時參考後端 repo 的相關定義
- 前端顯示層保持彈性，不 hardcode 關係類型清單

### 使用者架構
- **單一用戶平台**，不考慮多用戶
- 無需 auth、無需 user id，所有 API 不帶用戶識別參數

---

## 待確認事項

- [ ] **圖譜 edge 關係類型**：開發知識圖譜頁面前，參考後端 repo 確認 `label` 的實際定義與清單

---

## 開發注意事項

- Tailwind 只用於 layout / spacing，**不用 Tailwind 管字體、顏色**，一律走 CSS variables
- Dark mode 切換透過 `data-theme="dark"` attribute 掛在 `<html>` 上，不用 class 切換
- 所有 API 請求都透過 TanStack Query，不在 component 內直接寫 fetch
- 知識圖譜頁面允許有不同的視覺風格，不需要強制套用 Editorial 排版
