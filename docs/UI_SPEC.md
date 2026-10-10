# StorySphere — UI 規格文件 (UI_SPEC)

> 本文件為前端開發的頁面規格參考，供 Claude Code 開發時使用。
> API 對接細節見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)；本文件出現的 `#N` 均為該文件的端點編號。
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

固定在所有頁面左側，三態（`Sidebar.tsx`，樣式 `.ss-sidebar*` / `.ss-rail-*` 於 `ss-kit.css`）：

- **收合 48px**（預設）：icon-only，標籤由共用 `Tooltip`（`components/ui/Tooltip.tsx`，hover 400ms／鍵盤 focus 立即，朝右）提示。
- **浮層 180px**：游標停在頂部收合鈕上約 200ms 展開，蓋在內容上、不推擠（`--shadow-lg`）；離開側欄、按 Esc 或點選任一項即收回。
- **釘選 180px**：點頂部收合鈕（收合 → 釘選）；主內容區被推擠。再點一次（此時鈕為「收合側欄」）回到收合。釘選沿用既有的 localStorage 偏好 `sidebar-expanded`（`true` = 釘選；舊版兩態的 `true` 即推擠版面的 180px，語意相同，不需遷移）。

系統群由上而下：書庫、上傳、方法論、搜尋、任務中心、Token 用量，系統設定經 spacer 置底。任務中心是全側欄唯一的 `<button>`（開關右側任務面板），帶任務徽章：計數 = 狀態不是 `done`／`error` 的任務（含 `awaiting_review`），0 不顯示；收合態貼右上（top 1 / right 1），展開態垂直置中靠右（right 8）。

**書籍層（路由 `/books/:bookId/*`）**：收合鈕下方多一組九格書籍功能（底 `--bg-tertiary`，順序同 §2.2）與 24px 分隔線，再接系統群。視窗高度 < 632px 時系統群除「書庫」外收進底部溢出選單（`…` 鈕，標籤「更多」），九格與書庫永遠可見（書庫是離開書籍的唯一出口）；< 452px 時側欄改為可捲動，底部漸層提示還有下文。九格的定義（路由、順序、label、icon）集中在 `components/layout/bookViews.ts`，側欄與書名列共用。

| Icon | 目的地 | 路由 | 狀態 |
|------|--------|------|------|
| Home | 書庫首頁 | `/` | 已實作 |
| Upload | 上傳 & 處理進度 | `/upload` | 已實作 |
| BookOpen | 方法論 | `/methodology` | 已實作（前身 `/frameworks`） |
| Search | 全站搜尋 | `/search` | 已實作 |
| BarChart3 | Token 用量 | `/token-usage` | 已實作 |
| SlidersHorizontal | 設定 | `/settings` | 已實作 |

### 2.2 書籍層級（書名列 28px · DS v3）

進入書籍後，主內容區頂端是 28px 常駐**書名列**（`BookNav.tsx`，樣式 `.ss-booknav*`）：
`← 書庫 | 書名 › 目前功能`。書名 serif sm 600、最寬 200px ellipsis；目前功能取自 `bookViews.ts` 的 label。
**書名列不放導航**——九個書籍功能的切換只在側欄書籍群（§2.1），導航從兩處收攏成一處、上緣保持安靜
（框架 §4）。DS v3 之前這裡是 40px 的九格文字分頁列，已移除。

**右端重開鈕（第 5 批 5-1，19 決議紀錄）**：當下頁面的研究者導覽條**已被關閉**時，書名列右端
（`margin-left:auto`）出現 ghost 小鈕（`.gd-reopen`：高 20、`padding 0 space-3`、2xs、`fg-secondary`，前置 12px Lucide `Info`（`--color-info`），
hover 底 `--bg-secondary`；標籤 `settings:guidance.title`「研究者導覽」，無 toast）；導覽條開著時不出現。點＝刪掉該 surface 的 `storysphere:guidance-dismissed:<surface>`，導覽條重新出現就是回饋。
一頁兩條（`event-overview`／`event-detail`，互斥顯示）只看當下掛載的那條。`GuidanceRibbon` 掛載時向
`components/ui/guidanceStore.ts` 登記自己的 surface、卸載時取消，書名列據此判斷（不靠 props）。10 個 surface 全套。
`BookLayout` 取書失敗時書名列仍在、但沒有導覽條，所以鈕不出現。非書籍路由目前沒有任何頁使用導覽條，本批不做
（決議：屆時放頁面標題列右端，行為相同）。

九個功能（**表列順序即側欄書籍群順序**）：

| 功能 | 路由 | 側欄 icon |
|-----|------|------|
| 閱讀 | `/books/:bookId` | ScrollText |
| 角色分析 | `/books/:bookId/characters` | UserSearch |
| 事件分析 | `/books/:bookId/events` | Flag |
| 敘事結構 | `/books/:bookId/narrative` | Mountain |
| 知識圖譜 | `/books/:bookId/graph` | Network |
| 時間軸 | `/books/:bookId/timeline` | ChartGantt |
| 張力分析 | `/books/:bookId/tension` | Activity |
| 象徵意象 | `/books/:bookId/symbols` | Shapes |
| 建構概覽 | `/books/:bookId/unraveling` | Layers |

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

### 3.1 首頁 `/`（書庫 · DS v3 第 1 批）

`pages/LibraryPage.tsx`、`components/library/{BookCard,StatusBadge,RecentBookCard,libraryModel}`，樣式 `styles/library.css`（`lib-`）
與 kit `.ss-bookcard*`／`.ss-badge*`。依 01 決議紀錄 A–F frame。

#### 密度（C 入口，兩套）

| 狀態 | padding | section | card | row | max-w |
|---|---|---|---|---|---|
| 稀疏（預設） | 32 | 24 | 16 | 12 | 960 |
| 滿載（`.lib-page-full`） | 24 | 16 | 12 | 8 | 1280 |

- 書卡＋處理中任務 **> 8 張**切滿載（`FULL_DENSITY_AFTER`），以全書庫計、不隨篩選變。只換間距、欄數與封面高（90／76），
  書卡 anatomy、字級、圓角兩套相同。格線 `repeat(auto-fill, minmax(180px, 1fr))`。下內距一律 `--space-8`。

#### 由上到下

1. **標題「書庫」** serif 3xl ＋右側計數「{n} 本書 · {a} 已分析 · {r} 已就緒 · {e} 錯誤」（為 0 的狀態不列）。
2. **人工閘門帶**（只在有 `awaiting_review` 的 ingestion 任務時）：標頭「等待章節審閱」＋accent 細線；每個任務一張卡——
   BookOpen 40px 方塊、書名 serif base（不再重複「等待章節審閱」副標，標頭已說）、primary「審閱章節 →」連 `/upload/review/:bookId?taskId=…`。
   位在篩選列之上，獨立成帶。
3. **最近開啟**（有 `lastOpenedAt` 的書才出現，前 3 本、新到舊）：`--bg-secondary` 卡、書名 serif sm、
   依 `status` 的捷徑組（analyzed：繼續閱讀／知識圖譜／深度分析；ready：開始閱讀／前往建構概覽；error：查看錯誤——後兩者都連 `/books/:id/unraveling`），
   全是導覽、都不帶 LLM 字符。固定 3 欄；區塊內寬 < 640px 時每卡只留第一顆主捷徑（container query）。`lastOpenedAt` 由 `BookLayout` 進書時 `POST /books/:id/opened` 寫入。
4. **篩選 chip** 四顆單選：全部／已分析／已就緒／處理中。「處理中」是結構性空集合——`GET /books` 不含 ingest 中的書，
   它只列 in-flight 任務；不 disable、不加 0 徽章。
5. **書卡格線**：處理中任務（`GET /tasks` 共用輪詢，pending／running 的 ingestion）排最前，用 BookCard 處理中態——
   warning badge「… 處理中」、旋轉 `loader`、只淡化封面（0.6，文字維持正常對比；卡不可點、hover 不變色）、`{stage} · {progress}%`、進度 > 0 才畫進度條、「查看進度 →」。
   最後一格「上傳新書」虛線卡。

#### BookCard

- 封面 `--bg-secondary` 方塊＋accent `FileText`。整張卡是一個連結（標題連結 `::after` 撐滿）。
- **StatusBadge** 三態色彩不變，加字符冗餘編碼：✓ 已分析、i 已就緒、✕ 錯誤（Ink 下 status 色都收成同一黑）。
  `StatusBadge` 為共用元件，書籍總覽頁一併換新外觀。
- **實體數**：知識圖譜步驟未完成（`pipelineStatus.knowledgeGraph !== 'done'`）時顯示「— 實體」，不顯示後端回的 0。
- **降級告警**：「{失敗步驟}、{失敗步驟} 不可用」（en「{steps} unavailable」；步驟名用 `reader:rerun.steps.*` 全名，與建構概覽同詞；「不可用」不斷行）＋`AlertTriangle`、warning 底，位在 badge 之下、meta 之上。
  後端任一步失敗即 `error`，所以這列只出現在錯誤書；列尾「查看錯誤 →」連 `/books/:id/unraveling`（疊在整卡連結之上）。
- **刪除兩段式**：hover／focus 才出現 28px 垃圾桶（名稱「刪除《書名》」）；點了只進確認態——error 底列「刪除？」＋danger「確認」＋ghost「取消」。
  已分析的書句子改「刪除？分析結果會一併刪除」；刪除失敗時列不收起、句子換「刪除失敗，請重試」（`role="status"`）。
  Esc 或點卡片外取消，Esc／「取消」焦點回垃圾桶；刪除成功後焦點移到下一張卡（沒有則「上傳新書」卡）。
  不是 modal、沒有 undo toast。
- 卡上不再顯示最後開啟日期（稿上 anatomy 沒有）。

#### 狀態

- **載入**：骨架（標題塊、四顆 chip 塊、12 張卡塊），無微光動畫；用稀疏密度（多數書庫載入後不跳版），卡塊尺寸取同一組密度變數。
- **空**（三種份量，`EmptyState`）：書庫為空＝`ready`（BookOpen 28、「書庫尚無書籍」、手寫字副標、primary「上傳新書」，無頁標題）；
  「處理中」篩選為空＝`prerequisite`（upload 26、「沒有正在處理的上傳任務」／「這個篩選只列出正在處理的上傳任務。」——有等待審閱時說明句改「另有 {n} 本等待章節審閱，見上方。」、
  accent 描邊「上傳新書」）；其他篩選為空＝`filtered`（「沒有{狀態}的書籍」＋「清除篩選」）。
- **失敗**（`PageFailure`，pageName「書庫」，見 §4.6）：頁標題常駐；單頁失敗另給 secondary「上傳新書」與技術細節。
  不做頂部橫幅、不承諾自動重試。
- **刻意不做**：`pipelineStatus` 四階段進度化、作者行。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#1（書庫列表）、#2-b（刪除書籍）、`GET /tasks`、`POST /books/:id/opened`

---

### 3.2 上傳 & 處理進度頁 `/upload`

#### 版面結構

```
[Left Sidebar] [主內容區]
                ├─ 上傳區塊（拖曳 / 點擊，可多選）
                ├─ Metadata 表單（選檔後）＋ 待上傳佇列
                └─ 處理中 / 完成 / 失敗（卡片列表）
```

> DS v3 第 1 批（2026-10）依 `03 上傳 Upload 決議紀錄.dc.html` A–F、H frame 重做。
> `pages/UploadPage.tsx`、`components/upload/{DropZone,ProcessingCard,ProcessingTimeline,MurmurWindow,CharacterSlot,uploadModel}`，
> 樣式 `styles/upload.css`（`up-` 前綴）＋ kit `.ss-btn*`／`.ss-badge*`／`.ss-pill*`。頁標題「上傳 & 處理進度」不動。
> 工程端代為裁決處見 `docs/DS_V3_DESIGN_FEEDBACK.md` 第 1 批 1-A、1-E、1-F、1-I、1-J、1-M～1-S。

#### 密度（同一頁內換檔）

| 狀態 | padding | section | card | max-w |
|---|---|---|---|---|
| C 入口（頁上沒有任務：投件、填表單） | 32 | 24 | 16 | 960 |
| B 檢視（頁上有任一任務卡，`data-density="view"`） | 24 | 16 | 12 | 1280 |

內容區靠左、不置中。任務跑著時投件區仍在最上方，可繼續投下一本；任務卡列上方保留既有小標「處理中」。

#### A · 投件（`DropZone`）

- 2px 虛線框、`--space-8` 內距：Upload 28（`--illustration-stroke-soft`）＋「拖曳檔案至此，或點擊選擇檔案」（base 600）
  ＋副標「支援 .pdf、.docx、.txt、.epub 格式，可多選 · 檔案大小上限 50 MB」。拖曳中 accent 框＋`--bg-secondary`。
- **就地拒絕每檔一列**：`--color-error-bg` 框＋AlertTriangle，每列「{檔名} · 既有訊息」（`dropzone.errorInvalidFormat`／
  `errorTooLarge`，Q3）。同一次投件的好檔照常進佇列；此時拒絕列移到 B 態最上方（1-R）。全被擋時投件框描 error 色。
  判斷由 `uploadModel.partitionFiles`（先看格式、再看大小）。

#### B · 有檔待填（表單只服務 `queue[0]`）

- 檔案列（`--bg-secondary`）：FileText accent、檔名 serif sm 600、mono「x.x MB · PDF」、ghost sm「更換檔案」（＝取消這個檔）。
- 表單卡：書籍名稱＋輔助字「可在書庫中隨時修改」（**同名警告出現時也保留**）；作者／語系兩欄。
  **語言偵測徽章**「已自動偵測：{語言} · 可修改」緊貼在語系下拉下方，`--bg-secondary` 圓角徽章＋kit `.ss-llm-glyph`
  （機器判斷標記，不是 `.ss-btn-llm`）；手動改下拉即清掉。>15 MB 不打預偵測、沒有徽章、不另寫說明。
- **同名書警告**「已有同名書籍《…》，本次上傳仍會繼續進行。」為 `--color-warning-bg` 列，放在送出鈕之上。
- 「確認上傳」primary、**不帶 sparkles**，書名空白時 disabled（頁內 `.up-page .ss-btn:disabled` 0.5，1-S）；「取消」ghost。
  按鈕旁的成本說明是稿上註解，不做（1-E）。
- 佇列「待上傳佇列 · 逐本填寫」（serif base 600）：每列 mono 序號（02、03…）、檔名、「等待上傳」、X 移除。

#### C · 處理中（`ProcessingCard`）

- 卡頭：書名 serif base 600、「{stage} · {progress}%」（2xs muted）、分隔線、Clock＋mono「已處理 mm:ss」（每秒跳；
  由 `createdAt` 回推，Q2）、右側 `ss-btn-sm ss-btn-danger`「終止處理」。卡頭下 2px 進度條，與 timeline 並存。
- **7 步 timeline**（左欄 200px，`ProcessingTimeline`）：PDF 解析 5／語言偵測 10／摘要生成 20／特徵提取 40／知識圖譜 60／
  符號探索 80／資料儲存 90，每列右側 mono 錨點百分比。marker 18px 四態：done success 實心＋check、running Loader 旋轉＋
  accent 標籤 600、pending 描邊圓＋序號、error error 實心＋x 並在下方就地展開 `task.error` 原文（mono 細節框）。
  步驟狀態由 `TaskStatus.stepKey` 驅動，缺時 fallback 百分比區間。running 只有後端給 `subTotal` 時才顯示
  mono「{subStage} {subProgress} / {subTotal}」，**沒有就不畫任何條**（不再有假的脈動條）。
- **MurmurWindow**：固定 260px、自有捲動、`--bg-primary` 框。每筆 mono eyebrow `stepKey · ch.NN`（章號補零）＋內容三型：
  實體 pill `.ss-pill .ss-pill-<type> .ss-pill-dot`（character→character、location→location、org→organization、
  event→event、symbol→concept，`uploadModel.murmurPillVariant`）＋serif 角色說明；topic serif sm 散文；raw mono muted。
  delta 累積、長度無上限；新事件只在使用者已在底部時貼底，往上捲閱讀時不強制拉回。空態「等待系統開始處理…」置中。
  右下吉祥物槽（44px 虛線方框、Sprout、上下浮動，reduced-motion 停），內容右側讓出槽的車道。

#### D · 等待審閱（唯一人工閘門）

整張卡換成閘門卡：2px `--color-warning` 邊框、`--space-7` 內距；ShieldAlert 24 warning、`ss-badge-warning`「等待審閱」
＋書名（1-O）、主標「系統偵測到章節結構，請確認是否正確」（serif xl 700）、副標「這是送出前最後一道人工閘門」（xs，不縮不移）。
右側三顆並列：「接受系統判斷」primary＋`.ss-btn-llm`（走 accept 捷徑）、「開始審閱 →」secondary（導
`/upload/review/:bookId?taskId=`，不帶字符）、`ss-btn-danger`「終止處理」。接受失敗時卡內紅框就地顯示
「章節審閱提交失敗，pipeline 可能已中斷，請刪除此書並重新上傳。」。

#### 終止確認（處理中與等待審閱共用）

「終止處理」先開 `ConfirmDialog` 損失清單版：標題「終止處理《{書名}》？」、內文「以下內容會被移除，無法復原。」、
清單「目前的處理任務」「已寫入書庫的這本書（若已建立）」、`danger` 確認鈕「終止處理」、取消維持 ghost（1-I）。
**這三句是草稿・待設計定案**（i18n `upload.terminate.*`；JSON 不能寫註解，故記在此）。確認後流程不變：
先 `POST /tasks/:id/cancel`，書已落地才 `DELETE /books/:id`，**卡片直接移除**——使用者主動終止不是失敗，
不留失敗卡、不提供重試。從別處終止（輪詢讀到 `status: "error"` 且 `error: "cancelled"`）同樣移除。
sessionStorage 記著、但 `GET /tasks/:id/status` 回 404 的任務（記憶體 store 重啟、30 天清理）也直接移除，
不再卡成一張等不到狀態的空卡；404 不重試、不再輪詢。

#### E · 部分完成（`PartialRerunCard`）

與「已完成」是兩種版型。卡頭書名＋`ss-badge-warning`「部分完成」（AlertTriangle），卡頭下分隔線；內文先保留既有句
「書籍已儲存，但以下步驟未能完成 · 可直接重跑」（1-F），再逐步驟列：步驟名 xs 600、後端細節 mono 細節框
（`--bg-tertiary`）、右側 `ss-btn-sm ss-btn-secondary ss-btn-llm`「重跑」（失敗後「再試」，進行中「重跑中…」）。
對映不到 rerun endpoint 的前綴只列出、不給鈕、不寫說明（符號探索有 endpoint，保留鈕，1-M）。全部補齊換成
CircleCheck success「所有步驟皆已補齊。」。底部分隔線下固定「前往書庫查看 →」。重跑 toast 不變。
部分完成 toast（全域）的行動鈕「前往書庫查看」導向書庫 `/`，不是書籍頁。

#### F · 已完成 · 失敗

- 已完成：`--color-success-bg` 單列，CircleCheck、書名 serif sm 600、右側「前往《書名》→」；同名任務上方另有 warning 細條。
  `result.timelineDetection.chapterModeViable` 為真時彈 `TimelineConfigModal`（不變）。
- 失敗卡：`--color-error-bg`，AlertTriangle 18、檔名 xs 600 error 色、錯誤原文 mono 細節框；右側 `ss-btn-sm ss-btn-secondary`
  「重試 · 沿用原書名/作者，只需重新選檔」（整句沿用既有字串，1-N；只開檔案選擇器、零成本）＋X 關閉。

#### H · 頁面失敗

進頁的 `GET /tasks`（跨分頁復原）失敗不再吞掉：標題之下整個內容區換成 `PageFailure`（`pageName`＝nav「上傳」，
`variant` 由 `failureKind` 判：有 JSON body → 單頁失敗「無法載入上傳」；裸 502／斷線 → 後端失敗），「重試」重打一次 `GET /tasks`，
成功才回到正常內容。內容區撐滿高度，失敗態垂直置中。

#### LLM 字符

只有「接受系統判斷」與「重跑／再試」帶 sparkles；確認上傳、開始審閱、終止處理、失敗卡重試、更換檔案／取消／移除、各導覽都不帶。

#### 全域通知（`ToastHost` / `ToastContext`）

**全站唯一一份 toast**（DS v3 · 17 決議 T1；角色／事件頁的頁內 toast 已移除，改 push 進這裡）。
右下角堆疊（success/warning/error/info 四型）。外觀依 components-toast 規格卡：卡片外框 + `--shadow-lg`、
內距 `--space-5 --space-6`，狀態由 26px 圖示盤以**色＋形**雙重編碼（Check／TriangleAlert／TriangleAlert／Info），
**無左邊框**；標題 sans sm 600、內文 xs secondary、行動鈕 `ss-btn-sm secondary`（標籤後補「 →」）、X 永遠在。
樣式在 `styles/ss-kit.css` 的 `.ss-toast*`。
生命週期三檔：無行動鈕 5.2s／有行動鈕 9s／`persist`（只能手動關）。
批次分析（角色、事件）完成即 push：無失敗 success、有失敗 warning，**兩者都是 5.2s 自動消失**——
toast 只當完成通知（第 5 批 09·10 決議 C 區推翻 17 決議 T4 的「有失敗 persist」）。失敗只在批次面板
（事件頁、角色頁左欄頂端的 `BatchEepPanel`）以**數字＋「只看失敗」**常駐，不放 toast、也不在面板裡列清單。
有失敗仍用 warning：部分完成不是乾淨的成功，Ink 下靠標題與內文的「失敗 N」區分。
`useTaskNotifications`（掛在 `AppLayout`）輪詢 `GET /tasks`，於 ingestion 任務
轉 done / partial / awaiting_review / error 時觸發對應 toast 與跳轉；首次輪詢
靜默 seed，避免對載入前已終結的任務發通知。使用者終止（`error: "cancelled"`）不發 toast——那不是「解析失敗」。

#### HITL 章節審閱（`ChapterReviewPage`，路由 `/upload/review/:bookId?taskId=`）

DS v3 第 1 批 1-3b。權威稿：02 章節審閱決議紀錄 frame A–H。全站唯一會卡住 pipeline 的人工閘門。
樣式在 `styles/chapter-review.css`（`cr-` 前綴，全走 token）；純函式在 `pages/upload/`
（`applyBoundaries.ts`、`paragraphSplits.ts`、`spineLayout.ts`，皆有測試）。

- **外框**：基本外框＋28px 麵包屑（kit `.ss-booknav`）「上傳 & 處理進度 / {書名} / 章節審閱」（稿 02：2xs 字級、全列 `--fg-secondary`、箭頭 accent、書名只換 serif、目前頁 `--fg-primary`，`.cr-booknav` 覆寫），退出路徑回
  `/upload`（書還沒落地，不回書庫）。書名取 `useBook(bookId)`（#2-a），取不到就省略該段。B 檢視密度：
  padding `--space-7`、區段 `--space-6`、卡內 `--space-5`、列 `--space-4`。
- **標題列**：「審閱章節結構」serif 2xl 700＋副標「審核章節結構 · 送出前最後一道人工閘門」；右側按鈕依序：
  目錄入口（僅有章被標為目錄時）、邊界輔助辨識、放棄上傳（ghost）、送出審核（primary，**不帶字符**）。
- **橫幅**（標題列下、全寬、`--card-radius`、`--color-*-bg` 底＋同色圖示，文字 `--fg-primary`）：
  邊界輔助進行中／完成／無發現／失敗／503、切分後「復原切分」、放棄確認紅列、送出成功。
- **結構脊**（206px ↔ 收合 40px，切換鈕 `PanelLeft`，tooltip「收合／展開全書結構」）：
  - 標頭「全書結構脊」＋右側 segmented「逐章／總覽」（kit `.ss-seg`，預設逐章，不依章數自動切換）＋收合鈕；
    其下第一行摘要「{total} 段 · {body} 正文章 / {nonBody} 非正文 · 點一段即跳到該章」（兩態共用同一句）。
  - **逐章態**：每章一 block，`min-height = 30 + paraCount × 15`（`spineBlockHeight`），可捲動。章標雙軌：正文章重新編號
    「第 N 章」、非正文章顯示角色名。章標前 8px 角色方塊：正文實心 `--accent`、非正文空心 `--fg-muted` 描邊。
    疑似漏切（`isMisSplit`：正文章內 >1 個 `titleSpan`）＝章標旁 6px `--color-warning` 圓點，tooltip「疑似漏切一章」。
    選中 block `--bg-tertiary`。
  - **總覽態**（B′）：全書塞進可視高度、不捲動。章高 `max(2, round(paraCount / 總段數 × (可視高 − 章距)))`
    （`overviewHeights`，ResizeObserver 量高），章距 1px。列＝章號 28px｜條｜6px 旗標點；正文條 `--accent`、非正文
    `--fg-muted`；選中 `outline: 2px solid var(--fg-primary)`、offset 1px；章號（正文流水號／非正文角色名）只在章高 ≥ 12px
    時顯示於條左側；tooltip「第 {n} 章 · {title} · {count} 段」（非正文章以角色名代入、無標題省略，見 FEEDBACK 1-U）。
    點章跳轉並**留在總覽態**。
  - **收合導軌**（C）：條高 `14 + paraCount × 8`（`railBarHeight`）；正文 `--accent`、非正文 `--fg-muted`；
    疑似漏切 warning 填色＋條中央 3px `--bg-primary` 缺口（兩主題皆畫）；選中 outline 同上；
    容器 tooltip「各章段落長度比例（點一下跳到該章）」。
  - 點任一 block／條／列 → 正文流捲到該章，分隔列閃 1.3s `--color-warning-bg`。
- **正文流**：
  - 頂端說明列「左側結構脊可標記章節角色、每段右側選單可標記段落角色 · 角色定義見右側對照表」＋右側
    「章節角色 · 段落角色對照」（secondary sm）。說明列不隨正文捲動。
  - 章分隔列：`ss-badge`「章」＋章標（雙軌）＋標題輸入框（flex 1）＋章角色下拉＋「↑ 併上」「↓ 併下」（ghost，首章／末章 disabled）。
    正文章 `--bg-secondary`、非正文章 `--bg-tertiary`；選中章內緣 1px accent 描邊（FEEDBACK 1-X）。
  - 段落列：左「＋」在此分章（首段隱藏；新章繼承原章角色）、serif sm 1.75 正文（`titleSpan` 片段 700）、右段角色下拉
    （「段·正文」…）。章或段任一為非正文 → 整列 `opacity: 0.55`（含下拉，FEEDBACK 1-X）。
  - **段內切分**：選取文字（夾回起點所在段落）→ 選區以 `--timeline-selected-ring` 標示，浮鈕「✂ 切分為新段落」
    （primary sm，`position: fixed` 跟著選區）→ 拆成 2–3 段並出現 info 橫幅＋「復原切分」。**只有一步**，任何其他結構或角色
    變更都會清掉快照。送出時以 `paragraphSplits` 提交（見 #22b）。
- **角色對照表**（D）：說明列下方的 overlay（不推擠正文流）。標題「不確定「章」跟「段」的角色該選哪個？點這裡看說明」＋✕、
  方法論段（serif）、兩欄標頭與 10 條定義全文逐字。角色名為 pill：章欄正文實心 accent、其餘 `--bg-tertiary` 淡底；
  段欄正文 accent 描邊、其餘 hairline。
- **目錄對照**（E，#22d）：
  - 入口在標頭按鈕列：目錄文字自上次成功解析後未變 →「目錄對照」（純開抽屜，不帶字符）；否則「解析目錄並對照」
    （`.ss-btn-llm`，送出**目前編輯中**的目錄文字）。tooltip 為 `toc.detectedHint`。
  - 抽屜：蓋在正文流右緣的 420px 卡（不 reflow），標頭「書本目錄」＋「AI 解析 · 唯讀」徽章＋「重新解析」（ghost＋字符）＋✕。
    狀態：解析中（spinner＋`toc.loading`）／完成（「數量對比」標籤 → 摘要列：吻合 success ✓「數量吻合 · 目錄 X = 偵測 Y」、
    不吻合 warning !「目錄 X · 偵測 Y」＋描邊 delta 徽章「漏切／多切 N 章」→ 有序條目：body 流水號 01…、非正文「—」＋
    「非正文」、`p.N`、依 `level` 縮排 → 告誡「「書本目錄」在此、「偵測結構」在左側結構脊，兩份各自獨立、不自動配對，
    請自行核對。」）／為空（`toc.empty`＋「重新解析」）／失敗（error 色 `toc.error`＋「重新解析」）／**503**（應用層 JSON：
    「尚未設定 LLM provider，無法執行 LLM 分析。」＋「前往 LLM 設定 →」，不給重新解析，標頭的也隱藏）。
    **刻意不做**任何與結構脊並排配對或連線的視覺。
- **邊界輔助辨識**（F，#22c）：按鈕三態由按鈕本身承載——idle（secondary＋`.ss-btn-llm`）／「偵測中…」（spinner、disabled、
  無字符）／「已套用 AI 建議」（永久 disabled、無字符，只能用一次）。橫幅五態：進行中 info／完成 success
  （「已依 AI 建議切出頭尾非正文章節，請覆核。這只是建議，需按「送出審核」才生效。」）／無發現 info（按鈕回 idle）／
  失敗 error「辨識失敗，請稍後再試。」（回 idle）／**503** warning「尚未設定 LLM provider，無法執行 LLM 分析。」＋
  「前往 LLM 設定 →」（頁內，回 idle，手動審閱照常可送出）。503 判準：`ApiError.status === 503 && hasBody`。
  成功時前端以 `applyBoundaries` 把頭尾段落切成非正文章節。
- **「前往 LLM 設定 →」**連到 `/settings#llm`；`SettingsPage` 只在初始狀態讀 hash，`#llm` 時預設開 LLM 面板。
- **送出／放棄**（G）：送出成功 → success 橫幅「已送出審核，pipeline 繼續執行下游分析。」，0.6s 後導回
  `/upload#{taskId}`（無 taskId 則 `/upload`）。放棄兩段式：標頭「放棄上傳」只開紅色確認列
  「刪除整本書並放棄上傳？此動作無法復原。」＋「確定放棄」（`ss-btn-danger`）／「取消」（ghost）；確定後 `DELETE /books/:id`、
  清 sessionStorage 的任務紀錄、回 `/upload`。
- **錯誤態**（H，判準 `failureKind`：有無應用層 JSON body）：麵包屑常駐，其下換成 `PageFailure`（{頁名}＝章節審閱）。
  - 載入失敗：單頁「無法載入章節審閱」或後端「伺服器沒有回應」，「重試」重新抓 review-data。
  - 送出失敗：單頁版標題覆寫為「提交失敗，請稍後再試。」＋定案內文；後端版定案三句；「重試」**重新送出**同一份編輯。
  - **409**（四個審閱端點皆然，依 `ApiError.code`）：主版型狀態、不給重試，主鈕「前往上傳 & 處理進度」。
    `review_submitted` → `CircleCheck` 26 success 色「這本書的章節審閱已經送出」／「審閱結果已寫入，pipeline 已繼續往下跑。
    這一頁的編輯不會再被接受。」；`review_closed` → 中性 `Info`「這本書的處理已終止」／「審閱視窗已關閉，這一頁的編輯不會被接受。」；
    `review_not_open` 或無 code →「這本書目前不在章節審閱階段」／「這一頁的編輯不會被接受。」。
    **後兩組為草稿，待設計定案**（FEEDBACK 1-H）。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#2（上傳 PDF）、#8（任務 polling）、
#22a（review-data）、#22b（review）、#22c（suggest-roles）、#22d（parse-toc）

---

### 3.3 閱讀頁 `/books/:bookId`

> 2026-07-13 依 Claude Design canvas 全面翻新（計畫 `docs/plans/20260713-reader-page-revamp.md`，R1–R9）。**2026-10-02 DS v3 第 3 批（08 決議紀錄）再改版**：
> A 工作檯密度、檢視／專注兩態、排版偏好依態分存、錯誤四分、兩顆 LLM 控制項掛字符與 503 就地狀態。批次計畫 `docs/plans/20261002-ds-v3-batch3-analysis.md`。
> 定位仍是**檢視器（inspector）**：chunk 卡片結構是定案，不做連續文流。

#### 版面結構與密度

```
[Left Sidebar 48px + 書名列 28px（BookLayout）]
[欄1: 書籍資訊 250px 可收合→46px 細軌] [24px 間隔] [欄2: 章節列表 224px 可收合→36px 細軌]
[貝茲 34px] [欄3: Chunk 內容 flex] [欄4 認知狀態 288px 開關式]
```

**密度 A 工作檯**：區塊內距 `--space-5`（12）、區塊間距 `--space-4`（8）、卡內距 `--space-4`（8）、列距 `--space-2`（4），滿版（無 max-width），
下內距 `--space-8`（32，取代舊的 80；被浮動鈕擋住的問題交給回頂部 FAB 自己的安全距）。樣式在 `styles/reader.css`（`rd-*` 前綴）。
**欄寬與收合寬（250↔46／24／224↔36／34／288↔0）是稿與 README 明文凍結的密度控制器，一律不動**，也不合併成單一側欄開關；
貝茲欄只在 col2 收合、未選章節、專注、≤768px、閱讀非正文章五種情況歸 0。收合狀態**目前不持久化**（README §6 寫會，現況沒有，維持現況，見 feedback 3-RD-3）。

窄視窗（≤768px）：進頁自動折疊欄 1、欄 2，貝茲隱藏；使用者可手動展開。**這是給半螢幕桌面視窗用的，不代表支援手機**——全站最小支援寬度 720px（見 PRODUCT.md）。
**欄 3 最小寬保護（360px）**：欄寬凍結不動；使用者展開某欄（欄 1／欄 2／欄 4）或縮小視窗時，若欄 3 會窄於 360px，依序自動收起欄 1、再欄 2——
**剛展開的那欄不收**（`readerModel.protectCol3`）。720px 視窗開認知狀態時，兩欄都收起後欄 3 約 302px，這是凍結欄寬下的下限。

#### 欄 1 — 書籍資訊（`BookOverview`）

封面佔位（76px、`--bg-secondary` 方塊＋accent `FileText`）→ 書名（serif）＋作者行＋收合 chevron（Tooltip）→ `StatusBadge` → 摘要（serif）→
統計格（2 欄；章節／Chunks／實體／關係，**事件第 5 格整列寬**——實體分佈不含事件，事件數量由這格承擔，見 feedback 3-RD-2）→
`PipelineRerunPanel`（有 failed 步驟才出現）→「全書關鍵字 前 12 · 依權重」→「實體分佈 6 型全列」。

- 作者行**版位一律保留**：沒有作者時也佔一行高度（`.rd-book-author` min-height），作者是下一期功能。
- **尚未分析**（`pipelineStatus.knowledgeGraph === 'pending'`，實體／關係／事件都來自這一步）：統計格與實體分佈改為「尚未分析」區塊（`--bg-secondary` 底、serif 標題＋說明＋「前往建構概覽 →」連到 `/books/:bookId/unraveling`）。閱讀頁**不放啟動鈕**——觸發與下游影響說明集中在建構概覽。
- 實體分佈固定 6 型順序（角色／地點／組織／物品／概念／其他），**事件不列入，數量 0 的類型照列**（`readerModel.entityDistributionRows`）。
- 收合後 46px 細軌（08 B 區 railTrack）：`--bg-secondary` 底、chevron 12 muted＋直排「書籍資訊」2xs secondary，**無圖示**，點細軌任意處展開。

**功能未完成（`PipelineRerunPanel`）**：done 顯綠勾無鈕、pending 整列不渲染、**只有 failed 才有「重新執行」**（不做成永遠可見的四步表，避免誤觸花 token 的鈕）。
鈕掛 `.ss-btn-llm`，面板底部保留文字提示「會呼叫 LLM，消耗 token；覆蓋該步驟的產物。」。**點「重新執行」先開 `ConfirmDialog`**（標題＝步驟名、內文「會覆蓋「{步驟}」的產物。下游會受哪些影響，見建構概覽。」、左下成本提示、執行鈕帶字符），確認才送出——下游影響不在這裡重算，以建構概覽為準。觸發失敗若是應用層 503（`isLlmUnconfigured`）→ 該列下方就地顯示
`LlmUnconfiguredNotice`（前往 LLM 設定），其餘照常；其他錯誤顯示在該列。四步名稱與「功能未完成」「重新執行」「執行中」已移進 i18n `reader.rerun.*`（逐字）。

#### 欄 2 — 章節列表（`ChapterCard`）

header：「章節 · N」label＋**「全部展開／全部收合」secondary 小鈕（`.ss-btn-sm`，無圖示）**＋收合 chevron（Tooltip）；搜尋框（`--input-bg`／`--input-radius`／`--input-border-width`）。
搜尋**不過濾**——不符者 `opacity:0.4` 仍可點，下方「N 章符合」，無命中「沒有章節含「…」」（兩條逐字）。

章節卡為**多開手風琴**，兩個分離的點擊區：**左側＝導覽**（欄 3 讀該章，順帶展開）、**右側 chevron＝只展開／收合**，中間以 1px 內分隔線（chevron 的 border-left）標出；
chevron 有自己的 hover 底（`--bg-tertiary`，展開時也是）。選中＝accent 外框＋`--bg-secondary` 底（**不用 inset**）；框重取 `--card-selected-border-width`（Warm 同卡框、Ink 2px——Ink 的 accent 與 border 幾乎同色）。展開內容：摘要 → 關鍵字 → 「實體 · N」膠囊（可點開實體卡）。
36px 細軌與欄 1 細軌同一套樣式（chevron＋直排「章節」、無圖示、整條可點展開；展開態的收合 chevron 才是右上角獨立鈕）；直排「章節」已移進 i18n `reader.col2Rail`（原為硬編）。

**卷首／卷末（非正文章節，2026-10-07，計畫 `docs/plans/20261007-reader-non-body-chapters.md`）**：清單以 #4 `include_non_body=true` 取得全部章，
依章號分兩群——**卷首**（`order ≤ 0`）排在第 1 章前、**卷末**（`order > N`）排在最後一章後；沒有非正文的那一端不渲染。

- 群組標頭：可摺疊一列「卷首 · N」／「卷末 · N」，**預設收起**（不持久化），前置空心方塊（`--fg-muted` 描邊，同章節審閱頁的非正文標記），文字 muted。
- 非正文卡：單列＝角色名（序／目錄／跋／其他，glossary UI 標籤）＋標題＋「N 段」；**無 chevron、不可展開**（pipeline 不為非正文產摘要、關鍵字、實體）。點＝欄 3 閱讀；選中態同正文卡。
- 非正文卡**不帶** `data-chapter-card`、不計入「章節 · N」；貝茲欄只對正文清單索引。章節搜尋照常套用（比對標題）。
- 非正文仍不進閱讀流：實體出處（#9b）只計正文，見 glossary「章節與段落角色」。

#### 貝茲欄 — `BezierConnectors`

不變：欄 2／欄 3 之間的實體 34px SVG 欄，每個 chunk 一條三次貝茲，rAF 節流、直寫 SVG DOM 不觸發 re-render。

#### 欄 3 — Chunk 內容

**工具列由左到右固定順序**（G 區與 README §1.3；決策表的順序與此不一致，見 feedback 3-RD-1）：

1. **「檢視／專注」兩段切換**（`.ss-seg`，取代舊的 Maximize 鈕）——常駐顯示現在在哪一態
2. **標註密度三段「全部／角色／關」**（`.ss-seg`）
3. **「認知狀態」**（`.ss-btn-ghost`，無圖示；開啟時字樣變「收起」）＋首次提示
4. **Aa**（排版彈窗）

底部 2px 捲動進度細條。標題列：章名（serif lg）＋「第 N / M 章」badge＋「N chunks」。

**chunk 卡**：頂列 `#order`（mono，從 #0 起）靠左、實體膠囊靠右；正文（serif，字級／行距由下方兩態偏好決定）；關鍵字（**去掉與該段實體名／標註字面重複者**，忽略大小寫與字中空白，`readerModel.keywordsWithoutEntities`）。
**純分隔符段落**（只有標點／符號，如「✦✦✦」，且無實體；`readerModel.isSeparatorText`）：保留 `#order`，畫成一條置中細線，不畫整張卡。
標註密度以容器 `data-annotation-mode` 控制（`global.css`）：「角色」＝非角色 mark／chip 取消底線與 hover 色塊並**拿掉 pointer-events**；「關」＝chips 整列隱藏、正文純散文；`#order` 三段都留。

**章末導航只放右側「下一章 {章名} →」**（`.ss-btn-sm.ss-btn-secondary`）；最後一章沒有，也沒有「上一章」。

**閱讀非正文章時**：標題列的「第 N / M 章」改為角色名徽章；正文強制純文字（無實體 mark、無 chip，等同標註「關」但不改使用者的標註偏好）；
**「認知狀態」鈕停用**（`disabled`，Tooltip「非正文不參與分析」——它以章號為截止，非正文沒有章號；不隱藏以免工具列位移），若欄 4 已開則收起；
**無「下一章」**；貝茲欄歸 0。捲動 >500px 浮現回頂部 FAB（Tooltip 包在固定定位的外層 wrapper）。

##### 檢視／專注兩態（G 區）

兩態 **DOM 相同**（chunk 仍是定位單元；實體卡跳段、認知狀態定位、跨書搜尋 §NN 都指向 `#order`），專注態只調弱視覺層次：

| | 檢視 | 專注 |
|---|---|---|
| 預設字級／行距 | **17px／1.6**（fs=1, lh=0） | **19px／1.85**（fs=2, lh=1） |
| 欄 | 四欄各依使用者收合 | 欄 1、欄 2 強制進軌、貝茲欄隱藏（不寫收合偏好，退出原樣還原，專注期間收合鈕 no-op） |
| 正文欄 | 滿版 | `max-width: 760px` 置中 |
| chunk 卡 | 完整卡框與底色 | 卡框與底色收成一條區隔細線；`#order` 掛到正文左側邊界外（左側留 `--space-8` 的溝，窄視窗也不被裁） |
| 標註密度 | 使用者設定 | **進入時自動切「角色」**（仍可改），退出時還原檢視態的設定 |
| chunk chip／段末關鍵字 | 顯示（關鍵字去掉與實體重複者） | **都收起**，只留正文與標註 |

刻度 15／17／19px、1.6／1.85／2.15 不動；字級與行距兩態共用同一組（FINAL_RULINGS #7）。模式只存在於當次 session，不持久化。專注態是 A 級的變體（間距仍 12／8／8／4），不換級。

##### Aa 排版彈窗與 `reader:prefs`

彈窗 **220px**：（「此態預設 17 / 1.6」＋「目前 …」＋ **「回到此態預設」鈕——只在使用者的值 ≠ 預設時出現**；兩態共用一組，不再有「檢視／專注」標頭，「此態」二字的措辭待設計端確認，見 DS_V3_DESIGN_FEEDBACK 第 5 批）→ 字級 小／標準／大 → 行距 緊／標準／寬 →
紙張色溫（4 色票，**只在 Warm 渲染**；Ink 整段不渲染且忽略既存偏好，欄 3 背景固定 `--bg-primary`）→ 逐段淡入。
點外或 **Esc** 關閉；Esc 時焦點回到 Aa 鈕（Aa 鈕帶 `aria-expanded`／`aria-controls`）。

`reader:prefs` 結構（純邏輯在 `components/reader/readerModel.ts`，有 vitest）：

```json
{ "fs": 1, "lh": 0, "warmth": 1, "fade": false }
```

fs、lh、warmth、fade **兩態共用一組**（FINAL_RULINGS #7），預設 17 / 1.6。專注態不再有自己的預設（19 / 1.85 作廢）。
**舊結構讀入時**：原始平面 `{fs, lh, warmth, fade}` 原樣沿用；中間版本的分態 `{view:{…}, focus:{…}, warmth, fade}` 取 `view` 那組、丟掉 `focus`。之後的寫入一律是平面新結構。

#### 實體卡 — `EntityCard`（popover）

點行內標註或 chip 開啟：**320px、`max-height: 60vh`**、貼點擊來源（無遮罩、Esc／點外關閉）。內容區自己捲動，**不截斷、不加漸層遮罩**。
**定位**：下方放不下完整 60vh 且上方空間較大時上翻；`max-height` 夾在開啟那一側的可用空間內，卡片不會超出視窗（舊版固定 320px 門檻，錨點在下半部時底部被裁）。
**焦點**：`role="dialog"`＋`aria-labelledby` 實體名；開啟時焦點移到卡上（容器不畫焦點框），Tab 下一站即卡內控制項；Esc／× 關閉時焦點還給開啟它的元素；Tab 離開卡片即關閉（不做 focus trap）。
**點出處跳段時先關卡**，否則卡會蓋在閃爍中的目標段落上。
標頭：實體名＋型別 pill＋關閉；「全書出現 N 段」；動作列「角色分析」（`.ss-btn-secondary`，僅 character）＋「在圖譜中查看」（`.ss-btn-ghost`）。
主體：角色先顯示 `profileSummary` 與原型標籤（兩段，404＝「角色深度分析未生成」，不是錯誤），**其下的「出現段落 · N」逐段清單才是主體**——每列「第 N 章 · 章名」＋ mono `#order`＋2 行截斷原文，點擊跳段（同章直接捲動＋flash，跨章先切章、等 chunks 載入後再捲動並閃 2 秒）。
載入中／失敗／空三種狀態逐字（「載入出現段落…」「段落載入失敗」「尚無出現段落」）。

#### 認知狀態側欄 — `EpistemicSidePanel`（288px，預設關）

標頭「認知狀態」＋「收起」→ 角色下拉（`--input-*`）→ **名單來源註記（欄位出處註記，逐字、不可關閉）**→ **「截止 第 N 章」**（有選章節時）→ 三組事件。
三組：已知／未知／誤信，標頭是 label＋count；每列帶字符 **✓／?／✕**，因為 Ink 下四個 status 色都是 `#151515`，不能只靠色相。
事件項可點跳段（#23a 語意搜尋，限定該章，搜尋中顯示 spinner，失敗退回章節級跳轉）；誤信經 `sourceEventId` 反查來源事件（取其標題當第一行「✕ {事件名}」，下接縮排的「誤信：」「實情：」「信心度」；查無則無標題列且不可點）；誤信 0 筆時仍顯示組標頭 0＋「（無）」；「誤信：」「實情：」「信心度 N%」逐字。
**判定規則註記（區塊註記，逐字、不可關閉）貼在三組之下**（舊版在三組之上）。未選角色：「請選擇角色以查看認知狀態」；計算中「計算中…」；某組為空「（無）」。

**缺 visibility 資料**：⚠「尚無 visibility 資料」＋ `ClassifyVisibilityButton`：按鈕文字「補標 visibility（臨時）」（「（臨時）」留在按鈕上，要在點擊前就讀到）、掛 `.ss-btn-llm`、
Tooltip「以 LLM 補標事件 visibility（臨時功能，未來可能調整）」（逐字）、其下文字提示「會呼叫 LLM，消耗 token；寫入資料。」。觸發回應用層 503 → 就地 `LlmUnconfiguredNotice`。
此元件同時被角色分析頁（`EpistemicStateSection`）與圖譜 lens（`LensCard`）使用，三處一起套用新外觀與 503 處理；樣式隨元件走（`styles/classify-visibility.css`）。

**首次提示**：選了章節但沒開過認知狀態時，從「認知狀態」鈕下方冒出 200px 卡「選擇角色，查看他在這個章節前知道的事」，點一下或 5 秒後消失並寫 `storysphere:reader-epistemic-hint-shown`，永不再出現；沒有「不再顯示」勾選框。

#### Landing 與錯誤

- **未選章節（landing）**：頁面層導覽條 `GuidanceRibbon surface="reader"`（逐字，只出現在 landing，可關）＋「選擇章節以查看內容」。三種註記可關閉性不同：導覽條可關；名單來源註記、判定規則註記不可關。
- **錯誤四分**（`PageFailure`，書籍外框的側欄與書名列常駐，只替換內容區；{頁名}＝這本書）：
  - 單頁失敗（回應有應用層 body）：「無法載入這本書」＋重試＋**「回書籍總覽」**（連到書庫 `/`）＋可展開「技術細節」
  - 後端失敗（無 body 或裸 502/503/504）：「伺服器沒有回應」＋重試，不寫自動重試倒數
  - **404 或查無此書**：標題換成「找不到書籍」（取代原本硬編的 `Book not found`；已裁決），其餘同單頁失敗
  - 功能層 503：不整頁處理，見上面兩顆 LLM 控制項的就地狀態
  
  `BookLayout` 對 `/books/:bookId` 精確路由**不再攔截 `useBook` 錯誤**，讓閱讀頁自己畫上面這個狀態；其他書籍頁維持原本的 `ErrorMessage`（書名列的書名見 feedback 3-RD-5）。

#### 字串來源

既有字串一字不改。**這 9 句是草稿・待設計定案**（i18n `reader.*`；JSON 不能寫註解，故記在此；zh-TW 與 en 都已補）：

| key | zh-TW | 來源 |
|---|---|---|
| `viewLabel` | 檢視 | README §5 草稿 |
| `typography.modeDefault` | 此態預設 | README §5 草稿 |
| `typography.resetToDefault` | 回到此態預設 | README §5 草稿 |
| `typography.current` | 目前 | 08 G 區稿上有、README 未列 |
| `bookKeywordsHint` | 前 12 · 依權重 | 08 A 區稿上有、README 未列 |
| `entityDistributionHint` | 6 型全列 | 08 A 區稿上有、README 未列 |
| `epistemicPanel.cutoff` | 截止 第 {{n}} 章 | 08 E 區稿上有、README 未列 |
| `rerun.hint` | 會呼叫 LLM，消耗 token；覆蓋該步驟的產物。 | 08 D 區稿上有，原程式沒有 |
| `classify.hint` | 會呼叫 LLM，消耗 token；寫入資料。 | 08 E 區稿上有，原程式沒有 |

已裁決的新字串：`notFound`「找不到書籍」、`failure.backToOverview`「回書籍總覽」、`failurePageName`「這本書」（填進共用的「無法載入{頁名}」）。
「技術細節」與 503 就地狀態沿用 `common.failure.*`。逐字移進 i18n 的既有字串：`rerun.*`（功能未完成、四步名、重新執行、執行中、執行失敗）、`classify.*`（補標 visibility、（臨時）、tooltip、分類中…、已分類 N/M 個事件、觸發失敗，請稍後再試、失敗）、`col2Rail`（章節）。

原生 `title` 已全換 Tooltip（收合鈕、章節 chevron、色票、回頂部、補標鈕）。`SegmentRenderer` 行內實體 `<mark>` 也已改走 Tooltip（A1 M3）：`Tooltip` 新增 `anchorClassName`／`anchorStyle`，行內文字用 `.ss-tooltip-anchor-inline`（`display: inline`）當錨點，不破壞斷行；絕對定位的小點（時間軸 `.tl-stave-hit`／`.tl-lane-dot`／未排序點）把定位移到錨點上。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#3（書籍詳情）、#4（章節列表）、#5（Chunk 內容）、#7a（實體深度分析）、#9b（實體出現段落）、#12e（認知狀態）、#8d `POST /books/:id/rerun/:step` 與 #12d `POST /books/:id/classify-visibility` 的 503（LLM provider 未設定）。

---

### 3.4 角色分析頁 `/books/:bookId/characters`

> **DS v3 第 3 批（3-2）改版現況**（以下為準，後文舊描述與其衝突處以此為準）：
> - **密度 B 檢視**：內容區 padding 24／區塊間距 16／卡片內距 12／列間距 8、max-w 1280、下內距 32；左欄 268 固定。樣式 `character-analysis.css` 只用 `--space-1…8`。
> - **文案與結構（2026-10-09，使用者定稿）**：區塊標題一律 h2（頁面 h1＝角色名／「角色群像」）；清單群組標頭只顯示人數（篩選中「顯示 / 總數」，`character.list.groupMeta` 已刪）；已分析列 `isStale` 時狀態點前加 info 小點＋Tooltip；引文已自帶「」『』“”時不再外包（`isQuoted`）；語音卡標頭鈕「重新生成語音風格」（`character.voice.regenerate`，與標題列「覆蓋重新生成」區分）；`persona.profileSub`「整體描繪」；`voice.sentenceLength`「句長分布（字）」；`character.stale.tooltip`／`event.stale.tooltip` 改白話：「這份分析做完後，系統又重新整理過書中的證據段落。內容仍可參考，但可能和目前的資料有些出入；需要時可以覆蓋重新生成。」
> - **窄寬（2026-10-09）**：象限圖與 ego 關係網的 SVG 以容器實際像素寬為 viewBox（`useElementWidth`），文字維持 CSS 字級不隨寬度縮放；象限高＝寬×0.47（320–470）、泡泡半徑隨寬度縮放（0.5–1 倍）；ego 橢圓橫半徑＝寬/2−46（90–380）。象限主欄放不下 480＋圖例就換行（圖例落到圖下）。內容欄 ≤600px（container query `ca-content`）時語音四格改 2×2、質性欄全寬。
> - **左欄**：框架 chip（pill）＋說明句固定最上、搜尋、原型篩選、「對照 Jung vs Schmidt」；清單為動作列（姓名／長條＋數值＋「建立」，第二行 28px；長條 px＝6+94√(m/max)）；
>   群組標頭在搜尋或篩選縮減時顯示「顯示 / 總數」。選中態＝底色＋加粗。partial 狀態點為空心環（Ink 靠形狀）。
> - **象限派系配色**（`components/analysis/characterModel.ts`）：依派系人數排名配 cat-1…5（深淺交替），第 6 名起併入「其他」，無派系只描邊。同數時 #6d 沒有首次出現章節，退回後端回傳順序。
>   色值為全域 token `--cat-1…5／--cat-other`（`tokens.css`，見 DESIGN_TOKENS §3.7.2）。圖例可點：單獨亮出該派系（其餘泡泡 opacity 0.3），再點取消；「其他」可展開並逐派亮出。0 個派系時只留「此書未抽出派系」。
>   metrics 載入中不再閃出第四種錯誤（`quadrantStatus`）。
> - **語音風格**：四格＋語氣堆疊長條＋句長直方圖＋質性四段。語氣只有陳述／疑問／感嘆三段，對應平穩／探詢／激動家族色、依家族順序排列、≥8% 才寫標籤；
>   不放「語氣分布註」與暫時警語（ENG-001 已上線）。
> - **人格**：信心度三件套（長條＋高／中／低·N%＋門檻說明）；「未生成」（灰徽章＋覆蓋重新生成）與「生成失敗」（error 徽章＋重試失敗部分）分開。
> - **關係／弧線**：ego 節點多段關係加「N 段」角標；節點 tooltip 用 DS Tooltip（透明 HTML 命中區蓋在 SVG 上，因為 Tooltip 不能包 SVG `<g>`）；
>   象限泡泡的 SVG `<title>` 移除（hover 已在圖上寫名稱與數字），改 aria-label。弧線色帶依 `assignArcRows` 只在相鄰階段共享章時錯行。
> - **認知**：對照抽屜每列帶 mono 事件 id，並註明比對依據是事件 id。
> - **錯誤四分**：清單／詳情／語音／認知載入失敗走 `PageFailure`（{頁名}＝角色分析）；所有花 token 的觸發（建立、覆蓋重新生成、重試失敗部分、分析語音風格、兩個批次、補標 visibility）
>   撞到 503＋body 先顯示就地 `LlmUnconfiguredNotice`。生成失敗面板保留 task id，「重試」會真的重新送出。
> - **LLM 字符**：七個花 token 的鈕與三個確認框皆掛 `.ss-btn-llm`／`spendsTokens`。
> - **草稿・待設計定案（i18n `analysis:character.*`，共 9 句）**：`overview.quadrant.legendEmpty／legendOther／legendExpand／legendCollapse／legendAnalyzedRing`、
>   `arcPane.paletteNote`、`persona.confidenceThreshold`、`epistemicCompare.matchNote`、`list.frameworkNote`、`error.backToBook`（回書籍總覽，建議之後收進 common）。
>   派系圖例註 `overview.quadrant.legendNote` 為已裁決字串。

**證據已更新徽章（`isStale`，B-111）**：`feature-extraction` 重跑會換掉 EEP 的向量證據
與 CEP 的關鍵字，但**不**重生 event / entity id，所以快取保留而非刪除。保留卻不標示
等於讓一份過期分析看起來是最新的，因此四個端點（#6a / #6b / #7a / #7d）都回報
`isStale` / `staleReason`，而兩頁都必須顯示。用 `--color-info` 而非 warning：沒有任何
東西失敗，它與 `partial` 是正交的，可以同時出現。清單列沒有放文字的空間，所以在狀態點
之前多一顆 info 色圓點、說明放 `title`；完整文案的徽章在詳情標題列。

> 2026-05-16 重新設計：3-tab 平級結構（人物概覽 / 語音風格 / 認知狀態）、Overview 內 4 個 sub-tab、Framework 切換只在左清單、新增「框架對照」抽屜。設計交接見 `docs/plans/20260516-character-analysis-page-redesign.md` 與設計 project HANDOFF.md。
> 2026-07-17 canvas 對稿翻新：角色總覽 landing（排行/象限雙視圖）、清單排序與提及量 bar、ego-network、弧線時間軸、認知游標雙軌聚合、認知對照 drawer、生成中 checklist、原型篩選。計畫見 `docs/plans/20260716-character-page-revamp.md`。

#### 版面結構

```
[Left Panel 268px] [Content Area flex (relative — drawer overlays here)]
```

#### Left Panel — 角色清單

由上至下：

0. **批次面板**（DS v3 第 5 批 · 09·10，**最上方**，在框架軸之上；取代 2026-10-01 的「批次失敗面板」，見本節末「第 5 批 · 批次面板」）
1. **框架選擇**：Jung 12 / Schmidt 45 chip + 「對照 Jung vs Schmidt」按鈕（觸發 drawer）+「框架索引 ↗」連結
2. **原型篩選 dropdown**（`ArchetypeFilterDropdown`，2026-07 新增）：可搜尋多選 popover，列出當前 framework 的原型分類與各原型已分析角色數；選中值以可移除的 accent pill 呈現，只過濾「已分析」清單；切換 framework 時重置
3. **「← 角色總覽」返回鈕**（2026-07 新增；DS v3 修復後移出左欄）：詳情態放在標題列名字之前（accent 2xs 字）；未分析／生成中／失敗態沒有標題列，退到內容區頂端。點擊回到角色總覽 landing（清空選中角色）。研究者導覽條只在 landing 顯示
4. **搜尋欄**：即時篩選，placeholder 顯示總人數
5. **清單**（可捲動）：分「已分析」/「尚未分析」兩組

清單 item（卡片式，2026-07 對齊 canvas：兩行制，無文字 meta 行）：
- 已分析：依名字首字 hash 出 entity 配色頭像 + 名稱（serif）+ 名稱旁綠色狀態點（partial 為 warning 色），第二行為提及量迷你 bar（寬 `6+94·√(mentions/max)`%，accent）+ 右側 tabular 純數字提及數
- 未分析：muted 頭像 + 名稱（淡色），第二行為 muted bar + 純數字提及數，右側「建立」按鈕
- 兩組皆依 `mentionCount` 降冪排序；搜尋同時比對名稱與當前框架原型名
- 鍵盤：`↑/↓` 移動選取並載入、`/` 聚焦搜尋、`1/2/3` 切 primary tab（焦點在 input／textarea／select、`role=tab`、任一 `role=dialog` 內時不攔截；比對抽屜開著時全部停用）
- 清單列與排行列：列本身不可互動，內層 `button.ca-row-main` 負責選取（選中 `aria-current`），「建立」為其兄弟節點（不巢狀）
- 兩個比對抽屜（`useDialogFocus`）：開啟時焦點移到抽屜標題（`aria-labelledby`）、Tab 只在抽屜內循環、關閉後焦點還給觸發鈕；刻意不用原生 `<dialog>`（只蓋內容區，左欄保持可見）

#### 第 5 批 · 批次面板（09 角色，與 10 事件共用同一套四態）

決議紀錄 `09·10 批次面板收合`（2026-10-04 整份採用）、計畫 `docs/plans/20261004-ds-v3-batch5-supplement.md` Q3；元件 `BatchEepPanel`，四態與收合推導在 `batchPanelModel.ts`。

- **位置**：左欄最上（268），框架軸 Jung／Schmidt 讓到第二位；選了角色後面板仍在。landing 標頭只留視圖 toggle。
- **按鈕**：「生成全部」＝主鈕（`ss-btn-primary ss-btn-llm`）、「先生成前 10 位要角」歸子集（`ss-btn-secondary ss-btn-llm`，同事件頁「只生成核心」的排法）；
  兩顆照舊走 `ConfirmDialog`（文案不動）。狀態行「{n} 位待生成 · 已分析的角色會自動跳過」，無估時（角色沒有估時公式）。
- **四態、收合、失敗**：規則與事件頁相同，見 §3.5「第 5 批 · 批次面板」。角色版的收合列第 1 態是「{n} 位待生成」、第 4 態是「全部角色已分析 ✓」。
- **只看失敗**：左欄清單上方出現「失敗 N」chip（選中＝底色＋加粗，再按取消），選中時只留失敗的未分析角色（已分析群組隱藏；群組標頭既有的「顯示 / 總數」顯示筆數）；
  失敗的未分析列尾帶**菱形** error 點（形狀而非色相，Ink 四個 status 色同為墨色）。
- **batch 503**：`LlmUnconfiguredNotice` 在面板卡片下方（摺疊與否都看得到），不再重複出現在內容區頂。
- **字串**（i18n `analysis:character.batch.*`，zh-TW 與 en 皆有）。**2026-10-04 裁決通過**（D 區／C 區稿面）：`header`「角色分析」、`triggerAll`「生成全部」、`topSubset`「先生成前 10 位要角」、
  `remaining`「{n} 位待生成」、`statusLine`、`allDone`「全部角色已分析 ✓」、`failedShort`「失敗 {n}」、`showFailures`「只看失敗 ({n}) →」、`runningWithCount`（沿用事件頁句型）。
  **這 5 句是草稿・待設計定案**（稿沒給角色版文字，依事件頁對應句意翻；i18n `character.batch.*`；JSON 不能寫註解，故記在此）：
  `running`「分析中」、`summaryProgress`「本批次共處理 {n} 位」、`errorFallback`「批次執行失敗」、`stat.generated`「已生成」、`stat.skipped`「已跳過」
  （`stat.failed`「失敗」與已裁決的「失敗 {n}」同詞，一併列入 i18n 但不另計）。
- 改版後無呼叫端的 `character.overview.batchAll／batchTop10／batchProgress`、`character.batch.toastClose`、`.ca-ov-batch-progress` 已刪（2026-10-04 刪除，B-129）。

#### Content Area — 角色分析內容

頂部固定一條 **Tip Ribbon**（首次進入顯示，localStorage `storysphere:tip-dismissed:character-analysis` 永久 dismiss）。

**未選取角色時（角色總覽 landing，2026-07 重做，取代舊版「快速前往已分析角色」）**：
- **此書 0 位角色**：整個 landing 換成 `EmptyState`（prerequisite）「此書尚未抽出角色」＋說明＋「前往建構概覽」（`/books/:id/unraveling`，沿用 `graph:onboarding.cta`）；不畫視圖 toggle／象限／排行。左欄批次面板隱藏，清單只留一行「尚無角色。」（見 DS_V3_DESIGN_FEEDBACK CA-2）。**這 3 句是草稿・待設計定案**（i18n `analysis:character.overview.empty.{title,description}`、`character.list.empty`）
- 標頭：「角色群像」h1 + meta 計數列（N 位角色 · 已分析 · 未分析）+ 右側**只留視圖 toggle**（兩顆批次鈕與執行中進度已搬進左欄批次面板，第 5 批 09·10）
- Segmented toggle 切「定位象限」（預設）/「提及量排行」
- **定位象限**：SVG 散點圖 + 右欄派系圖例卡；X = normalized log10(mentionCount+1)、Y = normalized pagerank（#6e `character-metrics`）、泡泡半徑 = 關係數（degree，上限封頂）、顏色 = 派系（#6d `factions`，無派系 = 透明+muted 描邊）；兩軸中位數虛線十字；提及前 8 名恆顯示 label，其餘 hover 顯示；metrics 端點失敗時降級顯示錯誤佔位（排行視圖不受影響，只依賴 #6a）
- **提及量排行**：Hero 卡（提及最高者，已分析→「查看分析」/ 未分析→「建立核心角色分析」）+ 排行列（預設 11 列 + 展開/收合）
- 元件：`frontend/src/components/analysis/overview/`（`CharacterOverviewLanding.tsx` / `QuadrantView.tsx` / `RankingView.tsx`）

**未分析角色（`UnanalyzedCharacterDetail`，2026-10-09，CA-5）**：角色名 h1＋「在圖譜中查看 ↗」；三格免費資料（提及次數 #6a／關係 #6e degree／派系 #6d：「與 A、B 等 N 人同派系」或「無派系歸屬」，載入中「—」）；卡片列「生成後會得到」四項（人格與原型、行為與關鍵事件、關係網與代表引言、發展弧線）＋「語音風格與認知狀態在分析完成後另外生成。」＋ primary `ss-btn-llm`「建立角色分析」＋「會呼叫 LLM，消耗 token」。不新增請求。**新字串為草稿・待設計定案**（i18n `analysis:character.unanalyzed.*`）。

**標題列**：角色名（serif 28px）+ Framework badge（顯示當前 framework + primary archetype，不可點擊切換）+「提及 N 次」meta（取代舊版 `Ch.X`，2026-07 隨 #0 提及數修復同步更新）+「在圖譜中查看 ↗」+「框架對照」+「覆蓋重新生成」按鈕

**Primary Tab**（標題列下方，三選一，underline 樣式）：

| Tab | 內容 |
|-----|------|
| 人物概覽 (overview) | 4 個 sub-tab pill segmented control → 對應 4 個 pane |
| 語音風格 (voice) | VoiceProfilingPanel — 進 tab 先以 #16a `cached_only=1` 探測（200→直接顯示 / 404→空狀態+「分析語音風格」鈕；不再使用 localStorage gate）；內容為 4 stat card + ToneDistribution 堆疊條 + SentenceHistogram 直方圖 + 質性 section。「覆蓋重新生成」走 #16a `force=true`（ENG-001，成功才覆蓋）：失敗時舊 profile 照常顯示，上方 503 接 LlmUnconfiguredNotice、其他錯誤顯示「重新生成失敗，已保留原有語音風格。」（**這 1 句是草稿・待設計定案**，i18n `analysis:character.voice.regenerateFailed`） |
| 認知狀態 (epistemic) | EpistemicStateSection — Summary 列（「第 N 章」hero 計數 + 已知/未知/誤信 +「對照另一角色」鈕）+ 章節游標卡 + 已知/未知並排 + 誤信欄（三欄皆隨游標樂觀過濾）。一律以 #12e `cached_only=1` 讀取：該章誤信未推論（`misbeliefsInferred=false`）時徽章與欄計數顯示「—」，欄內「截至第 N 章的誤信尚未推論。」＋「推論誤信」（`ss-btn-llm`，不開確認框）＋「會呼叫 LLM，消耗 token」；推論後仍未推論 → `LlmUnconfiguredNotice`（見 DS_V3_DESIGN_FEEDBACK CA-1）。**這 4 句是草稿・待設計定案**（i18n `analysis:character.epistemic.{misbeliefPending,inferMisbeliefs,inferringMisbeliefs,inferMisbeliefsFailed}`） |

**Overview sub-tabs**（pill segmented control，2026-07 canvas 對稿重構）：

| Sub-tab | 內容 |
|---------|------|
| 人格 (persona) | 角色簡介（serif 段落）+ 原型卡（primary/secondary + 信心度條 + 「切到對照」+ 編號證據列）+ 個性特質 grid（`minmax(240px,1fr)`，以「：」拆詞+描述） |
| 行為 (behavior) | `cep.actions` bullet + 關鍵事件卡（依章排序，mono Ch.N + significance；名稱比對得到的事件附「在事件分析頁查看」連結，帶 `state.selectId`） |
| 關係 (relations) | **ego-network SVG**（當前角色 hub + 橢圓佈局 + 曲線邊依型別著色：敵人/盟友/下屬/成員/其他 → entity 色相，未知型別 fallback 其他；角色 target 可點切換）+ 按對象分組關係卡（「N 段」badge + 型別 pills）+ 代表引言 |
| 弧線 (arc) | 章節軸（動態 Ch.1–N）+ phase 色帶（`chapterRange` 為 `a-b` 或單章 `n`，單章畫一章寬）（`--narrative-*-border` 按索引輪替，相鄰共享邊界章時錯行堆疊）+ keyEvents marker + 可點 phase 卡（與色帶同步高亮） |

**生成中狀態**（`CharacterGenerating`，2026-07 新增）：置中 420px 卡 — spin icon + 角色名 + mono TASK ID + 進度條 + 6 步 checklist；步驟由後端 5/30/85 三個 progress 事件推導（步驟 2–5 為同一並行組），對映見元件內 `deriveStages` 註解。

**Framework 切換**：唯一入口在左清單頂部 chip；切換只影響顯示（archetype 跟著切換），不重打 API。標題列 badge 僅顯示當前框架，不可點擊。

**原型名稱語言**：#6a／#7a 回的原型名是**書本語言**。前端以中英兩套原型表共用的 id 對照（`characterModel.archetypeIdOf`），標題列 badge、人格原型卡、框架對照抽屜、清單搜尋都**依介面語言**顯示；原型篩選以 id 計數與比對。對不到 id 的名稱（LLM 變體）照原名顯示、以原名篩選。

**框架對照 Drawer**（右側 640px 抽屜）：
- 觸發點：標題列「框架對照」按鈕、PersonaPane 內 archetype section 的「切到對照」連結、左清單下方「對照 Jung vs Schmidt」連結
- 內容：2 欄並排，Jung 12 / Schmidt 45，各欄顯示 primary（accent serif）/ secondary / 信心度條 + % / 證據（左框 items）
- 關閉：點 backdrop / 點關閉按鈕 / Esc 鍵

**認知對照 Drawer**（右側 720px 抽屜，`EpistemicCompareDrawer`，2026-07 新增 #10）：
- 觸發點：認知 tab summary 列「對照另一角色」按鈕；與框架對照 drawer 同時只開一個（頁面層 `drawerOpen: null|'framework'|'epistemic'`）
- 第二角色下拉（列全部角色，預設未選；選了才打 #12e）；兩角色共用一條章節游標
- 三欄集合差（**以 event id 運算**）：「只有 A 知道」(accent) /「都知道」(success) /「只有 B 知道」(info)，各欄計數 + 事件列
- B 側資料 loading / `dataComplete=false` 時顯示對應提示不噴錯
- 兩側皆以 #12e `cached_only=1` 讀取（抽屜只比對已知事件，不需誤信），開關抽屜、選第二角色、拖游標都不觸發 LLM；抽屜關閉時不發請求

**Chapter Timeline（Epistemic tab，2026-07 重構）**：
- 拖曳游標更新章節；**200ms debounce** 後才打 epistemic API；拖曳期間以最近一次的回應做樂觀更新（filter `chapter <= cursor`，三欄一致）
- 雙軌 marker：已知綠 pill 於上軌、未知 warning pill 於下軌，**同章多事件聚合為一顆帶數字的 pill**（hover title 列事件名）；只顯示 ch ≤ 游標的 marker
- 拖曳用原生 `<input type="range">` overlay（保留鍵盤/aria 可存取性，canvas 的 pointermove 版之有意偏差）
- **可拖曳的外觀（2026-10-09，CA-4）**：游標為 18px 把手（紙底、accent 框＝`--btn-border-width`＋1px、`--pill-radius`，中間兩條握把線），軸上 `cursor: grab`／按住 `grabbing`、hover 換 `--bg-tertiary` 底；range 取得 `:focus-visible` 時把手畫全站焦點環。軸下一行 muted「拖曳或按 ← →」（**草稿・待設計定案**，i18n `analysis:character.epistemic.cursorHint`）
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

點擊「覆蓋重新生成」（標題列、人格「未生成」／缺原型橫幅、語音分頁三處同一閘門）：
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

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#6a（角色清單）、#6c（重新生成）、#6d（派系，角色總覽象限視圖顏色）、#6e（角色中心性，角色總覽象限視圖 Y 軸/泡泡大小）、#7a（角色分析詳情）、#7b（觸發分析）、#7c（清除分析）、#7h（批次分析，支援 `entityIds` 子集）、#8（任務 polling）、#12e（認知狀態）、#16a（語音風格，含新增的 toneDistribution / sentenceLengthHistogram）

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

#### DS v3 第 3 批 · 10 改版後的現況（優先於下方舊描述）

決議紀錄 10、批次計畫 `docs/plans/20261002-ds-v3-batch3-analysis.md`。下方舊版面描述與本段衝突處以本段為準。

- **密度**：B 檢視。內容區 padding `--space-7`（24）／下 `--space-8`（32）、內層 `max-width: 1280` 置中、區塊間距 `--space-6`（16）；
  左欄 268 固定、背景 `--bg-primary`、右緣 `--line-weight` 分隔線。間距只用 `--space-1…8`。
- **批次面板（`BatchEepPanel`）**（第 5 批 09·10 已改寫四態與收合，見下方「第 5 批 · 批次面板」，本條只留按鈕規格）：主鈕「一鍵生成全部 EEP」`ss-btn-primary ss-btn-llm`，走確認框。
  子集區在主鈕正下方**同一張卡**、不收折疊；子集鈕（只生成核心 (N)／只生成本章／生成已勾選 (N)）都掛 `ss-btn-llm`（「勾選多筆」是 `ss-btn-secondary`、不掛字符），三顆各佔一行、寬度隨內容靠左，
  筆數寫在標籤裡、**直接執行不開確認框**（不對稱是設計決定）。disabled 的鈕外層掛 `Tooltip`（逐字 `batch.kernelOnlyDisabled`／`batch.chapterOnlyDisabled`）。
  執行中整區子集隱藏、主鈕變 disabled「分析中 N/M…」（N／M＝**本次 run** 的 `subProgress`／`subTotal`，不是全書已分析數；task 尚未回報 `subTotal` 前退回全書計數）＋ stage ＋ ▶ live（stage 太長時 Tooltip 顯全文）。
  完成後面板顯示三格計數＋失敗**數**（第 5 批起不再列失敗清單），不再有「批次 EEP 分析完成」那一列（只在 toast），也沒有面板內關閉鈕（見 feedback 3-EV-7）。
- **清單列（`EventListItems`，動作列·行內按鈕變體）**：一行格線 `24px · 1fr · 12px`，第二行固定 28px（章號、非順敘 chip、stale 小點、未分析列的「生成分析」`ss-btn-llm`）。
  狀態點與按鈕二擇一（已分析＝success 點、partial＝空心 warning 環、生成中＝accent 脈衝點）。選中＝`--bg-secondary` 底＋加粗，無邊框／inset。
  剛完成**不整列高亮**，只有狀態點短暫放大後落定為 success。組標頭（list-group-head）「{總數} · 已析 {已分析數}」逐字。
  勾選模式：只有未分析列長 checkbox。勾選模式的控制項在**清單**（10 提案 C 區）：清單頂一列「取消勾選」（accent 文字）＋右側「已勾選 N」，清單底 primary「生成已勾選 (N)」（`ss-btn-llm`，N＝0 或批次進行中 disabled）＋一行說明「已分析的列不長 checkbox——勾了也不會重跑。」；
  面板的「勾選多筆」在勾選模式中隱藏。「只看失敗」篩選中，未分析列的第二行改為「第 n 章 · <failure.reason>」（mono，過長換行；資料取自批次結果 `failures[].reason`，不帶「生成分析」鈕）。
- **骨幹圖**：核心帶節點名超過 **5 字**截斷（`eventBackboneModel.truncateNodeLabel`，以 code point 計）；帶高＝該帶最密集章節節點數 × 行距 ＋ 上下各 14
  （`bandHeight`）；核心／衛星有帶標籤、未定沒有；節點的懸停說明改走 `Tooltip`。
- **LLM 字符**：英雄卡「建立事件分析」、排行未分析列「生成分析」、整本零分析橫幅、詳情工具列「重試失敗部分」「覆蓋重新生成」、
  未分析詳情「建立分析」（旁附「會呼叫 LLM，消耗 token」，沿用 `tension.state.tokenHintShort`）都掛 `ss-btn-llm`；導航／模式切換／勾選模式不掛。
- **錯誤態四分**：{頁名}＝`nav:tabs.eventAnalysis`。
  1. 清單載入失敗 → `PageFailure`（`failureKind` 判 page／backend，page 版帶「回書籍總覽」＝既有 `analysis:character.error.backToBook`、技術細節）。
     原本落成 `event.empty.subtitle` 空狀態文案的行為已移除。
  2. 詳情載入失敗（清單說已分析但抓取失敗）→ 獨立分支，兩句逐字（`event.detailError.*`）＋重試；**裸 502（無應用層 body）改走後端失敗變體**。
  3. 所有花 token 的觸發（單件生成、覆蓋重新生成、重試失敗部分、一鍵全部、三個子集）失敗先判 `isLlmUnconfigured` → 就地 `LlmUnconfiguredNotice`
     （單件／覆蓋／重試顯示在內容區頂；批次顯示在左欄面板內，取代一般批次錯誤文字）。
- **單件生成（2026-10-10）**：頁面一次追蹤一件（`generatingId`＋模式）。建立、覆蓋重新生成、重試失敗部分三種觸發都標記該件，左欄列帶生成中點。
  - **只停住正在生成的那件**：生成中點別的事件照常看詳情／原文段落；「生成中」轉圈與失敗面板只在選到那件時出現；完成時刷新的是生成的那件（不是當下選取）。
  - **失敗面板**：`ss-btn-primary ss-btn-llm`「重試」（以原模式對同一件再觸發，不開確認框——同原本的建立）＋ secondary「關閉」（回原畫面）；字串沿用 `common.retry`／`common.close`。
    失敗後列上不再顯示生成中點。
  - **接手**：進頁面時查 #7l，有進行中的單件就接著追蹤；#7e 回 409 `analysis_running`（另一分頁已在跑）時同樣接手，不顯示錯誤。
  - **生成中停用其他觸發**：單件生成中，其他事件的「生成分析」（左欄列、排行英雄卡與列）、未分析詳情「建立分析」、已分析詳情「覆蓋重新生成」「重試失敗部分」
    皆 disabled，`Tooltip`「另一件事件正在生成，完成後再試。」（`event.generating.blockedBySingle`）——頁面一次只追蹤一件，第二件會在背後跑卻沒人看。
    **批次執行中**，未分析事件的「生成分析」「建立分析」disabled，`Tooltip`「批次正在執行，這件會包含在內。」（`event.generating.blockedByBatch`）；
    已分析事件的「覆蓋重新生成」照常可用。兩句是**草稿・待設計定案**（見 DS_V3_DESIGN_FEEDBACK EV-2）。
    左欄列與排行列的「生成分析」停用時用 `aria-disabled`（不是 `disabled`）：仍可聚焦、Tooltip 照常，點擊改為**選取該事件**、不觸發生成（2026-10-10 裁決）。
- **列結構（a11y，2026-10-10）**：左欄動作列與排行列本身不可互動，內含一顆選取鈕（`.ea-row-main`／`.ea-ov-rank-main`，整列可點、左欄帶 `aria-current`）；
  「生成分析」是**兄弟節點**（左欄疊在第二行右側），不再巢狀在可點的列裡。故事骨幹圖每個節點帶 `aria-label`「標題 · Ch.N · 重要度 · 已分析／尚未分析（· 敘事模式）」，皆既有字串。
- **鍵盤與狀態（a11y，2026-10-10）**：詳情分頁為 WAI-ARIA tabs（roving tabindex，←／→ 循環、Home／End，`aria-controls` → `role=tabpanel`）；
  對比抽屜用 `useDialogFocus`（開啟時焦點到標題、Tab 只在抽屜內循環、關閉後回「對比」，`aria-labelledby`）；篩選 chip、分組與三視圖切換帶 `aria-pressed`，
  群組標頭帶 `aria-expanded`；搜尋欄 `aria-label` 同 placeholder。
- **減少動態**（`prefers-reduced-motion: reduce`）：生成中點改靜態實心、完成時放大與 landing fade-in 拿掉、spinner 放慢到 3s、骨幹節點 hover 不放大。
- **窄寬（2026-10-10）**：故事骨幹圖以 `useElementWidth` 量繪圖區實際寬度，每章欄寬＝寬 ÷ 章數（`fitNode`）。圓點直徑不超過欄寬 − 4（最小 8px，各帶行距不變）；
  核心帶標籤寬上限＝欄寬 − 6（最多 80px、超出省略號），容不下 40px 就不畫標籤（靠 Tooltip 與節點 `aria-label`）。名字的潮汐（10 章）：1024 標籤約 4 字、720 無標籤；
  標籤重疊 720／1024 由 88／46 對降為 0、圓點重疊 720 由 49 對降為 0。左欄 268px 維持常駐（同角色頁，見 B-123；收合模式待全站一起定）。
- **回到原文（2026-10-10）**：
  - 證據分頁的關鍵引言以 #7m 對回段落：對到唯一段落者用 `SourceJumpText`（虛線底線，Tooltip「點擊跳至閱讀頁對應段落」＝`character.sourceJump.cta`），點擊 `navigate('/books/:id', { state: { paragraphId, chapterNumber } })`；
    對不到者維持純文字、不加標記（使用者裁決）。樣式 `.ca-srcjump*` 已移到 `ss-kit.css`（角色頁、事件頁共用）。
  - 未分析事件「原文段落 · 生成前先判斷」每段標頭（章號、相似度後）加 `ss-btn-ghost`「在閱讀頁開啟 →」（`event.source.openInReader`，**草稿**），以 #7i 的段落 id 直接跳轉。
- **原生 `title=`** 全部換成 `Tooltip`（14 處；值為 "·" 的那個直接拿掉）。
- **新字串**：無。
- **維持現況（記 feedback）**：landing 沒有對比入口（3-EV-2）、victim 顯示「承受者」（3-EV-3）。

#### 第 5 批 · 批次面板（09·10 共用，事件頁與角色頁同一套）

決議紀錄 `09·10 批次面板收合`（2026-10-04 整份採用）、計畫 `docs/plans/20261004-ds-v3-batch5-supplement.md` Q3。元件 `BatchEepPanel`；
四態判定、失敗 id 推導、覆寫鍵都是純函式（`components/analysis/batchPanelModel.ts`，有 vitest），收合覆寫在 `hooks/useBatchPanelCollapse.ts`。268 欄寬內的卡片
（`--card-border-width`／`--card-radius`／`--bg-primary`，內距 `--space-5`；收合列與第 4 態內距 `--space-4 --space-5`）。

| 態 | 判定 | 預設 | 卡片內容／收合列右端 |
|---|---|---|---|
| 1 有待生成 | 未分析 > 0、本次瀏覽沒跑過批次 | 展開、可收 | 展開：標頭「n/N · pct」、進度條、狀態行、主鈕、子集。收合：「{n} 件待生成」＋進度條 |
| 2 執行中 | 批次 running | 維持當下（**開始執行不強制展開**）、可收 | accent 邊框＋進度條＋階段文字＋live＋disabled「分析中 N/M…」；收合：spinner＋「分析中 N/M…」＋邊框＋進度條 |
| 3 完成，有失敗或仍有待生成 | 本次瀏覽跑完過一批，且仍有失敗或待生成 | 展開、可收 | 狀態行「本批次共處理 N 件」、主鈕、分隔線下三格計數＋「只看失敗 (n) →」；收合列「失敗 {n}」**優先於**待生成數 |
| 4 全部已分析，無失敗 | 未分析 = 0 且失敗 = 0（總數 > 0） | **不可收合** | 一條狀態列「事件分析　全部事件已分析 ✓」：無展開鈕、無進度條 |

- **標頭列整條是切換目標**（`button`＋`aria-expanded`，原生 Enter／Space）。收合列上的失敗數是獨立的 `button`（零成本、無字符），同「只看失敗」；其餘標頭仍切換。進度條前三態都在，欄位上緣不跳。
- **收合覆寫**存 localStorage `storysphere:batch-panel:<bookId>:<events|characters>`（值 `collapsed`；展開＝沒有鍵）。事件頁與角色頁互不影響。
  **進入第 4 態時清掉覆寫**，所以計數回升回到第 1 態就是預設展開。localStorage 不可用時退回只在本次元件 state 內切換。
- **失敗**（計畫 Q3，只在本次瀏覽）：面板只放失敗**數**＋「只看失敗 (n) →」，不列清單。n＝批次結果 `failures`（角色 `entity_id`／事件 `event_id`）中**目前仍在未分析清單**的項目數——
  失敗後單筆補生成成功的就不再算；沒帶 id 的舊結果退回 `failed` 計數、只顯示數字不顯示連結。重試＝再按主鈕（已分析的跳過）。重新整理後回到第 1 態。
  「只看失敗」把左欄清單篩到失敗項：事件頁在篩選 chip 列多一顆「失敗 N」（選中＝`.ea-chip.active`，再按取消、「清除篩選」也會清掉）；失敗的未分析列尾帶**菱形** error 點（`.ea-row-dot.failed`，形狀＋Tooltip「失敗」）。
  開始新一批會重設篩選。第 3 態「只看失敗」下方帶 run-scoped 提示 `batch.failures.hint`（事件頁、角色頁共用同一句：「…此清單只屬於剛才那次執行，重新整理後不會保留。」）。
- **子集**（第 1 態才顯示）與主鈕同進同出；第 3 態不顯示子集（稿 A 區第 3 態沒有，見 feedback 5-BP-3）。事件頁狀態行把「{n} 件待生成 · 預估約 N 分鐘 · 已分析的事件會自動跳過」併成一行（皆既有字串）。
- **字符**：主鈕與子集鈕 `ss-btn-llm`；「只看失敗」、收合切換、失敗 chip 不掛。
- **toast**：只當完成通知，有失敗也 5.2s 自動消失（類型仍 warning）。
- **接手進行中的批次**（2026-10-10）：進頁面時先查這本書是否已有批次在跑（事件 #7k／角色 #7j／象徵頁 #15k），有就直接進第 2 態並接著顯示進度，不再給可按的主鈕——離開再回來不會開出第二輪重複花 token。觸發時後端回 409 `batch_running`（例如另一個分頁已經開始）也照此**靜默接手**，不顯示錯誤、不跳 toast。查詢失敗時維持原態。
- **batch 503**：`LlmUnconfiguredNotice` 放在卡片下方、摺疊之外。
- **字串**：2026-10-04 裁決通過、**非草稿**：`batch.remaining`「{n} 件待生成」（既有）、`batch.failedShort`「失敗 {n}」、`batch.showFailures`「只看失敗 ({n}) →」（事件版）；角色版見 §3.4。
  既有事件字串一字不改。
- i18n `batch.toastClose` 已刪（2026-10-04 刪除，B-129）。面板自己的舊樣式（`.ea-batch-hint`、`.ea-batch-count`、`.ea-batch-stat.skipped|failed`）隨面板版面改寫一併換掉。
  `BatchFailureList` 與 `batch.failures.*` 仍被符號頁（`SymbolsDashboard`）使用，**不是孤兒**。

**內容區第二輪（照決議紀錄 10 A／B／E／F／G／H／I canvas 原始碼）**

- **Landing 順序**：研究者導覽條（`event-overview`）→（整本零分析時）`color-info-bg` 橫幅 → 標題列（serif 2xl「事件圖景」＋ 一行 muted meta
  「N 件事件 · 已分析 N · 未分析 N · 核心 N」，不上色）＋右側三視圖 `.ss-seg`（無圖示、無橘色填色）→ 視圖。
- **骨幹圖**：`bg-secondary` 卡＋border、padding `--space-6`；帶標籤左上；章節欄線、中央「未定」帶上下虛線；章號軸在卡內底部（只寫數字）；
  卡下依序 caption、一行圖例（**五種模式固定全列**＋「大圈 = 核心事件」「虛線圈 = 尚未分析」「橫軸 = 章節順序」）、無章節註腳。節點等分欄置中（左留 52px 放帶標籤）。
- **重要度排行／事件脈絡**：各一張 `bg-primary` 卡；排行＝#1 英雄卡（已分析：accent 框＋`bg-secondary`、副標「Ch.N · 參與者 N 人」、「查看詳情」；未分析：一般框、`ss-btn-llm`「建立事件分析」）＋
  `#N` 列（16px 徽章、章號、70×5 長條、「N 人」、未分析列 `ss-btn-secondary ss-btn-llm`「生成分析」）＋「展開其餘 N 件事件」文字連結＋caption 在卡內。
  脈絡＝縱向步驟卡，每步帶「共享 …」（取自相鄰關係的共享參與者），步間細箭頭；空態為虛線框；caption 逐字在卡內。
- **左欄**：篩選 chips 選中＝`--bg-tertiary`＋加粗（不再橘色填色）；「章節序／重要度」改全寬 `.ss-seg`、置於 chips 之下，不再有「分組」小標；篩選空＝一行文字＋ghost「清除篩選」。
- **詳情標頭（E）**：同一列放「← 返回總覽」＋標題（serif 2xl）＋核心／衛星徽章，右側「（重試失敗部分）對比／在圖譜中查看／覆蓋重新生成」；
  下一行 meta：Ch.N · 敘事 chip（**順敘不出**）· 重要性一句 · 「部分分析」「證據已更新」（`ss-badge-warning`，stale 帶 Tooltip）；再導覽條（`event-detail`）；再底線分頁（選中＝底線＋加粗，非橘字）。
  未分析／載入中／錯誤時只有一行「← 返回總覽」。
- **概覽**：主題意義＋事件摘要同一張 `bg-secondary` 平卡（標籤 2xs muted、不大寫；主題句 serif sm 非斜體）；前後狀態三格（之前｜箭頭｜之後，之後 accent 框）；
  「結構角色」「重要性」兩行、降級註記緊貼值之後；參與者圖例一行（只列此事件用到的角色，少於 2 種不顯示）＋兩欄卡。六桶角色色用 `[data-role]` 區域變數
  （initiator→char、actor→loc、reactor→con、beneficiary→obj、victim→error、witness→muted），Ink 下靠文字標籤區分。
- **因果與影響／上下文位置／證據（F）**：平卡；因果鏈 `01 02…`、影響兩欄、因素／後果兩欄；上下文為 prior／subsequent 兩欄（無中間箭頭）、卡內 16px 徽章與「共享 …」、
  「還有 N 個」文字連結、caveat 在底部灰卡；證據為 2px 左線引言＋12 條 TF 長條（5px）。
- **原文段落 · 生成前先判斷（G）**：整個內容區的主體卡（meta：· 徽章、Ch.N、非順敘 chip、「尚未分析 · 重要度未定」；serif xl 標題；說明；相似度 accent mono 數字的灰底段落；但書；「建立分析」＋token 提示）。
- **對比抽屜（H）**：760px；標題列＋圖示關閉鈕；兩個下拉並排；72px · 1fr · 1fr 對齊三列（之前／之後／對參與者）。
- **詳情載入失敗（I）**：維持 `ss-state`，圖示改圓形 alert、重試 `btn-sm`。
- **敘事 chip**（左欄與詳情共用 `.ea-narr`）：模式色底＋模式色框＋主文字色（Ink 靠文字）。
- **新字串**：無（「尚未分析 · 重要度未定」由既有 `notAnalyzed`＋`event.overview.undetermined` 組成；`groupLabel`、`legendNarrative` 已不渲染，key 保留）。
  稿上有而 i18n 沒有的對比「參與者」列未做，見 3-EV-8；導覽條樣式見 3-EV-9；左欄徽章尺寸見 3-EV-10。

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
   [只生成核心 (N)]
   [只生成本章]
   [勾選多筆]  →  （清單頂「取消勾選」、清單底「生成已勾選 (N)」）
   預估耗時 約 N 分鐘 · 已分析的事件會自動跳過
   ```

   | 按鈕 | disabled 條件 |
   |------|--------------|
   | 只生成核心 | `N === 0`。未分析事件的 `importance` 恆為 `null`（#6b），故在生成前 N 必為 0；tooltip 說明「重要度需生成 EEP 後才判定」 |
   | 只生成本章 | 未選取任何事件時 — 章節取自當前選取事件 |
   | 生成已勾選 | 僅在勾選模式顯示（在清單底，不在面板內），`checkedCount === 0` 時 disabled |

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

- **此書 0 件事件**（未建知識圖譜，或抽取沒有產出事件）：整個 landing 換成 `EmptyState`（prerequisite）「此書尚未抽出事件」＋說明＋「前往建構概覽」（`/books/:id/unraveling`，沿用 `graph:onboarding.cta`）；不出上面的引導橫幅（它的批次生成在 0 件時無事可做），也不畫視圖 toggle／骨幹圖。左欄批次面板、搜尋欄、篩選 chip 與分組切換都隱藏，清單只留一行「尚無事件。」（見 DS_V3_DESIGN_FEEDBACK EV-1）。**這 3 句是草稿・待設計定案**（i18n `analysis:event.overview.empty.{title,description}`、`event.list.empty`）

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

**證據已更新徽章（`isStale`，B-111）**：`feature-extraction` 重跑會換掉 EEP 的向量證據
與 CEP 的關鍵字，但**不**重生 event / entity id，所以快取保留而非刪除。保留卻不標示
等於讓一份過期分析看起來是最新的，因此四個端點（#6a / #6b / #7a / #7d）都回報
`isStale` / `staleReason`，而兩頁都必須顯示。用 `--color-info` 而非 warning：沒有任何
東西失敗，它與 `partial` 是正交的，可以同時出現。清單列沒有放文字的空間，所以在狀態點
之前多一顆 info 色圓點、說明放 `title`；完整文案的徽章在詳情標題列。

**詳情載入失敗**：#6b 說某事件已分析、但 #7d 取不回來時，內容區顯示錯誤態
（`event.detailError` + 重試鈕），**不得掉回總覽落地頁**。條件判斷本身要帶
「該事件在 #6b 的 analyzed 清單裡」——否則就與「未選取事件」這個正常的總覽情境混在一起。
此條列出來是因為它曾經缺席：#7d 因一行過期的 import 對每個已分析事件回 500，
而前端的三元串接沒有錯誤分支，於是靜默落到總覽，看起來像「事件細節不見了」。

**四分頁（EventAnalysisDetail）**：

| 分頁 | 內容 |
|------|------|
| 概覽 | 主題意義 + 摘要 hero、事件前後狀態、參與者角色（含色彩圖例）。事件前後狀態區塊裡的「結構角色」（`eep.structuralRole`，Setup/Inciting Incident/Climax 等英文標籤）與緊鄰的「重要性」（Chatman kernel/satellite，見 3.14）並列，容易被讀成同一級理論——前者是三幕劇編劇慣例、非嚴謹敘事學分類，故其值下方加一行 `structuralRoleHint` 小字澄清，不開方法論頁條目。 |
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

#### DS v3 第 4 批改版（4-3，現況；與下方 2026-07 描述衝突處以本段為準）

分級 **A 工作台**（12／8／8／4、無 max-width）。樣式在 `styles/graph.css`（`kg-*`），純邏輯在 `components/graph/graphPanelModel.ts`（含 vitest）。

- **版型**：`kg-page` 直排＝工具列（扁平條，不再浮在畫布上）／`kg-stage`（畫布＋所有浮動物件）／圖例帶（貼畫布下緣）。導覽條位於 stage 內、工具列之下（5-1 起為 `.ss-guidance.is-float`：stage 內 `top`／`left` 皆 `--space-5`、max-w 430，工具列換行時跟著下移；沒有改用滿版的 `.ss-guidance-bleed`，因為滿版帶會壓在畫布邊緣的未連結實體 chip 與 lens 卡上）。
- **工具列一列**（控制項高 32、型別 chip 高 22）：鏡頭 segmented 每格帶 11px 副標；搜尋；重設視圖；7 顆型別 chip（唯一開關，`aria-pressed`；**「事件」預設關閉**——事件常佔節點過半、淹沒關係結構，點 chip 才顯示；「重設視圖」回到此預設；從搜尋／深連結／面板選到隱藏類型的節點時自動打開該類型。右下統計在個別鏡頭顯示「畫布上／全書」，如「34／100 節點 · 50／244 關係」，相同時只顯示一個數）；推論鈕＋其下常駐「無 token 成本」。放不下時整列換行、不裁切；推論群靠右（popover／選單向左展開）。
- **圖例帶**：帶頭「目前鏡頭 · {mode}」；型別列 7 類全列（含 0；社群整列不出現）；四色只在個別鏡頭，類型鏡頭不渲染關係色，社群只有「敵對（虛線）」；右端「型別開關在上方工具列」（社群不顯示）。整條不可點。右內距讓出浮動聊天鈕。
- **群集概觀**：「此檢視範圍」「怎麼分的」兩卡在社群面板**頂端**常駐；列尾無「⋯更多」；無派系／非角色宣告保留；進階群集設定四項（偵測算法只顯示現值 `greedy_modularity`，後端不收參數），重新運算零成本、不掛字符、旁註「零成本」。
- **右欄**：共用 `GraphRightRail`（主面板統一 320），頂端 11px「目前顯示 · {name}」＋四點（純標示、不可點）。優先鏈 compare > inferred > cluster > entity（`resolveRailPanel`）。次級面板（深度分析 360、相關段落 400）**往左疊**在主面板左側（主面板固定貼右、保持 320 不關閉；使用者 2026-10 裁決照稿 14 D 區／README §3.4）、一次一個，**只在實體／事件面板為主面板時存在**（修掉與審查面板重疊）。右下角 stats／迷你地圖／縮放讀實際欄寬定位（修掉寫死 280）。
- **窄舞台（最小支援 720px，2026-10-09，`graphPanelModel.railLayout`／`cornerStackCompact`）**：畫布放不下「主面板＋次級面板＋至少 280px 畫布」時，次級面板**改為蓋在主面板上**（貼右，不往左推、不裁切），關掉即回到主面板；角落元件（統計／迷你地圖／縮放）與左下 Lens 卡會相撞時改**精簡**——拿掉迷你地圖，統計＋縮放移到畫布右上角，與導覽條同列放不下時排到導覽條下方。浮動導覽條最寬 430，但不伸進右欄底下（跟著畫布剩餘寬度縮）。
- **浮層關閉與無障礙**：推論 popover／重新推論選單、Lens 角色選單、未連結實體抽屜皆可按 Esc 或在外面按下滑鼠關閉（`hooks/useDismissOverlay`），Esc 關閉後焦點回到開啟它的按鈕。Lens 分頁為 `role="tablist"`／`tab`／`tabpanel`，左右方向鍵（Home／End）切換並以 roving tabindex 管理焦點。面板關閉鈕、縮放鈕、群集步進鈕的 aria-label 走 i18n（`graph.json` 的 `a11y.*`）。
- **事件面板**：參與者只渲染 `<型別> <名稱>` chip；location 死碼刪除。**比較面板**：三欄表＋「建議推斷關係」顯示 `type · 共同鄰居 N 個 · Adamic-Adar x`；採用不再送 `relationType`（修 422）。「展開全部 N 段」用既有「查看相關段落 →」。
- **推論**：執行中只有轉圈＋「推論中…」、無進度條；採用／否決零成本不掛字符；重跑選單安全＝一般列、強制＝危險色＋警示符號；強制重跑改 `ConfirmDialog danger`（無字符），內文沿用原稿（原稿錯字「重跡」已依 FINAL_RULINGS #9 改為「重跑」）。
- **Lens 卡**：故事模式不可用改為**可見文字**（`v1.lens.storyModeLocked`）；Lens 卡與未連結實體抽屜同在左下堆疊、同一條底邊，抽屜往上展開。**收合態 272／展開態 296**：分頁列右端 chevron 切換；預設收合、**不記憶**（見 FEEDBACK 4-KG-R1）；收合態＝分頁＋閱讀／故事 segmented＋「逐章成長播放（F3）」＋細滑桿＋全域註記；點分頁即展開。控制項走 DS v3：純文字底線分頁（active `--fg-primary` 600＋accent 底線）、`.ss-seg`、26×15 switch（`.kg-switch-*`）、書籤＝型別色 `.ss-pill`＋✕、分類可見性在底部 border-top 之後；聚合鏡頭下的認知視角分頁說明盒下方有一行時間軸註記。
- **字符**：全頁只有「生成深度分析 →」「覆蓋重生成」與「分類可見性」掛 `.ss-btn-llm`；深度分析 503 → `LlmUnconfiguredNotice`（就地）。執行推論不掛。
- **縮放**：± 接 cytoscape zoom（`GraphCanvasHandle.zoomBy`），讀數取 `ViewportSnapshot.zoom`；社群鏡頭（固定 SVG）不顯示縮放條。
- **實體對模式**：排他覆蓋照舊；退出鈕固定右上，用既有 `v1.pair.exit`「退出」（稿的 `graph.pair.exit` 不用）；不加 Esc；進入手勢不改。
- **頁面狀態**：空＝onboarding hero（按鈕走 `ss-btn`）；載入 spinner；失敗＝`PageFailure`＋`failureKind`（page／backend 兩變體，「回書籍總覽」＋技術細節），重試只 refetch 本頁查詢。

**FINAL_RULINGS 已通過、非草稿**：`mode.subtitle.node／type／community`（單一實體怎麼連／按 7 類分群後長怎樣／演算法自動聚出哪些派系）、`legend.currentLens`、`legend.typeToggleHint`、`panel.current`、`inference.noTokenCostInline`（README §5 的 6 條）。

**以下是草稿・待設計定案**（graph ns，工程端自加，zh-TW／en 兩套）：
`v1.cluster.overviewIn`（群集概觀 · {{lens}}，對應稿 C 區面板標題後綴）、`v1.lens.expand／collapse`（Lens 卡 chevron 的 aria-label）；另 `panel.chainInferred`（推斷關係審查）、`panel.chainEntity`（實體詳情）、`panel.chainEvent`（事件詳情）、`inference.forceRerunTitle`（強制重跑推論）、`v1.cluster.settings.zeroCost`（零成本）。**原寫死字串移入 i18n（逐字）**：`v1.cluster.communityRowCount`（{{n}} 個 · {{composition}}）、`v1.cluster.cohesion`（凝聚 {{score}}）、`v1.cluster.compositionAbbr.*`（角／地／概／事／組／物／他）、`v1.cluster.rel.cooperation／rivalry`（合作／敵對 {{score}}）。


> 2026-07 全面翻新（Phase 1~6）：本節以翻新後實作為準。設計 brief 見 `docs/plans/20260718-kg-redesign-brief.md`、實作計劃見 `docs/plans/20260718-kg-redesign-implementation.md`。前身 V1（2026-05-17，計劃 `docs/plans/20260517-kg-page-redesign-v1-impl.md`）僅供沿革參考。翻新零新增後端端點。

#### 版面結構

```
[Toolbar]                                                     [未連結實體抽屜]
                       [圖譜 Canvas（全幅）]                       [右側面板]
                                                                    [Stats]
[Lens]  [Legend 底部橫條]                                          [MiniMap]
```

所有面板均為**暖白底**（`var(--bg-primary)`），`border-left: 1px solid var(--border)`、`border-radius: var(--radius-lg)`、`box-shadow: var(--shadow-sm)`。

**空狀態**：當書籍尚無節點（`nodeCount === 0`）時，改顯示引導卡 `GraphOnboardingHero`——說明圖譜由章節實體與關係萃取而成，並提供「前往建構概覽」CTA（`/books/:bookId/unraveling`，知識圖譜步驟在那裡執行；2026-10-09 起，原為「前往上傳」，書已存在、方向錯）；此時不渲染 Canvas 與各面板。

#### 圖譜 Canvas

- Cytoscape.js 渲染（fcose layout）；載入後自動 `fit` 置中（Phase 1）
- 節點大小＝**登場頻率**（`chunkCount` sqrt 縮放）
- **節點形狀依實體類型**（2026-10-08，`lib/cytoscapeConfig.ts` `NODE_SHAPES`）：角色＝圓、地點＝圓角方、組織＝六角、物品＝菱形、概念＝圓角三角、事件＝方塊、其他＝較小的圓（0.75 倍）。形狀是第一辨識通道——角色／事件／物品的 fill 幾乎同色，Ink 又把語意色壓平
- 節點顏色依實體類型 — 使用 `--graph-{type}-fill / -stroke / -label` token（第二通道，兩主題共用）
- **聚焦模式**（Phase 1）：選取 degree ≥ 5 的節點時，非鄰居 dim 至 ~0.1，聚焦焦點＋鄰居
- **選取置中**：選取節點時縮放到 140%，置中在**右欄以外看得到的畫布**（扣掉右欄寬度），不被面板蓋住
- **減少動態**：系統開啟 `prefers-reduced-motion` 時，置中／縮放／排版／淡入都直接到位不做動畫
- 實體面板統計格的「關係數」＝「關係」清單筆數（已確認、同對象同類型去重，不含推斷邊）
- **標籤策略**（2026-10-09 改為避讓式，`lib/labelPlacement`）：非聚焦時依重要度（大小＋連結數，角色優先、事件最後）逐一放名字，與已放的名字、其他節點本體、浮動外框（導覽條、左下 Lens、右下角落元件、右欄）重疊就略過——名字最多、零重疊；縮放後字小於 8px 全部不顯示；平移／縮放／排版完成／拖動節點後每幀至多重算一次。聚焦時仍顯示焦點＋前 N 鄰居；事件標題單行截斷。原規則（縮放 ≥ 1.6 或節點大小 ≥ 20）在事件預設隱藏後只標出約 1/4 的節點，經兩本書三策略對照實驗後替換
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
- 推斷只在**角色 × 角色**之間提出（#10a，2026-10-08）；每列「A ↔ B ＋ 建議類型」，↔ 因為分數對稱、無方向；建議類型走 i18n `inferredType.*`（潛在盟友／潛在敵對／潛在友誼／潛在關聯／未判定），不顯示原始 enum。比較面板的「建議推斷關係」同樣用 i18n。
  - 面板頂部警示橫幅下方，2026-08-13 追加一則機制說明（Common Neighbors + Adamic-Adar：
    共同認識的角色越多、該共同角色越少見，重疊度越高；純圖論計算），與社群說明卡的
    Newman modularity 說明同一批補上，理由見 D 類方法論盤點結論（同上）

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
- 第二列：邊語意（**線型為主、顏色為輔**——Ink 下 success／error 同為墨色、紅綠對色覺障礙無效：合作＝success 實線略粗／敵對＝error 虛線 6·4／一般＝fg-muted 細實線／推測＝warning 點線；圖例 swatch 畫同樣的線型）＋節點大小示意（○◯ 圓圈大小＝登場頻率）

swatch 為該類型的**節點形狀**（12px SVG，`--graph-*-fill` 底 + `--graph-*-stroke` 框），與畫布一致。孤兒實體改由右上「未連結實體」抽屜負責（Phase 1）。

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

**EntityDetailPanel 版面**（280px）：serif 標題 → meta 列（type pill＋**僅角色**顯示的 `陣營·錨點名` pill）→ **3 格 stat tiles**（登場次數／關係數＝degree／首次登場章＝chunks 最小章號）→ **`加入比較`＋`標記` 兩顆 ghost 外框按鈕**（加入比較＝把當前實體設為比較第一位，下一次點節點湊成對開比較）→ `關係`（稿外新增 KG-1：非推斷邊的清單，每列一顆 `<button>`＝對象名 serif＋關係類型 sans＋合作實線／敵對虛線 glyph〔另有隱藏文字〕；依權重由高到低，預設 8 筆、其餘「顯示全部 N 筆」；對象目前被型別 chip／搜尋／未連結抽屜隱藏者標「（畫布已隱藏）」；按下＝選取該實體，同點畫布節點。畫布容器 `role="img"`＋`aria-label`「知識圖譜：N 個節點、M 條關係」）→ `深度分析`（僅角色；覆蓋重生成 link，空狀態為 ghost CTA 非實心）→ `相關段落`（章節·Chunk 預覽卡＋查看連結）。動作語彙統一為 ghost 按鈕＋文字連結，無實心強調色塊。

#### 多選比較（Scenario E，cap 2）

Shift+Click 第 2 個 → 並排比較；第 3 個 → 踢掉最早選的。共同鄰居加 `--accent` 虛線高亮，其餘節點 opacity 0.35。EntityComparePanel 頂部提供「進入實體對模式」入口 → 開啟下方〈實體對模式〉獨佔覆蓋層。

#### Cluster mode

- **個別**（預設）：所有節點獨立顯示
- **類型**：純前端 group-by（`frontend/src/services/kgClustering.ts`），4–7 個 super-nodes；確定性 preset 分組排列（Phase 4）
- **社群**：接後端 `GET /books/:bookId/analysis/factions`（F-16，已上線），改用 **FactionCanvas**（SVG 陣營圈＋成分點）
  - **陣營錨點命名**（Phase 4）：前端由 `topMemberNames[0]`＋「陣營」推導（如「寇仲陣營」），核心成員未登場則 fallback 後端 label；後端不動
  - **時間軸連動**（Phase 4）：faction 分析帶 `?chapter=`（chapter 模式且 position>0），派系劃分隨章節重算
  - **社群說明卡**（Phase 4）：交代分群僅計入角色正向關係、未歸屬角色數、非角色/未分群實體數。
    2026-08-13 追加一行機制說明（Newman modularity：群內連結盡量密、群間盡量疏，純圖論非語意判讀）——
    這是圖論方法論的盤點結論（見 `docs/plans/20260813-methodology-page-alignment-audit.md` D 類）：
    不進 `/methodology` 頁（調性與其他 8 個文學理論條目不合、且無法跨書比對），改在此說明卡 inline 交代
  - **drill-in**（C8）：點陣營 → 該陣營置中展開成員、其餘陣營淡出；成員點擊切回個別模式並選取
  - 分群參數（resolution / minClusterSize）收進進階抽屜，預設收合（draft/applied，不即時重算）

Mode 切換以 localStorage `graph:${bookId}:clusterMode` per-book 記憶。

#### Search dropdown（Scenario D）

Toolbar 搜尋欄輸入 → 下拉框出現（360px wide）：

- **實體**：matching graph nodes + type dot + 登場段數
- **章節**：matching chapter titles
- **段落內文**：placeholder「全文搜尋待後端實作」

鍵盤：↑↓ 選擇、↵ 開啟、Esc 關閉，**僅在焦點位於搜尋 input 時生效**；點外面或焦點離開搜尋框即關閉。搜尋框為標準 combobox（`role="combobox"`＋`aria-activedescendant`，列為 `role="option"`）。「加入比較」已 arm 時，從搜尋選到的實體等同點畫布第二個節點，直接完成比較。Debounce 200ms。

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

> 後端設計見 [`docs/guides/temporal-timeline.md`](guides/temporal-timeline.md)
> 工程分期見 [`docs/plans/20260725-timeline-page-enhancements.md`](plans/20260725-timeline-page-enhancements.md)
> **本節於 2026-10-04 依 DS v3 第 4 批（4-1）改寫**；2026-07-27 的三視圖版面已不再存在。
> 決議紀錄：`12 時間軸 Timeline 決議紀錄`；計畫：`docs/plans/20261004-ds-v3-batch4-views.md`；設計回饋：`DS_V3_DESIGN_FEEDBACK.md` 4-TL-*。

#### 這一頁要回答什麼

**作者敘述的順序（sjuzhet）與故事實際發生的順序（fabula）差在哪裡**——差的地方就是倒敘與預敘。
量化形式是每筆事件的 `deviation`：

```
expectedRank = index / (N - 1)          // 若兩種順序完全一致，rank 應該是多少
deviation    = chronologicalRank - expectedRank
outlier      = |deviation| > 0.15       // OUTLIER_THRESHOLD
```

實作於 `frontend/src/lib/timelineGeometry.ts`（純函數，有單元測試）。
`narrativeMode` 一律**由 deviation 推導**，不使用後端回傳的 `narrativeMode` 欄位。

#### 兩項結構改動（2026-09-26 裁定，4-1 落地）

1. **三視圖 tab 撤掉。** 故事時序與矩陣吃同一個 `chronological_rank`（沒有 rank 兩個都空、有 rank 兩個都活），所以不該是兩個 tab。
   「章節順序」成為唯一底圖；對照能力收成一個**零成本開關**「對照故事時序」。`?view=` 不再讀（舊連結落到底圖）。
2. **事件分析（EEP）的兩顆按鈕移回事件分析頁。** 本頁只留「前置：事件分析 d / t 筆（pct%）」＋零成本連結「到事件分析頁 →」；
   章節帶保留說明、拿掉按鈕。本頁花 token 的入口因此只剩兩個。時間軸查詢**掛載時一律重抓**（`useTimeline` 的 `refetchOnMount: 'always'`），接住在事件分析頁跑完的 EEP。

#### 版面結構（B 檢視：24 / 16 / 12 / 8、max-w 1280、下內距 32）

頁面整頁捲動（`.tl` 為捲動根，內容 `.tl-inner` max-w 1280）。

```
[GuidanceRibbon 研究者導覽（可關）]
[工具列  左：顯示範圍 | 篩選資料 | 不符合的事件(+單行 hint) | 疊加層   │實線│   右：分析動作面板]
[生效中的篩選 chips（有才出現）]
[章節順序（serif xl 700）＋副標            [對照故事時序 開關]  零成本 · 只換畫法，不呼叫 LLM ]
[disabled 說明卡（無 rank 時）]
[前置：事件分析 d / t 筆（pct%）▬▬▬  到事件分析頁 →]
[過期說明帶（時序分析已過期，有才出現）]
[headline / meta（僅開啟對照時）]
[譜面（每行 44px 左欄放「未排序」、右欄為繪圖區；選中章節左下角小黑標「Ch.n · N 事件」）]
[圖例 2～3 行]
[章節卡片帶]                                   [事件詳情面板 320px（開啟時譜面收窄，不覆蓋）]
[角色軌跡（疊加層，可關）]
```

**資料取得**：一律 `order=narrative` 的同一份 payload；`index`（事件在書中的位置）是譜與軌跡的 X 軸，必須恆定。
`rank` 是每筆事件自己的屬性，不另抓。

#### 3.7.1 工具列：左右兩段、中間一條實線

左段是**看什麼**（零成本）、右段是**跑什麼**（花 token）；並排時容易被誤讀成同一類，所以以實線分開。

左段四格（皆為零成本）：
- **顯示範圍**：`ss-seg`「全部 n｜僅已分析 n」。
- **篩選資料**：`ss-btn-sm` 篩選鈕（帶條件數）＋「符合 n / 共 m」；popover 見 3.7.2。
- **不符合的事件**（`filterMode`）：`ss-seg`「淡化其餘｜只顯示符合項」，下方**單行 muted hint** 隨選中切換
  （`filterModeDimHint`／`filterModeOnlyHint`，既有字串）。它與「顯示範圍」分兩格：後者是條件，前者是不符者怎麼呈現。
- **疊加層**：「角色軌跡 · 開／關」。上限 3、預設開（功能凍結，見 4-TL-4）。

#### 3.7.2 篩選

popover（寬 340、`--card-radius`）頂部一列「篩選資料」＋accent 字「全部清除」（篩選即時生效，**沒有**底部「重置／套用」），下接五個 AND 疊加的分區（事件類型 / 敘事模式 / 重要性 / 角色（含搜尋）/ 地點），每個選項帶命中筆數；
地點在真實資料中為空時該區自動隱藏。`filterMode` **不再放在 popover 內**（移到工具列）。

- **篩到空 / 僅已分析＝0**：同一個殼——`沒有事件同時滿足這些條件` ＋ `目前套用 {n} 個條件…` ＋ `全部清除`。
  生效中的 chips 列留在工具列下方，可逐一移除，讓人看得出是哪些條件把結果掐死。
- 只顯示符合項（only）時，譜上被移除的點會**中斷連線**（不跨洞連線）。

#### 3.7.3 底圖標題與「對照故事時序」開關

標題「章節順序」（serif xl 700）＋逐字副標（README §1.2）。開關三態（`timelineModel.compareState`）：

| 態 | 條件 | 呈現 |
|---|---|---|
| disabled | **全書** `stats.ranked === 0`（不隨篩選變灰） | opacity 0.55、not-allowed；下方說明卡（`--bg-secondary`）：標題「對照故事時序目前不可開啟」（partial 色）＋ `noRanked.desc`（`{n}` ＝全書事件數）＋「用右側的「首次計算…」算出後即可對照」 |
| off（預設） | 有 rank、未開 | 已排序事件畫在**中線**，不做縱向偏離、不標 outlier、無註記；headline／meta／中線圖例**不出現** |
| on | 有 rank、已開 | accent 描邊與軌；現行偏離畫法；headline／meta／`stave.legend` 出現 |

開關旁固定「零成本 · 只換畫法，不呼叫 LLM」。說明卡**取代**原本的 prompt 卡（同一個動作不畫兩次）。
矩陣不是第三個 tab：開關**on** 時，開關下方多一組零成本 `.ss-seg`「偏離譜面（預設）｜密度矩陣」（5-5，見 3.7.11）。
off／disabled 時分段切換不出現。分段狀態與開關一樣是頁面 local state，**不寫 URL**。

#### 3.7.4 分析動作面板（工具列右段）

兩列 × 四段，grid `110px 1fr auto`：**動作 / 目前狀態 / 成本或阻擋原因 / 按鈕**。不可壓成一顆按鈕。

- 實心點＝可執行、空心圈＝被擋住（形狀記號，Ink 下不靠色相）。
- **兩顆按鈕都 `.ss-btn-llm`，disabled 的也掛**：擋住的是能不能跑，不是花不花錢。
- **被擋時**：狀態行 partial 色，帶**當下分數**「尚不可執行 · 需 60% 事件帶有故事時間提示，目前 {n} / {total}（{pct}%）」
  （`events_with_hint`／`total_events`，來自 #21g）；第三格為可點連結「…到建構概覽重跑知識圖譜 →」（導向 `/books/:id/unraveling`）。
- **執行中**：第三格改放 `leavePageOk`，第四段為「中止」（零成本、不掛字符），呼叫 `POST /tasks/:id/cancel`（`cancelTask`），
  並清除本地 task id。故事時序列的進度句用 `storyOrderRunning` 原文。**兩個任務可同時在跑。**
- **「識別倒敘與預敘」一律 `force: true`**（使用者明示要跑；否則舊的「覆蓋率不足」快取會一直擋住）。
- **被跳過**（任務 `done` 但 `coverage_sufficient !== true`，即沒呼叫 LLM）：面板內可關閉的 **partial 卡**
  （`toast.displacementSkipped`／`Desc`，沿用既有字串）取代 toast——「沒跑」不是「跑壞」，所以用 partial 色而非 error 色。
- **觸發失敗**：兩個觸發都有 try/catch。`isLlmUnconfigured`（503＋body）→ 面板內就地 `LlmUnconfiguredNotice`；其他 → 既有 error toast。
- 「倒敘與預敘」名稱連往 `/methodology?framework=genette_temporal_order`。

⚠️ **解鎖條件是 `coverage_sufficient`（storyTimeHint ≥ 60%），不是「故事時序跑完」**——兩者資料來源不同，
跑故事時序或事件分析都不會提高覆蓋率（`timeline.action.displacementUnblock` 必須說清楚）。

#### 3.7.5 前置列與過期帶

- **前置列**（`coverage.prereq`）：「前置：事件分析 d / t 筆（pct%）」＋ `.ss-progress` ＋ 零成本連結「到事件分析頁 →」（`/books/:id/events`，不預選章節）。
  獨立一列、排在說明卡之下、譜面之上；與故事時序算沒算過無關。
- **過期說明帶**：`temporalAnalyzed && temporalIsStale` 時在譜面上方顯示 `timeline.action.displacementStale`（partial 色、`--bg-secondary` 底、無左邊框）。
  `{step}` 用 `reader:rerun.steps.*` 既有步驟名對照（`timelineModel.staleStepKey`），未知步驟退回後端原值。**舊判定仍顯示**，不隱藏。

#### 3.7.6 譜面（雙軌譜 + 章節卡片帶）

- X = 段內敘述順序線性映射；on 時 Y = `MID - deviation × SCALE`（MID 26px、SCALE 38），off 時所有已排序點 Y = MID。
- 中線（`1px dashed`）＝ deviation 0，下方＝倒敘、上方＝預敘。**行數由事件數推導**（`ceil(n / 22)`）。
- 點：KERNEL 較大、已分析實心 / 未分析空心、outlier 用 `--accent`。連線與中線為 **SVG**。
- **章節帶**可點＝換章，涵蓋被篩選濾空的章節。**註記**每章最多一條（僅 on）。
- **未排序帶是固定結構**：**每一行都渲染**（`rank === null` 的事件放這裡），不是空狀態，就算全部算完它仍然在。
- **圖例兩軸分開**：「實心＝已分析｜虛線＝尚未分析」一行；「底部「未排序」帶＝排不進故事時序（與尚未分析是兩回事）」另一行。
- **章節卡片帶**一次只顯示一章；已分析事件出卡片，未分析的收進右側 196px 清單（含明確的「展開其餘 N 筆」，不可靜默截斷）。
  整章未分析時：說明「Ch.N 的 n 筆事件都只有標題…」＋「事件分析在事件分析頁執行。」，**無按鈕**。

#### 3.7.11 密度矩陣（5-5，12 補稿）

> 稿：`design/12 時間軸 矩陣密度版 補稿.dc.html`；計畫 Q6；設計回饋 `DS_V3_DESIGN_FEEDBACK.md` 5-TL-*。
> 元件 `components/timeline/DensityMatrix.tsx`；純邏輯 `matrixModel.ts`（vitest）。舊散點 `MatrixCanvas` 未回收，已刪（2026-10-04 刪除，B-129）。

「對照故事時序」開啟後、分段選到「密度矩陣」時，**取代**譜面＋圖例＋章節卡片帶（headline／meta 也不出現）；角色軌跡疊加層照舊。
兩種畫法讀同一份 `chronologicalRank`，**不打新請求**；選取格是元件 local state，離開矩陣即清掉。

```
[網格：24 垂直軸標 │ 64 rank 區間標 │ N 欄章（minmax(22px,1fr)）× 10 列]   上列＝91–100%
[章號列]
[敘事順序 (Sjuzhet) →                                  ▢ 完全按故事順序敘事]
[↵ 未排序事件 n                          排不進故事時序，不畫進矩陣]   ← bg-secondary 帶
[每格事件數  ▢1 ▢2 ▢3 ▢4 以上   色階是絕對件數，不隨書重新縮放]
────────────────────────────────────────────
[選取格標題                                              清除選取]
[● 事件標題                                  Ch.N · rank xx%    ]  ← 動作列（24／1fr／auto／12）
```

- **軸**：橫軸＝章（欄是全書有事件的章，不隨篩選變動）、縱軸＝rank 十分位 `min(9, floor(rank×10))`（rank = 1.0 落在 91–100%）。
- **格色**：`--symbol-density-low/mid/high/peak` ↔ 1／2／3／4+ 件，**絕對件數、不隨書縮放**；新 step 函式 `matrixModel.densityStep`，
  符號熱圖的兩階規則不動。**格內寫數字**（數字是唯一量值來源；3、4+ 用 `--accent-fg` 字色）；0 不寫、不填色、`disabled`。Ink 為灰階＋數字。
- **對角格**：2px `--fg-primary` 實線框。欄數不是 10 時，以「欄中心位置的十分位 ＝ 列」判定（`isDiagonal`），欄多於列時對角線是一條多格寬的帶。
- **不在矩陣上寫「倒敘 n 筆」**：那是「識別倒敘與預敘」（花 token）的結論；這裡只是兩個排名的幾何差。
- **點格＝篩選**（零成本）：選取格 2px 實線外框（outline，不是左緣／inset 強調）；再點同一格或「清除選取」取消。
  未選時標題「選取的格」＋空提示。列出該格事件，點事件＝開既有事件詳情面板。
- **列的圓點**：色＝前端由偏離量推導的敘事模式 `datum.mode`（`--narrative-*-border`，與詳情面板一致，**不用**後端 `narrative_mode`，見 5-TL-1）。
  Ink 下三色只差灰階，故再加形狀：當下＝實心圓、回敘＝空心圈、預敘＝實心方；`aria-label` 為模式名。
- **篩選**：「只顯示符合項」時不符合的事件不計入格數；「淡化其餘」時仍計數、列表中不符合者淡化。
- **未排序帶**：`rank === null` 的事件只計數、不進格。未排序帶是固定結構，0 筆時照樣顯示「未排序事件 0」（與譜面一致）。
- 事件列的中繼文字 `Ch.N · rank xx%` 為資料格式（等寬字、不進 i18n，與章節卡的 `Ch.N` 同）。

#### 3.7.7 角色軌跡（疊加層）

是疊加層，不是第四張視圖。上限 3 位、預設帶入出場數最高的 3 位、預設開。
- **X 軸用 `index`（敘述順序），不吃篩選**：「X 軸沿用敘述順序（{n} 筆）· 不受篩選影響」**逐字**置於軌跡上方，不收進 tooltip（連缺數只在完整軸上成立）。
- 卡片（`--card-radius`、padding 16）內每位角色一段：serif 名稱＋右側「出場 · 缺席 · 最長連缺」、軌道、**缺席區間 chips**（`--bg-secondary`）。
- 章節刻度對齊該章第一筆事件的索引；缺席區間連續 ≥ 3 筆才算、寬度 < 9% 不標。底部「同框」列。

#### 3.7.8 事件詳情面板（寬 320）

標頭：`事件詳情` ＋ **`← → 切換事件 · Esc 關閉`**（`timeline.keyHint`）＋關閉鈕。內容：`Ch.N 章名 · 類型 → 標題 → 重要度 badge → 概要 → 參與角色（ss-pill）→ 時序`。
**兩顆跳轉（前往閱讀該段落／在知識圖譜中查看）固定在面板底部**，不隨內容捲走。開啟時譜面收窄，不覆蓋。

- **badge 一律看 `eventImportance`，不看 `hasAnalysis`**（兩者會不一致）：核心事件 KERNEL / 衛星事件 SATELLITE（`ss-badge`）；**重要度未評**＝中性灰 badge。
- 「需要故事時間提示」用 partial 色（與動作面板被擋行同一組 token）。敘事模式 chip 無左邊框強調。
- 「前往閱讀該段落」走 `useSourceJump`（章節 scope）。**不再有「時序關係」區塊**（`priorEventIds`／`subsequentEventIds` 語意非時序，不得在本頁出現「因果」「前驅／後續」）。

#### 3.7.9 狀態涵蓋（失敗四分）

| 狀態 | 呈現 |
|------|------|
| 首次載入 | spinner＋`loadingBy.chapter`（不再有 skeleton） |
| 無事件 | `TimelineOnboardingHero`：STEP 01–03 用 `onboarding.{events,chrono,genette}.desc`，`ss-btn-primary`「前往事件分析」 |
| 單頁失敗（有應用層 JSON body） | `PageFailure` page：title＝`timeline.error.title` 原句、定案說明句、「重試」＋「回書籍總覽」、技術細節。錯誤分支只在無資料時出現（背景重抓失敗保留舊資料） |
| 後端失敗（裸 502/503/504） | `PageFailure` backend：「伺服器沒有回應」＋重試 |
| 應用層 503（觸發時） | 動作面板內就地 `LlmUnconfiguredNotice`，頁面其餘照常 |
| 時序分析已過期 | 第四種：譜面上方的說明帶（見 3.7.5），不是錯誤 |
| 篩選為空 / 僅已分析＝0 | 同一個殼（見 3.7.2） |
| 該章被濾空 / 整章未分析 | 章節卡片帶內兩種空狀態 |

修掉的既有 bug：舊版讀不存在的 `timeline.error.desc／retry` key（畫面印出 key 本身）。

#### 3.7.10 字串

**既有字串一字不改**，除使用者明示例外（Q6）。

**這 4 句是草稿・待設計定案**（既有 key 的改寫；i18n `analysis:timeline.*`，zh-TW 與 en 都已改）：
- `onboarding.chrono.desc`：「依事件的故事時間提示排序，算出後即可在章節順序上對照故事時序。」
- `guide.body`：兩視圖說法（章節順序底圖＋對照故事時序開關）。
- `action.displacementBlocked`：「尚不可執行 · 需 60% 事件帶有故事時間提示，目前 {{n}} / {{total}}（{{pct}}%）」
- `noRanked.desc`：拿掉第三句「它們仍可逐筆檢視。」

**這 7 句是草稿・待設計定案**（新字串；i18n `analysis:timeline.*`，zh-TW 與 en 都已補）：
`compare.label`「對照故事時序」、`compare.zeroCost`「零成本 · 只換畫法，不呼叫 LLM」、`compare.blockedTitle`「對照故事時序目前不可開啟」、
`coverage.prereq`「前置：事件分析 {{done}} / {{total}} 筆（{{pct}}%）」、`coverage.toEvents`「到事件分析頁 →」、
`band.analyzeElsewhere`「事件分析在事件分析頁執行。」、`base.title`「章節順序」。

**已裁決，不標草稿**（README §1.2／§5）：`base.subtitle`（逐字副標）、`compare.blockedHint`「用右側的「首次計算…」算出後即可對照」。

**這 7 句**（12 補稿，**2026-10-04 裁決通過**，不標草稿；i18n `analysis:timeline.*`，zh-TW 與 en 都已補）：
`compare.mode.stave`「偏離譜面」、`compare.mode.matrix`「密度矩陣」、`matrix.cellsLegend`「每格事件數」（稿上 key 名是 `matrix.legendTitle`，
與既有「章節 × 故事時序」撞名，改用新 key，見 5-TL-2）、`matrix.scaleNote`「色階是絕對件數，不隨書重新縮放」、
`matrix.unsortedNote`「排不進故事時序，不畫進矩陣」、`matrix.cellTitle`「第 {{ch}} 章 · 故事時序 {{from}}–{{to}}% · {{n}} 件」、
`matrix.emptyHint`「點一格，列出落在該章、該時序分段的事件。」。

**這 3 句是草稿・待設計定案**（稿上出現、補稿字串表與 README §5 都沒列；i18n `analysis:timeline.matrix.*`，見 5-TL-3）：
`legendFourPlus`「4 以上」、`selectedTitle`「選取的格」、`clearSelection`「清除選取」（與 `unraveling.toolbar.clearSelection` 同字、時間軸專用 key）。

**既有字串重用**（未新增）：失敗頁名 `nav:tabs.timeline`、「回書籍總覽」`analysis:character.error.backToBook`、被跳過卡 `toast.displacementSkipped*`、
「關閉」`closePanel`、步驟名 `reader:rerun.steps.*`、中線圖例 `stave.legend`。

#### 已清除的孤兒（2026-10-04 刪除，B-129）

`StoryOrderView`、`MatrixCanvas` 兩個元件與 `timelineGeometry` 的散點矩陣函式（`buildMatrixPoints`／`buildMatrixUnranked`／`beeswarmOffset`／`chapterCentrePct`／`MATRIX_HEIGHT`／`BEESWARM_*`）；
i18n `matrix.legendTitle／legendDesc／legendFoot`、`noRanked.story／matrix`、`storyOrderPrompt.*`、`loadingBy.story／matrix`、`tabs.*`、`modeSub.*`、`viewTabs`、
`coverage.*`、`confirm.eventsTitle／eventsBody`、`toast.eventsDone／eventsFailed`、`band.analyzeChapter`（`matrix.xAxisLabel／yAxisLabel／diagonalLabel／unrankedBand` 由 `DensityMatrix` 使用，保留）；
`timeline.css` 的 `.tl-tab*`、`.tl-story*`、`.tl-matrix*`。`.tl-btn*` 目前也無呼叫端，未在本次清單內，尚未刪。

#### 樣式檔案

`frontend/src/styles/timeline.css`（`.tl-*` prefix）＋ kit（`.ss-btn*`、`.ss-seg`、`.ss-badge*`、`.ss-pill*`、`.ss-progress`、`.ss-btn-llm`）。
**不新增、不修改 design token**——`--narrative-*` 為跨頁共用，改值會同時破壞角色頁與事件頁。本批觸及的區塊間距一律走 `--space-*`；
譜面／矩陣的幾何像素與 SVG 內尺寸為既有凍結值。

#### 動效

只用 `--transition-fast` / `--transition-normal`，只過渡 `color` / `background-color` / `opacity` / `box-shadow` / 開關旋鈕 `left`。
持續動畫僅 spinner，且 `prefers-reduced-motion` 下關閉。

#### 已知缺口

- **RWD 未做**：固定 1440 基準；右段動作面板最小寬 420，窄於約 1230 時換行到左段下方（見 4-TL-8）。
- 譜面與軌跡的點仍用原生 `title`（見 4-TL-9）。

### 3.8 張力分析頁 `/books/:bookId/tension`

> 術語定義（TEU、TensionLine、TensionTheme 等）見 `docs/domain-glossary.md`。
> DS v3 第 4 批（4-4）改版，依據 `15 張力分析` 決議紀錄。**B 檢視**密度（頁邊 24／區塊間距 16／卡內距 16／列 8、內容 max-w 1280、下內距 32）。樣式 `frontend/src/styles/tension.css`（`.tn-*`），全走 token；按鈕、badge、segmented、進度條、確認框用 kit（`.ss-btn*`、`.ss-badge*`、`.ss-seg`、`.ss-progress`、`ConfirmDialog`）。

> **以下是草稿・待設計定案**（i18n `tension.*`，zh-TW 與 en 皆有）：
> `tension.state.gateHint`（「全部審完 →」，稿 G 區軟閘門）、`tension.drawer.carrier`（「載體」，稿 F 區）、
> `tension.toolbar.batchFailed`（批次部分失敗提示）、`tension.teu.assign.failed`（指派非 409 失敗的說明）。
> README §5 已裁決、**不標草稿**：`tension.theme.fryeLabel`／`bookerLabel`、`tension.teu.assign.conflict`（依計畫 Q3 只留前兩句；第一句 `<strong>` 粗體、不顯示「（409）」）、
> `tension.teu.assign.zeroCost`、`tension.rerun.title`（既有字串，一字不改）。
> 無「原寫死字串移入 i18n」。

#### 版面結構

```
[tn-shell → tn-shell-main（bg-secondary、捲動）→ tn-page（B 檢視）]
  ├─ GuidanceRibbon（共用，等第 19 稿）
  ├─ 階段條 TensionStepperStrip（五格：圓＝計算、方＝人工關卡）
  ├─ LlmUnconfiguredNotice（Step 1／Step 2／合成任一觸發被應用層 503 擋下時，就地一則）
  ├─ Step 1 失敗清單（沒有 Step 1 卡時放頁面層；有則在卡底）
  ├─ 主體（依管線狀態）
  │    ├─ EmptyCard      無 TEU：Lucide Scale spot＋說明＋（概念缺席時）去處連結＋主鈕
  │    ├─ RunningCard    進行中：spinner＋標題＋百分比＋ss-progress＋提示（不印後端 stage、無 ETA）
  │    ├─ ErrorCard      Step 2 失敗：插在舊結果上方，「重試聚合」（次要＋字符）
  │    ├─ Step1Card      有 TEU 無線：逐章長條（fg-muted 單色、上標 TEU 數、Tooltip 給連續敘事段數）
  │    └─ SoftGate       有線無主題：未審完顯示「尚有 N 條未審核／全部審完 →」，審完才出現「合成全書主題」
  ├─ ThemeHero（主題存在；過期時為同位置的 warning 卡＋「重新合成主題」）
  └─ hasLines：模式 segmented（張力線 N／TEU 逐章 M）→
       lines：章節格點卡＋審核卡（工具列／批次列／線表／鍵位列＋重新執行 Step 2）
       teu：TEU 逐章（一張卡的 action rows）
[右側 Review Drawer 400（lines 模式且有選定線）]
[重跑 ConfirmDialog]
```

元件：`components/tension/` —— `TensionStepperStrip`／`TensionStateCards`（Empty、Step1、Running、Error、SoftGate、FailureList）／`TensionThemeHero`／`TensionChapterGrid`／`TensionReviewToolbar`／`TensionLineTable`／`TensionReviewDrawer`／`TensionTEUInspector`／`TensionAssignControl`／`tensionModel.ts`（純邏輯，有 vitest）／`intensity.ts`／`drawerData.ts`／`reviewTypes.ts`／`hooks/useTensionTask`。
`TensionRerunDialog` 已刪（2026-10-04 刪除，B-129），重跑確認改用共用 `ConfirmDialog`。

#### 三條軸（花 token／寫資料／不可逆互不蘊含）

| 控制項 | 字符 `.ss-btn-llm` | 確認框 | 危險色 |
|---|---|---|---|
| 開始 Step 1、執行 Step 2、合成全書主題、重新合成、重新合成主題、重試聚合 | 是 | 否（首次執行直接送出） | 否 |
| 重新執行 Step 2 | 是 | 是（`ConfirmDialog`） | 是（`ss-btn-danger`） |
| 核准／修改命題／拒絕、批次核准／拒絕、改標籤、指派到張力線 | 否（零成本） | 否 | 否 |

成本提示文字（`tension.state.tokenHintShort／Long`，逐字）一律純文字、不帶字符。

#### 階段條

五格 grid。計算格圓形記號、關卡格方形記號——形狀本身是「三步 LLM＋兩道 HITL」的編碼，**不統一**。
鎖定（`notReady`）格改降階文字色（title／note 轉 `--fg-muted`、記號描邊轉 `--border`），**不用虛線框**。
記號字符：`done` ✓、`partial` —（有缺口但下游照解鎖，優先於 ✓）、`failed` ▲；Ink 下靠形狀而非色相。三個尺度標籤（SCENE／CROSS-SCENE／BOOK）留在格上。
< 640px 改直向堆疊（純 CSS）。

#### 階段 0（空態）

導覽條（共用）→ 階段條 → `Scale` spot（72px、`--illustration-stroke`）置於標題上方 → 標題／說明 → 概念推論缺席說明句＋連結「前往建構概覽推斷 →」（箭頭在字串外）→ 主鈕 `ss-btn-llm`＋成本提示。
`conceptsMissing` 只在建構概覽 manifest **成功載入後**才判斷（載入中不會誤判）。

#### 階段 1（Step 1 卡）

標題＋場景行（B-068：「判定不出」不併進總數）→ 逐章長條（`--fg-muted` 單色；高度正比最忙的一章，上方標 TEU 數 tabular-nums；hover 以 Tooltip 給「ch{n}：{teus} 個 TEU · {runs} 段連續敘事 · 場景…」）→ 說明 → 「執行 Step 2 · 聚合」（字符）＋成本提示 → 卡底 `<details>` 失敗清單（預設收合；run-scoped 提示為既有字串，無左邊框）。

#### 全書主題 Hero

eyebrow ＋ `最新` badge ＋ Frye／Booker chip（chip 前 2xs muted 小標，**chip 字面不動**）→ 命題 → 合成完整性警告帶（凍結值，`null` 則不顯示）→ 支撐的張力線（前 4 條、前置強度記號）→ 四顆按鈕：**只有「重新合成」帶字符**，核准／修改命題為次要、拒絕為 ghost，皆純文字 → provenance 行（出處，與警告帶分兩處）。
過期：同位置換成 warning 卡（四種理由共用，四選一）＋舊命題（灰）＋「重新合成主題」（次要＋字符）。

#### 張力線模式

- **章節格點**：標籤欄 340（凍結）；逐 TEU 迷你長條（寬 6，低 8／中 14／高 20，`--tension-intensity-*`）；**未歸入＝實線空心框（warning 描邊、不填色）**，圖例補「未歸入」；選中的線用底色＋標籤加粗。窄視窗橫捲、標籤欄 sticky。
- **審核卡**：狀態篩選與排序都是 `ss-seg`，預設排序強度 ↓；多選後出現批次列（批次核准／批次拒絕＋「Esc 取消選取」，底色 `--bg-secondary`，不用實心 accent）。
  批次**逐筆** PATCH（無批次端點），一筆失敗不中斷其餘；失敗的留在選取中並提示（`batchFailed`）。
  線表欄寬 `13 / 1fr / 128 / 64 / 152 / 72 / 236`，列高 ≥48 固定、審核欄 `nowrap`、章節欄 `ellipsis` 不溢入證據欄；勾選框 13×13 圓角 2；「核准」為次要鈕。
  < 1080px 章節與證據落到極點對下方第二行。篩到空：一行字＋ghost「顯示全部 N 條」。
- 鍵位列逐字（J／K 移動　A 核准　X 拒絕　E 改標籤　Space 多選　V 全選　Esc 關閉）；快捷鍵在重跑確認框開啟或 `mode !== 'lines'` 時停用。
- 「重新執行 Step 2」：`ss-btn-danger ss-btn-llm`＋左側成本提示 → `ConfirmDialog`（標題 `rerun.title`、內文 `rerun.body`、`sections`＝會失去（0 的項目不出現）／會連帶過期（有主題才有）、`costHint`、`danger`＋`spendsTokens`）。

#### TEU 逐章

同一張卡的 action rows（lead 章名、body 迷你長條＋狀態、trail 展開），hairline 分隔，不是每章一張卡。未歸入計數 `--color-warning`、全部已歸入 muted。保留「只看未歸入」「全部展開」。
展開內容沿用現有 TEU 內容（API 無 TEU 標題欄位，見回饋 4-TN-2）。**指派到張力線**（`TensionAssignControl`，章節格點的未歸入清單共用）：零成本，旁註「只寫入歸屬，零成本」；有 pending（select 停用）與錯誤處理——**409 顯示專屬說明** `tension.teu.assign.conflict`（只留前兩句，見回饋 4-TN-1），其他失敗顯示伺服器原因。

#### 審核抽屜（400）

標題「張力線審核」顯示出來；`審核中 · i / N`、關閉；`ch … · N TEU · 強度 {高／中／低}`（**文字分級**，不顯示數值）＋狀態 badge；兩種警示（A/B 不穩定、已人工修改）；極點 A／B（含立場文字）與「載體」列（carrier 為空顯示「未指派 carrier」）；證據為 text row（serif sm／1.85、hairline、**無 hover 填色、無左邊框**），每則附章節、強度文字與「回到原文 · 第 N 章」；編輯態逐字保留零成本句；底部 核准　A／改標籤　E／拒絕　X。
< 1080px 抽屜覆蓋在內容上（`inert` 主欄、開啟時移焦點、關閉時歸還），z-index 低於聊天啟動鈕。

#### 錯誤與其他狀態

- **本頁 lines／teus／theme 查詢失敗** → `PageFailure`（`failureKind` 分 page／backend；頁名取 `nav.tabs.tensionAnalysis`；「回書籍總覽」沿用 `character.error.backToBook`；技術細節收進 disclosure）。查詢留在頁面層，重試是原地 refetch，不卸載／重掛。
  theme 的「還沒合成」是應用層 404（有 JSON body）→ 視為「沒有主題」；其他（500、無 body 的 404/502）才是錯誤。以前這些都被吞成「尚未進行張力分析」。
- **Step 1／Step 2／合成（含重新執行、重新合成）觸發被應用層 503** → `LlmUnconfiguredNotice`，頁面其餘照常（`useTensionTask` 保留 error 物件，回傳 `llmBlocked`，向下相容）。
- 執行中：`task.progress` 畫進度條；「正在呼叫 LLM，消耗 token。可離開頁面，完成後會保留結果。」逐字，不帶字符、無 ETA、不印後端 stage 字串。

#### 已知缺口

- 離頁後回來看不到進行中的任務（taskId 在 state、未綁書，B-128）。
- Step 1 失敗清單只存在於剛結束那次執行的 task result，重新整理即消失（後端沒有按書留存）。
- 「從張力線移除 TEU」沒有 API／UI（所以 409 說明只能說「沒有移動這個動作」）。
- 導覽條是共用 `GuidanceRibbon`（5-1 起走 kit `.ss-guidance`，無左邊框強調）。
- 鍵盤 `A`／`X` 在未開抽屜時作用於第一列（既有行為，未動）。
- 已刪（2026-10-04 刪除，B-129）：`TensionRerunDialog.tsx`；i18n `tension.drawer.notePlaceholder`、`tension.rerun.separator`。`tension.drawer.editorTitle`、`tension.table.selectAll／clearAll`（表頭勾選框的 aria-label）仍使用中。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#14a–#14b（Step 1）、#14c–#14d（Step 2）、#14d-2（TEU 清單）、#14d-3（TEU 指派）、#14e／#14f（TensionLine 清單／審核）、#14g–#14h（Step 3）、#14i／#14j（TensionTheme／審核）。
> 張力各步驟有專用 polling endpoint（#14b / #14d / #14h），不走共用的 #8。

---

### 3.9 象徵意象頁 `/books/:bookId/symbols`

頁面分為兩欄：左側清單（284px）+ 右側內容。i18n namespace 為 `analysis.json` 的 `symbol.*`。DS v3 第 3 批（3-4）改版，依據 `11 符號意象` 決議紀錄；**B 檢視**密度（頁邊 24／區塊間距 16／卡內距 16／列 8、內容 max-w 1280、下內距 32），熱圖格點為唯一例外（格子尺寸由 12 欄軸決定，列間距 `--space-2`）。

> **以下是草稿・待設計定案**（i18n `symbol.*`，zh-TW 與 en 皆有；稿上已有的 8 句加稿上沒有的 2 句〔`generating.cancelFailed`、`overview.batch.confirmTitle`〕）：
> `list.trustBelowFloor`、`list.groupMeta`、`error.blockedInline`、`cluster.empty`、`filterEmpty.clear`、
> `empty.steps.{1,2,3}.{title,desc}`（三步改寫）、`occ.jump`（「跳到原文」）、`generating.cancelFailed`、
> `overview.batch.confirmTitle`（ConfirmDialog 標題，稿上無）。
> **5-4 新字串（E 區九組，2026-10-04 裁決通過，非草稿）**，放在既有 `symbol.*`（稿上的 `symbols.interp.*` 是示意名）：
> `interpretation.field.{theme,polarity,confidence,evidence}`（主題／極性／信心／證據摘要）、`interpretation.linkedCharactersN`／`linkedEventsN`（連結角色 · {n}／連結事件 · {n}）、
> `interpretation.rejectedNote`（只留後句）、`interpretation.saveEdit`（儲存修訂）、`interpretation.editZeroCost`（只改文字，不呼叫 LLM）、`interpretation.blockedKept`、
> `regen.title`、`regen.loss.content`、`regen.loss.status`。稿的 `symbols.pin.cancel`「取消並看」與既有 `pin.clearSelf` 同字，用既有、不新增；「LLM 詮釋」用既有 `interpretation.tag`。
> 因此既有 `interpretation.evidence`（證據綜述）、`confidence`（模型信心）、`confidenceNote`、`linkedCharacters`、`linkedEvents`、`review.label`、`review.save` 已無呼叫端，連同 `symbol.polarity.label` 與舊 `.sym-hero*`／`.sym-polblock*`／`.sym-confblock*`／`.sym-linked-*`／`.sym-review-btn` 樣式已刪（2026-10-04 刪除，B-129）。
> 已裁決：`generating.stageRunning`「進行中」；供應商阻擋標題「LLM供應商拒絕意象相關文本內容」並刪去內文兩句冗句；
> `generating.footerNote` 拿掉「預計 ~12 秒」（保留「每 2 秒輪詢狀態」）。此三處是已裁決的例外，不是改既有字串的通則。

#### 版面結構

```
[Left 284px]  [main：GuidanceRibbon → (LlmUnconfiguredNotice) → (觸發失敗橫幅) → 內容；max-w 1280]
```

#### Left Panel — 意象清單（components-rows 動作列）

- 排序下拉：`--input-*` 框＋Lucide chevron；七個值（敘事負載〔預設〕／角色依附／貫穿度／事件依附／正文頻率（對照）／首見章序／審核狀態），存 `?sort=`。
- 搜尋框（`--input-*`；match `term` 與 `aliases`；搜尋會涵蓋單次詞）、類別 chip（`?type=`；啟用態＝accent 邊與字，不依類別換色）。
- **list-group-head**：「依敘事負載排序」＋「{rows} · 已析 {n}」（已析＝清單列中 `item.interpretation` 非空者；sans tabular-nums）。載入中／失敗時不畫。
- 動作列：24px 類別 lead（類別 bg 色塊，Tooltip 寫類別名）、sans xs/500 意象名＋異體、行為短句、DensityStrip（8px，絕對色階；正文之外的格一律虛框）、右側分數（隨排序主軸）、12px 狀態點槽（polarity 點，無則留空）。無分隔線、列距 `--space-1`。選中／勾選＝`--bg-secondary` 底＋粗體名，**無左緣強調**。ReviewBadge／BlockBadge 可同時出現。
- 分數 **可信度 < 80%** 用 `--status-partial-fg`，並掛 Tooltip「證據可信度 {pct}%，低於可信門檻 80%」；triage 的可信度 chip 同門檻同色。
- 勾選模式：13×13 勾選框、radius 2px、勾號 `--accent-fg`；已有詮釋／被拒／單次詞不可勾。
- 狀態：overview 載入中／失敗→清單區留白（主區說明原因，不寫「尚無意象資料」）；0 筆→「全部 0」＋「尚無意象資料」；篩到空→filtered 空態「無符合結果」＋「清除搜尋」（清搜尋、類別與行為分群篩選）。

#### Landing（未選取）— 由上到下

1. 標題「全書意象地圖」＋meta（N 個意象 · N 次出現 · 行為訊號 N/N 可算 · LLM 詮釋 N/N · 證據有雜訊 N 個）。成本圖例註記已拿掉。
   「可算」＝overview 端 `items.length` 對上前端算出訊號的列數；overview 沒有「不可算」旗標（見 feedback 3-SY-3）。
2. 批次鈕（皆走 `ConfirmDialog`，`spendsTokens`）：前 5 名（primary＋`.ss-btn-llm`）、全部 N 個（secondary＋`.ss-btn-llm`）、勾選多筆（ghost，無字符）；勾選態為「生成已勾選（N）」＋「取消勾選」。批次面板不加取消；執行中標題「LLM 批次生成中」常駐、stage 另起一行；完成＝「批次完成」＋右側「關閉」＋三格大數字（已生成／跳過／失敗，失敗大於 0 用 error 色）與失敗清單（imagery_id＋reason）。熱圖軸頭最右為「負載」欄名。
3. **triage「該先讀哪幾個」（B2）**：accent 邊外框，第一名放大（`flex 2`、2xl 名、sm 句）、二三名並列。每卡五成分：排名、負載、行為短語、三顆 chip、CTA 文案（導航，無字符）。
4. **章節密度熱圖**：絕對色階，圖例三項「1 次／2 次以上／非正文」靠右在卡底（≥2 同一階，`densityStep`／`densityLegend`）；虛框格＝正文之外的出現（空或有都虛框）；Ink 用 `--symbol-density-*` 灰階＋框線。格子為 DS Tooltip（取代原生 title）。
5. **行為分群｜意象叢**：兩欄等寬等高，主欄窄於 720 疊成一欄。行為分群成員名單最寬 24ch 換行、成員 0 的形狀不列；意象叢子卡依錨點負載排序、全部往下排；0 個叢→保留卡片＋「沒有任何兩個意象在同一段共現 2 次以上。」；**邊界宣告永遠在卡底**。
6. **單次出現詞**：字級五階（ch1–2 xs → ch9–10 xl，依正文章數等比），前置頁／後記 2xs muted；不進排序／批次，可點可搜。

#### Content Area — 意象詳情

1. 麵包屑「← 全書意象地圖 / {意象}」＋「釘選以便並看」（`?symbol=&pin=`）；標題列＋異體。
2. **行為摘要六格，3＋3**：角色依附（含「唯一進入排序的共現訊號」註記與自我匹配過濾說明，後者只在 `self_match_count > 0` 時出現）／分布形狀／事件依附｜意象結盟／登場退場／證據可信度。寬度不足時降為 2 欄、1 欄。
3. **詮釋區**（三選一：CTA／生成中／已生成）：
   - **CTA 四階**（`InterpretationCta`）：同框同按鈕尺寸，只靠按鈕變體（recommended＝primary，其餘 secondary）與一句話區分；全部 `.ss-btn-llm`；框頭無字符；error 階（供應商阻擋）框用 `--color-error`＋警示圖示，附 `blockedHint` 與 `error.blockedInline`。`blocked` 判定優先於 load 門檻；按鈕保持可點。
   - **生成中**（`InterpretationGenerating`）：五段 stage，三態「完成／進行中／等待」；前三格共用同一 sepState；整體進度取後端打點值；不給 ETA；「每 2 秒輪詢狀態」；**取消**呼叫 `POST /tasks/{id}/cancel`，成功後才關遮罩，失敗留遮罩並顯示 `generating.cancelFailed`。
   - **已生成詮釋**（`InterpretationHero`，DS v3 第 5 批 5-4，依 11 補稿 A／B／C 區；位置在行為摘要之下、章節分布之上）：`--bg-primary` 卡（`.sym-interp`，`--card-*`、內距 `--space-6`、區塊間距 `--space-6`），無左緣強調。
     - **區塊頭**：12px 行內 `.ss-llm-glyph`（標示內容為 LLM 生成，不是按鈕）＋「LLM 詮釋」（連到 `/methodology?framework=sep_methodology`）＋審核 badge（`ReviewBadge`）＋被阻擋時的 `BlockBadge`；右側 mono provenance＝API 實值 `assembled_by · assembled_at`（`YYYY-MM-DD HH:mm`）。
     - **欄位**：主題（serif lg／1.6）→ 極性 chip（`--polarity-*`＋圓點，Ink 靠填色）與信心（●●●／●●○／●○○＋層級名＋數值 `0.00`＋固定區間「（0.55 – 0.79）」；層級與區間取 `frameworks:tier.*`，分數→層級界線 0.80／0.55 與方法論頁 `TierLegend` 一致，邏輯在 `interpretationModel.confidenceTier`；`TierLegend` 是方法論頁私有元件，這裡以文字圓點頁內實作、未抽共用）→ 證據摘要（serif sm／1.85）→ 連結角色 · {n}（`.ss-pill-character` 可點）／連結事件 · {n}（「第 N 章」mono＋標題，可點）。id 解析不到名稱者以 mono 虛線 chip 顯示截短 id（`truncateId`），不丟掉、不可點、Tooltip 顯示完整 id。
     - **審核**：通過／修訂／駁回皆零成本——無字符、無確認框；與當前狀態同值的那顆 disabled（通過、駁回；修訂永遠可按，因為它是重開編輯框）。後端三值任意互轉，但 PATCH 不能回到「待審」。修訂就地開編輯框：主題、證據摘要、極性（`--input-*` 輸入框；選中極性＝`--bg-secondary` 底＋accent 粗體）；「儲存修訂」＋「取消」＋「只改文字，不呼叫 LLM」；PATCH 成功才關編輯框（失敗保留草稿，錯誤列顯示 `symbol.error.reviewFailed`），儲存後狀態變已修訂。證據摘要草稿留空＝不送欄位（維持原值，不是清空）。
     - **已駁回**：內容降 0.6 透明（編輯中不降），區塊頂端加灰條「已駁回」＋`rejectedNote`（只有後句，前句經查證不屬實，見 feedback 5-SY-1）。
     - **重新生成**：`ss-btn-danger ss-btn-llm`，成本提示「會呼叫 LLM，消耗 token」（既有 `tension.state.tokenHintShort`）在按鈕左側；`window.confirm` 已換成 `ConfirmDialog`（損失清單版）：標題「重新生成「{term}」的詮釋？」、內文既有 `regenerateConfirm`、清單「目前的主題、證據摘要與連結」「審核狀態：{status}」、`costHint`、`danger`＋`spendsTokens`。503 → `LlmUnconfiguredNotice`（既有）。
     - **詮釋與阻擋並存**（C 區）：有 `interpretation` 又有 `interpretation_block` 時，舊詮釋照常顯示，區塊頂端加 warning 列（`--color-warning-bg`＋`--status-partial-border` 外框，Ink 靠外框）：標題沿用阻擋標題、說明句 `blockedKept`、既有 `blockedHint`、「再試一次」（`ss-btn-secondary ss-btn-llm`）。「再試一次」開同一個重新生成確認框並以 `force_refresh` 重送——不帶 force 時後端會命中快取直接回舊詮釋，等於沒重試；它也會覆蓋審核狀態，所以走確認框。
     - `frontMatterWarning`、行內錯誤列維持原樣，位於欄位之下、動作列之上。
4. 章節分布卡、共現網絡卡（三欄：角色依附／場景與物件／結盟意象）、出現紀錄卡（可跳的那筆有「跳到原文」文字鈕；不可跳的標「不可跳」＋Tooltip）。
   **並看展開態**（5-4，D 區）：釘選後在章節分布卡內展開下排（卡標頭右側「並看中：{term}」＋ghost「取消並看」，零成本；釘選與選取共用 query string）；兩排共用同一 max（`barScale` 取兩者較大），**同一個像素上限（72px）**，高度可直接互比；上排絕對次數色階、下排並看意象的類型色；次數 0 畫 1px `--border` 基線（上下兩排皆然），不留白洞；並看註逐字（`symbol.pin.note`）。

#### 失敗與空態（錯誤四分，{頁名}＝符號意象）

| 條件 | 顯示 |
|------|------|
| overview 載入中 | LoadingSpinner |
| overview 失敗（有 JSON body） | `PageFailure` page 版（重試／回書籍總覽〔沿用 `analysis:character.error.backToBook`〕／技術細節） |
| overview 失敗（無 body） | `PageFailure` backend 版 |
| 0 個意象 | `EmptyState` ready：shapes 圖示、「尚無符號意象資料」、「重新上傳書籍後將自動執行意象萃取。」、三步（建構概覽的說法）、「開啟建構概覽」「重新檢查狀態」（invalidate `qk.symbols.overview`） |
| 觸發 503（單筆或批次） | `LlmUnconfiguredNotice` 就地顯示，頁面其餘照常 |
| 觸發失敗，無回應 | 精簡橫幅「伺服器沒有回應」＋重試（重送同一次觸發）＋關閉 |
| 觸發失敗，有 JSON body | 橫幅「觸發詮釋失敗，請稍後再試。」＋關閉 |
| 供應商阻擋（功能層） | 該意象的 CTA error 階；行為訊號／熱圖／triage 照常 |

> `interpretation` 與 `interpretation_block` **彼此獨立**，可同時非 null。詳情區以
> `interpretation` 優先；側欄兩個徽章都顯示。批次勾選排除已被拒絕者，與 #15j 後端預設跳過一致。

#### 設計 token

- 意象類型：`--symbol-{object,nature,spatial,body,color,other}-{bg,fg,dot}`
- 詮釋極性：`--polarity-{positive,negative,neutral,mixed}-{bg,fg,edge,dot}`
- 章節密度：`--symbol-density-{mid,high}`（熱圖與詳情長條只用這兩階；`low`／`peak` 保留於 tokens，不再被 `densityStep` 使用）

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

### 3.10 建構概覽頁 `/books/:bookId/unraveling`（DS v3 第 4 批 · 4-2）

決議紀錄 `13 建構概覽 Unraveling 決議紀錄`，2026-09-25 定案；計畫 `docs/plans/20261004-ds-v3-batch4-views.md`；設計端待同步項見 `DS_V3_DESIGN_FEEDBACK.md` 4-UN-1～4-UN-14。

#### 功能目的

這頁回答三件事：**哪一層建了、哪一層是誰的前提、補這一層會連帶丟掉什麼。** 分析層不是 DAG 本身，而是 DAG 上的**依賴方向**與**重跑會丟下游**這條因果。27 個節點、層位、三態、共用觸發器關係、後端契約全部凍結。

#### 版面（B 檢視：24／16／12／8、max-w 1280、下內距 32）

```
┌─ GuidanceRibbon（共用，可關） ──────────────────────────────────┐
├─ 完成度總覽（一列）──────────────────────────────────────────────┤
│  eyebrow ／ 59%（3xl serif）＋ completionRule │ 分段總進度條 ＋ 圖例列   │
├─ DAG 面板（flex 1）──────────────────────────┬─ 右欄 340 ─────────┤
│  五欄欄頭（L0–L4：x/y · N 部分 · 加權進度條）  │  層次清單 ↔ 節點細節 │
│  選取時：圖例列＋「清除選取」                  │  （兩態同寬，DAG 寬度  │
│  SVG 920×586：五欄各 184、節點框 150×36        │   不隨選取變動）      │
└───────────────────────────────────────────────┴────────────────────┘
```

- 頁面本身是捲動容器（`.bo-page`），內容 `.bo-inner` max-w 1280（含左右內距 24，內容寬 1232，與時間軸 `.tl-inner` 同算法）置中；導覽條 margin-bottom 歸零，間距交給 gap。
- **完成度總覽**：加權 `(complete + partial × 0.5) / total`（示例 `(14 + 4×0.5) / 27 = 59%`）；大百分比旁一行 `unraveling.summary.completionRule`；右側分段條（complete／partial／empty 各用該狀態的底＋框，段間 2px）加圖例列（形狀記號＋計數＋`共 N 節點`）。
- **欄頭**：五層卡片下沉成 DAG 欄頭，`x/y`、`· N 部分`、進度條都保留，各層進度用同一套加權算法。
- **DAG**：`NODE_SLOT`（`components/buildOverview/buildOverviewModel.ts`）照稿列序；邊表 43 條來自 manifest（與稿逐條相同）。SVG 以 `width:100%` 等比縮放，`.bo-dagwrap` 最小 860，再窄就橫向捲動——字級不再縮小（SVG 文字用 `--font-size-2xs`）。
  - 同層邊（L0 鏈、`kg_event → kg_temporal_relation`）走欄外短側接；
  - **回頭邊** `eep → kg_temporal_relation`（唯一一條 L2 → L1）繞到譜面下方、虛線、加箭頭與標記字；
  - `paragraphs`（出 7）、`kg_event`（出 6）等多條扇出／扇入沿節點邊緣分散錨點；
  - 邊不畫箭頭（方向由欄序表達），只有回頭邊有；
  - KG 特徵虛線群組框保留。
- **節點三態**加形狀記號（右上）：實心＝完整、半實＝部分、空心＝未建立。**沒有「過時」這個狀態**。Ink 的四個 status 色都是 `#151515`，狀態只靠記號與文字，不靠色相。節點也可用鍵盤聚焦（Enter／Space 選取）。
- **L0 來源節點**：標籤前一個菱形記號，Tooltip `unraveling.layer.sourceHint`（SVG 形狀裝不了共用 Tooltip，疊一塊透明點擊區）。

#### 選取（B 區）

選中一個節點時，畫布同時標出三層：

| 層 | 畫法 |
|----|------|
| 上游依賴鏈（遞移，我需要它） | 節點 accent 實線框；連線 accent 實線 1.5 |
| 直接相連的節點（上下游一階） | 全亮；連線 `--fg-secondary` 實線 1.5 |
| 會被刪除（只在選中的節點屬 dropsDerived 觸發器、且表內有已建立節點時） | 節點 `--color-error` 虛線框、計數加刪除線、節點內加「會被刪除」 |

- 其餘節點淡出（opacity 0.3）、其餘邊 0.14。**邊不因失效著色**：失效範圍是逐觸發器的一張表，不是沿 DAG 遞移。
- 圖例列：`上游依賴鏈 N 個`（accent 線樣）＋ `unraveling.cta.confirm.dropsDownstream`（error 虛線樣，與確認框清單標頭、節點細節說明條逐字共用）；右側 `unraveling.toolbar.clearSelection`（既有字串「清除選取」，取代舊的「全部」；`toolbar.showAll` 已刪（2026-10-04 刪除，B-129））。
- 失效表（前端常數 `DROPS_BY_TRIGGER`，畫布與確認框共讀，只列已建立〔complete／partial〕的節點）：

| 觸發器 | 列出 |
|--------|------|
| feature-extraction | （空） |
| symbol-discovery | sep、symbol_analysis_result |
| knowledge-graph | cep、character_analysis_result、teu、voice_profile、eep、causality_analysis、impact_analysis，**加 kg_temporal_relation、chronological_rank、kg_concept_inferred**（後端 KG 重跑實際另清這三顆；計畫 Q2，回饋 4-UN-1） |

#### 右欄

- **層次清單**（components-rows＋list-group-head）：標頭 `L{n} · {層名}` 左、`{N} · 已析 {M}` 右（**已析只算完整**）；列 grid `24px 1fr auto 12px`（L0 菱形／名稱／計數／狀態記號）。計數沿用既有 `nodeSubLabel`；推斷概念有待審時改顯示 `{n} 待審`（待審數由前端打 `GET /inferred-concepts?status=pending` 自算，**節點狀態仍照 manifest，不覆寫成 partial**）。
- **節點細節**（標頭「節點細節」＋右側「返回層次清單」）。結構順序：節點名＋狀態 badge → `L{n} · nodeId` → 〔L0 說明條〕→ 章節分佈（只有 paragraphs／summaries／keywords／kg_event／symbols 五個節點）→ 同一次執行說明條 → 刪除說明條 → **動作區（下表）** → 前往對應頁面瀏覽 → 推斷概念審查佇列 → 原始計數 → 附加資訊（空值顯示「—」）。

動作區六態（`actionModeFor`，順序即優先序）：

| 態 | 條件 | 呈現 |
|----|------|------|
| 建構中 | 本節點的任務在跑 | **只留 spinner＋「建構中…」**（不顯示 stage／%／TASK id） |
| 來源（L0） | `layer === 0` | 沒有觸發鈕、沒有原始計數；說明條 `sourceHint`；「前往對應頁面瀏覽 · 尚未實作」；只有附加資訊 |
| 刻意擋掉 | `narrative_structure`（優先於 blocker，完整時也是） | warning 底盒＋ `unraveling.detail.blockedByHazard` |
| 被上游擋住 | 非完整且有未完成的一階上游 | 「尚未就緒」＋「需先完成上游 N 個依賴」＋ **blocker chips（可點，跳去該節點）**＋ disabled 鈕「還缺 N 項前置」 |
| 觸發 | 有觸發器 | 觸發鈕（`.ss-btn-llm`；dropsDerived 觸發器用 `.ss-btn-danger`）＋鈕下「會呼叫 LLM，消耗 token」。**完整節點也可重跑**，沿用「補齊／繼續…」那一句 |
| 規劃中 | 無觸發器、非完整 | disabled「觸發建構功能規劃中」（其餘 8 顆無觸發器節點，回饋 4-UN-5） |

- **同一次執行**：觸發鈕上方說明條 `與 {names} 是同一次執行的不同檢視`，`names` 由觸發器共用關係推（CEP＋角色分析；EEP＋因果＋影響力；實體＋概念＋關係＋事件）。
- **觸發失敗**：既有「觸發失敗」盒（error 底）＋重試鈕；`triggerFailedDetail` **不渲染**（任務錯誤只有自由字串，沒有 status／reason，回饋 4-UN-7），後端回的原文收成技術細節一行。
- **應用層 503**（未設定 LLM provider）：就地 `LlmUnconfiguredNotice`，面板其餘照常、觸發鈕仍在（原本直接顯示英文 detail）。
- 原始計數只顯示 API 有的鍵（稿上的 `chapters_covered`、`last_run`、`links` 等 API 沒有，回饋 4-UN-2）。
- 章節分佈長條用 `--symbol-density-mid`，Tooltip 顯示 `Ch.N: 值`（原生 `title` 已換掉），軸兩端標 `Ch.1`、`Ch.N`。

#### LLM 字符與三條軸

七個觸發器（摘要、關鍵字、象徵、知識圖譜、角色批次、事件批次、概念推斷）**全部 `.ss-btn-llm`，確認框內那顆也是**；點節點、清除選取、返回、前往頁面、採用／否決不掛。**花 token、寫資料、不可逆互不蘊含**：危險色只看 dropsDerived（feature-extraction／symbol-discovery／knowledge-graph 三種），不看花不花 token。關鍵字預設不呼叫 LLM、字符偏保守，見回饋 4-UN-3。

#### 確認框（D 區，一律 `ConfirmDialog`）

標題＝動作名、確認鈕＝動作名、`costHint`「會呼叫 LLM，消耗 token」在按鈕列左側（既有字串 `tension.state.tokenHintShort`）。內文只有一句：

| 情況 | 適用 | 內文 | 按鈕 |
|------|------|------|------|
| 補洞 | summarization、概念推斷、角色批次、事件批次 | `keepsDownstream` | 一般＋字符 |
| 刪除 | symbol-discovery、knowledge-graph | `affectsDownstream`＋分段清單（標頭 `dropsDownstream`，項目「名稱 · 計數」） | danger＋字符 |
| 覆蓋 | feature-extraction（清單為空） | `overwrites`（清單整段不出現） | danger＋字符 |

舊的 `confirm.title／intro／start／token／dropsDerived` 已刪（2026-10-04 刪除，B-129）（舊句「已完成的部分會自動跳過」不留）。

#### 推斷概念審查佇列（E 區，全頁唯一的 HITL）

掛在 `kg_concept_inferred` 節點細節裡；無待審時整塊不渲染。標頭 `待審查命題（N）`＋右側「展開審查 ↓／收合審查 ↑」（預設展開，回饋 4-UN-11），下一行 `rejectPermanent`。每張卡：名稱（serif）＋`信心 {v}%`（mono、tabular-nums）、描述、證據逐字條列（`·` 前綴、無左邊框）、**採用＝次要鈕（冪等）、否決＝危險鈕（永久）**，兩顆零成本，**都不掛字符**。

#### 頁面狀態（F 區）

| 態 | 呈現 |
|----|------|
| 載入 | **骨架**（形狀已知：總覽一列、五欄欄頭、五欄節點格 3／6／3／5／2、右欄 8 列）；不顯示導覽條 |
| 單頁失敗（應用層 JSON body） | `PageFailure` page：「無法載入建構概覽」（`nav:tabs.unraveling`）＋「重試」＋「回書籍總覽」（既有 `character.error.backToBook`），錯誤碼收進「技術細節」；書名列與側欄照常 |
| 後端失敗（裸 502／503／504） | `PageFailure` backend：「伺服器沒有回應」＋「重試」 |
| 取書失敗 | `BookLayout`（4-0）處理，本頁不介入 |

錯誤分支是同一元件內的條件渲染，不會 mount／unmount 本頁，沒有 react-query 掛載迴圈。

#### 字串來源與草稿

既有字串一字不改（「全部」不是改字，是改用既有的 `clearSelection`）。README §5「已裁決」的新字串（i18n `unraveling.*`，zh-TW 與 en 皆已補）：`cta.confirm.dropsDownstream／keepsDownstream／affectsDownstream／overwrites`、`detail.sharedTrigger／missingPrereq／blockedByHazard`、`layer.sourceHint`、`concepts.rejectPermanent`、`summary.completionRule`。`detail.triggerFailedDetail` 已裁決但**本批不渲染（無資料），未進 i18n**。

**這 9 句是草稿・待設計定案**（i18n `analysis:unraveling.*`；JSON 不能寫註解，故記在此；zh-TW 與 en 都已補）：

| key | zh-TW |
|-----|-------|
| `selection.upstreamCount` | 上游依賴鏈 {{n}} 個 |
| `selection.willDelete` | 會被刪除 |
| `dag.kgGroup` | KG 特徵 · 同一次重跑 |
| `dag.backEdge` | 回頭邊 · 時序關係要等 EEP（L2 → L1） |
| `layerList.counts` | {{n}} · 已析 {{done}} |
| `concepts.pendingCount` | {{n}} 待審 |
| `concepts.expand` | 展開審查 ↓ |
| `concepts.collapse` | 收合審查 ↑ |
| `detail.nameJoin` | 、（`sharedTrigger` 的 `{names}` 分隔符） |

**已刪的孤兒 i18n key**（2026-10-04 刪除，B-129）：`toolbar.showAll`、`cta.confirm.title／intro／start／token／dropsDerived`、`inspector.layerLabel`、`unravelingLoadError`（analysis 頂層）。

#### 已實作

- 完成度總覽一列、欄頭、DAG 重排與回頭邊、三態形狀記號、選取三層、失效表、六態節點細節、三種確認框、審查佇列、骨架、錯誤四分
- 純邏輯在 `components/buildOverview/buildOverviewModel.ts`（測試 `buildOverviewModel.test.ts`）

**規劃中（Backlog）**：
- B-046 Phase 2：其餘節點的觸發 CTA（tension / hero journey / temporal 端點已存在；`narrative_structure` 刻意擋掉；`teu` / `voice_profile` / `chronological_rank` 需新增後端批次端點）
- 章節分佈擴展到 `kg_entity` / `kg_concept`（需 domain model 加上 chapter linkage）
- B-127：已採用推斷概念在 KG 重跑後永久消失、無法再採用（後端）
- 研究者導覽的重開入口（第 19 稿，不在本批）

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：
- #19（建構概覽 manifest）、#19b（章節分佈，用於節點細節）
- #10f／#10g／#10h（推斷概念清單／採用／否決）、#10e（概念推斷，4-0 起未設定 provider 回 503）

---

### 3.11 方法論頁 `/methodology`（DS v3 第 2 批）

全站層級、不屬於任何書籍的教育中心。**零 API、零 token、零寫入**：資料全是前端靜態檔
（`frameworksData.ts`，隨 UI 語言切 zh／en），所以**沒有 loading／error／empty 態**，唯一的「空」是 rail 搜尋無命中。
全頁**不掛 Sparkles**（它專屬 LLM 成本）：節頭改編號 01–06，分類卡不放圖示。決議紀錄 07、批次計畫
`docs/plans/20261002-ds-v3-batch2-system.md`。

#### 版型（C 入口密度）

```
[Left Sidebar 48px] [rail 232px] [內容：標題列＋分頁 → 文章 flex ＋ 本頁目錄 188px]
```

page padding `--space-8`（32）、節距 `--space-8`／標題列 `--space-7`（24）、卡 padding `--space-6`／`--space-7`（16／24）。
**頂列併入內容區標題列**：標題（serif 2xl）＋分類 chip（單一方法頁）＋「全站參考，不屬於特定書籍」（總覽與單一方法頁都有，
是本頁的資訊架構定位宣告）；總覽標題旁多一個「說明文件」標。分頁「理論與方法／跨書查閱」是 **underline 樣式**，放在標題下方。

#### rail（232px，`methodologyModel.buildRailGroups`）

- 品牌區（「方法論」＋「說明文件」＋ mono `METHODOLOGY`）→ 搜尋框 → 「總覽」→ 四組分類。
- 搜尋框用 `--input-bg`／`--input-radius`／`--input-border-width`，padding `--space-3 --space-5`。
- 分類（角色分析／敘事弧分析／張力分析／象徵分析）與方法名逐字；每個方法下一行 **mono 規模數字**
  （12 類型／45 類型／12 階段／2 類型／3 類型／4 神話／7 情節／5 步驟）；分類標頭右側是該組方法數
  （2xs muted sans、tabular-nums，**不隨狀態換色**）。
- 選中態＝`--bg-secondary` 底＋accent 字＋加粗，**不用左緣／inset 強調**（本頁目錄同）。
- 搜尋同時比對**方法名、item 名、分類名**（不分大小寫）；搜尋期間「總覽」仍在、所有分組強制展開（無折疊箭頭）；
  無命中的組**整組不渲染、標頭一併消失**。查「英雄」→ 角色分析 2／敘事弧分析 1。
- 分類組平時可個別收合（`collapsed` 本地狀態）。

#### 總覽

標題列 → lead（serif，逐字）→ 分隔線 →「概念架構」節頭（無編號、無圖示）→ 四張分類卡（2 欄）。
每張卡列出該類方法，每列右側 mono accent 規模數字；點卡片本身跳該分類第一個方法（`firstOfCategory`），點方法列跳該方法。

#### 單一方法六節（`?framework=` 驅動，`replace: true`）

| # | 節 | 內容 |
|---|----|------|
| 01 | 引言 | `description` 逐字（serif）＋兩個計數（items 數／理論來源數） |
| 02 | 概念架構 | 節頭副標＝`conceptSub.*`；八張專屬概念圖（下節）＋ caption |
| 03 | 類型一覽 | 三欄卡：序號（mono accent）、名稱（serif）、英文 id（mono）、badge、`details.slice(0, 2)`；**Schmidt 例外**見下 |
| 04 | 系統如何分析 | 三步 pipeline 卡（mono accent 階段標記「輸入／處理／輸出」＋序號＋描述），步間 Lucide `arrow-right`；其下「輸出欄位」schema 表（欄位名 mono｜型別 mono｜註記，無表頭列） |
| 05 | 分析品質與信心值 | 見「信心值分歧」 |
| 06 | 參考文獻 | `[n]`（mono accent）＋「作者 (年份). *書名*. 出版社. — 註記」 |

右側「本頁目錄」編號 01–06，沿用 IntersectionObserver 高亮目前所在節、點擊平滑捲動。<1080px 隱藏目錄。

**Schmidt 45 類型**：依 badge 首詞分三組（`groupItemsByBadge`；zh 女性 17／男性 18／中性 10，en Female／Male／Neutral 同數），
每組一條 **sticky 標頭**（組名＋數量，捲動容器為 `.md-content`），組內保留資料原序與**原序號**；
不分頁、不加「顯示更多」、不縮成列表。每卡：名稱、id、badge、核心驅力、最大恐懼。

#### 八張概念圖（`ConceptDiagram.tsx`）

各自不同結構，**不正規化成同一版型**；viewBox、marker、節點座標、分組順序照原始碼。圖卡右上帶「附信心值」或
「不產生信心值」標（後者虛線框）。**Ink 下 `--entity-*` 與 status 色會退成同一個灰，所以每個分類層都帶非色相載體**：
填色之上疊 0／45／90／135° hatch（SVG `<pattern>`，id 前綴 `md-`）、節點分組用記號形狀（實圓／空圓／實方／空方）＋半徑差、
邊用實線／虛線與有無箭頭。不新增色相，SVG 內一律 `var(--*)`。

| 方法 | 結構 | 非色相載體 |
|------|------|-----------|
| Jung | 輪盤 460×410：四取向象限（楔內標取向名）＋12 節點 | 象限 hatch 0／45／90／135°、節點 實圓／實方／空圓／空方；圖例色塊同載體＋每組 3 |
| Schmidt | 性別對偶脊：左八女神、右八男神，同列為一組對偶 | 兩欄表頭自帶文字；算式「8 女性 + 8 男性 + 配角 · 反派 = 45」下一行交代句（草稿，見下） |
| 英雄旅程 | 階段環 400×400：兩個世界（虛線直徑為閾限；兩個標籤內移避開節點，暫時修法，FEEDBACK 2-MT-9）× 三幕 × 12 階段順序 | 三幕 實圓／實方／空圓；環外圖例按幕分組列階段名（`hjStageList`） |
| Chatman | 因果鏈 560×190：kernel（半徑 20、實線填色、有箭頭）／satellite（半徑 14、虛線空心、無箭頭） | 半徑、填充、線型、箭頭四重 |
| Genette | 雙軸交叉 460×230：上軸文本順序 A／B／C、下軸**故事順序 C／B／A**（C 最先發生在左） | 順序＝實線、倒敘＝密虛線、預敘＝疏虛線；下軸節點底色標型別；位移標籤放在兩線之間 |
| Frye | 四季圓環 400×410：季節／神話名／登錄詞三層文字＋**四段外弧順時針循環箭頭**（`frye-arrow`） | 四季 hatch |
| Booker | 曲線族 120×40 ×7：**兩欄七格**，每格同尺寸小框＋同一條虛線中性線＋同筆色 | 中性線之上為升、之下為降 |
| SEP | 流程迴圈 660×250：資料層（四步有向序列）→ AI 詮釋層（LLM → HITL）＋退回邊 | 兩層帶 hatch 0／90°；實線推進、虛線退回 |

#### 信心值分歧（本頁最重要的分析層）

- `hasConfidence === true`（jung／schmidt／hero_journey／chatman／sep_methodology）：導言「每一項判定都附帶一個 0–1 的信心值…」
  ＋ **HonestCallout**（標題「信心值是什麼，不是什麼」＋全文逐字，serif、`--bg-secondary` 面、72ch，不分行重組、不縮成 tooltip）
  ＋ **三層級圖例**：已確立 `0.80 – 1.00`／推定 `0.55 – 0.79`／暫定 `0.00 – 0.54`（區間 mono accent，不可省），各帶一句描述與
  ●●●／●●○／●○○ 非色相圓點；**不畫成連續漸層條**。
- `hasConfidence === false`（genette_temporal_order／frye_mythos／booker_plots）：只顯示 **NoConfidenceNote** 全文逐字；
  三層級圖例**完全不顯示**（不灰掉、不寫「不適用」、不折疊）。
- 兩種 callout 共用同一外框＋Lucide `alert-triangle`（`--color-warning`）。

#### 跨書查閱（兩種佔位，不合併）

- `crossBook === true`（7 個方法）：分頁可點；內容＝虛線徽章「跨書查閱即將推出」＋說明全文（`crossSoonBody`）。
- `sep_methodology`：分頁 **disabled**，`components/ui/Tooltip.tsx` 掛在外層 wrapper（取代原生 `title`），tooltip 與內容是同一句
  `noCross`。「還沒做」與「不會有」是兩件事。

#### 字串來源與草稿

字串一律優先用既有 `frameworks.json`（`conceptSub.*`、`concept.*`、`hjStageList` 等稿標「缺」者其實都在）；圖內標籤與稿不同時用既有，
第 05 節標題用既有「分析品質與信心值」。決議紀錄每張卡的「設計註」不進產品。
**這 3 句是草稿・待設計定案**（i18n `frameworks.confBadgeHas`／`confBadgeNone`／`concept.schmidtNote`；JSON 不能寫註解，故記在此）：
「附信心值」「不產生信心值」（圖卡右上標）、Schmidt 算式下的「圖中 16 位是主角原型；類型一覽的 45 張卡另以 badge 標性別：
女性 17、男性 18、中性 10。」（數字已以 `frameworksData` 實算核對相符，`methodologyModel.test.ts` 鎖住 17／18／10）。

#### 元件位置

| 區塊 | 位置 |
|------|------|
| 頁面入口 | `frontend/src/pages/MethodologyPage.tsx` |
| 概念圖（八種） | `frontend/src/components/methodology/ConceptDiagram.tsx` |
| 純邏輯（rail 搜尋比對、Schmidt 依 badge 首詞分組）＋ vitest | `frontend/src/components/methodology/methodologyModel.ts`／`.test.ts` |
| 範圍 CSS（`md-` 前綴） | `frontend/src/styles/methodology.css` |
| 資料來源 | `frontend/src/data/frameworksData.ts`（含 `pipeline / output / categoryId / crossBook / hasConfidence`） |

#### 從角色分析頁跳入

```
/methodology?framework=jung     → 自動選中 Jung 原型（About 分頁）
/methodology?framework=schmidt  → 自動選中 Schmidt 類型
```

---

### 3.12 Token 用量頁 `/token-usage`

全站層級（非書籍頁面）。DS v3 第 2 批改版（決議紀錄 06）：B 檢視、頁面 CSS `frontend/src/styles/token-usage.css`
（`tu-` 前綴），純邏輯在 `components/tokenUsage/tokenUsageModel.ts`。**純讀取儀表板——零 token、零寫入，不掛 sparkles。**

#### 密度與版面

padding 24／section 16／card 12／row 8，內容 max-w 1280。

```
[標題「Token 用量」        書籍下拉  範圍 pill ×4]
[摘要 3 張]
[書籍別用量（byBook）]
[服務別用量 | 模型別用量]      ← 並排 1.25fr／1fr（≤900px 疊成一欄）
[每日趨勢]
```

標題列右側順序：**書籍下拉在前、範圍 pill 在後**（依 06 決議紀錄 A／C；README §3.1 寫反，FEEDBACK 2-TU-4）。標題 serif 2xl，區段標 serif base 600。

- 範圍 pill：四顆獨立 chip「今天／7 天／30 天／全部」，`--pill-radius`，idle `--bg-secondary`，選中 accent 實心；切換時重新請求。
- 書籍下拉：`--input-bg`／`--input-radius`／`--input-border-width`，min-width 180。選項「全部書籍」＋各書＋「未歸屬」。
  書清單為空（含全部查詢失敗）時不渲染。它是唯一能選到「未歸屬」的入口，所以不能拿掉。

#### 書籍選擇器與下鑽

選定一本書時，**byService、byModel、daily、摘要卡都跟著限定**；byBook 不縮。

byBook 表的每一列都可點選，等同於用下拉選它，**兩者是同一個狀態**；點已選中的列取消選取。表格**永遠顯示全部書籍**
（資料取自未過濾的請求），所以選定一本之後仍能直接換到另一本。選定時表上方出現說明
「這張表永遠顯示全部書籍——點另一列即可切換」。

- 只有 byBook 的列有 cursor 與 hover；byService／byModel 不可點、無 hover。
- 選中列：`--bg-secondary` 底＋加粗＋Lucide `check`（accent）。**不用左緣／inset 強調**；check 讓 Ink 下不靠底色也讀得出。
- 名稱格內是一顆 button（`aria-pressed`），鍵盤可達；整列 click 也等效。

兩種沒有書名的列必須看得見，不得隱藏、併入其他列或降階成灰字：

| 情況 | 顯示 | 為什麼 |
|------|------|--------|
| `bookId` 為 `null` | 「未歸屬」 | 全站對話、以及 2026-08-19 歸因修正之前的舊記錄。那些錢花過了，藏起來會讓總數對不上 |
| `bookId` 有值但 `title` 為 `null` | 「已刪除的書 · <id 前 8 碼>」 | 刪書刻意不清 `token_usage`；id 前綴是僅存的辨識依據，也足以區分兩本已刪的書 |

#### 摘要（3 張，刻意不是 4 張）

kit `.ss-stats-row`／`.ss-stat`（數值在上、標籤在下）：Prompt Tokens／Completion Tokens／總呼叫次數。
`totalTokens` **不上卡**，合計只出現在各表的「合計」欄。

#### 細分表格

三張表（byBook／byService／byModel）表頭逐字「名稱／Prompt／Completion／合計／呼叫」（「Prompt」寫死，維持現況）。
數字欄 mono 2xs、右對齊＋tabular-nums；合計欄加粗，呼叫欄淡化；依 totalTokens 降冪。服務中文名走既有 `token.services.*`，旁邊不標 slug；
byModel 顯示原始 model id。

#### 每日趨勢

與表同框的容器；每列：日期（mono、44px）＋ 12px 高長條（accent，全同色、不標峰值、無透明度差）＋ 數值（92px 右對齊）。
**無軸線、刻度、格線、tooltip**——長條是本期相對值，數值才是量值來源。長條寬＝該日／期間最大值（`dailyScale`）。
標題右側（同一行）的刻度註記帶入最大值那天的 MM-DD 與數值（千分位）；日期與數值皆 mono。

#### 狀態

| 狀態 | 呈現 |
|------|------|
| 載入中 | 內容區整塊 spinner＋「載入中…」（common `loading`），**不換骨架**（節數隨資料變）。標題列與範圍 pill 保留 |
| 全頁空（`summary.totalCalls === 0`） | 虛線框＋置中灰字「尚無使用記錄」；範圍 pill 仍在，無 CTA |
| 空區段 | byBook／byService／byModel／daily 為空時**整節隱藏**——不留空表、不寫「無資料」、不畫虛線框 |
| 失敗 | 頁面打兩個查詢（未過濾、選定書），**任一失敗都走失敗態**。依 `failureKind`：`page` →「無法載入Token 用量」＋定案兩句＋技術細節；`backend` →「伺服器沒有回應」。**標題列與範圍 pill 保留**（換範圍是新請求）；「重試」重打兩個查詢 |

#### 字串來源

既有字串逐字保留（`settings.json` 的 `token.*`）。**新字串 2 句，皆為已裁決**（README §5／決議紀錄 06）：
`token.dailyNote`（刻度註記）、`token.byBookScope`（byBook 範圍說明）；失敗標題用 common 的 `failure.pageTitle`。無草稿字串。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#17（Token 用量）

---

### 3.13 設定頁 `/settings`（DS v3 第 2 批）

`pages/SettingsPage.tsx`、`components/settings/settingsModel.ts`（純邏輯，含 vitest），樣式 `styles/settings.css`（`st-`）
與 kit `.ss-seg*`／`.ss-btn*`／`.ss-stats-row`。依 04 決議紀錄 A–G frame。

#### 密度與骨架（C 入口）

- 內容區 padding 32、section 24、card 16、面板 `max-width: 960`；左側 nav 172px，一次只顯示一個面板。
- nav：頁首「設定」serif＋分隔線；三組（偏好設定／系統／其他）、八項 Lucide 圖示（`palette`／`languages`／`compass`／`cpu`／`server`／
  `keyboard`／`flask-conical`／`info`）；底部版本號上方分隔線。列 padding `--space-4`、gap `--space-4`、`--radius-sm`、xs；
  **選中＝`--bg-tertiary` 底＋accent 字 600，無左緣條**。標籤＋徽章放不下時（英文介面），徽章換到第二行靠右，標籤不截——暫時修法，待設計定案（FEEDBACK 2-ST-13）。
- **研究者導覽（04 A2）第 5 批 5-1 已落地**：偏好設定群組第三項（外觀與主題、語言之後），圖示 Lucide `compass`；nav 共三組八項。
  面板 `GuidancePanel`：`PanelHead`（標題 `settings.guidance.title`、副標 `settings.guidance.hint`）＋一列
  secondary 小鈕「重設所有導覽」（`guidance.reset`；零成本、可逆、不動分析資料，所以**無字符、無確認框、無 toast**）＋右側計數
  （`guidance.count`「已關閉 {{n}} 條」／`guidance.countNone`「目前沒有已關閉的導覽」；n=0 時按鈕 disabled，這就是回饋）。
  計數由 `localStorage` 的 `storysphere:guidance-dismissed:*` 鍵數即時算出（`guidanceStore.useDismissedCount`），不是估計值。
  四條字串 2026-09-25 裁決通過（**非草稿**；en 依語意翻）。
- **三種徽章視覺分化**（文字互不相同，Ink 下不另掛圖示）：開發者＝warning 底、整合＝success 底、規劃中＝虛線描邊＋muted 字且整列 opacity 0.55。
  面板標題旁同框：語言「整合」、環境「開發者」。
- 區段小標（accent 圖示＋serif）：介面主題、目前設定、部署模式、目前狀態、資料遷移。其餘小標（Qdrant Service、知識圖譜後端、
  Neo4j 連線、前端／後端套件、資料路徑）是無圖示的 2xs 小字。
- `/settings#llm` 開 LLM 面板（第 1 批 02 章節審閱 503「前往 LLM 設定 →」的落點）。

#### 面板

- **外觀與主題**：副標「點擊即時套用，無需確認。」緊貼標題。兩張主題卡：頂部滿版四色帶（bg-primary／bg-secondary／accent／fg-primary，
  帶間 hairline，無 1px radius）；「✓ 目前」角標右上（Lucide `check`）；選中卡 2px accent 外框；名稱 sans。
  Ink 色帶包一層 `data-theme="ink"` 讀真實 token；**Warm 色帶保留文件化的 hex 例外**（Warm 是 `:root` 預設，Ink 文件下巢狀
  `data-theme` 讀不回 Warm 值；改 Warm token 時要連動 `settings.css`）。選擇後立即套用，走 ThemeContext，頁面不碰 localStorage。
- **語言**：介面語言用 `.ss-seg`（選中升到 bg-primary）；分析輸出語言整塊 opacity 0.55、「即將推出」虛線徽章、兩顆 disabled 鈕
  維持既有「跟隨介面語言／自訂語言」。兩條 hint 逐字各貼欄位下。
- **LLM 設定**：唯讀 text row（hairline 分隔；值為 `(none)` 用 muted）；副標與底註兩條唯讀宣告都在、不合併；不加編輯鈕、不加 .env 連結。
- **環境設定**：
  - 部署雙卡（`role="radiogroup"`）：radio＋tagline＋Qdrant／KG 規格。「（目前）」跟著實際 `deployMode`，選中框跟著使用者點選；
    兩者不一致時選中的那張另掛「**預覽中**」（`deployBadges`）。
  - **Lightweight**：目前狀態 text row（Vector 數量 null → 「—」）＋三張 KG 統計磚（kit `StatRow`：tinted 底、sans tabular）。
  - **Standard 預覽**：最上方警告橫幅；Qdrant Service 欄位與 **Neo4j 連線**欄位（常駐，不再只在選 Neo4j 時出現）一律只有
    placeholder、無 value／onChange，旗標「需重啟」（warning 底）；KG 後端 `.ss-seg`，旗標「即時生效」（success 底）只掛在這裡，
    其下是能力落差層，再往下是 Neo4j 例外註記（在 Neo4j 連線欄位之後）。Neo4j 欄位名為既有 `NEO4J_URL`／`NEO4J_USER`／`NEO4J_PASSWORD`
    （稿上 `NEO4J_URI`＋「即時生效」與後端不符，見 FEEDBACK 2-ST-2）。輸入框用 `--input-*`、文字 xs。
  - **能力落差層**（位置在 segmented 之下、切換之前；`gapLayer`）：措辭一「目前後端無法提供這些功能：」＝error 底、Lucide `circle-x`、
    功能名**實心**；措辭二「切換到 {Neo4j|NetworkX} 會停用這些功能：」＝warning 底、`alert-triangle`、功能名**描邊**。兩者互斥、不合併；
    圖示形狀與填色極性是 Ink 下的非色相載體。功能 id 一律中文（`env.kgFeature.*`）；**不認得的 id 不裸露**，合併成一顆「其他功能」。
  - **資料遷移**：三列（方向箭頭，第三列朝左）＋冪等註記＋其後 ghost 鈕「重新整理狀態」（`refresh-cw` 圖示，手動重取 `GET /kg/status`）。
    另有每 15 秒背景刷新，**無任何視覺提示**。
    - 遷移三態（`MigrationState`）：進行中「遷移中…」（`loader`，既有 2 秒輪詢）；完成計數列（`circle-check`；3 秒後自收並刷新 KG 狀態，
      畫面不寫倒數）；失敗後端原文（`circle-x`，不改寫不翻譯）。啟動遷移的請求本身失敗，也走同一個失敗態顯示原文。
    - 兩種「功能尚未實作」：Qdrant 列＝**永久**（虛線外框＋降階＋**無鈕**＋無門檻說明，旗標「功能尚未實作」）；
      KG 兩列＝**條件性**（實線外框＋「執行遷移」鈕在場但 opacity 0.5＋門檻說明「門檻未達成：需 Standard 態 · KG 後端為 Neo4j」；
      達標（Standard＋KG 後端為 Neo4j，`kgMigrationGate`）後門檻說明消失、旗標換「即時生效」、鈕可按；遷移進行中鈕再度 disabled）。
- **關於 & 版本**：hero（S 方塊、StorySphere、版號＋`appEnv`）、前後端套件兩欄、資料路徑——key 保留原始欄位名（mono），
  `databaseUrl` 照後端遮罩顯示，不可展開、無眼睛圖示。
- **規劃中面板**（快捷鍵、實驗性功能）：圖示＋徽章＋標題＋一句說明四件，無 CTA、無時程暗示。

#### 載入與失敗（面板內，nav 全程可用）

- 載入：行內 spinner＋「載入中…」。
- 失敗：紅字一行（「無法載入 LLM 設定」／「無法載入狀態」／「無法載入版本資訊」逐字）＋手動「重試」（`common.json` 的 `retry`，secondary sm）；
  不自動重送、不寫倒數。環境面板只在「完全沒有資料」時才顯示失敗（15 秒背景刷新失敗時保留舊資料）。
  這三條是面板層紅字，不用整頁 `PageFailure`。

#### 字串

**這 2 句是已裁決的新字串**（i18n `settings.env.previewTag`、`gateNote`）：「預覽中」、「門檻未達成：需 Standard 態 · KG 後端為 Neo4j」。
**這 3 句是草稿・待設計定案**（i18n `settings.env.runMigration`、`neoSectionTitle`、`kgFeatureUnknown`；JSON 不能寫註解，故記在此）：
「執行遷移」（稿上有按鈕、既有 i18n 沒有）、「Neo4j 連線」（稿上有段標、既有 i18n 沒有）、「其他功能」（不認得的功能 id 的泛稱，稿上沒有）。
en 對應：Previewing／Requirement not met: Standard mode · KG backend set to Neo4j／Run migration／Neo4j connection／Other features。
其餘文案皆為既有字串逐字。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#18a（KG 狀態，含 `unsupportedByMode`）、#18b（切換後端）、#18c（觸發遷移）、#18d（遷移 polling）、#25a（`GET /settings/info`）

> 注意：KG 遷移 polling 走 #18d 專用 endpoint，不走 #8。

---

### 3.14 敘事結構頁 `/books/:bookId/narrative`

張力（3.8）、符號（3.9）之外的第三條平行分析線。i18n namespace 為 `analysis.json` 的 `narrative.*`。**DS v3 第 5 批（5-3）改版**，依 16 決議紀錄（2026-09-26 定案、2026-10-04 補登）與 16 提案 v2。
分級 **B 檢視**（24／16／12／8、max-w 1280、下內距 32），書籍 chrome。三塊依序：敘事結構（索引卡＋頁首）、英雄旅程（Campbell 12 階段）、事件骨幹（Chatman kernel／satellite），外加最下層的交叉證據。三塊讀的是**章節摘要，不是原文**。

#### 版面結構

```
[頁首 — 頁名 + 一句定位 + 書級 meta]
[研究者導覽條 — GuidanceRibbon surface="narrative"，字串逐字]
[索引卡 — ① 詮釋・英雄旅程 / ② 統計・事件骨幹 / ③ 旁證・其他結構線索]
[過期橫條 — is_stale 時，疊在英雄旅程卡上方；「✦ 重新分析 →」文字連結只捲動並聚焦、短暫高亮卡內 LLM 鈕（`#nl-hero-run`），不觸發分析]
[英雄旅程卡 — 標題列 + 書級審核 + 分段切換 + 缺席說明 + 圖｜階段詳情（sticky）]
[事件骨幹卡 — 比例列 + 逐章核心事件 + 選定事件 + 未分類區塊 + 跳轉]
[交叉證據卡 — 三列同軸 + 時序結構／張力兩欄]
```

③ 只在已有英雄旅程結果時渲染（`hasHeroJourney` gate 不動，三張既有票之一）。索引卡 3 與交叉證據同進退。

#### 頁首、導覽條、索引卡

- 頁首：h1「敘事結構」（serif 2xl／700）＋副標「這本書的結構是什麼形狀」（sans sm）＋ meta `書名 · N 章 · M 事件 · 分類來源`（sans 2xs muted）。內容區底 `--bg-secondary`、卡片 `--bg-primary` 浮在上面；內距 24／24／32、區塊間距 16。
- 導覽條字串逐字（`narrative.guide.*`），表面由 `GuidanceRibbon` 管。
- 索引卡（`.nl-index`，固定三欄、gap 12、內距 12）：序號圓點（18px）＋角色標籤（不大寫）＋右側狀態徽章（無外框；英雄旅程「尚未分析」用 warning 底），卡片是錨點連結（`#nl-hero`／`#nl-spine`／`#nl-cross`）。

#### 英雄旅程卡（`HeroJourneySection`，`#nl-hero`）

- **標題列**：「英雄旅程」h2＋框架連結（方法論頁）＋「已映射 N ／ 12 階段」。右側：狀態 badge（`ReviewBadge`）、**重新分析**（`.ss-btn-sm .ss-btn-secondary .ss-btn-llm`，無圖示）、**核可**（secondary）、**標記不適用**（ghost），後兩者無圖示。
- **書級審核三值**（系統生成 · 未審閱／已核可／標記為不適用，沒有「已修改」，不套 15 頁逐條審核工具列）。核可與標記不適用是 `aria-pressed` 切換鈕：**再按一次亮著的鈕＝回到未審閱**（`PATCH …/review` 送 `pending`，計畫 Q5；邏輯在 `nextReviewStatus`）。亮著態＝`--bg-tertiary` 底＋粗體＋accent 字；亮著時 Tooltip 說明撤銷。
- **重新分析的閘門**：與空態按鈕同一道摘要閘門（`summaryGate`）；缺章時 disabled，Tooltip 顯示「缺 N 章摘要，補齊後才會有可映射的內容」。分析中按鈕就地換成「分析中… {progress}%」（`progress` 是後端寫死的 10／20／90，照實顯示，不承諾 ETA）。
- **版面切換**：`.ss-seg`（`.nl-seg` 撐成四等分），每顆兩行＝名稱＋副標（`narrative.layout.*`／`narrative.viewHint.*`，spec §6 不可丟失）。`role="radiogroup"`／`radio`。一次只顯示一種，每種＝圖＋圖例＋階段詳情。預設章節對位帶。選取的階段在切換版面時保留（狀態在 `HeroJourneySection`）。
- **缺席說明**（`.nl-absent-note`）：虛線框，只在有未識別階段時出現。
- **圖＋詳情**（`.nl-hj-body`）：卡不限高；詳情欄 `.nl-detail` `position: sticky; top: 16px`。對位帶在右側（欄寬 340）、三相位分欄在右側（欄寬 380），圓環右側（圓環欄 460），**水平軌跡在下方全寬**（代表事件兩欄）。視窗 ≤ 1100 時單欄、詳情不 sticky。

**章節對位帶（`LayoutBand`）**

- 軸長固定為全書章數，空章留白。階段只畫在**實際章節**上：`chapter_range` 先 `normalizeChapters`（排序＋去重），連續段 `chapterRuns` 各畫一個色塊，段間 2px 細線（`opacity .5`）相連；遇見導師 1、2、5、8 ＝ 三塊，不畫成 1–8。
- 「共用」（3 個以上階段落在同一章，`sharedChapters`）標在章節刻度上（`共用` 字樣＋刻度數字加粗），該欄在每條泳道內底色加深（`--bg-secondary`）。「共用」說明文字沒有任何左邊框強調。
- ↰（章節逆序）＝起點早於前一階段起點（取實際最小章），Tooltip 說明。
- 寬度守衛取 ResizeObserver 量出的實際欄寬：<18px 章號每 5 章一次並收起「共用」字樣、<9px 每 10 章；色塊 <34px 時不印章號。
- 未識別＝整列虛框、不填色（四種版面都保留同一個虛線記號）；低信心＝淺階填色＋實線外框（Ink 下不靠色相）。下方一列核心事件密度共用同一條軸。

**水平軌跡**：12 等寬欄、三條相位線；階段名允許兩行（`text-wrap: balance`、`min-height: 2.8em`）。**三相位分欄**：階段名獨佔一行，章節與識別狀態 badge 移到第二行。**圓環**：只當導覽；圓心只留「相位 · 序號」與選取中的階段名，詳情移到右側。圓環尺寸是固定像素座標（半徑 170、節點 40），不隨視窗縮放。章號用無襯線＋等寬數字（`tabular-nums`）。

**階段三態**（Ink 下四個 status 色都是 `#151515`，所以另有形狀／文字載體）：已識別＝實心點＋✓；低信心＝淺階填色＋外框＋△；未識別＝虛線空心＋○。

#### 階段詳情（`StageDetail`）

相位 · 章節（離散列表，例如 `第 1–2、5、8 章`）＋狀態 badge → 階段名 → **信心**（量表、門檻 0.6 刻度、「高於系統門檻」／「低於門檻 · 待確認」、`全書 min–max`）→ **但書**（`narrative.confNote*`，逐字：信心是模型對「章節摘要證據有多強」的自評，不是這個階段成立的機率）→ 系統詮釋 → 代表性 Kernel 事件（上限 4）→ **理論定義（Campbell / Vogler）**＋敘事功能＋`narrative.methodLink`，**常開、無 `<details>`**。低於 0.6 的階段仍顯示並標待確認（量表填色改淺階、chip 虛線）。

**代表事件為空**（同一位置擇一，`repEmptyReason`）：

| 情況 | 句子 |
|---|---|
| 階段未識別 | `narrative.repEventsNoneAbsent`（摘要中找不到證據） |
| 階段第一個實際章節在全書最後一個核心事件章之後 | `narrative.repEventsNoneRange`（止於第 N 章） |
| 與其他階段共用同一組實際章節 | `narrative.repEventsShared` |
| 其餘（範圍在核心事件內但該段沒有 kernel；或全書沒有核心事件） | `narrative.repEventsNoneGap`（**草稿**，見下） |

有事件且共用範圍時，共用說明照舊顯示在清單上方。**修正的既有 bug**：(1) 範圍在核心事件內但該段無 kernel 時不再說「止於第 N 章」；(2) 以 id 為主（`resolveRepEvents`）取事件，原先用過濾後的索引回取 `representative_event_ids[i]`，解析失敗一筆後所有後續連結錯位。

#### 事件骨幹（`PlotSpine`，`#nl-spine`）

標題列「事件骨幹」＋ `Chatman kernel / satellite`（方法論連結）＋ lead；右側來源 badge（LLM 分類帶 `.ss-llm-glyph` 字符，因為那是 LLM 成本的記號）＋審核 badge。比例列：`核心 N`／`衛星 N` 或 `衛星 0 · 本書未出現此分類`（與 `衛星 0` 是兩回事，衛星為 0 時比例條不佔寬）／`未分類 N`。逐章核心事件欄（`repeat(auto-fill, minmax(106px, 1fr))`，空章顯示「無核心事件」），選取事件顯示意義與深連結。選取態＝`--accent` 底、accent-fg 字。

**未分類區塊**（`UnclassifiedBlock`，數量 0 時不渲染）：三段說明（為什麼／影響什麼／可以怎麼做）＋兩顆按鈕，三條軸互不蘊含：

| 控制項 | 字符 | 確認框 | 危險色 |
|---|---|---|---|
| 依 EEP 重新分類 | 無 | **有**（寫資料） | 無 |
| LLM 精煉未分類（N 件） | `.ss-btn-llm` | 有 | 無 |

- 重新分類按鈕旁提示「零成本 · 寫入資料」，精煉旁提示「會呼叫 LLM，消耗 token」（`tension.state.tokenHintShort`，成本提示文字本身不帶字符）。
- 確認框（`ConfirmDialog`）：重新分類 `costHint`＝`classifyCost`，`sections`＝`classifyAffects`（以 `splitAffects` 拆成「將被刪除／覆寫」標題與一個項目；內文用既有 `classifyConfirmBody`）；精煉 `spendsTokens`、`costHint`＝`tokenHintShort`、`sections`＝`refineAffects`。稿上「將被標記為過期」段目前沒有下游產物清單可列，**空段不渲染**（`visibleSections`）。
- **409**（第四種失敗）：照現況文案（`narrative.errors.classifyRefused`，**標待修、歸 i18n 線**——B-096 後 409 的真實理由是「這次執行不會改變任何東西」，不是「會抹成未分類」），框內唯一出口「前往事件分析頁 →」，**不設 force 鈕**。
- 精煉的 503（未設定 LLM provider）→ 就地 `LlmUnconfiguredNotice`。

#### 交叉證據（`CrossEvidence`，`#nl-cross`）

三列同軸（階段覆蓋／核心事件／張力峰值＋章號尺規），照真實資料畫、不補假的隆起；無資料的章是虛線細線。「階段覆蓋」同樣只算實際章節（遇見導師 1、2、5、8 不覆蓋 3、4）。判讀句即時計算。下方兩欄：

- **時序結構**（Genette）：未分析＝虛線佔位＋說明＋覆蓋率（`coverage_sufficient` 取後端，不複寫門檻）＋「在時間軸頁補齊並執行 →」；已分析＝判定句（線性／部分線性／非線性）＋倒敘／預敘筆數（timeline `temporalDisplacement.type` 計數，字串沿用 `timeline.action.displacementDone`）。
- **張力**：強度最高三章，各標涵蓋它的階段與核心事件數。

三個查詢（TEU、timeline、temporal coverage）仍以 `hasHeroJourney` 為啟用條件。

#### 空態、閘門、分析中、過期

- **空態**（英雄旅程未產生）：羅盤圖＋標題＋說明＋**前置條件列**（章節摘要、事件分析 EEP；在按鈕之前）＋「開始英雄旅程分析」（`.ss-btn-primary .ss-btn-llm`）＋成本提示；**事件骨幹仍渲染在下方**。
- **摘要缺章硬閘門**（`summaryGate`）：disabled＋「缺 N 章摘要，補齊後才會有可映射的內容」。**三條路徑共用同一道閘門**：空態按鈕、卡片標題列的重新分析、過期帶的「重新分析 →」。章節清單查詢不再因「已有分析」而停用（現況繞過閘門）。
- **過期帶**（`.nl-stale`）：疊在英雄旅程卡上方（空態也顯示，但無按鈕）。`{step}` 用 `timelineModel.staleStepKey` 對到 reader 的步驟名（章節摘要／特徵萃取／知識圖譜／符號探索），不插原始 id；「重新分析 →」是 `.ss-btn-ghost .ss-btn-llm`，與卡內同一動作、同一道閘門。5-0 後重跑章節摘要也會使本頁過期。

#### 錯誤四分

| 種類 | 觸發 | 呈現 |
|---|---|---|
| 單頁失敗 | 本頁自己的 `structure`／`kernel-spine` 查詢失敗（非 404，有應用層 JSON body） | `PageFailure`（`page`；頁名＝`narrative.pageTitle`；次要動作「回書籍總覽」＝既有 `analysis:character.error.backToBook`；`techDetail`）。頁首保留，其餘內容被取代 |
| 後端失敗 | 同上但無 body（裸 502/503/504、fetch 被拒） | `PageFailure`（`backend`） |
| 應用層 503 | 開始／重新分析、LLM 精煉的 503（未設定 provider） | `LlmUnconfiguredNotice` 就地，頁面其餘照常 |
| 本頁獨有 | `POST /narrative/classify` 的 409 | 見上，唯一出口前往事件分析頁 |

404（尚未分析）仍是空態。取書失敗由 `BookLayout` 負責。錯誤分支只在頁面元件內切換、查詢不卸載，不會觸發 react-query 重設迴圈。

> 次要查詢（事件列表、TEU、timeline、temporal coverage）失敗不阻擋本頁，只是對應區塊沒有資料（沿用既有行為）。

#### 狀態示例（本書不會出現，由 vitest 覆蓋模型層）

未識別（虛線記號，四種版面都有）、低信心（淺階量表＋待確認 chip）、章節逆序 ↰、不連續章節（`chapterRuns`、`stagesPerChapter`、`reversedStageIds`、`stagesSharingRange`、`repEmptyReason`、`nextReviewStatus`、`summaryGate`、`splitAffects`、`displacementCounts` 皆在 `narrativeModel.test.ts`）。

#### 字串

- 2026-10-04 裁決通過（非草稿）：`narrative.unclassified.classifyCost`／`classifyAffects`／`refineAffects`。
- **這 3 句是草稿・待設計定案**（i18n `narrative.*`）：
  1. `review.withdrawApproved`：「再按一次撤銷核可，回到「系統生成 · 未審閱」」
  2. `review.withdrawRejected`：「再按一次撤銷，回到「系統生成 · 未審閱」」
  3. `repEventsNoneGap`：「這個階段落在第 {{ch}} 章，但這些章節沒有核心事件可展示——沒有可展示的事件不代表階段不成立。」
- 其餘皆為既有字串一字不改；跨命名空間沿用：`tension.state.tokenHintShort`（成本提示）、`timeline.action.displacementDone`（倒敘預敘筆數）、`reader:rerun.steps.*`（過期步驟名）、`character.error.backToBook`。無「原寫死字串移入 i18n」。
- 前置於本批的既有問題（不在 5-3 修）：en `narrative.unclassified.refineConfirmBody` 含字面 `\\u2019`（5-NR-10）。

#### 已清除的孤兒（2026-10-04 刪除，B-129）

`heroJourney.ts` 的 `fillPct`／`discFill`／`discText`／`phaseWash`（舊填色邏輯）；i18n `narrative.ring.knownWorld`／`specialWorld`（圓環區帶已移除，5-NR-3）。舊 `.nl-view*`、`.nl-band-split`、`.nl-trigger-btn` 等 CSS 與 `StageDisc` 元件已隨改寫一併替換（皆為本頁私有）。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#21e（觸發英雄旅程，未設定 provider 回 503）、#21f（polling）、#21k（取 NarrativeStructure，含 `is_stale`／`stale_reason`）、#21j（kernel-spine）、#21l（書級審核，開放 `pending`）、#21a／#21b（分類）、#21c／#21d（LLM 精煉，503）、#21g（時序覆蓋率）。另讀章節清單（摘要閘門）、時間軸與張力頁既有端點（`fetchTimeline`、`fetchTEUs`）。封裝於 `frontend/src/api/narrative.ts`。純邏輯在 `frontend/src/components/narrative/narrativeModel.ts`。

---

### 3.15 全站搜尋頁 `/search`

全站層級（非書籍頁面），由 Sidebar 的 Search 圖示進入。跨書搜尋段落，結果**依書籍分組**。

#### 版面結構

```
[搜尋列：[🔍 輸入框 …… 所有書籍⌄]  [關鍵字|語意]  [🔍 搜尋]]
[分頁列：段落(計數) | 人物 即將推出 | 原型 即將推出]      （未搜尋態也在）
[摘要行：找到 N 個段落，來自 M 本書籍              依相關度排序⌄]
[部分失敗行（僅部分書查詢失敗時）]
[範圍：chip × M（可移除）]
[書籍分組區塊 × M]
```

DS v3 第 2 批（`docs/plans/20261002-ds-v3-batch2-system.md`、決議紀錄 05）。分級 B 檢視。
頁寬 `max-width: 1280px`；間距全用 `--space-1…8`，輸入框用 `--input-*` token，不掛 sparkles（兩種模式都零成本）。

#### 搜尋列（`form`，Enter 送出）

- **輸入框容器**（`--input-bg`／`--input-radius`／`--input-border-width`，padding `--space-3 --space-5`）：accent 放大鏡 + 輸入框（`autoFocus`）+ 清除鈕（`X`，已搜尋後才出現）+ 右側「所有書籍 ⌄」。
  placeholder 逐字沿用。「所有書籍 ⌄」是 `<span>`：純標示、無 hover、無邊框，chevron 為 Lucide `chevron-down`。
- **「關鍵字／語意」`.ss-seg`** 在搜尋列內、緊鄰搜尋鈕（不在分頁列右端）；選中升到 `bg-primary`。
- **搜尋鈕**：`.ss-btn-primary` 帶 search 圖示，兩種模式同為「搜尋」、不附成本提示；`loading` 或查詢為空時 disabled（`srch-submit:disabled` 降到 0.5 透明度，kit 沒有 disabled 樣式）。

#### 分頁與模式

- **分頁列**（未搜尋、載入中、結果態都在）：`段落`（active，搜尋過後帶計數徽章，`bg-secondary` 中性底）；`人物`、`原型`降階（opacity 0.55）＋虛線「即將推出」。
  後兩者是 `<div>`，**無 onClick、無 hover**（不是 `<button>`）。
- **模式切換**：`關鍵字` / `語意`，**預設關鍵字**。切換會以同一查詢字串重新搜尋，並重置範圍 chips。

> **兩種模式的 `score` 意義不同、不可比**：語意為 0–1 相似度、顯示為「N%」；關鍵字為命中次數、顯示為「N次」（i18n `search.score.hitCount`；英文 `N hit(s)`）。
> 不做條狀圖、不換算、不做動畫；單位字貼在數字後面，每列另有欄標題（關鍵字「命中次數」、語意「相關度」）。
> 語意模式跨組連續遞減，不在每組重排。見 API_CONTRACT #23a。

#### 搜尋範圍與 chips

首次送出時**不帶 bookId**（跨全書，`topK: 20`），並以回傳結果出現過的書籍**自動種下** chips。
移除任一 chip 後改為**逐書並行查詢**（每本 `topK: 10`，`Promise.allSettled`），
合併後依 score 排序取前 30 筆；chips 全部移除則回到跨全書模式。
chips 只能移除：沒有全選、重設、加回，也不列未命中的書；chip 為細框、`--pill-radius`。

> 搜尋以遞增的 generation 序號防競態：舊請求回來時若序號已過期，結果直接丟棄。

#### 部分失敗（**草稿・待設計定案**）

逐書查詢路徑下，`mergeBookSearches` 保留 rejected 的書（與 `bookIds` 同序），不再靜默丟棄。
至少一本失敗、但仍有結果時，在摘要下一行顯示警示行（`color-warning-bg` 底＋警示三角圖示＋文字＋次要「重新搜尋」鈕）：

- 「{n} 本書籍查詢失敗，結果不完整」（i18n `partial.message`）
- 「重新搜尋」（i18n `partial.retry`）

**這 2 句是草稿・待設計定案**（README §5；i18n `partial.*`，zh-TW 與 en 皆已補）。不列書名。
「重新搜尋」重送**同一查詢＋目前範圍**。若範圍內**每一本**都失敗，視為搜尋失敗，走下方失敗分類。
首次跨全書查詢是單一請求，不會出現這一行。

#### 書籍分組區塊（`BookGroupSection`）

group header 五件：accent chevron（收合鈕，`aria-expanded`）+ 書名（serif base 700 accent）+ 「{n} 段落」+ 延伸細線 + 「前往該書 ↗」。**收合後計數與連結都還在。**

各列為可點按鈕，**三欄 grid `96px / 1fr / 76px`**，列間 hairline、`--space-6 0`，無 hover 填色、無左緣直條、無卡片底：

1. **定位碼**（96px，mono）：`第N章·§NN`（i18n `search.result.locator`；英文 `Ch. N · §NN`），pos 補零兩位，`position: sticky; top: 0`——長段落滾動時留在視線內。
2. **正文**：serif sm、行高 1.85、`max-width: 72ch`、靠左。**段落全文完整渲染，不截斷**——沒有 line-clamp、展開全文、顯示更多或漸層遮罩。
   查詢詞以 `<mark class="srch-mark">` 高亮（`color-warning-bg` 底＋1.5px 下緣線）。
   關鍵字模式且至少一個命中時，正文左側多一條 3px **命中軌**：每個命中畫一個 4px warning 刻痕，位置＝命中處在段落文字中的字元 offset ÷ 文字長度。
   純計數，**不承諾點擊跳轉**，也沒有「{n} 處命中」標籤（Q2 裁決；分數「N次」就是同一個數）。語意模式沒有軌。
3. **分數**（76px，右對齊）：欄標題 2xs muted（「命中次數」／「相關度」）+ 數值 base 700 accent、tabular。

書名取自 `useBooks()` 的書庫列表；查無對應時退回顯示 `documentId`。純邏輯（分組、分數格式、命中位置、部分失敗彙整）在 `frontend/src/pages/search/searchModel.ts`（有 vitest）。

#### 摘要

「找到 {n} 個段落，來自 {m} 本書籍」（sans sm，數字加粗；i18n `summary`，原本寫死中文）＋「依相關度排序 ⌄」（`<span>`，無行為）。

#### 跳轉行為

| 動作 | 目的地 |
|------|--------|
| 「前往書籍」 | `/books/:bookId` |
| 點擊結果列 | `/books/:bookId`，並以 router state 帶 `{ paragraphId, chapterNumber }` 供閱讀頁定位 |

#### 狀態

| 狀態 | 呈現 |
|------|------|
| 未搜尋 · 書單載入中 | 內容區留白（**不得**顯示「書庫尚無書籍」） |
| 未搜尋 · 有書 | 置中圓形底 accent 搜尋圖示 + 標題 + 副標 |
| 未搜尋 · 無書 | **不畫搜尋列、模式切換與分頁**，只有置中 `EmptyState weight="ready"`：Upload 28 + serif 2xl「書庫尚無書籍」+ 說明 + 「立即上傳」→ `/upload`（稿 05 A 區右格） |
| `GET /books` 失敗 | 整頁替換為 `PageFailure`（`pageName`＝「跨書搜尋」；有 JSON body → 「無法載入跨書搜尋」，無回應或裸 502/503/504 → 「伺服器沒有回應」）＋重試（refetch）。**絕不落成「書庫尚無書籍」** |
| 搜尋中 | `SkeletonLoader`，不用 spinner：3 組骨架，每組 22px 標題條 + 2 條結果列（欄寬 96／彈性／76） |
| 搜尋失敗 · 功能層（`failureKind` = page） | 「搜尋失敗，請稍後再試。」（i18n `error.searchFailed`，原寫死）＋手動「重試」（重送同一查詢＋目前範圍） |
| 搜尋失敗 · 後端層（`failureKind` = backend） | `PageFailure variant="backend"`（「伺服器沒有回應」定案三句）＋重試 |
| 無結果 | `empty.noResults` + `empty.noResultsHint`（最輕，無圖示） |
| 部分失敗 | 結果照常，摘要下加警示行（見上，草稿） |

各失敗都不倒數、不自動重送。

#### 實作位置

| 項目 | 檔案 |
|------|------|
| 頁面 | `frontend/src/pages/SearchPage.tsx` |
| 純邏輯 + 測試 | `frontend/src/pages/search/searchModel.ts`、`searchModel.test.ts` |
| API 封裝 | `frontend/src/api/search.ts` |
| 範圍 CSS | `frontend/src/styles/search.css`（`srch-` 前綴） |
| i18n | `search` namespace |

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#23a（`POST /search/`，注意路徑含尾斜線）

---

## 4. 全局元件

### 4.1 ChatWidget（浮動聊天泡泡）

只掛載在 `BookLayout`（`/books/:id/*`）；書庫、上傳、搜尋、方法論、Token 用量、系統設定沒有聊天。

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

### 4.2 說明載體：三層與各自的位置（B-065）

**這一節是規範，不是清單。** 訂它的起因是：九個功能頁只有兩頁有常駐操作說明，而那
兩套元件彼此不同；想替時間軸補一行說明時，發現**沒有地方放**，只能塞進左側篩選欄，
而那會佔掉列表空間。缺的從來不是那一行字。

說明分三層，**依「讀者在問什麼」區分，不依它長什麼樣**：

| 層 | 回答的問題 | 載體 | 位置 | 可關閉 |
|---|---|---|---|---|
| 1 · 頁層導覽 | 這頁能回答什麼問題？ | `GuidanceRibbon`（kit `.ss-guidance`） | 頁面主區最上方，工具列之前 | ✅ 記住，且可從書名列／設定頁重開 |
| 2 · 區塊說明 | 這個圖表／區塊怎麼讀？ | 區塊自己的 caption / legend | 緊貼該區塊下方或圖例內 | ❌ |
| 3 · 欄位溯源 | 這個值哪來的？跑什麼會變、跑什麼不會？ | 貼著值的行內說明 | 緊貼它解釋的那個值或動作 | ❌ |

#### 為什麼不做成一個帶 `level` prop 的元件

三層的**關閉規則**與**位置**都不同。區塊說明不可關閉——上個月關掉的人這個月仍然需要
它；欄位溯源是貼著值的行內元素，不是橫幅。把三種行為塞進一個名字底下，呼叫端就得
記住「哪個 level 會被記住、哪個不會」，那比三個名字更難用。

#### 第 1 層 · `GuidanceRibbon`

```tsx
<GuidanceRibbon surface="event-detail">
  <strong>{t('event.guide.prefix')}</strong>{' '}
  <Trans i18nKey="event.guide.detail" ns="analysis" components={{ strong: <strong /> }} />
</GuidanceRibbon>
```

- **一頁一個**，除非同一頁有兩個需要分別說明的畫面（事件頁的 overview 與 detail 是
  唯一的例子，關掉其中一個不該讓另一個消失）
- `surface` 標的是**被關閉的那個東西**，不是頁面名。dismiss key 一律
  `storysphere:guidance-dismissed:<surface>`
- **內容用 children 傳，不傳 i18n key**——說明住在各頁原本的 namespace，元件若收 key
  就得連 namespace 一起收
- 樣式是 kit 的 `.ss-guidance`（`ss-kit.css`；`<p>` 內文＋關閉鈕；第 5 批 5-1 起取代舊的 `sg-ribbon*`），
  **不用頁面前綴**。前兩代叫 `ca-tip` / `ea-guide`，名字跟著「第一個剛好需要它的頁面」走，那正是後來沒人重用它們的原因。
  各頁**不再覆寫導覽條 margin**：`.ss-guidance` 自己沒有外距，間距由頁面的 flex gap 給（閱讀頁 landing 另有
  `.rd-landing > .ss-guidance` 的下外距）。圖譜 `float` 為頁面層定位 `.ss-guidance.is-float`（`guidance.css`）。
- **dismiss 狀態集中在 `components/ui/guidanceStore.ts`**（純邏輯 `guidanceModel.ts`，含 vitest）：讀寫
  `storysphere:guidance-dismissed:<surface>`、列舉、重設全部；localStorage 失敗時退回本次工作階段的記憶體集合。
  ribbon 掛載時登記 surface（供書名列重開鈕），設定頁「研究者導覽」讀同一份計數。
- **第 2 層區塊註記、第 3 層欄位出處不受這個機制影響**：不登記、不計數、不被「重設所有導覽」重新顯示，也不可合併成同一元件。

#### 圖示是訊號，不是裝飾

`.ss-guidance` 的資訊字符**不可拿掉**。它由 `::before` 以 mask 畫（`--ss-guidance-glyph`，**markup 不放 `Info` 圖示**），
**不用左側色條**（第 5 批 5-1 起；舊版 3px accent 左緣已移除）。**ink 主題把所有語意色塌成同一個 `#151515`**
（見 `tokens.css`：「Status — 單一單色處理；狀態由 icon 字形承載」），所以辨識靠字符與「研究者導覽：」粗體開頭，不靠色相。
**任何只靠顏色區分狀態的設計，都要在 ink 下再看一次。**

#### 第 3 層 · 欄位溯源要回答的三件事

這一層是三層裡唯一**會讓使用者做錯動作**的。規則是：當一個值或動作被某個前提擋住時，
說明必須講清楚

1. 這個值由**哪個階段**產生
2. 跑**什麼**會改變它
3. 跑**什麼不會**——尤其是使用者眼前那顆按鈕

第三點最常被漏掉，而漏掉的代價是使用者照著提示跑一次沒有用的分析、付了 token。

### 4.3 ConfirmDialog（確認對話框 · DS v3）

`components/ui/ConfirmDialog.tsx`，樣式在 `styles/ss-kit.css` 的 `.ss-dialog*`（components-dialog 規格卡）。

- **外框**：原生 `<dialog>` + `showModal()`；440 寬（max `calc(100vw − 32px)`）、`--card-*` 形狀、`--shadow-lg`、
  內距 `--space-7`、區塊間距 `--space-6`。
- **遮罩**：`--scrim`（Warm `rgba(42,38,32,.40)`／Ink `rgba(0,0,0,.40)`），單一種、無模糊。
- **內容**：標題 sans `--font-size-base` 600；內文 sans `--font-size-xs`、`--fg-secondary`、line-height 1.7。
  無右上角 X——取消鈕與 Esc 即關閉途徑。
- **按鈕列**：靠右，取消（`ss-btn-ghost`）→ 執行（`ss-btn-primary`）。
- **`spendsTokens`**：執行動作會呼叫 LLM 時傳入，執行鈕帶 sparkles 字符（`ss-btn-llm`）。零成本的確認**不傳**。
  內文仍要用文字寫明是否消耗 token——字符負責掃視、文字負責精確，兩者並存。
  現有呼叫端：建構概覽「觸發建構」、事件頁「覆蓋重新生成」與「一鍵生成全部 EEP」、
  敘事頁「LLM 精煉」帶字符；敘事頁「依 EEP 重新分類」不呼叫 LLM，不帶。
- **損失清單版**（`items`）：body 與按鈕列之間插入一份清單（`.ss-dialog-list`，xs、左內距 `--space-7`），其餘不變。
  破壞性動作另傳 `danger`，執行鈕改 `ss-btn-danger`（不帶字符）。使用者：上傳頁「終止處理」（DS v3 第 1 批）。
- **未做**：規格卡按鈕列左側那行「會呼叫 LLM，消耗 token」是卡片註解，不是產品元素（2026-10-01 裁決），不做。
  張力頁原本的獨立 `TensionRerunDialog` 已於第 4 批改用本元件，舊檔已刪（2026-10-04 刪除，B-129）。

### 4.4 浮動軌（右下角位置契約 · DS v3）

聊天泡泡、閱讀頁回到頂部 FAB、toast 堆疊三者共用的位置契約，實作在
`contexts/FloatRailContext.tsx`（常數 `RAIL` ＋「當下佔用哪幾格」的 occupancy）。

- **軌道**：右邊距 24，三格 `bottom 24 / 88 / 144`。三個元件都從 `RAIL` 取值，不再各自寫死。
- **佔位**：toast 堆疊在**從空變成有**的那一刻取最低空格，之後到堆疊清空前都不移動。
  FAB 在閱讀頁路由**永久保留**格 2（它隨捲動閃現）；泡泡被拖離軌就**釋放**格 1。
  「在軌」判準：泡泡與 toast 欄（右側 340 寬）水平相交，且位於格 2 以下。
- **讓位**：聊天視窗開啟且壓到軌時，toast 貼視窗上緣 8px，並 clamp 在視窗內。
- **z 序**：泡泡 60 · 視窗 59 > toast 55 > FAB 30——持久控制項壓在暫態通知上。

| 狀態 | toast `bottom` |
|---|---|
| 非書籍路由 | 24 |
| 書籍路由、泡泡在軌 | 88 |
| 閱讀頁、泡泡在軌（FAB 保留格 2） | 144 |
| 泡泡拖離軌（含閱讀頁） | 24 |
| 聊天視窗壓到軌 | 視窗上緣 − 8 |

### 4.5 TaskCenter（任務中心 · DS v3 0-7）

`components/tasks/{TaskCenter,TaskRow,taskKinds,taskRoute,useTasksPolling}`，樣式在 `styles/ss-kit.css` 的
`.ss-taskc*`（面板）與 `.ss-task-*`（列）。由側欄任務中心鈕開關（`AppLayout` 持有 `tasksOpen`）。

- **性質**：320px 寬的 **flex sibling**，開啟時 `main` 被壓窄 320，**不是覆蓋層**（勿改）。外框 `border-left` 走
  `--card-border-width`、`--shadow-md`。
- **標頭**：內距 `--space-5 --space-6`、下邊線；`loader` 16px（Warm `--accent`／Ink `--fg-primary`）＋「任務中心」serif sm 600
  ＋進行中數量膠囊（mono 2xs 700、min 16×16、radius 9）；右側 X 15px muted。內容區內距 `--space-4 --space-4 --space-5`。
- **三態**（文案逐字、不分「都做完」與「從沒跑過」）：載入（`loader` 22px、1s linear、「載入任務中…」xs muted）／
  空態（`check-check` 26px＋「目前沒有進行中的任務」sm secondary＋兩行 2xs muted 副句）／列表。
- **分組標頭**：「進行中 · N」「已完成 · N」，2xs 600 muted、letter-spacing .06em、**不用 uppercase**；左右內距 `--space-5`、
  標頭到列 `--space-4`、組與組 `--space-6`。「已完成」可收合；右側「清除」（2xs accent）只把 taskId 寫進
  `localStorage['taskCenter.hiddenIds']`——是隱藏不是刪除。`awaiting_review` 算進行中。
- **TaskRow**（動作列）：grid `28px minmax(0,1fr) auto 12px`、欄距 `--space-4`、padding `--space-4 --space-5`、`--radius-md`、
  列距 `--space-1`；可導覽的列 hover `--bg-tertiary`，不可導覽（缺 kind／缺 `result.bookId`）無 hover、無 chevron。
  **28px kind chip 是 TaskRow 自己的元件尺寸**（其餘動作列是 24px）。標題 sm 500、ellipsis 不折行（列高穩定）；
  kind 標籤 2xs 500、**保留原始英文字串**（缺 kind 為 `hourglass`＋「任務」）。
  - Warm：chip／標籤 `--entity-*-bg` 底＋`-dot` 色；Ink：透明底＋1px `--entity-*-border`＋`-fg` 色。色盤由 `kindVars()` 以
    `--tk-{bg,border,fg,dot}` 傳入列。
  - 進行中：4px 進度條（`--bg-tertiary` 軌；Warm kind 色／Ink `--fg-primary` 填）＋mono 2xs 百分比＋stage 2xs muted ellipsis。
    **進度條不做寬度過渡**：輪詢最快 2s，補間會假裝不存在的更新頻率。無 ETA（後端沒有）。
  - 完成：相對時間（見下「完成時間」）；`result.failedSteps`（ingestion）或 `failed_parts`（分析任務）非空顯示「部分完成」warning 色（Ink 加粗）。失敗：`alert` 12＋
    「失敗 · 前往該頁處理」（可導覽）／「失敗」，error 色（Ink 加粗）。
  - 狀態點 8px，優先序：部分完成 warning → done success → error error → awaiting_review warning → kind 色；未終態脈動 1.6s
    （`prefers-reduced-motion` 關閉）。Ink 下跑動點 `--fg-primary`、其餘語意色 token 本身已單色。
  - 收尾槽 12px 永遠佔位，chevron 14px 只切換 opacity。
- **輪詢**：面板開啟 2000ms（`useTasksPolling`）、全域通知 4000ms（`useTaskNotifications`），共用 `qk.tasks.list()`。
- **完成時間**：「{n} 分鐘前完成」以 `TaskStatus.finishedAt`（UTC，2026-10-01 新增）起算；欄位新增前就結束的任務沒有
  這個值，顯示「已完成」而不猜一個時間。`error` 原文、`stepKey`／`subProgress` 等欄位目前不顯示。

### 4.6 PageFailure 與 EmptyState（狀態元件 · DS v3 第 1 批）

`components/ui/PageFailure.tsx`、`components/ui/EmptyState.tsx`，樣式在 `styles/ss-kit.css` 的 `.ss-state*`。
書庫、上傳、章節審閱共用，後續批次直接沿用。

- **失敗分類**：`api/failureKind.ts` 的 `failureKind(err)`——判準是**回應有無應用層 JSON body**（`ApiError.hasBody`），
  不看狀態碼。應用層自帶 JSON 的 4xx／5xx（含未設定 LLM 的 503）→ `page`；fetch 失敗或代理回的裸狀態碼 → `backend`。
- **PageFailure**：只替換內容區，側欄與頁標題常駐；**不承諾自動重試**，只有「重試」。
  - `page`：`alert-triangle` 26 error 色＋「無法載入{頁名}」／「其他分頁不受影響，導航仍可使用。」＋重試（primary）
    ＋可選 `secondaryAction`。`title` 可覆寫標題（章節審閱送出失敗用「提交失敗，請稍後再試。」）。
  - `backend`：`unplug` 26 `--illustration-stroke-soft`＋「伺服器沒有回應」／「後端無法連線，導航仍可使用。」＋重試。
  - `techDetail`：可展開的「技術細節」，展開後顯示 mono 狀態碼（`techDetailOf(err)`）。
  - {頁名}取側欄／麵包屑名，不取頁標題：書庫、上傳、章節審閱。
- **EmptyState** 三種份量：
  - `ready`：整頁舞台，28px 圖示、serif 2xl 700、`--space-6` 間距；`hand` 副標走 `--font-hand`——**全站唯一手寫字落點**
    （書庫為空）。
  - `prerequisite`：半頁，26px 圖示、serif lg 600、一句說明（max 52ch）。
  - `filtered`：`--bg-secondary` 小框、無圖示、serif sm 600 secondary＋小按鈕；篩選列仍在。
- **LlmUnconfiguredNotice**（DS v3 第 3 批共用層）：`components/ui/LlmUnconfiguredNotice.tsx`。後端對「未設定 LLM provider」回的
  應用層 503（`api/failureKind.ts` 的 `isLlmUnconfigured(err)`：503＋有 JSON body）是**功能狀態而非頁面失敗**——就地顯示、不換掉整頁、不給「重試」。
  版型沿用 `.ss-state-filtered` 小框：「尚未設定 LLM provider，無法執行 LLM 分析。」（`common.failure.llmUnconfigured`）＋
  secondary 小鈕「前往 LLM 設定 →」（`common.failure.llmSettings`）連到 `LLM_SETTINGS_PATH`（`/settings#llm`）。
  章節審閱自有 Banner 呈現，不使用本元件；角色／事件／符號／閱讀頁的 LLM 觸發失敗處接它。

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
| 角色分析頁 | 點擊「框架索引 ↗」 | `/methodology?framework=jung`（原 `/frameworks`，2026-05-30 已更名） |
| 敘事結構頁（事件骨幹副標） | 點擊 `Chatman kernel / satellite` | `/methodology?framework=chatman` |
| 敘事結構頁（其他結構線索副標） | 點擊 `Genette · 敘述順序 vs 故事順序` | `/methodology?framework=genette_temporal_order` |
| 張力分析頁（主題 Frye badge） | 點擊 Frye 神話 badge | `/methodology?framework=frye_mythos` |
| 張力分析頁（主題 Booker badge） | 點擊 Booker 情節 badge | `/methodology?framework=booker_plots` |
| 符號分析頁（詮釋區 `LLM 詮釋` tag） | 點擊 tag | `/methodology?framework=sep_methodology` |
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
