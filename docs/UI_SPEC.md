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
   BookOpen 40px 方塊、書名 serif base、「等待章節審閱」、primary「審閱章節 →」連 `/upload/review/:bookId?taskId=…`。
   位在篩選列之上，獨立成帶。
3. **最近開啟**（有 `lastOpenedAt` 的書才出現，前 3 本、新到舊）：`--bg-secondary` 卡、書名 serif sm、
   依 `status` 的捷徑組（analyzed：繼續閱讀／知識圖譜／深度分析；ready：開始閱讀／觸發分析；error：查看錯誤），
   全是導覽、都不帶 LLM 字符。`lastOpenedAt` 由 `BookLayout` 進書時 `POST /books/:id/opened` 寫入。
4. **篩選 chip** 四顆單選：全部／已分析／已就緒／處理中。「處理中」是結構性空集合——`GET /books` 不含 ingest 中的書，
   它只列 in-flight 任務；不 disable、不加 0 徽章。
5. **書卡格線**：處理中任務（`GET /tasks` 共用輪詢，pending／running 的 ingestion）排最前，用 BookCard 處理中態——
   warning badge「… 處理中」、旋轉 `loader`、透明度 0.78、`{stage} · {progress}%`、進度 > 0 才畫進度條、「查看進度 →」。
   最後一格「上傳新書」虛線卡。

#### BookCard

- 封面 `--bg-secondary` 方塊＋accent `FileText`。整張卡是一個連結（標題連結 `::after` 撐滿）。
- **StatusBadge** 三態色彩不變，加字符冗餘編碼：✓ 已分析、i 已就緒、✕ 錯誤（Ink 下 status 色都收成同一黑）。
  `StatusBadge` 為共用元件，書籍總覽頁一併換新外觀。
- **降級告警**：`failedSteps.join('、') + ' 不可用'`＋`AlertTriangle`、warning 底，位在 badge 之下、meta 之上。
- **刪除兩段式**：hover／focus 才出現 28px 垃圾桶；點了只進確認態——error 底列「刪除？」＋danger「確認」＋ghost「取消」。
  不是 modal、沒有 undo toast。
- 卡上不再顯示最後開啟日期（稿上 anatomy 沒有）。

#### 狀態

- **載入**：骨架（標題塊、四顆 chip 塊、12 張卡塊），無微光動畫。
- **空**（三種份量，`EmptyState`）：書庫為空＝`ready`（BookOpen 28、「書庫尚無書籍」、手寫字副標、primary「上傳新書」，無頁標題）；
  「處理中」篩選為空＝`prerequisite`（upload 26、「沒有正在處理的上傳任務」／「這個篩選只列出正在處理的上傳任務。」、
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
批次分析（角色、事件）完成即 push：無失敗 success 5.2s；有失敗 warning + `persist`，toast 只報數字，
**失敗清單留在頁面的常駐面板**（事件頁 `BatchEepPanel`、角色頁左欄頂端），不放 toast（17 決議 T4）。
`useTaskNotifications`（掛在 `AppLayout`）輪詢 `GET /tasks`，於 ingestion 任務
轉 done / partial / awaiting_review / error 時觸發對應 toast 與跳轉；首次輪詢
靜默 seed，避免對載入前已終結的任務發通知。使用者終止（`error: "cancelled"`）不發 toast——那不是「解析失敗」。

#### HITL 章節審閱（`ChapterReviewPage`，路由 `/upload/review/:bookId?taskId=`）

DS v3 第 1 批 1-3b。權威稿：02 章節審閱決議紀錄 frame A–H。全站唯一會卡住 pipeline 的人工閘門。
樣式在 `styles/chapter-review.css`（`cr-` 前綴，全走 token）；純函式在 `pages/upload/`
（`applyBoundaries.ts`、`paragraphSplits.ts`、`spineLayout.ts`，皆有測試）。

- **外框**：基本外框＋28px 麵包屑（kit `.ss-booknav`）「上傳 & 處理進度 / {書名} / 章節審閱」，退出路徑回
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
貝茲欄只在 col2 收合、未選章節、專注、≤768px 四種情況歸 0。收合狀態**目前不持久化**（README §6 寫會，現況沒有，維持現況，見 feedback 3-RD-3）。

窄螢幕（≤768px）：進頁自動折疊欄 1、欄 2，貝茲隱藏；使用者可手動展開。

#### 欄 1 — 書籍資訊（`BookOverview`）

封面佔位（76px、`--bg-secondary` 方塊＋accent `FileText`）→ 書名（serif）＋作者行＋收合 chevron（Tooltip）→ `StatusBadge` → 摘要（serif）→
統計格（2 欄；章節／Chunks／實體／關係，**事件第 5 格整列寬**——實體分佈不含事件，事件數量由這格承擔，見 feedback 3-RD-2）→
`PipelineRerunPanel`（有 failed 步驟才出現）→「全書關鍵字 前 12 · 依權重」→「實體分佈 6 型全列」。

- 作者行**版位一律保留**：沒有作者時也佔一行高度（`.rd-book-author` min-height），作者是下一期功能。
- 實體分佈固定 6 型順序（角色／地點／組織／物品／概念／其他），**事件不列入，數量 0 的類型照列**（`readerModel.entityDistributionRows`）。
- 收合後 46px 細軌：chevron＋accent `FileText`＋直排「書籍資訊」，點細軌任意處展開。

**功能未完成（`PipelineRerunPanel`）**：done 顯綠勾無鈕、pending 整列不渲染、**只有 failed 才有「重新執行」**（不做成永遠可見的四步表，避免誤觸花 token 的鈕）。
鈕掛 `.ss-btn-llm`，面板底部保留文字提示「會呼叫 LLM，消耗 token；覆蓋該步驟的產物。」。觸發失敗若是應用層 503（`isLlmUnconfigured`）→ 該列下方就地顯示
`LlmUnconfiguredNotice`（前往 LLM 設定），其餘照常；其他錯誤顯示在該列。四步名稱與「功能未完成」「重新執行」「執行中」已移進 i18n `reader.rerun.*`（逐字）。

#### 欄 2 — 章節列表（`ChapterCard`）

header：「章節 · N」label＋**「全部展開／全部收合」secondary 小鈕（`.ss-btn-sm`，無圖示）**＋收合 chevron（Tooltip）；搜尋框（`--input-bg`／`--input-radius`／`--input-border-width`）。
搜尋**不過濾**——不符者 `opacity:0.4` 仍可點，下方「N 章符合」，無命中「沒有章節含「…」」（兩條逐字）。

章節卡為**多開手風琴**，兩個分離的點擊區：**左側＝導覽**（欄 3 讀該章，順帶展開）、**右側 chevron＝只展開／收合**，中間以 1px 內分隔線（chevron 的 border-left）標出；
chevron 有自己的 hover 底（`--bg-tertiary`，展開時也是）。選中＝accent 外框＋`--bg-secondary` 底（**不用 inset**）。展開內容：摘要 → 關鍵字 → 「實體 · N」膠囊（可點開實體卡）。
36px 細軌的直排「章節」已移進 i18n `reader.col2Rail`（原為硬編）。

#### 貝茲欄 — `BezierConnectors`

不變：欄 2／欄 3 之間的實體 34px SVG 欄，每個 chunk 一條三次貝茲，rAF 節流、直寫 SVG DOM 不觸發 re-render。

#### 欄 3 — Chunk 內容

**工具列由左到右固定順序**（G 區與 README §1.3；決策表的順序與此不一致，見 feedback 3-RD-1）：

1. **「檢視／專注」兩段切換**（`.ss-seg`，取代舊的 Maximize 鈕）——常駐顯示現在在哪一態
2. **標註密度三段「全部／角色／關」**（`.ss-seg`）
3. **「認知狀態」**（`.ss-btn-ghost`，無圖示；開啟時字樣變「收起」）＋首次提示
4. **Aa**（排版彈窗）

底部 2px 捲動進度細條。標題列：章名（serif lg）＋「第 N / M 章」badge＋「N chunks」。

**chunk 卡**：頂列 `#order`（mono，從 #0 起）靠左、實體膠囊靠右；正文（serif，字級／行距由下方兩態偏好決定）；關鍵字。
標註密度以容器 `data-annotation-mode` 控制（`global.css`）：「角色」＝非角色 mark／chip 取消底線與 hover 色塊並**拿掉 pointer-events**；「關」＝chips 整列隱藏、正文純散文；`#order` 三段都留。

**章末導航只放右側「下一章 {章名} →」**（`.ss-btn-sm.ss-btn-secondary`）；最後一章沒有，也沒有「上一章」。捲動 >500px 浮現回頂部 FAB（Tooltip 包在固定定位的外層 wrapper）。

##### 檢視／專注兩態（G 區）

兩態 **DOM 相同**（chunk 仍是定位單元；實體卡跳段、認知狀態定位、跨書搜尋 §NN 都指向 `#order`），專注態只調弱視覺層次：

| | 檢視 | 專注 |
|---|---|---|
| 預設字級／行距 | **17px／1.6**（fs=1, lh=0） | **19px／1.85**（fs=2, lh=1） |
| 欄 | 四欄各依使用者收合 | 欄 1、欄 2 強制進軌、貝茲欄隱藏（不寫收合偏好，退出原樣還原，專注期間收合鈕 no-op） |
| 正文欄 | 滿版 | `max-width: 760px` 置中 |
| chunk 卡 | 完整卡框與底色 | 卡框與底色收成一條區隔細線；`#order` 掛到正文左側邊界外（左側留 `--space-8` 的溝，窄視窗也不被裁） |

刻度 15／17／19px、1.6／1.85／2.15 不動，只定兩態的預設落點。模式只存在於當次 session，不持久化。專注態是 A 級的變體（間距仍 12／8／8／4），不換級。

##### Aa 排版彈窗與 `reader:prefs`

彈窗 **220px**：（該態標頭＋「此態預設 17 / 1.6」＋「目前 …」＋ **「回到此態預設」鈕——只在使用者的值 ≠ 該態預設時出現**）→ 字級 小／標準／大 → 行距 緊／標準／寬 →
紙張色溫（4 色票，**只在 Warm 渲染**；Ink 整段不渲染且忽略既存偏好，欄 3 背景固定 `--bg-primary`）→ 逐段淡入。

`reader:prefs` 結構（純邏輯在 `components/reader/readerModel.ts`，有 vitest）：

```json
{ "warmth": 1, "fade": false, "view": { "fs": 2 }, "focus": {} }
```

`view`／`focus` 只存**使用者改過、且 ≠ 該態預設**的欄位；沒有的就是該態預設。態切換只換預設，使用者動過就以他的值為準。warmth、fade 不分態。
**舊結構 `{fs, lh, warmth, fade}` 讀入時轉成檢視態的值**（既有使用者的偏好不消失；專注態從自己的預設開始），之後的寫入一律是新結構。

#### 實體卡 — `EntityCard`（popover）

點行內標註或 chip 開啟：**320px、`max-height: 60vh`**、貼點擊來源（空間不足上翻、無遮罩、Esc／點外關閉）。內容區自己捲動，**不截斷、不加漸層遮罩**。
標頭：實體名＋型別 pill＋關閉；「全書出現 N 段」；動作列「角色分析」（`.ss-btn-secondary`，僅 character）＋「在圖譜中查看」（`.ss-btn-ghost`）。
主體：角色先顯示 `profileSummary` 與原型標籤（兩段，404＝「角色深度分析未生成」，不是錯誤），**其下的「出現段落 · N」逐段清單才是主體**——每列「第 N 章 · 章名」＋ mono `#order`＋2 行截斷原文，點擊跳段（同章直接捲動＋flash，跨章先切章、等 chunks 載入後再捲動並閃 2 秒）。
載入中／失敗／空三種狀態逐字（「載入出現段落…」「段落載入失敗」「尚無出現段落」）。

#### 認知狀態側欄 — `EpistemicSidePanel`（288px，預設關）

標頭「認知狀態」＋「收起」→ 角色下拉（`--input-*`）→ **名單來源註記（欄位出處註記，逐字、不可關閉）**→ **「截止 第 N 章」**（有選章節時）→ 三組事件。
三組：已知／未知／誤信，標頭是 label＋count；每列帶字符 **✓／?／✕**，因為 Ink 下四個 status 色都是 `#151515`，不能只靠色相。
事件項可點跳段（#23a 語意搜尋，限定該章，搜尋中顯示 spinner，失敗退回章節級跳轉）；誤信經 `sourceEventId` 反查來源事件，查無則不可點；「誤信：」「實情：」「信心度 N%」逐字。
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

原生 `title` 已全換 Tooltip（收合鈕、章節 chevron、色票、回頂部、補標鈕）。**唯一保留**：`SegmentRenderer` 行內實體 `<mark title>`——Tooltip 的 anchor 是 `inline-flex` 包裝，包進行內文字會破壞斷行；該 title 內容與可見文字相同，未動。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#3（書籍詳情）、#4（章節列表）、#5（Chunk 內容）、#7a（實體深度分析）、#9b（實體出現段落）、#12e（認知狀態）、#8d `POST /books/:id/rerun/:step` 與 #12d `POST /books/:id/classify-visibility` 的 503（LLM provider 未設定）。

---

### 3.4 角色分析頁 `/books/:bookId/characters`

> **DS v3 第 3 批（3-2）改版現況**（以下為準，後文舊描述與其衝突處以此為準）：
> - **密度 B 檢視**：內容區 padding 24／區塊間距 16／卡片內距 12／列間距 8、max-w 1280、下內距 32；左欄 268 固定。樣式 `character-analysis.css` 只用 `--space-1…8`。
> - **左欄**：框架 chip（pill）＋說明句固定最上、搜尋、原型篩選、「對照 Jung vs Schmidt」；清單為動作列（姓名／長條＋數值＋「建立」，第二行 28px；長條 px＝6+94√(m/max)）；
>   群組標頭在搜尋或篩選縮減時顯示「顯示 / 總數」。選中態＝底色＋加粗。partial 狀態點為空心環（Ink 靠形狀）。
> - **象限派系配色**（`components/analysis/characterModel.ts`）：依派系人數排名配 cat-1…5（深淺交替），第 6 名起併入「其他」，無派系只描邊。同數時 #6d 沒有首次出現章節，退回後端回傳順序。
>   色值在頁內 CSS `--ca-cat-*`（不進 tokens）。圖例可點：單獨亮出該派系（其餘泡泡 opacity 0.3），再點取消；「其他」可展開並逐派亮出。0 個派系時只留「此書未抽出派系」。
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

0. **批次失敗面板**（DS v3，2026-10-01）：只在批次分析跑完且有失敗時出現——「批次角色分析完成」＋「關閉」＋
   `BatchFailureList`，手動關閉（`batch.dismiss`）。沿用事件頁面板的 `.ea-batch` 樣式。位置是工程端代為裁決，
   設計稿未畫，已記入 `docs/DS_V3_DESIGN_FEEDBACK.md` 0-A 待同步
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
| 語音風格 (voice) | VoiceProfilingPanel — 進 tab 先以 #16a `cached_only=1` 探測（200→直接顯示 / 404→空狀態+「分析語音風格」鈕；不再使用 localStorage gate）；內容為 4 stat card + ToneDistribution 堆疊條 + SentenceHistogram 直方圖 + 質性 section。「覆蓋重新生成」走 #16a `force=true`（ENG-001，成功才覆蓋）：失敗時舊 profile 照常顯示，上方 503 接 LlmUnconfiguredNotice、其他錯誤顯示「重新生成失敗，已保留原有語音風格。」（**這 1 句是草稿・待設計定案**，i18n `analysis:character.voice.regenerateFailed`） |
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

> 後端設計見 [`docs/guides/temporal-timeline.md`](guides/temporal-timeline.md)
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

- **「倒敘與預敘」的 `name` 標籤**（`ActionRow` 的 `nameHref` prop，2026-08-13 補）
  連往 `/methodology?framework=genette_temporal_order`，比照其他分析頁術語連結的做法。
  `故事時序`（`storyOrder`）不連——它是排序，不是具名理論。此前只有空狀態的
  `TimelineOnboardingHero`（Step 03「Genette 分析」）點過名，資料跑出來後那張卡片就
  消失，工具列本身沒有連結入口，是 B 類（Genette）方法論盤點漏掉的一塊，此次補上。

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
`TensionRerunDialog` / `intensity.ts` / `drawerData.ts` /
`reviewTypes.ts` / `hooks/useTensionTask`。

#### Step 1 卡片的場景行（`.tn-state-scenes`，B-068）

密度長條**刻意畫 TEU 數**（理由見下方 stepper 一節與 B-068），所以場景數只能走文字。

| 情況 | 呈現 |
|---|---|
| 全部章節都判定得出 | `場景 N 個` |
| 部分章節判定不出 | `場景 N 個（僅 X 章可判定，另 Y 章無排版分隔符）` |
| 整本都判定不出 | `場景無法判定——這本書的排版沒有分隔符`，**完全不出現數字** |

**「判定不出」的章節不併進總數。** 場景來自原文排版的分隔符，沒有分隔符的章節整章
不回傳分組——寫成「0 個」或「1 個」都是在斷言判準看不見的事（那章可能有五場戲）。
逐章 tooltip 同樣分開：`場景 2` 或 `場景無法判定`。

**順帶更正了一個文案衝突**：stepper 的 `teuDone` / `teuPartial` 與失敗清單原本把 TEU
數叫「場景」（`8 / 8 場景`）。B-068 的結論正是「TEU 是節拍不是場景」，而卡片開始顯示
真正的場景數之後，同一畫面上「場景」有了兩個意思。文案改為「個 TEU」。

---

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
- 寬度分配 `machine:1.15 / gate:0.95`，gate 不做成細分隔線，避免讀成「附屬品」。
  這個比例**由 TSX 以 CSS 自訂屬性 `--tn-stage-flex` 交給 CSS**，不直接寫 inline
  `flex`——inline 值會壓過下面那個斷點，只能靠 `!important` 扳回來
- **`max-width: 640px` 改為直向堆疊**。實測：641px 時每格 100px、標題還在一行；
  640px 以下標題開始折行，400px 折成三行，整條 strip 讀起來像五欄直排文字，
  「TensionLine 聚合」還會疊到隔壁。堆疊後每格滿寬，標題在 360px 都維持一行。
  **此斷點純 CSS**，與 1080px 那個抽屜斷點不同，不需要 JS 同步
- **四個狀態旗標，dot 的字符即語意**（不靠顏色——Ink 主題下 success / warning / error
  會塌成同一個黑）：

  | 旗標 | dot 字符 | 意思 |
  |---|---|---|
  | `done` | `Check` ✓ | 跑完，全數產出 |
  | `partial` | `Minus` — | **跑完了，但有缺口**（12 / 15），下游照樣解鎖 |
  | `failed` | `AlertTriangle` ▲ | 這一段整個壞掉、什麼都沒產出 |
  | `running` | 無 | 進行中 |

  `partial` 與 `done` **同時為真**，而 dot 上 `partial` 優先——否則畫面會一邊打綠勾
  一邊說「3 則失敗」。破折號沿用三態 checkbox 的 indeterminate 慣例：
  「有一些但不是全部」。`partial` 不解鎖與 `failed` 不同的路徑，它只換 dot 與框色
  （warning），因為那一段**確實**產出了其餘場景，把下游擋住反而會逼使用者重跑一次
  完整 LLM pass（B-110 踩過的坑）。
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
- Frye / Booker badge 設計稿亦未畫，保留在標籤列右側（`--frye-*` / `--booker-*` token）。
  兩個 badge 皆為連往方法論頁的連結（`/methodology?framework=frye_mythos` /
  `/methodology?framework=booker_plots`），與敘事結構頁的做法一致。
- **TensionLine／TEU 抽取層的理論定位**：Frye/Booker 是對已聚合完成的 TensionLine 做
  書級分類，其方法論頁條目已完整引用。再往下一層——TEU 本身「找出場景對立雙極」的
  抽取邏輯——只在概念上受 Aristotle 衝突論／Greimas 符號方陣／Peter Brooks／Mieke Bal
  啟發，不是任一理論的精確實作（尤其 Greimas 符號方陣是四項式結構，系統只抽兩極）。
  **不為此開獨立方法論頁條目**，改在 Frye 與 Booker 兩個條目的 description 末段各加一句
  誠實聲明，避免被誤讀成系統精確實作了這些理論。

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

- ~~**RWD 未做**~~ **已做（2026-08-21，B-070）**：`tension.css` 檔尾新增 Responsive 區塊，
  斷點沿用專案既有的 `1080px`（methodology.css）與 `640px`（timeline.css），未新增 breakpoint
  token。三項待決事項的結論：
  - **格點超過 N 章 → 橫捲。** 不做分頁或區間聚合（那會改到 `TensionChapterGrid` 的資料聚合）。
    `.tn-grid` 本來就有 `overflow-x: auto`，失效的原因是欄寬用 `1fr`（＝`minmax(auto, 1fr)`），
    長書的欄位會一路壓到柱子寬而永遠不觸發溢出。改為 `minmax(var(--tn-grid-cell-w), 1fr)` 補下限，
    並把標籤欄 `position: sticky` 凍結——否則捲動後那排柱子屬於哪條張力線就無從辨認。
    欄寬改由 `--tn-grid-label-w` / `--tn-grid-cell-w` 兩個 custom property 控制，
    `TensionChapterGrid` 的 inline `gridTemplateColumns` 讀取它們，響應式規則因此全留在 CSS。
  - **抽屜在窄視窗 → overlay**（`position: absolute`，`z-index: 40`，在全域聊天啟動鈕的 50 之下）。
    不推擠：抽屜 docked 在 1080px 會讓主欄掉到 650px 以下，格點與表格會同時垮，
    一個面板的版面不該賠上另外兩個。
  - **表格 7 欄 → 收成 5 欄**，章節與證據數落到極點對下方第二行。六個固定欄合計 550px，
    視窗一縮極點欄就沒有可換行的空間。兩者都保留不隱藏：審核決策需要看得到證據量。
- **RWD 缺口是全站性的，不只張力頁**：13 份樣式表裡只有 `timeline.css`（2 個）與
  `methodology.css`（1 個）有 `@media`，`symbols` / `narrative` / `character-analysis` /
  `event-analysis` / `build-overview` / `search` / `settings` 全是 0。本輪只處理張力頁。
- **審核欄按鈕在所有寬度都換行**：`152px` 的 `審核` 欄裝不下「核准／修改標籤／拒絕」，
  三顆按鈕在 1440px 就已經是兩行（實測 44px 高）。**與 RWD 無關，是既有問題**，本輪未動。
- **a11y**（2026-08-21，B-071 三項中的兩項已做）：
  - **抽屜焦點**：抽屜在 1080px 以下 overlay 時，`.tn-shell-main` 掛 `inert`，開啟時焦點移入
    抽屜、關閉時歸還原處。**刻意不是傳統 focus trap**——Tab 走完抽屜會到左側導覽列，導覽列
    沒有被抽屜蓋住，鎖住它反而是敵意行為；`inert` 只拿掉真正被遮蔽的內容。1080px 以上抽屜
    docked，不掛 `inert`、不搶焦點。
  - **非視覺替代**：格子的 `aria-label` 逐個列出強度（`第 3 章 2 個 TEU，強度 高、中`），
    裝飾用的 `<i>` 柱子全標 `aria-hidden`。分隔符用口語的「、」而非設計數字排版的間隔號「·」，
    因為這是純語音字串。`TensionTEUInspector` 的迷你柱只標 `aria-hidden` 不加朗讀內容：
    展開後每個 TEU 的強度本來就是可見文字，再念一次是重複。
  - **前一版的記載有誤**：舊文寫「螢幕閱讀器取不到 `tension_description`」，但它在
    `TensionTEUInspector.tsx:145` 與 `TensionReviewDrawer.tsx:148` 都是可見的 `<p>` 純文字。
    真正缺的一直是強度。
  - **未做**：Ink 主題下 success / warning / error 塌成同一個黑，已拆為 B-086（全站議題）。
  - `1080px` 這個斷點同時寫在 `tension.css` 與 `TensionPage.tsx`（media query 無法從 CSS 讀回
    JS），兩邊改動必須同步。
- ~~**P0-5 失敗清單未做**~~ **已做（2026-09-12，B-072）**：strip 下方的 `.tn-teu-failures`
  是可展開的 `<details>`，每列為「第 N 章 · 事件標題 · 例外字串」，依章排序。預設收合——
  多數事件成功了，這是註腳不是標題。**兩個限制寫在這裡而不是留給人踩**：
  （a）清單只存在於剛結束那次執行的 task result，**重新整理即消失**（與 B-110 同一個形狀，
  後端沒有按書留存失敗紀錄）；面板內的 hint 文案已據實說明，不假裝它會留著。
  （b）`reason` 是原始例外字串（`RuntimeError: …`），不是給終端使用者的翻譯文案——
  失敗原因來自後端例外，硬要翻譯只會讓它與 log 對不起來。
  **`summary` 的兩條規則不是裝飾，是補回被 CSS 拿掉的東西**：`display: flex` 會讓
  summary 失去預設的 `list-item` marker，所以 `::after` 補一個 chevron（收合 ▸ /
  展開 ▾）——否則畫面上沒有任何東西表示這一列可以展開；`:focus-visible` 則是因為
  原生 `summary` 沒有 `tabindex` 屬性，接不到 `global.css` 的全站焦點環（見 B-114），
  在那條修好之前這裡用同一組 token 自己畫。
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
     - 上：`LLM 詮釋` tag（連往 `/methodology?framework=sep_methodology`，與其他分析頁的
       術語連結做法一致）+ assembled_by + 日期 + ReviewBadge（右）
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
- nav：頁首「設定」serif＋分隔線；三組（偏好設定／系統／其他）、七項 Lucide 圖示（`palette`／`languages`／`cpu`／`server`／
  `keyboard`／`flask-conical`／`info`）；底部版本號上方分隔線。列 padding `--space-4`、gap `--space-4`、`--radius-sm`、xs；
  **選中＝`--bg-tertiary` 底＋accent 字 600，無左緣條**。標籤＋徽章放不下時（英文介面），徽章換到第二行靠右，標籤不截——暫時修法，待設計定案（FEEDBACK 2-ST-13）。
- **研究者導覽（04 A2）本批不畫**：nav 維持三組七項，不放空項（FEEDBACK 2-ST-3，待第 19 稿 nav 項與面板一起做）。
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

張力（3.8）、符號（3.9）之外的第三條平行分析線。i18n namespace 為 `analysis.json` 的 `narrative.*`。頁面為單欄垂直捲動，分兩個 section：上方英雄旅程主視圖（佔大部分），下方情節骨幹摘要次區塊。

#### 版面結構

```
[頁首 — 頁名 + 一句定位 + 書級 meta]
[索引卡 — ① 詮釋・英雄旅程 / ② 統計・事件骨幹 / ③ 旁證・其他結構線索]
[過期橫條 — 僅 is_stale=true 時出現]
[英雄旅程區塊 — 主視圖：標題列 + HITL + 視圖切換器 + 缺席說明 + 選定佈局]
[事件骨幹 — 比例條 + 逐章事件欄 + 選定事件 + 未分類事件區塊 + 跳轉]
[其他結構線索 — 三層章節軸 + 判讀 + 時序／張力兩欄]
```

③ 只在已有英雄旅程結果時渲染（索引卡與區塊同進退）。沒有敘事弧時沒有東西可以互相
對照，而目錄項先於它指向的內容存在就是一條死連結。

#### 頁首與索引卡（`.nl-head` / `.nl-index`）

- **頁首**：h1「敘事結構」+ 同列副標「這本書的結構是什麼形狀」（回答「這頁在答什麼」），
  下方 mono meta 列：`書名 · N 章 · M 事件 · 分類來源`。
- **索引卡**：本頁的目錄。每張帶**序號圓點 + 角色標籤（詮釋／統計）+ 右側即時狀態徽章**，
  標題下一行說明這塊在回答什麼。序號建立閱讀順序；卡片本身是錨點連結
  （`#nl-hero` / `#nl-spine`），使摺線下的內容在首屏就被宣告存在。
  空狀態同樣渲染，① 的狀態徽章顯示「尚未分析」。

> 序號索引卡目前僅本頁使用。其他分析頁若要沿用，應先抽為通用元件再登錄於第 4 節。

#### 過期橫條（`.nl-stale`，`role="status"`）

僅在 #21k 回傳 `is_stale=true` 時出現，置於索引卡之下（空狀態也顯示，因為重跑
後結構可能已被判定過期但尚未重新分析）。用 `--color-warning-bg` / `--color-warning`
（既有 token，未新增），內含 AlertTriangle + 標題 + 以 `stale_reason` 帶入步驟名的說明。

右側帶「重新分析 →」連結（僅在已有分析結果時出現）。原規格訂為「只做提示，不放操作
按鈕」，但分析觸發鈕只存在於空狀態，有結果時橫條等於報警而不給滅火器；改為橫條與
卡片標題列各有一個入口，兩者呼叫同一個 `triggerHeroJourney(force=true)`。

#### 英雄旅程主視圖（`HeroJourneySection`，錨點 `#nl-hero`）

- **標題列**：「英雄旅程」h2（serif）+ 副標（Campbell · Vogler 12 階段），副標為連往
  `/methodology?framework=hero_journey` 的連結——術語解釋留在方法論頁，本頁不重述。
  下方為「已映射 N／12 階段」。右側為**書級** HITL：重新分析 / 核可 / 標記不適用 按鈕
  + ReviewBadge（走 #21l）。
- **視圖切換器**（`.nl-views`）：四顆等寬按鈕，各含**視圖名 + 一行「這個視圖適合看什麼」**。
  不用 tooltip：第一次使用的人不會去 hover 一個他還不知道有差別的東西。順序與預設值
  由 `LAYOUT_IDS` 決定，**預設為章節對位帶**（真實資料下唯一能同時看出對位、重疊與逆序的視圖）。
  - **A 章節對位帶（`LayoutBand`）**：甘特式條帶（x 軸＝章節），一眼可見階段重疊與缺席。
    三個以上階段落在同一章時，欄位標「共用」且軌道內上底色；起點早於前一階段者在編號前
    掛 ↰（章節逆序）。下方一列核心事件密度共用同一條軸，讓「階段講到第 10 章、kernel
    事件止於第 9 章」這種落差自明。軸長固定為全書章數，空章留白不截斷。
    **寬度守衛一律取自 ResizeObserver 量出的實際寬度，不用章數門檻**（書庫樣本只有 7 章與
    10 章兩本，以章數寫死等於猜測）：每欄 <18px 時章號每 5 章標一次並收起「共用」標籤、
    <9px 時每 10 章一次；帶寬 <34px 時帶內章號不渲染（範圍仍可由 title 與詳情面板取得）。
  - **B 水平軌跡（`LayoutTrack`）**：departure→initiation→return 三相位橫向流，12 階段 disc + 底部詳情抽屜。
  - **C 三相位分欄（`LayoutColumns`）**：三欄堆疊階段列 + 右側固定詳情面板（360px）。
  - **D 圓環循環（`LayoutRing`）**：Campbell 環形 monomyth，中心顯示選定階段詳情，虛線分隔平凡／特殊世界。
- **缺席說明（`.nl-absent-note`）**：切換器與視圖之間的虛線框，內含「未識別 · N」與
  「缺席的階段是有意義的敘事選擇，而非未完成」。此句原為標題列的灰字註腳，與裝飾同權重；
  移到此處後緊鄰它所描述的視覺符號，且帶上實際缺席數。無缺席時整塊不渲染。
- **三態視覺語言**（一眼可區分，不用進度條語意）：
  - `filled`（conf ≥ 0.6）：accent 填色，深淺隨 confidence 加深。
  - `low`（0 < conf < 0.6）：警示三角（`--color-warning`）+ 虛線邊框。
  - `absent`（chapter_range 空）：虛線空殼顯示「—」，不留空白。
    後端會略過無證據的階段，前端以 `padStages()` 依 `STAGE_ORDER` 補回，故 12 列恆存。
- **階段詳情（`StageDetail`）**：相位 + 章節 + 階段名 + 狀態徽章 + 信心區塊 + 系統詮釋 notes
  + 代表性 Kernel 事件 + 摺疊的理論描述／敘事功能（理論文案取自 `frameworksData.ts`
  hero_journey，localized，展開後帶方法論頁連結）。
  在**章節對位帶視圖中為右側 sticky 側欄**（`.nl-band-aside`，最大 340px，`top: 16px`）：
  12 條軌道加密度列之後，面板放在下方等於點了軌道就把答案捲出畫面。其餘三個視圖維持
  原有的抽屜／面板位置。
- **信心區塊（`ConfidenceMeter`）**：0.6 刻度線（`stageState` 的 filled/low 分界）+
  `0 / 系統門檻 0.6 / 1.0` 標尺 + 高於／低於門檻徽章 + **全書其他階段的分數範圍**。
  裸數值沒有基準，同書比較範圍才讓「0.90」有意義。
  下方說明文案分兩支：低於門檻的階段數為 0 時改寫（否則恆顯示「本書有 0 個」）。
- **代表事件**：卡片形式（章號 + 標題 + significance），整張可點，深連結至
  `/books/:bookId/events?event=<id>`。另有三種即時計算的說明，皆不得寫死：
  - 多個階段共用同一段 `chapter_range` 時，說明代表事件為何相同（階段是章節級、事件在
    章節內，本就不是一對一）。
  - 階段有章節但事件為空 → 指出全書 kernel 事件止於第幾章（取自實際骨幹最大章號）。
  - 階段本身缺席 → 說明缺席是結構特徵而非分析失敗。
- **Legend**：filled / low / absent 三態圖例（短標籤；缺席的解讀在上述缺席說明框）。

#### 空狀態（`.nl-empty`）

不只說「點擊下方按鈕開始分析」，而是列出**前置條件檢查表**（`.nl-prereq`）：

- **章節摘要**（`done / total 章`）：`map_hero_journey` 的實際前置。缺少時分析會回報成功
  但寫入 0 個階段，因此缺摘要時觸發鈕 disabled 並在旁說明原因，該列連往建構概覽頁。
- **事件分析（EEP）**（`done / total 件`）：非必要，但影響代表事件。連往事件分析頁。

已滿足的列不顯示前往連結。摘要完成度取自 `GET /books/{id}/chapters` 的 `summary` 欄位，
查詢僅在沒有分析結果時啟用。

#### 事件骨幹（`PlotSpine`，錨點 `#nl-spine`）

- 標題列「事件骨幹」+ 副標 `Chatman kernel / satellite` + 一行說明；右側分類來源 chip
  （啟發式／LLM／人工驗證）+ ReviewBadge。副標為連往 `/methodology?framework=chatman` 的
  連結（與英雄旅程區塊的做法一致，術語解釋留在方法論頁，本頁不重述）。
- **比例條**：kernel 數為主體，右側為條與圖例。**satellite 為 0 時不佔寬度**，改在圖例
  註明「衛星 0 · 本書未出現此分類」——兩本測試書的 satellite 皆為 0，保留零寬區段只會
  在條的右側留下無法解釋的空隙。
- **逐章事件欄**（`.nl-chgrid`）：每章一欄，欄頭為章號 + 該章 kernel 事件數（無事件時為
  `—` 且底線改用 `--border`），欄內逐筆列出**事件標題**，無事件的章顯示虛線「無核心事件」。
  欄以 `repeat(auto-fill, minmax(106px, 1fr))` 換行而非壓縮：長篇只是多幾列，標題不會被壓到
  不可讀。章數取 `book.chapterCount` 與事件最大章號的較大者，空章不省略。
  - 取代原本的「上下交錯標籤時間線 + 同章多事件 pill 清單」。原設計預設每章至多一個
    kernel 事件，真實資料每章 2–7 件，導致整條軌道只顯示「N 件事件」而一個標題都看不到。
- **選定事件方塊**（`.nl-evbox`）：章號 · 事件類型 + 標題 + significance，右上角
  「在事件分析頁開啟 →」深連結至 `/books/:bookId/events?event=<id>`。未選時顯示提示。
- **未分類事件區塊**（`UnclassifiedBlock`，未分類數為 0 時整塊不渲染）：數量 + 三欄
  「為什麼／影響什麼／可以怎麼做」+ 兩個動作 + 前往事件分析頁。
  - **依 EEP 重新分類**（#21a）：讀既有 EEP 快取重算，不呼叫 LLM。
  - **LLM 精煉未分類（N 件）**（#21c）：逐筆判斷，**會消耗 token**，筆數寫在按鈕上。
    一律傳明確的 `event_ids`（未分類事件），不用後端「全部 satellite」的預設——書庫
    沒有任何一本有 satellite 事件，該預設是 no-op。
  - 兩者都先過 `ConfirmDialog`，對話框說明會發生什麼、是否耗 token。
  - #21a 回 409 時在區塊內以 warning 色顯示。**訊息由前端本地化重組**（頁面已持有
    總事件數與已分類數），不直接顯示後端的英文 detail——狀態碼是契約，字串不是。
  > 此處**刻意偏離設計稿**：canvas 主張本頁不提供分類動作、只做唯讀狀態告知
  > （含「狀態告知 · 此頁不進行分類」徽章），理由是分類判斷需要原文段落。經確認後
  > 仍加上動作：依 EEP 重算完全不需要原文，而精煉的後果就顯示在這一頁上。徽章與
  > 原三欄文案因此不再適用，已改寫。
- 底部「前往事件分析頁」跳轉（Kernel/Satellite 細節在事件分析頁）。

#### 其他結構線索（`CrossEvidence`，錨點 `#nl-cross`）

把本頁兩塊的結果與其他分析頁的結果疊在**同一條章節軸**上，回答「哪幾章多層一起隆起、
哪幾章只有其中一層」。全部複用既有端點，無新增 API。

- **三層軸**：階段覆蓋（每章被幾個階段涵蓋）／核心事件（每章幾件）／張力峰值
  （每章最高 TEU 強度），下接章號尺規。三層共用同一組欄，因此落差可直接對讀。
- **判讀句**：**必須即時計算**——找出各層同時到頂的章，以及有張力／階段卻沒有核心
  事件的章，並指出事件分類實際止於第幾章。不得沿用設計稿的示範句（設計稿寫第 9 章，
  實測本書峰值在第 7 章）。
- **時序結構**（Genette）：讀 `fetchTimeline` 的 `temporalAnalyzed` / `temporalStructure`
  與 `fetchTemporalCoverage`。未分析時顯示虛線佔位與「跑完會顯示什麼」，並列出實際
  覆蓋率；**是否足夠一律取後端的 `coverage_sufficient`，不在前端複寫門檻數字**
  （設計稿寫「需 ≥60%」，那是後端常數，抄過來會漂移）。深連結至時間軸頁。副標
  `Genette · 敘述順序 vs 故事順序` 為連往 `/methodology?framework=genette_temporal_order`
  的連結，與英雄旅程、事件骨幹兩處的做法一致。
- **張力**：讀 `fetchTEUs`，列出強度最高的三章，各章標出涵蓋它的階段與核心事件數。
  深連結至張力分析頁。

三個查詢皆以「已有英雄旅程結果」為啟用條件，沒有敘事弧的書一個請求都不會發。

#### API 參考

見 [`docs/API_CONTRACT.md`](API_CONTRACT.md)：#21e（觸發英雄旅程）、#21f（polling）、#21k（取 NarrativeStructure）、#21j（kernel-spine）、#21l（HITL 書級審核）、#21a／#21b（分類）、#21c／#21d（LLM 精煉）、#21g（時序覆蓋率）。另讀時間軸與張力頁既有端點（`fetchTimeline`、`fetchTEUs`）。封裝於 `frontend/src/api/narrative.ts`。

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
| 未搜尋 · 無書 | `EmptyState`：Upload icon + 「書庫尚無書籍」+ 說明 + 「立即上傳」→ `/upload` |
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
| 1 · 頁層導覽 | 這頁能回答什麼問題？ | `GuidanceRibbon` | 頁面主區最上方，工具列之前 | ✅ 記住 |
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
- class 前綴 `sg-`，**不用頁面前綴**。前兩代叫 `ca-tip` / `ea-guide`，名字跟著「第一個
  剛好需要它的頁面」走，那正是後來沒人重用它們的原因

#### 圖示是訊號，不是裝飾

`GuidanceRibbon` 的 `Info` 圖示**不可拿掉**。左側 accent 邊框在 warm 主題下看起來已經
夠明顯，但 **ink 主題把所有語意色塌成同一個 `#111111`**（見 `tokens.css`：
「Status — 單一單色處理；狀態由 icon 字形承載」），3px 的近黑邊框貼著 `#1a1a1a` 的
外框只會讀成「邊框比較粗」。**任何只靠顏色區分狀態的設計，都要在 ink 下再看一次。**

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
  張力頁的 `TensionRerunDialog` 是獨立元件，隨該頁批次再評估是否併入。

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
  - 完成：相對時間（見下「完成時間」）；`failed_parts` 非空顯示「部分完成」warning 色（Ink 加粗）。失敗：`alert` 12＋
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
