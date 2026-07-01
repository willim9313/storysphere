# 張力分析頁重新設計 — Design Handoff

**日期**：2026-05-25
**範疇**：`/books/:bookId/tension`（`TensionPage` 及其底下 `TensionTrajectoryChart` / `TensionLineCard` / `TensionThemePanel` / `StepButton` / `useTensionTask`）
**設計系統**：沿用既有 Token 系統；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）
**設計參考**：無設計稿；請根據設計系統自行規劃,並參考 `EventAnalysisPage` / `CharacterAnalysisPage` / `TimelinePage`（已完成重設計）的視覺語言與元件慣例維持一致性

---

## 1. 重新設計動機

- **主要痛點：頁面骨架還停在「能用」階段,視覺與資訊層次都不到位**。
  - 整頁是「800px 單欄置中 + 從上往下 5 個 section 直線堆」,沒有任何主從關係:三步驟工作流、軌跡圖、審核列表、主題面板各自為政
  - StepButton 三個橫排是純列表式,看不出「TEU → TensionLine → TensionTheme」這個層層聚合的領域語意(實際上是 scene-level → cross-scene → book-level 三層抽象)
  - 軌跡圖(SVG)用 hardcode `rgb()` 算漸層,色碼脫離 token;資訊密度低(每條線一條橫條,看不到 TEU 落點、章節密度)
  - TensionLineCard accordion 展開後**沒有顯示任何 evidence、TEU 內容、carrier 角色** — 使用者要審核「這條張力線是否成立」卻看不到證據,只能盲審 PoleA / PoleB 命名
  - TensionThemePanel 跟卡片同款外觀,沒有「整本書最終命題」的視覺份量;Frye / Booker badge 直接用 hardcode `#fef9c3` / `#ede9fe`,跟主題系統脫節
- **次要觀察**:
  - 三步驟卡片彼此狀態(pending / running / done / error / disabled)的視覺差只有「綠邊 + ✓」,沒有強引導告訴使用者「現在該按哪個」
  - 步驟 3 (Synthesize) 在步驟 2 未完成時 disabled,但 UI 上沒有任何提示「為什麼不能按」
  - 審核狀態 badge (`pending / approved / modified / rejected`) 顏色語意一致,但散在 5 個位置(卡片邊框 / 卡片右上 / 主題面板邊框 / 主題面板右上 / Step button),沒有 dashboard 級彙總
  - 重新整理按鈕只有「重新整理列表」,沒辦法在不重跑整個 pipeline 的前提下重新觸發單一步驟
- **主要使用者情境**:
  - 第一次進頁面:能在 3 秒內理解「這頁是分析整本書的核心對立衝突」,並知道接下來要做 3 件事
  - 已生成資料:能快速掃完 N 條張力線、判斷哪些值得 approve、哪些要 reject;最後一眼看到合成的主題命題
- **成功指標**:頁面有清楚的視覺重心與層次;陌生使用者不需指引也能理解三步驟的關係;審核卡片提供足夠證據讓使用者敢按 approve / reject

---

## 2. 範疇(hard scope)

### 包含
- 主畫面 `TensionPage`(單欄 maxWidth 800px → **可改版面骨架**)
- Header(頁面標題 + 書名)
- 三步驟工作流(StepButton × 3:Analyze TEU / Group Lines / Synthesize Theme)
- TensionLine 軌跡圖(`TensionTrajectoryChart`,SVG 橫條圖)
- TensionLine 審核列表(`TensionLineCard`,accordion + 三按鈕)
- TensionTheme 面板(`TensionThemePanel`,可編輯命題 + Frye/Booker badge + 三按鈕)
- 各種狀態:loading / 三步驟 running(stage + progress)/ 三步驟 error / 無 lines / 有 lines 無 theme / 完整資料

### 不包含(保留現狀)
- 後端 API 形狀(`TensionLine` / `TensionTheme` / `TaskStatus` 不動,僅外觀與排版可改)
- 路由與資料載入策略(`useQuery` keys `['books', bookId, 'tension', 'lines'|'theme']` 不動)
- Task polling 機制(三個專用 endpoint #14b / #14d / #14h,`useTaskPolling`、`useTensionTask` 流程不動)
- 三步驟的觸發順序與依賴(Step 3 需 Step 2 已完成)
- 審核狀態值域(`pending / approved / modified / rejected`)及其語意對應
- ChatContext 整合(`setPageContext({ page: 'analysis', bookId, bookTitle })`)

---

## 3. 現況快照(必讀,避免憑空設計)

### 3.1 資訊架構

```
[單欄置中 maxWidth: 800px,padding: 24px 20px]
  ├─ Header  ⚡ 張力分析  — 書名(右側 muted)
  │
  ├─ 三步驟工作流 (flex-col gap-2)
  │   ├─ StepButton 1: ⚡ 分析 TEU
  │   │     desc: 完成→「組裝 N 個 TEU,找出 M 個候選」
  │   │             running→「stage(progress%)」
  │   │             idle→預設說明
  │   ├─ StepButton 2: ⎇ 聚合 TensionLine
  │   ├─ StepButton 3: ✨ 合成 TensionTheme  (disabled until step 2 done)
  │   └─ 每步驟下方:error 訊息 (⚠ 紅色 inline)
  │
  ├─ 若 hasLines:
  │   ├─ 軌跡圖 card (border + bg-secondary)
  │   │     ⎇ TensionLine 軌跡  — 「強度提示」(右側 muted)
  │   │     SVG: 560px wide,每條線一列 36px row
  │   │       X: 章節序號 (虛線 grid)
  │   │       橫條: chapter_range 跨度,fill = intensityColor(intensity_summary)
  │   │       label: 「PoleA vs PoleB」(160px label column,左側)
  │   │       intensity % 文字(橫條中央,寬>30px 才顯示)
  │   │       rejected: opacity 0.4 + 退灰
  │   │
  │   └─ 審核列表
  │       ├─ Header: 「審核 N 條張力線」+ 重新整理按鈕
  │       └─ TensionLineCard × N (accordion)
  │             collapsed: ▸ PoleA vs PoleB | N TEU · ch1–chN · M% | status badge
  │             expanded:  ▾ ... + [✓ Approve] [✎ Modify] [✕ Reject] 或 inline 編輯
  │
  └─ 若 hasTheme:
      └─ TensionThemePanel (border 1.5px,padding 16/20)
          ✨ TensionTheme  — status badge(右上)
          命題文字(serif?,實際是 inherit)
          Frye Mythos badge | Booker Plot badge
          [✓ Approve] [✎ Modify proposition] [✕ Reject]
```

### 3.2 三步驟詳細狀態

| 步驟 | 觸發 API | Polling | result payload(寫回 UI) |
|------|---------|---------|------------------------|
| Step 1 Analyze TEU | `POST /tension/analyze` | `GET /tension/analyze/:taskId` | `{ assembled: number, candidates: number }`(寫到 `analyzeResult`,目前不持久化 — refresh 後 hasTeus 改靠 `lines.length > 0` 推斷) |
| Step 2 Group Lines | `POST /tension/lines/group` | `GET /tension/lines/group/:taskId` | `{ lines: TensionLine[] }`(完成後 `refetchLines()` 重抓 `GET /tension/lines`) |
| Step 3 Synthesize Theme | `POST /tension/theme/synthesize` | `GET /tension/theme/synthesize/:taskId` | `TensionTheme`(完成後 `refetchTheme()` 重抓 `GET /tension/theme`) |

**progress 訊息(來自後端 `task_store.set_progress`)**:
- Step 1: `"組裝 TEU {done}/{total}"`(0–100%)
- Step 2: `"grouping"`(0–100%,目前只有單一 stage 字串)
- Step 3: 三段:`"loading tension lines"`(15) → `"calling LLM for theme synthesis"`(25) → `"saving theme result"`(90)

### 3.3 `TensionLineCard` 結構

**collapsed**(header,可點開):
```
▸  PoleA vs PoleB         N TEU · chA–chB · M%        [status badge]
```
- chevron(展開 ▾ / 收合 ▸)
- 「PoleA」serif-ish bold,「 vs 」 muted,「PoleB」serif-ish bold
- 右側 meta:TEU 數 / chapter 範圍 / intensity %
- 最右:狀態 badge,顏色 `STATUS_COLORS[review_status]`(pending 灰 / approved 綠 / modified 藍 / rejected 紅)

**expanded body**(目前):
- 預設:三個按鈕橫排
  - ✓ Approve(綠 bg/fg)
  - ✎ Modify(藍 bg/fg) → 進入 inline 編輯
  - ✕ Reject(紅 bg/fg)
- 編輯模式:兩個 input(PoleA / PoleB)+ Save / Cancel

**目前最大盲點:展開後完全沒有顯示任何 evidence、TEU 描述、相關 carrier 角色、原始 quote**。使用者只能盲審名稱。

### 3.4 `TensionTrajectoryChart`(SVG)

- 寬度固定 560px,`overflowX: 'auto'`
- 行高 36px(`ROW_H`),padding 12px,label 欄 160px(`LABEL_W`)
- X 軸:章節序號,等距,虛線 grid(`stroke-dasharray: 3 3`)
- 每條線:
  - rect 從 `chToX(ch1)` 到 `chToX(ch2)`(若同章 → 至少 16px 寬)
  - fill = `intensityColor(intensity_summary)` — **硬編碼 RGB 漸層 `(239, 246, 255) → (234, 57, 14)`(冷藍 → 暖橘紅)**
  - stroke:`var(--accent)`(rejected → `var(--fg-muted)`)
  - 中央文字:intensity %(若寬度 > 30px)
  - 上方小字:`ch1` / `ch2`(`var(--fg-muted)`)
- rejected:`g.opacity = 0.4`,fill 改 `var(--bg-tertiary)`

### 3.5 `TensionThemePanel`

- 1.5px border,padding 16px 20px,radius 10
- 顏色依 `review_status`
- ✨ Sparkles icon + 「張力主題」標題 + 右上 status badge
- 命題:`<p>` 或 `<textarea>` (rows=3) 切換
- Frye Mythos / Booker Plot 各一個 badge:
  - **Frye** badge: `background: var(--entity-org-bg); color: var(--entity-org-fg)`(借用 entity org 配色)
  - **Booker** badge: `background: var(--entity-con-bg); color: var(--entity-con-fg)`(借用 entity con 配色)
  - 兩者 label 上方有 muted 小字「Frye Mythos」/「Booker Plot」
- 按鈕區同 LineCard

### 3.6 主要互動流程

```
進入頁面:
  → useQuery 拉 GET /tension/lines、GET /tension/theme (parallel)
  → linesLoading → LoadingSpinner;themeLoading → LoadingSpinner
  → 若 lines.length === 0 → 顯示 empty state (⚡ icon + 兩行提示)
  → 若 theme 不存在 → 不渲染 theme panel(不顯示「尚未合成」提示)

點 Step 1 / 2 / 3:
  → trigger API → setTaskId → useTaskPolling 輪詢專用 endpoint
  → 按鈕變 spinner + desc 顯示 stage / progress
  → done:
       Step 1 → 寫 analyzeResult 物件(assembled / candidates)
       Step 2 → refetchLines()
       Step 3 → refetchTheme()
  → error: setError → 按鈕下方 inline ⚠ 紅字

點 TensionLineCard 標題列:
  → toggle expanded
  → 展開後可按 Approve / Modify / Reject
  → Modify → inline edit PoleA/PoleB → 送出 PATCH → invalidate lines query

點 TensionThemePanel 按鈕:
  → 同上,但 Modify 是改 proposition,PATCH /theme/:id/review
```

### 3.7 狀態機

| 狀態判定條件 | 顯示內容 |
|------------|---------|
| `linesLoading` | LoadingSpinner(列表區) |
| `themeLoading` | LoadingSpinner(主題區) |
| `lines.length === 0 && !analyzeResult` | empty state(置中,⚡ icon) |
| `analyzeOp.running` | Step 1 button 變 spinner + stage/progress;其他 step 可按 |
| `groupOp.running` | Step 2 button 變 spinner |
| `synthesizeOp.running` | Step 3 button 變 spinner |
| `analyzeOp.error` / `groupOp.error` / `synthesizeOp.error` | 對應 step 下方 inline ⚠ |
| `hasTeus && !hasLines` | Step 1 顯示 done(✓ 綠),Step 2 idle 可按 |
| `hasLines && !hasTheme` | Step 1/2 done,Step 3 可按;軌跡圖 + 列表顯示;無 theme panel |
| `hasLines && hasTheme` | 全部 done,完整資料 |

### 3.8 與其他頁面的整合

- `ChatContext.setPageContext({ page: 'analysis', bookId, bookTitle: book.title })`:**注意**這頁 page key 是 `'analysis'`(跟 EventAnalysisPage 共用),不是 `'tension'`;重設計時不要改
- 沒有跨頁跳轉(沒有「去看 KG」「去看時間軸」之類按鈕)
- 沒有 entity 選中同步(這頁的 chat context 沒有 `selectedEntity`)

---

## 4. 資料 / API 參考

### 主要型別

**目前 `TensionLine` / `TensionTheme` 是手寫在 [`frontend/src/api/types.ts`](../../frontend/src/api/types.ts) L327–L370,不在 `generated.ts` 裡**。原因是 router 用 `dict` / `list` 回傳沒指定 `response_model`,OpenAPI 沒抓到 schema。

**欄位命名:snake_case(domain/ model,無 `alias_generator=to_camel`)**:

```ts
interface TensionLine {
  id: string;
  document_id: string;
  teu_ids: string[];               // 構成此線的 TEU ID 列表
  canonical_pole_a: string;        // 規範化的 Pole A 名稱
  canonical_pole_b: string;
  intensity_summary: number;       // 0–1
  chapter_range: number[];         // [firstChapter, ..., lastChapter](array 不只 2 個元素)
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}

interface TensionTheme {
  id: string;
  document_id: string;
  tension_line_ids: string[];
  proposition: string;             // 全書核心對立命題,一句話
  frye_mythos?: 'romance' | 'tragedy' | 'comedy' | 'irony' | null;
  booker_plot?: string | null;     // Booker 七大基本情節(overcoming_monster / rags_to_riches / quest / voyage_and_return / comedy / tragedy / rebirth)
  assembled_by: string;
  assembled_at: string;            // ISO timestamp
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}

interface TaskStatus {             // 共用,定義在 api/schemas/common.py(camelCase)
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress?: number;               // 0–100
  stage?: string;                  // 中文/英文混雜,後端寫死,見 §3.2
  result?: unknown;
  error?: string;
}
```

### 相關 endpoints(完整定義見 `docs/API_CONTRACT.md` #14a–#14j)

| # | Method + Path | 用途 |
|---|---------------|------|
| #14a | `POST /tension/analyze` | Step 1 觸發 |
| #14b | `GET /tension/analyze/:taskId` | Step 1 polling |
| #14c | `POST /tension/lines/group` | Step 2 觸發 |
| #14d | `GET /tension/lines/group/:taskId` | Step 2 polling |
| #14e | `GET /tension/lines?book_id=X` | 列表 |
| #14f | `PATCH /tension/lines/:lineId/review` | 審核 |
| #14g | `POST /tension/theme/synthesize` | Step 3 觸發 |
| #14h | `GET /tension/theme/synthesize/:taskId` | Step 3 polling |
| #14i | `GET /tension/theme?book_id=X` | 主題(無時 404) |
| #14j | `PATCH /tension/theme/:themeId/review` | 審核 |

> 注意:張力分析三步驟有**各自獨立**的 polling endpoint,不走共用的 #8 `/tasks/:taskId/status`。

### 領域術語(完整見 `docs/domain-glossary.md`)

- **TEU(Tension Evidence Unit)**— scene-level 最小單位,描述單一 Event 內的對立。**目前 UI 不顯示個別 TEU**,只在 LineCard header 顯示 `N TEU` 統計
- **TensionLine**— cross-scene 跨章節持續存在的對立軸;由多個 TEU 聚合
- **TensionTheme**— book-level 全書核心對立命題;由所有 approved/modified TensionLine 合成
- **Frye Mythos**— Northrop Frye 四大神話模式(romance 浪漫 / tragedy 悲劇 / comedy 喜劇 / irony 諷刺)
- **Booker Plot**— Christopher Booker 七大基本情節(overcoming_monster 戰勝怪獸 / rags_to_riches 麻雀變鳳凰 / quest 探尋 / voyage_and_return 遠行與歸返 / comedy 喜劇 / tragedy 悲劇 / rebirth 重生)

---

## 5. 必要保留(hard constraint)

- **資料形狀**:API response schema 不動(重設計 = 視覺與排版,非後端)
- **三步驟 + 工作流順序**:Analyze → Group → Synthesize 三個 trigger 不可裁,Step 3 依賴 Step 2 完成
- **審核狀態值域**:`pending / approved / modified / rejected` 四值不可改,各自對應一組顏色語意(中性 / 成功綠 / 資訊藍 / 錯誤紅)
- **Task polling 流程**:三個專用 endpoint 不走共用 polling;`useTensionTask` 對 `task.status === 'done' | 'error'` 的處理流程不動
- **Token 制度**:禁止硬編碼色碼;色碼一律用 `var(--*)`;新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`
- **TypeScript 型別來源**:理想上一律從 `frontend/src/api/generated.ts` 取;**目前 TensionLine / TensionTheme 例外**(見 §7 技術債),重設計時不要新增手寫型別,而是評估是否在 router 加 `response_model=` 把它修進 generated.ts
- **i18n**:所有文案必須走 `useTranslation('analysis')`,namespace 為 `analysis`,key 前綴為 `tension.*`,不可硬寫中文/英文;新增 key 必須 zh-TW + en 同步
- **ChatContext 整合**:`setPageContext({ page: 'analysis', bookId, bookTitle })` 不變
- **欄位命名陷阱**:取值時用 snake_case(`canonical_pole_a`、`tension_line_ids`、`frye_mythos`、`chapter_range`...),非 camelCase

---

## 6. 可變更的設計面向

- **整頁版面骨架**:目前是「800px 單欄,5 個 section 直上直下」。可改:
  - 上方 hero 區呈現「TensionTheme 一句話 + Frye/Booker badge」當頁面 anchor(讓使用者一進來就看到結論,反向引導去審 lines)
  - 左側 sticky 工作流 stepper / 右側內容區的兩欄排版
  - 軌跡圖升級成全寬 dashboard 視覺(目前 560px 太擠)
- **三步驟工作流**:
  - 改為 vertical stepper 視覺,顯示三層聚合的領域語意(TEU scene-level → TensionLine cross-scene → TensionTheme book-level)
  - Step 3 disabled 時提供 hover/inline 提示「先完成步驟 2」
  - 把 Step 1 的「組裝 N 個 TEU,找出 M 個候選」結果視覺化(例如小型 sparkline / counter card)
  - 加「重跑此步驟」按鈕(`force: true`)
- **軌跡圖** (`TensionTrajectoryChart`):
  - 加章節密度視覺(每章 TEU 數 histogram,或 marginal)
  - 橫條 hover 顯示該 line 的 TEU 細節 tooltip
  - 高強度區段(intensity > 0.7)加 marker / glow
  - 漸層配色換成 token 化的 `--tension-intensity-low/mid/high`
- **TensionLineCard**:
  - **展開後增加 evidence 顯示**:該 line 包含的 TEU 列表(章節、tension_description、最關鍵 evidence quote),讓審核者看到證據再決定 approve/reject
  - 顯示 PoleA / PoleB 各自的 carrier(角色)
  - 顯示 thematic_note(若有)
  - 改 card-grid layout(支援橫向 scroll 或 2 欄)
  - 強度視覺化(條 / 點 / 漸層帶,而非只有 % 文字)
- **TensionThemePanel**:
  - 提升成 hero card(serif 大字命題、Frye/Booker 雙 badge 視覺化)
  - 顯示「合成自 N 條張力線」(連結回審核列表)
  - Frye / Booker 不用借用 entity-org / entity-con 配色,而是新增 `--frye-*` / `--booker-*` 專屬 token(四種 frye / 七種 booker)
  - 加 thematic visualisation(例如 Frye 四大模式的方位圖、Booker 七情節的圖示)
- **審核狀態彙總**:頁首加 dashboard 條(N pending / N approved / N modified / N rejected),讓使用者掌握審核進度
- **狀態頁(empty / loading / error / 三步驟 idle)**:目前 empty state 簡陋,改為 onboarding-style 引導(說明三步驟、預期時間)
- **Loading 視覺**:Step 1 跑全書 TEU 組裝可能要數十秒到數分鐘;進度條應更明顯,並顯示已組裝 N/M

---

## 7. 與其他已重設計頁的一致性參考

張力分析頁的版面骨架與分析頁不同(**沒有**左側 260px 清單,也**沒有**右側 detail panel),是單欄 800px 的「workflow + result」頁。但仍需在以下面向保持風格一致:

- 與 `CharacterAnalysisPage` / `EventAnalysisPage` 共用的小元件樣式:標題 serif、按鈕 padding、segmented control 樣式、accordion ChevronDown/Right 圖示與配色、status badge 配色
- TensionThemePanel 升級為 hero 時,可參考 `EventAnalysisPage` 的 panel 暗色配色(`--panel-bg` 系列)
- CSS class 命名慣例:CharacterAnalysisPage 用 `.ca-*`、EventAnalysisPage 用 `.ea-*`、TimelinePage 用 `.tl-*`;**張力分析頁目前完全是 inline style + tailwind,沒有對應的 CSS 檔**。重設計請新建 `frontend/src/styles/tension.css` 並使用 `.tn-*` prefix

完整樣式參考:
- `frontend/src/styles/character-analysis.css`
- `frontend/src/styles/event-analysis.css`
- `frontend/src/pages/CharacterAnalysisPage.tsx`
- `frontend/src/pages/EventAnalysisPage.tsx`
- `frontend/src/pages/TimelinePage.tsx`(同期重設計,可參考其 toolbar / detail panel 處理)

### 既有技術債(重設計時須處理或標注)

| 技術債 | 現況 | 重設計時的建議 |
|--------|------|---------------|
| TensionLine / TensionTheme 型別手寫 | [`frontend/src/api/types.ts`](../../frontend/src/api/types.ts) L327–L370 手寫;router 用 `dict` / `list` 回傳沒指定 `response_model` | router 加 `response_model=list[TensionLineSchema]` 等,把 schema 拉進 OpenAPI;前端改從 `generated.ts` 取 |
| `intensityColor()` hardcode RGB 漸層 | [`TensionPage.tsx`](../../frontend/src/pages/TensionPage.tsx) L45–L50 用 `rgb()` 算冷藍→暖橘紅 | 新增 `--tension-intensity-low/mid/high` token,改用 CSS gradient 或 color-mix |
| Frye / Booker badge 借用 entity 配色 | LineCard / ThemePanel 用 `--entity-org-*` / `--entity-con-*` | 新增 `--frye-{romance,tragedy,comedy,irony}-*` 與 `--booker-{...}-*` 專屬 token |
| 主題切換時的 badge 色 | `domain-glossary.md` L77 / L95 註明 hardcode `#fef9c3` / `#ede9fe` | 同上,token 化後同步更新 domain-glossary 與 DESIGN_TOKENS |
| 單檔 739 行 | `TensionPage.tsx` 含 TrajectoryChart / LineCard / ThemePanel / StepButton / useTensionTask | 拆分為 `components/tension/*`(見 §8) |
| `analyzeResult` 不持久化 | Refresh 後 `hasTeus` 改靠 `lines.length > 0` 推斷,Step 1 的「assembled N candidates M」結果就消失 | 設計時考慮這個資訊是否該存(後端要不要回 / cache 在哪) |

---

## 8. 對應 UI_SPEC 與 API_CONTRACT 段落(直接引用,不重複內容)

- UI 規格細節:`docs/UI_SPEC.md` § 3.8(張力分析頁)— 含版面結構 / 三步驟工作流 / 軌跡圖 / 審核卡 / 主題面板
- API 規格:`docs/API_CONTRACT.md` § 14a–14j
- Token 對照表:`docs/DESIGN_TOKENS.md`(重點看 `--panel-*` / `--entity-*` / `--color-success|info|error*` / `--accent` 系列;新增的 `--tension-*` / `--frye-*` / `--booker-*` 也須回填)
- 領域術語(TEU / TensionLine / TensionTheme / Frye Mythos / Booker Plot):`docs/domain-glossary.md` 「張力分析」段

### 既有檔案清單(受重設計影響)

| 檔案 | 用途 | 重設計時的處理 |
|------|------|--------------|
| `frontend/src/pages/TensionPage.tsx` | 主頁面,含 TensionTrajectoryChart / TensionLineCard / TensionThemePanel / StepButton / useTensionTask(**單檔 739 行**) | 視重設計拆分為 components/tension/* |
| `frontend/src/api/tension.ts` | 10 個 API caller(triggerTensionAnalysis / fetchTensionAnalysisTask / triggerGroupTensionLines / fetchGroupTensionLinesTask / fetchTensionLines / reviewTensionLine / triggerSynthesizeTensionTheme / fetchSynthesizeThemeTask / fetchTensionTheme / reviewTensionTheme) | 不需動,但若把 schema 拉進 generated.ts 後可考慮一起改 import path |
| `frontend/src/api/types.ts`(L327–L370)| `TEU` / `TensionLine` / `TensionTheme` 手寫型別 | **理想上**讓後端 router 加 `response_model=`,改從 `generated.ts` 取 |
| `frontend/src/i18n/locales/{zh-TW,en}/analysis.json` | `tension.*` namespace(現有 23 個 key:title / status / approve / modifyLabel / modifyProposition / reject / save / saveModify / operationFailed / themeTitle / noProposition / step1{label,desc,done,running} / step2 / step3 / errors / trajectoryTitle / intensityHint / reviewTitle / refresh / empty / emptyHint / frye / booker) | 新增 key 必須兩語系同步 |
| `frontend/src/styles/tokens.css` | `--accent` / `--panel-*` / `--entity-*` / `--color-success|info|error*` token | 新增 `--tension-*` / `--frye-*` / `--booker-*` 需同步更新 `docs/DESIGN_TOKENS.md` |
| `frontend/src/styles/tension.css` | **目前不存在**,建議新建 | 將 inline style 提取為 `.tn-*` class |
| `frontend/src/contexts/ChatContext.tsx` | `setPageContext({ page: 'analysis', bookId, bookTitle })` | 不需動,但重設計時要確保仍有對應呼叫 |
| `src/storysphere/api/routers/tension.py` | 後端 router(10 endpoints) | 不需動;**若要修型別技術債則需加 `response_model=`** |

### Hooks / Context 依賴(不要動,但會用到)

- `useBook(bookId)` — 取得 book.title 給 ChatContext + Header
- `useQuery + fetchTensionLines` — TensionLine 列表
- `useQuery + fetchTensionTheme` — TensionTheme(`retry: false`,沒資料時 404 → 不渲染 panel)
- `useTaskPolling(taskId, fetcher)` — 通用 polling hook(三步驟共用,但餵不同 fetcher)
- `useTensionTask(fetcher, onDone, defaultError)` — 包裝 useTaskPolling + state,目前定義在 `TensionPage.tsx` 內部(L479–L514),重設計時拆出去
- `useChatContext().setPageContext` — 同步 page context

### 建議的元件拆分(供參考)

```
frontend/src/components/tension/
  ├─ TensionWorkflowStepper.tsx     (3 個 step 的 stepper)
  ├─ TensionStepCard.tsx            (單一 step 卡片,接 props: status / stage / progress / onTrigger / error)
  ├─ TensionTrajectoryChart.tsx     (SVG 軌跡圖)
  ├─ TensionLineList.tsx            (列表外殼 + refresh button)
  ├─ TensionLineCard.tsx            (含 accordion + 三按鈕 + inline edit + evidence display)
  ├─ TensionThemePanel.tsx          (hero card:命題 + Frye/Booker badge + 三按鈕)
  ├─ TensionStatusBadge.tsx         (共用 status badge,4 種狀態)
  └─ hooks/
      └─ useTensionTask.ts          (從 TensionPage 拆出來)
```

### 注意事項

1. **欄位命名是 snake_case**:domain/ model 沒有 `alias_generator=to_camel`,所有取值要用 `canonical_pole_a` 而非 `canonicalPoleA`。設計時若引入新元件 props,內部建議用 camelCase,在 mapper 層轉換。
2. **`chapter_range` 是 array,不一定只有 2 個元素**:`[firstChapter, ..., lastChapter]`。目前 LineCard 取 `chapter_range[0]` 與 `chapter_range[chapter_range.length - 1]` 作為跨度起訖,設計時保持這個慣例。
3. **`analyzeResult` 結果不會在 refresh 後保留**:目前 Step 1 完成的「assembled N / candidates M」結果只存在前端 state,重新整理就消失,後續 hasTeus 改靠 `lines.length > 0` 推斷。如果新設計想顯示「Step 1 跑了多少 TEU」之類的歷史資訊,需要先評估後端是否需要 expose 新欄位。
4. **三步驟有專用 polling endpoint**:不要把它們改成走 #8 的共用 polling pattern。
5. **進度 stage 字串中英混雜**:後端寫死「組裝 TEU N/M」(中)、「grouping」(英)、「loading tension lines」(英)等。i18n 層做不了翻譯;設計時若要顯示 stage 翻譯,需要先讓後端統一 stage code(這是後端工作,不在本 brief 範疇,但可標注為 follow-up)。
