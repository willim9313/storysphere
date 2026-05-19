# 時間軸頁重新設計 — Design Handoff

**日期**：2026-05-19
**範疇**：`/books/:bookId/timeline`（`TimelinePage` 及其底下 `MatrixCanvas`）
**設計系統**：沿用既有 Token 系統；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）
**設計參考**：無設計稿；請根據設計系統自行規劃，並參考 `EventAnalysisPage` 與 `CharacterAnalysisPage`（已完成重設計）的視覺語言與元件慣例維持一致性

---

## 1. 重新設計動機

- **主要痛點：視覺質感粗糙，使用者難以快速進入狀況**。畫面整體仍停留在「能用」階段：
  - Toolbar、節點、面板、Filter dropdown 各自用 inline style 拼接，沒有統一的視覺節奏
  - 進頁後沒有任何「這是什麼頁」的脈絡引導，使用者面對一堆圓點與 pills 無從下手
  - 三種視圖之間切換時，沒有任何視覺說明告訴使用者「為什麼要用矩陣視圖」「故事時序 vs 章節順序的差別」
- **次要觀察（一般般，但重設計時順便處理）**：
  - 節點顏色（narrative mode）與 entity pill 顏色（character/location/...）同時出現，雙重編碼造成色彩噪音
  - 事件詳情面板 5 個 accordion 視覺權重一致，沒有層次感
  - 「資料完整度」（quality indicator）放在 Toolbar 中央但視覺很弱，當 `hasChronologicalRanks === false` 時沒有強引導
- **主要使用者情境**：
  - 第一次進入時間軸頁的使用者能在 3 秒內理解這頁在呈現什麼、可以做什麼
  - 分析者快速掃完 KERNEL 事件並理解前後因果鏈
- **成功指標**：頁面有清楚的視覺重心與層次；陌生使用者不需指引也能判斷三視圖的差異與用途；面板資訊有明確主從關係

---

## 2. 範疇（hard scope）

### 包含
- 主畫面 `TimelinePage`（Toolbar + 主畫布 + 右側詳情面板）
- Toolbar：視圖切換 segmented control、layout 方向切換、Filter dropdown、QualityIndicator、「重新計算時序」按鈕
- Filter dropdown：5 個分類（eventTypes / narrativeModes / characters [可搜尋] / locations / importance）
- 主畫布的兩種呈現：
  - `TimelineCanvas`（narrative / chronological 模式）：含 chapter band、parallel group、SVG spine 與 CAUSES 連線
  - `MatrixCanvas`（matrix 模式）：d3 散點圖、degraded zone、45° 參考線、brush 框選、tooltip、legend
- `EventNode`（節點大小依 importance、顏色依 narrative mode、entity pills）
- `EventDetailPanel`（右側 320px，5 個 accordion section）
- 各種狀態：loading / error / 無事件 / 計算中（polling）/ 無 analysis 資料

### 不包含（保留現狀）
- 後端 API 形狀（`TimelineData` / `TimelineEvent` / `TemporalRelation` / `TimelineQuality` 不動，僅外觀與排版可改）
- 路由與資料載入策略（`useTimeline` query keys 不動）
- Task polling 機制（`useTaskPolling`、`computeTimeline` 流程不動）
- 各 narrative mode 顏色 token 的「語意」配色（present/flashback/flashforward/parallel/unknown 對應到既有 narrative tokens，可微調飽和度/對比，不可整組換配色）
- 矩陣模式核心演算法（X=chapter / Y=chronological_rank / degraded row at -0.1 / 45° 參考線），視覺可改但語意保留
- ChatContext 整合（`setPageContext`、`selectedEntity` 同步）

---

## 3. 現況快照（必讀，避免憑空設計）

### 3.1 資訊架構

```
[Toolbar 固定頂部，水平]
  Left:                                Center:                 Right:
    [Segmented: 章節順序/故事時序/矩陣]    [QualityIndicator]      [重新計算時序]
    [⇄ 水平 / ↕ 垂直]（矩陣模式隱藏）        ■■■■□ N/M (P%) · 已排序
    [⏷ Filter (N)]

[FilterDropdown — absolute, 左 16 / 上 48, 320 寬, 480 max-height]
  ├─ Event types (checkbox flex-wrap)
  ├─ Narrative modes (checkbox)
  ├─ Characters (搜尋輸入 + checkbox 列)
  ├─ Locations (可選)
  ├─ Importance (KERNEL / SATELLITE)
  └─ [重設]                              [套用]

[主區 flex-1 overflow]
  ├─ 主畫布 flex-1 （TimelineCanvas 或 MatrixCanvas）
  └─ EventDetailPanel 320px（僅 selectedEventId 存在時掛載）
       ├─ Header: 標題（serif）+ Ch.X · narrativeMode · importance
       ├─ Accordion 1. 事件概要（預設展開）
       ├─ Accordion 2. 時序關係（預設展開）
       ├─ Accordion 3. EEP 證據剖析（預設收合）
       ├─ Accordion 4. 因果分析（預設收合）
       └─ Accordion 5. 影響分析（預設收合）
```

### 3.2 三種視圖的差異

| 視圖 | order 值 | 取資料策略 | 主畫布元件 | layout 切換 |
|------|---------|----------|----------|------------|
| 章節順序 | `narrative` | GET timeline?order=narrative | `TimelineCanvas` + chapter band | ✅ 顯示 |
| 故事時序 | `chronological` | GET timeline?order=chronological | `TimelineCanvas`，**無** chapter band | ✅ 顯示 |
| 矩陣視圖 | `matrix` | 沿用 `narrative` 的資料（前端切換渲染） | `MatrixCanvas`（d3） | ❌ 隱藏 |

> 注意：`useTimeline.ts` 把 `matrix` 映射回 `narrative` 來 fetch（同一份資料、不同渲染）。

**故事時序與矩陣的可用性條件**：`quality.hasChronologicalRanks === false` 時，這兩個 tab 顯示 warning dot；tooltip 提示需先「重新計算時序」。tab 仍可點，但內容對未排序事件會降級呈現。

### 3.3 `TimelineCanvas`（narrative / chronological）細節

- **layout**：horizontal（events 由左向右）或 vertical（由上向下）。切換按鈕在 Toolbar。
- **chapter band**（僅 narrative 模式）：依 chapter 分組，外框 `--accent` 邊線 + `--timeline-chapter-bg` 底色，章節標題 13px。
- **parallel group**：`narrativeMode === 'parallel'` 的連續事件用 dashed 紫色邊框收為一組（`--timeline-parallel-border`、`--timeline-parallel-bg`），group 內方向與整體 layout 相反（horizontal layout → parallel group 內垂直疊）。
- **spine polyline**：SVG overlay，淡灰色 (`--fg-muted` opacity 0.3)，連起所有節點中心。
- **CAUSES 邊**：只畫 `temporalRelation.type === 'CAUSES'` 且 `confidence ≥ 0.5`；高信心（≥0.8）實線、低信心虛線；顏色 `--timeline-causal-stroke`；末端有箭頭 marker。`BEFORE/SIMULTANEOUS/DURING` 不畫，避免線雜訊。
- **gap**：events 之間 120px；chapter band 內 80px；parallel group 內 40px。

### 3.4 `EventNode` 結構

```
（horizontal layout 範例）
    [entity pills]        ← 上方：character/location pills，未 highlighted 時 opacity 0.25
        ●                 ← 節點圓（KERNEL 48 / SATELLITE 32 / default 36）
                            背景色與邊框依 narrative mode；selected 時加 3px ring
                            narrative != 'present' 時左上有 badge（⏪ flashback / ⏩ flashforward / ⏸ parallel / ? unknown）
    事件名稱（line-clamp:2, max 110px wide）
    Ch.N
```

- **不通過 filter 的節點**：`opacity: 0.1` + `pointer-events: none`（不消失，只淡化）
- **角色 filter 啟用時**：該角色相關 pill `opacity 1.0`，其他 pill `opacity 0.25`
- **hover / select**：節點 `scale 1.10`；select 時所有 pill `opacity 1.0`

### 3.5 `MatrixCanvas`（d3 散點圖）

- 純 d3（不是 React 渲染），透過 `useEffect` 重畫
- X 軸：discrete 章節（`Ch.1, Ch.2, ...`），等距分佈
- Y 軸：`chronologicalRank` 0.0–1.0；額外保留 -0.1 的 degraded row 給 `chronologicalRank == null` 事件
- 45° 虛線參考線：左下到右上，表示「完全按故事順序敘事」的對照
- Dot 半徑：KERNEL 8 / SATELLITE 5 / default 6
- 顏色：依 narrative mode；degraded row 強制 unknown 色
- **brush 框選**：在 plot 區內拖選，未選中的 dot opacity 降到 0.15；釋放後 brush 框消失但 highlight 保持
- Tooltip：hover dot 顯示 title / Ch / mode / rank / participants（位於 dot 右上）
- Legend：右上角，四種 narrative mode 圓點對照

### 3.6 `EventDetailPanel`（5 個 accordion）

| Section | sectionKey | 預設 | 資料來源 |
|---------|-----------|------|---------|
| 事件概要 | `summary` | 展開 | `event.description` + `event.storyTimeHint` + participants/location pills |
| 時序關係 | `temporal` | 展開 | `analysis.eep.priorEventIds` + `subsequentEventIds`（點擊跳轉並 scrollIntoView）+ `event.chronologicalRank` |
| EEP 證據剖析 | `eep` | 收合 | `analysis.eep`（stateBefore/After、causalFactors、participantRoles、consequences、structuralRole、importance、thematicSignificance、keyQuotes、topTerms） |
| 因果分析 | `causality` | 收合 | `analysis.causality`（rootCause、causalChain、chainSummary） |
| 影響分析 | `impact` | 收合 | `analysis.impact`（affectedParticipantIds、participantImpacts、relationChanges、impactSummary） |

**Header**：標題（serif，truncate）+ subtitle = `Ch.X · narrativeMode · importance`，右上 X 關閉按鈕。
**外觀**：320px 寬，使用 panel token（`--panel-bg` / `--panel-fg` / `--panel-border` / `--panel-bg-card`），整體較暗（與主畫布形成深淺對比）。
**狀態**：analysis fetch 失敗或無資料 → 各 section 顯示「尚未分析」提示。analysis 載入中 → spinner + loading 文字。

### 3.7 主要互動流程

```
進入頁面
  → useTimeline 拉 GET /books/:bookId/timeline?order=narrative
  → 主畫布渲染；無 selectedEventId → 右側面板不掛載

點擊事件節點：
  → setSelectedEventId
  → ChatContext.setPageContext({ selectedEntity })
  → 面板掛載；面板內部用 useQuery 拉 GET /books/:bookId/events/:eventId/analysis（#7d）
  → 「時序關係」accordion 顯示 prior/subsequent，可點擊跳轉（scrollIntoView smooth）

切換視圖 tab：
  → setOrder → useTimeline 重新拉資料（matrix 沿用 narrative 資料）

切換 layout：
  → setLayout（純前端）；矩陣模式下按鈕隱藏

開 Filter dropdown：
  → 多選 checkbox 改 filter state
  → passesFilter map 即時更新；節點淡化 / 顯示
  → 「重設 / 套用」按鈕（套用 = 關閉 dropdown）

點「重新計算時序」：
  → POST /books/:bookId/timeline/compute → taskId
  → useTaskPolling 輪詢 #8；按鈕變「計算中…」disabled
  → done → invalidate timeline query → 重新渲染

點 QualityIndicator：
  → navigate(`/books/:bookId/analysis`)（前往事件分析頁觸發 EEP 生成）
```

### 3.8 狀態機（主畫布）

| 狀態判定條件 | 顯示內容 |
|------------|---------|
| `isLoading` | LoadingSpinner（全頁） |
| `error` | ErrorMessage（全頁） |
| `events.length === 0` | 居中提示「無事件」 |
| `isComputing` | Toolbar 按鈕變「計算中…」+ spinner，畫布仍顯示舊資料 |
| `selectedEvent && analysisLoading` | 主畫布正常；面板各 section 顯示 loading |
| `selectedEvent && !analysis` | 面板顯示「尚未分析」提示（但時序關係仍會顯示 chronologicalRank） |
| `quality.hasChronologicalRanks === false` | chronological/matrix tab 顯示 warning dot |

### 3.9 與其他頁面的整合

- `ChatContext.setPageContext({ page: 'timeline', bookId, bookTitle, selectedEntity })`：選中事件時同步 entity context 給聊天助手
- 面板「前驅 / 後續事件」按鈕：同頁跳轉，不是 navigate
- QualityIndicator 點擊：`navigate('/books/:bookId/analysis')`

---

## 4. 資料 / API 參考

### 主要型別（完整定義見 `frontend/src/api/generated.ts`）

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
  source: string;
  target: string;
  type: string;      // 'before' | 'causes' | 'simultaneous' | 'during'
  confidence: number;
}

interface TimelineQuality {
  eepCoverage: number;          // 0.0–1.0
  analyzedCount: number;
  totalCount: number;
  hasChronologicalRanks: boolean;
}

// 面板拉的 EEP 詳情（同事件分析頁）
interface EventAnalysisDetail {
  eventId: string;
  title: string;
  eep: EventEvidenceProfile;     // 含 priorEventIds / subsequentEventIds / participantRoles ...
  causality: CausalityAnalysis;
  impact: ImpactAnalysis;
  summary: { summary: string };
  analyzedAt: string;
}
```

### 相關 endpoints（完整定義見 `docs/API_CONTRACT.md`）

- `#13a` 時間軸資料：`GET /books/:bookId/timeline?order=narrative|chronological|matrix`
- `#13b` 觸發時序計算：`POST /books/:bookId/timeline/compute` → `{ taskId }`
- `#7d`  事件分析詳情：`GET /books/:bookId/events/:eventId/analysis`（面板開啟時拉）
- `#8`   Task polling

### 領域術語（完整見 `docs/domain-glossary.md`）

- `narrative_mode` — 敘事模式（present / flashback / flashforward / parallel / unknown）：用顏色編碼
- `event_importance` — KERNEL / SATELLITE：用節點大小編碼（**不以顏色區分，避免與 narrative mode 雙重編碼**）
- `chronological_rank` — 0.0–1.0 的故事時序位置，null = 尚未計算
- Fabula（故事真實時序）/ Sjuzhet（敘事順序）：矩陣視圖的 X/Y 概念

---

## 5. 必要保留（hard constraint）

- **資料形狀**：API response schema 不動（重設計 = 視覺與排版，非後端）
- **三視圖 + 兩 layout 的組合**：narrative / chronological / matrix 三 tab 不可裁；horizontal/vertical 切換在 narrative / chronological 模式下不可裁
- **節點視覺編碼規則**：大小 = importance、顏色 = narrative mode。**這是 domain-glossary.md 明文規定，不可換軸**（但顏色階層、節點形狀、邊框樣式可重新設計）
- **Task polling 流程**：trigger → polling → invalidate → 刷新，這個 flow 不動
- **Token 制度**：禁止硬編碼色碼；色碼一律用 `var(--*)`；新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`
- **TypeScript 型別來源**：一律從 `frontend/src/api/generated.ts` 取，不可在 `types.ts` 手寫新增
- **i18n**：所有文案必須走 `useTranslation('analysis')`，namespace 為 `analysis`，key 前綴為 `timeline.*`，不可硬寫中文/英文
- **ChatContext 整合**：選中事件時 `setPageContext({ selectedEntity })`，導航時清除（這部分由 `useEffect` 處理，不可移除）
- **矩陣視圖核心語意**：X = chapter / Y = chronological_rank 0–1 / -0.1 degraded row / 45° 對照線（視覺可改、語意不可改）

---

## 6. 可變更的設計面向

- **Toolbar 排版**：目前是「左 tabs + layout + filter / 中 quality / 右 recompute」三段式。可改：
  - QualityIndicator 提升成顯眼狀態卡（讓使用者意識到「資料完整度」是頁面前提）
  - Recompute 按鈕的位置與層級（特別是 `hasChronologicalRanks === false` 時應更醒目地引導使用者點它）
- **視圖切換的呈現**：目前是 segmented control + 兩個 warning dot；可改為更明顯的「模式說明 + 切換」（如附小型示意 icon 區分三種視圖）
- **FilterDropdown**：目前是 absolute 浮層 + flex-wrap checkbox；資訊密度低、無 hover preview。可改：
  - 改為 inline 側欄 / sheet / 可釘在側邊
  - 加 active chip 顯示已選條件（在 Toolbar 上方水平展開）
- **EventNode 視覺**：
  - 是否仍用「圓 + 上方 pills + 下方標題」三件式？可考慮 card 化、icon 化或卡片化以減少 pills 散亂
  - parallel group 的視覺（目前 dashed 紫框）能否更具語意（如時間分支表示）
- **TimelineCanvas 連線**：spine polyline + CAUSES 邊；可加：
  - 點 highlight 對應事件時，spine 對應段加深
  - CAUSES 邊的 label / hover preview
- **MatrixCanvas**：
  - 加密度視覺（章節 column 的事件數 histogram、或 marginal distribution）
  - 加 quadrant 標註（左上 = 預敘 / 右下 = 倒敘）
  - 加軸刻度說明的 hover tip
- **EventDetailPanel**：
  - 5 accordion 全用同款外觀 → 可改為 hero card（標題 + importance + thematicSignificance）+ sub-sections 的層次
  - 「時序關係」可從 accordion 升級為小型 mini-timeline，顯示前驅 → 當前 → 後續的視覺化條
  - 拓寬 / sticky / 浮層化（目前固定 320px，主畫布變窄時擁擠）
- **狀態頁（empty / loading / error / no-ranks）** 的呈現
- **資料完整度引導**：`quality.eepCoverage` 低 / `hasChronologicalRanks` false 時，應有更顯眼的「先去事件分析頁」/「先計算時序」引導

---

## 7. 與其他已重設計頁的一致性參考

時間軸頁的版面骨架與分析頁不同（**沒有**左側 260px 清單），是 Toolbar + 主畫布 + 右側 panel 的三段式。但仍需在以下面向保持風格一致：

- 與 `CharacterAnalysisPage` / `EventAnalysisPage` 共用的小元件樣式：標題 serif、按鈕 padding、segmented control 樣式、accordion ChevronDown/Right 圖示與配色
- panel 區的暗色配色（`--panel-bg` 系列）應與事件分析頁的 panel 一致
- CSS class 命名慣例：CharacterAnalysisPage 用 `.ca-*`、EventAnalysisPage 用 `.ea-*`；**時間軸頁目前完全是 inline style + tailwind，沒有對應的 CSS 檔**。重設計請新建 `frontend/src/styles/timeline.css` 並使用 `.tl-*` prefix

完整樣式參考：
- `frontend/src/styles/character-analysis.css`
- `frontend/src/styles/event-analysis.css`
- `frontend/src/pages/CharacterAnalysisPage.tsx`
- `frontend/src/pages/EventAnalysisPage.tsx`

---

## 8. 對應 UI_SPEC 與 API_CONTRACT 段落（直接引用，不重複內容）

- UI 規格細節：`docs/UI_SPEC.md` § 3.7（時間軸頁）— 含子節 3.7.1 工具列 / 3.7.2 主區 / 3.7.3 Filter / 3.7.4 事件詳情面板 / 3.7.5 矩陣視圖
- API 規格：`docs/API_CONTRACT.md` § 13a / 13b / 7d / 8
- Token 對照表：`docs/DESIGN_TOKENS.md`（重點看 narrative-* / timeline-* / panel-* / entity-* 系列）
- 領域術語（narrative_mode / event_importance / chronological_rank / Fabula-Sjuzhet）：`docs/domain-glossary.md`
- 後端時序計算演算法：`docs/guides/PHASE_9_TEMPORAL_TIMELINE.md`

### 既有檔案清單（受重設計影響）

| 檔案 | 用途 | 重設計時的處理 |
|------|------|--------------|
| `frontend/src/pages/TimelinePage.tsx` | 主頁面，含 Toolbar / FilterDropdown / TimelineCanvas / EventNode / EventDetailPanel / PanelAccordion / PillTag / LabeledField / EventLinkList（**單檔 1840 行**） | 視重設計拆分為 components/timeline/* |
| `frontend/src/components/timeline/MatrixCanvas.tsx` | d3 矩陣散點圖 | 視覺可改；保留 X/Y/degraded row/45° 線語意 |
| `frontend/src/hooks/useTimeline.ts` | timeline 資料 query（matrix 沿用 narrative） | 不需動 |
| `frontend/src/api/timeline.ts` | `fetchTimeline` / `computeTimeline` | 不需動 |
| `frontend/src/api/types.ts` 或 `frontend/src/api/generated.ts` | `TimelineEvent` / `TemporalRelation` / `TimelineData` / `TimelineQuality` 等型別 | **只從 generated.ts 取，不可手寫** |
| `frontend/src/i18n/locales/{zh-TW,en}/analysis.json` | `timeline.*` 文案 key | 新增 key 必須兩語系同步 |
| `frontend/src/styles/tokens.css` | `--narrative-*` / `--timeline-*` / `--panel-*` / `--entity-*` token | 新增 token 需同步更新 `docs/DESIGN_TOKENS.md` |
| `frontend/src/styles/timeline.css` | **目前不存在**，建議新建 | 將 inline style 提取為 `.tl-*` class |
| `frontend/src/contexts/ChatContext.tsx` | `setPageContext` / `selectedEntity` 同步 | 不需動，但重設計時要確保仍有對應呼叫 |

### Hooks / Context 依賴（不要動，但會用到）

- `useTimeline(bookId, order)` — timeline data
- `useTaskPolling(taskId)` — 重新計算時序的 polling
- `useBook(bookId)` — 取得 book.title 給 ChatContext
- `useQuery` + `fetchEventAnalysisDetail` — 面板開啟時拉事件分析詳情
- `useChatContext().setPageContext` — 同步 selectedEntity

### 注意事項

1. **單檔 1840 行**：`TimelinePage.tsx` 把 Toolbar / FilterDropdown / TimelineCanvas / EventNode / EventDetailPanel / Accordion / Pill 全塞在一起，是重設計的副產品最佳拆分時機。建議拆為：
   ```
   frontend/src/components/timeline/
     ├─ TimelineToolbar.tsx
     ├─ QualityIndicator.tsx
     ├─ FilterDropdown.tsx
     ├─ TimelineCanvas.tsx
     ├─ EventNode.tsx
     ├─ MatrixCanvas.tsx  (已存在)
     ├─ EventDetailPanel.tsx
     └─ panel/
         ├─ SummarySection.tsx
         ├─ TemporalSection.tsx
         ├─ EepSection.tsx
         ├─ CausalitySection.tsx
         └─ ImpactSection.tsx
   ```
2. **節點顏色 vs entity pill 顏色**：節點本身用 narrative-* token、pill 用 entity-* token，**兩組顏色目前同時出現在同一個視覺單位上**。重設計需處理顏色衝突（建議：弱化 pill 顏色、讓節點顏色主導；或讓 pill 顏色變灰，only highlight 時恢復）
3. **MatrixCanvas 內 `modeColor` 用 `getComputedStyle`**：直接從 DOM 讀 CSS variable，重設計時要確保新 token 也加進去
