# 邊界輔助辨識（Boundary Role Suggester）

> 日期：2026-07-06　分支：`feat/book-upload-revamp`

## 目標

在章節人工審閱頁提供一個**使用者觸發**的按鈕「邊界輔助辨識」，用 LLM 幫忙判讀
哪些章節是**非正文**（目錄 / 序 / 跋 / 其他），批次填好現有的 chapter role，
減少逐章手動 toggle 的工。

## 設計原則（為什麼這樣做）

- **不碰 `detect_chapters`**：偵測維持純 regex/heuristic、決定性、可測。此功能是
  審閱層的獨立 endpoint，opt-in。
- **段落粒度、逐段回推**：非正文黏在**全書文字的物理兩端**，且常**融進第一章的
  頭 / 最後一章的尾**，不對齊章節邊界。所以以段落為單位、從兩端往內**逐段**送 LLM
  判 body／非正文，讀到第一段故事正文即停；中段連續正文完全不送。成本與非正文
  長度成正比。
- **語言無關**：LLM 判段落內容，不維護任何語言關鍵詞表（避免換語系就失效）。
- **只走 body 章節**：已是非正文的章節（目錄/序）已被隔離，不再進去重複處理。
- **切章、左側即時更新**：回傳前後附的段落邊界，前端據此把受影響的 body 章節切開，
  前/後附成為獨立的非正文章節（chapter role），左側章節列表即時反映。純建議、不
  mutate DB，最終走既有 `POST /review`（`startParagraphIndex` + `role`）持久化。
- **角色由內容判定**：LLM 逐段回 role（body/toc/preface/afterword/other），非正文段落
  依優先序（preface > afterword > toc > other）聚合成該切出章節的 chapter role，不再
  一律標 other。
- **排除一致化**：非正文章節（role != body）除了 embedding，也一併排除於 **KG 抽取**與
  **摘要**（三條 pipeline 統一過濾 `chapter.role == body`）；順帶補掉既有目錄/序/跋漏進
  KG/摘要的舊洞。非正文目前不進閱讀頁，未來另做資訊頁顯示（backlog）。
- **前端 applyBoundaries 有 vitest 單元測試**（專案首個前端測試環境）；段內切分（跨界
  段落）列 backlog B-050。

> 設計演進：(1) 初版「章節開頭 snippet 分類」對融進尾巴的後附結構性抓不到（章頭是
> 故事）。(2) 二版改段落級逐段回推、但只標段落 `matter`，左側不更新、且會走進目錄
> 重複標記。(3) 現版：只走 body 章節、逐段回推找邊界、**切成獨立非正文章節**，左側
> 即時更新。

## 兩顆旋鈕（可調常數）

| 旋鈕 | 預設 | 說明 |
|------|------|------|
| snippet 長度 | 500 字 | 每段送給 LLM 的開頭字數 |
| 每端掃描上限 | 30 段 | 避免整本被掃；讀到第一段 body 也停 |

## Phase 1 — 後端（先做、可獨立驗證）

**新增** `backend/storysphere/services/chapter_role_suggester.py`
- `suggest_boundary_roles(chapters, ...)` — 攤平 body 章節的 body 段落（保留 book-global
  索引），從兩端逐段送 LLM（`_classify_is_body`，`get_with_local_fallback` + `ainvoke` +
  `extract_json_from_text`），讀到第一段 body 即停，回 `BoundaryResult`
  （`front_matter_end` / `back_matter_start` + role）

**前端切章**：`ChapterReviewPage.tsx` 的 `applyBoundaries()` 依邊界切開 body 章節、
把前/後附段落切成獨立非正文章節，重編號 chapterIdx

**修改** `api/routers/books.py` — 新 endpoint `POST /books/{book_id}/suggest-roles`
- 沿用 review-data 的 `awaiting_review` 守衛
- 讀 `document.chapters` → 跑 suggester → 回 `SuggestRolesResponse`
- LLM 未設定（RuntimeError）→ 回 503，前端顯示「暫不可用」

**修改** `api/schemas/books.py` — `RoleSuggestion` / `SuggestRolesResponse`（camelCase）

**新增測試** `tests/services/test_chapter_role_suggester.py`（snippet 純函數 + mock LLM 的
early-stop）、`tests/api/test_suggest_roles.py`（happy path、409 非 awaiting、503 無 LLM）

**更新** `docs/API_CONTRACT.md`（commit 標 `[api-contract updated]`）

## Phase 2 — 前端（Phase 1 驗過再做）

- `frontend/` 跑 `npm run gen:types`
- `api/ingest.ts` 加 `suggestRoles(bookId)`（response type 從 `generated.ts`）
- `ChapterReviewPage.tsx` 加按鈕「邊界輔助辨識」，呼叫後把建議 merge 進 chapters
  state（標示變動章節）；按鈕加 **hover tooltip**：告知仰賴 AI 判讀、會消耗 token
- i18n 字串（`upload` namespace）
- 更新 `docs/UI_SPEC.md`

## 回滾

以新增為主；`git revert` 或刪檔即可。不動 `detect_chapters`、不動既有 review/submit
流程，回滾零風險。
