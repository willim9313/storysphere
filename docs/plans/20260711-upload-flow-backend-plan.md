# 上傳流程後端先行計劃（與前端設計並行）

日期：2026-07-11
狀態：已確認，待實作
配套文件：`20260711-upload-ux-design-brief.md`（Claude Design 重設計需求書）
前置：`20260711-upload-flow-hardening.md`（功能強化，已完成 commit 4277cc9 / 24a550b / 21006a4）

## 目的

前端視覺重設計交由 Claude Design 進行期間，後端先把**設計回來後會依賴的
API 能力**做好，避免合併開發時前端等後端。以下每項標注前端牽涉程度。

---

## P1. 審閱資料分章載入（B-055）【設計依賴：高——審閱頁重設計以此為前提】

**問題**：`GET /books/:bookId/review-data` 一次回傳整本書全文＋切句，大書
審閱頁初載很重。

**後端工作**：
- 新增分章取用介面（方向：`GET /review-data` 回傳章節骨架
  〔chapterIdx / title / role / 段落數〕，`GET /review-data?chapter=n` 回傳
  該章段落全文；或 `?offset/limit` 段落分頁——實作時定案並更新
  `docs/API_CONTRACT.md` `[api-contract updated]`）
- 維持既有全量回傳的相容性（舊參數行為不變），前端切換後再議退場
- 注意：`paragraphIndex` 為 book-global 索引，分章回傳時必須保留全域索引
  （submit payload 依賴它）

**前端牽涉**：ChapterReviewPage 改漸進載入（設計回來後合併開發）。
**測試**：骨架/單章 happy path、章號越界 404、全域索引連續性。

## P2. Phase 1 解析 sub-progress（B-056）【設計依賴：中——處理卡體驗】

**問題**：phase 1 只有 5/10/15 三個粗進度點，大 PDF 解析期間長時間無變化。

**後端工作**：
- `DocumentProcessingPipeline` 增加 `sub_cb` hook（比照 phase 2 各 pipeline
  的 `sub_cb(cur, tot, label)` 慣例）
- `run_phase1` 接上 `_progress` 的 `sub_progress/sub_total`（stepKey 維持
  `pdfParsing`）

**前端牽涉**：無（ProcessingCard 已會顯示 sub-progress，資料到位即生效）。
**測試**：解析多頁文件時 sub_cb 被呼叫、進度單調遞增。

## P3. 步驟起始時間戳【設計依賴：中——已耗時/ETA 顯示】

**問題**：設計需求 3.3（已耗時 + ETA）目前只能用 `createdAt` 算整體耗時；
若要「本步驟已進行 X 分鐘」與較準的 ETA，需要步驟起始時間。

**後端工作**：
- `set_progress` 在 `step_key` 變更時記錄 `step_started_at`（tasks 表加欄位，
  ALTER TABLE 慣例同 step_key migration）
- `TaskStatus` 增加 `stepStartedAt`，`gen:types` 同步，更新 API_CONTRACT

**前端牽涉**：ProcessingCard 顯示邏輯（合併開發時做）。
**規模**：小；若設計最終只要整體已耗時，此項可降級不做——**等 canvas
回來確認後再動工**，避免做白工。

## P4. 既有能力盤點（後端**不需**動工，前端合併時直接用）

| 設計需求 | 後端現狀 |
|---------|---------|
| 3.1 一鍵重跑 | `POST /books/:id/rerun/:step` 完備（reader 已在用） |
| 3.2 完成通知 | 輪詢 `GET /tasks` 即可偵測狀態轉移，無需新端點 |
| 3.4 書名重複前置警告 | `GET /books` 已含書名，前端比對即可 |
| 3.5 失敗重試 | 重新 `POST /books/upload` 即可，無需新端點 |
| 3.8 多檔排隊 | 上傳端點天然支援並行任務，無需改動 |

## P5. 順手項（低優先，獨立小 PR）

- `.gitignore` 補 `backend/var/`（runtime SQLite 目前未被忽略）
- `tests/test_llm_client.py` 3 個測試順序污染失敗（全套跑才失敗、單檔過）
  ——查明汙染源（疑似 settings/env 殘留），與本流程無關但建議清掉

---

## 合併開發流程（設計回來後）

1. Claude Design 交回 `.dc.html` canvas → 依 canvas 實作（不依 prose 重詮釋）
2. 合併順序建議：toast 基礎設施（3.2）→ ProcessingCard 家族（3.1/3.3/3.5）
   → UploadPage（3.4/3.7/3.8）→ ChapterReviewPage（3.6，依賴 P1）
3. 每批遵守 checkpoint 紀律（≤3 檔、DoD 清單、API_CONTRACT/UI_SPEC 同步、
   `npm run gen:types`）
4. UI_SPEC.md 於各批合併時回寫

## 回滾方式

各項獨立 commit，`git revert` 即可；P1/P3 的 DB 變更皆為新增欄位或新增
查詢參數，向後相容。

## 新依賴

無預期新套件（toast 屬前端範疇，屆時優先自建輕量元件而非引入函式庫，
合併開發時再定案）。
