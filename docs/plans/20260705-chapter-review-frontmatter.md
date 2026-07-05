# 章節審閱：前置內容偵測與呈現改善

日期：2026-07-05　分支：feat/book-upload-revamp

## 問題（來自實際 EPUB 上傳截圖）

1. **偵測偏差**：EPUB 常把「書封簡介 + 譯者前言 + 目錄」塞進同一個 spine item，
   成為單一章節。`_classify_chapter_role` 只看章節的**標題行**（首個 block），
   而目錄／前言的標記（`目錄`、`013 正文`、`005 譯者前言`）埋在章節內文中間，
   因此被誤判為 `body`。
2. **編號忽略角色**：審閱左欄用 `i+1` 平鋪編號，把章節標成目錄/序也不影響列表，
   正文因此顯示成「第3章／第4章」，不合理。
3. **無分色**：只有非正文*段落*會淡化（opacity 0.6），整章被標為 toc/preface 時
   在左欄與閱讀區都沒有視覺區分。

## 決策（已與使用者確認）

- 偵測策略：**內容級偵測 + UI 補強**，保守取向，寧可漏抓也不誤殺正文，HITL 為最後防線。
- 左欄呈現：**正文重編號**（只有 body 章算「第 N 章」且從 1 連號），
  非正文顯示角色標籤（目錄／序／跋／其他），切換角色時即時重算。

## 實作

### 子任務 1：內容級 TOC 偵測（後端）

`chapter_detector.py`：新增 `_looks_like_toc(text)` — 章節內文同時具備
（a）目錄關鍵字（`目錄`/`目次`/`table of contents`/`contents`，容忍空白）
與（b）≥2 個獨立頁碼樣式的數字 token 時，判為 TOC。
在 `detect_chapters` 收尾階段，對仍為 `body` 的 span 套用；命中則升級為
`ChapterRole.toc`。此為強訊號、低誤判，直接解決截圖中目錄被當正文的問題。
序/前言的細分維持既有 heading 規則 + UI 手動切換（保守，不自動猜 blurb）。

### 子任務 2：角色感知編號（前端）

`ChapterReviewPage.tsx`：由 `chapters` state 推導每章顯示標籤——維護 body 計數器，
body → `第 N 章`（N=body 計數），非 body → `review.chapterType.<role>` 標籤。
左欄與右側標頭共用此推導；因來源是 state，切換角色即時更新。

### 子任務 3：非正文分色（前端）

`ChapterReviewPage.tsx`：以既有 token 為非正文章節上色——左欄項目與右側標頭
用 `--fg-muted` 系的淡色/角色色標示，和一般正文區隔。不新增 token。

## 不做

- 不追章節標題殘留頁碼（如「潮水回填 133」）——另案。
- 不自動細分 preface/afterword 的內容偵測——誤判風險高，交由 UI 手動。
- 不改 `submitReview` API 契約（role 早已在 payload）。
