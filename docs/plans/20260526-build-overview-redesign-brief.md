# 建構概覽頁（Build Overview）重設計 Brief

> 交給 Claude Design 的設計參考文件。  
> 作者：自動整理（2026-05-26）

---

## 1. 頁面定位

**路由**：`/books/:bookId/unraveling`  
**Tab 名稱**：建構概覽（最後一個 tab）  
**進入路徑**：書籍層級 Top Nav 最右側的 "建構概覽" tab

### 功能目的

1. **可見性**：讓用戶清楚知道「這本書被分析到了什麼程度」
2. **診斷性**：功能不可用時，可來此確認哪個資料層尚未建立
3. **依賴關係呈現**：DAG 反映建構依賴——同層平行，依賴方向左→右

---

## 2. 當前實作概述

### 2.1 版面結構

```
[Info Panel 220px] [DAG Canvas 全寬，支援 pan/zoom] [Detail Panel 280px（點擊節點後展開）]
```

三欄佈局：
- **左欄**（InfoPanel）：靜態說明文字，固定 220px
- **中欄**（DAG Canvas）：Cytoscape.js 繪製的 DAG 圖，支援 pan/zoom
- **右欄**（NodeDetailPanel）：點擊節點後展開，顯示 counts 數字明細

### 2.2 DAG 節點層次

| Layer | 說明 | 節點形狀 | 代表節點 |
|-------|------|---------|---------|
| 0 — Text Layer | 書籍原始文本 | diamond（菱形） | Book Meta / Chapters / Paragraphs |
| 1 — KG Layer | 知識圖譜萃取 | rectangle（矩形） | Summaries / Keywords / Symbols / KG Features（compound group：Entity / Concept / Relation / Event / Temporal Relation） |
| 2 — Analysis Layer | 分析中間產物 | round-rectangle | CEP / EEP / TEU / SEP |
| 3 — Derived Results | 衍生分析結果 | round-rectangle | Character Analysis / Causality / Impact / Tension Lines / Symbol Analysis / Narrative Structure / Hero Journey / Temporal Analysis / Voice Profile |
| 4 — Book Synthesis | 全書層級合成 | round-rectangle | Tension Theme / Chronological Rank |

**總計 31 個節點**（含 KG compound group）。

### 2.3 節點狀態

| 狀態 | 語意 | default 主題顏色 |
|------|------|----------------|
| `complete` | 已全部建立 | 綠底（`#f0fdf4`）+ 綠框（`#22c55e`）+ 綠字（`#15803d`） |
| `partial` | 部分建立 | 黃底（`#fffbeb`）+ 橘框（`#f59e0b`）+ 深橘字（`#92400e`） |
| `empty` | 尚未建立 | 灰底（`#f3f4f6`）+ 灰框（`#d1d5db`）+ 灰字（`#6b7280`） |

狀態色由 CSS token 控制（詳見第 5 節），支援 4 個主題。

### 2.4 互動行為

- **點擊節點**：右側 Detail Panel 展開，同時對點擊節點及其直接鄰居加 `highlighted` class，其他節點套 `faded` class（opacity 0.25）
- **點擊空白處**：清除 highlight / fade
- **KG compound group**：點擊群組框 → 高亮群組內所有子節點及其連接邊
- **pan / zoom**：支援滑鼠拖曳與滾輪縮放，minZoom 0.3，maxZoom 3
- **主題切換**：Cytoscape stylesheet 依 `theme` 變化即時更新

### 2.5 當前 Detail Panel 內容

點擊節點後右側展開 280px 面板：
- **Header**：節點名稱 + 狀態 badge（帶色）
- **Counts 區**：`key: value` 數字明細列表（不同節點有不同 key，例如 summaries 顯示 `generated / total`，kg_entity 顯示 `total`）
- **Meta 區**：附加 meta 資訊（raw key-value）

---

## 3. 資料契約

### 3.1 API

```
GET /books/:bookId/unraveling
```

**Response**：
```ts
interface UnravelingManifest {
  bookId: string;
  nodes: UnravelingNode[];
  edges: UnravelingEdge[];
}

interface UnravelingNode {
  nodeId: string;          // 如 "book_meta", "kg_entity", "cep"
  layer: number;           // 0–4
  label: string;           // 顯示名稱（已有 i18n 支援）
  status: 'complete' | 'partial' | 'empty';
  counts: Record<string, number>;  // 數量明細
  meta: Record<string, string | number | boolean>;
  parentId?: string;       // KG 子節點的 parentId = "kg_features"
}

interface UnravelingEdge {
  source: string;   // nodeId
  target: string;   // nodeId
}
```

### 3.2 所有 nodeId 清單（含層級）

| Layer | nodeId |
|-------|--------|
| 0 | `book_meta`, `chapters`, `paragraphs` |
| 1 | `summaries`, `keywords`, `symbols`, `kg_entity`, `kg_concept`, `kg_relation`, `kg_event`, `kg_temporal_relation` |
| 2 | `cep`, `eep`, `teu`, `sep` |
| 3 | `character_analysis_result`, `causality_analysis`, `impact_analysis`, `tension_lines`, `symbol_analysis_result`, `narrative_structure`, `hero_journey_stage`, `temporal_analysis`, `voice_profile` |
| 4 | `tension_theme`, `chronological_rank` |

KG 節點（`kg_entity / kg_concept / kg_relation / kg_event / kg_temporal_relation`）有一個特殊的 compound group parent：`kg_features`（KG Features 框）。

### 3.3 Counts 欄位對照

| nodeId | counts 欄位 | 意義 |
|--------|------------|------|
| `summaries`, `keywords` | `generated`, `total` | 已生成 / 全部章節 |
| `cep`, `character_analysis_result` | `analyzed`, `total_characters` | 已分析角色數 |
| `eep`, `causality_analysis`, `impact_analysis` | `analyzed`, `total_events` | 已分析事件數 |
| `teu` | `analyzed`, `total_events` | 已分析事件數 |
| `kg_temporal_relation`, `chronological_rank` | `events_ranked` | 已排序事件數 |
| `kg_event` | `events` | KG 事件數 |
| `kg_entity`, `kg_concept` | `total` | 實體/概念總數 |
| `kg_relation` | `relations` | 關係數 |

---

## 4. 目前相關檔案

### Frontend

| 角色 | 路徑 |
|------|------|
| 頁面主元件 | `frontend/src/pages/BuildOverviewPage.tsx`（576 行） |
| API 客戶端 | `frontend/src/api/buildOverview.ts`（29 行） |
| 路由定義 | `frontend/src/router.tsx`（lazy import） |

### Backend

| 角色 | 路徑 |
|------|------|
| API Router | `src/api/routers/unraveling.py`（583 行） |

### 設計文件

| 文件 | 路徑 | 相關章節 |
|------|------|---------|
| UI 規格 | `docs/UI_SPEC.md` | Section 3.10 |
| API 合約 | `docs/API_CONTRACT.md` | `#19 GET /books/:bookId/unraveling` |
| Design Tokens | `docs/DESIGN_TOKENS.md` | Section 3.10（Unraveling DAG 節點狀態） |

---

## 5. 設計 Token（本頁相關）

### 5.1 節點狀態色（`--status-*`）

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--status-complete-bg` | `#f0fdf4` | `#d8d8d8` | `#000000` | `#000000` |
| `--status-complete-border` | `#22c55e` | `#000000` | `#000000` | `#000000` |
| `--status-complete-fg` | `#15803d` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| `--status-partial-bg` | `#fffbeb` | `#ebebeb` | `#aaaaaa` | `#aaaaaa` |
| `--status-partial-border` | `#f59e0b` | `#555555` | `#000000` | `#000000` |
| `--status-partial-fg` | `#92400e` | `#333333` | `#000000` | `#000000` |
| `--status-empty-bg` | `#f3f4f6` | `#f5f5f5` | `#ffffff` | `#ffffff` |
| `--status-empty-border` | `#d1d5db` | `#aaaaaa` | `#aaaaaa` | `#000000` |
| `--status-empty-fg` | `#6b7280` | `#888888` | `#888888` | `#555555` |

### 5.2 全域共用 Token

```
--bg-primary     頁面背景（Cytoscape canvas 背景）
--bg-secondary   面板背景（Info Panel / Detail Panel）
--bg-tertiary    KG compound group 半透明背景
--border         一般邊框
--accent         KG compound group dashed 框 / 選中態 border / highlighted edge 色
--fg-primary     主文字
--fg-secondary   次要文字
--fg-muted       輔助文字（Legend labels）
--font-sans      UI 字體（Cytoscape node label 使用）
--line-weight    邊框粗細基準（Cytoscape border-width 乘以此值）
--border-style   邊框樣式（solid / dashed，manuscript 主題為 dashed）
```

### 5.3 主題特殊行為

- **manuscript**：邊框 dashed（含 Cytoscape edge），KG group 格外明顯
- **pulp**：HTML 面板有 `--node-shadow`，但 Cytoscape canvas **不支援** box-shadow（技術限制）
- **minimal-ink / pulp**：狀態色以灰階填充對比表達（complete = 最深，empty = 最淺）

---

## 6. i18n 命名空間

翻譯 key 在 `analysis` namespace（`frontend/src/i18n/locales/{zh-TW,en}/analysis.json`），以 `unraveling.*` 為前綴。

目前有的 key：
- `unraveling.info.title` / `unraveling.info.body`（左側說明面板）
- `unraveling.status.complete` / `.partial` / `.empty`（狀態標籤）
- `unraveling.kgFeatures`（KG compound group 標題）
- `unraveling.notBuilt`（empty 節點 sub-label）
- `unraveling.ranked`（排序計數後綴）
- `unraveling.counts.*`（counts 欄位標籤，如 `counts.generated`, `counts.total`）

---

## 7. 當前設計問題與改善機會

### 7.1 已知痛點

1. **Info Panel 資訊密度低**：靜態說明文字，幾乎沒有用戶價值，佔用 220px 固定寬度
2. **DAG 過於擁擠**：31 個節點在固定 canvas 中，Layer 1 縱向特別長（含 KG compound group）；Layer 3 有 9 個節點擠在同一列
3. **Detail Panel 數字冷冰冰**：純 key-value 列表，缺乏進度感或引導行動的設計
4. **沒有全局進度感**：用戶看不出「整本書分析完成了多少 %」，缺少一個 summary view
5. **無法觸發動作**：`partial/empty` 節點目前只能查看，點擊後看到數字，但無法從這裡觸發對應 pipeline（標記為 Backlog #7）
6. **層次標籤缺失**：用戶很難理解 Layer 0/1/2/3/4 各代表什麼分析階段
7. **Legend 位置遮擋**：底部左側的 Legend 浮層可能遮擋到 Layer 0 的節點（diamond 形狀位置偏低左）

### 7.2 設計自由度說明

| 可以改 | 不可以改 |
|--------|---------|
| 版面結構（三欄 / 兩欄 / 其他） | API 資料結構（節點/邊不變） |
| Info Panel 設計或移除 | 狀態語意（complete/partial/empty） |
| Detail Panel 內容豐富化 | CSS token 名稱（要用既有 `--status-*` token） |
| 全局進度摘要 | Cytoscape.js 作為渲染引擎（技術限制） |
| 層次 header/label 設計 | 4 主題支援（所有顏色必須走 CSS variable） |
| Legend 重新定位 | i18n 鍵名（可新增但不更改既有） |
| 觸發動作 CTA（Backlog 功能） | |

### 7.3 其他頁面設計參考

本專案其他頁面的設計語言可供參考：

- **張力分析頁**（`/tension`）：有 Stepper Strip 顯示分析進度，全寬 1280px 設計，Summary Chip Bar 提供狀態彙整
- **象徵意象頁**（`/symbols`）：左清單 + 右詳情的詳盡設計，DensityStrip 在清單項中的迷你進度視覺
- **角色分析頁**（`/characters`）：多 tab 設計，左側清單帶狀態點

---

## 8. Backlog 功能（設計時可預留空間）

以下功能尚未實作，但設計時可考慮預留互動空間：

1. **觸發互動**：在 Detail Panel 內為 `empty / partial` 節點提供「觸發建構」按鈕，呼叫對應 pipeline
2. **Detail Panel 展開原始資料**：點擊節點後，不只顯示 counts，也能瀏覽該層的原始資料列表

---

## 9. 設計系統基礎

### 風格定位
**暖色調分析工具風格**：暖白底（`--bg-primary`）、serif 正文、有溫度的卡片。  
參考產品感：Notion + Linear 混合，有設計感但不失工具效率。

### 字體
```css
font-family: var(--font-serif);   /* Libre Baskerville / IM Fell English（依主題）— 正文內容 */
font-family: var(--font-sans);    /* DM Sans / Space Mono（依主題）— UI 元素 */
```

### 導航架構
本頁位於書籍空間的最後一個 tab，左側有全站 Sidebar（48px icon-only），上方有書籍 Top Nav（書名 + 8 個 tab）。頁面高度為視窗高度減去 Top Nav，需填滿（`h-full`）。

---

## 10. 技術限制說明

1. **Cytoscape.js**：DAG 使用 Cytoscape.js 渲染，stylesheet 透過 JS 物件傳入，不能直接寫 CSS class。Cytoscape 節點**不支援** `box-shadow`（Pulp 主題的 offset shadow 因此無法套用到節點上）。
2. **顏色必須透過 `getComputedStyle`**：由於 Cytoscape 在 canvas 內渲染，顏色必須在 JS 中以 `getComputedStyle(document.documentElement).getPropertyValue('--token-name')` 讀取，不能直接用 `var(--*)`。
3. **主題切換即時更新**：頁面監聽 `theme` context 變化，會重新執行 `getBuildOverviewStylesheet()` 套用新顏色。
4. **preset layout**：節點位置由 JS 計算後傳入（`layout: { name: 'preset' }`），設計中的任何節點排列改動需對應修改 `buildElements()` 的座標計算邏輯。
