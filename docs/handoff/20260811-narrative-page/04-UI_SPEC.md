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
> 2026-07-17 canvas 對稿翻新：角色總覽 landing（排行/象限雙視圖）、清單排序與提及量 bar、ego-network、弧線時間軸、認知游標雙軌聚合、認知對照 drawer、生成中 checklist、原型篩選。計畫見 `docs/plans/20260716-character-page-revamp.md`，canvas 存檔於 `docs/handoff/20260716-character-page/design-return/`。

#### 版面結構

```
[Left Panel 268px] [Content Area flex (relative — drawer overlays here)]
```

#### Left Panel — 角色清單

由上至下：

1. **框架選擇**：Jung 12 / Schmidt 45 chip + 「對照 Jung vs Schmidt」按鈕（觸發 drawer）+「框架索引 ↗」連結
2. **原型篩選 dropdown**（`ArchetypeFilterDropdown`，2026-07 新增）：可搜尋多選 popover，列出當前 framework 的原型分類與各原型已分析角色數；選中值以可移除的 accent pill 呈現，只過濾「已分析」清單；切換 framework 時重置
3. **「← 角色總覽」返回鈕**（選中角色時顯示，2026-07 新增）：全寬、`--bg-secondary` 底、accent 字；點擊回到角色總覽 landing（清空選中角色）
4. **搜尋欄**：即時篩選，placeholder 顯示總人數
5. **清單**（可捲動）：分「已分析」/「尚未分析」兩組

清單 item（卡片式，2026-07 對齊 canvas：兩行制，無文字 meta 行）：
- 已分析：依名字首字 hash 出 entity 配色頭像 + 名稱（serif）+ 名稱旁綠色狀態點（partial 為 warning 色），第二行為提及量迷你 bar（寬 `6+94·√(mentions/max)`%，accent）+ 右側 tabular 純數字提及數
- 未分析：muted 頭像 + 名稱（淡色），第二行為 muted bar + 純數字提及數，右側「建立」按鈕
- 兩組皆依 `mentionCount` 降冪排序；搜尋同時比對名稱與當前框架原型名
- 鍵盤：`↑/↓` 移動選取並載入、`/` 聚焦搜尋、`1/2/3` 切 primary tab（焦點在輸入框時不攔截）

#### Content Area — 角色分析內容

頂部固定一條 **Tip Ribbon**（首次進入顯示，localStorage `storysphere:tip-dismissed:character-analysis` 永久 dismiss）。

**未選取角色時（角色總覽 landing，2026-07 重做，取代舊版「快速前往已分析角色」）**：
- 標頭：「角色群像」h1 + meta 計數列（N 位角色 · 已分析 · 未分析）+ 右側兩顆分層批次鈕（「先生成前 10 位要角」outline / 「生成全部」solid accent，皆先跳 `ConfirmDialog`）；批次執行中於標頭顯示簡易進度（沿用 batchTask polling）
- Segmented toggle 切「定位象限」（預設）/「提及量排行」
- **定位象限**：SVG 散點圖 + 右欄派系圖例卡；X = normalized log10(mentionCount+1)、Y = normalized pagerank（#6e `character-metrics`）、泡泡半徑 = 關係數（degree，上限封頂）、顏色 = 派系（#6d `factions`，無派系 = 透明+muted 描邊）；兩軸中位數虛線十字；提及前 8 名恆顯示 label，其餘 hover 顯示；metrics 端點失敗時降級顯示錯誤佔位（排行視圖不受影響，只依賴 #6a）
- **提及量排行**：Hero 卡（提及最高者，已分析→「查看分析」/ 未分析→「建立核心角色分析」）+ 排行列（預設 11 列 + 展開/收合）
- 元件：`frontend/src/components/analysis/overview/`（`CharacterOverviewLanding.tsx` / `QuadrantView.tsx` / `RankingView.tsx`）

**標題列**：角色名（serif 28px）+ Framework badge（顯示當前 framework + primary archetype，不可點擊切換）+「提及 N 次」meta（取代舊版 `Ch.X`，2026-07 隨 #0 提及數修復同步更新）+「在圖譜中查看 ↗」+「框架對照」+「覆蓋重新生成」按鈕

**Primary Tab**（標題列下方，三選一，underline 樣式）：

| Tab | 內容 |
|-----|------|
| 人物概覽 (overview) | 4 個 sub-tab pill segmented control → 對應 4 個 pane |
| 語音風格 (voice) | VoiceProfilingPanel — 進 tab 先以 #16a `cached_only=1` 探測（200→直接顯示 / 404→空狀態+「分析語音風格」鈕；不再使用 localStorage gate）；內容為 4 stat card + ToneDistribution 堆疊條 + SentenceHistogram 直方圖 + 質性 section |
| 認知狀態 (epistemic) | EpistemicStateSection — Summary 列（「第 N 章」hero 計數 + 已知/未知/誤信 +「對照另一角色」鈕）+ 章節游標卡 + 已知/未知並排 + 誤信欄（三欄皆隨游標樂觀過濾） |

**Overview sub-tabs**（pill segmented control，2026-07 canvas 對稿重構）：

| Sub-tab | 內容 |
|---------|------|
| 人格 (persona) | 角色簡介（serif 段落）+ 原型卡（primary/secondary + 信心度條 + 「切到對照」+ 編號證據列）+ 個性特質 grid（`minmax(240px,1fr)`，以「：」拆詞+描述） |
| 行為 (behavior) | `cep.actions` bullet + 關鍵事件卡（依章排序，mono Ch.N + significance；名稱比對得到的事件附「在事件分析頁查看」連結，帶 `state.selectId`） |
| 關係 (relations) | **ego-network SVG**（當前角色 hub + 橢圓佈局 + 曲線邊依型別著色：敵人/盟友/下屬/成員/其他 → entity 色相，未知型別 fallback 其他；角色 target 可點切換）+ 按對象分組關係卡（「N 段」badge + 型別 pills）+ 代表引言 |
| 弧線 (arc) | 章節軸（動態 Ch.1–N）+ phase 色帶（`--narrative-*-border` 按索引輪替，相鄰共享邊界章時錯行堆疊）+ keyEvents marker + 可點 phase 卡（與色帶同步高亮） |

**生成中狀態**（`CharacterGenerating`，2026-07 新增）：置中 420px 卡 — spin icon + 角色名 + mono TASK ID + 進度條 + 6 步 checklist；步驟由後端 5/30/85 三個 progress 事件推導（步驟 2–5 為同一並行組），對映見元件內 `deriveStages` 註解。

**Framework 切換**：唯一入口在左清單頂部 chip；切換只影響顯示（archetype 跟著切換），不重打 API。標題列 badge 僅顯示當前框架，不可點擊。

**框架對照 Drawer**（右側 640px 抽屜）：
- 觸發點：標題列「框架對照」按鈕、PersonaPane 內 archetype section 的「切到對照」連結、左清單下方「對照 Jung vs Schmidt」連結
- 內容：2 欄並排，Jung 12 / Schmidt 45，各欄顯示 primary（accent serif）/ secondary / 信心度條 + % / 證據（左框 items）
- 關閉：點 backdrop / 點關閉按鈕 / Esc 鍵

**認知對照 Drawer**（右側 720px 抽屜，`EpistemicCompareDrawer`，2026-07 新增 #10）：
- 觸發點：認知 tab summary 列「對照另一角色」按鈕；與框架對照 drawer 同時只開一個（頁面層 `drawerOpen: null|'framework'|'epistemic'`）
- 第二角色下拉（列全部角色，預設未選；選了才打 #12e）；兩角色共用一條章節游標
- 三欄集合差（**以 event id 運算**）：「只有 A 知道」(accent) /「都知道」(success) /「只有 B 知道」(info)，各欄計數 + 事件列
- B 側資料 loading / `dataComplete=false` 時顯示對應提示不噴錯

**Chapter Timeline（Epistemic tab，2026-07 重構）**：
- 拖曳游標更新章節；**200ms debounce** 後才打 epistemic API；拖曳期間以最近一次的回應做樂觀更新（filter `chapter <= cursor`，三欄一致）
- 雙軌 marker：已知綠 pill 於上軌、未知 warning pill 於下軌，**同章多事件聚合為一顆帶數字的 pill**（hover title 列事件名）；只顯示 ch ≤ 游標的 marker
- 拖曳用原生 `<input type="range">` overlay（保留鍵盤/aria 可存取性，canvas 的 pointermove 版之有意偏差）
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

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#6a（角色清單）、#6c（重新生成）、#6d（派系，角色總覽象限視圖顏色）、#6e（角色中心性，角色總覽象限視圖 Y 軸/泡泡大小）、#7a（角色分析詳情）、#7b（觸發分析）、#7c（清除分析）、#7h（批次分析，支援 `entityIds` 子集）、#8（任務 polling）、#12e（認知狀態）、#16a（語音風格，含新增的 toneDistribution / sentenceLengthHistogram）、#16b（清除語音風格）

#### 元件對照（檔案路徑）

| 元件 | 檔案 |
|------|------|
| 頁面 shell | `frontend/src/pages/CharacterAnalysisPage.tsx` |
| 角色總覽 landing（象限/排行雙視圖） | `frontend/src/components/analysis/overview/` |
| 原型篩選 dropdown | `frontend/src/components/analysis/ArchetypeFilterDropdown.tsx` |
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

#### 路由與選取狀態

| Query param | 語意 |
|-------------|------|
| `?event=<entityId>` | 目前選中的事件。**選取狀態的唯一來源**，重整 / 分享 / 上一頁皆保留 |

外頁深連結（符號意象頁 `InterpretationHero`、`CoOccurrencePanel`）目前仍以
`navigate(..., { state: { selectId } })` 進入；事件頁在掛載時會把它一次性遷移為
`?event=`（`replace: true`，不留多餘 history entry）。新增的跳轉一律直接帶 `?event=`。

#### 版面結構

```
[Left Panel 268px]  [Content Area flex]
                      ├─ 未選取 → 總覽落地頁（三視圖）
                      └─ 已選取 → 詳情（sticky 工具列 + 四分頁）
```

> 2026-07 翻新（Track A + B0–B6）：本節以翻新後實作為準。設計稿為 Claude Design
> 專案 `1f66900f-…` 的 `事件分析.dc.html`，計劃見
> `docs/plans/20260722-event-analysis-redesign-v2.md`。

#### Left Panel — 事件清單

由上至下：

1. **批次 EEP 面板（BatchEepPanel）**：標題 + `{已分析}/{總數} · {pct}%` + 進度條，
   接四層按鈕與一行提示：

   ```
   [一鍵生成全部 EEP]                 (primary)
   [只生成核心 (N)] [只生成本章]
   [勾選多筆]  →  [生成已勾選 (N)]
   預估耗時 約 N 分鐘 · 已分析的事件會自動跳過
   ```

   | 按鈕 | disabled 條件 |
   |------|--------------|
   | 只生成核心 | `N === 0`。未分析事件的 `importance` 恆為 `null`（#6b），故在生成前 N 必為 0；tooltip 說明「重要度需生成 EEP 後才判定」 |
   | 只生成本章 | 未選取任何事件時 — 章節取自當前選取事件 |
   | 生成已勾選 | 僅在勾選模式顯示，`checkedCount === 0` 時 disabled |

   勾選模式的 checkbox 出現在清單的未分析列；狀態由頁面持有（面板要計數、清單要渲染）。

2. **搜尋欄**
3. **篩選 chip**：`核心 K` / `衛星 S` / `倒敘` / `預敘` / `平行`（重要度未定不設篩選項）
4. **分組切換**：`章節序` / `重要度`
5. **分組清單**（可捲動、可折疊）：組標題顯示 `{總數} · 已析 {n}`；
   列 = 重要度徽章 + 事件名 + `Ch.N · 敘事模式` + 狀態點（綠=complete / 琥珀=partial / 空心=未分析）

**批次執行中**：spinner + 進度條 + 階段 chip + 生成/跳過/失敗統計；完成後摘要 toast。

#### Content Area — 總覽落地頁（未選取事件）

標題「事件圖景」+ 統計（總數 / 已分析 / 未分析 / 核心）+ 研究者導覽 ribbon（可關閉，
dismiss 記於 localStorage）。整本未分析時另有引導橫幅直接觸發批次生成。

三個視圖以 segmented control 切換，預設「故事骨幹圖」：

| 視圖 | 內容 |
|------|------|
| **故事骨幹圖** | X＝章節順序、縱向分帶＝重要度（`核心 K` 在上、`衛星 S` 在下，中央虛線上為重要度未定者）、圈色＝敘事模式、虛線圈＝尚未分析。每帶高度依該帶最密集的章節撐開，節點以 px 定位，任意密度都不重疊 |
| **重要度排行** | 主排序＝重要度（核心優先）、次＝參與者數、再次＝章節序。hero #1 卡 + 列表，長條＝參與者數 |
| **事件脈絡** | 見下方「事件脈絡與鄰接」 |

#### Content Area — 詳情（已選取事件）

**Sticky 工具列**：`返回總覽` 置左；`對比` / `在圖譜中查看` / `覆蓋重新生成` 置右
（partial 時另有 `重試失敗部分`）。「對比」僅出現在此處，總覽不提供入口。

**標題列**：事件名（serif）+ 重要度 pill，meta 列為 `Ch.N · 敘事模式 · impTagline`，
partial 時附「部分分析」徽章。其下為研究者導覽 ribbon。

**四分頁（EventAnalysisDetail）**：

| 分頁 | 內容 |
|------|------|
| 概覽 | 主題意義 + 摘要 hero、事件前後狀態、參與者角色（含色彩圖例） |
| 因果與影響 | 因果分析（根因 / 因果鏈 / 摘要）、影響分析（含 `failedParts` 降級態）、因果因素與後果 |
| 上下文位置 | 見下方「事件脈絡與鄰接」 |
| 證據 | 關鍵引言、關鍵詞（`eep.topTerms` 降冪取前 12） |

**未分析事件**：重要度徽章 + `Ch.N · 敘事模式` + 事件名 + 說明 +
**原文段落預覽**（#7i，見下）+「建立分析」。

**事件對比（EventCompareDrawer）**：右側 drawer，兩欄各一個原生 `select`
（只列已分析事件），並排比較前後狀態與參與者影響。已分析事件少於 2 個時入口 disabled。

#### 事件脈絡與鄰接

「鄰接」的定義與後端一致：**共享至少一個參與者、且位於較早／較晚章節的事件**。
這是人物時間線的鄰接，**不是因果推斷**，文案一律不得稱之為因果。

前端不讀 EEP 存的 `priorEventIds` / `subsequentEventIds`，改由 #13a timeline 的
`participants` 即時計算——語意相同，但一支 query 就涵蓋全書，且排序所需的
「共享了哪些人」一併取得。

**排序規則**（`overview/eventAdjacency.ts`）：

1. 章節鄰近度遞增；
2. 同距時比 IDF 權重 `Σ 1/log(1 + 該人物出現的事件數)` — 共享稀有人物比共享
   hub 人物更有訊息量。（單純比「共享人數」無效：實測絕大多數並列於 1。）

**截斷**：詳情「上下文位置」每側顯示前 3 + 「還有 N 個」展開。hub 人物會讓原始
鄰接數達 40+，全列無意義。

**總覽「事件脈絡」視圖**：每步取排序最前的後續事件，因此串接是確定性的；僅串接
已分析事件，並過濾長度為 1 的單點。無足夠鄰接時顯示空狀態。

#### 原文段落預覽（#7i）

事件沒有任何 chunk / 文字位置欄位，因此原文是**檢索**而非查表：以
`"{title} {description}"` 對本章段落做向量檢索。UI 顯示章節、相似度分數與說明，
明確標示為「最相關段落」而非正規出處。不設分數閾值——判斷交給讀者，
這正是此功能的用途。

#### 狀態流程

```
進入頁面
  → 載入事件清單
  → 依 ?event= 還原選取；無此參數則顯示總覽落地頁

點擊事件（清單 / 骨幹圖節點 / 排行列 / 脈絡節點 / 上下文卡片）
  → 寫入 ?event=（push，可用上一頁退回）
  → 已分析 → 載入 #7d 詳情；未分析 → 顯示原文預覽（#7i）與「建立分析」

點擊「返回總覽」
  → 清除 ?event= → 回總覽落地頁

點擊「建立」（未分析事件）
  → 觸發分析 → polling → 完成後更新清單 + 填入內容
  → 生成期間暫停 #7d query（分析尚未存在，打了只會 404）
  → #7d query 另有「該 id 在 analyzed 清單裡」的 gate，避免選到未分析事件就噴 404

點擊「覆蓋重新生成」
  → ConfirmDialog → 直接以 mode='full' 重觸發（#7e）→ polling
  → 不預先 DELETE：#7e 的 full 已是 force_refresh，新結果寫入時才覆蓋，
     失敗則舊 EEP 完整保留

批次生成（全部 / 只生成核心 / 只生成本章 / 已勾選）
  → 確認視窗（全部）或直接觸發（子集）→ #7g 帶 eventIds
  → polling → 進度即時更新清單 → 完成：顯示摘要 toast
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#6b（事件清單）、#6c（重新生成）、#7d（事件分析詳情）、#7e（觸發單一分析）、#7g（批次 EEP，支援 `eventIds` 子集）、#7i（來源段落檢索）、#8（任務 polling）、#13a（timeline，供參與者數與鄰接計算）

> #7f（清除分析）自 2026-07 起本頁不再呼叫（見上方「覆蓋重新生成」）。endpoint 與
> `api/analysis.ts` 的 `deleteEventAnalysis` 都保留未動。

---

### 3.6 知識圖譜頁 `/books/:bookId/graph`

> 2026-07 全面翻新（Phase 1~6）：本節以翻新後實作為準。設計 brief 見 `docs/plans/20260718-kg-redesign-brief.md`、實作計劃見 `docs/plans/20260718-kg-redesign-implementation.md`。前身 V1（2026-05-17，計劃 `docs/plans/20260517-kg-page-redesign-v1-impl.md`）僅供沿革參考。翻新零新增後端端點。

#### 版面結構

```
[Toolbar]                                                     [未連結實體抽屜]
                       [圖譜 Canvas（全幅）]                       [右側面板]
                                                                    [Stats]
[Lens]  [Legend 底部橫條]                                          [MiniMap]
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

#### LegendCard（底部橫條，LensCard 右側）

2026-07-20 依設計稿改為**底部橫條**（LensCard 右側，`bottom:16 / left:348`），非右上角直式卡。純說明、不可點（型別開關唯一入口是工具列 filter chips，C6）：
- 第一列：**完整 7 個 entity types**（角色/地點/組織/物品/概念/事件/其他，設計 contract 規定不得只列 4 類子集）swatch＋標籤，**不含計數**（依設計稿）
- 第二列：邊語意（合作＝success／敵對＝error／一般＝fg-muted／推測＝warning dashed）＋節點大小示意（○◯ 圓圈大小＝登場頻率）

swatch 為圓點（`--graph-*-fill` 底 + `--graph-*-stroke` 框）。孤兒實體改由右上「未連結實體」抽屜負責（Phase 1）。

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
> 設計交付包見 `docs/handoff/20260725-timeline-page/`（Claude Design 決策稿）
> 工程分期見 [`docs/plans/20260725-timeline-page-enhancements.md`](plans/20260725-timeline-page-enhancements.md)
> **本節於 2026-07-27 全頁重做後改寫**；V2（2026-05-19）的版面已不再存在。

#### 這一頁要回答什麼

**作者敘述的順序（sjuzhet）與故事實際發生的順序（fabula）差在哪裡。**
全頁的視覺重心都放在這個落差上，其量化形式是每筆事件的 `deviation`：

```
expectedRank = index / (N - 1)          // 若兩種順序完全一致，rank 應該是多少
deviation    = chronologicalRank - expectedRank
outlier      = |deviation| > 0.15       // OUTLIER_THRESHOLD
```

實作於 `frontend/src/lib/timelineGeometry.ts`（純函數，有單元測試）。
`narrativeMode` 一律**由 deviation 推導**，不使用後端回傳的 `narrativeMode` 欄位——
後端在種子書上 100% 回傳 `present`，不帶訊號。

#### 版面結構

```
[ViewTabs 三視圖（等寬，附副標）              ← → 切換事件 · Esc 關閉]
[Toolbar 四段：顯示範圍 | 篩選資料 | 疊加層 | 分析動作]
[畫布 flex]                                   [事件詳情面板 320px]
[角色軌跡泳道（疊加層，可關）]
```

**資料取得**：三個視圖共用**同一份 `order=narrative` 的 payload**，故事時序與矩陣皆由
前端依 `chronologicalRank` 推導。`index`（事件在書中的位置）是譜與泳道的 X 軸，
必須跨視圖恆定；若改抓 `order=chronological` 會讓同一批事件換一組 index，泳道會整體位移。

**無 rank 時不上鎖**：`chronological_rank` 為 null 是**常設的一類事件**（種子書算完仍有 16%），
不是過渡態。三個視圖各自有明確位置放它們（見下），因此不再 disable 視圖卡、不再有 `LockedView`。

#### 3.7.1 工具列（四段，依「代價」分組）

```
顯示範圍          篩選資料              疊加層        分析動作  會呼叫 LLM 逐段判讀…
[全部 62|僅已分析 13] [☰ 篩選 (n)] 符合 N/共 M  [角色軌跡·開]  ● 故事時序   已完成 52/62        [覆蓋重新計算…]
                                                                重跑數分鐘 · 會覆蓋既有 52 筆排序
                                                              ○ 倒敘與預敘 尚不可執行 · 需 60%…目前 15%  [識別倒敘與預敘…]
                                                                故事時間提示要在事件分析頁逐筆補…→
```

前三段是免費、即時、可逆的；第四段是**數分鐘 + token + 不可逆**。這是分段的唯一理由。

**ActionRow（`.tl-action-row`）固定五欄結構**：`狀態點 · 名稱 · 兩行狀態文字 · 動作鈕 · 進度軌`。
- **狀態文字必須兩行**：第一行狀態＋進度，第二行成本或阻擋原因。可用寬度僅約 314px，
  單行 flex 會把任何真實文案截斷。
- **`…` 後綴 = 會先出確認框**（`ConfirmDialog`，與事件頁／角色頁同一元件），
  對話框內揭露影響範圍、時間、token 與「不會變動的東西」。
- **執行中**：列底緣 3px **實心** `--accent` 進度軌（寬度＝百分比），按鈕換成「中止」。
  **不可用半透明色塊覆蓋整列**——Ink 主題下 `--accent` 近黑，35% 疊上淺底會讓
  `--fg-muted` 文字對比掉到約 1.4:1。
- **阻擋原因寫在畫面上**，不是 tooltip；可點時導向解阻擋的頁面。

⚠️ **「倒敘與預敘」的解鎖條件是 `coverage_sufficient`（storyTimeHint ≥ 60%），
不是「故事時序跑完」**。兩者資料來源不同，跑故事時序**不會**提高 storyTimeHint 覆蓋率。
文案必須說清楚這件事（`timeline.action.displacementUnblock`）。

**過期提示**：`temporalIsStale=true` 時，該列 status 改顯示
`timeline.action.displacementStale`（帶入 `temporalStaleReason` 的步驟名），取代
原本的「已完成 N 個倒敘／預敘」。**不另加橫條**——重跑按鈕就在同一列，另開一個
提示區塊等於同一動作有兩個入口。

> 按鈕外觀：`.tl button` 的頁面級 reset 已收斂為 `.tl button:not([class])`，
> 否則其特異性 (0,1,1) 會蓋掉 `.tl-btn` (0,1,0) 的 border 與 background，
> 造成「靜止時是裸文字、hover 才像按鈕」。這是 V2 的已知缺陷，已修正。

#### 3.7.2 篩選（兩種顯示模式，皆保留）

popover 內含五個 AND 疊加的分區（事件類型 / 敘事模式 / 重要性 / 角色（含搜尋）/ 地點），
每個選項標示命中筆數；地點在真實資料中為空，該區自動隱藏。

**顯示模式二選一，但兩者都要有**：
- **淡化其餘（dim，預設）**——保留全部事件的位置，不符合的降透明度。
  在譜上尤其有用：看得出被排除的事件原本落在哪裡。
- **只顯示符合項（only）**——不符合的整批移除，長書才讀得動。
  譜上被移除的點會**中斷連線**（不跨洞連線，那會暗示不存在的相鄰關係）。

**S18 篩選結果為空**：整個畫布換成 `沒有事件同時滿足這些條件` + 條件數 + 清除按鈕。

#### 3.7.3 視圖 A — 章節順序（雙軌譜 + 章節卡片帶）

**雙軌譜（`TimelineStave`）** 是這頁的識別度所在：

- X = 段內敘述順序線性映射；Y = `MID - deviation × SCALE`（MID 26px、SCALE 38）
- 中線（`1px dashed`）代表 deviation = 0，即「兩種順序一致」；下方＝倒敘、上方＝預敘
- **行數由事件數推導**（`ceil(n / 22)`，62 筆＝3 行），不寫死
- 點：KERNEL 較大、已分析實心 / 未分析空心、outlier 用 `--accent`
- 連線與中線以 **SVG** 繪製（`x1="2%"` 這類百分比座標），不用旋轉 div——免除旋轉數學且 resize 免重算
- **章節帶**可點＝換章，且**涵蓋被篩選濾空的章節**（章節是導覽目標，不能因篩選消失）
- **註記**：每章最多一條、取偏離最大者，避免 62 節點上鋪滿文字
- **未排序帶**：`rank === null` 的事件放在該行底部 13px 的點線帶內；該行沒有就不渲染

**章節卡片帶**一次只顯示一章。已分析事件出卡片；未分析的收進右側 196px 清單
（顯示裝得下的 4 筆 + 明確的「展開其餘 N 筆」，**不可靜默截斷**）。
卡片摘要 `-webkit-line-clamp: 2` 且必須 `flex: none`，否則 clamp 盒會被 flex 壓縮、第二行被切一半。

#### 3.7.4 視圖 B — 故事時序

依 rank 升序切成 4 欄；每列 `序號 · 標題 · Ch.N`，outlier 的章號用 `--accent`。
底部**未排序托盤**放 `rank === null` 的事件（4 顆 chip + 「＋其餘 N 筆」，點了套用篩選帶出全部）。

#### 3.7.5 視圖 C — 矩陣視圖

**軸編碼是這張圖的資訊本體，不可改**：X = 章節（離散）、Y = `chronological_rank`、
45° 對照線 = 「敘述順序 = 故事順序」、未排序事件在繪圖區下方的 degraded 帶。

**beeswarm 偏移解 overplotting**：同章事件共用 X，會疊成一柱（種子書 Ch.2 疊 11 顆、無法點擊）。
偏移量 `(k % 2 ? -1 : 1) × ceil(k / 2) × spacing`，**`k` 必須按章計數**——
用全域索引會讓同章的點拿到相同偏移，等於沒散開。

> V2 的 d3 實作、頂部密度直方圖、Genette 著色 toggle、框選皆已移除。

#### 3.7.6 角色軌跡泳道（疊加層）

**是疊加層，不是第四張視圖卡**——它加的是同一條 X 軸的第二種讀法（誰在場、誰缺席），
不是時間軸的替代品。上限 3 位角色，預設帶入出場數最高的 3 位。

- **X 軸用 `index`（敘述順序），不用 rank**：rank 可能為 null，軌道會出現分不清是缺席還是缺資料的洞
- 章節刻度**對齊該章第一筆事件的索引**，不可用等寬欄——會與軌道上的點錯開
- 缺席區間：連續 ≥ 3 筆才算；**說明文字放在軌道下方專屬的 16px 註記帶**，絕不壓在點上；
  區間寬度 < 9% 時不標
- 底部「同框」列：所有選定角色同時在場的事件

#### 3.7.7 事件詳情面板（320px）

`Ch.N 章名 · 類型 → 標題 → KERNEL/SATELLITE/尚未分析 → 概要 → 參與角色 pills
→ 時序（rank / 敘述位置 / 偏離描述 / 敘事模式 chip）→ 前往閱讀該段落 · 在知識圖譜中查看`。

- 「前往閱讀該段落」走 `useSourceJump`（章節 scope），與角色頁／事件頁同一條動線
- **不再有「時序關係」區塊**：它讀的 `priorEventIds` / `subsequentEventIds` 語意是
  「共享參與者且位於較早／較晚章節的事件」，既非因果也非時序。在一個主打時序的頁面上
  這樣標示比事件頁更誤導，因此**移除**而非改名（事件頁已於 PR #18 正名為「上下文位置」）。
  **全頁文案不得出現「因果」「前驅／後續」指涉這組資料。**
- 約八成事件未分析，**未分析才是這個面板的主要狀態**

#### 3.7.8 狀態涵蓋

| 狀態 | 呈現 |
|------|------|
| 首次載入 | spinner + 依視圖不同的文案 + 三塊 skeleton |
| 背景重取 | 畫布上方浮出膠囊指示器，工具列與視圖不消失 |
| 載入失敗 | 錯誤標題 + 說明 + 重試 |
| 無事件 | `TimelineOnboardingHero`（三步引導卡） |
| 篩選為空 | `沒有事件同時滿足這些條件` + 清除 |
| 命中項全無 rank | 專屬狀態：列出那些事件為可點 chip + 兩條出路（清除篩選／重算時序） |
| 該章被濾空 / 整章未分析 | 章節卡片帶內的兩種空狀態，各帶對應 CTA |

#### 樣式檔案

`frontend/src/styles/timeline.css`（`.tl-*` prefix）。**不新增、不修改 design token**——
本頁用到的 token 全部既有，`--narrative-*` 為跨頁共用（角色頁 `ArcPane`、事件頁），改值會同時破壞那兩頁。

#### 動效

只用 `--transition-fast` / `--transition-normal`，只過渡 `color` / `background-color` /
`opacity` / `box-shadow`。持續動畫僅 spinner 與 skeleton pulse，且 `prefers-reduced-motion` 下關閉。

#### 已知缺口

- **RWD 未做**：本輪固定 1440 基準，1280 / 1024 待另開任務（設計交付包未涵蓋這三個寬度）。
- 水平／垂直 layout 切換已移除：新骨架是固定寬的多行譜，「排列方向」不再指涉任何東西。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#13a（時間軸資料，含 `hasAnalysis`）、
#13b（觸發時序計算）、#8（任務 polling）、`/narrative/temporal/coverage`（倒敘預敘的解鎖門檻）

---

### 3.8 張力分析頁 `/books/:bookId/tension`

> 術語定義（TEU、TensionLine、TensionTheme 等）見 `docs/domain-glossary.md`。

#### 版面結構（2026-08 翻新）

```
[tn-shell（height:100%）→ tn-shell-main.tn-scroll → tn-page]
  ├─ Stepper Strip          (五段：機器步驟 ×3 + 人工關卡 ×2)
  ├─ 主體（依管線狀態四選一）
  │    ├─ EmptyCard         (尚無資料 → 三層說明 + 開始 Step 1)
  │    ├─ Step1Card         (TEU 已就緒、尚未聚合 → 章節分布 + 執行 Step 2)
  │    ├─ RunningCard       (三種進行中：組裝 / 聚合 / 合成)
  │    └─ ErrorCard         (聚合失敗 → 保留上次結果的說明 + 重試)
  ├─ Theme Hero             (theme 存在時；含過期專屬版面)
  └─ hasLines 時：
       ├─ 模式切換列         (張力線 N ⇄ TEU 逐章 M，segmented control)
       ├─ mode=lines → 章節格點 + 審核工具列 + 審核表格
       └─ mode=teu   → TEU Inspector（逐章展開，含未歸入標記）
[右側 Review Drawer（mode=lines 且有選定線時）]
[Rerun Dialog（重跑確認）]
```

CSS 入口：`frontend/src/styles/tension.css`（class prefix `.tn-*`）。
元件入口：`frontend/src/components/tension/` —— `TensionStepperStrip` / `TensionStateCards`
（Empty / Step1 / Running / Error 四張）/ `TensionThemeHero` / `TensionChapterGrid` /
`TensionReviewToolbar` / `TensionLineTable` / `TensionReviewDrawer` / `TensionTEUInspector` /
`TensionRerunDialog` / `TensionStatusBadge` / `intensity.ts` / `drawerData.ts` /
`reviewTypes.ts` / `hooks/useTensionTask`。

#### 五段 Stepper Strip（`.tn-stepper`）

翻新的核心主張：**人工關卡是一等公民**。舊版三步驟 stepper 隱含「按 1、2、3 就完成」，
但兩次人工審核才是這條管線的價值所在，因此 strip 改為五段：

| # | id | kind | 內容 |
|---|----|------|------|
| 1 | `teu` | machine | TEU 組裝（SCENE 場景級） |
| 2 | `review-teu` | **gate** | 檢視 N 個 TEU、標出未歸入項 |
| 3 | `group` | machine | TensionLine 聚合（CROSS-SCENE） |
| 4 | `review-lines` | **gate** | 逐條審核張力線（已審核 n / N） |
| 5 | `theme` | machine | TensionTheme 合成（BOOK 全書級） |

- **形狀即語意**：machine 步驟是圓形 num badge，gate 是方形——不只靠顏色區分（Ink 主題下
  success / warning / error 會塌成同一個黑）
- 寬度分配 `machine:1.15 / gate:0.95`，gate 不做成細分隔線，避免讀成「附屬品」
- `failed` 旗標在該段顯示 AlertTriangle + warning 色 note（P0-5 的最小落點；**完整的失敗
  TEU 清單未做**，見「已知缺口」）
- 已完成的 machine 步驟 CTA 為 `↻`，點擊先開 `TensionRerunDialog`，確認後才以 `force=true`
  送出。`force` 是必要的：後端在 `force=false` 時直接回快取並回報成功，畫面看起來執行過但
  毫無變化。

#### 四張管線狀態卡（`TensionStateCards`）

主體區依管線狀態四選一，取代舊版的 OnboardingHero + 空狀態文案：

| 卡片 | 觸發條件 | 要點 |
|------|---------|------|
| `TensionEmptyCard` | 無 TEU 無 lines | 三層聚合說明 + 「開始 Step 1」+ token 成本提示 |
| `TensionStep1Card` | 有 TEU、無 lines | **「N 個 TEU 已就緒」**+ 章節分布 chip；明說聚合是單次 LLM 呼叫、模型可能略過部分 TEU |
| `TensionRunningCard` | 任一步驟 running | 三種標題（組裝 / 聚合 / 合成）+ 進度；明說可離開頁面、結果會保留 |
| `TensionErrorCard` | 聚合失敗 | 錯誤訊息 + **「上次成功的 N 條仍保留在下方、未被覆寫」** + 重試 |

Step 1 跑完不再顯示「請先執行 Step 1」——舊版此處文案自相矛盾。

#### Theme Hero（`.tn-hero`）

- **Eyebrow 列**：`BOOK 全書級 · TENSIONTHEME` + `最新` badge（來自 `is_stale`）
- **命題**：serif 大字，可 inline 編輯為 `<textarea>`
- **過期態是專屬版面**（不是加一條橫條）：標題、依 `stale_reason` 分岔的說明、
  「重新合成主題」按鈕
- **`incompleteHead` 警示**：合成當下若有 n 條未審核，顯示「這些線仍以模型原始輸出參與
  合成」——資料來自 `reviewed_count_at_synth`（#14i），是合成當下的快照而非即時計算
- **支撐的張力線**：pill 列，點擊跳至對應列
- **Footer 三顆按鈕**：核准 / 改命題 / 拒絕（→ #14j）。**設計稿未畫這三顆**，
  2026-08-04 決定保留：砍掉現有可用功能應該是獨立決定，不是設計稿沒畫就順手拿掉。
  程式碼中已標註這段不在 canvas 內。
- Frye / Booker badge 設計稿亦未畫，保留在標籤列右側（`--frye-*` / `--booker-*` token）

#### 模式切換（`.tn-mode-seg`）

`hasLines` 後出現 segmented control，兩個模式常駐（不是階段性顯示）：

| 模式 | 內容 |
|------|------|
| `張力線 N` | 章節格點 + 審核工具列 + 審核表格（審核主動線） |
| `TEU 逐章 M` | `TensionTEUInspector`：場景級原始輸出，逐章展開，標出 M 個未被聚合歸入的 TEU |

#### 章節格點（`TensionChapterGrid`）

**取代舊版的 SVG 軌跡圖**。`grid-template-columns: 320px repeat(N, 1fr)`，一行一線、一格一章：

- 格子色 = `intensityBucket()` → `--tension-intensity-{low|mid|high}-*`；空格＝該章無 TEU
- 末列為**未歸入列**：聚合沒收進任何線的 TEU，附「{{list}} 整章落單」提示
- 未歸入項可展開清單（依強度排序），逐筆下拉指派到某條張力線（→ #14d-3）——
  這是「模型漏收」的人工補救出口，不需重跑 LLM

#### 審核工具列與表格（`TensionReviewToolbar` / `TensionLineTable`）

取代舊版 Summary Chip Bar + LineCard accordion：

- **工具列**：狀態 chip 過濾 + 排序（強度 ↓ / 章節 ↑ / 證據數 ↓）+ 多選後的批次核准 / 批次拒絕
- **表格 7 欄**：極點對 / 章節 / 證據 / 強度（相對）/ 狀態 / 審核
- 點任一列開右側抽屜；不再用 accordion 就地展開

#### 審核抽屜（`TensionReviewDrawer`，432px）

盲審的解方——所有判斷材料集中在一處：

- `審核中 · i / N` 位置指示，可用 J / K 在抽屜內連續移動
- **A/B 不穩定警示**：`{{total}} 則 TEU 中有 {{flipped}} 則的 A/B 與多數決相反`
  （資料來自 TEU 的 `flipped` 旗標）
- **已人工修改警示**：顯示原始標籤與修改理由（來自 `edit` 紀錄）
- **極點標籤編輯器**：只改標籤文字，不重跑 LLM、不消耗 token，證據歸屬與強度不變；
  可填修改理由寫入審核紀錄。儲存後該線標記為「已修改」
- **證據區**：逐則 TEU（章節 + 強度 + tension_description + 引文），附「回到原文 · 第 N 章」
  深連結（走章節 scope）
- 底部三顆按鈕標註快捷鍵：`核准 A` / `改標籤 E` / `拒絕 X`

> 證據**不做同場景摺疊**、不提供逐字對照。設計稿要求的 `scene_group_id` 判準在真實資料上
> 驗證失敗（B-069），誠實顯示「n 則」優於宣稱分組卻漏算。

#### 重跑確認框（`TensionRerunDialog`）

Step 2 重跑會使審核狀態遺失，因此確認框**逐項列出會失去什麼**，而非一句籠統警語：

```
會失去：{{n}} 條張力線、{{n}} 條已核准、{{n}} 條已改寫標籤
會連帶過期：全書主題命題（引用了這些線）
```

#### 鍵盤快捷鍵

`J / K` 移動　`A` 核准　`X` 拒絕　`E` 改標籤　`Space` 多選　`V` 全選　`Esc` 關閉。
快捷鍵在 `TensionPage` 以 window `keydown` 綁定，重跑確認框開啟時或 `mode !== 'lines'` 時停用。

#### 樣式與 token

`frontend/src/styles/tension.css`（`.tn-*` prefix），**無硬編色碼、未新增 token**。
Modal 遮罩是平的 `rgba(42,38,32,0.42)`，不用 `backdrop-filter`。Ink 主題必須可用。

#### 已知缺口

- **RWD 未做**：`tension.css` 目前 0 個 `@media`。設計交付包是 1440px 定寬、432px 固定抽屜、
  格點 `320px + repeat(N, 1fr)`，未涵蓋窄視窗與章節數極多的書。待決：抽屜在窄視窗改 overlay
  還是推擠、格點超過 N 章時橫捲／分頁／聚合、表格 7 欄在 1024px 怎麼收。
- **a11y 未竟**：快捷鍵與 aria-pressed / aria-label 已有，但格點的格子與 TEU 迷你柱狀圖仍是
  純視覺，鍵盤與螢幕閱讀器取不到 `tension_description`；tab order 未整理。
- **P0-5 失敗清單未做**：stepper 只有 `failed` 旗標與警示 note，沒有可展開的失敗 TEU 清單。
- zh-TW locale 中 `tension.onboarding.*`、`heroEyebrow`、`trajectory*` 等舊版遺留 key 尚未清除。

#### 狀態流程

```
進入頁面
  → 載入 TEU / TensionLine / TensionTheme（已有資料則跳過對應步驟）

Step 1 → 人工檢視 TEU → Step 2 → 逐條審核張力線 → Step 3
  → 每步驟完成後自動 refetch 對應資料
  → 重跑機器步驟一律先過 TensionRerunDialog，並以 force=true 送出

審核操作（TensionLine / TensionTheme / TEU 指派）
  → 送出審核結果 → 更新對應 query cache
```

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#14a–#14b（Step 1 TEU 組裝）、#14c–#14d（Step 2
TensionLine 聚合）、#14d-2（TEU 清單）、#14d-3（TEU 人工指派）、#14e（TensionLine 清單）、
#14f（TensionLine 審核）、#14g–#14h（Step 3 TensionTheme 合成）、#14i（TensionTheme）、
#14j（TensionTheme 審核）

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
  - 右側：出現次數 + ReviewBadge（若已有 interpretation）+ BlockBadge（若 `interpretation_block` 非 null）
    - **兩者可同時出現** —— 曾成功詮釋、後續重生成被拒。只顯示其中一個會藏掉一半狀態。
    - BlockBadge 用 `--status-partial-*`（琥珀）而非 `--color-error-*`：沒有東西壞掉、
      使用者也沒做錯事，狀態是「試過、無法完成」。紅色會讀成一個待修的故障。

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
   - **尚未生成**（`InterpretationCta`）：sparkles 圖示 + 說明 + 主按鈕「生成 LLM 詮釋」。
     文案依 `interpretationAdvice()` 的四種判定切換：`recommended` / `available` /
     `discouraged` / `blocked`。
   - **被供應商拒絕**（`InterpretationCta` 的 `blocked` 分支）：Info 圖示 + ghost 按鈕
     「再試一次」，標題明講「供應商拒絕了這個提示，不是訊號不足」，內文引用 provider
     自己的標籤（如 `PROHIBITED_CONTENT`）。
     - **`blocked` 判定優先於 load 門檻。** 拒絕落在強訊號意象上的機率與弱訊號一樣，
       若只依 load 判定，頁面會把最顯眼的推薦位給唯一產不出來的那個
       （《名字的潮汐》的「手」正是如此）。
     - **按鈕保持可點。** 拒絕是針對「當時那家 provider」記錄的，重試是這個意象在有
       可用 fallback 之後恢復的唯一途徑；禁用等於讓那筆紀錄變成永久判決。
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
| 選中且 `interpretation_block` 非 null | `InterpretationCta` 的 `blocked` 分支 |
| 選中且 polling | `InterpretationGenerating` |
| 選中且有 interpretation | `InterpretationHero`（HITL 可操作） |

> `interpretation` 與 `interpretation_block` **彼此獨立**，可同時非 null。詳情區以
> `interpretation` 優先（有詮釋就顯示 `InterpretationHero`）；側欄則兩個徽章都顯示。
> 批次勾選（`useSymbolCheck.candidates`）排除已被拒絕者，與 #15j 後端預設跳過一致 ——
> 提供一個註定被跳過的勾選框，是一個做不到的承諾。

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
  - 否則若節點有對應的建構 pipeline：主色 active CTA，文案依 nodeId × 狀態給具體動作（partial →「補齊剩餘章節摘要」、empty →「生成章節摘要」）。按下先開 token 確認視窗（見 §5.3），確認後觸發並轉為 disabled「建構中…」+ 目前 stage 與百分比；完成後自動重抓 manifest，失敗則在 CTA 下方顯示錯誤訊息並可重試
  - 否則（尚無對應端點的節點，如 `teu` / `voice_profile` / `chronological_rank` / `narrative_structure`）：disabled CTA「觸發建構功能規劃中」
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
- CTA「觸發建構」（Phase 1，12 個節點）：summaries / keywords / symbols / kg_entity·concept·relation·event / cep / character_analysis_result / eep / causality_analysis / impact_analysis

**規劃中（Backlog）**：
- B-046 Phase 2：其餘節點的觸發 CTA（tension / hero journey / temporal 端點已存在；`narrative_structure` 需先讓 classify 對缺 EEP 快取的情況安全；`teu` / `voice_profile` / `chronological_rank` 需新增後端批次端點）
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
[過期橫條 — 僅 is_stale=true 時出現]
[英雄旅程區塊 — 主視圖：標題列 + HITL + 佈局切換器 + 選定佈局]
[情節骨幹摘要 — 次區塊：比例條 + 統計 + 核心事件骨幹 + 跳轉]
```

#### 過期橫條（`.nl-stale`，`role="status"`）

僅在 #21k 回傳 `is_stale=true` 時出現，置於頁面最上方（空狀態也顯示，因為重跑
後結構可能已被判定過期但尚未重新分析）。用 `--color-warning-bg` / `--color-warning`
（既有 token，未新增），內含 AlertTriangle + 標題 + 以 `stale_reason` 帶入步驟名的說明。

**只做提示，不放操作按鈕**——引導使用者去按既有的分析觸發鈕，避免同一動作有兩個
入口（與 3.8 張力主題過期卡的原則一致）。

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
| 建構概覽頁節點 CTA「觸發建構」 | 說明即將執行的動作 + 會呼叫 LLM 並消耗 token、已完成部分自動跳過；若該步驟會重新產生實體與事件（`rerun/*`），額外聲明依賴它們的既有分析結果將被刪除 |

---

## 6. 未來備註（Backlog）

以下功能已討論或規劃，不在當前開發範圍：

1. **首頁最近開啟區塊**：後端需在用戶開啟書籍時寫入 `lastOpenedAt`，前端 render 邏輯已就緒，等後端支援即可啟用。
2. **Dark mode**：CSS token 已預留（`[data-theme="dark"]`），UI 邏輯暫不實作。
3. **閱讀頁欄 1 收合**：當欄 3 展開後，欄 1 可縮成 40px icon-only 欄，釋放橫向空間。參考 VS Code sidebar 收合邏輯。
4. **框架索引反查角色**：從原型反查書中對應角色，需配合書籍層級資料對接。
5. **全站搜尋**：sidebar 搜尋 icon 為未來功能佔位。
6. **知識圖譜 → 閱讀頁定位**：從圖譜段落面板點擊 chunk，跳轉至閱讀頁並定位對應位置。
7. **建構概覽 — 觸發互動**：Phase 1 已實作（見 §3.10）；其餘節點見 Backlog B-046 Phase 2。
8. **時間軸 — 因果鏈聚焦模式**：toggle 僅顯示 `relation_type = causes` 的邊與相關事件。
9. **時間軸 — 角色弧線模式**：選定角色後，僅顯示該角色參與的事件。
10. **設定頁大改版**：當前 KG backend 切換方式過於技術導向，未來改為更清晰的儲存後端設定模式，或由系統自動管理。
11. **ChatWidget 擴充**：目前為 WebSocket 連線，未來可考慮整合書籍文本搜尋、圖譜查詢能力，讓 AI 助手能主動引用書中原文。
