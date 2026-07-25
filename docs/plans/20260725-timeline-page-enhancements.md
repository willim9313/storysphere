# 時間軸頁功能擴充 — 計劃二

**日期**：2026-07-25
**範疇**：`/books/:bookId/timeline`（`TimelinePage`、`MatrixCanvas`、`timeline.css`）
**Branch**：`feat/timeline-page-revamp`（**尚未建立**，待計劃一合併後自 `main` 切出）
**前置**：`docs/plans/20260725-timeline-page-fixes.md`（計劃一／缺陷修正）
**現況版面規格**：[`docs/UI_SPEC.md` §3.7](../UI_SPEC.md)
**前一輪設計**：`docs/plans/20260519-timeline-page-redesign.md`（V2 版面，已落地為現況）

**狀態**：📋 規劃中，**尚未開工**。Phase 3／4 需先送 Claude Design。

---

## 0. 給接手者的起點

讀完 §1（資料語意警告）與 §2（現況缺口）就能接手。建議順序：

1. **Phase 1**（§4.1）——純工程 + 一個後端欄位，不依賴設計稿，可獨立 PR。**建議先做這個**。
2. **Phase 2**（§4.2）——接線既有元件，同樣不依賴設計稿。
3. **Phase 3／4 送 Claude Design**（§6），拿到 `.dc.html` canvas 後再實作，
   **以 canvas 為準，不要依本文件的 prose 重新詮釋版面**。

---

## 1. ⚠️ 資料語意警告（先讀）

### 1.1 詳情面板的「時序關係」不是時序關係

`TimelinePage.tsx:1645-1650` 的 MiniTimeline 讀的是：

```ts
analysis.eep.priorEventIds / analysis.eep.subsequentEventIds
```

後端語意（`analysis_service.py`）是：**共享至少一個參與者、且位於較早／較晚章節的事件**。
這是**人物時間線的鄰接，不是因果也不是故事時序**。

**但事件分析頁已經在 PR #18 改掉了**（見 [`UI_SPEC.md` §3.5「事件脈絡與鄰接」](../UI_SPEC.md)）：

- 不再讀 EEP 存的 `priorEventIds` / `subsequentEventIds`，改由 #13a timeline 的
  `participants` 即時計算（`components/analysis/overview/eventAdjacency.ts`）
- 排序改為「章節鄰近度 + IDF 權重」，而非後端那份未排序清單
- 命名改為「上下文位置」，**文案一律不得稱之為因果或時序**

時間軸頁**還停在舊實作與舊命名**：section 標題 `timeline.panel.temporal = "時序關係"`、
列標籤 `timeline.priorEvents = "前驅 · prior"`。在一個主打「故事時序」的頁面上，
用「時序關係／前驅」去標一組其實是「共享人物的鄰近章節事件」的資料，誤導性比事件頁更強。

> **這是計劃二的必修項，不是選配**（§4.1 P1-3）。

### 1.2 `chronologicalRank` 的 null 佔比決定一切

Phase 3／4 的所有視圖都建立在 rank 之上。**開工前先量實際填充率**：
若多數事件 rank 為 null，泳道與疊圖都會退化成「一堆 degraded 事件」，
應優先處理覆蓋率而非做新視圖。

### 1.3 `before` 關係目前被整批丟棄

`GET /timeline` 回傳的 `temporalRelations` 含 `before` 與 `causes` 兩種，
但 `TimelinePage.tsx:1133` 只收 `CAUSES`，`before` 抓回來後直接丟掉，
使用者不知道有這層資料。設計時可考慮是否要呈現（§4.5 P5-2）。

---

## 2. 現況缺口總表

| ID | 缺口 | 性質 | 落在 |
|---|---|---|---|
| G1 | 卡片上看不出哪些事件有 EEP，只能點下去試 | 資訊 | Phase 1 |
| G2 | 「時序關係」命名與實作已與事件頁脫節（§1.1） | 語意 | Phase 1 |
| G3 | 唯一沒有「回到原文」路徑的分析頁 | 功能 | Phase 2 |
| G4 | 篩選只做 dim 不做 filter，無符合筆數 | 體驗 | Phase 3 |
| G5 | 無 URL／localStorage 狀態，重整即失、無法分享 | 體驗 | Phase 3 |
| G6 | 長書無章節 ruler／跳章／鍵盤導覽；面板無 focus 管理、Esc 不關 | 體驗 | Phase 3 |
| G7 | RWD 幾乎沒做（`timeline.css` 1304 行僅一個 `@media`） | 體驗 | Phase 3 |
| G8 | 缺角色維度：看得到事件何時發生，看不到誰貫穿誰缺席 | 功能 | Phase 4 |
| G9 | `TimelinePage.tsx` 1955 行 / 13 元件同檔 | 結構 | Phase 3 前置 |

---

## 3. PR #18 帶來的可重用元件（影響優先序）

計劃二原本估的兩項成本因 PR #18 大幅下降，**這是先做 Phase 2 的理由**：

| 元件 | 位置 | 可用於 |
|------|------|--------|
| `useSourceJump(bookId)` | `hooks/useSourceJump.ts` | G3 跳原文。支援 `{ chapter }` scope，正好對應事件的章節錨點 |
| `SourceJumpText` | `components/analysis/SourceJumpText.tsx` | G3 的可點文字樣式（虛線底線 + 載入態），已處理 a11y |
| `EventCompareDrawer` | `components/analysis/EventCompareDrawer.tsx` | P5-1 對比。需 `TimelineEvent` → `AnalysisItem` 映射 |
| `eventAdjacency.ts` | `components/analysis/overview/` | G2 改用即時計算的鄰接，與事件頁同一份邏輯 |
| `passageLookup.ts` | `lib/passageLookup.ts` | 段落比對底層 |

---

## 4. 分期

每個 Phase 獨立可交付、可中止。**不需要照順序做完全部**。

### 4.1 Phase 1 — 讓使用者看得出「哪些事件有料」★ 最高投報

**P1-1｜`TimelineEvent` 補 `hasAnalysis`**
後端 `get_book_timeline` 的迴圈（`books.py:2478-2492`）本來就在逐一查
`cache.get(f"event:{book_id}:{ev.id}")` 來算 `analyzed_count`，
把結果順手放進 entry 即可，**零額外 I/O**。

- 後端：`TimelineEventEntry` 加 `has_analysis: bool`
- `npm run gen:types` 重生型別
- 卡片右上角標記已分析（視覺樣式微小，不需設計稿）
- **需更新 `docs/API_CONTRACT.md` #13a，commit 標 `[api-contract updated]`**

**P1-2｜詳情面板不再對未分析事件空打**
`TimelinePage.tsx:1484-1488` 每次選取都發 `fetchEventAnalysisDetail`，未分析事件必 404。
有了 `hasAnalysis` 就能 `enabled: event.hasAnalysis`，未分析時直接顯示 CTA。

**P1-3｜修正「時序關係」語意（§1.1）**
- 改用 `eventAdjacency.ts` 即時計算，與事件頁同源
- 命名對齊事件頁的「上下文位置」，移除「前驅／後續／時序」等暗示因果或時序的字眼
- i18n 兩語系同步

> 異動估計：`books.py`、`schemas/books.py`、`TimelinePage.tsx`、`generated.ts`、
> i18n × 2、tests → **需拆 3 個 commit**（後端 / 型別+接線 / i18n+文件）。

### 4.2 Phase 2 — 回到原文（接線為主）

**P2-1｜詳情面板加「看原文」**
`useSourceJump` 已支援章節 scope，事件有 `chapter`，直接可用。
掛在事件標題或概要區塊，比照 `SourceJumpText` 的視覺語言。

**P2-2｜EEP 關鍵引言可點跳原文**
`EepBody` 的 `keyQuotes`（`TimelinePage.tsx:1838-1847`）目前是純文字，
角色頁的引言已經可點跳。同一個 hook 直接套。

> 這兩項讓時間軸從「只能看」變成「看到 → 立刻讀到」，是補完整條動線的關鍵一步。

### 4.3 Phase 3 — 篩選、導覽、狀態、RWD 🎨 **需 Claude Design**

**前置 P3-0｜拆檔 + 狀態層**（純結構，無行為變化）
- `TimelinePage.tsx` → 拆到 `components/timeline/`（Toolbar / FilterSheet /
  TimelineCanvas / EventCard / EventDetailPanel），對齊 event-analysis 與 character 頁慣例
- `order` / `layout` / `filter` / `selectedEventId` 改走 URL（`?view=&event=&chars=`）
  與 localStorage，比照 GraphPage / EventAnalysisPage
- **僅在確定要做 Phase 3 時才做**；單獨做不解決任何使用者問題

**P3-1｜篩選由 dim 升級**
現況只加 `.dim` class，長書時使用者得在一片灰卡裡目視找亮的。需要：
- 「符合 N / 共 M 筆」計數
- 「只顯示符合項」開關（dim 保留上下文、filter 壓縮畫面，兩種模式都有用，不是二選一）

**P3-2｜長書導覽**
章節 ruler／跳到第 N 章／`←→` 在事件間移動／`Esc` 關面板／面板開啟時 focus 管理。

**P3-3｜RWD 與面板**
`timeline.css` 1304 行只有一個 `@media (max-width: 640px)`。
360px 固定面板不可摺不可調寬，在筆電視窗就會把橫向畫布壓得很窄。

### 4.4 Phase 4 — 角色軌跡泳道（新視圖）🎨 **需 Claude Design** ★ 差異化

選 1–3 個角色 → 時間軸切成泳道，呈現：誰在哪些事件出現、哪段完全缺席、誰與誰同框。

- **資料已備齊**：`TimelineEvent.participants` 已含 id / name / type，**零後端改動**
- **為什麼值得做**：圖譜頁看「關係是什麼」，時間軸應該看「關係何時發生」。
  現況兩頁的差異只有排版，泳道才是時間軸不可取代的理由
- 屬高複雜度視覺設計 → 依 CLAUDE.md **需另出獨立規劃文件**存 `docs/plans/`

### 4.5 Phase 5 — 延伸（各自獨立，可單點取用）

| ID | 內容 | 成本 | 需設計 |
|---|---|---|---|
| P5-1 | **事件對比**：接上 `onBrushSelect`（計劃一 F6 刻意保留的 dead prop）→ 矩陣框選 → 重用 `EventCompareDrawer` | 低 | 否 |
| P5-2 | **因果鏈追蹤**：選取事件後高亮上下游 CAUSES 傳遞閉包、其餘淡出；順便把被丟棄的 `before` 關係（§1.3）以不同線型帶進來 | 中 | 是 |
| P5-3 | **張力曲線疊圖**：X 軸同為章節，畫布底部疊張力 sparkline，看 KERNEL 密度是否對上張力峰值 | 中 | 是 |
| P5-4 | **劇透護欄**：「只顯示到第 N 章」滑桿，與既有 epistemic state 概念同源 | 低 | 否 |
| P5-5 | **匯出**：矩陣 PNG/SVG + 事件清單 CSV，比照知識圖譜頁 F4 慣例 | 低 | 否 |

---

## 5. 建議路徑

```
計劃一（修正）  →  Phase 1  →  ⏸ 停下來看  →  Phase 2  →  Phase 3/4（設計後）
```

**為什麼在 Phase 1 之後停**：`hasAnalysis` 會直接改變這頁的使用動線
（使用者終於知道該點哪些事件）。實際用過之後，再決定 Phase 4 的泳道
與 Phase 5 的疊圖哪個先做，會比現在紙上推演準得多。

**Phase 3 的 P3-0 拆檔建議延後**：它不解決任何使用者問題，
等 Phase 3 真的要大改 UI 時一起做，才不會白拆一次又改一次。

---

## 6. 送 Claude Design 的範圍與交付包

### 6.1 送什麼

**送**：Phase 3（篩選／導覽／RWD／面板）與 Phase 4（角色泳道），
以及 Phase 5 中標記「需設計」的 P5-2、P5-3。

**不送**：Phase 1、Phase 2、P5-1、P5-4、P5-5 —— 這些是接線與小標記，
沿用既有視覺語言即可，送設計反而拖慢。

### 6.2 交付包（待建立）

比照 `docs/handoff/20260722-event-analysis-redesign/` 的結構，
路徑 `docs/handoff/20260725-timeline-page/`：

| 檔案 | 說明 |
|------|------|
| `01-design-brief.md` | 需求書：範圍、缺口 G4–G8、約束、驗收清單 |
| `02-tokens.css` | 全站 design token（Warm `:root` + Ink `[data-theme="ink"]`）——硬約束 |
| `03-DESIGN_TOKENS.md` | token 對照表 |
| `04-UI_SPEC.md` | 現況版面規格（§3.7 節錄） |
| `i18n/analysis.zh-TW.json` | 真實文案，排版請用真字串，勿用 lorem ipsum |
| `sample-payloads/timeline.json` | **真實 #13a 回應**，含 rank 為 null 的事件 |
| `screenshots/` | 三視圖現況（Warm + Ink） |

### 6.3 給設計側的硬約束（必須寫進 brief）

1. **掛在既有的 StorySphere Claude Design 專案下**，不要另開新專案
2. **主題只有 Warm 與 Ink 兩套，皆為淺底，沒有深色主題**；兩套下皆需成立
3. **不得新增 design token**；`frontend/src/styles/tokens.css` 是唯一來源
4. **narrative mode 的語意配色不可整組更換**（present / flashback / flashforward /
   parallel / unknown 對應既有 narrative tokens，僅可微調飽和度與對比）
5. **矩陣視圖核心語意保留**：X = 章節、Y = `chronological_rank`、
   degraded row 在 `-0.1`、45° 對照線。視覺可改，語意不可改
6. **左右色帶雙編碼是既有契約**：左 = narrativeMode、右 = Genette displacement
   （見 UI_SPEC §3.7.4），改動需明確說明取代方案
7. **rank 為 null 是常態不是例外**，任何新視圖都必須先設計好「這批事件放哪」
8. 設計完成後以 **`.dc.html` canvas** 交回；開發端依 canvas 實作，不依 prose 重新詮釋

---

## 7. 未決事項

| # | 問題 | 需誰決定 |
|---|------|---------|
| 1 | Phase 4 泳道是**第四張視圖卡**，還是既有視圖上的疊加模式？ | 設計 + 使用者 |
| 2 | P3-1 的「只顯示符合項」是開關，還是取代 dim？ | 設計 |
| 3 | P5-3 張力疊圖需拉張力頁的 query，是否可接受時間軸頁多一支 API 依賴？ | 使用者 |
| 4 | §1.2 的 rank 填充率實測結果若偏低，Phase 4 是否延後？ | 實測後定 |
