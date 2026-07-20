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

視覺語言（v2 · Ink on Paper）：暖紙上的墨線插畫感；兩主題（Warm / Ink）僅置換 palette 與 component shape 兩層，版面與字體共用。

### 1.2 CSS Token

完整 token 定義與主題對照見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md)。關鍵 token 名稱參考如下（值見 DESIGN_TOKENS）：

`--bg-primary`、`--bg-secondary`、`--bg-tertiary`、`--fg-primary`、`--fg-secondary`、`--fg-muted`、`--border`、`--accent`、`--panel-bg`、`--panel-fg`

### 1.3 字體

```css
font-family: 'Spectral', 'Noto Serif TC', Georgia, serif;      /* 內容本身（正文、標題） */
font-family: 'DM Sans', 'Noto Sans TC', system-ui, sans-serif; /* chrome（按鈕、meta、nav） */
font-family: 'Caveat', 'Noto Serif TC', cursive;               /* 僅限插畫語彙 */
```

判準：一個東西**是**內容 → serif；**關於**內容 → sans。完整規則見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) §3.5。

### 1.4 實體 Pill 樣式（帶色點）

色碼定義見 [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) — 實體 Pill 章節。

```tsx
<span className="pill pill-char">
  <span className="pill-dot" />
  葉文潔
</span>

// CSS 結構（色碼值見 DESIGN_TOKENS）
.pill { display: inline-flex; align-items: center; gap: 3px; font-size: var(--font-size-2xs); padding: 2px 7px; border-radius: 20px; }
.pill-dot { width: 5px; height: 5px; border-radius: 50%; }
// .pill-char / .pill-loc / .pill-con / .pill-evt — background / border / color / dot 色碼見 DESIGN_TOKENS.md
```

**Pill 用於清單 / chips**（頂部實體列表、章節卡實體、全書實體分佈）。**閱讀正文的行內實體標註**（`SegmentRenderer`）另用 `.entity-mark`：閱讀時預設只有一條該類型色的細底線（不搶字流），hover 才浮出淡色塊；文字沿用正文色以維持可讀性。色值同樣取自 DESIGN_TOKENS 的 `--entity-{type}-bg/border/dot`。

---

## 2. 導航架構

### 2.1 全站層級（左側 Sidebar）

固定在所有頁面左側，預設寬度 48px、icon-only（label 以原生 tooltip 提示）；頂部有釘選按鈕可展開為 180px（icon + 中文標籤，主內容區自動變窄），展開狀態記於 localStorage（`sidebar-expanded`）。底部有語言切換按鈕（Globe icon）。

| Icon | 目的地 | 路由 | 狀態 |
|------|--------|------|------|
| Home | 書庫首頁 | `/` | 已實作 |
| Upload | 上傳 & 處理進度 | `/upload` | 已實作 |
| BookOpen | 方法論 | `/methodology` | 已實作（前身 `/frameworks`） |
| Search | 全站搜尋 | — | 佔位（disabled） |
| BarChart3 | Token 用量 | `/token-usage` | 已實作 |
| Settings | 設定 | `/settings` | 已實作 |
| Globe（底部）| 語言切換（zh-TW ↔ EN） | — | 已實作 |

### 2.2 書籍層級（Top Nav Tab）

進入特定書籍後，top nav 顯示書名、「← 書庫」返回入口，以及 8 個 tab（窄螢幕時分頁列可橫向滑動、書名以 `min(200px, 30vw)` 自動縮短，避免擠壓分頁）：

| Tab | 路由 |
|-----|------|
| 閱讀 | `/books/:bookId` |
| 角色分析 | `/books/:bookId/characters` |
| 事件分析 | `/books/:bookId/events` |
| 知識圖譜 | `/books/:bookId/graph` |
| 時間軸 | `/books/:bookId/timeline` |
| 張力分析 | `/books/:bookId/tension` |
| 象徵意象 | `/books/:bookId/symbols` |
| 敘事結構 | `/books/:bookId/narrative` |
| 建構概覽 | `/books/:bookId/unraveling` |

### 2.3 頁面層級關係

```
全站 Sidebar
  ├─ 首頁              /
  ├─ 上傳 & 處理進度   /upload
  ├─ 方法論            /methodology
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
       ├─ 敘事結構      /books/:bookId/narrative
       └─ 建構概覽      /books/:bookId/unraveling
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
                ├─ 上傳區塊（拖曳 / 點擊，可多選）
                ├─ Metadata 表單（選檔後）＋ 待上傳佇列
                └─ 處理中 / 完成 / 失敗（卡片列表）
```

> 2026-07-11 依 Claude Design canvas（`Upload Flow Redesign.dc.html`）重設計。
> 設計核對見 `docs/plans/20260711-upload-ux-design-crosscheck.md`。

#### 上傳區塊（`DropZone`）

- 拖曳或點擊觸發檔案選擇，**支援多選**；格式 `.pdf/.docx/.txt/.epub`，單檔上限 50 MB
- 多選後：第一個檔案進 metadata 表單，其餘進「待上傳佇列 · 逐本填寫」列表
  （序號圓圈 + 檔名 + 移除鈕），確認上傳後依序遞補

#### Metadata 表單

- 書籍名稱 / 作者 / 語系。**書名同名前置警告**：即時比對書庫（`useBooks`），
  命中顯示 `--color-warning` 提示（不擋上傳）。**語系自動偵測 badge**：
  預偵測成功時語系標籤旁顯示「已自動偵測：X · 可修改」（`--color-info`），
  手動改動下拉即消失。>15MB 檔案跳過預偵測。

#### 處理中卡片（`ProcessingCard`，5 態）

- **處理中（running）**：header 顯示 `stage · progress%` + 分隔線 + 「已處理 mm:ss」
  即時時鐘（由 `createdAt` 每秒累加）＋ 卡底 2px 進度條。Body 左為垂直步驟
  timeline，右為 murmur 即時日誌。
- 步驟 timeline（垂直，**7 步**）：PDF 解析 → 語言偵測 → 摘要生成 → 特徵提取 →
  知識圖譜 → 符號探索 → 資料儲存。步驟狀態由 `TaskStatus.stepKey` 驅動
  （`done` 綠圈 ✓ / `running` accent 圈 + 旋轉 Loader + 子進度「章節特徵 3/7」/
  `pending` 空心圈數字），缺 `stepKey` 時 fallback 進度百分比區間。
- **murmur 日誌（`MurmurWindow`）**：mono eyebrow（`stepKey · ch.NN`）+ 內容：
  topic 為 serif 摘要、character/location/org/event/symbol 為實體色 pill
  （`--entity-<type>-*` + 色點 + 角色說明）、raw 為 mono。恆自動捲到底
  （terminal print 概念，無暫停控制）。
- **等待審閱（awaiting_review）**：`--color-warning-bg` 框 + 「等待審閱」badge，
  三動作：接受系統判斷（accent，走 accept 捷徑）/ 開始審閱 →（導 `ChapterReviewPage`）/ 終止處理。
- **部分完成（partial）**：`--color-warning-bg` 框逐列出失敗步驟（label + mono detail）
  + 內嵌「重跑／再試」（idle/loading/failed/done 狀態機，呼叫 `/rerun/:step` 並輪詢，
  推「排入任務中心」/ 成功 / 失敗 toast）；全補齊顯示綠色完成列。
- **完成（done）**：`--color-success-bg` 卡，實心綠勾圈 + 書名 + 「前往《…》→」；
  上方另有同名細條（若 `duplicateTitle`）。
- **失敗（error）**：`--color-error-bg` 框 + 錯誤訊息 + 「重試」（沿用原
  書名/作者/語系，僅需重新選檔）。

#### 全域通知（`ToastHost` / `ToastContext`）

右下角堆疊 toast（success/warning/error/info 四型，左 3px 色條 + 圓形圖示 +
標題 + 內文 + 可選行動鈕，滑入動畫、5.2s／帶行動 9s 自動消失）。
`useTaskNotifications`（掛在 `AppLayout`）輪詢 `GET /tasks`，於 ingestion 任務
轉 done / partial / awaiting_review / error 時觸發對應 toast 與跳轉；首次輪詢
靜默 seed，避免對載入前已終結的任務發通知。

#### HITL 章節審閱（`ChapterReviewPage`）

左欄章節列表 + 右側段落卡，讓使用者確認 / 調整偵測到的章節邊界與角色。

- **角色感知編號**：左欄僅 `body` 章節計入「第 N 章」且從 1 連號；非正文章節
  （`toc`/`preface`/`afterword`/`other`）改顯示角色標籤（目錄／序／跋／其他），
  右側標頭共用同一標籤。編號由章節 state 推導，切換章節角色時即時重算——
  避免正文因前置內容而顯示成「第 3 章」起跳。
- **非正文分色**：非正文章節在左欄以 `--bg-tertiary` 淡底 + `--fg-muted` 斜體字 +
  左側 `--fg-muted` 色條標示；選中該章時右側段落區底色亦轉為 `--bg-tertiary`，
  與一般正文（`--bg-primary`/`--bg-secondary`）視覺區隔。段落層級的非 body 角色
  另以 opacity 0.6 淡化（沿用既有處理）。
- **邊界輔助辨識**（左欄底部按鈕，submit 之上）：使用者觸發，呼叫 `#22c
  POST /books/:bookId/suggest-roles`，由 AI 從書籍**頭尾逐段回推**、找出黏在
  邊緣的非正文（版權頁／作者・譯者簡介／推薦語／跋…），回傳前後附的**段落邊界**。
  前端據此把受影響的 body 章節**切開**：前/後附段落被切成獨立的非正文章節
  （角色由 LLM 依內容判定，目錄/序/跋/其他，非一律 other），**左側章節列表即時更新**
  （新章節以非正文樣式呈現），供使用者覆核後走既有 submit（章節 `startParagraphIndex`
  + `role` 持久化）。非正文章節不進閱讀頁、也不進 KG/摘要。專門處理**融進正文章節頭尾**、
  章節偵測切不出來的邊界（例如整坨後附黏在最後一章尾巴）；已是非正文的章節（目錄）
  不會被再次進入。按鈕 `hover` 顯示 tooltip（`suggestRolesHint`）明確告知「仰賴 AI
  逐段判讀、會消耗 token」；辨識中顯示 spinner + `suggesting`，完成後在按鈕下方顯示
  `suggestApplied`（n = 切出的邊界數）／`suggestNone`／`suggestError` 提示。輪廓樣式
  （`--accent` 邊框 + `--accent-bg` 底），與實心 submit 主按鈕區隔為輔助動作。
  限制：切點只能落在段落（~1200 字 chunk）邊界，故事尾與後附頭同段時整段一起切；
  切點在段落中間時改用下述「段內切分」先把段落修細。
- **段內切分（選取文字 → 新段落）**：處理「真正的章節邊界困在段落中間」的情況
  （預處理把多個邏輯段落融成一段，如版權頁＋獻詞＋題詞整坨一段）。使用者在閱讀欄
  **反白選取要分出去的文字**（限單一段落內），選取處下方浮出 pill 按鈕
  `splitSelection`（`--accent` 實心、`position:fixed` 錨定選取範圍）；點擊後該段
  就地拆成 2–3 段（選取前｜選取｜選取後，空白邊緣自動修剪、空片段不產生），
  新段落**繼承原段落角色**，之後用段落間既有的「＋」分章——不引入第二套章節
  切分概念。「＋」在**所有章節**（含非正文）的段落間都會出現；「＋」切出的新章節
  **繼承原章節角色**（切非正文大雜燴時不會冒出正文章節）。切分後 banner 顯示
  `splitBanner` + `splitUndo` 一步復原；任何其他結構／角色異動會清除復原快照。
  選取容錯：以**選取起點所在段落**為準，超出該段的部分（反白過衝到段尾之後、
  跨到下一段、或拖出閱讀欄才放開滑鼠）自動夾回段內再計算。選取邊界切進章節標題
  （`titleSpan`）內、或會產生純空白片段的選取不顯示按鈕。送審時前端以 `paragraphSplits`
  （原段落索引 → 字元 offset）連同**切分後**索引的 `startParagraphIndex`／
  `roleOverrides` 提交（見 #22b）。
- **目錄對照提示（TOC cross-check）**：純輔助、唯讀。閱讀欄中被判為 `toc` 的章節
  divider 下方出現置中提示框（`--accent` 邊框 + `--bg-secondary` 底）＋一顆入口鈕
  （`--accent` 描邊輔助樣式）；**僅在有 `toc` 章節時出現**。**入口鈕有兩態，避免無謂的
  LLM 呼叫**：（a）尚未解析、或目錄文字自上次解析後**有變動** → 顯示「解析目錄並對照」
  （✦ Sparkles），點擊**呼叫 LLM**；（b）當前這份目錄文字**已解析過** → 顯示「目錄對照」
  （List icon），點擊**只重開 drawer 看快取結果、不呼叫 LLM**。判斷依據＝比對當前串接的
  `tocText` 與「上次成功解析時的 `tocText`」，因此審閱者一改目錄角色/內容，入口鈕就自動
  變回「解析目錄並對照」提示重按。**drawer 內的「重新解析」（↻）則永遠強制呼叫 LLM**
  （也是空/失敗狀態下的重試入口）。呼叫時串接**當前審閱狀態下**所有 `role==toc` 章節的
  段落文字，作為 `tocText` 送 `#22d POST /books/:bookId/parse-toc`——因此重新解析會反映
  最新編輯（而非偵測時的舊目錄）。由 AI 解析出書本聲明的章節清單與順序，從
  **右側 drawer**（`width:326px`、`--bg-secondary`、`--shadow-lg`、絕對定位覆蓋閱讀欄
  右緣、不 reflow 兩欄）滑出。drawer header：標題「書本目錄」＋「AI 解析 · 唯讀」徽章＋
  重新解析（`RotateCw`）＋關閉（`X`）。**五態**：idle（只有入口）/ loading（spinner +
  `toc.loading`）/ done / empty（`toc.empty`）/ error（503 或網路，`toc.error`），
  empty 與 error 附「重新解析」。done 顯示**數量對比摘要行**（整條依吻合換底色：吻合
  `--color-success-bg`/`--color-success`，不吻合 `--color-warning-bg`/`--color-warning` +
  差額徽章「漏切／多切 N 章」）＋**有序條目清單**（label 為 body 條目流水號、標題 serif、
  `isBody=false` 標「非正文」徽章、有頁碼顯示 `p.N`、依 `level` 縮排）。比對＝目錄 body
  條目數 vs 偵測 body 章節數，**由前端計算**。刻意設計：drawer（書本目錄）與左側結構脊
  （偵測結構）兩份**各自獨立、中間不連線、不自動配對**，比對由人眼完成；不驅動任何切分。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#2（上傳 PDF）、#8（任務 polling）、
#22a（review-data）、#22b（review）、#22c（suggest-roles）、#22d（parse-toc）

---

### 3.3 閱讀頁 `/books/:bookId`

> 2026-07-13 依 Claude Design canvas 全面翻新（計畫 `docs/plans/20260713-reader-page-revamp.md`，R1–R9）。定位為**檢視器（inspector）**：chunk 卡片結構是定案，不做連續文流。

#### 版面結構

```
[Left Sidebar] [欄1: 書籍資訊 250px 可收合→46px 細軌] [欄2: 章節列表 224px 可收合]
[連接線 SVG 34px] [欄3: Chunk 內容 flex, min 460px] [認知狀態側欄 288px 開關式]
```

窄螢幕（≤768px）降級：進頁自動折疊欄 1、欄 2（縮成直排文字細軌），正文最大化，連接線隱藏；使用者可手動展開。

#### 欄 1 — 書籍資訊（`BookOverview`）

header 列（label + 收合 chevron）、封面佔位（76px）、書名（serif lg/700）、作者、status badge、書籍摘要（serif）、關鍵數字 5 格（2 欄 grid：章節/Chunks/實體/關係/事件，事件跨欄）、全書關鍵字、實體分佈 pill（聚合統計，不可點）。收合後成 46px 細軌：chevron + accent FileText icon + 直排「書籍資訊」，點細軌任意處展開。

#### 欄 2 — 章節列表（`ChapterCard`）

sticky header：「章節 · N」label + **全部展開／全部收合**鈕；搜尋框（標題/實體/關鍵字），搜尋時**不過濾**列表——不符者 `opacity:0.4` 仍可點，並顯示「N 章符合」。

章節卡為**多開手風琴**，兩個獨立操作：**點卡頭左側 = 導航**（欄 3 讀該章，順帶展開）；**點右側 chevron = 只展開/收合**（不導航）。選中章節 = accent 雙線邊框（border + inset shadow）。展開內容：摘要 → 關鍵字 badge → 實體 pill（可點開實體卡）。

#### 連接線 — `BezierConnectors`

欄 2/欄 3 之間的實體 34px SVG 欄（`viewBox 0 0 34 100`）。**動態**：每個 chunk 一條曲線從選中章節卡垂直中心扇出至該 chunk 畫面位置；捲動/resize/切章即時重算（rAF 節流、直寫 SVG DOM 不觸發 re-render）。終點在視窗 28–72% 的線 `stroke-width 1.5 / opacity .75`，其餘 `0.8 / 0.3`。欄 2 收合、無選中章節、專注模式、窄螢幕時隱藏。

#### 欄 3 — Chunk 內容

sticky header：章節標題 + 「第 N/M 章」badge + chunk 數（左）；標註密度開關（全部／角色／關）→「認知狀態」toggle →「Aa」排版鈕 →「專注」toggle（右）；底部 2px **捲動進度細條**（accent 填充）。

chunk 卡：`#N` 編號 + 實體 chips（可點開實體卡）+ 實體標註正文（serif，行內細底線、hover 浮色塊，見 §1.4，可點開實體卡）+ keywords。`※※※` 分隔 chunk 置中呈現。標註密度以容器 `data-annotation-mode` 控制：「角色」= 非角色標註/chips 隱藏且不可點；「關」= 全部標註不可點、chips 列隱藏。

章末有「← 上一章 / 下一章 →」（首末章單邊）；捲動 >500px 浮現右下**回頂部**圓鈕（避開 ChatBubble）。

#### 實體卡 — `EntityCard`（popover）

點行內標註或 chip 開啟：320px popover 貼點擊來源（空間不足上翻、無遮罩、Esc/點外關閉）。內容：實體名 + 型別 pill + 全書出現數；動作列「角色分析」（僅 character）＋「在圖譜中查看」（`?entity=` 聚焦）；角色顯示 `profileSummary` + archetype badge（#7a 404 = 顯示「未生成」）；**出現段落列表**（#9b）每項可點跳段——同章直接捲動 + flash 高亮，跨章先切章再定位。

#### 認知狀態側欄 — `EpistemicSidePanel`（288px，預設關）

由欄 3 工具列「認知狀態」開關。角色下拉 → 三組事件：已知（綠）/未知（黃）/誤信（紅），色點 + label + count 標頭；**事件項可點跳到對應段落**——點擊時以事件標題+描述做 #22a 語意搜尋（限定該章命中，搜尋中顯示 spinner），跳段 + flash 高亮；查無同章段落或搜尋失敗時退回章節級跳轉（同章 fallback = 捲回頂部）。誤信經 sourceEventId 反查來源事件，查無則不可點。

#### 專注模式 + Aa 排版

「專注」toggle：欄 1+欄 2 強制收軌 + 連接線隱藏 + 正文 `max-width:760px` 置中；不動用戶原收合偏好，退出自動還原；不持久化。「Aa」面板：字級 3 檔（15/17/19px）、行距 3 檔（1.6/1.85/2.15）、紙張色溫 4 檔（`--paper-warmth-0..3`，僅 Warm 主題；Ink 欄 3 固定 `--bg-primary`）、逐段淡入 toggle；持久化於 localStorage `reader:prefs`。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#3（書籍詳情）、#4（章節列表）、#5（Chunk 內容）、#7a（實體深度分析）、#9b（實體出現段落）、#12e（認知狀態）

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

未選取角色時，內容區顯示提示文字加上「快速前往已分析角色」入口（列出前 5 位已分析角色，點擊直接載入其分析），避免空面板浪費版位。

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

> 2026-07 全面翻新（Phase 1~6）：本節以翻新後實作為準。設計 brief 見 `docs/plans/20260718-kg-redesign-brief.md`、實作計劃見 `docs/plans/20260718-kg-redesign-implementation.md`。前身 V1（2026-05-17，計劃 `docs/plans/20260517-kg-page-redesign-v1-impl.md`）僅供沿革參考。翻新零新增後端端點。

#### 版面結構

```
[Toolbar]                                                          [Legend]
                       [圖譜 Canvas（全幅）]                       [右側面板]
[Lens]                                                             [MiniMap]
                                                                    [Stats]
```

所有面板均為**暖白底**（`var(--bg-primary)`），`border-left: 1px solid var(--border)`、`border-radius: var(--radius-lg)`、`box-shadow: var(--shadow-sm)`。

**空狀態**：當書籍尚無節點（`nodeCount === 0`）時，改顯示引導卡 `GraphOnboardingHero`——說明圖譜由章節實體與關係萃取而成，並提供「前往上傳」CTA；此時不渲染 Canvas 與各面板。

#### 圖譜 Canvas

- Cytoscape.js 渲染（fcose layout）；載入後自動 `fit` 置中（Phase 1）
- 節點大小＝**登場頻率**（`chunkCount` sqrt 縮放）
- 節點顏色依實體類型 — 使用 `--graph-{type}-fill / -stroke / -label` token
- **聚焦模式**（Phase 1）：選取 degree ≥ 5 的節點時，非鄰居 dim 至 ~0.1，聚焦焦點＋鄰居
- **標籤策略**（Phase 1）：預設只顯示 degree top-N 標籤；聚焦時顯示焦點＋前 N 鄰居；事件標題單行截斷；低 zoom 隱藏
- **孤兒節點**（degree 0）自畫布移除，改收進右上「未連結實體」抽屜（Phase 1）

**邊語意配色**（Phase 1，個別檢視）：依關係類型分桶上色 —— 合作/正向＝`--color-success`、敵對/負向＝`--color-error`、一般＝`--fg-muted`。

**Inferred edge**（不使用 dashed）：
- color = `var(--accent)`
- width = `1 + confidence × 1.6` px
- opacity = `0.42 + confidence × 0.25`

**類型 Super-node**（cluster mode 'type'）：
- 虛擬節點聚合，原始節點不進 cytoscape；dashed border + 半透明 type 色填充；label＝type 名稱 + 成員數
- **確定性 preset 分組排列**（Phase 4）：super-node 依固定環形佈局，不隨機力導向

**社群檢視**（cluster mode 'community'）改用 **FactionCanvas**（獨立 SVG，非 cytoscape），見下方〈Cluster mode〉。

#### 浮動工具欄（左上角，GraphToolbar）

雙列工具列（Phase 2）：

```
Row 1: [搜尋欄→SearchDropdown]  [群集模式: 個別 / 類型 / 社群]  [重置]
Row 2: [型別 filter chips ×7]   [推論控制]
```

- 群集模式三段皆可用（社群不再 disabled）；「動畫模式」選項已移除（固定淡入，Phase 2 / C7）
- **型別 filter chips**（Row 2）是型別顯示開關的**唯一入口**；LegendCard 只作說明＋計數，不再重複控制（Phase 1 / C6）

**推論控制**（Phase 2，執行與顯示分離）：
- 三態：未執行（「執行推論」popover 預告）/ 執行中（spinner）/ 有紀錄（「重新推論」menu ＋「待審核 N」badge ＋「顯示推測邊」toggle）
- 「安全重跑 / 強制重跑」收入 menu，強制重跑帶破壞性紅字警示 + confirm
- 開啟審核 → 右側 **InferredEdgePanel**；點推測邊亦開該面板並聚焦該筆（C10）

**深連結**（Phase 6 / F4）：見下方〈深連結〉。（分享連結與匯出 PNG 已於 2026-07 移除——體感雞肋。）

#### LensCard（左下角，合併卡）

**分頁式**三分頁（Phase 3，非垂直堆疊）：

1. **時間軸 · Timeline** — chapter/story gated toggle（story 依 viable 判定啟用）＋ slider [0..max]，0 = 全部章節；含 **F3 逐章成長播放**；齒輪入口開 `TimelineConfigModal`（偵測統計 / viable 判定 / 啟用切換）
2. **認知視角 · Epistemic** — 個別模式生效；聚合模式（類型/社群）顯示停用態＋說明＋「切回個別」；已知 X/Y 統計、「標記角色誤信」toggle；fallback 為全書終局（brief §9-5）
3. **書籤 · Bookmarks** — 點擊跳轉；聚合模式下點書籤先切回個別再選取；localStorage 說明

localStorage key（**必須保留**，換版面不換 key）：`graph:${bookId}:timeline:*`、`graph:${bookId}:epistemic:*`、`graph:${bookId}:bookmarks`、`graph:${bookId}:clusterMode`。深連結 `?chapter=N` 於首次載入 seed 時間軸，之後回歸 localStorage 行為。

#### LegendCard（右上角，常駐圖例）

**完整 7 個 entity types**（角色/地點/組織/物品/概念/事件/其他，設計 contract 規定不得只列 4 類子集）+ 對應成員數，點擊 row → toggle 該類型可見性。swatch 為 12px 圓（`--graph-*-fill` 底 + `--graph-*-stroke` 框）。底部分隔線 + 「推斷 · N」row（toggle inferred 圖層）。工具列的型別 filter chips 同樣涵蓋 7 類。

#### MiniMap（右下角 180×120）

- SVG 重繪：所有節點為小點（依 type 上色）+ 細淡 edges
- Viewport rect 顯示當前 camera bounds
- 互動：click → 立即定位；drag viewport rect → 持續 pan

> BreadcrumbBar 已於 2026-07-20 移除——與工具列的群集模式 segmented control 重複，且 drill-in 返回改由 ClusterOverviewPanel 的「← 返回」按鈕負責。

#### 右側面板（優先序，同時只顯示一個）

| 條件 | 面板 | 寬度 |
|---|---|---|
| Shift+Click 選了 2 個節點 | **EntityComparePanel**（Scenario E）| 560px |
| 推斷 chip 開啟 OR 點到推斷邊 | **InferredEdgePanel**（Scenario F 審查列表）| 380px |
| Cluster mode 'type'/'community' 且無選中節點 | **ClusterOverviewPanel** / drill-in 成員列表（社群模式含說明卡＋進階分群抽屜）| 280px |
| 單選節點 | EntityDetailPanel / EventDetailPanel | 280px |

**第三層面板**（AnalysisPanel / ParagraphsPanel）行為不變，從 EntityDetailPanel 觸發。

**EntityDetailPanel 版面**（280px）：serif 標題 → meta 列（type pill＋**僅角色**顯示的 `陣營·錨點名` pill）→ **3 格 stat tiles**（登場次數／關係數＝degree／首次登場章＝chunks 最小章號）→ **`加入比較`＋`標記` 兩顆 ghost 外框按鈕**（加入比較＝把當前實體設為比較第一位，下一次點節點湊成對開比較）→ `深度分析`（僅角色；覆蓋重生成 link，空狀態為 ghost CTA 非實心）→ `相關段落`（章節·Chunk 預覽卡＋查看連結）。動作語彙統一為 ghost 按鈕＋文字連結，無實心強調色塊。

#### 多選比較（Scenario E，cap 2）

Shift+Click 第 2 個 → 並排比較；第 3 個 → 踢掉最早選的。共同鄰居加 `--accent` 虛線高亮，其餘節點 opacity 0.35。EntityComparePanel 頂部提供「進入實體對模式」入口 → 開啟下方〈實體對模式〉獨佔覆蓋層。

#### Cluster mode

- **個別**（預設）：所有節點獨立顯示
- **類型**：純前端 group-by（`frontend/src/services/kgClustering.ts`），4–7 個 super-nodes；確定性 preset 分組排列（Phase 4）
- **社群**：接後端 `GET /books/:bookId/analysis/factions`（F-16，已上線），改用 **FactionCanvas**（SVG 陣營圈＋成分點）
  - **陣營錨點命名**（Phase 4）：前端由 `topMemberNames[0]`＋「陣營」推導（如「寇仲陣營」），核心成員未登場則 fallback 後端 label；後端不動
  - **時間軸連動**（Phase 4）：faction 分析帶 `?chapter=`（chapter 模式且 position>0），派系劃分隨章節重算
  - **社群說明卡**（Phase 4）：交代分群僅計入角色正向關係、未歸屬角色數、非角色/未分群實體數
  - **drill-in**（C8）：點陣營 → 該陣營置中展開成員、其餘陣營淡出；成員點擊切回個別模式並選取
  - 分群參數（resolution / minClusterSize）收進進階抽屜，預設收合（draft/applied，不即時重算）

Mode 切換以 localStorage `graph:${bookId}:clusterMode` per-book 記憶。

#### Search dropdown（Scenario D）

Toolbar 搜尋欄輸入 → 下拉框出現（360px wide）：

- **實體**：matching graph nodes + type dot + 登場段數
- **章節**：matching chapter titles
- **段落內文**：placeholder「全文搜尋待後端實作」

鍵盤：↑↓ 選擇、↵ 開啟、Esc 關閉。Debounce 200ms。

#### 實體對模式（Phase 5 / F1·F2，PairModeOverlay）

從 EntityComparePanel「進入實體對模式」開啟的**獨佔覆蓋層**（`z-index:30`、`--bg-primary` 不透明背景蓋住主畫布）。進入時其餘 lens／工具列／面板暫停（條件不渲染，狀態保留，退出即還原）。頂部卡：「關係演變 · A × B」＋〔演變動畫 / 路徑追溯〕切換＋退出。

- **F1 逐章演變**：A 左 / B 右 + 兩者共同鄰居的聯集固定佈局；底部逐章步進器（章節點＋「第 n 章 / 共 N 章」）；步進時本章新增鄰居淡入；右側欄堆疊「本章新增」（型別色 pill，非 LLM 敘事）。共同鄰居依共現權重排序、上限 15，其餘收「+N」聚合節點。
- **F2 路徑追溯**：A↔B 的 BFS 最短鏈，橫向節點序列呈現。
- **空狀態**：變化不足（共同鄰居無成長）→ 降級提示；無路徑 → 提示。
- 資料全部由真實圖譜即時計算（逐章 snapshot 走 `useQueries` 共用 react-query 快取），章數＝`chapters.length`，零新增後端。純邏輯在 `frontend/src/lib/graphPair.ts`。

#### 深連結（Phase 6 / F4）

- URL query `?entity=&mode=&chapter=` 於載入時還原（entity 選取、群集模式、時間軸章節）；`mode` 只套用一次，不覆蓋使用者後續操作；書籤不隨深連結走（per-browser localStorage）。`?entity=` 供外部連結使用（如角色分析頁「在圖譜中查看」）。
- **分享連結按鈕與匯出 PNG 已移除**（2026-07，體感雞肋）；深連結還原保留，URL 由外部連結或手動書籤提供。

#### Transition / hover

- 所有 transition 用 `color / background-color / opacity / box-shadow`，duration `var(--transition-fast)` (150ms) 或 `--transition-normal` (250ms)，easing `ease`
- Hover：背景下降一階（`--bg-primary → --bg-secondary` 等）；**不使用 transform / translate**

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#9（圖譜資料）、#9b（實體相關段落）、#10a–#10d（推斷關係 run / fetch / confirm/採用 / reject/否決）、#11（事件詳情）、#12a–#12b（TimelineConfig）、#12c（detect-timeline）、#12d（classify-visibility）、#12e（認知狀態）、#7a（實體分析）、#7b（觸發實體分析）、#8（任務 polling）、#4（章節清單供 SearchDropdown）。

**翻新（Phase 1~6）不新增任何 API 端點**。社群模式接既有 `GET /books/:bookId/analysis/factions`（F-16，支援 `?chapter=`）；深連結與逐章 snapshot 皆沿用既有 `GET /books/:bookId/graph`。

---

### 3.7 時間軸頁 `/books/:bookId/timeline`

> 後端設計見 [`docs/guides/PHASE_9_TEMPORAL_TIMELINE.md`](guides/PHASE_9_TEMPORAL_TIMELINE.md)
> 規劃 brief 見 [`docs/plans/20260519-timeline-page-redesign.md`](plans/20260519-timeline-page-redesign.md)

#### 版面結構

```
[Toolbar 上：3 視圖卡 + 工具]
[QualityBanner（hasChronologicalRanks=false 且已有事件時出現）]
[ActiveFilters Bar（有套用篩選時出現）]
[時間軸主區 flex] [事件詳情面板 360px，點擊事件後展開]
```

**空狀態**：當書籍尚無任何事件時，主區改顯示引導卡 `TimelineOnboardingHero`——以三步說明卡（事件抽取 → 故事時序 → Genette 分析）+「前往事件分析」CTA 引導使用者，此時 QualityBanner 不出現。呼應張力分析頁的 onboarding hero 模式。

**版面對齊**：時間軸沿主軸（橫向 layout=橫、垂直 layout=豎）排列並捲動，內容在**次軸方向置中**（橫向→垂直置中、垂直→水平置中），使內容少時的留白平衡對稱、而非黏在角落。實作於 `.tl-canvas-inner`（橫向 `align-items: center`；垂直 `justify-content: center` + `width: 100%`）。

#### 3.7.1 頂部工具列（V2 / 進取版）

```
左側 — 三卡視圖切換（每張：圖示 + 標題 + 為什麼用的副標）:
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ ☰ 章節順序        │ │ ↗ 故事時序        │ │ ▦ 矩陣視圖        │
  │ 依書中出現順序... │ │ 依事件實際發生... │ │ 章節 × 時序...    │
  └──────────────────┘ └──────────────────┘ └──────────────────┘
  （未排序時序時，後 2 張卡右上有黃色 warning dot）

右側:
  [⇄ ↕] layout 切換（矩陣模式下隱藏）
  [☰ 篩選 (n)]  ← n 為已套用群組數
  [████░ 65% 已分析]  ← QualityChip（hasChronologicalRanks=true 時）
  [↻ 重新計算時序 / 計算中…]
  [⎇ Genette 分析 ✓]  [非線性 · 倒敘 3 · 預敘 1]  ← GenettStructureChip（分析完成且覆蓋率足夠時出現）
```

**GenettStructureChip（`tl-genett-structure-chip`）**：Genette 分析成功後顯示於按鈕右側的細框 badge，顏色依 `story_time_structure`：
- `linear` → 綠色（`--color-success`）
- `partially_linear` → 琥珀（`--color-warning`）
- `non_linear` → 藍紫（`--accent`）

覆蓋率不足時不顯示 chip（只有 banner 提示原因）。關閉 banner 後 chip **仍保留**（data 與 banner 解耦）。

#### 3.7.2 QualityBanner（hasChronologicalRanks=false 時頂部出現）

```
[⚠]  尚未計算故事時序
     「故事時序」與「矩陣視圖」需要事件的 chronological rank...
     已分析 N/M 事件（P%）                       [↻ 重新計算時序]
```

橘色 `--color-warning-bg` 底色，把行動 CTA 直接擺在橫幅上引導。

#### 3.7.3 ActiveFilters Bar（有套用篩選時出現）

```
已套用：[葉文潔 ×] [回敘 ×] [KERNEL ×]   全部清除
```

每個 chip 可單獨移除；「全部清除」一鍵 reset filter。

#### 3.7.4 時間軸主區（EventCard 視覺）

V2 用卡片化節點取代圓點：
- 左側 3px (KERNEL) / 5px (KERNEL) 色帶：`::before`，`--card-narrative` 顏色，依 `narrativeMode`
- **右側 3px 色帶（Genette displacement）**：`::after`，`--card-displacement` 顏色，僅當事件命中 `analepsis_event_ids` 或 `prolepsis_event_ids` 時顯示（加 `.displaced` class）；倒敘 = `--narrative-flashback-border`（藍），預敘 = `--narrative-flashforward-border`（琥珀）；不與左側 narrativeMode 色衝突（左 narrative / 右 displacement）
- 卡頭：NarrativeIcon（自繪 lucide-style）+ K/S 標籤 + Ch.N
- 標題（serif，2 行 clamp）+ pills（至多 3 個，超出顯示 +N）

NarrativeIcon 5 種圖示替代原本錄影機字符 `⏪ ⏩ ⏸`（語意錯位）。每個圖示是小型「時間軸 + 跳躍方向」線性圖：
- **present** — 時間線 + 實心點 + 前進箭頭
- **flashback** — 時間線 + 往回的弧線箭頭
- **flashforward** — 時間線 + 向前的弧線箭頭
- **parallel** — 兩條錯位平行線
- **unknown** — 虛線圓 + 問號

Parallel 事件群組：`narrativeMode === 'parallel'` 的連續事件收為群組，左側雙線紫色 + 其餘虛線紫框；標題 `⤳ 並行支線`。

SVG overlay：底層 spine polyline（淡灰）+ CAUSES 邊（confidence ≥ 0.5 才畫；≥ 0.8 實線 / < 0.8 虛線）。

#### 3.7.5 Filter Sheet（下拉面板）

chip 風格 toggle（不是 checkbox），分區：事件類型 / 敘事模式 / 重要性 / 角色（含搜尋）/ 地點。

#### 3.7.6 事件詳情面板（右側 360px，hero 風格）

```
[← 關閉]
[KERNEL 核心 NarrativeIcon][· 回敘][Ch.5]   ← 上方 meta chip 列
事件標題（serif, 17px）
章節標題 · 故事時間提示                       ← subtitle
┌─ 主題意義 ──────────────────────┐
│ 葉文潔的紅岸決策……               │  ← thematic block（accent left bar）
└────────────────────────────────┘

事件概要：description + participants/location pills

時序關係（mini-timeline）：
  ○─ 前驅 · prior：xxx (Ch.3 · 當下敘事)
  │
  ●─ 當前事件：本事件標題 (Ch.5 · rank 0.42)
  │
  ○─ 後續 · subsequent：xxx (Ch.7 · 當下敘事)

[EEP 證據剖析 ▾]（預設展開）
[因果分析 ▸]（預設收合）
[影響分析 ▸]（預設收合）
```

當未分析時，hero 下方提供「前往深度分析頁觸發 EEP」CTA。

#### 3.7.7 矩陣視圖（Fabula-Sjuzhet Matrix，V2）

- X 軸 = 章節（離散），Y 軸 = `chronological_rank` 0.0→1.0
- **頂部邊際 histogram**：每章節事件密度直方圖（accent 色，alpha 隨密度遞增）
- **45° 對照線**：虛線，表示「完全按故事順序敘事」
- **degraded row（Y = -0.1）**：warning 色，放 `chronological_rank == null` 事件
- **Quadrant labels**：「↖ 預敘區 / ↘ 倒敘區 / ⤵ 未排序事件」三象限標籤（Genette 著色開啟時，前兩個隱藏，只保留未排序）
- **Genette 著色 toggle（`tl-genett-color-toggle`）**：有 genettData 時才顯示於右上角（與象限標籤同層 HTML overlay）；開啟時 dot 顏色改為 displacement_type 著色（analepsis 藍 / prolepsis 琥珀 / linear 灰），legend 同步切換三類；關閉時還原 narrativeMode 著色
- **45° 對照線標籤**：Genette 著色關閉時顯示「完全按故事順序敘事」，開啟時改為「零位移基準線」
- Dot 半徑：KERNEL 8 / SATELLITE 5 / 預設 6；顏色依 narrative mode（Genette 著色關閉時）
- 框選（brush）：未選中 dot opacity 降至 0.15
- Tooltip：hover 顯示 title / Ch / mode / rank / participants

#### 樣式檔案

`frontend/src/styles/timeline.css`（`.tl-*` prefix），與 character-analysis / event-analysis 並列；不修改 design tokens。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#13a（時間軸資料）、#13b（觸發時序計算）、#11（事件詳情）、#8（任務 polling）

---

### 3.8 張力分析頁 `/books/:bookId/tension`

> 術語定義（TEU、TensionLine、TensionTheme 等）見 `docs/domain-glossary.md`。

#### 版面結構（2026-05 重設計）

```
[全寬內容區 max-width: 1280px，padding 24px 28px 80px]
  ├─ Stepper Strip                  (三步驟橫排 strip，內嵌 scope label + 進度條)
  ├─ Theme Hero / Onboarding Hero   (合成完成 → 命題 hero；尚未 → 三層管線教學)
  ├─ Trajectory Dashboard           (全寬，章節 TEU 密度 marginal + 每條 line 散點)
  ├─ Summary Chip Bar               (pending / approved / modified / rejected 統計 + 過濾)
  └─ TensionLine 審核列表            (LineCard 摘要+展開：thematic_note → carriers → evidence)
```

CSS 入口：`frontend/src/styles/tension.css`（class prefix `.tn-*`）。
元件入口：`frontend/src/components/tension/`（StepperStrip / ThemeHero / OnboardingHero / TrajectoryDashboard / SummaryChips / LineCard / StatusBadge / hooks/useTensionTask）。

#### 三步驟 Stepper Strip

`.tn-stepper` 把三個 step 水平排在同一卡片中；每格內顯示「scope eyebrow（SCENE / CROSS-SCENE / BOOK）→ label → desc」，狀態語意：

| 視覺狀態 | class | 表現 |
|----------|-------|------|
| idle / active | `.tn-step` / `.is-active` | 中性色 num badge，可點 |
| running | `.is-running` | num badge 變 info 色，inline spinner，底部 2px progress bar 顯示 `progress%` |
| done | `.is-done` | num badge 變 success 色 + ✓，CTA 改為 ↻（可重跑） |
| disabled | `disabled` attribute | opacity 0.45，desc 顯示 lock 文案（e.g. `step3.lock` = "需先完成 Step 2"） |
| error | `.tn-step-error` 橫條 | 對應 step 下方插入 error 橫條（i18n `tension.errors.*`） |

| 步驟 | 完成後 desc |
|------|------------|
| Step 1 TEU 組裝 | `組裝完成 · {assembled} / {candidates} 場景` |
| Step 2 TensionLine 聚合 | `聚合完成 · {count} 條張力線` |
| Step 3 TensionTheme 合成 | `主題已合成` |

#### Theme Hero（`.tn-hero`）

合成完成（或 lines 存在但 theme 尚無）時取代舊「面板」配置，作為頁面 anchor：

- **Eyebrow**：`全書張力主題 · TensionTheme` + 右上 StatusBadge
- **命題**：`<p>` 用 `var(--font-serif)` + `--font-size-2xl`（24px）serif 大字（可 inline 編輯為 `<textarea>`）
- **Meta 欄**：Frye badge（`data-mode=` 對應 `--frye-*` token）／Booker badge（共用 `--booker-*` + § 字符）／合成來源（line 數）
- **Actions**：Approve / Modify proposition / Reject（樣式同 LineCard），右下顯示 `assembled_by · assembled_at`

無資料時：渲染 `OnboardingHero` — eyebrow + 引言 + 三張 layer card（TEU SCENE / TensionLine CROSS-SCENE / TensionTheme BOOK）說明三層聚合語意。

#### Trajectory Dashboard（`.tn-traj`）

由 SVG 改為 CSS Grid（`grid-template-columns: 200px 1fr`），全寬填滿；不再硬編色：

- 章節 TEU **密度直方圖**作為 marginal，bar 用 `--accent` + opacity 0.55
- 每條 line 一列 `.tn-traj-row`：左側 label（poles + meta + 小型 status icon），右側 canvas 顯示橫條
- 橫條色用 `intensityBucket(intensity_summary)` 對應 `--tension-intensity-{low|mid|high}-{bg,fg,edge}`（不再 hardcode `rgb()`）
- 每個 TEU 在自己章節位置疊一顆 `.tn-traj-row-dot` 圓點，半徑 = 3 + intensity × 4
- 點 row 觸發 `onFocus(line.id)` 平滑捲動到下方對應 LineCard

#### Summary Chip Bar（`.tn-summary`）

新增的審核 dashboard 條，列在 trajectory 之下、列表之上：

- 「全部 N」+ pending / approved / modified / rejected 四顆 chip（顯示計數，點擊作為列表過濾）
- 右側「隱藏已拒絕」checkbox + 重新整理按鈕

#### LineCard（`.tn-card`）— **解決盲審**

折疊狀態：chevron + `PoleA vs PoleB` + 80px mini intensity bar + meta（TEU 數 / ch 跨度 / 強度 %）+ StatusBadge。

展開狀態（`.tn-card-body`）依序：

1. `tn-card-note`：line-level `thematic_note`（serif italic 引言區塊；若 grouping LLM 沒回則略過）
2. `tn-poles` 兩欄：每極顯示 eyebrow + 名稱 + carrier pills（從各 TEU 的 `pole_a_carriers` / `pole_b_carriers` 去重合併）
3. `tn-evidence`：列出構成此線的 TEU（chapter + 進度條式 intensity bar + tension_description + evidence 引文）。預設 density=summary 顯示第 1 筆 + 「+ 還有 N 則」inline 提示；可點「展開全部 {n} 則」切換為 full
4. `tn-card-actions`：Approve / Modify Label（inline 編輯 PoleA / PoleB）/ Reject

#### 與舊版差異

| 面向 | 舊版 | 新版 |
|------|------|------|
| 版面寬度 | 800px 單欄 | 1280px 全寬 |
| 三步驟 | 垂直堆疊卡片 | 水平 stepper strip，含 scope eyebrow + 進度條 |
| 軌跡圖 | 560px SVG，hardcoded rgb() 漸層 | CSS Grid 全寬 dashboard + 密度直方圖 + TEU 散點，色用 `--tension-intensity-*` |
| LineCard 展開 | 只有三按鈕 | 加 thematic_note + carriers + TEU 證據（解決盲審） |
| Frye / Booker badge | 借用 entity-org / entity-con 配色 | 獨立 `--frye-*` / `--booker-*` token |
| 審核總覽 | 散落 | Summary chip bar 集中顯示 + 過濾 |
| 結構 | 單檔 inline style | `components/tension/*` + `styles/tension.css` |

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

頁面分為兩欄：左側清單（240–260px）+ 右側意象詳情。i18n namespace 為 `analysis.json` 的 `symbol.*`（與其他分析頁對齊；舊 `settings.json/symbols.*` 已搬移）。

#### 版面結構

```
[Left Panel 260px] [Content Area flex]
```

#### Left Panel — 意象清單

- 類型 chip row（all / object / nature / spatial / body / color / other；只顯示有資料的類型）
- 搜尋輸入框（match `term` 與 `aliases`）
- 排序維度切換：頻率 / 首見 / 審核
- 清單項：
  - 類型色點
  - 詞條（serif）+ polarity dot（若已有 interpretation）
  - 異體（最多 2 個，` · ` 串接）
  - DensityStrip — 章節密度縮影（每章一格，依密度上色）
  - 右側：出現次數 + ReviewBadge（若已有 interpretation）

#### Content Area — 意象詳情

選中意象後依序顯示五個區塊：

1. **標題列**：詞條 h1（serif）+ TypePill + 出現次數；下方為異體 pill 列。
2. **詮釋區（依狀態切換）**：
   - **生成中**（`InterpretationGenerating`）：中央卡片含五階段 checklist（彙整 SEP 證據檔 / 採樣段落脈絡 N/N / 連結 KG 角色 / LLM 詮釋 / 寫入待審紀錄），上方為整體進度條 + taskId，下方為取消按鈕與輪詢註記。後端 `_run_symbol_analysis` 只 emit 3 個 progress event（10/40/90），前端把 10 之前的三個敘事步視為「assemble SEP」原子塊，達 10 後一起標 done；採樣 N/N 顯示的是 `entity.frequency`（與 `len(sep.occurrence_contexts)` 等價），非逐筆計數。詳見 [`InterpretationGenerating.tsx`](../frontend/src/components/symbols/InterpretationGenerating.tsx) 的 `deriveStages` 註解。
   - **已生成**（`InterpretationHero`）：
     - 上：`LLM 詮釋` tag + assembled_by + 日期 + ReviewBadge（右）
     - 主題命題（serif italic）
     - polarity 方塊（圖示 + 標籤）+ confidence meter
     - 證據綜述（evidence_summary）
     - 相關角色 / 相關事件 chips（從 `linked_characters` / `linked_events`）
     - HITL 三按鈕（通過 / 修訂 / 駁回）+ 重新生成 ghost 按鈕；按修訂時切換 inline edit theme + polarity → 儲存 / 取消
   - **尚未生成**（`InterpretationCta`）：sparkles 圖示 + 說明 + 主按鈕「生成 LLM 詮釋」
3. **章節分布卡（`ChapterDistChart`）**：SVG 長條，密度漸層（low/mid/high）+ 峰值三角 marker（前 3 名章節，client-side 推導）+ hover tooltip + 密度圖例
4. **共現網絡卡（`CoOccurrencePanel`）**：3 個 tab
   - 共現意象：彩色 pill grid（依 imagery_type 著色 + 共現次數 chip），點擊切換選中
   - 共現角色：來自 interpretation.linked_characters，藍 dot + 角色 id（後續可接 KG 跳轉）
   - 共現事件：來自 interpretation.linked_events，紅 dot + 事件 id
5. **出現紀錄卡（`OccurrencesTimeline`）**：按章節分組，每組 header「第 N 章 · M 次」+ 分隔線；每筆顯示 `#position` + 前後文（term / aliases highlight）+ 共現詞 tags（最多 3）

#### 狀態

| 條件 | 顯示 |
|------|------|
| list loading | 右側 LoadingSpinner |
| `entities.length === 0` | EmptyState — `emptyTitle` + `emptyHint` |
| 未選中且有資料 | EmptyState — `selectPrompt` + `selectPromptDesc` |
| 選中但 interpretation 不存在（404） | `InterpretationCta` |
| 選中且 polling | `InterpretationGenerating` |
| 選中且有 interpretation | `InterpretationHero`（HITL 可操作） |

#### 設計 token

- 意象類型：`--symbol-{object,nature,spatial,body,color,other}-{bg,fg,dot}`（既有）
- 詮釋極性：`--polarity-{positive,negative,neutral,mixed}-{bg,fg,edge,dot}`（新增）
- 章節密度：`--symbol-density-{low,mid,high,peak}`（新增）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：
- 已接：#15a 列表 / #15b 出現紀錄 / #15c 共現詞
- 本次新接：#15d SEP（保留供後續顯示更詳細證據；目前僅作可選資源）/ #15e 觸發詮釋 / #15f 詮釋 polling / #15g 取得 interpretation / #15h HITL 審核

#### 元件位置

- 主頁：[`frontend/src/pages/SymbolsPage.tsx`](../frontend/src/pages/SymbolsPage.tsx)
- 元件：[`frontend/src/components/symbols/`](../frontend/src/components/symbols/)
- CSS：[`frontend/src/styles/symbols.css`](../frontend/src/styles/symbols.css)（`.sym-*` prefix）
- API caller：[`frontend/src/api/symbols.ts`](../frontend/src/api/symbols.ts)
- Hook：[`frontend/src/components/symbols/hooks/useSymbolInterpretationTask.ts`](../frontend/src/components/symbols/hooks/useSymbolInterpretationTask.ts)

---

### 3.10 建構概覽頁 `/books/:bookId/unraveling`

#### 功能目的

1. **可見性**：讓用戶清楚知道「這本書被分析到了什麼程度」（含全局完成度 %）
2. **診斷性**：功能不可用時，可來此確認哪個資料層、哪個上游節點尚未建立
3. **依賴關係的呈現**：DAG 反映建構依賴——同層平行，依賴方向左→右
4. **行動引導**：選取節點後可直接跳轉到對應頁面（symbols / characters / events / timeline / tension），未來可觸發對應建構 pipeline

#### 版面結構（重設計 Direction A · Diagnostic Dashboard）

```
┌────────────────────────────────────────────────────────────────┐
│ Summary Strip（頂部，flex-shrink: 0）                          │
│  ├─ 大百分比 + complete/partial/empty 計數                      │
│  └─ Stacked bar + 5 個 Layer chips（L0–L4 進度）                │
├────────────────────────────────────────────────────────────────┤
│ DAG Canvas（flex 1）              │ Inspector（360px）          │
│  └─ Cytoscape preset layout      │  ├─ 預設：層次清單           │
│     pan/zoom + 浮動 toolbar       │  └─ 選中後：節點細節         │
└────────────────────────────────────────────────────────────────┘
```

舊版的 220px 左側 `InfoPanel`、底部 `Legend` 浮層已移除；其功能由 Summary Strip 與 Inspector 取代。

#### Summary Strip

- 左側：`{pct}%` 完成度（大字體）+ 子標題（`complete / partial / empty` 計數 + 總節點數）
- 右側：14px 高 stacked bar（complete + partial + empty 三段）+ 5 個 Layer chips（L0–L4 各自進度條 + `complete/total` 計數）；點 chip 等同選中該層第一個節點

#### Inspector — 預設「層次清單」

依 Layer 0–4 分組顯示所有節點，每列含狀態點、節點名稱、sub-label（依 nodeId 顯示計數，如 `9 / 12 章`）。點任一節點切換到「節點細節」。

#### Inspector — 「節點細節」

- Header：節點名稱 + `L{n} · {nodeId}` + 狀態 badge
- **Progress card**（僅在節點有意義 `numerator/denominator` 時顯示）：大數字 + 進度條
- **章節分佈 sparkline**（僅 5 個支援的節點：`paragraphs / summaries / keywords / kg_event / symbols`）：12-bar mini chart，資料來自 #19b
- **行動區**（status ≠ complete 時）：
  - 若有未完成上游依賴：顯示 blocker chips + disabled CTA「需先完成上游 N 個依賴」
  - 否則：disabled CTA「觸發建構功能規劃中」（Backlog #7 視覺占位）
  - 若節點對應某書內頁面：顯示 secondary CTA「前往對應頁面瀏覽」（連結至 graph / symbols / characters / events / timeline / tension）
- **原始計數**：`counts` raw key/value 列表
- **附加資訊**：`meta` raw key/value 列表

#### DAG 節點層次

| Layer | 節點名稱 | 形狀 |
|-------|---------|------|
| 0 — Text Layer | Book Meta / Chapters / Paragraphs | diamond |
| 1 — KG Layer | Summaries / Keywords / Symbols + KG compound（Entity / Concept / Relation / Event / Temporal Relation） | rectangle |
| 2 — Analysis | CEP / EEP / TEU / SEP | round-rectangle |
| 3 — Derived | Character / Causality / Impact / Tension Lines / Symbol / Narrative / Hero Journey / Temporal / Voice Profile | round-rectangle |
| 4 — Synthesis | Tension Theme / Chronological Rank | round-rectangle |

#### 節點狀態

| 狀態 | 顏色（Warm 主題） |
|------|----------------------|
| `complete` | 橄欖底橄欖框 |
| `partial` | 赭黃底赭黃框 |
| `empty` | 紙面底 hairline 框 |

`--status-*` token 在兩主題各自定義（Ink 以 fill 極性＋線重承載完成度）；詳見 [`docs/DESIGN_TOKENS.md`](DESIGN_TOKENS.md)。

**已實作**：
- 全局進度 Summary Strip
- 點擊節點 → Inspector 切到節點細節（含進度、章節分佈、blockers、跳轉 CTA）
- DAG 內 highlight + fade 鄰居節點

**規劃中（Backlog）**：
- Backlog #7：CTA「觸發建構」實際呼叫對應 pipeline endpoint
- 章節分佈擴展到 `kg_entity` / `kg_concept`（需 domain model 加上 chapter linkage）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：
- #19（建構概覽 manifest）
- #19b（章節分佈，用於 NodeDetail panel）

---

### 3.11 方法論頁 `/methodology`

> **2026-05-30 重新設計**：原 `/frameworks` 重新定位為 **Methodology（方法論）** 頁面，作為整套分析方法的說明與教育中心。「方法論」「Methodology」皆為暫定佔位名稱，等產品語言確定後一起調整。設計交接見 `methodology-page/` 設計包。

全站層級，不屬於任何書籍。**三欄閱讀結構**：

```
[Left Sidebar 48px] [方法論導覽 262px] [主內容 flex] [本頁目錄 188px]
```

- **左欄方法論導覽**：依分析類型分群（角色分析 / 敘事弧 / 張力 / 象徵），每群可收合（搜尋時自動展開）；首項為「總覽」入口。
- **主內容**：總覽頁顯示分類卡 + 方法列；點任一方法進入單一方法頁。
- **頂部分頁**：理論與方法（About）/ 跨書查閱（Cross-book）；流程型方法（如 SEP）自動停用跨書分頁。
- **右側本頁目錄**：sticky 錨點 TOC，scroll-spy 高亮當前章節。

#### 單一方法頁閱讀流程

引言 → **概念架構**（每個方法獨立設計的概念圖）→ 類型一覽（卡片網格）→ 系統如何分析（pipeline + 輸出欄位）→ **分析品質與信心值**（amber 誠實說明框 + 三層級唯讀說明）→ 參考文獻。

| 方法 | 概念圖 |
|------|--------|
| Jung 原型 | 12 原型輪盤 + 4 動機取向象限 |
| Schmidt 類型 | 性別對偶雙欄（8 女性 + 8 男性 + 配角／反派 = 45） |
| 英雄旅程 | 12 階段環形圖（平凡／非常世界雙半球） |
| Frye 四季神話 | 四季 × 四神話圓環 |
| Booker 七情節 | 七條「故事形狀」曲線 |
| SEP 象徵分析 | 資料層 → 詮釋層狀態流程（含 HITL 退回回饋線） |

#### 信心值說明（amber 誠實框）

刻意保留的設計重點：信心值是 LLM 推論當下的自我評估，非可逐項稽核的確定性公式。三個層級為唯讀說明（已確立 / 推定 / 暫定），**頁面內不提供滑桿類互動**——避免暗示信心值是可計算的。

#### 跨書查閱（Coming soon）

當前為佔位空殼，標「即將推出」。需接後端真實聚合結果，計劃支援列表與矩陣兩種視圖、右側細節面板。

#### 從角色分析頁跳入

```
/methodology?framework=jung     → 自動選中 Jung 原型（About 分頁）
/methodology?framework=schmidt  → 自動選中 Schmidt 類型
```

#### 元件位置

| 區塊 | 位置 |
|------|------|
| 頁面入口 | `frontend/src/pages/MethodologyPage.tsx` |
| 概念圖（六種） | `frontend/src/components/methodology/ConceptDiagram.tsx` |
| 範圍 CSS | `frontend/src/styles/methodology.css` |
| 資料來源 | `frontend/src/data/frameworksData.ts`（含 `pipeline / output / categoryId / crossBook`） |

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

以**卡片選擇器（card picker）**呈現兩個主題（Warm / Ink），每張卡片顯示：
- 主題名稱
- 簡短描述
- 縮圖色塊預覽：四段等寬色帶 `--bg-primary` / `--bg-secondary` / `--bg-tertiary` / `--accent`（設計 kit `.ss-theme-swatch` 規格）

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

### 3.14 敘事結構頁 `/books/:bookId/narrative`

張力（3.8）、符號（3.9）之外的第三條平行分析線。i18n namespace 為 `analysis.json` 的 `narrative.*`。頁面為單欄垂直捲動，分兩個 section：上方英雄旅程主視圖（佔大部分），下方情節骨幹摘要次區塊。

#### 版面結構

```
[英雄旅程區塊 — 主視圖：標題列 + HITL + 佈局切換器 + 選定佈局]
[情節骨幹摘要 — 次區塊：比例條 + 統計 + 核心事件骨幹 + 跳轉]
```

#### 英雄旅程主視圖（`HeroJourneySection`）

- **標題列**：「英雄旅程」h2（serif）+ 副標（Campbell · Vogler 12 階段）；下方為「已映射 N／12 階段」+「缺席的階段是有意義的敘事選擇，而非未完成」原則註記。右側為**書級** HITL：核可 / 標記不適用 按鈕 + ReviewBadge（走 #21l）。
- **佈局切換器**：segmented control，四種佈局並存可切換：
  - **A 水平軌跡（`LayoutTrack`）**：departure→initiation→return 三相位橫向流，12 階段 disc + 底部詳情抽屜。
  - **B 三相位分欄（`LayoutColumns`）**：三欄堆疊階段列 + 右側固定詳情面板（360px）。
  - **C 圓環循環（`LayoutRing`）**：Campbell 環形 monomyth，中心顯示選定階段詳情，虛線分隔平凡／特殊世界。
  - **D 章節對位帶（`LayoutBand`）**：甘特式條帶（x 軸＝章節），一眼可見階段重疊與缺席。
- **三態視覺語言**（一眼可區分，不用進度條語意）：
  - `filled`（conf ≥ 0.6）：accent 填色，深淺隨 confidence 加深。
  - `low`（0 < conf < 0.6）：警示三角（`--color-warning`）+ 虛線邊框。
  - `absent`（chapter_range 空）：虛線空殼顯示「—」，不留空白。
- **點擊展開詳情（`StageDetail`）**：相位 + 章節 + 階段名 + 狀態徽章 + confidence meter + 系統詮釋 notes + 代表性 Kernel 事件 pill + 理論描述／敘事功能（理論文案取自 `frameworksData.ts` hero_journey，localized）。
- **Legend**：filled / low / absent 三態圖例。

#### 情節骨幹摘要（`PlotSpine`）

- 標題列 + 分類來源 chip（啟發式／LLM／人工驗證）+ ReviewBadge。
- Kernel / Satellite / Unclassified 比例條 + 計數 + 總事件數。
- 核心事件骨幹：依章節排列的 kernel 事件時間線（上下交錯標籤）。
- 底部「前往事件分析頁」跳轉（Kernel/Satellite 細節在事件分析頁）。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#21e（觸發英雄旅程）、#21f（polling）、#21k（取 NarrativeStructure）、#21j（kernel-spine）、#21l（HITL 書級審核）。封裝於 `frontend/src/api/narrative.ts`。

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
7. **建構概覽 — 觸發互動**：在 UnravelingPage 的 Detail Panel 內直接觸發對應 pipeline 建構。
8. **時間軸 — 因果鏈聚焦模式**：toggle 僅顯示 `relation_type = causes` 的邊與相關事件。
9. **時間軸 — 角色弧線模式**：選定角色後，僅顯示該角色參與的事件。
10. **設定頁大改版**：當前 KG backend 切換方式過於技術導向，未來改為更清晰的儲存後端設定模式，或由系統自動管理。
11. **ChatWidget 擴充**：目前為 WebSocket 連線，未來可考慮整合書籍文本搜尋、圖譜查詢能力，讓 AI 助手能主動引用書中原文。
