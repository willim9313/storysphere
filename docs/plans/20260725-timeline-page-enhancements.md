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

Phase 3／4 的所有視圖都建立在 rank 之上。若多數事件 rank 為 null，
泳道與疊圖都會退化成「一堆 degraded 事件」，應優先處理覆蓋率而非做新視圖。

**已實測（種子書 `大唐雙龍傳_冊1_卷一第1-7章_實驗用`，#13a 實際回應）**：

| 指標 | 計算**前**（07-25 上午） | 計算**後**（07-25 實跑 #13b） | 影響 |
|------|------|------|------|
| 事件總數 | 62（Ch.1–7） | 62 | — |
| 有 `chronologicalRank` | **0（0%）** | **52（84%）** | 三視圖已全部解鎖 |
| **rank = null** | 62 | **10（16%）** | ⚠️ **算完仍有 16% 排不進去——未排序是穩定的一類，不是過渡態** |
| `temporalRelations` | 0 筆 | **200 筆** | 見下 |
| ├ `before` | 0 | **199** | ⚠️ **全部被丟棄**（`TimelinePage.tsx:1133` 只收 CAUSES） |
| └ `CAUSES` | 0 | **0** | ⚠️ **畫布唯一會畫的類型，實際一筆都沒有** |
| `narrativeMode` | `present` 100% | `present` **100%**（未改變） | 倒敘／預敘／並行樣式從未被觸發 |
| `storyTimeHint` 覆蓋率 | 9/62（14.5%） | 14.5%（未改變） | **Genette 門檻 60%，跑不起來** |
| EEP 覆蓋率 | 13/62（21%） | 21% | Phase 1 的 `hasAnalysis` 標記有明顯區分度 |

**這改變了幾件事**：

1. **rank 不是「算了就會有」**。算完仍有 10 筆為 null，所以 degraded 區是常設而非暫時。
   Phase 4 泳道仍應以**章節**（`participants` + `chapter`）定位，不依賴 rank。
2. **P5-2（因果鏈）的前提整個變了**：不是「沒資料」，而是**有 199 條 `before` 沒被用，
   而唯一會畫的 `CAUSES` 是 0**。所以 P5-2 的真正內容應是「把 before 納入呈現」，
   而不是「等 CAUSES 長出來」。連帶的設計難題是 62 節點 / 199 條線的密度管理。
3. **Genette 相關的一切（S11 / displacement 色帶 / 矩陣 Genette 著色）在這本書上到不了**
   ——`storyTimeHint` 只有 14.5%，且跑時序計算不會改善（資料來源不同）。
   「Genette 不可用」應視為**常態**來設計，而非邊緣狀態。
4. **交付包已用「真實 + 構造」雙樣本解決**（2026-07-25 完成）：
   `timeline-computed.json` 為真實回應；`timeline-constructed.json` 手工注入
   flashback／flashforward／parallel／location／CAUSES 供設計樣式用，檔內有 `_README` 標示。

### 1.3 `before` 關係目前被整批丟棄——實測是 199 / 200

`GET /timeline` 回傳的 `temporalRelations` 含 `before` 與 `causes` 兩種，
但 `TimelinePage.tsx:1133` 只收 `CAUSES`，`before` 抓回來後直接丟掉。

**實測（跑完時序計算後）：200 筆關係中 199 筆是 `before`、`CAUSES` 是 0。**

也就是說現況的畫布**永遠畫不出任何一條連線**，而手上有 199 條沒被使用的時序資料。
這把 P5-2 從「錦上添花」提升為「唯一能讓連線功能真正有內容的路徑」（見 §4.5）。

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
| G10 | 工具列右側四個控制項無層級、無說明，且按鈕外觀是**死 CSS**（見 §2.1） | 體驗 | Phase 3 |

### 2.1 工具列右側：三種層級的控制項擠在同一列（含一條死 CSS）

```
[⇄ ↕]  [☰ 篩選]  [↻ 重新計算時序]  [⎇ Genette 分析]
```

**(a) 按鈕外觀是死碼——目前的長相從來不是設計出來的長相**

`timeline.css:22` 的頁面級 reset 與 `timeline.css:141` 的按鈕樣式相衝，而**前者贏**：

| 選擇器 | 特異性 | 宣告 |
|--------|--------|------|
| `.tl button` | **(0,1,1)** ← 勝 | `border: none; background: none;` |
| `.tl-btn` | (0,1,0) | `border: 1px solid var(--border); background: var(--bg-primary);` |

實測 computed style（Warm 主題，執行中的 app）：
`border-style: none`、`border-width: 0px`、`background-color: rgba(0,0,0,0)`。
**`.tl-btn` 那兩行從未生效**，三顆按鈕靜止時都是裸文字加圖示，沒有任何按鈕外觀。

連帶兩個現象也一併解釋了：
- `.tl-btn:hover:not(:disabled)`（0,3,0）**贏過** reset → 底色只在滑鼠移上去才出現，
  等於「hover 之後才知道那是可以按的」
- `.tl-btn-warning`（0,2,0）也贏 → 所以 QualityBanner 的 CTA 看起來像按鈕、
  工具列這幾顆卻不像。**同一頁兩種按鈕外觀不一致的根因就是這裡**

> ⚠️ **給設計側**：不要把現況截圖當成「上一版的設計決策」來延續或推翻——
> 它是一條沒生效的規則造成的意外。請直接決定按鈕該長什麼樣，開發端負責把
> 特異性衝突解掉（提高 `.tl-btn` 特異性或收斂 `.tl button` reset 的範圍）。

**(b) layout 切換完全沒有文字**

群組上有 `aria-label="佈局切換"`，兩顆子按鈕只有 `title`（「切換為水平佈局」／
「切換為垂直佈局」），視覺上就是兩個箭頭圖示，且 `ArrowLeftRight` / `ArrowUpDown`
在其他產品裡更常代表「排序／交換」而非「排列方向」。

對比左側：三張視圖卡**每張都有一行解釋性副標**（「依書中出現順序…」）。
同一條工具列上，左半邊在教學、右半邊零說明。

**(c) 三種性質完全不同的操作，同一視覺權重、同一列**

| 控制項 | 性質 | 代價 | 可逆 |
|--------|------|------|------|
| layout ⇄↕ | 檢視選項 | 免費即時 | ✅ |
| 篩選 | 資料篩選 | 免費即時 | ✅ |
| **重新計算時序** | **觸發 LLM 計算** | **數分鐘 + token** | ❌ 覆寫既有 rank |
| **Genette 分析** | **觸發 LLM 分析** | **數分鐘 + token** | ❌ |

後兩者的成本**只寫在 `title` tooltip 裡**，且**沒有確認對話框**。
而 `components/ui/ConfirmDialog.tsx` 已經被 `EventAnalysisPage` 與
`CharacterAnalysisPage` 使用；事件頁的批次 EEP 更已有成本預估
（「預估約 7 分鐘 · 已分析的事件會自動跳過」，i18n `etaMinutes` / `etaSeconds` 現成）。
**時間軸頁是唯一沒跟上這個慣例的頁面。**

**(d) 「Genette 分析」是專有名詞，零解釋**

停用時只是整顆 `opacity: 0.65`（`.tl-btn.tl-btn-muted`），停用原因只在 tooltip：
實測本書為「故事時間提示覆蓋率 15%，低於 60% 閾值」。
使用者看到的是一顆灰掉、沒說為什麼、而且不知道 Genette 是誰的按鈕。

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

**P3-1b｜工具列右側重整（G10 / §2.1）**
- 解掉 `.tl button` 對 `.tl-btn` 的特異性覆蓋，讓按鈕真的有設計過的外觀
- 依「檢視選項 / 資料操作 / 昂貴計算」分組，昂貴的兩顆與前兩者視覺分離
- layout 切換補文字或明確圖示語意；Genette 補一句人話說明它在算什麼
- 昂貴操作接上既有的 `ConfirmDialog` 與成本預估（`etaMinutes` 已存在）
- Genette 停用時把原因寫在畫面上，而不是只藏在 tooltip

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

**尺度：全頁視覺重做**（2026-07-25 定案）。V2 的視覺語言不需沿用，
硬約束只有三條：token 不新增／不改值（`--narrative-*` 跨頁共用）、
Warm+Ink 雙淺底主題、矩陣的軸編碼。`EventCard`、畫布構圖、面板層次、
`NarrativeIcon`、並行群組、OnboardingHero **全部開放**。

> 先前版本把這些標為「維持」，導致 brief 自相矛盾——一邊要求解決「畫布八成留白」
> 與「八成卡片資訊稀疏」，一邊鎖住畫布構圖與卡片版面。已解除。

**送**（brief §4，已依此建包）：

| brief 編號 | 內容 | 對應 |
|---|---|---|
| §4.-1【最高】 | **這頁的視覺任務**：視覺重心、資訊層級、色彩編碼取捨、卡片形態 | **全頁重做定案後新增** |
| §4.0【最高】 | 工具列右半邊 | G10 / §2.1 |
| §4.1【高】 | 篩選：只能淡化不能收斂 | P3-1 |
| §4.1b【高】 | 橫向畫布八成留白 + 無捲動提示 | **拍截圖時才發現，原計劃沒有** |
| §4.2【高】 | 長書導覽 | P3-2 |
| §4.3【中】 | RWD 與面板（1440/1280/1024） | P3-3 |
| §4.4【高】 | 角色軌跡泳道 | Phase 4 |

> ⚠️ **對工程端的影響**：全頁重做意味著 Phase 3 的實作量顯著大於原估，
> 且 `EventCard` / 畫布構圖的改動會與 P0-2（URL 狀態）以外的既有程式大面積相交。
> 拿到 canvas 後**需重新估一次分期**，不要直接沿用 §4.3 的 P3-x 拆法。

> G10 是使用者主動指出的痛點（「這邊當初設計上好像沒有寫得很清楚在幹麻」），
> 且 §2.1(a) 已證實現況長相是 CSS 意外而非設計決策 —— brief 中已列為最高優先。

**不送**：Phase 1、Phase 2、P5-1、P5-4、P5-5 —— 接線與小標記，沿用既有視覺語言即可。

**～～P5-2、P5-3～～ 本輪不送**（**修正先前版本的自相矛盾**）：§1.2 已指出這兩項
在補上時序資料前不該開工，先前的 §6.1 卻把它們列入送審範圍。以 §1.2 為準：
P5-2 待「把 199 條 `before` 納入呈現」的方向定案後另送；P5-3 待張力資料整合後另送。

### 6.2 交付包 ✅ **已建立**（2026-07-25）

路徑 `docs/handoff/20260725-timeline-page/`，比照
`docs/handoff/20260722-event-analysis-redesign/` 的結構：

| 檔案 | 狀態 |
|------|------|
| `README.md` | ✅ 內容清單 + 兩份 payload 的差別 + 三個重點 |
| `01-design-brief.md` | ✅ 範圍／涉及元件／不在範圍／資料事實／**狀態矩陣 S1–S31**／5 項需求（含優先序）／約束／驗收清單 |
| `02-tokens.css` | ✅ 自 `frontend/src/styles/tokens.css` 複製 |
| `03-DESIGN_TOKENS.md` | ✅ 自 `docs/DESIGN_TOKENS.md` 複製 |
| `i18n/analysis.zh-TW.timeline.json` | ✅ `timeline.*` 子樹（45 個 key） |
| `sample-payloads/timeline-computed.json` | ✅ 真實 #13a（62 事件 / 52 有 rank / 10 無 / 200 關係） |
| `sample-payloads/timeline-constructed.json` | ✅ 手工構造（補 flashback / flashforward / parallel / location / CAUSES），檔內 `_README` 標示 |
| `screenshots/` | ✅ 7 張（Warm 5 + Ink 2），皆為實跑時序計算後的真實畫面 |

> `04-UI_SPEC.md` **未複製**：brief §1.1 已把涉及元件逐一列名並標註是否重設計，
> 直接引用 `docs/UI_SPEC.md §3.7` 即可，複製一份反而會漂移。

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
8. **現況截圖中的工具列按鈕外觀不是設計決策**，是 `.tl button` reset 蓋掉
   `.tl-btn` 造成的（§2.1a）。請直接重新決定，不必揣摩「原本為什麼長這樣」
9. 設計完成後以 **`.dc.html` canvas** 交回；開發端依 canvas 實作，不依 prose 重新詮釋

---

## 7. 未決事項

| # | 問題 | 需誰決定 |
|---|------|---------|
| 1 | Phase 4 泳道是**第四張視圖卡**，還是既有視圖上的疊加模式？ | 設計 + 使用者 |
| 2 | P3-1 的「只顯示符合項」是開關，還是取代 dim？ | 設計 |
| 3 | P5-3 張力疊圖需拉張力頁的 query，是否可接受時間軸頁多一支 API 依賴？ | 使用者 |
| 4 | §1.2 的 rank 填充率實測結果若偏低，Phase 4 是否延後？ | 實測後定 |
