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
.pill { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; padding: 2px 7px; border-radius: 20px; }
.pill-dot { width: 5px; height: 5px; border-radius: 50%; }
// .pill-char / .pill-loc / .pill-con / .pill-evt — background / border / color / dot 色碼見 DESIGN_TOKENS.md
```

---

## 2. 導航架構

### 2.1 全站層級（左側 Sidebar）

固定在所有頁面左側，寬度 48px，icon-only。底部有語言切換按鈕（Globe icon）。

| Icon | 目的地 | 路由 | 狀態 |
|------|--------|------|------|
| Home | 書庫首頁 | `/` | 已實作 |
| Upload | 上傳 & 處理進度 | `/upload` | 已實作 |
| BookOpen | 框架索引 | `/frameworks` | 已實作 |
| Search | 全站搜尋 | — | 佔位（disabled） |
| BarChart3 | Token 用量 | `/token-usage` | 已實作 |
| Settings | 設定 | `/settings` | 已實作 |
| Globe（底部）| 語言切換（zh-TW ↔ EN） | — | 已實作 |

### 2.2 書籍層級（Top Nav Tab）

進入特定書籍後，top nav 顯示書名、「← 書庫」返回入口，以及 8 個 tab：

| Tab | 路由 |
|-----|------|
| 閱讀 | `/books/:bookId` |
| 角色分析 | `/books/:bookId/characters` |
| 事件分析 | `/books/:bookId/events` |
| 知識圖譜 | `/books/:bookId/graph` |
| 時間軸 | `/books/:bookId/timeline` |
| 張力分析 | `/books/:bookId/tension` |
| 象徵意象 | `/books/:bookId/symbols` |
| 展開卷軸 | `/books/:bookId/unraveling` |

### 2.3 頁面層級關係

```
全站 Sidebar
  ├─ 首頁              /
  ├─ 上傳 & 處理進度   /upload
  ├─ 框架索引          /frameworks
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
       └─ 展開卷軸      /books/:bookId/unraveling
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

#### 欄 1 — 書籍總覽

書籍封面佔位圖、書名（serif）、作者、status badge、書籍摘要、關鍵數字（章節/Chunk/實體/關係數）、實體分佈 pill。

#### 欄 2 — 章節列表

每章一卡，點擊即展開並同時載入欄 3 chunks：展開後顯示章節摘要 + keywords + 主要實體 pill。選中章節有 accent 邊框 + 左側 accent bar。

#### 欄 3 — Chunk 內容

每個 chunk 一個白色 card，含 chunk 編號、實體高亮正文（serif）、實體 pill。欄 3 標題列固定顯示章節名 + chunk 總數。

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

#### 版面結構

最多三層，第三層切換時替換：

```
[圖譜 Canvas（全幅）] [實體詳情面板（right）] [第三層：分析或段落（rightmost）]
```

所有面板均為**暖白底**（`var(--bg-primary)`），`border-left: 1px solid var(--border)`。

#### 圖譜 Canvas

- Cytoscape.js 渲染，force-directed layout
- 節點大小依 `chunkCount` 縮放（20px–60px）
- 節點顏色依實體類型（character 藍 / location 綠 / concept 紫 / event 紅）
- 選中節點：accent 色邊框，連出 edge 加深，其餘淡化

#### 浮動工具欄（左上角，GraphToolbar）

```
[搜尋欄]
[type checkbox: character / location / concept / event]
[重置視圖]
[推斷關係按鈕（狀態驅動，見下）]
[動畫模式: fade / stagger]
```

**推斷關係按鈕**（InferredEdge / Link Prediction）：

| 狀態 | 顯示 | 樣式 |
|------|------|------|
| 未執行 | 「執行推論」 | 預設灰色 |
| 執行中 | spinner + 「推論中…」 | disabled |
| 有資料（隱藏中） | 「顯示推斷關係」 | 橘色邊框 |
| 顯示中 | 「隱藏推斷關係」 | 橘色背景 |

推斷邊（Common Neighbors + Adamic-Adar 演算法）以虛線樣式呈現，點擊後從右側展開 **InferredEdgePanel**（可確認或拒絕該推斷關係）。

#### 附加控制工具

**TimelineControls（左下角，章節快照）**：
- 選擇章節 N → 圖譜僅顯示該章節前出現過的節點與關係（temporal snapshot 模式）
- 讓用戶「從頭追蹤圖譜的演變」

**EpistemicOverlay（章節快照上方，認知視角疊加）**：
- 選擇一個角色 → 灰底虛線標示「此角色在指定章節前尚不知曉的節點」
- 需搭配 TimelineControls 指定章節
- 狀態持久化至 localStorage（`graph:${bookId}:epistemic:*`）

**縮放控制（右下角）**：+ / − 按鈕

**統計（右下角）**：節點數、關係數（動態位移，避免與面板重疊）

#### 實體詳情面板（EntityDetailPanel / EventDetailPanel）

節點類型 ≠ `event` → 使用 EntityDetailPanel；節點類型 = `event` → 使用 EventDetailPanel。

面板寬 260px，固定在右側，選中節點後出現。

**EntityDetailPanel** 包含（accordion）：
1. **實體資訊**（預設展開）：名稱、類型 pill、描述
2. **深度分析**（預設展開）：已生成顯示文字 + 重生成按鈕；未生成顯示引導按鈕「生成深度分析 →」
3. **相關段落**（預設收合）：chunk 總數，點擊 → 推出第三層段落面板

**EventDetailPanel** 包含事件相關資訊（參與者、時序位置等）。

#### 第三層面板（右側次面板，width 依類型）

三種面板**同時只能顯示一種**，切換時替換不疊加。

| 類型 | 寬度 | 觸發方式 |
|------|------|---------|
| AnalysisPanel（分析全文） | 360px | 點擊「查看分析」|
| ParagraphsPanel（相關段落） | 400px | 點擊「相關段落」|
| InferredEdgePanel（推斷關係審核）| — | 點擊推斷邊 |

**ParagraphsPanel** 段落按章節分組（sticky 章節標題），每條 chunk 顯示 SegmentRenderer（保留實體高亮）。

#### 狀態流程

```
進入頁面
  → 載入圖譜資料
  → 解析 query param ?entity= → 自動選中對應節點

點擊節點
  → 若 event 節點 → EventDetailPanel
  → 若 entity 節點 → EntityDetailPanel

點擊「查看分析」→ 推出 AnalysisPanel（第三層）
點擊「相關段落」→ 推出 ParagraphsPanel（第三層）
點擊其他節點（第三層開啟中）→ 第三層隨選中節點同步更新

點擊推斷邊 → 推出 InferredEdgePanel → 可確認或拒絕
執行推論 → 刷新圖譜與推斷關係資料

TimelineControls 切換章節 → 重新請求圖譜（帶 timeline 參數）
EpistemicOverlay 選擇角色 → 疊加灰化樣式（不重新請求圖譜）
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#9（圖譜資料）、#9b（實體相關段落）、#10a–#10d（推斷關係 run / fetch / confirm / reject）、#11（事件詳情）、#12a–#12b（TimelineConfig）、#12c（detect-timeline）、#12d（classify-visibility）、#12e（認知狀態）、#7a（實體分析）、#7b（觸發實體分析）、#8（任務 polling）

---

### 3.7 時間軸頁 `/books/:bookId/timeline`

> 後端設計見 [`docs/guides/PHASE_9_TEMPORAL_TIMELINE.md`](guides/PHASE_9_TEMPORAL_TIMELINE.md)

#### 版面結構

```
[Toolbar 固定頂部] [時間軸主區 flex] [事件詳情面板 320px，點擊後展開]
```

#### 3.7.1 頂部工具列（固定）

```
左側:
  [章節順序 ▾ / 故事時序 ▾ / 矩陣視圖 ▾]  ← 三選一 select
  [⇄ 水平 / ↕ 垂直]                        ← layout 方向（矩陣模式下隱藏）

中央:
  [品質指示器] — EEP 覆蓋率 + 時序計算狀態

右側:
  [Filter ▾]
  [重新計算時序]
```

#### 3.7.2 時間軸主區

事件節點大小依 `event_importance`（KERNEL 48px / SATELLITE 32px）；顏色依 `narrative_mode`（見 `docs/domain-glossary.md`）。

連線雙層：底層順序線（虛線低透明度）+ 上層 TemporalRelation 邊（依 confidence 實線或虛線）。

Parallel 事件群組：`narrativeMode === 'parallel'` 的連續事件收為群組，外框紫色虛線。

#### 3.7.3 Filter Dropdown

多選 checkbox：事件類型 / 敘事模式 / 角色 / 地點 / 重要性（KERNEL / SATELLITE）。

#### 3.7.4 事件詳情面板（右側 320px）

accordion 結構：
1. 事件概要（預設展開）
2. 時序關係（預設展開）：前驅 / 後續事件（可點擊跳轉）
3. EEP 證據剖析（預設收合）
4. 因果分析（有資料時顯示）
5. 影響分析（有資料時顯示）

#### 3.7.5 矩陣視圖（Fabula-Sjuzhet Matrix）

X 軸 = 敘事順序（章節），Y 軸 = 故事時序（`chronological_rank` 0.0→1.0）。
散點顏色依 `narrative_mode`，框選多個散點可批次查看。
`chronological_rank = null` 的事件放在 Y = -0.1，灰色半透明。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#13a（時間軸資料）、#13b（觸發時序計算）、#11（事件詳情）、#8（任務 polling）

---

### 3.8 張力分析頁 `/books/:bookId/tension`

> 術語定義（TEU、TensionLine、TensionTheme 等）見 `docs/domain-glossary.md`。

#### 版面結構

```
[主內容區，單欄 maxWidth: 800px 置中]
  ├─ Header（頁面標題 + 書名）
  ├─ 三步驟工作流
  ├─ TensionLine 軌跡圖
  ├─ TensionLine 審核列表
  └─ TensionTheme 面板
```

#### 三步驟工作流（StepButton）

每個步驟以卡片按鈕呈現，已完成的步驟顯示綠色邊框 + ✓；執行中顯示 spinner；步驟 3 在步驟 2 未完成時 disabled。

| 步驟 | 完成後顯示 |
|------|----------|
| Step 1：分析 TEU | 組裝 N 個 TEU，找出 M 個候選 |
| Step 2：聚合 TensionLine | 找出 N 條張力線 |
| Step 3：合成 TensionTheme | 主題命題已生成 |

每個步驟 polling 進度，顯示 `stage` 和 `progress`。

#### TensionLine 軌跡圖

SVG 橫條圖（`overflowX: auto`）：
- X 軸 = 章節序號（垂直輔助線）
- 每條 TensionLine 一列橫條，顯示 `chapter_range` 跨度
- 橫條顏色依 `intensity_summary`（低→藍，高→橘紅）
- 被 reject 的 TensionLine `opacity: 0.4`，橫條色退灰

#### TensionLine 審核（TensionLineCard）

每條 TensionLine 一張 accordion 卡片，展開後可執行：
- ✓ **Approve**（綠）：確認這條張力線
- ✎ **Modify**（藍）：inline 編輯兩極名稱（Pole A / Pole B），送出後狀態變 `modified`
- ✕ **Reject**（紅）：標記排除

卡片標題列顯示：`PoleA vs PoleB`、TEU 數量、章節跨度、強度百分比、狀態 badge（`pending / approved / modified / rejected`）

狀態對應邊框顏色：
- pending → 灰
- approved → 綠
- modified → 藍
- rejected → 紅

#### TensionTheme 面板（TensionThemePanel）

位於頁面最下方，Step 3 完成後出現。

內容：
- 主題命題（`proposition`）文字，可 inline 編輯
- Frye Mythos badge（`romance / tragedy / comedy / irony`）
- Booker Plot badge（7 大基本情節）
- 審核操作：Approve / Modify proposition / Reject

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

#### 版面結構

```
[Left Panel 240px] [Content Area flex]
```

#### Left Panel — 意象清單

頂部類型 filter chip（all / object / nature / spatial / body / color / other，依實際資料動態顯示）。

搜尋欄 + 清單（每項：色點 + 詞條 + 別名 + 出現次數）。

#### Content Area — 意象詳情（SymbolDetail）

選中意象後顯示：

1. **標題區**：詞條（serif）+ 類型 pill + 出現頻率 + 別名列表
2. **章節分布圖（ChapterDistChart）**：SVG 長條圖，X 軸為章節序號，Y 軸為出現次數，右上角顯示首次出現章節
3. **共現詞（Co-Occurrences）**：同一 chunk 中常與此詞共現的其他意象，以 pill 呈現，點擊 pill → 切換選中意象（支援導覽）
4. **出現紀錄（Timeline）**：每次出現一列，顯示：Ch.N / #position、前後文 context window、共現詞 tags

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#15a（意象列表）、#15b（出現紀錄）、#15c（共現詞）

---

### 3.10 展開卷軸頁 `/books/:bookId/unraveling`

#### 功能目的

1. **可見性**：讓用戶清楚知道「這本書被分析到了什麼程度」
2. **診斷性**：功能不可用時，可來此確認哪個資料層尚未建立
3. **依賴關係的呈現**：DAG 反映建構依賴——同層平行，依賴方向左→右

#### 版面結構

```
[DAG Canvas — 全幅，支援 pan/zoom] [Detail Panel 280px，點擊節點後展開]
```

#### DAG 節點層次

| Layer | 節點名稱 | 形狀 |
|-------|---------|------|
| 0 — Text Layer | Book Meta / Chapters / Paragraphs | diamond |
| 1 — KG Layer | Entities / Relations / Events | rectangle |
| 2 — Analysis Layer | Temporal / Symbols / Character Analysis / Event Analysis / Narrative Structure / Tension Analysis | round-rectangle |

#### 節點狀態

| 狀態 | 顏色 |
|------|------|
| `complete` | 綠底綠框 |
| `partial` | 黃底黃框 |
| `empty` | 灰底灰框 |

**已實作**：點擊節點 → Detail Panel 顯示數量明細（counts）

**規劃中（尚未實作）**：
- 展開互動：Detail Panel 瀏覽該層原始資料
- 觸發互動：`empty/partial` 節點可觸發對應 pipeline 建構

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#19（展開卷軸 DAG）

---

### 3.11 框架索引頁 `/frameworks`

全站層級，不屬於任何書籍。三層閱讀結構：

```
[Left Sidebar] [框架列表 200px] [TOC 180px] [文件內容 flex]
```

框架分組：角色分析（Jung 12 / Schmidt 45）、事件分析（敘事理論）、未來框架（佔位）。

#### 從角色分析頁跳入

```
/frameworks?framework=jung     → 自動選中 Jung 原型
/frameworks?framework=schmidt  → 自動選中 Schmidt 類型
```

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
7. **展開卷軸 — 觸發互動**：在 UnravelingPage 的 Detail Panel 內直接觸發對應 pipeline 建構。
8. **時間軸 — 因果鏈聚焦模式**：toggle 僅顯示 `relation_type = causes` 的邊與相關事件。
9. **時間軸 — 角色弧線模式**：選定角色後，僅顯示該角色參與的事件。
10. **設定頁大改版**：當前 KG backend 切換方式過於技術導向，未來改為更清晰的儲存後端設定模式，或由系統自動管理。
11. **ChatWidget 擴充**：目前為 WebSocket 連線，未來可考慮整合書籍文本搜尋、圖譜查詢能力，讓 AI 助手能主動引用書中原文。
