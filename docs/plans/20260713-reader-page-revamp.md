# 閱讀頁翻新計畫

> 2026-07-13 確立。基於實機 Playwright 探索（24 張截圖）+ 程式碼審閱的結論，經用戶確認範圍後成文。
> **2026-07-13 設計定稿修訂**：Claude Design canvas 已交付，實作範圍以文末「設計定稿修訂」一節為準，原 Batch 1–3 表格保留作歷史脈絡。

## 背景與定位

閱讀頁（`/books/:bookId`）的三欄結構與 chunk 卡片是**刻意的檢視器（inspector）設計**，不是傳統沉浸式閱讀器——不能要求用戶上傳時標註文本細節，自動 chunking 產生的段落卡片（含 `※※※` 分隔 chunk）是可接受的呈現。因此本計畫**不包含**「chunk 卡片改連續文流」類的改動。

翻新聚焦兩件事：

1. **消除「看起來可互動但點不動」的落差**——行內 entity 標註、chunk entity chips、Epistemic 事件列表都是視覺上像入口的死路
2. **補上檢視動線**——章節間導航、進度指示、過濾一致性

**後端零改動**：所有互動所需的 API 均已存在（見各批次的 API 參考）。

## 分工模式

- **UI 設計**：新元件（實體卡、導航元素、進度指示）交 **Claude Design** 出設計稿；工程實作以實際的 `.dc.html` canvas 交接為準（不是 prose spec）
- **工程**:接 canvas 後接資料、路由、deep-link 與 CSS 邏輯；每批 ≤3 檔案為原則，超出先拆

---

## Batch 1 — 檢視動線補強（P0，純前端邏輯，可先行）

| # | 項目 | 說明 |
|---|------|------|
| 1-1 | 章節導航 | 欄 3 章末加「← 上一章 / 下一章 →」；chunk 區加浮動回頂部鈕 |
| 1-2 | 進度指示 | sticky header 顯示「第 N / M 章」+ 章內捲動進度細條 |
| 1-3 | chips 跟隨過濾 | chunk 頂部 entity chips 納入 `data-annotation-mode` 控制，與行內底線行為一致 |
| 1-4 | 搜尋結果數 | 欄 2 搜尋時顯示「N 章符合」 |
| 1-5 | 章節卡 toggle | 再點已展開的章節卡可收合（目前為 no-op） |

**異動檔案**：
- `frontend/src/pages/ReaderPage.tsx`（修改：導航、進度、搜尋結果數）
- `frontend/src/components/reader/ChunkCard.tsx`（修改：chips 過濾）
- `frontend/src/styles/global.css`（修改：`data-annotation-mode` 對 `.pill` 的規則）
- `frontend/src/i18n/locales/zh-TW/reader.json` + `en/reader.json`（修改：新增文案 key）

**驗收**：章末可直接切章不需捲回欄 2；「角色」模式下 chips 只剩角色類；搜尋「九玄大法」顯示「2 章符合」。

## Batch 2 — 實體與事件互動（P1，需 Claude Design 稿）

| # | 項目 | 說明 | API（均為現成） |
|---|------|------|------|
| 2-1 | 實體卡 popover | 點行內 entity 標註或 chunk chip → 彈出實體卡：名稱/類型/出現次數、出現段落列表（點擊跳段落）、「角色分析」「圖譜聚焦」連結 | #9b `GET /books/:bookId/entities/:entityId/chunks`、#7a `GET /books/:bookId/entities/:entityId/analysis` |
| 2-2 | Epistemic 事件可點 | 已知/未知事件項點擊 → 跳對應章節段落（複用 SymbolsPage 的 `location.state.paragraphId` deep-link）或開事件詳情 | #11 `GET /books/:bookId/events/:eventId` |

**異動檔案**（依 canvas 交接後細化）：
- `frontend/src/components/reader/SegmentRenderer.tsx`（修改：onClick）
- `frontend/src/components/reader/EntityPopover.tsx`（**新增**，樣式依 canvas）
- `frontend/src/components/reader/ChunkCard.tsx`、`EpistemicSidePanel.tsx`（修改）
- 對應 i18n 檔

**驗收**：點「宇文化及」出現實體卡並可跳到任一出現段落（有 `chunk-jump-flash` 高亮）；Epistemic 面板點「Ch.1」事件跳到第一章對應位置。

## Batch 3 — 檢視舒適度（P2，需 Claude Design 稿）

| # | 項目 | 說明 |
|---|------|------|
| 3-1 | 專注模式一鍵切換 | 一鍵同時收合欄 1+欄 2（現需按兩次），正文加 `max-width` 上限置中；**保留 chunk 卡片結構** |
| 3-2 | 字級/行距調整 | 欄 3 header 加排版控制（2–3 檔字級），存 localStorage |
| 3-3 | 記住閱讀位置 | localStorage 記錄書 × 章節，重進自動展開回位；書庫「繼續閱讀」CTA 導向此 |

**異動檔案**：`ReaderPage.tsx`、`tokens.css`（若新增字級 token 需同步 `docs/DESIGN_TOKENS.md`）、i18n 檔。

## 範圍外（不在本計畫）

- chunk 卡片改連續文流／隱藏卡片框線——檢視器定位，明確不做
- F-08 伏筆提示、F-12 閱讀標注——需後端，留在 `docs/BACKLOG.md` 原軌
- 知識圖譜 → 閱讀頁定位（UI_SPEC 未來項 #6）——reader 接收端已就緒，發起端屬圖譜頁範疇
- ink 主題下 entity 標註色不隨主題的觀感問題——設計 contract 題，待與設計側確認後另開

## 文件同步與回滾

- API 無異動，`docs/API_CONTRACT.md` 不動
- 每批完成後更新 `docs/UI_SPEC.md` §3.3（欄 3 導航/進度/實體卡描述）
- 每批獨立 commit，回滾 = revert 該批 commit；localStorage key 新增不影響舊資料

---

## 設計定稿修訂（2026-07-13，取代上方 Batch 1–3）

**設計來源**：Claude Design 專案「Reader page 新版本設計」（`claude.ai/design/p/94219cf8-4f81-4e0a-b973-53f63f4b226b`），實作依據 = `design_handoff_reader_revamp/Reader Page.dc.html` canvas + 同目錄 `README.md`（版面/互動/state/API 對接均已載明）。canvas 的 `support.js` mini-framework 不移植，以既有 React + TanStack Query 模式重建，資料直接 render `Chunk.segments`（不沿用原型的 `[name|type|id]` 字串格式）。

**產品定案（2026-07-13 用戶確認）**：
1. 實體卡形式 = **popover**（320px 貼點擊來源、空間不足上翻、無遮罩、Esc/點外部關閉）；canvas 的 panel/float 形式與「實體卡形式」切換鈕不實作
2. booknav 的 Warm/Ink 主題切換**不採用**——主題切換維持只在設定頁，booknav 不動
3. 認知狀態側欄**預設關**（原型預設開僅為展示）

**Token 現況**：新 design system 已同步於 `frontend/src/styles/tokens.css`（形狀 token、warm/ink 色值皆吻合 canvas 的 `colors_and_type.css`），無 token 遷移批次。唯「紙張色溫 4 檔」為新值：收斂成 token 時需同步 `docs/DESIGN_TOKENS.md`。

**相對原計畫的範圍擴充**（canvas 定稿新增）：
- 欄 1 重構：收合改 46px 細軌（直排標籤）、關鍵數字 5 格、全書關鍵字、實體分佈 pill 可點開實體卡
- 欄 2 重構：手風琴改**多開**且「導航（點卡頭）/ 展開（點 chevron）」分離、全部展開/收合鈕、搜尋改「不符者 opacity 0.4」+ 「N 章符合」、卡內實體 pill 可點
- BezierConnectors 全面改寫：動態 per-chunk 扇出、捲動/切章 rAF 重算、專注模式隱藏
- 排版控制超出原計畫：字級 3 檔 + 行距 3 檔 + 紙張色溫 4 檔（Warm 限定）+ 逐段淡入，持久化於 localStorage `reader:prefs`
- 標註密度「角色」模式行為改為**非角色標註隱藏且不可點**（原為僅去底線）；「關」模式全部不可點；chips 同步受控
- 跳段機制 `doJump`（同章捲動 / 跨章先切章再定位）+ `rd-flash` 高亮，實體卡與認知面板共用
- RWD ≤768px 降級原型未做，實作需自行補（複用收合機制）；i18n 原型僅 zh-TW，en 需補

**批次重組**（依「一次 ≤3 檔」紀律，順序即建議實作順序，每批獨立 commit + lint + tests）：

| 批 | 內容 | 主要檔案 |
|---|------|---------|
| R1 | 欄 3 header：進度條、第 N/M 章 badge、章末上/下一章、回頂部 | `ReaderPage.tsx`、`reader.json`（i18n ×2） |
| R2 | 實體卡 popover + 跳段 + flash（含 loading/404 未生成態） | `EntityCard.tsx`（新增）、`SegmentRenderer.tsx`、`useEntityChunks.ts`（新增，API client 沿用 graph 頁既有） |
| R3 | ChunkCard chips 可點 + 標註密度新行為（隱藏/不可點） | `ChunkCard.tsx`、`global.css` |
| R4 | 認知面板重構：事件可點跳段、hover 態、由欄 3 工具列開關 | `EpistemicSidePanel.tsx`、`ReaderPage.tsx` |
| R5 | 欄 1 重構（46px 細軌 + 新內容結構） | `BookOverview.tsx`、`ReaderPage.tsx` |
| R6 | 欄 2 重構（多開手風琴、導航/展開分離、全部展開/收合、搜尋） | `ChapterCard.tsx`、`ReaderPage.tsx` |
| R7 | BezierConnectors 動態化 | `BezierConnectors.tsx` |
| R8 | 專注模式 + Aa 排版面板 + `reader:prefs` 持久化 | `TypographyPanel.tsx`（新增）、`ReaderPage.tsx`、`tokens.css`（紙張色溫 token 化，同步 DESIGN_TOKENS.md） |
| R9 | RWD 降級 + en i18n + UI_SPEC §3.3 更新收尾 | `ReaderPage.tsx`、`reader.json`（en）、`docs/UI_SPEC.md` |

實作模式依既有慣例：各批派 sonnet subagent 依 canvas 實作，主線 review diff 後 commit。
