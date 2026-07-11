# 書籍上傳流程強化（取消路徑、重啟恢復、進度一致性）

日期：2026-07-11
狀態：已實作完成（本文件所列 T1–T7 全數落地；#12 改為「>15MB 跳過預偵測」，
原 .txt 截斷取樣方案因 UTF-8 斷字風險放棄——切在多位元組字元中間會使後端
decode 失敗而錯判為英文）

## 背景

完整走查上傳 → 審閱 → 完成流程後，確認主幹健全（LangGraph checkpoint HITL、murmur 增量輪詢、partial-success），但取消/終止路徑與重啟恢復有實質功能缺陷。本計劃修復已確認的問題；**不改變**強制章節審閱的 HITL 設計（批次上傳跳過審閱屬另案）。

## 已確認的決策

1. **WS 通道移除**：`/ws/tasks` 為半成品死碼（四個分析 router 有推送、ingestion 沒推、前端零連線）。設計規則定為：**串流內容（chat）→ WS；任務狀態 → 輪詢**。
2. **重啟 reconcile**：啟動時將卡在 pending/running 的 ingestion 任務標為 error（「伺服器重啟，處理中斷」）；awaiting_review 任務保留（checkpoint + SQLite task store 均可存活重啟）。不做自動 resume（避免開機觸發大量 LLM 呼叫）。
3. **審閱維持強制卡點**，但「接受系統判斷」改走後端捷徑（POST /review 不帶 chapters = 原樣接受），不再把整本書拉到前端再送回。

## 問題清單與修法

### 嚴重

| # | 問題 | 修法 |
|---|------|------|
| 1 | 審閱後 phase2 未註冊 task_registry → 「終止處理」永遠 409，前端吞掉後刪書，pipeline 背景續跑可能把已刪書寫回 | `submit_review` 的 resume task 註冊 registry；`_resume_ingestion_graph` finally unregister |
| 2 | 終止/放棄後 task 永遠停在 awaiting_review（非 terminal）→ Task Center 殭屍 | `delete_book` 順帶將關聯非 terminal 任務標 failed + 刪 checkpoint thread；cancel 端點支援 awaiting_review（直接標 failed，無需 registry） |
| 3 | 重啟後 running 任務永久卡死 | lifespan 啟動 reconcile（見決策 2） |
| 4 | LangGraph checkpoint thread 永久累積 | 任務終結（resume 完成/失敗、取消、刪書）時 `adelete_thread(task_id)` |
| 5 | store.py 兩處簡體「失败」 | 改「失敗」 |

### 接受的調整

| # | 問題 | 修法 |
|---|------|------|
| 6 | 「接受系統判斷」整本書來回傳輸 | `ReviewSubmitRequest.chapters` 改 optional；缺省 = resume(None) = 原樣接受 |
| 7 | Task Center 點 awaiting_review 的 ingestion 任務導到讀者頁 | `taskRoute` 對 awaiting_review ingestion 導 `/upload/review/:bookId?taskId=` |
| 8 | 前後端進度百分比寫死耦合；dataStorage 步驟永不亮 | `TaskStatus` 加 `step_key`；後端各 `_progress` 帶 machine key；phase2 收尾補 92% 資料儲存；前端 timeline 優先用 stepKey、pct 為 fallback |
| 9 | stage 字串中英混雜 | 後端 stage 統一中文 |
| 10 | WS 死碼 | 刪 `tasks_ws.py`、`ws_manager.py`、四個 router 的 push、main.py 註冊；同步 README/API_CONTRACT/BACKLOG |
| 11 | UploadPage 任務清單只存 sessionStorage（限單分頁） | mount 時從 `GET /tasks` 合併非 terminal ingestion 任務 |
| 12 | detectLanguage 整檔重傳只為猜語言 | `.txt` 截前 128KB 取樣；PDF/DOCX/EPUB（容器格式不可截斷）超過 15MB 跳過預偵測 |
| 13 | phase1 期間無法取消（按鈕依賴 bookId） | 終止鈕改為 taskId 即可用；有 bookId 才附帶刪書 |

### 列入 BACKLOG（本次不做）

- review-data 分章/分頁載入（大書審閱頁初載重）— 待 UX 重構時一併設計
- phase1 文件解析 sub-progress（需 DocumentProcessingPipeline 增加 callback hook）
- 批次上傳（含跳過審閱選項）— 另案設計

## 異動檔案（依子任務分批，每批 ≤3–4 檔）

- **T1a** `api/store.py`（typo、`set_task_failed` async helper）、`api/routers/tasks.py`（cancel 支援 awaiting_review）
- **T1b** `api/routers/books.py`（registry 註冊/解除、accept 捷徑、delete_book 任務清理、checkpoint 刪除）、`api/schemas/books.py`（chapters optional）
- **T2** `api/main.py`（lifespan reconcile）
- **T3** `frontend/src/api/ingest.ts`、`frontend/src/components/upload/ProcessingCard.tsx`（accept 捷徑、終止鈕不依賴 bookId）
- **T4a** `api/schemas/common.py`（TaskStatus.step_key）、`api/store.py`（set_progress step_key + 欄位 migration）
- **T4b** `workflows/ingestion.py`、`workflows/ingestion_graph.py`、`api/routers/books.py`（progress 帶 step key、stage 中文化、92% 資料儲存）
- **T4c** `npm run gen:types`、`frontend/src/components/upload/ProcessingTimeline.tsx`（stepKey 優先）
- **T5** 刪 `api/routers/tasks_ws.py`、`api/ws_manager.py`；`api/main.py`、`analysis.py`、`narrative.py`、`symbols.py`、`tension.py` 移除 push；README、docs 同步
- **T6** `frontend/src/components/tasks/taskRoute.ts`、`TaskRow.tsx`、`frontend/src/pages/UploadPage.tsx`（任務重建 + detectLanguage 節流）
- **T7** 測試補充 + API_CONTRACT.md、BACKLOG.md 更新

## 回滾方式

全部改動以 git commit 分批提交，`git revert` 即可回滾。SQLite migration 僅新增欄位（step_key），向後相容；LangGraph checkpoint 刪除僅作用於已終結任務，無資料風險。

## 新依賴

無。`AsyncSqliteSaver.adelete_thread` 為現有 langgraph-checkpoint-sqlite (>=3.0.3) 內建。
