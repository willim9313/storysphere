# StorySphere — UI 規格文件 (UI_SPEC)

> 本文件為前端開發的頁面規格參考，供 Claude Code 開發時使用。
> API 對接細節未來將整理至 `API_CONTRACT.md`（尚未建立）。
> 術語定義見 `docs/domain-glossary.md`。

---

## 1. 設計系統

### 1.1 風格定位

**暖色調分析工具風格**：暖白底貫穿所有層次，serif 正文，有溫度的卡片。

- 主閱讀 / 內容區：暖白底（`--bg-primary`）、serif 正文
- 工具面板、詳情面板：同樣暖白底（`--bg-primary`），以邊框與背景層次感區隔
- 實體標籤：帶色點 pill 形式（非純色塊）

參考產品感：Notion + Linear 混合，有設計感但不失工具效率。

### 1.2 CSS Token

完整 token 定義與主題對照見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md)。關鍵 token 名稱參考如下（值見 DESIGN_TOKENS）：

`--bg-primary`、`--bg-secondary`、`--bg-tertiary`、`--fg-primary`、`--fg-secondary`、`--fg-muted`、`--border`、`--accent`、`--panel-bg`、`--panel-fg`

### 1.3 字體

```css
font-family: 'Libre Baskerville', Georgia, serif;   /* 正文內容 */
font-family: 'Noto Sans TC', sans-serif;             /* 中文 UI */
font-family: 'DM Sans', system-ui, sans-serif;       /* UI 元素 */
```

### 1.4 實體 Pill 樣式（帶色點）

色碼定義見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) — 實體 Pill 章節。

```tsx
<span className="pill pill-char">
  <span className="pill-dot" />
  葉文潔
</span>

// CSS 結構（色碼值見 DESIGN_TOKENS）
.pill { display: inline-flex; align-items: center; gap: 3px; font-size: var(--font-size-2xs); padding: 2px 7px; border-radius: 20px; }
.pill-dot { width: 5px; height: 5px; border-radius: 50%; }
// .pill-char / .pill-loc / .pill-con / .pill-evt — background / border / color / dot 色碼見 DESIGN_TOKENS.md
```

**Pill 用於清單 / chips**（頂部實體列表、章節卡實體、全書實體分佈）。**閱讀正文的行內實體標註**（`SegmentRenderer`）另用 `.entity-mark`：閱讀時預設只有一條該類型色的細底線（不搶字流），hover 才浮出淡色塊；文字沿用正文色以維持可讀性。色值同樣取自 DESIGN_TOKENS 的 `--entity-{type}-bg/border/dot`。

---

## 2. 導航架構

### 2.1 全站層級（左側 Sidebar）

固定在所有頁面左側，預設寬度 48px、icon-only（label 以原生 tooltip 提示）；頂部有釘選按鈕可展開為 180px（icon + 中文標籤，主內容區自動變窄），展開狀態記於 localStorage（`sidebar-expanded`）。底部有語言切換按鈕（Globe icon）。

| Icon | 目的地 | 路由 | 狀態 |
|------|--------|------|------|
| Home | 書庫首頁 | `/` | 已實作 |
| Upload | 上傳 & 處理進度 | `/upload` | 已實作 |
| BookOpen | 方法論 | `/methodology` | 已實作（前身 `/frameworks`） |
| Search | 全站搜尋 | — | 佔位（disabled） |
| BarChart3 | Token 用量 | `/token-usage` | 已實作 |
| Settings | 設定 | `/settings` | 已實作 |
| Globe（底部）| 語言切換（zh-TW ↔ EN） | — | 已實作 |

### 2.2 書籍層級（Top Nav Tab）

進入特定書籍後，top nav 顯示書名、「← 書庫」返回入口，以及 8 個 tab（窄螢幕時分頁列可橫向滑動、書名以 `min(200px, 30vw)` 自動縮短，避免擠壓分頁）：

| Tab | 路由 |
|-----|------|
| 閱讀 | `/books/:bookId` |
| 角色分析 | `/books/:bookId/characters` |
| 事件分析 | `/books/:bookId/events` |
| 知識圖譜 | `/books/:bookId/graph` |
| 時間軸 | `/books/:bookId/timeline` |
| 張力分析 | `/books/:bookId/tension` |
| 象徵意象 | `/books/:bookId/symbols` |
| 敘事結構 | `/books/:bookId/narrative` |
| 建構概覽 | `/books/:bookId/unraveling` |

### 2.3 頁面層級關係

```
全站 Sidebar
  ├─ 首頁              /
  ├─ 上傳 & 處理進度   /upload
  ├─ 方法論            /methodology
  ├─ Token 用量        /token-usage
  ├─ 設定              /settings
  └─ [書籍空間]        /books/:bookId
       ├─ 閱讀          /books/:bookId
       ├─ 角色分析      /books/:bookId/characters
       ├─ 事件分析      /books/:bookId/events
       ├─ 知識圖譜      /books/:bookId/graph
       ├─ 時間軸        /books/:bookId/timeline
       ├─ 張力分析      /books/:bookId/tension
       ├─ 象徵意象      /books/:bookId/symbols
       ├─ 敘事結構      /books/:bookId/narrative
       └─ 建構概覽      /books/:bookId/unraveling
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

> **待實作**：前端 conditional render 已存在（依 `lastOpenedAt` 篩選前 3 本），但後端目前未追蹤此欄位，section 永遠不會出現。需後端在用戶開啟書籍時寫入 `lastOpenedAt` 才會啟用。

- 顯示最近開啟的前 3 本書（依 `lastOpenedAt` 降序）
- 每張卡片頂部有 3px accent bar
- 依書籍 `status` 顯示不同快捷入口：

| status | 快捷入口 |
|--------|---------|
| `analyzed` | 繼續閱讀、知識圖譜、角色分析 |
| `ready` | 開始閱讀、觸發分析 |
| `processing` | 查看處理進度 |
| `error` | 查看錯誤 |

#### 書庫區塊

- 卡片 grid，`repeat(auto-fill, minmax(180px, 1fr))`
- 每張卡片：書名、作者、status badge、章節數、實體數、最後開啟時間（**待實作**：同 lastOpenedAt，後端未寫入，目前不顯示）
- 頂部 filter chip：全部 / 已分析 / 已就緒 / 處理中
- 最後一格為「上傳新書」入口卡（dashed border）
- 處理中的書顯示 2px 進度條 + 階段文字（取代一般卡片內容）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#1（書庫列表）、#2-b（刪除書籍）

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
- 狀態：`idle` / `dragging` / `uploading` / `error`

#### 處理中卡片

步驟 timeline（垂直，5 個步驟）：PDF 解析 → 章節切分 → Chunk 處理與實體識別 → 知識圖譜建構 → 摘要生成

步驟狀態：`done` 綠圈 ✓ / `running` 黃圈 + 進度條 / `pending` 灰圈（數字）/ `error` 紅圈 ✕ + 重試按鈕

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#2（上傳 PDF）、#8（任務 polling）

---

### 3.3 閱讀頁 `/books/:bookId`

#### 版面結構

三欄節點展開，橫向可捲動：

```
[Left Sidebar] [欄1: 書籍總覽 200px] [欄2: 章節列表 220px] [欄3: Chunk 內容 flex]
```

欄之間用 **Bezier 曲線**連接（未選中淡色 `opacity: 0.3`，選中 accent 色 `opacity: 0.65`）。

窄螢幕（≤768px）降級：進頁自動折疊欄 1、欄 2（各縮成 36px icon 條），正文最大化；使用者可點展開鈕手動推擠展開，Bezier 連線隱藏。

#### 欄 1 — 書籍總覽

書籍封面佔位圖、書名（serif）、作者、status badge、書籍摘要、關鍵數字（章節/Chunk/實體/關係數）、實體分佈 pill。

#### 欄 2 — 章節列表

每章一卡，點擊即展開並同時載入欄 3 chunks：展開後顯示章節摘要 + keywords + 主要實體 pill。選中章節有 accent 邊框 + 左側 accent bar。

#### 欄 3 — Chunk 內容

每個 chunk 一個白色 card，含 chunk 編號、實體標註正文（serif，行內標註預設細底線、hover 才浮色塊，見 §1.4）、實體 pill。欄 3 標題列固定顯示章節名 + chunk 總數，右側有標註密度開關（全部／角色／關）與角色視角按鈕；密度開關以容器 `data-annotation-mode` 控制正文行內標註的顯示範圍。

#### 側邊面板 — EpistemicSidePanel

閱讀頁另有角色認知狀態側邊面板（`EpistemicSidePanel`），可在閱讀時查看特定角色於當前章節的知識狀態。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#3（書籍詳情）、#4（章節列表）、#5（Chunk 內容）、#12e（認知狀態）

---

### 3.4 角色分析頁 `/books/:bookId/characters`

> 2026-05-16 重新設計：3-tab 平級結構（人物概覽 / 語音風格 / 認知狀態）、Overview 內 4 個 sub-tab、Framework 切換只在左清單、新增「框架對照」抽屜。設計交接見 `docs/plans/20260516-character-analysis-page-redesign.md` 與設計 project HANDOFF.md。

#### 版面結構

```
[Left Panel 268px] [Content Area flex (relative — drawer overlays here)]
```

#### Left Panel — 角色清單

由上至下：

1. **框架選擇**：Jung 12 / Schmidt 45 chip + 「對照 Jung vs Schmidt」按鈕（觸發 drawer）+「框架索引 ↗」連結
2. **搜尋欄**：即時篩選，placeholder 顯示總人數
3. **清單**（可捲動）：分「已分析」/「尚未分析」兩組

清單 item（卡片式）：
- 已分析：依名字首字 hash 出 entity 配色頭像 + 名稱（serif）+ 當前框架的原型名 + Ch.X meta + 綠色狀態點
- 未分析：muted 頭像 + 名稱（淡色）+ Ch.X meta + 「建立」按鈕

#### Content Area — 角色分析內容

頂部固定一條 **Tip Ribbon**（首次進入顯示，localStorage `storysphere:tip-dismissed:character-analysis` 永久 dismiss）。

未選取角色時，內容區顯示提示文字加上「快速前往已分析角色」入口（列出前 5 位已分析角色，點擊直接載入其分析），避免空面板浪費版位。

**標題列**：角色名（serif 28px）+ Framework badge（顯示當前 framework + primary archetype，不可點擊切換）+ Ch.X 提及 meta + 「在圖譜中查看 ↗」+「框架對照」+「覆蓋重新生成」按鈕

**Primary Tab**（標題列下方，三選一，underline 樣式）：

| Tab | 內容 |
|-----|------|
| 人物概覽 (overview) | 4 個 sub-tab pill segmented control → 對應 4 個 pane |
| 語音風格 (voice) | VoiceProfilingPanel — 4 stat card + ToneDistribution 堆疊條 + SentenceHistogram 直方圖 + 質性 section |
| 認知狀態 (epistemic) | EpistemicStateSection — Summary counts + ChapterTimeline（拖曳游標 + 事件 marker）+ 已知/未知 並排 + 誤信跨欄置底 |

**Overview sub-tabs**（pill segmented control）：

| Sub-tab | 來源欄位 |
|---------|---------|
| 人格 (persona) | `profileSummary` + `archetypes[framework]`（含信心度條 + 證據）+ `cep.traits`（tag grid）|
| 行為 (behavior) | `cep.actions` + `cep.keyEvents` |
| 關係 (relations) | `cep.relations` + `cep.quotes` |
| 弧線 (arc) | `arc[]` |

**Framework 切換**：唯一入口在左清單頂部 chip；切換只影響顯示（archetype 跟著切換），不重打 API。標題列 badge 僅顯示當前框架，不可點擊。

**框架對照 Drawer**（右側 640px 抽屜）：
- 觸發點：標題列「框架對照」按鈕、PersonaPane 內 archetype section 的「切到對照」連結、左清單下方「對照 Jung vs Schmidt」連結
- 內容：2 欄並排，Jung 12 / Schmidt 45，各欄顯示 primary / secondary / 信心度條 + % / 證據
- 關閉：點 backdrop / 點關閉按鈕 / Esc 鍵

**Chapter Timeline（Epistemic tab）**：
- 拖曳游標更新章節；**200ms debounce** 後才打 epistemic API
- 拖曳期間以最近一次的回應做樂觀更新（filter `chapter <= cursor`）
- 全寬 axis + ticks（章節 5 等分）+ 事件 marker（綠 / 橘 / 紅）+ 拖曳游標
- 切換角色時自動 reset 到 totalChapters

#### 狀態流程

```
進入頁面
  → 載入角色清單；TipRibbon 顯示（除非已 dismiss）
  → 不預設選中任何角色

點擊角色：
  → 載入該角色分析（#7a），預設 overview tab + persona sub-tab
  → sub-tab 選擇切角色時 reset 到 persona；切回原角色保留

點擊「建立」（未分析角色）：
  → 觸發 #7b → polling #8 → 完成後 invalidate + 刷新

點擊「覆蓋重新生成」：
  → ConfirmDialog → DELETE 舊 → 重觸發 → polling

切換 Framework chip：
  → 不打 API；archetype badge 與 PersonaPane 重渲染

點 Voice tab：
  → 若 localStorage `voice_generated:${bookId}:${entityId}` 為 1 → 自動載入
  → 否則顯示空狀態 + 「分析」按鈕

點 Epistemic tab：
  → 拖曳 Chapter Timeline → 200ms debounce → 打 #12e
  → 拖曳期間用快取資料做樂觀過濾
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#6a（角色清單）、#6c（重新生成）、#7a（角色分析詳情）、#7b（觸發分析）、#7c（清除分析）、#8（任務 polling）、#12e（認知狀態）、#16a（語音風格，含新增的 toneDistribution / sentenceLengthHistogram）、#16b（清除語音風格）

#### 元件對照（檔案路徑）

| 元件 | 檔案 |
|------|------|
| 頁面 shell | `frontend/src/pages/CharacterAnalysisPage.tsx` |
| 列表 item | `frontend/src/components/analysis/AnalysisListItems.tsx` |
| Overview shell + sub-tabs | `frontend/src/components/analysis/CharacterAnalysisDetail.tsx` |
| Overview 4 panes | `frontend/src/components/analysis/sections/{Persona,Behavior,Relations,Arc}Pane.tsx` |
| Voice 視覺化 | `frontend/src/components/analysis/VoiceProfilingPanel.tsx` |
| Epistemic 主視覺 | `frontend/src/components/analysis/EpistemicStateSection.tsx` + `ChapterTimeline.tsx` |
| 框架對照 drawer | `frontend/src/components/analysis/FrameworkCompareDrawer.tsx` |
| Tip ribbon | `frontend/src/components/analysis/CharacterTipRibbon.tsx` |
| 樣式 | `frontend/src/styles/character-analysis.css`（`.ca-*` prefix） |

---

### 3.5 事件分析頁 `/books/:bookId/events`

#### 版面結構

```
[Left Panel 260px] [Content Area flex]
```

#### Left Panel — 事件清單

由上至下：

1. **批次 EEP 面板（BatchEepPanel）**：
   ```
   事件分析  12/30 已完成
   ████████░░░░░░░  40%

   [一鍵生成全部 EEP]
   已分析的事件會自動跳過
   ```

2. **搜尋欄**
3. **清單**（可捲動）：分「已分析」/ 「尚未分析」兩組

**批次按鈕狀態**：

| 狀態 | 顯示 |
|------|------|
| 可執行 | 「一鍵生成全部 EEP」（primary） |
| 全部已分析 | 「全部事件已分析 ✓」（disabled） |
| 執行中 | spinner + "分析中 15/30…" + 進度條 |

**確認視窗**：說明將對 {N} 個未分析事件執行深度分析，已分析自動跳過，消耗大量 token。

**執行中更新**：polling 進度，進度條即時更新，清單中對應 item 從「尚未分析」移至「已分析」，完成後顯示摘要 toast。

#### Content Area — 事件分析內容

**標題列**：事件名（serif）、「覆蓋重新生成」按鈕

**分析內容（EventAnalysisDetail）**：EEP 各維度以 accordion 呈現，詳見 `docs/domain-glossary.md`。

#### 狀態流程

```
進入頁面
  → 載入事件清單
  → 預設選中第一個已分析事件（若有）

點擊「建立」（未分析事件）
  → 觸發分析 → polling → 完成後更新清單 + 填入內容

點擊「一鍵生成全部 EEP」
  → 確認視窗 → 觸發批次分析
  → polling（每 3 秒）→ 進度即時更新清單
  → 完成：顯示摘要 toast
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#6b（事件清單）、#6c（重新生成）、#7d（事件分析詳情）、#7e（觸發單一分析）、#7f（清除分析）、#7g（批次 EEP）、#8（任務 polling）

---

### 3.6 知識圖譜頁 `/books/:bookId/graph`

> V1 重新設計：2026-05-17 起以本節為準。實作計劃見 `docs/plans/20260517-kg-page-redesign-v1-impl.md`。

#### 版面結構

```
                        [BreadcrumbBar（drill-in 時顯示）]
[Toolbar]                                                          [Legend]
                       [圖譜 Canvas（全幅）]                       [右側面板]
[Lens]                                                             [MiniMap]
                                                                    [Stats]
```

所有面板均為**暖白底**（`var(--bg-primary)`），`border-left: 1px solid var(--border)`、`border-radius: var(--radius-lg)`、`box-shadow: var(--shadow-sm)`。

**空狀態**：當書籍尚無節點（`nodeCount === 0`）時，改顯示引導卡 `GraphOnboardingHero`——說明圖譜由章節實體與關係萃取而成，並提供「前往上傳」CTA；此時不渲染 Canvas 與各面板。

#### 圖譜 Canvas

- Cytoscape.js 渲染（fcose layout）
- 節點大小依 `chunkCount` 縮放
- 節點顏色依實體類型（角色 / 地點 / 概念 / 事件）— 使用 `--graph-{type}-fill / -stroke / -label` token
- 選中態：accent 邊框；連出 edge 加深，其餘淡化（`.dimmed` opacity 0.15）

**Canonical edge**：`var(--fg-muted)` stroke / 1.2px / opacity 0.7。

**Inferred edge**（V1 變更，不再使用 dashed）：
- color = `var(--accent)`
- width = `1 + confidence × 1.6` px
- opacity = `0.42 + confidence × 0.25`

**Super-node**（cluster mode 'type'/'community' 使用）：
- 虛擬節點，原始節點不進 cytoscape
- dashed border + 半透明 type 色填充
- label 顯示 type 名稱 + 成員數

#### 浮動工具欄（左上角，GraphToolbar）

```
[搜尋欄] ← typing 開啟 SearchDropdown
[Cluster 模式: 個別 / 類型 / 社群(disabled, F-16)]
[推斷 · N chip — 預設 OFF]
[重置]
[動畫模式: fade / stagger]
```

**推斷 chip**（V1 變更，warning-flavored）：
- 預設 **OFF**；用戶主動點才顯示推斷邊
- 三狀態：未執行（「執行推論」）/ 執行中（spinner）/ 有資料（「推斷 · N」chip）
- chip 開啟時同時開啟右側 **InferredReviewPanel**

#### LensCard（左下角，合併卡）

三段垂直堆疊：

1. **時間範圍 · Timeline** — slider [0..totalChapters]，0 = 全部章節（disabled）
2. **認知視角 · Epistemic** — 24px avatar + 角色名 + 「依賴 ↑ 章節 N」hint
3. **已標記 · Bookmarks** — pin icon + entity pill 列表

localStorage key（**必須保留**）：`graph:${bookId}:timeline:*`、`graph:${bookId}:epistemic:*`、`graph:${bookId}:bookmarks`、`graph:${bookId}:clusterMode`。

#### LegendCard（右上角，常駐圖例）

4 個 entity types（角色/地點/概念/事件）+ 對應成員數，點擊 row → toggle 該類型可見性。底部分隔線 + 「推斷 · N」row（toggle inferred 圖層）。

#### MiniMap（右下角 180×120）

- SVG 重繪：所有節點為小點（依 type 上色）+ 細淡 edges
- Viewport rect 顯示當前 camera bounds
- 互動：click → 立即定位；drag viewport rect → 持續 pan

#### BreadcrumbBar（上方置中，drill-in 時出現）

例：`知識圖譜 › 類型群集 › 角色`（最後一段是當前；前面 segments 可點回上層）

#### 右側面板（優先序，同時只顯示一個）

| 條件 | 面板 | 寬度 |
|---|---|---|
| Shift+Click 選了 2 個節點 | **EntityComparePanel**（Scenario E）| 560px |
| 推斷 chip 開啟 OR 點到推斷邊 | **InferredEdgePanel**（Scenario F 審查列表）| 380px |
| Cluster mode 'type' 且無選中節點 | **ClusterOverviewPanel** / drill-in 成員列表（Scenarios A/C）| 280px |
| 單選節點 | EntityDetailPanel / EventDetailPanel（既有）| 260px |

**第三層面板**（AnalysisPanel / ParagraphsPanel）行為不變，從 EntityDetailPanel 觸發。

**EntityDetailPanel 新增**：header 加 bookmark toggle 按鈕（pin icon，會寫入 `graph:${bookId}:bookmarks`）。

#### 多選比較（Scenario E，cap 2）

Shift+Click 第 2 個 → 並排比較；第 3 個 → 踢掉最早選的。共同鄰居加 `--accent` 虛線高亮，其餘節點 opacity 0.35。

#### Cluster mode

- **個別**（預設）：原本行為，所有節點獨立顯示
- **類型**：純前端 group-by（`frontend/src/services/kgClustering.ts`），4–7 個 super-nodes（依書中 entity types）
- **社群**：disabled，tooltip「派系分析開發中（F-16）」— 待 backend F-16 接 `GET /books/:bookId/analysis/factions`

Mode 切換以 localStorage `graph:${bookId}:clusterMode` per-book 記憶。

#### Search dropdown（Scenario D）

Toolbar 搜尋欄輸入 → 下拉框出現（360px wide）：

- **實體**：matching graph nodes + type dot + 登場段數
- **章節**：matching chapter titles
- **段落內文**：placeholder「全文搜尋待後端實作」

鍵盤：↑↓ 選擇、↵ 開啟、Esc 關閉。Debounce 200ms。

#### Transition / hover

- 所有 transition 用 `color / background-color / opacity / box-shadow`，duration `var(--transition-fast)` (150ms) 或 `--transition-normal` (250ms)，easing `ease`
- Hover：背景下降一階（`--bg-primary → --bg-secondary` 等）；**不使用 transform / translate**

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#9（圖譜資料）、#9b（實體相關段落）、#10a–#10d（推斷關係 run / fetch / confirm/採用 / reject/否決）、#11（事件詳情）、#12a–#12b（TimelineConfig）、#12c（detect-timeline）、#12d（classify-visibility）、#12e（認知狀態）、#7a（實體分析）、#7b（觸發實體分析）、#8（任務 polling）、#4（章節清單供 SearchDropdown）。

**V1 不新增任何 API 端點**。Cluster「社群」模式待 F-16 後接 `GET /books/:bookId/analysis/factions`。

---

### 3.7 時間軸頁 `/books/:bookId/timeline`

> 後端設計見 [`docs/guides/PHASE_9_TEMPORAL_TIMELINE.md`](guides/PHASE_9_TEMPORAL_TIMELINE.md)
> 規劃 brief 見 [`docs/plans/20260519-timeline-page-redesign.md`](plans/20260519-timeline-page-redesign.md)

#### 版面結構

```
[Toolbar 上：3 視圖卡 + 工具]
[QualityBanner（hasChronologicalRanks=false 且已有事件時出現）]
[ActiveFilters Bar（有套用篩選時出現）]
[時間軸主區 flex] [事件詳情面板 360px，點擊事件後展開]
```

**空狀態**：當書籍尚無任何事件時，主區改顯示引導卡 `TimelineOnboardingHero`——以三步說明卡（事件抽取 → 故事時序 → Genette 分析）+「前往事件分析」CTA 引導使用者，此時 QualityBanner 不出現。呼應張力分析頁的 onboarding hero 模式。

#### 3.7.1 頂部工具列（V2 / 進取版）

```
左側 — 三卡視圖切換（每張：圖示 + 標題 + 為什麼用的副標）:
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ ☰ 章節順序        │ │ ↗ 故事時序        │ │ ▦ 矩陣視圖        │
  │ 依書中出現順序... │ │ 依事件實際發生... │ │ 章節 × 時序...    │
  └──────────────────┘ └──────────────────┘ └──────────────────┘
  （未排序時序時，後 2 張卡右上有黃色 warning dot）

右側:
  [⇄ ↕] layout 切換（矩陣模式下隱藏）
  [☰ 篩選 (n)]  ← n 為已套用群組數
  [████░ 65% 已分析]  ← QualityChip（hasChronologicalRanks=true 時）
  [↻ 重新計算時序 / 計算中…]
  [⎇ Genette 分析 ✓]  [非線性 · 倒敘 3 · 預敘 1]  ← GenettStructureChip（分析完成且覆蓋率足夠時出現）
```

**GenettStructureChip（`tl-genett-structure-chip`）**：Genette 分析成功後顯示於按鈕右側的細框 badge，顏色依 `story_time_structure`：
- `linear` → 綠色（`--color-success`）
- `partially_linear` → 琥珀（`--color-warning`）
- `non_linear` → 藍紫（`--accent`）

覆蓋率不足時不顯示 chip（只有 banner 提示原因）。關閉 banner 後 chip **仍保留**（data 與 banner 解耦）。

#### 3.7.2 QualityBanner（hasChronologicalRanks=false 時頂部出現）

```
[⚠]  尚未計算故事時序
     「故事時序」與「矩陣視圖」需要事件的 chronological rank...
     已分析 N/M 事件（P%）                       [↻ 重新計算時序]
```

橘色 `--color-warning-bg` 底色，把行動 CTA 直接擺在橫幅上引導。

#### 3.7.3 ActiveFilters Bar（有套用篩選時出現）

```
已套用：[葉文潔 ×] [回敘 ×] [KERNEL ×]   全部清除
```

每個 chip 可單獨移除；「全部清除」一鍵 reset filter。

#### 3.7.4 時間軸主區（EventCard 視覺）

V2 用卡片化節點取代圓點：
- 左側 3px (KERNEL) / 5px (KERNEL) 色帶：`::before`，`--card-narrative` 顏色，依 `narrativeMode`
- **右側 3px 色帶（Genette displacement）**：`::after`，`--card-displacement` 顏色，僅當事件命中 `analepsis_event_ids` 或 `prolepsis_event_ids` 時顯示（加 `.displaced` class）；倒敘 = `--narrative-flashback-border`（藍），預敘 = `--narrative-flashforward-border`（琥珀）；不與左側 narrativeMode 色衝突（左 narrative / 右 displacement）
- 卡頭：NarrativeIcon（自繪 lucide-style）+ K/S 標籤 + Ch.N
- 標題（serif，2 行 clamp）+ pills（至多 3 個，超出顯示 +N）

NarrativeIcon 5 種圖示替代原本錄影機字符 `⏪ ⏩ ⏸`（語意錯位）。每個圖示是小型「時間軸 + 跳躍方向」線性圖：
- **present** — 時間線 + 實心點 + 前進箭頭
- **flashback** — 時間線 + 往回的弧線箭頭
- **flashforward** — 時間線 + 向前的弧線箭頭
- **parallel** — 兩條錯位平行線
- **unknown** — 虛線圓 + 問號

Parallel 事件群組：`narrativeMode === 'parallel'` 的連續事件收為群組，左側雙線紫色 + 其餘虛線紫框；標題 `⤳ 並行支線`。

SVG overlay：底層 spine polyline（淡灰）+ CAUSES 邊（confidence ≥ 0.5 才畫；≥ 0.8 實線 / < 0.8 虛線）。

#### 3.7.5 Filter Sheet（下拉面板）

chip 風格 toggle（不是 checkbox），分區：事件類型 / 敘事模式 / 重要性 / 角色（含搜尋）/ 地點。

#### 3.7.6 事件詳情面板（右側 360px，hero 風格）

```
[← 關閉]
[KERNEL 核心 NarrativeIcon][· 回敘][Ch.5]   ← 上方 meta chip 列
事件標題（serif, 17px）
章節標題 · 故事時間提示                       ← subtitle
┌─ 主題意義 ──────────────────────┐
│ 葉文潔的紅岸決策……               │  ← thematic block（accent left bar）
└────────────────────────────────┘

事件概要：description + participants/location pills

時序關係（mini-timeline）：
  ○─ 前驅 · prior：xxx (Ch.3 · 當下敘事)
  │
  ●─ 當前事件：本事件標題 (Ch.5 · rank 0.42)
  │
  ○─ 後續 · subsequent：xxx (Ch.7 · 當下敘事)

[EEP 證據剖析 ▾]（預設展開）
[因果分析 ▸]（預設收合）
[影響分析 ▸]（預設收合）
```

當未分析時，hero 下方提供「前往深度分析頁觸發 EEP」CTA。

#### 3.7.7 矩陣視圖（Fabula-Sjuzhet Matrix，V2）

- X 軸 = 章節（離散），Y 軸 = `chronological_rank` 0.0→1.0
- **頂部邊際 histogram**：每章節事件密度直方圖（accent 色，alpha 隨密度遞增）
- **45° 對照線**：虛線，表示「完全按故事順序敘事」
- **degraded row（Y = -0.1）**：warning 色，放 `chronological_rank == null` 事件
- **Quadrant labels**：「↖ 預敘區 / ↘ 倒敘區 / ⤵ 未排序事件」三象限標籤（Genette 著色開啟時，前兩個隱藏，只保留未排序）
- **Genette 著色 toggle（`tl-genett-color-toggle`）**：有 genettData 時才顯示於右上角（與象限標籤同層 HTML overlay）；開啟時 dot 顏色改為 displacement_type 著色（analepsis 藍 / prolepsis 琥珀 / linear 灰），legend 同步切換三類；關閉時還原 narrativeMode 著色
- **45° 對照線標籤**：Genette 著色關閉時顯示「完全按故事順序敘事」，開啟時改為「零位移基準線」
- Dot 半徑：KERNEL 8 / SATELLITE 5 / 預設 6；顏色依 narrative mode（Genette 著色關閉時）
- 框選（brush）：未選中 dot opacity 降至 0.15
- Tooltip：hover 顯示 title / Ch / mode / rank / participants

#### 樣式檔案

`frontend/src/styles/timeline.css`（`.tl-*` prefix），與 character-analysis / event-analysis 並列；不修改 design tokens。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#13a（時間軸資料）、#13b（觸發時序計算）、#11（事件詳情）、#8（任務 polling）

---

### 3.8 張力分析頁 `/books/:bookId/tension`

> 術語定義（TEU、TensionLine、TensionTheme 等）見 `docs/domain-glossary.md`。

#### 版面結構（2026-05 重設計）

```
[全寬內容區 max-width: 1280px，padding 24px 28px 80px]
  ├─ Stepper Strip                  (三步驟橫排 strip，內嵌 scope label + 進度條)
  ├─ Theme Hero / Onboarding Hero   (合成完成 → 命題 hero；尚未 → 三層管線教學)
  ├─ Trajectory Dashboard           (全寬，章節 TEU 密度 marginal + 每條 line 散點)
  ├─ Summary Chip Bar               (pending / approved / modified / rejected 統計 + 過濾)
  └─ TensionLine 審核列表            (LineCard 摘要+展開：thematic_note → carriers → evidence)
```

CSS 入口：`frontend/src/styles/tension.css`（class prefix `.tn-*`）。
元件入口：`frontend/src/components/tension/`（StepperStrip / ThemeHero / OnboardingHero / TrajectoryDashboard / SummaryChips / LineCard / StatusBadge / hooks/useTensionTask）。

#### 三步驟 Stepper Strip

`.tn-stepper` 把三個 step 水平排在同一卡片中；每格內顯示「scope eyebrow（SCENE / CROSS-SCENE / BOOK）→ label → desc」，狀態語意：

| 視覺狀態 | class | 表現 |
|----------|-------|------|
| idle / active | `.tn-step` / `.is-active` | 中性色 num badge，可點 |
| running | `.is-running` | num badge 變 info 色，inline spinner，底部 2px progress bar 顯示 `progress%` |
| done | `.is-done` | num badge 變 success 色 + ✓，CTA 改為 ↻（可重跑） |
| disabled | `disabled` attribute | opacity 0.45，desc 顯示 lock 文案（e.g. `step3.lock` = "需先完成 Step 2"） |
| error | `.tn-step-error` 橫條 | 對應 step 下方插入 error 橫條（i18n `tension.errors.*`） |

| 步驟 | 完成後 desc |
|------|------------|
| Step 1 TEU 組裝 | `組裝完成 · {assembled} / {candidates} 場景` |
| Step 2 TensionLine 聚合 | `聚合完成 · {count} 條張力線` |
| Step 3 TensionTheme 合成 | `主題已合成` |

#### Theme Hero（`.tn-hero`）

合成完成（或 lines 存在但 theme 尚無）時取代舊「面板」配置，作為頁面 anchor：

- **Eyebrow**：`全書張力主題 · TensionTheme` + 右上 StatusBadge
- **命題**：`<p>` 用 `var(--font-serif)` + `--font-size-2xl`（24px）serif 大字（可 inline 編輯為 `<textarea>`）
- **Meta 欄**：Frye badge（`data-mode=` 對應 `--frye-*` token）／Booker badge（共用 `--booker-*` + § 字符）／合成來源（line 數）
- **Actions**：Approve / Modify proposition / Reject（樣式同 LineCard），右下顯示 `assembled_by · assembled_at`

無資料時：渲染 `OnboardingHero` — eyebrow + 引言 + 三張 layer card（TEU SCENE / TensionLine CROSS-SCENE / TensionTheme BOOK）說明三層聚合語意。

#### Trajectory Dashboard（`.tn-traj`）

由 SVG 改為 CSS Grid（`grid-template-columns: 200px 1fr`），全寬填滿；不再硬編色：

- 章節 TEU **密度直方圖**作為 marginal，bar 用 `--accent` + opacity 0.55
- 每條 line 一列 `.tn-traj-row`：左側 label（poles + meta + 小型 status icon），右側 canvas 顯示橫條
- 橫條色用 `intensityBucket(intensity_summary)` 對應 `--tension-intensity-{low|mid|high}-{bg,fg,edge}`（不再 hardcode `rgb()`）
- 每個 TEU 在自己章節位置疊一顆 `.tn-traj-row-dot` 圓點，半徑 = 3 + intensity × 4
- 點 row 觸發 `onFocus(line.id)` 平滑捲動到下方對應 LineCard

#### Summary Chip Bar（`.tn-summary`）

新增的審核 dashboard 條，列在 trajectory 之下、列表之上：

- 「全部 N」+ pending / approved / modified / rejected 四顆 chip（顯示計數，點擊作為列表過濾）
- 右側「隱藏已拒絕」checkbox + 重新整理按鈕

#### LineCard（`.tn-card`）— **解決盲審**

折疊狀態：chevron + `PoleA vs PoleB` + 80px mini intensity bar + meta（TEU 數 / ch 跨度 / 強度 %）+ StatusBadge。

展開狀態（`.tn-card-body`）依序：

1. `tn-card-note`：line-level `thematic_note`（serif italic 引言區塊；若 grouping LLM 沒回則略過）
2. `tn-poles` 兩欄：每極顯示 eyebrow + 名稱 + carrier pills（從各 TEU 的 `pole_a_carriers` / `pole_b_carriers` 去重合併）
3. `tn-evidence`：列出構成此線的 TEU（chapter + 進度條式 intensity bar + tension_description + evidence 引文）。預設 density=summary 顯示第 1 筆 + 「+ 還有 N 則」inline 提示；可點「展開全部 {n} 則」切換為 full
4. `tn-card-actions`：Approve / Modify Label（inline 編輯 PoleA / PoleB）/ Reject

#### 與舊版差異

| 面向 | 舊版 | 新版 |
|------|------|------|
| 版面寬度 | 800px 單欄 | 1280px 全寬 |
| 三步驟 | 垂直堆疊卡片 | 水平 stepper strip，含 scope eyebrow + 進度條 |
| 軌跡圖 | 560px SVG，hardcoded rgb() 漸層 | CSS Grid 全寬 dashboard + 密度直方圖 + TEU 散點，色用 `--tension-intensity-*` |
| LineCard 展開 | 只有三按鈕 | 加 thematic_note + carriers + TEU 證據（解決盲審） |
| Frye / Booker badge | 借用 entity-org / entity-con 配色 | 獨立 `--frye-*` / `--booker-*` token |
| 審核總覽 | 散落 | Summary chip bar 集中顯示 + 過濾 |
| 結構 | 單檔 inline style | `components/tension/*` + `styles/tension.css` |

#### 狀態流程

```
進入頁面
  → 載入 TensionLine 清單（若已有資料，跳過 Step 1/2）
  → 載入 TensionTheme（若已有資料，跳過 Step 3）

Step 1 → Step 2 → Step 3 各自獨立觸發
  → 每步驟完成後自動 refetch 對應資料

審核操作（TensionLine / TensionTheme）
  → 送出審核結果 → 更新對應 query cache
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#14a–#14b（Step 1 TEU 組裝）、#14c–#14d（Step 2 TensionLine 聚合）、#14e（TensionLine 清單）、#14f（TensionLine 審核）、#14g–#14h（Step 3 TensionTheme 合成）、#14i（TensionTheme）、#14j（TensionTheme 審核）

> 注意：張力分析各步驟有專用 polling endpoint（#14b / #14d / #14h），不走共用的 #8。

---

### 3.9 象徵意象頁 `/books/:bookId/symbols`

頁面分為兩欄：左側清單（240–260px）+ 右側意象詳情。i18n namespace 為 `analysis.json` 的 `symbol.*`（與其他分析頁對齊；舊 `settings.json/symbols.*` 已搬移）。

#### 版面結構

```
[Left Panel 260px] [Content Area flex]
```

#### Left Panel — 意象清單

- 類型 chip row（all / object / nature / spatial / body / color / other；只顯示有資料的類型）
- 搜尋輸入框（match `term` 與 `aliases`）
- 排序維度切換：頻率 / 首見 / 審核
- 清單項：
  - 類型色點
  - 詞條（serif）+ polarity dot（若已有 interpretation）
  - 異體（最多 2 個，` · ` 串接）
  - DensityStrip — 章節密度縮影（每章一格，依密度上色）
  - 右側：出現次數 + ReviewBadge（若已有 interpretation）

#### Content Area — 意象詳情

選中意象後依序顯示五個區塊：

1. **標題列**：詞條 h1（serif）+ TypePill + 出現次數；下方為異體 pill 列。
2. **詮釋區（依狀態切換）**：
   - **生成中**（`InterpretationGenerating`）：中央卡片含五階段 checklist（彙整 SEP 證據檔 / 採樣段落脈絡 N/N / 連結 KG 角色 / LLM 詮釋 / 寫入待審紀錄），上方為整體進度條 + taskId，下方為取消按鈕與輪詢註記。後端 `_run_symbol_analysis` 只 emit 3 個 progress event（10/40/90），前端把 10 之前的三個敘事步視為「assemble SEP」原子塊，達 10 後一起標 done；採樣 N/N 顯示的是 `entity.frequency`（與 `len(sep.occurrence_contexts)` 等價），非逐筆計數。詳見 [`InterpretationGenerating.tsx`](../frontend/src/components/symbols/InterpretationGenerating.tsx) 的 `deriveStages` 註解。
   - **已生成**（`InterpretationHero`）：
     - 上：`LLM 詮釋` tag + assembled_by + 日期 + ReviewBadge（右）
     - 主題命題（serif italic）
     - polarity 方塊（圖示 + 標籤）+ confidence meter
     - 證據綜述（evidence_summary）
     - 相關角色 / 相關事件 chips（從 `linked_characters` / `linked_events`）
     - HITL 三按鈕（通過 / 修訂 / 駁回）+ 重新生成 ghost 按鈕；按修訂時切換 inline edit theme + polarity → 儲存 / 取消
   - **尚未生成**（`InterpretationCta`）：sparkles 圖示 + 說明 + 主按鈕「生成 LLM 詮釋」
3. **章節分布卡（`ChapterDistChart`）**：SVG 長條，密度漸層（low/mid/high）+ 峰值三角 marker（前 3 名章節，client-side 推導）+ hover tooltip + 密度圖例
4. **共現網絡卡（`CoOccurrencePanel`）**：3 個 tab
   - 共現意象：彩色 pill grid（依 imagery_type 著色 + 共現次數 chip），點擊切換選中
   - 共現角色：來自 interpretation.linked_characters，藍 dot + 角色 id（後續可接 KG 跳轉）
   - 共現事件：來自 interpretation.linked_events，紅 dot + 事件 id
5. **出現紀錄卡（`OccurrencesTimeline`）**：按章節分組，每組 header「第 N 章 · M 次」+ 分隔線；每筆顯示 `#position` + 前後文（term / aliases highlight）+ 共現詞 tags（最多 3）

#### 狀態

| 條件 | 顯示 |
|------|------|
| list loading | 右側 LoadingSpinner |
| `entities.length === 0` | EmptyState — `emptyTitle` + `emptyHint` |
| 未選中且有資料 | EmptyState — `selectPrompt` + `selectPromptDesc` |
| 選中但 interpretation 不存在（404） | `InterpretationCta` |
| 選中且 polling | `InterpretationGenerating` |
| 選中且有 interpretation | `InterpretationHero`（HITL 可操作） |

#### 設計 token

- 意象類型：`--symbol-{object,nature,spatial,body,color,other}-{bg,fg,dot}`（既有）
- 詮釋極性：`--polarity-{positive,negative,neutral,mixed}-{bg,fg,edge,dot}`（新增）
- 章節密度：`--symbol-density-{low,mid,high,peak}`（新增）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：
- 已接：#15a 列表 / #15b 出現紀錄 / #15c 共現詞
- 本次新接：#15d SEP（保留供後續顯示更詳細證據；目前僅作可選資源）/ #15e 觸發詮釋 / #15f 詮釋 polling / #15g 取得 interpretation / #15h HITL 審核

#### 元件位置

- 主頁：[`frontend/src/pages/SymbolsPage.tsx`](../frontend/src/pages/SymbolsPage.tsx)
- 元件：[`frontend/src/components/symbols/`](../frontend/src/components/symbols/)
- CSS：[`frontend/src/styles/symbols.css`](../frontend/src/styles/symbols.css)（`.sym-*` prefix）
- API caller：[`frontend/src/api/symbols.ts`](../frontend/src/api/symbols.ts)
- Hook：[`frontend/src/components/symbols/hooks/useSymbolInterpretationTask.ts`](../frontend/src/components/symbols/hooks/useSymbolInterpretationTask.ts)

---

### 3.10 建構概覽頁 `/books/:bookId/unraveling`

#### 功能目的

1. **可見性**：讓用戶清楚知道「這本書被分析到了什麼程度」（含全局完成度 %）
2. **診斷性**：功能不可用時，可來此確認哪個資料層、哪個上游節點尚未建立
3. **依賴關係的呈現**：DAG 反映建構依賴——同層平行，依賴方向左→右
4. **行動引導**：選取節點後可直接跳轉到對應頁面（symbols / characters / events / timeline / tension），未來可觸發對應建構 pipeline

#### 版面結構（重設計 Direction A · Diagnostic Dashboard）

```
┌────────────────────────────────────────────────────────────────┐
│ Summary Strip（頂部，flex-shrink: 0）                          │
│  ├─ 大百分比 + complete/partial/empty 計數                      │
│  └─ Stacked bar + 5 個 Layer chips（L0–L4 進度）                │
├────────────────────────────────────────────────────────────────┤
│ DAG Canvas（flex 1）              │ Inspector（360px）          │
│  └─ Cytoscape preset layout      │  ├─ 預設：層次清單           │
│     pan/zoom + 浮動 toolbar       │  └─ 選中後：節點細節         │
└────────────────────────────────────────────────────────────────┘
```

舊版的 220px 左側 `InfoPanel`、底部 `Legend` 浮層已移除；其功能由 Summary Strip 與 Inspector 取代。

#### Summary Strip

- 左側：`{pct}%` 完成度（大字體）+ 子標題（`complete / partial / empty` 計數 + 總節點數）
- 右側：14px 高 stacked bar（complete + partial + empty 三段）+ 5 個 Layer chips（L0–L4 各自進度條 + `complete/total` 計數）；點 chip 等同選中該層第一個節點

#### Inspector — 預設「層次清單」

依 Layer 0–4 分組顯示所有節點，每列含狀態點、節點名稱、sub-label（依 nodeId 顯示計數，如 `9 / 12 章`）。點任一節點切換到「節點細節」。

#### Inspector — 「節點細節」

- Header：節點名稱 + `L{n} · {nodeId}` + 狀態 badge
- **Progress card**（僅在節點有意義 `numerator/denominator` 時顯示）：大數字 + 進度條
- **章節分佈 sparkline**（僅 5 個支援的節點：`paragraphs / summaries / keywords / kg_event / symbols`）：12-bar mini chart，資料來自 #19b
- **行動區**（status ≠ complete 時）：
  - 若有未完成上游依賴：顯示 blocker chips + disabled CTA「需先完成上游 N 個依賴」
  - 否則：disabled CTA「觸發建構功能規劃中」（Backlog #7 視覺占位）
  - 若節點對應某書內頁面：顯示 secondary CTA「前往對應頁面瀏覽」（連結至 graph / symbols / characters / events / timeline / tension）
- **原始計數**：`counts` raw key/value 列表
- **附加資訊**：`meta` raw key/value 列表

#### DAG 節點層次

| Layer | 節點名稱 | 形狀 |
|-------|---------|------|
| 0 — Text Layer | Book Meta / Chapters / Paragraphs | diamond |
| 1 — KG Layer | Summaries / Keywords / Symbols + KG compound（Entity / Concept / Relation / Event / Temporal Relation） | rectangle |
| 2 — Analysis | CEP / EEP / TEU / SEP | round-rectangle |
| 3 — Derived | Character / Causality / Impact / Tension Lines / Symbol / Narrative / Hero Journey / Temporal / Voice Profile | round-rectangle |
| 4 — Synthesis | Tension Theme / Chronological Rank | round-rectangle |

#### 節點狀態

| 狀態 | 顏色（default 主題） |
|------|----------------------|
| `complete` | 綠底綠框 |
| `partial` | 黃底黃框 |
| `empty` | 灰底灰框 |

`--status-*` token 在 4 主題各自定義；詳見 [`docs/DESIGN_TOKENS.md`](DESIGN_TOKENS.md)。

**已實作**：
- 全局進度 Summary Strip
- 點擊節點 → Inspector 切到節點細節（含進度、章節分佈、blockers、跳轉 CTA）
- DAG 內 highlight + fade 鄰居節點

**規劃中（Backlog）**：
- Backlog #7：CTA「觸發建構」實際呼叫對應 pipeline endpoint
- 章節分佈擴展到 `kg_entity` / `kg_concept`（需 domain model 加上 chapter linkage）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：
- #19（建構概覽 manifest）
- #19b（章節分佈，用於 NodeDetail panel）

---

### 3.11 方法論頁 `/methodology`

> **2026-05-30 重新設計**：原 `/frameworks` 重新定位為 **Methodology（方法論）** 頁面，作為整套分析方法的說明與教育中心。「方法論」「Methodology」皆為暫定佔位名稱，等產品語言確定後一起調整。設計交接見 `methodology-page/` 設計包。

全站層級，不屬於任何書籍。**三欄閱讀結構**：

```
[Left Sidebar 48px] [方法論導覽 262px] [主內容 flex] [本頁目錄 188px]
```

- **左欄方法論導覽**：依分析類型分群（角色分析 / 敘事弧 / 張力 / 象徵），每群可收合（搜尋時自動展開）；首項為「總覽」入口。
- **主內容**：總覽頁顯示分類卡 + 方法列；點任一方法進入單一方法頁。
- **頂部分頁**：理論與方法（About）/ 跨書查閱（Cross-book）；流程型方法（如 SEP）自動停用跨書分頁。
- **右側本頁目錄**：sticky 錨點 TOC，scroll-spy 高亮當前章節。

#### 單一方法頁閱讀流程

引言 → **概念架構**（每個方法獨立設計的概念圖）→ 類型一覽（卡片網格）→ 系統如何分析（pipeline + 輸出欄位）→ **分析品質與信心值**（amber 誠實說明框 + 三層級唯讀說明）→ 參考文獻。

| 方法 | 概念圖 |
|------|--------|
| Jung 原型 | 12 原型輪盤 + 4 動機取向象限 |
| Schmidt 類型 | 性別對偶雙欄（8 女性 + 8 男性 + 配角／反派 = 45） |
| 英雄旅程 | 12 階段環形圖（平凡／非常世界雙半球） |
| Frye 四季神話 | 四季 × 四神話圓環 |
| Booker 七情節 | 七條「故事形狀」曲線 |
| SEP 象徵分析 | 資料層 → 詮釋層狀態流程（含 HITL 退回回饋線） |

#### 信心值說明（amber 誠實框）

刻意保留的設計重點：信心值是 LLM 推論當下的自我評估，非可逐項稽核的確定性公式。三個層級為唯讀說明（已確立 / 推定 / 暫定），**頁面內不提供滑桿類互動**——避免暗示信心值是可計算的。

#### 跨書查閱（Coming soon）

當前為佔位空殼，標「即將推出」。需接後端真實聚合結果，計劃支援列表與矩陣兩種視圖、右側細節面板。

#### 從角色分析頁跳入

```
/methodology?framework=jung     → 自動選中 Jung 原型（About 分頁）
/methodology?framework=schmidt  → 自動選中 Schmidt 類型
```

#### 元件位置

| 區塊 | 位置 |
|------|------|
| 頁面入口 | `frontend/src/pages/MethodologyPage.tsx` |
| 概念圖（六種） | `frontend/src/components/methodology/ConceptDiagram.tsx` |
| 範圍 CSS | `frontend/src/styles/methodology.css` |
| 資料來源 | `frontend/src/data/frameworksData.ts`（含 `pipeline / output / categoryId / crossBook`） |

---

### 3.12 Token 用量頁 `/token-usage`

全站層級（非書籍頁面）。

#### 版面結構

```
[Header + 時間範圍選擇器] [統計卡片] [按服務細分表格] [按模型細分表格] [每日趨勢圖]
```

#### 時間範圍

`今天 / 近 7 天 / 近 30 天 / 全部`，切換時重新請求。

#### 統計卡片（3 格）

Prompt Tokens / Completion Tokens / 總請求次數

#### 細分表格（BreakdownTable）

依服務分組（按 totalTokens 降序排列），欄位：名稱 / Prompt / Completion / Total / 次數。

按模型分組同樣格式。

#### 每日趨勢圖（DailyChart）

水平長條圖，每列一天，長條寬度代表當日 totalTokens。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#17（Token 用量）

---

### 3.13 設定頁 `/settings`

> **注意**：此頁目前定位為系統管理工具，預計未來有較大改版（涉及複雜的後端遷移流程）。當前規格以現況記錄為主。

#### 版面結構

```
[Left Sidebar] [主內容區，單欄表單佈局]
  ├─ 介面主題區塊
  ├─ KG Backend 區塊
  └─ 資料遷移區塊
```

#### 介面主題區塊

標題「介面主題」。

以**卡片選擇器（card picker）**呈現各主題，每張卡片顯示：
- 主題名稱
- 簡短描述
- 縮圖色塊預覽：由該主題的 `--bg-primary`、`--accent`、`--fg-primary` 三色組成的小色條

選中狀態：accent 色邊框。

選擇後**立即套用**（即時預覽），並寫入 `localStorage`（key：`storysphere:theme`）。

**狀態流程**：

```
進入頁面
  → 從 localStorage 讀取目前主題
  → 對應卡片顯示選中狀態

點擊主題卡片
  → ThemeContext 更新 <html data-theme="..."> → 全站即時套用
  → 寫入 localStorage
```

**API**：無，純前端 localStorage。主題清單見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md)。

#### KG Backend 區塊

顯示當前後端模式（NetworkX / Neo4j）及 Neo4j 連線狀態（綠點/灰點）。

數量統計卡片：實體數 / 關係數 / 事件數。

切換後端按鈕：`NetworkX` / `Neo4j`（目前模式按鈕 disabled）。切換後顯示 loading，完成後刷新狀態。

#### 資料遷移區塊

兩個操作按鈕（idempotent）：
- NetworkX → Neo4j：將 NetworkX 記憶體圖譜資料寫入 Neo4j
- Neo4j → NetworkX：從 Neo4j 讀回記憶體

遷移 polling 進度（2 秒間隔），完成後顯示遷移數量（entities / relations / events）。

> **未來改版方向**：目前的搬遷流程對用戶而言過於技術，且操作後果難以直覺理解。未來應改為更清晰的「儲存後端」設定模式，或完全隱藏底層切換，由系統自動管理。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#18a（KG 狀態）、#18b（切換後端）、#18c（觸發遷移）、#18d（遷移 polling）

> 注意：KG 遷移 polling 走 #18d 專用 endpoint，不走 #8。

---

### 3.14 敘事結構頁 `/books/:bookId/narrative`

張力（3.8）、符號（3.9）之外的第三條平行分析線。i18n namespace 為 `analysis.json` 的 `narrative.*`。頁面為單欄垂直捲動，分兩個 section：上方英雄旅程主視圖（佔大部分），下方情節骨幹摘要次區塊。

#### 版面結構

```
[英雄旅程區塊 — 主視圖：標題列 + HITL + 佈局切換器 + 選定佈局]
[情節骨幹摘要 — 次區塊：比例條 + 統計 + 核心事件骨幹 + 跳轉]
```

#### 英雄旅程主視圖（`HeroJourneySection`）

- **標題列**：「英雄旅程」h2（serif）+ 副標（Campbell · Vogler 12 階段）；下方為「已映射 N／12 階段」+「缺席的階段是有意義的敘事選擇，而非未完成」原則註記。右側為**書級** HITL：核可 / 標記不適用 按鈕 + ReviewBadge（走 #21l）。
- **佈局切換器**：segmented control，四種佈局並存可切換：
  - **A 水平軌跡（`LayoutTrack`）**：departure→initiation→return 三相位橫向流，12 階段 disc + 底部詳情抽屜。
  - **B 三相位分欄（`LayoutColumns`）**：三欄堆疊階段列 + 右側固定詳情面板（360px）。
  - **C 圓環循環（`LayoutRing`）**：Campbell 環形 monomyth，中心顯示選定階段詳情，虛線分隔平凡／特殊世界。
  - **D 章節對位帶（`LayoutBand`）**：甘特式條帶（x 軸＝章節），一眼可見階段重疊與缺席。
- **三態視覺語言**（一眼可區分，不用進度條語意）：
  - `filled`（conf ≥ 0.6）：accent 填色，深淺隨 confidence 加深。
  - `low`（0 < conf < 0.6）：警示三角（`--color-warning`）+ 虛線邊框。
  - `absent`（chapter_range 空）：虛線空殼顯示「—」，不留空白。
- **點擊展開詳情（`StageDetail`）**：相位 + 章節 + 階段名 + 狀態徽章 + confidence meter + 系統詮釋 notes + 代表性 Kernel 事件 pill + 理論描述／敘事功能（理論文案取自 `frameworksData.ts` hero_journey，localized）。
- **Legend**：filled / low / absent 三態圖例。

#### 情節骨幹摘要（`PlotSpine`）

- 標題列 + 分類來源 chip（啟發式／LLM／人工驗證）+ ReviewBadge。
- Kernel / Satellite / Unclassified 比例條 + 計數 + 總事件數。
- 核心事件骨幹：依章節排列的 kernel 事件時間線（上下交錯標籤）。
- 底部「前往事件分析頁」跳轉（Kernel/Satellite 細節在事件分析頁）。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#21e（觸發英雄旅程）、#21f（polling）、#21k（取 NarrativeStructure）、#21j（kernel-spine）、#21l（HITL 書級審核）。封裝於 `frontend/src/api/narrative.ts`。

---

## 4. 全局元件

### 4.1 ChatWidget（浮動聊天泡泡）

掛載在 `AppLayout`，**所有頁面均可使用**。

#### 外觀結構

```
[右下角浮動 ChatBubble] ← 點擊開啟/關閉
[ChatWindow — 浮動視窗，固定在右下角上方]
```

#### ChatBubble

圓形浮動按鈕，固定在右下角，顯示對話 icon；當 ChatWindow 開啟時改為關閉 icon。

#### ChatWindow

WebSocket 連線，含訊息列表 + 輸入框。

**Context-aware**：ChatContext 追蹤當前頁面狀態，chat 請求中會夾帶：
- `page`：當前頁面類型（`graph` / `analysis` / `reader` / `other` 等）
- `bookId` / `bookTitle`：當前書籍
- `selectedEntity`：選中的節點（知識圖譜頁）
- `analysisTab`：當前分析 tab（`characters` / `events`）

用途：讓 AI 助手能基於用戶當前正在查看的內容給出精準回應。

**Prefill**：部分頁面操作可預填訊息至 ChatWindow（`prefillMessage`），例如從分析頁直接詢問某角色的分析結果。

---

## 5. 跨頁面互動與資料連動

### 5.1 頁面跳轉對照表

| 來源 | 觸發 | 目的地 |
|------|------|--------|
| 首頁書庫 | 點擊書籍卡片 | `/books/:bookId` |
| 首頁最近開啟 | 點擊「知識圖譜」 | `/books/:bookId/graph` |
| 首頁最近開啟 | 點擊「深度分析」 | `/books/:bookId/characters` |
| 上傳完成列表 | 點擊「進入書籍」 | `/books/:bookId` |
| 角色分析頁 | 點擊「在圖譜中查看 ↗」 | `/books/:bookId/graph?entity=:entityId` |
| 角色分析頁 | 點擊「框架索引 ↗」 | `/frameworks?framework=jung` |
| 知識圖譜頁 | 點擊「查看分析 ↗」（EntityDetailPanel） | 推出 AnalysisPanel（第三層，不跳頁） |
| 時間軸頁 | 點擊事件面板「前驅/後續事件」 | 同頁 scroll + 選中 |
| 時間軸頁 | 點擊「尚未分析」引導連結 | `/books/:bookId/events` |
| 品質指示器連結 | 點擊文字 | `/books/:bookId/events` |

### 5.2 深度分析資料連動

知識圖譜頁觸發的實體深度分析結果，與角色分析頁 / 事件分析頁顯示的內容來自**同一份資料**。

確認視窗中需明確說明：「生成結果將同步至角色分析頁」。

### 5.3 Token 消耗提示規則

以下操作前均需顯示確認視窗：

| 操作 | 確認視窗說明 |
|------|------------|
| 首次觸發實體深度分析 | 此操作將消耗 token，生成後可在角色分析頁查看 |
| 覆蓋重新生成（實體） | 此操作將覆蓋現有結果並消耗 token |
| 一鍵生成全部事件 EEP | 將對 N 個未分析事件執行深度分析，已分析的自動跳過，消耗大量 token |
| 觸發時序計算 | 此操作將消耗 token，計算事件的故事世界時序排列 |
| 知識圖譜頁「生成深度分析」 | 確認後消耗 token，結果同步至角色分析頁 |

---

## 6. 未來備註（Backlog）

以下功能已討論或規劃，不在當前開發範圍：

1. **首頁最近開啟區塊**：後端需在用戶開啟書籍時寫入 `lastOpenedAt`，前端 render 邏輯已就緒，等後端支援即可啟用。
2. **Dark mode**：CSS token 已預留（`[data-theme="dark"]`），UI 邏輯暫不實作。
3. **閱讀頁欄 1 收合**：當欄 3 展開後，欄 1 可縮成 40px icon-only 欄，釋放橫向空間。參考 VS Code sidebar 收合邏輯。
4. **框架索引反查角色**：從原型反查書中對應角色，需配合書籍層級資料對接。
5. **全站搜尋**：sidebar 搜尋 icon 為未來功能佔位。
6. **知識圖譜 → 閱讀頁定位**：從圖譜段落面板點擊 chunk，跳轉至閱讀頁並定位對應位置。
7. **建構概覽 — 觸發互動**：在 UnravelingPage 的 Detail Panel 內直接觸發對應 pipeline 建構。
8. **時間軸 — 因果鏈聚焦模式**：toggle 僅顯示 `relation_type = causes` 的邊與相關事件。
9. **時間軸 — 角色弧線模式**：選定角色後，僅顯示該角色參與的事件。
10. **設定頁大改版**：當前 KG backend 切換方式過於技術導向，未來改為更清晰的儲存後端設定模式，或由系統自動管理。
11. **ChatWidget 擴充**：目前為 WebSocket 連線，未來可考慮整合書籍文本搜尋、圖譜查詢能力，讓 AI 助手能主動引用書中原文。
