# KG Page V1 Redesign — 實作計劃

> 對應 design handoff brief：[`20260516-kg-page-redesign.md`](./20260516-kg-page-redesign.md)
> 對應 Claude Design handoff README：`design_handoff_v1/README.md`（fetch 自 claudeusercontent.com）

## Context

Claude Design 已交付 `/books/:bookId/graph` 頁面的保守式 V1 重新設計 handoff README。Handoff 範圍：四大 Change（Lens 卡 / Legend / 推斷邊樣式 / Mini-map + Clustering）與六個互動 Scenario A–F。設計沿用既有 cytoscape canvas + 右側 panel 架構，僅做視覺與互動層升級，**後端 schema 與 endpoint 完全不動**。

此計劃在動工前已完成兩件事：
1. 對照後端現有 API，確認所有需要的端點都已存在或可用前端 mock 解決
2. 確認 handoff 的「社群」cluster mode 對應到 backlog **F-16 角色派系偵測**，V1 先 disable

---

## 決策

| # | 題目 | 決策 |
|---|---|---|
| 1 | 推斷邊（toolbar chip）預設 | **OFF** — 用戶要主動點 chip 才顯示 |
| 2 | Cluster mode 記憶 | **localStorage per-book**（key：`graph:${bookId}:clusterMode`） |
| 3 | Mini-map 互動 | **click + drag 兩種都做**（click 立即定位，drag viewport 持續 pan） |
| 4 | Scenario E 多選比較上限 | **V1 鎖 2 個節點**（Shift+Click 第 3 個踢掉最早選的） |
| 5 | 「社群」cluster mode | **V1 disable** — 按鈕灰色 + tooltip 指向 F-16 |
| 6 | Cluster super-node 實作 | **新類型自繪虛擬節點**（原節點不進 cytoscape） |

---

## 後端 API 對照（不動後端）

### 直接重用

| Handoff 用途 | 現有端點 |
|---|---|
| 基礎節點/邊 | `#9 GET /books/:bookId/graph?include_inferred=true` |
| Lens 卡 § 時間範圍 | `#12a/b GET/PUT /books/:bookId/timeline-config` |
| Lens 卡 § 認知視角 | `#12d POST /classify-visibility` + `#12e GET /entities/:id/epistemic-state` |
| Scenario F 推斷邊清單 | `#10b GET /books/:bookId/inferred-relations` |
| 推斷邊觸發 | `#10a POST /books/:bookId/inferred-relations/run` |
| Scenario F 證據段落 | `#9b GET /books/:bookId/entities/:entityId/chunks` |
| Event 節點詳情 | `#11 GET /books/:bookId/events/:eventId` |

### 命名不一致但功能等價（沿用後端名稱，僅 UI 文案改）

| Handoff spec | 對應現有 |
|---|---|
| `POST /inferred-edges/:id/adopt` | `#10c POST /inferred-relations/:id/confirm` |
| `POST /inferred-edges/:id/reject` | `#10d POST /inferred-relations/:id/reject` |

UI 文案用「採用 / 否決」，內部 fetch 仍打 `/confirm`、`/reject`。`edgeId` 對應 `edge.data('inferredId')`。

### 「社群」模式 → 對應 backlog F-16

`docs/BACKLOG.md:222` 的 **F-16 角色派系偵測**完全對得上 handoff 的社群 cluster mode：

| Handoff 規格 | F-16 規劃 |
|---|---|
| `GET /clusters/by-community?resolution=` | `GET /books/:bookId/analysis/factions`（含 `?chapter={N}` 章節快照） |
| Louvain | `networkx.algorithms.community.greedy_modularity_communities()`（已選定，無新套件） |
| Community label「紅岸·ETO 線」 | `Faction.label`（domain model 內建） |
| Multi-color dot ring 表示 type 分佈 | F-16 已規劃「以節點顏色標示派系歸屬」 |

**V1 處理**：cluster segmented control 仍渲染三段，「社群」按鈕 `disabled` + tooltip：「派系分析開發中（F-16）」/ EN「Coming soon · Faction analysis (F-16)」。

**未來 F-16 完成後**：解除 disabled、把 `kgClustering.community()` 從 throw 換成 fetch `/analysis/factions`、label 用 `Faction.label`，UI 元件不動。

「類型」mode 邏輯極簡（純前端 group-by），直接寫在 service 內，**不建 `kgClusteringMock.ts`、不加 feature flag**。

---

## 檔案異動

### 修改既有 frontend 檔案

| 路徑 | 修改內容 |
|---|---|
| `frontend/src/pages/GraphPage.tsx` | 大幅重構：掛載 Lens / Legend / Mini-map、cluster mode state、search dropdown、比較模式、推斷審查 mode、breadcrumb drill-in |
| `frontend/src/components/graph/GraphCanvas.tsx` | 節點/邊樣式：inferred edge 改 color+opacity（不再 dash）；新增 super-node 類型；新增 viewport 事件供 mini-map 同步；Shift+Click multi-select（鎖 2） |
| `frontend/src/components/graph/GraphToolbar.tsx` | 新增 cluster segmented control（個別/類型/社群，社群 disabled）、「推斷 · N」chip（預設 OFF）、search input 改裝 |
| `frontend/src/components/graph/EpistemicOverlay.tsx` | **拆解** — 邏輯併入 `LensCard` 的「認知視角」section（舊檔刪除） |
| `frontend/src/components/graph/TimelineControls.tsx` | **拆解** — 邏輯併入 `LensCard` 的「時間範圍」section（舊檔刪除；`TimelineConfigModal` 保留供設定編輯入口） |
| `frontend/src/components/graph/InferredEdgePanel.tsx` | 改造為 Scenario F「推斷關係審查 · N 條」：節點 pill + 關係 label + 信心度 progress bar + 證據列 + 採用/否決按鈕 |
| `frontend/src/components/graph/EntityDetailPanel.tsx` | 新增 Scenario E 並排比較模式（兩欄共用同一元件、差異粗體、共值灰化） |

### 新增 frontend 檔案

| 路徑 | 用途 |
|---|---|
| `frontend/src/components/graph/LensCard.tsx` | Change ①：bottom-left 合併卡，含 timeline / epistemic / bookmarks 三段 |
| `frontend/src/components/graph/LegendCard.tsx` | Change ②：top-right 常駐圖例（4 entity types + 推斷指示 + 點擊 toggle 圖層可見性） |
| `frontend/src/components/graph/MiniMap.tsx` | Change ④：180×120 mini-map + viewport rect（click recenter + drag pan） |
| `frontend/src/components/graph/SearchDropdown.tsx` | Scenario D：三段式（實體/章節/段落內文）+ 鍵盤 ↑↓ ↵ Esc、debounce 200ms |
| `frontend/src/components/graph/ClusterOverviewPanel.tsx` | Scenario A 「群集概觀」清單（4 群 × 成員數 × top-3 members） |
| `frontend/src/components/graph/BreadcrumbBar.tsx` | Scenario C drill-in 麵包屑 |
| `frontend/src/services/kgClustering.ts` | `byType(graph)` 純前端 group-by；`byCommunity()` throw `NotImplementedError`（F-16 補完後填） |
| `frontend/src/components/graph/__tests__/*.test.tsx` | 新元件單元測試 |

### 新增的 component state

```ts
clusterMode: 'node' | 'type' | 'community'  // 'community' V1 disabled
clusterDrillIn: { type: EntityType } | null
selectedNodeIds: string[]                    // cap 2
searchQuery: string
searchOpen: boolean
inferredReviewOpen: boolean
miniMapViewport: { x: number, y: number, w: number, h: number }
bookmarkedEntityIds: string[]                // localStorage `graph:${bookId}:bookmarks`
```

V1 不引入 `communityResolution`（社群 disable）。

---

## i18n

handoff 提供 24 個 key，全部加入 `frontend/src/i18n/zh-TW.json` + `en.json`，外加：

```
graph.v1.cluster.communityDisabled  // tooltip 文案（zh-TW / EN 各一條）
```

---

## 視覺規則重點（依 handoff §2–4）

- **Canonical edge**：`var(--fg-muted)` stroke / 1.2px / opacity 0.7
- **Inferred edge**：`var(--accent)` color / `width = 1 + confidence × 1.6` px / `opacity = 0.42 + confidence × 0.25`，**不用 dash**
- **Hover**：背景下降一階 `--bg-*`，**禁用 transform / translate**
- **Transition**：`color / background-color / opacity / box-shadow`，`var(--transition-fast)` (150ms) 或 `--transition-normal` (250ms)
- **Cluster animate**：cytoscape `animate({ duration: 250, easing: 'ease' })`
- 所有顏色 / 字型 / 間距 100% 取自 `tokens.css`，禁止硬編碼

---

## 文件更新

| 檔案 | 修改 |
|---|---|
| `docs/UI_SPEC.md § 3.6` | 反映新版 IA（Lens / Legend / Mini-map / Cluster mode / Scenarios A–F），社群 disabled |
| `docs/DESIGN_TOKENS.md` | 若 handoff 用到的 token（`--graph-{char,loc,con,evt}-{fill,stroke,label}`、`--entity-{...}-dot`、`--line-weight`、`--border-style` 等）在現有對照表缺漏，需補 |
| `docs/BACKLOG.md` F-16「內容 → 前端」 | 加一行：「圖譜頁 cluster mode 『社群』按鈕解除 disabled、`kgClustering.byCommunity()` 換 fetch `/analysis/factions`、label 取 `Faction.label`」 |
| `docs/plans/20260516-kg-page-redesign.md`（舊 handoff brief） | 在文末加一行交叉引用：「→ 實作計劃見 `20260517-kg-page-redesign-v1-impl.md`」 |

**`docs/API_CONTRACT.md` 不動**（沒新增/修改 endpoint，不需 `npm run gen:types`）。

---

## 驗證

1. **後端零變動**：`git diff main -- src/` 應為空
2. **Lint**：
   - `ruff check src/`（應與 main 一致）
   - `cd frontend && npm run lint`
3. **單元測試**：
   - `python -m pytest`（不應有變化）
   - 對新元件補測試（依 `docs/guides/TESTING.md`，純函數 + 元件渲染）
4. **手動 E2E**（`uvicorn` + `npm run dev`，使用既有書籍）：
   - 四主題各看一次（default / manuscript / minimal-ink / pulp）
   - Cluster mode「個別 ⇄ 類型」切換 → 4 個 super-node 出現、「群集概觀」面板更新
   - 「社群」按鈕 disabled + tooltip 顯示
   - Click cluster → Scenario C drill-in、breadcrumb 出現、回上一層
   - Toolbar 搜尋 → Scenario D 三段下拉、鍵盤導航
   - Shift+Click 兩節點 → Scenario E 並排比較；第 3 個 Shift+Click 踢掉最早的
   - 工具列「執行推論」→ chip 出現 → 點 chip → Scenario F 審查 panel；採用/否決能打通 `#10c/#10d` 並更新 cytoscape
   - Mini-map click 立即定位、drag viewport 持續 pan
   - Lens 卡時間軸拖動 → 章節快照（打 `#9` `mode=chapter&position=N`）
   - Lens 卡選認知視角 → 打 `#12d/#12e`、灰化效果正確
   - Reload 頁面 → cluster mode 記憶（localStorage）正確還原

---

## 風險與待觀察

- **Cytoscape 自繪 super-node** 在 force-directed layout 下，super-node 大小可能影響鄰居節點配置 — 第一次實作後需評估是否要切到 preset / cose
- **Mini-map 渲染成本**：使用第二個 cytoscape instance vs SVG 重繪需要實測；500+ 節點若卡頓改 SVG
- **i18n 漏字串**：handoff 提供的 24 key 不一定涵蓋所有新元件（例如 ClusterOverviewPanel 細節文字），實作時若新增字串要回頭補進 handoff key 表 + `docs/UI_SPEC.md`
- **既有 `EpistemicOverlay` / `TimelineControls` 的 localStorage key**（`graph:${bookId}:epistemic:*`）必須保留 — 邏輯搬到 LensCard 時不可改 key
- **節點形狀單一化的識別性 trade-off**：V1 設計稿規範所有節點為圓形（差異靠色彩 + 標籤 + dot），但 manuscript / minimal-ink / pulp 主題會把 entity 色彩收斂到灰階，導致在這些主題下類型難以辨別。先前實作用 4 種形狀（ellipse / round-rectangle / diamond / pentagon）規避此問題，V1 改回圓形時刻意接受此缺口，後續解法追蹤於 `docs/BACKLOG.md` **B-043**。動 cytoscape node shape 前請先看那條 backlog。
