# 上傳流程錯誤分類碼（errorKind／failedStepKinds）—— 實作計畫

> 2026-10-17 規劃，使用者確認後存檔。屬上傳頁 impeccable 評估子任務 6。
> 本檔為規劃當下快照，實作後凍結；現況以程式碼與 `docs/API_CONTRACT.md` 為準。

## 問題

1. 後端在 `task.error` 只留 `str(exc)`，例外型別在寫入前就丟了。前端只能拿原文比對字串，
   也無法告訴使用者「同一個檔重試不會成功」（產品原則 3：花 token 之前說清楚）。
2. 掃描檔（無文字層 PDF）不會失敗：pypdf `extract_text()` 回空字串 → 0 段 0 章 →
   `status: done`、`failedSteps: []`，書庫多一本空書，沒有任何錯誤（違反產品原則 2）。
3. `asyncio.TimeoutError` 的 `str()` 是空字串，步驟逾時時 failedSteps 的細節為空。

## 盤點（摘要）

整本失敗（`set_failed`）實際來源：

| 類 | 來源 | 重試同一檔 |
|---|---|---|
| 加密 PDF（user 密碼） | pypdf `FileNotDecryptedError`（`loader.py` 讀 `reader.metadata`） | 否 |
| 損毀／空檔 | `PdfReadError`／`PdfStreamError`、`EmptyFileError`、python-docx `PackageNotFoundError`／`BadZipFile`、EPUB `ValueError("Could not parse EPUB: …")` | 否 |
| 伺服器重啟 | `api/main.py` 對帳寫入固定字串 | 是 |
| 其他（DB 等） | 原樣字串 | 可能 |

LLM 相關錯誤被 `run_step` 收成 failedSteps，不會讓整本失敗。步驟失敗實際來源：
額度／頻率（`is_rate_limit_error`）、未設定 LLM（`primary_config_error()`／`_resolve_primary` 的
`RuntimeError`）、內容被擋（`LLMResponseBlocked`）、逾時（`asyncio.TimeoutError`）、其他。

## 決議

在例外仍是物件時分類（`book_ingestion.py` 兩個 except、`ingestion.py` 的 `run_step`），不在字串上猜。

- `TaskStatus.errorKind: 'encrypted' | 'unreadable' | 'no_text' | 'interrupted' | 'internal' | null`。
  `cancelled` 維持既有 `error === "cancelled"` 判斷，不另設 kind。
- `result.failedStepKinds: { [stepId]: 'rate_limited' | 'llm_unconfigured' | 'blocked' | 'timeout' | 'other' }`；
  `failedSteps` 字串陣列不變（向後相容）。逾時的細節補成可讀字串。
- 掃描檔：Phase 1 偵測到 0 段時直接失敗（`errorKind: no_text`），書不寫入書庫。
- task store 以既有 `ALTER TABLE tasks ADD COLUMN` 模式加 `error_kind`；memory backend 同步。
- 前端依 kind 顯示人話並說明重試／重跑有沒有用，後端原文留在細節框。
  失敗卡「重試」鈕三類（加密／損毀／無文字）都保留，人話寫明「同一個檔重試不會成功」。

## 拆段

| 段 | 內容 |
|---|---|
| B1 | `errorKind`：分類函式、store 欄位、schema、兩個 except、重啟對帳；測試、API_CONTRACT、`gen:types`（一段超過 3 檔，使用者同意） |
| B2 | `failedStepKinds`＋逾時細節 |
| B3 | 掃描檔提早失敗（`no_text`） |
| F1 | 失敗卡依 `errorKind` 的人話 |
| F2 | 重跑列依 `failedStepKinds` 的人話（取代原 6a 字串比對；建構概覽頁 `RATE_LIMIT_RE` 不動） |
| 6b–6d | 上傳請求錯誤人話、恢復任務沿用書名、效能（原計畫不變） |
