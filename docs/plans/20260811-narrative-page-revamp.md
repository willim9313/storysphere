# 敘事結構頁翻新計畫

**日期：** 2026-08-11
**對象：** `/books/:bookId/narrative`（`frontend/src/pages/NarrativePage.tsx` + `components/narrative/`）
**Branch：** `feat/narrative-page-revamp`（自 `origin/main` 切出）
**設計交付包：** `docs/handoff/20260811-narrative-page/`
**背景：** 書籍範圍內 9 個頁面中，敘事結構頁是唯一未經翻新的一頁。最後一次設計性改動是
2026-06-02 的 PlotSpine 重畫，早於 2026-07-10 的 design-system v2（ink-on-paper 雙主題 +
shape token）。7 月後唯一異動是 8/06 加上的 stale banner（+13/-1）。

**狀態**：✅ **Phase 1–4 全數實作完成（2026-08-12，branch `feat/narrative-page-revamp`）。**
診斷 A1–A3、B1–B2、C1–C4、D1–D2、E1–E8 皆已結案；本文件保留為決策紀錄。
**落地後的規格見 [`docs/UI_SPEC.md` §3.14](../UI_SPEC.md) 與
[`docs/API_CONTRACT.md`](../API_CONTRACT.md) #21a／#21k／#21l——那兩份才是現況，本文件不是。**

> ⚠️ **§一～§九為 2026-08-11 的規劃內容，所述現況已被本次實作改變。**
> §十為設計稿核對，§十一為實作順序與 Phase 3 重拆。**§十二是實作與計畫的差異紀錄**，
> 只有那一節記載了計畫沒說、或說錯的事——要快速掌握結果請直接讀 §十二。

---

## 一、現況診斷

以 `名字的潮汐`（38 kernel / 0 satellite / 9 unclassified、11 階段）與
`大唐雙龍傳_冊1`（3 / 0 / 59、0 階段）兩本實際資料驗證。

### A. 死路徑 — 寫了但永遠不會發生

| # | 現象 | 證據 |
|---|------|------|
| A1 | 階段與事件完全沒有連結 | `representative_event_ids` 在整個 `backend/` 只有 domain 欄位定義（`domain/narrative.py:50`），無任何寫入點。實測 11 個階段 reps 全為 0 |
| A2 | 三態視覺的 `absent` 態永不出現 | `map_hero_journey` 明寫「Stages with no clear evidence are omitted」（`narrative_service.py:575`），前端未補回 `STAGE_ORDER`。實測第 9 階段「報酬」整格消失，編號 8 直接跳 10 |
| A3 | 兩個端點無前端呼叫者 | `POST /narrative/classify`、`POST /narrative/refine` 全前端 grep 無 caller；`propp_functions` 從未渲染 |

A1 連帶空轉：`NarrativePage.tsx:72-86` 的 events map、`StageDetail.tsx:46-48` 的 `evs`、
`atoms.tsx` 的 `EventPill`，以及每次進頁都白打一次的 `fetchEventAnalyses` 請求。

A2 的關鍵在於 **`layouts.tsx` 其實已經完整實作 absent 分支**（`:92`、`:138`、`:395-398`），
`formatChapters` 也處理空陣列。缺的只是「沒人餵它缺席階段」。頁面同時印著
「缺席的階段是有意義的敘事選擇，而非『未完成』」——說了，卻看不到。

### B. 有結果之後就動不了

| # | 現象 | 證據 |
|---|------|------|
| B1 | 沒有重跑入口 | 觸發按鈕只在空狀態渲染（`NarrativePage.tsx:136`），`triggerHeroJourney` 的 `force` 參數前端到不了。stale banner 報警卻不給滅火器 |
| B2 | 核可不改變來源標示 | `update_review` 只寫 `review_status`（`narrative_service.py:549-561`），`classification_source` 的 `human_verified` 列舉值等於沒人用 |

### C. 真實資料下的顯示失效

| # | 現象 |
|---|------|
| C1 | satellite 兩本都是 0 → 比例條中段永遠零寬，右側擠出空隙；標題「Kernel / Satellite 統計」名不副實，實際是 kernel vs unclassified |
| C2 | 骨幹軌道兩種資料都失效：名字的潮汐每章都是多事件章 → 整條軌道只剩「N 件事件」，一個標題都顯示不出來；大唐只有第 1 章一顆點，拖一條空線到第 7 章 |
| C3 | 英雄旅程說到第 10 章，骨幹軌道只到第 9 章（kernel 事件止於 ch9），兩區塊對同一本書講不同章節範圍且無說明 |
| C4 | 全頁不可點。唯一導覽是底部「前往事件分析頁」。事件頁其實已支援 `?event=<id>` 深連結（`EventAnalysisPage.tsx:59`），沒被利用 |

### D. 缺席的功能

- **D1** Genette 時序（`story_time_structure`、analepsis/prolepsis）是敘事結構的核心，卻只在時間軸頁
- **D2** 張力曲線 × 英雄旅程階段是最自然的疊圖，張力頁已有逐章 TEU，這裡沒接

### E. 首次進入看不懂

以「第一次打開這頁的人」為準檢視，以下每一項都是**用 layout 解、而非用說明文字解**的問題。

| # | 現象 |
|---|------|
| E1 | 全頁沒有頁面級定位。breadcrumb 之後直接是卡片，沒有任何東西說「這頁在回答什麼問題」 |
| E2 | 兩張卡視覺權重相同、並列無階層。「英雄旅程」是**詮釋**（Campbell 階段映射）、「情節骨幹摘要」是**統計**（Chatman kernel/satellite），是兩個不同框架，頁面完全沒表達兩者關係與閱讀順序 |
| E3 | 全頁最關鍵的解讀指引——「缺席的階段是有意義的敘事選擇，而非『未完成』」——是灰色 2xs 小字，與裝飾性註腳同權重。讀不到這句，使用者會直接把缺席理解成分析失敗 |
| E4 | 四個 layout 切換器沒有任何差異說明，使用者不知道為何有四種、各適合看什麼；而預設的「水平軌跡」恰好是資訊密度最低的一個 |
| E5 | 「信心 0.90」沒有基準。0.90 算高嗎？相對什麼？——`stageState` 的 0.6 門檻就是現成基準，但沒被視覺化 |
| E6 | 「Kernel / Satellite」「Campbell 12 階段」等術語直接上，頁內無說明也無出口。`/methodology` 頁有完整框架說明，且 `getStageTheory` 已在讀 `frameworksData`（`heroJourney.ts:122-134`）——資料就在手邊卻沒連結 |
| E7 | 空狀態只說「點擊下方按鈕開始分析」，不說前置條件。實際上 `map_hero_journey` 沒有章節摘要就**靜默回傳 `[]`**（`narrative_service.py:607-610`）：任務顯示成功、頁面卻毫無變化。這是會真實踩到的死路 |
| E8 | 第二張卡落在摺線處被切斷，與第一張卡權重相同，看不出下方還有內容、也看不出該不該往下看 |

---

## 二、設計原則

1. **先救活既有實作，再談新增。** A1/A2 的修法是讓已寫好的程式碼開始運作，不是重寫。
2. **不新增任何 API endpoint。** 全部四階段複用現有端點（下方逐項標注）。
3. **推導欄位不落地。** 沿用 `is_stale` 既有模式：per-request 計算，不寫進快取。
4. **維持「檢視器」定位。** 與閱讀頁一致，此頁是分析結果的檢視與導覽，不承擔編輯敘事內容的責任。
5. **可讀性由 layout 承擔，不由文字承擔。** 使用者第一次進來就該看懂這頁在講什麼、
   該從哪讀起、看到的數字怎麼解讀。解法是版面階層、位置、視覺基準，不是加說明段落——
   每多一段文字，就是一次版面沒把話講清楚的補救。詳見下節。

---

## 三、首次理解成本（貫穿全部階段）

> 對應診斷 E1–E8。原則：**能用位置與階層講的，就不要用句子講。**
> 以下每項都標注新增的文字量，總計不超過既有頁面文案量。

### 3-1 頁面定位帶（解 E1、E2、E8）

breadcrumb 之下加一條輕量頁首，只承擔三件事：

- 一句話說明這頁在回答什麼（**約 20 字，全頁唯一的導言**）
- 兩張卡各給**序號與角色標籤**：`① 敘事弧 — 這本書怎麼走` / `② 事件骨幹 — 哪些事件撐起這條弧`。
  序號直接建立閱讀順序與階層，取代任何「這兩張卡的關係是……」的說明段落
- 序號同時作為錨點，點擊捲動到對應卡片，使摺線下的內容在首屏就被宣告存在

角色標籤放進既有卡片 header 的副標位置（`narrative.hjSub` 現有的位置），不新增列。

### 3-2 把解讀指引移到它該在的地方（解 E3）

「缺席的階段是有意義的敘事選擇」不該是標題下的灰字註腳。作法是**把它併進圖例**——
圖例已有三態（已識別／低信心／未識別），將這句話收進「未識別」那一項本身，
緊鄰它所描述的視覺符號。文字量不增反減（原句可縮到 8 字以內），
但出現在使用者實際產生疑問的位置。

### 3-3 視圖切換器加一行動態 caption（解 E4）

切換器下方一行隨選項變動的說明，講「這個視圖適合看什麼」（**每則 12 字內，共 4 則**）。

不用 tooltip：第一次使用的人不會去 hover 一個他還不知道有差別的東西。
另外評估把預設視圖從「水平軌跡」改為資訊密度較高的「章節對位帶」——
實測對位帶在真實資料下最能一眼看出階段與章節的對位關係。

### 3-4 信心給出視覺基準（解 E5）

`ConfidenceMeter` 加一道 0.6 門檻刻度線（`stageState` 現行的 filled/low 分界），
使 0.90 立刻可被判讀為「明顯高於門檻」。**零新增文字**。

### 3-5 術語就地連出方法論頁（解 E6）

「Campbell 12 階段」「Kernel / Satellite」做成可點的 term chip → `/methodology` 對應段落。
把解釋留在既有的方法論頁，本頁**零新增解釋文字**，只新增連結能力。

### 3-6 空狀態改為前置條件檢查表（解 E7）

現行「點擊下方按鈕開始分析」改為條件清單：**章節摘要**（`map_hero_journey` 的實際前置）
與**事件分析**（骨幹統計的前置）各一列，帶完成狀態。前置不足時按鈕 disabled，
並直接指向補齊的入口（建構概覽頁）。

這同時堵住 E7 的靜默死路：沒有章節摘要時，使用者在**點擊前**就看得到原因，
而不是點完之後面對一個「成功但什麼都沒發生」的任務。

### 落點分配

| 項目 | 併入階段 | 理由 |
|------|---------|------|
| 3-2 圖例、3-4 信心刻度、3-6 空狀態檢查表 | **Phase 1** | 與 1-1 補齊 12 階段同一批元件，一起改才不會做兩次 |
| 3-1 定位帶、3-3 caption、3-5 term chip | **Phase 3** | 屬版面重整，與骨幹軌道重設計同批處理 |

> Phase 1 的檔案清單因此增加 `atoms.tsx`（圖例與 ConfidenceMeter）與空狀態相關 i18n key，
> 已反映在下節表格。

---

## 四、Phase 1 — 救活死路徑

> 目標：讓已經寫好卻永不觸發的三處程式碼開始運作。零 LLM 成本，對既有資料立即生效。

### 1-1 補齊 12 階段（解 A2）

在 `heroJourney.ts` 新增 `padStages(stages)`：依 `STAGE_ORDER` 補出缺席階段
（`chapter_range: []`、`confidence: 0`、`notes: null`），`NarrativePage` 的 `stages`
useMemo 改用它。`stageState` 對空 range 已回傳 `'absent'`，四個 layout 的 absent 分支
現成，`mapped` 計數已用 `filter(!== 'absent')` 故仍正確顯示 11/12。

### 1-2 補算代表事件（解 A1）

在 `GET /narrative` 回傳前，用 `chapter_range ∩ kernel spine` 補上
`representative_event_ids`——**不改 `map_hero_journey`、不重跑 LLM**。

選在讀取時而非生成時補算的理由：既有快取的 stages 立刻受益，不必要求使用者 force 重跑。
與 `is_stale` 同屬「derived per request, never persisted」，模式一致。

排序**沿用 kernel-spine 端點既有的回傳順序**（章節遞增），每階段上限 4 筆
（避免 7 事件章塞爆面板）。

> ⚠️ 不可用 `narrative_position` 排序：該欄位從未被寫入
> （`API_CONTRACT.md:568` 已記載，實測 `名字的潮汐` 38 筆 kernel 事件全為 `null`）。

前端的 events map 與 `EventPill` 不需改動，自動活過來。

### 1-3 重新分析入口（解 B1）

`HeroJourneySection` header 加「重新分析」按鈕 → `triggerHeroJourney(bookId, lang, force=true)`；
stale banner 內同樣放一個。`heroJourneyOp` 由 `NarrativePage` 傳入。

### 1-4 可讀性三項（解 E3、E5、E7）

併入本階段的 3-2（圖例吸收解讀指引）、3-4（信心 0.6 門檻刻度）、3-6（空狀態前置條件檢查表）。
三項都落在與 1-1 同一批元件上，一起改才不會做兩次。

其中 3-6 需要章節摘要與事件分析的完成狀態：兩者皆可由既有的 `useBook`
與 `fetchEventAnalyses`（本頁已在呼叫，Phase 1 之後不再空轉）推得，**不需新增請求**。

### 異動檔案

| 檔案 | 動作 |
|------|------|
| `frontend/src/components/narrative/heroJourney.ts` | 修改 — 新增 `padStages` |
| `frontend/src/pages/NarrativePage.tsx` | 修改 — 套用 `padStages`、傳入 `heroJourneyOp`、stale banner 加按鈕、空狀態改檢查表 |
| `frontend/src/components/narrative/HeroJourneySection.tsx` | 修改 — header 加「重新分析」 |
| `frontend/src/components/narrative/atoms.tsx` | 修改 — 圖例吸收解讀指引、`ConfidenceMeter` 加門檻刻度 |
| `backend/storysphere/api/routers/narrative.py` | 修改 — `GET /narrative` 補算 representative events |
| `frontend/src/i18n/locales/{zh-TW,en}/analysis.json` | 修改 — `narrative.rerun`、空狀態前置條件等 key |
| `tests/api/test_narrative.py` | 修改／新增 — 補算邏輯的單元測試 |

> 共 7 個檔案，超過「一次異動 3 個檔案」的紅線 → 拆成三次確認：
> **1a** 前端邏輯（1-1 + 1-3，含 i18n）／ **1b** 可讀性三項（1-4，含 i18n）／
> **1c** 後端補算（1-2 + 測試）。

### Checkpoint 四問

1. **哪些檔案異動？** 見上表。
2. **有現成工具可用？** 有——`padStages` 餵的是既有 absent 分支；`EventPill` / events map 現成；
   `triggerHeroJourney` 的 `force` 參數現成；空狀態的前置狀態可由既有查詢推得。
   本階段不新增任何元件、不新增任何請求。
3. **新依賴或新結構？** 無。無新套件、無新 endpoint、無新 domain 欄位。
4. **改錯怎麼還原？** 純增量改動，三個 commit 各自可獨立 `git revert`。後端補算是回傳前的推導，
   不寫快取，還原後資料完全不受影響。

### 驗收

- 敘事結構頁顯示 12 個階段，第 9 階段以 `absent` 態呈現，圖例「未識別」名實相符
- 階段詳情面板出現「代表事件」pill（名字的潮汐各階段應有 1–4 筆）
- 有結果的書可見「重新分析」，點擊後進度條會動、完成後資料更新
- `GET /narrative` 回傳的 `representative_event_ids` 非空；重複呼叫結果穩定
- **可讀性**：解讀指引出現在圖例內而非標題註腳；信心量表可見 0.6 門檻；
  空狀態列出前置條件，缺章節摘要時按鈕 disabled 並指向補齊入口
- **可讀性反向驗收**：全頁新增的說明文字總量不超過移除的量（3-2 縮短的字數應抵銷 3-6 新增的標籤）

---

## 五、Phase 2 — 讓分類可操作

> 目標：把 `classify` / `refine` 接上 UI，並先堵住它的破壞性。

### ⚠️ 前置：classify 的資料破壞風險

`classify_from_eep` 逐一讀 `event:{doc}:{event_id}` 快取；**快取不存在時，直接把
`event.narrative_weight` 覆寫成 `"unclassified"` 並寫回 KG**（`narrative_service.py:188-190`）。

這正是兩本書現況的成因：大唐 59/62 未分類、名字的潮汐 9/47 未分類，都是 EEP 快取遺失後
被洗掉的結果。**在補上防護前，不得把 classify 按鈕接上 UI。**

防護作法：先掃一遍統計 EEP 命中數，命中率低於門檻時**中止並回報，完全不寫回 KG**。
門檻值需使用者決定（建議 0，即「一筆都沒命中就中止」，最保守且不影響正常情境）。
UI 端用既有 `ConfirmDialog`（`BuildOverviewPage` 已在用）做二次確認。

### 內容

- `classify` / `refine` 前端接線 + pre-flight 防護
- 未分類事件清單可見、可針對性 refine（`RefineNarrativeRequest.event_ids` 已支援）
- 核可時一併將 `classification_source` 推進 `human_verified`（解 B2）

### 待決策

| 項目 | 選項 |
|------|------|
| EEP 命中率門檻 | 0（一筆都沒命中才中止，保守）／ 依比例（如 <50% 即中止，較嚴） |
| refine 的預設範圍 | 全部 satellite（後端現行預設）／ 僅未分類事件 |

> 本階段涉及既有服務行為改變，實作前另出一份 checkpoint 逐項確認。

---

## 六、Phase 3 — 顯示重整

> 目標：讓兩種極端資料下都失效的骨幹軌道，變成真的能讀的東西。

- **C2 骨幹軌道重設計**：現行「每章一點 + 上下交錯標題」預設每章至多一個 kernel 事件，
  真實資料不成立。改為**章節密度帶**——每章一格，以深淺／高度表示 kernel 事件數，
  點選章節展開該章事件。移除 `COL_W` 交錯標題邏輯與其下的「同章多事件」重複區塊。
- **C1 比例條**：satellite 為 0 時收掉該段與其空隙；標題改為與實際語意相符的說法。
- **C3 章節範圍對齊**：兩區塊統一以 `book.chapterCount` 為軸，kernel 事件缺席的章節明確留白而非截斷。
- **C4 深連結**：事件 pill 與代表事件 pill 導向 `/books/:id/events?event=<id>`（端點現成）。

### 可讀性三項（解 E1、E2、E4、E6、E8）

併入本階段的 3-1（頁面定位帶與卡片序號）、3-3（視圖切換器 caption + 預設視圖改為章節對位帶）、
3-5（術語 chip 連出方法論頁）。這三項都是版面層級的調整，與骨幹軌道重設計動到同一批版面，
分開做會改兩次 `narrative.css`。

其中 3-1 的序號與角色標籤是本階段的**驗收核心**：完成後，第一次進入的使用者
應能不讀任何段落就答出「這頁有兩塊、先看哪塊、兩塊各在講什麼」。

異動集中在 `PlotSpine.tsx`、`HeroJourneySection.tsx`、`atoms.tsx`、`NarrativePage.tsx`、
`narrative.css` 與 i18n。無後端改動、無新 endpoint。
> 檔案數同樣超過 3 個 → 實作前拆為 **3a 骨幹軌道與比例條**（C1–C3）與
> **3b 版面定位與導覽**（C4 + 3-1／3-3／3-5）兩次確認。

---

## 七、Phase 4 — 新增功能

> 目標：補上敘事結構頁該有、但目前散落他處或缺席的兩塊。全部複用現有 API。

- **D1 Genette 時序摘要卡**：複用 `fetchTimeline(bookId)` 回傳的 `temporalStructure`、
  `temporalAnalyzed`、`temporalIsStale` 與 per-event `temporalDisplacement`，
  在本頁呈現「線性／部分線性／非線性」與 analepsis / prolepsis 計數，深連結回時間軸頁。
  **不新增端點**（`GET /narrative/temporal` 不存在，也不需要新增）。
- **D2 張力 × 階段疊圖**：複用 `fetchTEUs(bookId)`（`TEUDetail` 帶 `chapter` + `intensity`），
  以 chapter 對位到各階段 `chapter_range`，把張力曲線疊在英雄旅程軌跡下方。
  **不新增端點。**

---

## 八、文件同步確認

- **`docs/API_CONTRACT.md`**：Phase 1 的 `representative_event_ids` 補算不改變
  `#21k GET /narrative` 的 response schema（欄位早已存在於 `HeroJourneyStage`），
  但**需補一段行為說明**：該欄位為讀取時推導、不落地，與 `is_stale` 同類。
  Phase 2 若加入 pre-flight 中止行為，需更新 `#21a POST /narrative/classify` 的失敗語意。
  Phase 3、4 無 API 異動。
- **`docs/UI_SPEC.md`**：Phase 3 的骨幹軌道重設計、頁面定位帶與卡片序號慣例、
  Phase 4 的兩張新卡片需登錄元件規格。頁面定位帶若可能被其他分析頁沿用，
  應登錄為通用元件而非本頁專用。
- **`docs/DESIGN_TOKENS.md`**：目前規劃不新增 token；若 Phase 3 密度帶需要新的階層色，屆時同步。

---

## 九、不做的事

- 不順手整理 `narrative/` 目錄下與本次無關的程式碼
- 不刪除 `propp_functions`（後端 B-034 精煉會寫入，屬 Phase 2 範圍外的既有能力）
- 不改動時間軸頁的時序分析實作；Phase 4 只讀取它的結果
- 不在本頁提供編輯敘事內容的能力（維持檢視器定位）

---

## 十、設計稿核對與定案（2026-08-12）

Claude Design 交付 canvas 後逐項核對的結果與決議。**實作以 canvas 為準**；本節列出
所有「canvas 沒說」或「刻意偏離 canvas」之處，實作時需在 commit message 標明。

### 10.1 核對結論：無須退回設計修改

七項疑慮重新歸類後，沒有一項必須由 Claude Design 修改：

| # | 原疑慮 | 結論 |
|---|--------|------|
| 1 | 沒有啟動分析入口 | **實作判斷**。按鈕元素／樣式／文案設計都給了，`disabled` 依前置條件條件渲染即可 |
| 2 | 缺「前置齊備但未執行」狀態 | **實作判斷**。設計的 blocked 態針對全新書（無摘要）是正確的；有無摘要由實作自行判定 |
| 3 | 欄位對應表 5 處與 API 不符 | **實作對齊**，見 10.3 |
| 4 | 信心文案會顯示「本書有 0 個」 | **實作補分支**，見 10.4 |
| 5 | 示範數值與 payload 不符 | **撤回**。示範資料本就僅供結構參考（見交付包 README），以數值比對是誤用 |
| 6 | README 與 canvas 不一致 | **已定案**，見 10.2 |
| 7 | 大書章節軸放不下 | **自行解決**，見 10.5 |

### 10.2 三項定案

1. **索引卡文案採 canvas 版**：`① 詮釋 · 英雄旅程` / `② 統計 · 事件骨幹` /
   `③ 旁證 · 其他結構線索`。README 的問句版（「走了哪幾步」…）不採用。
   同理，書級 meta 採 canvas 的 `… · LLM 分類`，不採 README 的「分析於 <日期>」。
2. **重新分析控制項**：卡片 header 加一顆次要按鈕（與核可／標記不適用同組），
   過期橫幅右側加「重新分析 →」連結。**不做 token 成本確認對話框**
   （設計的未決事項就此關閉）。
3. **Phase 2 維持原計畫**，不依設計縮編為唯讀 —— 見 10.6。

> **§3-1「頁面定位帶」由 canvas 的索引卡取代。** 本計畫 §3-1 是在看到設計前的草案，
> canvas 用三張帶編號與角色標籤的索引卡達成同一個目的（宣告區塊、建立閱讀順序、
> 讓摺線下的內容在首屏被看見），且更完整。§3-3 的切換器 caption 與 §3-5 的
> 方法論連結 canvas 也都有（`views` 各帶一句說明、`methodLink`），照 canvas 實作即可。
>
> **Phase 1 是 canvas 的前置條件，不是它的替代品。** canvas 假設 12 列恆存、
> 代表事件有值、信心條有 0.6 刻度、空狀態是前置條件清單 —— 這四項正是 Phase 1 的內容。
> 先把資料形狀補成 canvas 假設的樣子，Phase 3 再照 canvas 重畫版面。

### 10.3 欄位對齊（設計文件寫法 → 實際 API）

設計的規格文件用了一組與實際 API 不同的欄位名，實作一律以右欄為準：

| 規格文件 | 實際 |
|---|---|
| `stage.stage_number` | 無此欄位；用 `stage_id` 經既有 `stageOrdinal()` 推序號 |
| `stage.chapter_start / _end` | `chapter_range: list[int]`，取首尾 |
| `book.chapter_count` | `book.chapterCount`（camelCase） |
| `event.classification` | `narrative_weight`；分類清單在 `kernel/satellite/unclassified_event_ids` |
| `analysis.created_at` | **不存在**。過期一律走既有的 `is_stale` / `stale_reason` |

> `analysis.created_at` 是設計提出的前端時間戳比對方案，該欄位在 domain model 裡
> 從未存在。後端 `GET /narrative` 已 per-request 算好 `is_stale` + `stale_reason`，
> 比設計的方案更可靠且零額外請求。canvas 本身也沒用到這個欄位。

### 10.4 偏離 canvas 之處（實作需註記）

| # | 偏離 | 原因 |
|---|------|------|
| 1 | 空狀態按鈕依前置條件三態渲染（摘要缺=停用／摘要齊=可按／已跑=改顯示重新分析） | canvas 只有停用態；三態是真實資料形狀 |
| 2 | 新增 header「重新分析」按鈕與橫幅連結 | canvas 無此元件（設計未決） |
| 3 | 信心說明在 `below === 0` 時改寫文案 | canvas 無條件串接計數，真實資料下恆為「本書有 0 個」 |
| 4 | 過期判定改用 `is_stale` / `stale_reason` | 見 10.3 |
| 5 | 對位帶帶內章號標籤加寬度守衛 | 見 10.5 |
| 6 | **未分類事件區塊保留分類動作** | 見 10.6，與 canvas 的唯讀決定直接衝突 |

另：旁證區塊那段「必須指出一個三層對齊、一個只有一層的章節」的解讀文字**必須即時計算**，
不可把 canvas 裡的示範句抄成靜態文案 —— 真實峰值章節與示範不同。

### 10.5 大書的章節軸（設計未涵蓋）

設計訂「章節軸永遠等於全書章數，不橫捲、不截斷」。實際可用寬度約
`1236 − 340（詳情面板）− 186（標籤欄） ≈ 684px`，即**每章約 684 / N px**：
10 章 68px 舒適、30 章 23px 已塞不下帶內的「3–4」、50 章以上只剩色帶。

作法：**保留設計原則，只讓帶內文字退場**。色帶幾何本就是比例式（`left`/`width`
皆為分數）天生會縮；帶內章號標籤加寬度守衛（帶寬低於約 34px 即不渲染，
章節範圍在詳情面板仍看得到），軸頭章號在每欄低於約 18px 時改為每 5 或 10 章標一次。

> **守衛條件用實際算出的寬度，不用章數。** 目前僅有 7 章與 10 章兩本測試書，
> 推不出真實章數分布，以章數寫死門檻等於猜測。

### 10.6 Phase 2 維持原計畫（與設計衝突，已確認）

設計明確主張「本頁不提供任何分類動作」，未分類事件只做三欄狀態告知 + 深連結，
理由是分類判斷需要原文段落，那在事件分析頁。**經確認後仍維持原計畫**，
把 classify / refine 接上本頁。

因此 Phase 2 需要額外承擔兩件設計沒有處理的事：

1. **未分類區塊要重新設計互動**。canvas 那塊是唯讀的狀態告知（含「狀態告知 ·
   此頁不進行分類」徽章），加上動作後該徽章與三欄文案都不再成立，需自行調整。
2. **EEP 命中率 pre-flight 防護為必要前置**（原 Phase 2 前置段落已述）。
   門檻未另行指定時，實作採**命中數為 0 才中止**——最保守、不影響任何正常情境。

> 這是全案唯一主動偏離 canvas 的功能決定，Phase 2 的 commit message 需明確標注。

---

## 十一、實作順序（2026-08-12 定案）

**1 → 3 → 2 → 4**，共 4 個 phase、7 次確認。

| 順位 | Phase | 子拆 | 備註 |
|---|---|---|---|
| 1 | **Phase 1** 救活死路徑 | 1a 前端邏輯／1b 可讀性／1c 後端補算 | **Phase 3 的前置**：canvas 假設 12 列恆存、代表事件有值、信心條有 0.6 刻度、空狀態是前置條件清單，這四項都在此階段 |
| 2 | **Phase 3** 顯示重整 | 3a／3b／3c，見下方重拆表（2026-08-12 定案） | 份量比原規劃大：甘特對位帶、sticky 詳情面板、三層旁證軸、索引卡都在內 |
| 3 | **Phase 2** 讓分類可操作 | 未拆，需另出 checkpoint | 全案唯一偏離 canvas 者（見 10.6）；有資料破壞風險且需自行補設計，故排在版面穩定後 |
| 4 | **Phase 4** 新增功能 | 未拆 | Genette 時序卡、張力 × 階段疊圖 |

> 原順序為 1→2→3→4，是設計稿到達前所排。改序的理由：Phase 3 直接兌現設計稿、
> 使用者立刻看得到；Phase 2 需要自己補設計且動到既有服務行為，適合單獨處理。

### Phase 3 重拆（2026-08-12，Phase 1 完成後定案）

| 子拆 | 內容 | 主要檔案 |
|---|---|---|
| **3a** | 三張索引卡（① 詮釋／② 統計／③ 旁證）、視圖切換器加 hint、預設視圖改章節對位帶、方法論連結 | `NarrativePage.tsx`、`HeroJourneySection.tsx`、`narrative.css`、i18n |
| **3b** | 對位帶重畫（甘特帶 + 帶內標籤寬度守衛，見 10.5）、密度列、比例條 satellite=0 收合（C1）、章節軸統一（C3） | `layouts.tsx`、`PlotSpine.tsx`、`narrative.css` |
| **3c** | sticky 詳情面板、信心說明（含 `below === 0` 分支，見 10.4-3）、代表事件深連結 `?event=<id>`（C4） | `StageDetail.tsx`、`atoms.tsx` |

**與 Phase 4 的邊界**：canvas 的第三張索引卡「旁證 · 其他結構線索」裝的是 Genette
時序與張力疊圖，屬本計畫的 Phase 4。**3a 只做這張卡的外殼與「未分析」預設態**
（canvas 本就以未分析為預設外觀），真正讀 `fetchTimeline` / `fetchTEUs` 留在 Phase 4。
版面一次到位，資料接線各自獨立。

**Phase 1 完成後的一項偏差記錄**：§四「新增文字總量不超過移除的量」在結果視圖成立
（−20 +16），但空狀態淨增約 80 字——前置條件檢查表本身即為文字，E7 要的「點擊前
就知道會失敗」沒有無文字的表達方式。判定為應收的成本。

---

---

## 十二、實作完成紀錄（2026-08-12）

13 個 commit，46 檔、+12334/−530（其中 9116 行為本文件與交付包）。
**實作與計畫不同之處全在這一節；其餘照 §十、§十一執行。**

### 12.1 各 Phase 落點

| Phase | commit | 內容 |
|---|---|---|
| 1a | `410456a` | `padStages` 補齊 12 階段、重跑入口（header + 過期橫幅） |
| 1b | `17ad4e8` | 圖例吸收解讀指引、信心 0.6 刻度、空狀態前置條件檢查表 |
| 1c | `ddbcdca` | 後端補算 `representative_event_ids` + 14 測試 + API Contract |
| 3a | `952bfad` | 頁首、索引卡、視圖切換器 hint、預設改對位帶、方法論連結 |
| 3b | `894bbb7` `1fa03ff` | 對位帶重畫（共用／逆序／密度列／寬度守衛）、骨幹改逐章列事件 |
| 3c | `9a4aa5d` `951011e` | 詳情面板內容重寫、改為 sticky 側欄 |
| 2a | `d91da82` | classify 破壞性守衛（409 + service 層）+ 7 測試 |
| 2b | `c100a45` | 未分類區塊接上 classify／refine + ConfirmDialog |
| 2c | `501a0a6` | 核可推進 `classification_source` 為 `human_verified` + 5 測試 |
| 4 | `ea922d8` | ③ 旁證卡：三層章節軸 + 時序 + 張力 |

### 12.2 與計畫不符之處

| # | 計畫怎麼寫 | 實際怎麼做 | 為什麼 |
|---|---|---|---|
| 1 | §1-4：章節摘要完成度由 `useBook` 推得，不需新增請求 | 改讀 `GET /books/{id}/chapters` 的 `summary` 欄位，僅在無分析結果時啟用 | `BookDetailResponse` 只有 `pipelineStatus.summarization` 這個粗狀態，算不出「缺 4 章」 |
| 2 | §六：3a 做 ③ 卡的外殼與未分析態 | ③ 卡與其區塊一起延到 Phase 4 | 目錄項先於它指向的內容存在就是死連結；區塊本身需要 Phase 4 的資料 |
| 3 | §3-5：「Kernel / Satellite」做成 term chip 連出方法論頁 | 只有英雄旅程副標連出，事件骨幹副標維持純文字 | `frameworksData` 沒有 Chatman kernel/satellite 條目，連到方法論總覽反而誤導 |
| 4 | §五：EEP 命中率門檻 0（一筆都沒命中就中止） | 收緊為「命中 0 **且** 目前至少有一個事件是 kernel/satellite」 | 全新書全是 unclassified，拿 unclassified 覆寫 unclassified 沒有損失，擋下來只會擋住正常的第一次執行 |
| 5 | canvas 在覆蓋率旁印「需 ≥60%」 | 前端只顯示實際百分比，足夠與否取後端 `coverage_sufficient` | `_TEMPORAL_COVERAGE_THRESHOLD` 是後端常數，前端複寫會漂移 |
| 6 | §四驗收：新增文字量不超過移除量 | **未達成**。結果視圖 −20 +16，空狀態淨增約 80 字 | 前置條件檢查表本身即為文字；E7 要的「點擊前就知道會失敗」沒有無文字的表達方式 |
| 7 | （未預期） | `useTensionTask` 改為 `ApiError` 時採用 `detail` | 2a 把數字放進 409，通用文案會把它整個丟掉。張力頁等呼叫端一併受益 |
| 8 | （未預期） | UI_SPEC 原「過期橫條只做提示，不放操作按鈕」被推翻 | 觸發鈕只存在於空狀態，有結果時橫條等於報警不給滅火器。規格已改寫並註明理由 |

### 12.3 一項先前判斷的更正

實作 2a 時曾判定「classify 的破壞不需要按鈕、進頁就會發生」，據此把守衛放進
service 層。**該判斷有誤**：`get_kernel_spine` 與 `refine_with_llm` 的自動 classify
條件是**全書事件皆為未分類**，此時已無分類可損失。守衛放 service 層仍屬正確的
縱深防禦，但理由不是「進頁會被洗掉」。

實測結果：`名字的潮汐` 47 個事件的 EEP 快取全數遺失，跑 classify 會抹掉 38 個
kernel，端點正確回 409；`大唐雙龍傳` 尚存 12 筆 EEP 快取，正確放行。

### 12.4 驗證過程對真實資料的異動

| 書 | 異動 | 處置 |
|---|---|---|
| `大唐雙龍傳_冊1` | 分類 `3 kernel / 0 satellite / 59 未分類` → `9 / 3 / 50` | **保留**（使用者確認）。依殘存 EEP 快取重算，不耗 LLM，比舊值準確 |
| `名字的潮汐` | `review_status` `pending` → `approved` → `rejected` | **已還原為 `pending`**。#21l 不接受 `pending`，直接改回快取欄位；`classification_source` 由程式自行還原 |

### 12.5 幾條不會出現在 UI_SPEC、但改動時要知道的事

- **對位帶的寬度守衛一律用 `ResizeObserver` 量出的實際寬度，不得改用章數門檻。**
  書庫只有 7 章與 10 章兩本，以章數寫死等於猜測。
- **旁證區塊的判讀句、代表事件的三種說明、`crossNote` 全部即時計算**，不得沿用
  canvas 的示範句——設計稿寫第 9 章，實測峰值在第 7 章。
- **`padStages` 回傳恆為 12 列**，不能再用 `stages.length` 判斷分析是否存在；
  `hasHeroJourney` 讀後端原始的 `hero_journey_stages`。
- **refine 必須傳明確的 `event_ids`。** 後端 `event_ids=null` 的預設是「精煉全部
  satellite」，而書庫沒有任何一本有 satellite 事件，該預設是 no-op。
