# 時間軸頁缺陷修正 — 計劃一

**日期**：2026-07-25
**範疇**：`/books/:bookId/timeline`（`TimelinePage.tsx`、`MatrixCanvas.tsx`）
**Branch**：`fix/timeline-page-defects`（自 `origin/main` `9ac9656` 切出）
**配套計劃**：`docs/plans/20260725-timeline-page-enhancements.md`（計劃二／功能擴充）

**原則：只修錯，不加功能、不動版面、不動 API 形狀。**
任何「順手改好看一點」的念頭一律推到計劃二。

---

## 0. 為什麼分成兩份計劃

時間軸頁的問題有兩類，混在一起做會互相拖累：

- **這一類（計劃一）**：畫面正在呈現錯誤或誤導的資訊、連結是死的、元件狀態會壞。
  這些跟視覺設計無關，不需要等設計稿，可以獨立 PR、獨立回滾。
- **另一類（計劃二）**：功能缺口與體驗升級，需要先讓 Claude Design 過目版面。

計劃一先做完，計劃二的設計討論才不會建立在一個排序是錯的、連結是死的頁面上。

---

## 1. 缺陷清單

所有項目皆為讀 code 確認，非推測。行號基準 `9ac9656`。

### F1 — 故事時序排序語意錯誤 🔴

**現況**（`frontend/src/pages/TimelinePage.tsx:292-297`）：

```ts
if (order === 'chronological') {
  events.sort((a, b) => (a.chronologicalRank ?? 0) - (b.chronologicalRank ?? 0));
}
```

`chronologicalRank === null` 代表「尚未計算出故事時間位置」。`?? 0` 把它變成 rank 0，
於是**所有未排序事件被排到最前面，畫面等於宣稱它們是故事中最早發生的事**。

後端 `get_book_timeline`（`backend/storysphere/api/routers/books.py:2515-2522`）用的是：

```python
events.sort(key=lambda e: (
    e.chronological_rank if e.chronological_rank is not None else float("inf"),
    e.chapter,
))
```

null 沉底、章節作為 tiebreak。**前端等於覆寫並反轉了後端的語意。**

**修法**：抽成純函數 `sortEventsForOrder()`，與後端規則對齊（null 沉底、chapter 為次鍵）。
`narrative` 維持不排（後端已依章節排好）。

### F2 — 事件詳情面板的「前往深度分析」是死連結 🔴

**現況**（`TimelinePage.tsx:468`）：

```ts
onGoToAnalysis={() => navigate(`/books/${bookId}/analysis`)}
```

`router.tsx` 的 `/books/:bookId` 子路由只有 `characters` / `events` / `graph` / `timeline` /
`tension` / `symbols` / `narrative` / `unraveling`，**沒有 `analysis`**。
同一頁的 `TimelineOnboardingHero` 用的是正確的 `/events`。

**修法**：改為 `/books/${bookId}/events?event=${event.id}`。
`?event=` 是 `EventAnalysisPage` 既有的深連結契約（`EventAnalysisPage.tsx:58-59`
`searchParams.get('event')`），所以不只修好連結，還能直接開到該事件。

### F3 — 視窗縮放後 SVG 連線錯位 🟡

**現況**（`TimelinePage.tsx:1108-1149`）：`TimelineCanvas` 用 `getBoundingClientRect()`
量測每張卡的中心點來畫 spine 與 CAUSES 連線，但 `useLayoutEffect` 的 deps 是
`[temporalRelations, events, layout, nodeRefs]` — **沒有任何 resize 觸發**。

視窗一縮放（或側邊面板開合造成畫布寬度改變），卡片重排但線條座標不變，線就飄了。
`MatrixCanvas.tsx:84-93` 已經有 ResizeObserver，同頁兩個畫布行為不一致。

**修法**：對 `innerRef` 掛 ResizeObserver，觸發重新量測。比照 MatrixCanvas 的寫法。

### F4 — 切換視圖整頁閃白 🟡

**現況**（`TimelinePage.tsx:363`）：

```ts
if (isLoading) return <LoadingSpinner />;
```

在元件最外層 early return，而 `useTimeline` 的 query key 含 `order`
（`hooks/useTimeline.ts:8`）。因此「章節順序 → 故事時序」會進入新 query 的 loading，
**整個 toolbar 連同視圖切換卡一起消失**，使用者剛按下的那張卡從畫面上不見了。

（矩陣視圖因為共用 `narrative` 的 query 而不受影響，所以問題只在這一組切換上出現，
更容易被忽略。）

**修法**：
- `useTimeline` 加 `placeholderData: keepPreviousData`（react-query v5 寫法）
- 最外層 early return 只保留**首次載入**（`isLoading` 且無既有資料）
- 切換造成的 refetch 改為畫布區局部 loading，toolbar 恆存

### F5 — 未計算時序時，仍渲染「看起來有意義」的順序 🟡

**現況**：`hasChronologicalRanks === false` 時，「故事時序」與「矩陣視圖」兩張卡
只在右上角標一顆黃點（`TimelinePage.tsx:691`），但**點下去照樣渲染**。

此時所有 `chronologicalRank` 都是 null，排序結果實際上是任意的（F1 修好後是「全部依章節」），
矩陣視圖則全部落在 degraded row。畫面本身在對使用者說謊。

**修法**：`hasRanks === false` 時
- 該兩張視圖卡 `disabled` + `aria-disabled`，保留黃點與 tooltip 說明原因
- 若使用者已透過 URL／既有 state 停在該視圖，畫布就地顯示「先計算故事時序」說明 + CTA
  （復用既有的 `QualityBanner` CTA 行為，不新增 API 呼叫路徑）

### F6 — `onBrushSelect` 是 dead prop ⚪（本計劃不處理）

`MatrixCanvas.tsx:62` 定義了 `onBrushSelect?: (ids: string[]) => void`，元件內也完整實作了
d3 brush 框選，但 `TimelinePage.tsx:436-442` 的呼叫端從未傳入。
框選結果目前只用於降低未選中 dot 的 opacity，選完什麼都不能做。

**決策：保留現狀，不在計劃一移除。**
計劃二 Phase 5-1 會把它接到 `EventCompareDrawer`（PR #18 已進 main 的現成元件）。
現在移除、兩週後再加回來是白工。此處僅記錄，避免下個 session 誤判為死碼而清掉。

---

## 2. 開發 Checkpoint

### 2.1 哪些檔案會被異動

| 檔案 | 動作 | 對應 |
|------|------|------|
| `frontend/src/lib/timelineSort.ts` | 新增 | F1 純函數 |
| `frontend/src/lib/timelineSort.test.ts` | 新增 | F1 測試 |
| `frontend/src/pages/TimelinePage.tsx` | 修改 | F1 接線 / F2 / F3 / F4 / F5 |
| `frontend/src/hooks/useTimeline.ts` | 修改 | F4 `placeholderData` |
| `frontend/src/styles/timeline.css` | 修改 | F4 refetch 指示器 / F5 disabled 視圖卡 |
| `docs/UI_SPEC.md` | 修改 | F4 / F5 行為回寫 §3.7 |

> 超過 CLAUDE.md 的「一次 3 檔」上限，因此**拆成兩個 commit**：
> commit A = F1（lib × 2 + TimelinePage 的排序接線）
> commit B = F2–F5（TimelinePage + useTimeline + timeline.css + UI_SPEC）
>
> **實作後修正**：原估的 i18n 兩檔**沒有動到**——F5 的 LockedView 文案與 QualityBanner
> 完全同源（`timeline.banner.title` / `timeline.banner.sub`，連 analyzed/total/pct
> 三個插值都一樣），停用卡的 tooltip 也直接用既有的 `timeline.noRanksTooltip`，
> 零新增字串。改為多動 `timeline.css`（兩段新樣式，只用既有 token）與 `UI_SPEC.md`。

### 2.2 有沒有現成工具或函式可用

- **有**：`?event=` 深連結是 `EventAnalysisPage` 既有契約，F2 直接沿用，不新增路由或 query 參數
- **有**：ResizeObserver 的寫法直接比照 `MatrixCanvas.tsx:84-93`，不引入 hook 抽象
- **有**：F5 的 CTA 復用既有 `onCompute` handler 與 `tl-btn-warning` 樣式
- **有**：測試比照 `frontend/src/lib/graphLens.test.ts` 的 vitest 純函數慣例

### 2.3 會不會引入新依賴或新結構

- **無新套件**。`keepPreviousData` 來自已安裝的 `@tanstack/react-query` v5.90
- **一個新檔案** `lib/timelineSort.ts`：把排序邏輯從元件內抽出，目的是讓 F1 這種
  語意錯誤能被單元測試釘住（元件內的 `useMemo` 測不到）。與 `lib/graphLens.ts`
  同層同性質，非新架構
- **不改 CSS token**、**不改 API 形狀**、**不改 query key**

### 2.4 改錯怎麼還原

- 兩個 commit 各自獨立，`git revert <sha>` 即可
- 新增檔案無外部引用（僅 `TimelinePage.tsx` import），revert 不留孤兒
- `useTimeline` 的 query key **不變**，快取行為與其他頁無交互影響

### 2.5 文件同步確認

- **API endpoint**：無新增／修改 → `docs/API_CONTRACT.md` **不需更新**
- **UI 元件**：F5 改變了視圖切換卡的行為 → `docs/UI_SPEC.md` §3.7.1 需回寫
  （原文寫「未排序時序時，後 2 張卡右上有黃色 warning dot」，需補上「並停用」）
- **CSS token**：新增兩段 `.tl-*` 樣式，**只使用既有 token**（`--radius-md`、`--border`、
  `--bg-primary`、`--shadow-sm`、`--font-size-2xs`），未新增或修改任何 token
  → `docs/DESIGN_TOKENS.md` 不需更新
- **BACKLOG**：本批為缺陷修正，非 BACKLOG 條目

---

## 3. 驗收清單

| # | 驗收項 | 方式 |
|---|--------|------|
| 1 | 未排序事件在「故事時序」下排在最後，不是最前 | `timelineSort.test.ts` |
| 2 | 全部 null rank 時，順序等同章節順序（不是隨機） | `timelineSort.test.ts` |
| 3 | rank 相同時以 chapter 為次鍵，與後端一致 | `timelineSort.test.ts` |
| 4 | 詳情面板「前往深度分析」導到 `/events?event=<id>` 且該事件已選中 | 手動 |
| 5 | 縮放視窗後 CAUSES 連線仍貼齊卡片中心 | 手動 |
| 6 | 章節順序 ↔ 故事時序 切換時 toolbar 不消失 | 手動 |
| 7 | `hasChronologicalRanks=false` 時後兩張視圖卡不可點，且說明原因 | 手動 |
| 8 | `npm run lint` / `npx vitest run` 無新增錯誤 | 指令 |

### 3.1 實測結果（2026-07-25，`/verify`，種子書 62 事件）

| # | 結果 | 證據 |
|---|------|------|
| 1–3 | ✅ | `timelineSort.test.ts` 9 測試全過 |
| 4 | ✅ | 點未分析事件「前往深度分析頁觸發 EEP」→ URL `/events?event=1ee746ec…`、無 404、事件頁標題為該事件。**並反向確認舊連結是真的壞**：`/books/:id/analysis` 會出現 React Router 的 `Unexpected Application Error! 404 Not Found` 崩潰畫面（比原本以為的「導到不存在的頁」更嚴重） |
| 5 | ✅ | 視窗 900→520 高，卡片中心 y 318.7→128.7，spine 於 first/mid/last 三點（103,128.7 / 6097,117.3 / 12287,117.3）全部與卡片中心對齊。舊 deps `[temporalRelations, events, layout]` 在 resize 時都不變，故必然不會重新量測 |
| 6 | ✅ **已補驗（2026-07-25 稍晚）** | 為建交付包而實跑 #13b 時序計算後，`hasChronologicalRanks` 轉 true、三張視圖卡全部解鎖，F4 隨即可驗：切換「章節順序 → 故事時序」期間以 20ms 間隔取樣 232 次，`.tl-toolbar` **消失 0 次**、全頁 spinner **出現 0 次**、新的 `.tl-canvas-refetch` 膠囊有渲染到；切換後 62 張卡正常 |
| 7 | ✅ | 後兩張卡 `disabled=true`、warn dot 在、tooltip 為 `timeline.noRanksTooltip`、opacity 0.55；程式化 `.click()` 後 `aria-selected` 不變（確實 inert） |
| 8 | ✅ | lint 0 error 0 warning；vitest 8 檔 94 測試全過；`tsc` 於本批檔案 0 錯 |

**第 6 項一度驗不了的原因**（保留紀錄）：當時種子書 `hasChronologicalRanks: false`
（62 事件、rank 0 筆），而 F5 剛好把「故事時序」卡停用了 —— 唯一能觸發 order 切換的
入口被關上。F4 的意義本來也只在 rank 存在時才出現。後來為了建設計交付包而實跑
時序計算（52/62 取得 rank），視圖解鎖，F4 也就順勢驗完，未額外花成本。

**`LockedView` 亦不可達**：卡片停用後，UI 上走不到「停在非 narrative 視圖且無 rank」的狀態。
它是留給計劃二 P0-2（URL 狀態）落地後、使用者可用 `?view=matrix` 直接進頁的情境，
屬防禦性安全網，非目前的主要守門機制（主要守門是停用卡片）。

---

## 4. 不在範圍內（明確排除）

以下即使順手就能改也**不做**，全部歸計劃二：

- 檔案拆分（`TimelinePage.tsx` 1955 行 / 13 個元件同檔）
- URL／localStorage 狀態持久化
- 篩選由 dim 改為真 filter、符合筆數計數
- `TimelineEvent` 補 `has_analysis` 旗標（動到 API）
- `before` 時序關係的呈現（`TimelinePage.tsx:1133` 目前只收 CAUSES）
- RWD、鍵盤導覽、面板 focus 管理
- 任何新視圖
