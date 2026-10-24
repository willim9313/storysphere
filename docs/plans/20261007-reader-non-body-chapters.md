# 閱讀頁可讀非正文章節（卷首／卷末）—— 實作計畫

> 日期：2026-10-07 · 分支：`feat/ds-v3-53-reader-non-body`（base `feat/ds-v3`）
> 起因：impeccable critique 閱讀頁（2026-10-06）修掉 #9b 列出非正文段落的孤兒態後，使用者裁決
> 「還是要有地方可以看到非正文」。審閱送出後，序／後記等內容在產品裡已無任何閱讀入口。

## 現況與不變的部分

- 現行定義三處寫明非正文「不進閱讀頁」：`docs/domain-glossary.md`（章節與段落角色）、#4 docstring、UI_SPEC §3.3。
- pipeline 對非正文的排除**不變**：不做 embedding、KG 抽取、摘要。所以閱讀頁裡的非正文是**唯讀、無分析層的原文**。
- #5（依章取 chunks）本來就能取非正文章，不改。
- #9b 實體出處維持只計正文（commit `4d9bf0e`）。

## 決策

**位置**：欄 2 章節清單，依 `Chapter.number` 分兩群——**卷首**（number ≤ 0，排在第 1 章前）、**卷末**（number > N，排在最後一章後）。
`assign_chapter_numbers` 保證兩群即書的頭尾、升冪等於文件順序（夾在正文中間的非正文不會由正常流程產生）。

| 項目 | 決定 |
|---|---|
| 群組標頭 | 可摺疊一列「卷首 · N」／「卷末 · N」，**預設收起**；空心方塊標記（同章節審閱頁），muted |
| 非正文卡 | 單列：角色名（序／目錄／跋／其他，沿用 glossary UI 標籤）＋標題＋「N 段」；**無 chevron、不可展開**（沒有摘要／關鍵字／實體）；點＝欄 3 閱讀 |
| 欄 3 標題 | 「第 N / M 章」徽章改為角色名徽章 |
| 標註 | 強制純文字：無實體 mark、無 chip（非正文未抽取；舊資料殘留標註一律忽略） |
| 不參與 | 「下一章」、貝茲欄、「章節 · N」計數、實體出處（#9b） |
| 認知狀態鈕 | **停用**＋tooltip「非正文不參與分析」（以章號為截止，非正文沒有章號）；工具列不位移 |
| 章節搜尋 | 照常套用到非正文卡，比對標題 |

使用者裁決（2026-10-07）：群組名用「卷首／卷末」而非「非正文」；認知鈕停用而非隱藏。

## API

#4 `GET /books/:bookId/chapters` 新增 `?includeNonBody=true`（預設 false——其他 4 個前端呼叫端行為不變）。
`ChapterResponse` 新增 `role`（`body | toc | preface | afterword | other`），一律回傳。

## 實作注意

- `BezierConnectors` 以「在正文清單的第幾個」查 `data-chapter-card`：非正文卡**不帶**此屬性，正文清單維持獨立一份，否則索引整批錯位。
- 分群寫成 `readerModel.ts` 純函式並補 vitest。

## 拆分（每步跑六道閘門、給使用者確認）

| 步 | 內容 | 檔案 |
|---|---|---|
| A0 | 本計畫＋索引；UI_SPEC §3.3；glossary 改「不進閱讀流，閱讀頁以卷首／卷末唯讀呈現」 | `docs/plans/*`、`docs/UI_SPEC.md`、`docs/domain-glossary.md` |
| A1 | #4 參數與 `role` 欄位＋測試 | `book_reader.py`、`schemas/books.py`、`test_reader.py` |
| A2 | 契約＋型別 | `API_CONTRACT.md`、`frontend/src/api/generated.ts` |
| A3a | 欄 2 分群與非正文卡 | `readerModel.ts`(+test)、`ReaderPage.tsx`、`ChapterCard.tsx`／`reader.css`、i18n |
| A3b | 欄 3：角色徽章、純文字、認知鈕停用、下一章只走正文 | `ReaderPage.tsx`、i18n |
