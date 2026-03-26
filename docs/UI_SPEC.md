# StorySphere — UI 規格文件 (UI_SPEC)

> 本文件為前端開發的頁面規格參考，供 Claude Code 開發時使用。
> 設計決策與 wireframe 已在設計討論階段確認，本文件為可施工的規格整理。
> API 對接細節見 `API_CONTRACT.md`（編號引用）。

---

## 1. 設計系統

### 1.1 風格定位

**A + B 融合風格**：以暖白底為主體（A — Warm Analytical），工具區塊借用深色 surface（B — Dark Intelligence）。

- 主閱讀 / 內容區：暖白底、serif 正文、有溫度的卡片
- 工具區塊（詳情面板、深度分析面板）：深色 surface `#221e18`
- 實體標籤：帶色點 pill 形式（非純色塊）

參考產品感：Notion + Linear 混合，有設計感但不失工具效率。

### 1.2 CSS Token

沿用 `FRONTEND_DEV_GUIDE.md` 中的 CSS Variables，以下為關鍵 token：

```css
/* 主要背景層次 */
--bg-primary:   #faf8f4   /* 主內容區底色 */
--bg-secondary: #f4ede0   /* sidebar、欄位底色 */
--bg-tertiary:  #efe8d8   /* 選中狀態、hover 底色 */

/* 文字 */
--fg-primary:   #1c1814
--fg-secondary: #5a4f42
--fg-muted:     #8a7a68

/* 邊框 */
--border:       #e0d4c4

/* Accent */
--accent:       #8b5e3c

/* 工具面板（深色） */
--panel-bg:         #221e18
--panel-bg-card:    #2a2520
--panel-border:     #2e2820
--panel-fg:         #e2d9cc
--panel-fg-muted:   #7a7060
```

### 1.3 字體

```css
font-family: 'Libre Baskerville', Georgia, serif;   /* 正文內容 */
font-family: 'Noto Sans TC', sans-serif;             /* 中文 UI */
font-family: 'DM Sans', system-ui, sans-serif;       /* UI 元素 */
```

### 1.4 實體 Pill 樣式（帶色點）

```tsx
// 帶色點 pill — B 風格，取代純色塊
<span className="pill pill-char">
  <span className="pill-dot" />
  葉文潔
</span>

// CSS
.pill { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; padding: 2px 7px; border-radius: 20px; }
.pill-dot { width: 5px; height: 5px; border-radius: 50%; }
.pill-char { background: #eef4ff; border: 0.5px solid #bfdbfe; color: #1e40af; }
.pill-char .pill-dot { background: #3b82f6; }
.pill-loc  { background: #f0fdf4; border: 0.5px solid #bbf7d0; color: #166534; }
.pill-loc .pill-dot  { background: #22c55e; }
.pill-con  { background: #f5f3ff; border: 0.5px solid #ddd6fe; color: #5b21b6; }
.pill-con .pill-dot  { background: #8b5cf6; }
.pill-evt  { background: #fff1f2; border: 0.5px solid #fecaca; color: #991b1b; }
.pill-evt .pill-dot  { background: #ef4444; }
```

### 1.5 三層展開原則

**最多同時存在三個層次**，第三層切換時替換，不累加。

```
層次 1          層次 2            層次 3（擇一）
────────────    ──────────────    ──────────────
主內容區        詳情 / 列表面板   深入細節面板
```

適用頁面：閱讀頁（書籍→章節→Chunk）、知識圖譜頁（圖譜→實體詳情→段落或分析）。

---

## 2. 導航架構

### 2.1 全站層級（左側 Sidebar）

固定在所有頁面左側，寬度 48px，icon-only。

| Icon | 目的地 | 路由 |
|------|--------|------|
| 首頁 | 書庫首頁 | `/` |
| 上傳 | 上傳 & 處理進度 | `/upload` |
| 框架索引 | 方法論參考文件 | `/frameworks` |
| 搜尋 | 全站搜尋（未來） | — |
| 設定 | 設定（未來） | `/settings` |

### 2.2 書籍層級（Top Nav Tab）

進入特定書籍後，top nav 顯示四個 tab，切換書籍內頁面。

| Tab | 路由 |
|-----|------|
| 閱讀 | `/books/:bookId` |
| 深度分析 | `/books/:bookId/analysis` |
| 知識圖譜 | `/books/:bookId/graph` |
| 時間軸 | `/books/:bookId/timeline` |

top nav 同時顯示書名與「← 書庫」返回入口。

### 2.3 頁面層級關係

```
全站 Sidebar
  ├─ 首頁 /
  ├─ 上傳 & 處理進度 /upload
  ├─ 框架索引 /frameworks
  └─ [書籍空間] /books/:bookId
       ├─ 閱讀        /books/:bookId
       ├─ 深度分析    /books/:bookId/analysis
       ├─ 知識圖譜    /books/:bookId/graph
       └─ 時間軸      /books/:bookId/timeline
```

---

## 3. 頁面規格

---

### 3.1 首頁 `/`

#### 版面結構

```
[Left Sidebar] [主內容區]
                ├─ 最近開啟（橫向 3 張卡）
                ├─ 分隔線
                └─ 書庫（卡片 grid + filter）
```

#### 最近開啟區塊

- 顯示最近 2–3 本有動作的書籍
- 每張卡片頂部有 3px accent bar
- 依書籍 `status` 顯示不同快捷入口：

| status | 快捷入口 |
|--------|---------|
| `analyzed` | 繼續閱讀、知識圖譜、深度分析、時間軸 |
| `ready` | 開始閱讀、觸發分析 |
| `processing` | 查看處理進度 |
| `error` | 查看錯誤 |

#### 書庫區塊

- 卡片 grid，`repeat(auto-fill, minmax(180px, 1fr))`
- 每張卡片：書名、作者、status badge、章節數、實體數、最後開啟時間
- 頂部 filter chip：全部 / 已分析 / 已就緒 / 處理中
- 最後一格為「上傳新書」入口卡（dashed border）
- 處理中的書顯示 2px 進度條 + 階段文字（取代一般卡片內容）

#### 狀態流程

```
idle
  → 點擊書籍卡片 → navigate to /books/:bookId
  → 點擊「上傳新書」卡 → navigate to /upload
  → 點擊「繼續閱讀」 → navigate to /books/:bookId
  → 點擊「知識圖譜」 → navigate to /books/:bookId/graph
  → 點擊「深度分析」 → navigate to /books/:bookId/analysis
  → 點擊「觸發分析」 → navigate to /books/:bookId（顯示確認視窗）
```

#### API

- `GET /books`（見 API_CONTRACT #1）

---

### 3.2 上傳 & 處理進度頁 `/upload`

#### 版面結構

```
[Left Sidebar] [主內容區]
                ├─ 上傳區塊（拖曳 / 點擊）
                ├─ 處理中（卡片列表）
                └─ 已完成（輕量列表）
```

#### 上傳區塊

- 拖曳或點擊觸發檔案選擇，支援 PDF
- 狀態：
  - `idle`：顯示拖曳提示文字
  - `dragging`：border 變深色，背景略變
  - `uploading`：顯示 2px 進度條
  - `error`：顯示錯誤訊息 + 重試

#### 處理中卡片

每本處理中的書一張卡片，包含：
- 書名、作者、上傳時間
- status badge：處理中（黃）/ 處理失敗（紅）
- 步驟 timeline（垂直，5 個步驟）：

```
步驟狀態對應：
  done    → 綠色圓圈 ✓ + 綠色連線
  running → 黃色圓圈 … + 細進度條（2px）
  pending → 灰色圓圈（數字）
  error   → 紅色圓圈 ✕ + 錯誤說明文字 + 重試按鈕
```

步驟名稱為 placeholder，對接後端後替換：
1. 步驟一　PDF 解析
2. 步驟二　章節切分
3. 步驟三　Chunk 處理與實體識別
4. 步驟四　知識圖譜建構
5. 步驟五　摘要生成

#### 已完成列表

- 輕量列表，每筆：色點 + 書名 + 完成時間 + 「進入書籍」按鈕
- 只顯示歷史處理紀錄，不顯示處理中

#### 狀態流程

```
idle
  → 選擇 / 拖曳 PDF → uploading
    → 呼叫 POST /books/upload（見 API_CONTRACT #2）→ 取得 taskId
    → polling GET /tasks/:taskId/status（見 API_CONTRACT #8）每 2 秒
      → status: running → 更新步驟進度
      → status: done → 移至已完成列表 + 顯示「進入書籍」
      → status: error → 步驟顯示失敗狀態 + 重試按鈕

重試
  → 點擊重試按鈕 → 重新呼叫上傳或對應步驟 API
```

#### API

- `POST /books/upload`（見 API_CONTRACT #2）
- `GET /tasks/:taskId/status`（見 API_CONTRACT #8）

---

### 3.3 閱讀頁 `/books/:bookId`

#### 版面結構

三欄節點展開，同時可見，橫向可捲動：

```
[Left Sidebar] [欄1: 書籍總覽] [欄2: 章節列表] [欄3: Chunk 內容]
                    ↑                 ↑                  ↑
                  固定寬            固定寬            flex 剩餘寬度
                  200px             220px
```

欄與欄之間用 **Bezier 曲線**連接，不是無縫並排：
- 書籍 → 所有章節：每條章節一條曲線，未選中淡色（`stroke-opacity: 0.3`），選中深色（`stroke-opacity: 0.65`，accent 色）
- 選中章節 → 所有 Chunk：從選中章節右側拉出 accent 色曲線

各欄獨立上下捲動。欄 3 預設空白，點開章節後填入。

#### 欄 1 — 書籍總覽

- 書籍封面佔位圖
- 書名（serif）、作者、status badge
- 書籍摘要（從後端取得）
- 關鍵數字：章節數、Chunk 數、實體數、關係數（2x2 stat grid）
- 實體分佈：4 種類型各自的 pill + 數量

#### 欄 2 — 章節列表

- 章節列表，每個章節一個 card
- 章節 card 包含：章節名、chunks 數、實體數、主要實體 pill
- 點擊章節 → 展開：顯示章節摘要 + 主要實體 pill + 「查看內容 →」按鈕
- 選中章節：accent 邊框 + 右側 accent bar，曲線加深
- 點擊「查看內容 →」或點擊選中章節 → 欄 3 載入該章節 chunks

#### 欄 3 — Chunk 內容

- 每個 chunk 一個白色 card（坐落在暖白底上）
- card 包含：chunk 編號、實體高亮正文（serif）、實體 pill
- 實體高亮使用 `<mark>` inline，樣式見 `FRONTEND_DEV_GUIDE.md`
- 欄 3 標題列固定顯示：章節名 + chunk 總數

#### 狀態流程

```
進入頁面
  → 載入書籍資料（GET /books/:bookId，見 API_CONTRACT #3）
  → 載入章節列表（GET /books/:bookId/chapters，見 API_CONTRACT #4）
  → 欄 1、欄 2 填入，欄 3 空白

點擊章節
  → 章節 card 展開，曲線加深
  → 若點擊「查看內容」：
    → 載入 chunks（GET /books/:bookId/chapters/:chapterId/chunks，見 API_CONTRACT #5）
    → 欄 3 填入 chunk cards
    → 曲線從章節拉出連到 chunks

loading 狀態
  → 欄 3 顯示 skeleton cards

error 狀態
  → 欄 3 顯示錯誤提示 + 重試按鈕
```

#### 未來優化備註

> 當欄 3 展開後，可考慮將欄 1 縮成 icon-only 薄欄（40px），釋放橫向空間，類似 VS Code sidebar 收合邏輯。

#### API

- `GET /books/:bookId`（見 API_CONTRACT #3）
- `GET /books/:bookId/chapters`（見 API_CONTRACT #4）
- `GET /books/:bookId/chapters/:chapterId/chunks`（見 API_CONTRACT #5）

---

### 3.4 深度分析頁 `/books/:bookId/analysis`

#### 版面結構

```
[Left Sidebar] [Left Panel: 角色/事件清單] [Content Area: 分析內容]
```

#### Left Panel — 清單區

固定寬度，包含（由上至下，固定不捲動）：

1. **Sub tab**：角色分析 / 事件分析
2. **框架選擇**（角色分析 tab 下）：Jung 12 / Schmidt 45 + 「框架索引 ↗」連結
3. **批次操作列**（事件分析 tab 下）：「一鍵生成全部 EEP」按鈕 + 進度顯示（見下方說明）
4. **搜尋欄**：即時篩選清單，顯示當前總數
5. **清單**（可捲動）：分「已分析」/ 「尚未分析」兩組

清單 item 格式：
- 已分析：彩色頭像（取名字首字）+ 名稱 + 原型類型 + 章節數 + 綠色狀態點
- 未分析：灰色頭像 + 名稱（淡色）+ 「尚未分析」+ 「建立」按鈕 + 灰色狀態點

#### Content Area — 分析內容

標題列（固定）：
- 角色名（serif 大字）
- 框架 badge
- 「在圖譜中查看 ↗」連結 → navigate to `/books/:bookId/graph`，定位該節點
- 「覆蓋重新生成」按鈕（需確認視窗，說明 token 消耗）

內容（可捲動）：
- 每個分析維度一個 accordion card
- 預設展開前兩個，其餘收合
- 卡片結構：色點 + 標題 + 副標題（框架維度說明）+ 內容文字

**角色分析維度（Jung）**：
1. 原型定位（顯示對應原型 tag）
2. 心理結構（自我、陰影、阿尼瑪斯）
3. 角色弧線（轉化歷程與關鍵節點）
4. 關係動力（與其他角色的原型互動）

**事件分析維度**：依敘事理論框架，對接後端後確認維度名稱。

#### 批次事件分析（事件分析 tab）

事件分析 tab 的 Left Panel 頂部顯示批次操作區塊：

```
┌─────────────────────────────────┐
│  事件分析  12/30 已完成          │
│  ████████░░░░░░░  40%           │
│                                 │
│  [一鍵生成全部 EEP]              │
│  已分析的事件會自動跳過           │
└─────────────────────────────────┘
```

**按鈕狀態**：

| 狀態 | 顯示 |
|------|------|
| 可執行 | 「一鍵生成全部 EEP」（primary 樣式） |
| 全部已分析 | 「全部事件已分析 ✓」（disabled，灰色） |
| 執行中 | spinner + "分析中 15/30…" + 進度條 |

**確認視窗**：
- 標題：「批次生成事件 EEP」
- 內容：「將對 {N} 個尚未分析的事件執行深度分析，已分析的事件會自動跳過。此操作將消耗大量 token。」
- 按鈕：「取消」/「確認執行」

**執行中更新**：
- polling `GET /tasks/:taskId/status` — result 中含 `progress`, `total`, `failed`, `skipped`
- 進度條即時更新
- 每完成一個事件，清單中對應 item 從「尚未分析」移至「已分析」
- 完成後顯示摘要：「完成！已分析 {N} 個事件，跳過 {M} 個，失敗 {F} 個」

#### 狀態流程

```
進入頁面
  → 載入角色清單（GET /books/:bookId/analysis/characters，見 API_CONTRACT #6a）
  → 預設選中第一個已分析角色
  → 載入該角色分析（GET /books/:bookId/entities/:entityId/analysis，見 API_CONTRACT #7a）

切換角色
  → 點擊清單 item → 載入對應分析內容
  → loading：content area 顯示 skeleton

切換框架（Jung ↔ Schmidt）
  → 重新載入當前角色的對應框架分析

點擊「建立」（未分析角色）
  → 顯示確認視窗：說明將消耗 token，確認後繼續
  → 確認 → POST /books/:bookId/entities/:entityId/analyze（見 API_CONTRACT #7b）
  → polling 進度（見 API_CONTRACT #8）
  → 生成中：清單 item 顯示 loading 狀態，content area 顯示進度
  → 完成：填入分析內容，狀態點變綠

點擊「覆蓋重新生成」
  → 顯示確認視窗（說明將覆蓋現有結果 + token 消耗）
  → 確認 → DELETE + POST（見 API_CONTRACT #7c、#7b）
  → 同上 polling 流程

點擊「一鍵生成全部 EEP」（事件分析 tab）
  → 顯示確認視窗（token 消耗提示 + 跳過已分析說明）
  → 確認 → POST /books/:bookId/events/analyze-all
  → polling GET /tasks/:taskId/status（每 3 秒）
  → 進度條更新 + 清單即時反映已完成項目
  → 完成後顯示摘要 toast
```

#### API

- `GET /books/:bookId/analysis/characters`（見 API_CONTRACT #6a）
- `GET /books/:bookId/analysis/events`（見 API_CONTRACT #6b）
- `GET /books/:bookId/entities/:entityId/analysis`（見 API_CONTRACT #7a）
- `POST /books/:bookId/entities/:entityId/analyze`（見 API_CONTRACT #7b）
- `DELETE /books/:bookId/entities/:entityId/analysis`（見 API_CONTRACT #7c）
- `GET /tasks/:taskId/status`（見 API_CONTRACT #8）

---

### 3.5 知識圖譜頁 `/books/:bookId/graph`

#### 版面結構

最多三層，第三層切換時替換：

```
[Left Sidebar] [圖譜區] [詳情面板] [第三層面板（擇一）]
                壓縮      固定寬        深度分析全文
                          200px     或  Chunk 段落列表
```

#### 圖譜區

- Cytoscape.js 渲染，force-directed layout
- 浮動工具欄（左上角，不影響圖譜操作）：
  - 搜尋欄（即時高亮命中節點）
  - 類型 filter checkbox（角色 / 地點 / 概念 / 事件）
  - 重置視圖按鈕
- 左下角縮放控制（+ / −）
- 右下角統計（節點數、關係數）

節點樣式：
```
節點大小：根據 chunkCount，20px – 60px
節點顏色：
  character → 藍 #dbeafe / #3b82f6
  location  → 綠 #dcfce7 / #22c55e
  concept   → 紫 #ede9fe / #8b5cf6
  event     → 紅 #fee2e2 / #ef4444

選中節點：accent 色邊框（#8b5e3c），2px
選中節點連出的 edge：accent 色加深，其餘 edge 淡色
```

#### 詳情面板（深色 surface）

點擊節點後展開，包含（accordion）：

1. **實體資訊**（預設展開）：名稱、類型 pill、描述文字
2. **深度分析**（預設展開）：
   - 未生成：說明文字 + token 提示 + 「生成深度分析 →」按鈕
   - 生成中：進度狀態
   - 已生成：分析文字 + 「清除並重新生成」按鈕
3. **相關段落**（預設收合）：顯示 chunk 總數，點擊 → 推出第三層

#### 第三層 — 段落面板

點擊「相關段落」後，圖譜區往左壓縮，推出段落面板：

頂部（固定）：
- 標題：「[實體名] — 相關段落」
- 章節 filter chip（全部 + 各章節）
- 排序 select（章節順序 / 出現頻率）

內容（可捲動）：
- 每個 chunk 一張 card，顯示：來源章節名、chunk 編號、實體高亮正文、實體 pill
- 底部提示：「顯示 N / 總數 個段落 · 選擇章節以縮小範圍」

#### 第三層 — 深度分析面板（未來）

> 備註：若深度分析內容較長，未來可考慮從詳情面板往右推出第三層全文面板，與段落面板同邏輯替換。目前實作先在詳情面板內顯示。

#### 狀態流程

```
進入頁面
  → 載入圖譜資料（GET /books/:bookId/graph，見 API_CONTRACT #9）
  → Cytoscape 渲染節點與 edge
  → 詳情面板空白

點擊節點
  → 載入實體資訊（從圖譜資料取，不需額外 API）
  → 載入實體分析（GET /books/:bookId/entities/:entityId/analysis，見 API_CONTRACT #7a）
    → 404 → 顯示未生成狀態
    → 200 → 顯示分析內容
  → 詳情面板展開

點擊「生成深度分析」
  → 確認視窗（token 消耗 + 說明結果同步至深度分析頁）
  → 確認 → POST /books/:bookId/entities/:entityId/analyze（見 API_CONTRACT #7b）
  → polling → 生成中狀態 → 完成後填入內容

點擊「相關段落」
  → 圖譜區壓縮，推出段落面板
  → 載入 chunks（從既有圖譜資料篩選，或呼叫 API）
  → 切換章節 filter → 即時過濾

點擊其他節點（段落面板開啟中）
  → 更新詳情面板內容
  → 段落面板同步更新為新節點的段落
```

#### API

- `GET /books/:bookId/graph`（見 API_CONTRACT #9）
- `GET /books/:bookId/entities/:entityId/analysis`（見 API_CONTRACT #7a）
- `POST /books/:bookId/entities/:entityId/analyze`（見 API_CONTRACT #7b）
- `DELETE /books/:bookId/entities/:entityId/analysis`（見 API_CONTRACT #7c）
- `GET /tasks/:taskId/status`（見 API_CONTRACT #8）

---

### 3.6 框架索引頁 `/frameworks`

#### 版面結構

全站層級，不屬於任何書籍。三層閱讀結構：

```
[Left Sidebar] [框架列表] [TOC] [文件內容]
                 固定寬    固定寬   flex 剩餘
                 200px     180px
```

#### 框架列表

依分析類別分組：

```
角色分析
  ├─ Jung 原型（12 個原型）
  └─ Schmidt 類型（45 個類型）

事件分析
  └─ 敘事理論

未來框架
  └─ （佔位，持續擴充）
```

每個框架 item：色點 + 名稱 + 子標題 + 數量 badge

#### TOC（目錄）

- 選中框架後，TOC 顯示該框架的章節目錄
- 固定在左側，不隨內容捲動
- 點擊 TOC item → 內容區定位到對應原型

#### 文件內容

- 頂部：框架名（serif）、框架類別 badge、右上角「全站參考文件，不屬於特定書籍」說明
- 框架介紹段落
- 每個原型 / 類型一個區塊：
  - 編號圓圈 + 名稱（中文）+ 英文名
  - 卡片內容：核心驅力、說明文字、關鍵字 tag

#### 從深度分析頁跳入

從深度分析頁點擊「框架索引 ↗」時，攜帶 query param 定位到對應框架：

```
/frameworks?framework=jung     → 自動選中 Jung 原型
/frameworks?framework=schmidt  → 自動選中 Schmidt 類型
```

#### 狀態流程

```
進入頁面
  → 預設選中第一個框架（Jung 原型）
  → 載入框架內容（靜態 / CMS，待後端確認）
  → TOC 填入，內容區渲染

攜帶 query param 進入
  → 解析 framework param
  → 自動選中對應框架，定位 TOC 與內容

點擊 TOC item
  → 內容區 smooth scroll 到對應區塊
```

---

### 3.7 時間軸頁 `/books/:bookId/timeline`

> 後端設計見 [`docs/guides/PHASE_9_TEMPORAL_TIMELINE.md`](guides/PHASE_9_TEMPORAL_TIMELINE.md)

#### 版面結構

三區塊：工具列 + 時間軸主區 + 右側事件詳情面板（點擊展開）。

```
[Left Sidebar] [Toolbar]  [時間軸主區]                    [事件詳情面板]
                固定頂部    flex 剩餘空間                    固定寬 320px
                                                           點擊事件後展開
```

#### 3.7.1 頂部工具列（固定）

水平排列，左右分組：

```
左側:
  [🔀 章節順序 ▾ / 故事時序 ▾ / 矩陣視圖 ▾]  ← 三選一 select，預設「章節順序」
  [⇄ 水平 / ↕ 垂直]                          ← layout 方向切換（矩陣模式下隱藏）

中央:
  [品質指示器]                                ← 顯示 EEP 覆蓋率 + 時序計算狀態

右側:
  [Filter ▾]                                 ← 點擊展開 filter dropdown
  [重新計算時序]                               ← 觸發 POST /timeline/compute
```

**三種視圖模式**：

| 值 | API 參數 | 說明 |
|----|---------|------|
| 章節順序（預設） | `order=narrative` | 事件按 `chapter` 排列，時間軸模式 |
| 故事時序 | `order=chronological` | 事件按 `chronological_rank` 排列，時間軸模式 |
| 矩陣視圖 | 同 `order=narrative` | 散點圖，X 軸=敘事順序，Y 軸=故事時序（見 3.7.7） |

- 若 `chronological_rank` 全為 null（Pipeline 未跑），故事時序 / 矩陣視圖選項旁顯示 ⚠️ badge + tooltip「尚未計算時序，請先觸發時序計算」
- 切換時，事件節點以動畫重新排列（建議 300ms ease）

**品質指示器**（讀取 API response 中的 `quality` 欄位）：

```
格式：
  ■■■□□  12/30 事件已分析 (40%)  ·  時序已計算
  ■□□□□   3/30 事件已分析 (10%)  ·  時序未計算

  進度條 = quality.eepCoverage（5 格，每格 20%）
  「時序已計算」/「時序未計算」= quality.hasChronologicalRanks

tooltip 提示：
  "分析更多事件可提升時序計算品質。前往深度分析頁 → 事件分析一鍵生成全部 EEP。"
```

- 點擊品質指示器文字 → navigate to `/books/:bookId/analysis`（事件分析 tab）

**Layout 方向切換**：

| 模式 | 說明 |
|------|------|
| 水平（預設） | 時間軸左→右，事件節點沿水平軸排列，可水平捲動 |
| 垂直 | 時間軸上→下，事件節點沿垂直軸排列，可垂直捲動 |

右側事件詳情面板**位置固定在右側**，不隨 layout 方向改變，以降低認知成本。
- 垂直模式：主區寬度縮窄，右側詳情面板固定 320px
- 視窗寬度 < 900px：面板改為 overlay 模式（浮在主區上方），不壓縮主區

#### 3.7.2 時間軸主區

**主軸：事件節點**

事件沿時間軸依序排列，每個事件為一個可點擊的節點：

```
節點樣式：
  圓形，直徑依 event_importance 縮放：
    KERNEL  → 48px
    SATELLITE → 32px
    未分類   → 36px

  節點底色：narrative_mode 對應色（空心圓 + 邊框，bg 填極淡底色）
    present      → border: #8b5e3c，bg: #f5ede4
    flashback    → border: #3b82f6，bg: #dbeafe
    flashforward → border: #f59e0b，bg: #fef3c7
    parallel     → border: #8b5cf6，bg: #ede9fe
    unknown      → border: #8a7a68，bg: #f0ece6

  注意：event_importance（KERNEL / SATELLITE）以大小承載，不做顏色雙重編碼。

  節點內容：
    上方 — participant pill（預設 opacity: 0.25，見下方說明）
    下方 — 事件標題（最多 2 行，超出截斷）
    標題下方 — 章節標記 "Ch.3"（小字，--fg-muted）

  narrative_mode 標記（節點左上角小 badge）：
    present     → 不顯示
    flashback   → ⏪ 半透明 badge
    flashforward → ⏩ 半透明 badge
    parallel    → ⏸ 半透明 badge
    unknown     → 灰色 ? badge
```

**事件間連線**

故事時序模式下採**雙層連線**，呈現不同確定度：

**底層 — 順序線（位置推斷）**

- 連接所有相鄰事件（依 `chronological_rank` 排序）
- 樣式：`--fg-muted`，`stroke-width: 1px`，`dasharray: 3,4`，`opacity: 0.25`
- 意義：pipeline 估算的時序位置，無具體文本證據支持

**上層 — TemporalRelation 邊（文本證據）**

- 僅顯示有具體文本證據的前後 / 因果關係，依 confidence 決定樣式：

| confidence | 樣式 |
|-----------|------|
| ≥ 0.8 | 實線，`stroke-width: 2px`，`opacity: 0.6` |
| 0.5 ~ 0.8 | 虛線 `dasharray: 4,3`，`opacity: 0.4` |
| < 0.5 | 不顯示 |

- `relation_type = causes` 的邊使用 accent 色（`#8b5e3c`）+ 箭頭，與普通 BEFORE 邊區分

**章節順序模式**

- 不顯示 TemporalRelation 邊
- 改以順序箭頭（`--fg-secondary`，`stroke-width: 2px`，`opacity: 0.7`）連接所有相鄰事件，表示敘事閱讀順序

**parallel 事件群組**

`narrativeMode === 'parallel'` 的**連續事件**收為一個群組，與主序列並排顯示：

- 水平 layout：群組內事件縱向排列（flex-col），佔用一個水平「時間槽」
- 垂直 layout：群組內事件橫向並排（flex-row），佔用一個垂直「時間槽」
- 群組外框：`rgba(139,92,246,0.06)` 底色 + 紫色虛線邊框，視覺上標示「同時發生」
- 群組內間距：40px（小於主序列 80px，區分兩層間距）
- 非連續的 parallel 事件各自獨立，不合併

**散開的角色 / 地點 pill（次要元素）**

每個事件節點旁邊散開顯示其 `participants` 與 `location_id` 的 pill：

```
預設狀態：
  pill 樣式同 1.4 實體 Pill，但 opacity: 0.25，不可點擊
  位於事件節點上方（水平 layout）或左側（垂直 layout）

事件被點擊/hover 後：
  該事件相關的 pill → opacity: 1.0，transition: 200ms
  其他事件的 pill → 維持 opacity: 0.25

同一角色出現在多個事件：
  相同角色的 pill 之間繪製淡色連線（opacity: 0.15），
  角色被高亮時連線加深至 0.5，形成「角色弧線」視覺效果
```

**chapter 分組指示器**

- 章節與章節之間以分隔線 + 標題強化分群感（取代斑馬紋底色帶）
- 章節標題：`--fg-secondary`，`13px`，左側 2px accent 色豎線作為視覺錨點
- 底色帶可保留但設極低對比（`opacity: 0.3`），不作為主要分群視覺
- 章節間距 > 章節內事件間距（見「節點間距」說明）
- 故事時序模式下，分組帶與章節標題消失（排序打亂章節邊界）
- Sticky 章節 header（捲動時固定頂部）列為後續優化，短期不實作

**節點間距**

- 章節內事件間距：`80px`（固定值）
- 章節間間距：`140px`，強化分群視覺
- 故事時序模式下，目前維持等距；待後端提供時間資訊後，可考慮依 `chronological_rank` 差值動態計算

#### 3.7.3 Filter Dropdown

點擊工具列右側 Filter 按鈕展開，多選 checkbox 組：

```
Filter 分組：
  ┌─────────────────────────────┐
  │ 事件類型                      │
  │  ☑ 全部                      │
  │  ☑ action   ☑ dialogue       │
  │  ☑ decision ☑ revelation     │
  │  ☑ turning_point ...         │
  │                              │
  │ 敘事模式                      │
  │  ☑ 全部                      │
  │  ☑ present ☑ flashback       │
  │  ☑ flashforward ☑ parallel   │
  │                              │
  │ 角色（搜尋 + 多選）            │
  │  🔍 搜尋角色...               │
  │  ☑ 葉文潔  ☑ 羅輯            │
  │  ☐ 章北海  ...               │
  │                              │
  │ 地點                          │
  │  ☑ 全部                      │
  │  ☑ 紅岸基地 ☑ 聯合國 ...      │
  │                              │
  │ 重要性                        │
  │  ☑ KERNEL  ☑ SATELLITE       │
  │                              │
  │         [重置] [套用]         │
  └─────────────────────────────┘
```

Filter 生效後：
- 不符合條件的事件節點 `opacity: 0.1`，不可點擊
- 工具列 Filter 按鈕顯示 active 數量 badge（如 `Filter (3)`）
- 角色 filter 選中時，該角色的 pill 跨事件連線持續高亮

#### 3.7.4 事件詳情面板（右側，深色 surface）

點擊事件節點後從右側滑入，寬度 320px。

**面板標題列**

```
事件名稱（serif）              [✕ 關閉]
Ch.3 · flashback · KERNEL
```

**面板內容（可捲動，accordion 結構）**

```
1. 事件概要（預設展開）
   ├─ 事件描述（event.description）
   ├─ story_time_hint（如有）："三年前"
   ├─ 參與者 pill 列表
   └─ 地點 pill

2. 時序關係（預設展開）
   ├─ 前驅事件（prior_event_ids → 顯示事件名，可點擊跳轉）
   ├─ 後續事件（subsequent_event_ids → 同上）
   └─ chronological_rank 顯示："時序位置 0.35 / 1.0"

3. 證據剖析 — EEP（預設收合，展開後顯示完整 EEP）
   ├─ 狀態前（state_before）
   ├─ 狀態後（state_after）
   ├─ 因果因素（causal_factors 列表）
   ├─ 結構角色（structural_role）
   ├─ 重要性（event_importance badge）
   ├─ 主題意義（thematic_significance）
   └─ 文本證據（text_evidence 列表，每條可展開原文）

4. 因果分析（預設收合，有 CausalityAnalysis 時顯示）
   ├─ 根本原因（root_cause）
   ├─ 因果鏈（causal_chain 列表）
   └─ 因果摘要（chain_summary）

5. 影響分析（預設收合，有 ImpactAnalysis 時顯示）
   ├─ 受影響角色（affected_participant_ids → pill）
   ├─ 關係變化（relation_changes 列表）
   └─ 影響摘要（impact_summary）
```

**面板狀態處理**

| 情境 | 行為 |
|------|------|
| 事件有 EEP（已跑 analysis） | 完整顯示所有 accordion 區塊 |
| 事件無 EEP | Section 3/4/5 顯示「尚未執行深度分析」+ 引導至深度分析頁 |
| 點擊前驅/後續事件名 | 時間軸 scroll 到該事件 + 選中 + 面板更新 |

#### 3.7.5 狀態流程

```
進入頁面
  → 載入時間軸資料（GET /books/:bookId/timeline?order=narrative）
  → 渲染事件節點 + 章節分組帶
  → 右側面板空白

切換至「故事時序」
  → 重新載入（GET /books/:bookId/timeline?order=chronological）
  → 動畫重新排列事件節點
  → 顯示 temporal_relations 連線
  → 章節分組帶消失

chronological_rank = null（Pipeline 未執行）
  → 故事時序 / 矩陣選項旁顯示 ⚠️
  → 「重新計算時序」按鈕可用
  → 點擊 → 確認視窗（說明 token 消耗 + 品質提示）
    → 確認 → POST /books/:bookId/timeline/compute
    → polling GET /tasks/:taskId/status
    → 計算中：按鈕變為 spinner + "計算中…"
    → 完成：自動重新載入，品質指示器更新

切換至「矩陣視圖」
  → 主區替換為散點圖（見 3.7.7）
  → layout 方向切換隱藏（矩陣固定為 2D）
  → 右側面板仍可使用（點擊散點展開）

點擊事件節點
  → 該事件 pill 高亮（opacity: 1.0）
  → 右側面板滑入
  → 載入事件 EEP（GET /books/:bookId/events/:eventId/analysis）
    → 404 → 顯示「尚未分析」
    → 200 → 填入面板內容

切換 layout 方向
  → 事件軸旋轉 90°，動畫過渡
  → pill 位置重新計算
  → 面板位置不變（始終右側）

套用 filter
  → 不符條件的節點淡化
  → 連線僅顯示可見事件之間的
  → 角色 filter 時，選中角色的跨事件連線高亮
```

#### 3.7.6 API

- `GET /books/:bookId/timeline`（`order`, `event_type` 參數）
- `POST /books/:bookId/timeline/compute`
- `GET /books/:bookId/events/:eventId/analysis`（複用深度分析 API）
- `GET /tasks/:taskId/status`（見 API_CONTRACT #8）

#### 3.7.7 矩陣視圖（Fabula-Sjuzhet Matrix）

選擇「矩陣視圖」時，主區替換為二維散點圖。

**軸線定義**

```
X 軸（→）= 敘事順序（Sjuzhet）
  刻度 = chapter 順序，等距分佈
  標籤 = "Ch.1", "Ch.2", ...

Y 軸（↑）= 故事時序（Fabula）
  刻度 = chronological_rank（0.0 → 1.0）
  標籤 = "故事起點" ... "故事終點"
```

**散點樣式**

```
每個事件 = 一個圓點
  位置：(chapter, chronological_rank)
  大小：同時間軸模式，依 event_importance 縮放
  顏色：依 narrative_mode 區分
    present      → 主色（accent #8b5e3c）
    flashback    → 藍 #3b82f6
    flashforward → 橘 #f59e0b
    parallel     → 紫 #8b5cf6
    unknown      → 灰 #8a7a68

  hover → tooltip 顯示事件標題 + 章節 + 時序位置
  click → 右側面板展開（同 3.7.4）
```

**對角線參考線**

- 繪製一條 45° 淡色虛線（左下→右上），代表「敘事順序 = 故事時序」
- 落在對角線上的事件 = 線性敘事（按時間順序講述）
- 偏離對角線的事件 = 非線性敘事：
  - 對角線上方 = 事件在故事世界中較晚發生，但較早被講述（預敘）
  - 對角線下方 = 事件在故事世界中較早發生，但較晚被講述（倒敘）

**互動**

- 框選（drag to select）多個散點 → 高亮選中事件 + 右側顯示選中列表
- Filter 同樣生效（不符條件的散點淡化）
- 角色 pill 不在矩陣中顯示（空間不足），改為 hover tooltip 帶出

**降級狀態**

- `chronological_rank = null` 的事件無法定位 Y 軸 → 統一放在 Y = -0.1 位置，以灰色半透明顯示，附提示「時序未計算」

#### 3.7.8 未來擴充備註

- **因果鏈聚焦模式**：工具列增加「僅顯示因果鏈」toggle，只保留 `relation_type = causes` 的邊與相關事件，呈現因果樹
- **角色弧線模式**：選定角色後，僅顯示該角色參與的事件，以 chronological_rank 排列，形成該角色的成長/衰落時間線
- **主題時序分佈**：選定主題標籤後，顯示相關事件在故事時序軸上的分佈密度

---

## 4. 跨頁面互動與資料連動

### 4.1 頁面跳轉對照表

| 來源 | 觸發 | 目的地 |
|------|------|--------|
| 首頁書庫 | 點擊書籍卡片 | `/books/:bookId` |
| 首頁最近開啟 | 點擊「知識圖譜」 | `/books/:bookId/graph` |
| 首頁最近開啟 | 點擊「深度分析」 | `/books/:bookId/analysis` |
| 上傳完成列表 | 點擊「進入書籍」 | `/books/:bookId` |
| 深度分析頁 | 點擊「在圖譜中查看 ↗」 | `/books/:bookId/graph`（定位節點） |
| 深度分析頁 | 點擊「框架索引 ↗」 | `/frameworks?framework=jung` |
| 知識圖譜頁 | （未來）點擊段落 | `/books/:bookId`（定位 chunk） |
| 時間軸頁 | 點擊事件面板「前驅/後續事件」 | 同頁 scroll + 選中 |
| 時間軸頁 | 點擊「尚未分析」引導連結 | `/books/:bookId/analysis`（定位該事件） |
| 首頁最近開啟 | 點擊「時間軸」（status=analyzed） | `/books/:bookId/timeline` |

### 4.2 深度分析資料連動

知識圖譜頁觸發的實體深度分析結果，與深度分析頁顯示的內容來自**同一份資料**。

- 圖譜頁：從單一實體出發觸發生成
- 深度分析頁：彙總顯示所有實體的生成結果

確認視窗中需明確說明：「生成結果將同步至深度分析頁」。

### 4.3 Token 消耗提示規則

以下操作前均需顯示確認視窗：

| 操作 | 確認視窗說明 |
|------|------------|
| 首次觸發實體深度分析 | 此操作將消耗 token，生成後可在深度分析頁查看 |
| 覆蓋重新生成（實體） | 此操作將覆蓋現有結果並消耗 token |
| 觸發整本書深度分析 | 此操作將消耗大量 token，請確認後執行 |
| 一鍵生成全部事件 EEP | 將對 N 個尚未分析的事件執行深度分析，已分析的自動跳過，消耗大量 token |
| 觸發時序計算 | 此操作將消耗 token，計算事件的故事世界時序排列 |

---

## 5. 未來備註

以下功能已討論但不在本階段開發範圍：

1. **Dark mode**：CSS token 已預留（`[data-theme="dark"]`），UI 邏輯暫不實作。實作時注意知識圖譜節點顏色需對應調整（飽和度降低、亮度提升）。

2. **閱讀頁欄 1 收合**：當欄 3 展開後，欄 1 可縮成 40px icon-only 欄，釋放橫向空間。參考 VS Code sidebar 收合邏輯。

3. **框架索引反查角色**：框架索引頁未來可加入「書中對應此原型的角色」動態連結，讓使用者從原型反查角色。需配合書籍層級資料對接，框架索引從靜態文件升級為活的索引。

4. **全站搜尋**：sidebar 搜尋 icon 為未來功能佔位，跨書籍搜尋實體、段落。

5. **知識圖譜 → 閱讀頁定位**：從圖譜頁段落面板點擊 chunk，跳轉至閱讀頁並定位到對應 chunk 位置。

6. **深度分析第三層面板**：若深度分析全文內容較長，可從詳情面板往右推出第三層，與段落面板同邏輯替換。
