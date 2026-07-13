# 審核頁「選取文字 → 段內切分」

**日期**：2026-07-09
**Branch**：`feat/upload-paragraph-split`（自 `feat/book-upload-revamp` 分出）

## 問題本質

章節邊界目前只能落在**既有段落的起點**：前端 `splitAt` 只能在段落之間插切點，
後端 `_rebuild_chapters`（`workflows/ingestion.py`）也是拿 flat paragraph index
切片重組。預處理若把頭尾雜訊（版權頁、獻詞、題詞）融成一大段，真正的切分點
就困在段落中間，無法操作。

## 互動設計（用戶選定：選取文字後切分）

1. 閱讀欄中，使用者**反白選取「要分出去的那段文字」**（限單一段落內）
2. 選取結束時浮出按鈕「✂ 切分為新段落」
3. 點擊後，該段落拆成 2～3 個段落：選取前文字｜選取文字｜選取後文字
   （空白邊緣自動修剪、空片段不產生），新段落**繼承原段落角色**
4. 拆開後，既有的章節切分「＋」按鈕自然出現在新段落之間 →
   沿用原本的章節切分操作，不引入第二套概念
5. 切分後 banner 顯示「已切分段落 — 復原」提供一步復原
6. 跨段落選取、選取範圍切進章節標題（`titleSpan`）內時不顯示按鈕
   （標題被切開後 chapter title 推導失去意義，經用戶確認採此取捨）

## 資料流

- **前端狀態**：切出的片段保留原始 `paragraphIndex`，另記 `origStart`
  （片段在原段落內的字元起點）。送審時 flat walk 算出「切分後全域 index」，
  `startParagraphIndex` 與 `roleOverrides` 改用新 index，
  另附 `paragraphSplits: { "原index": [字元offset...] }`
- **後端**：`POST /books/:id/review` 新增選填欄位 `paragraphSplits`；
  resume 時**先** `_apply_paragraph_splits`（切 `Paragraph`、新片段給新 uuid、
  `title_span` 依 offset 調整）**再**套 `role_overrides` 與 `_rebuild_chapters`。
  不帶欄位時行為不變，向後相容
- `review-data` 端點零改動

## 子任務

- **A｜後端**：`api/schemas/books.py`（`paragraph_splits`）、
  `api/routers/books.py`（傳遞至 resume_value）、
  `workflows/ingestion.py`（`_apply_paragraph_splits`）、
  `workflows/ingestion_graph.py`（呼叫順序）
- **B｜後端測試**：`tests/workflows/test_apply_paragraph_splits.py`（新增）、
  `tests/api/test_chapter_review.py`（修改）
- **C｜前端**：`frontend/src/pages/upload/paragraphSplits.ts` + 測試（新增）、
  `ChapterReviewPage.tsx`、`api/ingest.ts`、i18n locale、`npm run gen:types`
- **D｜文件**：`docs/API_CONTRACT.md`（`[api-contract updated]`）、`docs/UI_SPEC.md`

## 回滾

全部收在子 branch，砍 branch 即還原；`paragraphSplits` 為選填欄位，舊 payload 不受影響。
