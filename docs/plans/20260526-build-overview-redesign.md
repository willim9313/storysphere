# 建構概覽頁重設計（Direction A · Diagnostic Dashboard）

> **狀態**：規劃中 → 實作中
> **日期**：2026-05-26
> **設計來源**：Claude Design handoff（`buildoverview-page` bundle）
> **使用者決策**：保守版本（Direction A），前後端一次到位

---

## 1. 目標與範圍

### 1.1 解決的痛點（沿用 brief）

1. **Info Panel 死字**：左側 220px 靜態說明文字 → 換成有用的全局進度／層次導覽
2. **Detail Panel 冷數字**：純 key-value 列表 → 加大數字 + 章節分佈 + 觸發引導
3. **沒有全局進度感**：看不出整本書 % 完成 → 頂部 Summary Strip
4. **無法觸發動作**：empty/partial 節點目前不可操作 → 預留 CTA（Backlog #7 視覺占位 + 「前往對應頁面瀏覽」即時可用）

### 1.2 不做的事

- 不更改 API 既有 schema（NodeData / EdgeData 不動）
- 不切換 DAG 渲染引擎（仍使用 Cytoscape.js）
- 不實作 Backlog #7 的實際觸發 pipeline（CTA 為 disabled placeholder）

---

## 2. 版面（Direction A）

```
┌───────────────────────────────────────────────────────────────┐
│ SummaryStrip：48px high                                       │
│  ├─ 大百分比 + 子標題（complete/partial/empty 計數）           │
│  └─ Stacked bar + 5 個 Layer chips（L0/L1/L2/L3/L4）           │
├───────────────────────────────────────────────────────────────┤
│ DAG Canvas (flex)                  │ Inspector (360px)        │
│  └─ Cytoscape 渲染（保留）          │  ├─ 預設：層次清單       │
│     + 浮動 toolbar (Reset/Fit/全部)  │  └─ 選中後：節點細節     │
└───────────────────────────────────────────────────────────────┘
```

**刪除**：原 `InfoPanel` 220px、底部 `Legend` 浮層（其資訊已併入 Inspector）

---

## 3. API 變更

### 3.1 新增：#19b GET /books/:bookId/unraveling/chapter-distribution

**Response 200**
```ts
interface ChapterDistribution {
  bookId: string;
  totalChapters: number;
  // 每個 nodeId → 12 個 chapter 的計數（i 是 1-based chapter，陣列從 index 0 開始）
  // 不在此 map 中的 nodeId 表示「本層級無 chapter-aware 資料」
  distributions: Record<string, number[]>;
}
```

**支援的 nodeId**（其餘節點不會出現在 distributions 中）：

| nodeId | 計算邏輯 | 成本 |
|---|---|---|
| `paragraphs` | `len(chapter.paragraphs)` | O(chapters) |
| `summaries` | `1 if chapter.summary else 0` | O(chapters) |
| `keywords` | `1 if chapter.keywords else 0` | O(chapters) |
| `kg_event` | `count(events where event.chapter == n)` | O(events) |
| `symbols` | `sum(img.chapter_distribution[n] for img in imagery)` | O(imagery) |

**不實作**（因為 domain model 沒有 chapter linkage）：
- `kg_entity` / `kg_concept` / `kg_relation` / `kg_temporal_relation`：Entity 只有 `first_appearance_chapter`
- `cep` / `eep` / `teu` / `sep`：cache key 不按 chapter 索引
- Layer 3+ 衍生分析：book-level，無 chapter 概念

**為何拆成獨立 endpoint**：避免將 `chapter_dist` 塞入 `#19` 主 manifest 把 payload 變大；前端在選中節點時 lazy load（或進頁面時一次 prefetch）。

### 3.2 #19 主 endpoint：**不變**

---

## 4. UI / 元件變更

### 4.1 新元件（皆於 BuildOverviewPage.tsx 內定義，不另開 component 檔）

| 元件 | 對應設計 |
|---|---|
| `SummaryStrip` | 大百分比 + stacked bar + 5 個 layer chips |
| `Inspector` | 右側 360px 容器；切換 layer-list / node-detail |
| `LayerList` | 預設 inspector 內容（依層次分組顯示所有節點） |
| `NodeDetail` | 取代舊 `NodeDetailPanel`，含 ProgressCard + ChapterDist + CTA + Counts |
| `ChapterDistMini` | 12-bar sparkline（接 `#19b` 回傳） |

### 4.2 樣式 token

需要新增到 `frontend/src/styles/tokens.css`（4 主題各一）：
- `--border-width`：default=1px、manuscript=1px、minimal-ink=0.5px、pulp=2px

`page.css` 內的 `bo-*` / `boA-*` 樣式 → 抽出為 `frontend/src/styles/build-overview.css`

### 4.3 i18n key 新增（`unraveling.*`）

```
unraveling.summary.eyebrow         "Build Overview · 建構概覽"
unraveling.summary.complete        "已建立"
unraveling.summary.partial         "部分"
unraveling.summary.empty           "未建立"
unraveling.summary.totalNodes      "共 {{n}} 節點"
unraveling.inspector.layerList     "層次清單"
unraveling.inspector.nodeDetail    "節點細節"
unraveling.inspector.backToList    "返回層次清單"
unraveling.inspector.nodeCount     "{{n}} 節點"
unraveling.detail.progress         "進度"
unraveling.detail.chapterDist      "章節分佈"
unraveling.detail.blockedTitle     "尚未就緒"
unraveling.detail.blockedHint      "需先完成上游 {{n}} 個依賴"
unraveling.detail.openPage         "前往對應頁面瀏覽"
unraveling.detail.runAgain         "重新建構（會耗 Token）"
unraveling.detail.rawCounts        "原始計數"
unraveling.detail.meta             "附加資訊"
unraveling.layer.0                 "文本層"
unraveling.layer.1                 "知識圖譜"
unraveling.layer.2                 "分析中間產物"
unraveling.layer.3                 "衍生分析"
unraveling.layer.4                 "全書合成"
```

### 4.4 CTA 對應頁面映射

| nodeId | 對應路由 |
|---|---|
| `chapters` / `paragraphs` / `book_meta` / `summaries` / `keywords` | `/books/:bookId` |
| `kg_entity` / `kg_concept` / `kg_relation` / `kg_event` / `kg_temporal_relation` | `/books/:bookId/graph` |
| `symbols` / `symbol_analysis_result` / `sep` | `/books/:bookId/symbols` |
| `cep` / `character_analysis_result` / `hero_journey_stage` / `voice_profile` | `/books/:bookId/characters` |
| `eep` / `causality_analysis` / `impact_analysis` / `narrative_structure` | `/books/:bookId/events` |
| `teu` / `temporal_analysis` / `chronological_rank` | `/books/:bookId/timeline` |
| `tension_lines` / `tension_theme` | `/books/:bookId/tension` |

無對應時不顯示「前往對應頁面瀏覽」按鈕。

---

## 5. 檔案影響清單

### 後端

- `src/storysphere/api/routers/unraveling.py` — 新增 `#19b` endpoint + helper（不影響 `#19`）
- `tests/api/test_unraveling.py` — 補測試（happy path / 404 / 各 nodeId 計算正確）

### 前端

- `frontend/src/pages/BuildOverviewPage.tsx` — 大幅重寫（保留 cytoscape canvas 元件）
- `frontend/src/styles/build-overview.css` — 新檔（從設計的 `page.css` 萃取 `boA-*` 部分）
- `frontend/src/styles/tokens.css` — 4 主題各加 `--border-width`
- `frontend/src/api/buildOverview.ts` — 新增 `fetchChapterDistribution` + type
- `frontend/src/api/generated.ts` — 重新產生（`npm run gen:types`）
- `frontend/src/i18n/locales/zh-TW/analysis.json` — 補 `unraveling.*` keys
- `frontend/src/i18n/locales/en/analysis.json` — 同上

### 文件

- `docs/API_CONTRACT.md` — 新增 #19b 區塊
- `docs/UI_SPEC.md` — 改寫 3.10 版面區塊
- `docs/DESIGN_TOKENS.md` — `--border-width` 對照表（4 主題）

---

## 6. 測試重點

### 後端
- `test_chapter_distribution_returns_per_chapter_counts`：summaries / keywords / kg_event / symbols / paragraphs 各自的計算正確
- `test_chapter_distribution_unsupported_node_omitted`：未支援的 nodeId 不在 response 中
- `test_chapter_distribution_404_for_unknown_book`

### 前端
- 透過手動測試（dev server + browser）驗證：
  - SummaryStrip 數字正確（從 `#19` 推算）
  - Inspector 預設顯示層次清單；點節點切到 detail；按返回回層次清單
  - ChapterDistMini 在有資料的節點顯示 sparkline，其他節點不顯示
  - 「前往對應頁面瀏覽」對有映射的節點顯示且能跳轉
  - 主題切換 4 主題全部不破版
  - 既有 Cytoscape 互動（pan / zoom / highlight）不受影響

---

## 7. 後續可獨立進展（不在此次範圍）

- **B-044**：CTA「觸發建構」對接 pipeline endpoint（詳見 `docs/BACKLOG.md` B-044）
- Chapter distribution 擴展到 `kg_entity` / `kg_concept`（需 Entity domain model 加上 chapter linkage 或新 KG 查詢方法）

---

## 8. 命名守則

`bo-` 前綴沿用 design bundle 命名空間；其下 `bo-summary` / `bo-inspector` / `bo-detail` 等。不沿用 `boA-` 前綴（A/B 區分對 production 已無意義）。
