> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準；標「原型決定」的項目是為了開工先定的，正式版要再確認。

# 04 API 規格

給實作 agent 照著做的介面規格：REST（給原型 UI）、SSE（進度與 agent 事件）、MCP 工具（給大腦）。資料表見 01，入庫步驟見 02，方法與 registry 見 03，畫面見 05。本文件不定義任何 01 沒有的證據欄位；需要但前面沒定義的東西一律列在 §8「待補」。

## 1. 通用規則

| 項目 | 規則 |
| --- | --- |
| Base URL | `http://localhost:8000/api/v2`（與既有 `/api/v1` 區隔，兩套可並存）。下文路徑都省略 `/api/v2` |
| MCP server | 另掛在 `/mcp`（Streamable HTTP transport，不用 SSE transport），`Authorization: Bearer <session token>`；不在 `/api/v2` 下，UI 不呼叫 |
| 格式 | JSON；上傳為 `multipart/form-data`；串流為 `text/event-stream`（SSE） |
| 使用者 | 單一使用者、本機工具，REST 不帶使用者識別（沿用既有） |
| 時間 | UTC ISO 8601，結尾 `Z` |
| id | uuid 字串；`claim_type`、方法 id（如 `info.fair_play_audit`）、view type 是字串常數 |
| 型別來源 | 沿用既有 `npm run gen:types`：前端型別一律來自 openapi.json，不手寫。本文件只負責值域、語意與錯誤 |

### 1.1 命名（camelCase）

- REST 的 request／response 一律 camelCase：`api/schemas/` 的 Pydantic model 設 `alias_generator=to_camel`、`populate_by_name=True`（沿用既有 `type-generation.md`）。**不得**直接回傳 `domain/` model（那會是 snake_case）。
- **證據內容欄位**：直接用 01 §6 的定義，欄位名經 `to_camel` 轉換，例如 `canonical_name → canonicalName`、`is_misdirection → isMisdirection`、`pole_a.carrier_ids → poleA.carrierIds`。巢狀物件裡 01 定義的欄位名也轉換。
- **不轉換的**：(1) 枚舉值（`entry_exit`、`partially_fair`、`analepsis` 照原樣）；(2) `claim_type` 值（`clue_points_to` 照原樣）；(3) 以資料當 key 的字典（`centrality{character_id: score}` 的 key 是 id、`chapter_distribution{}`／`intensity_by_chapter{}` 的 key 是章號、`attributes{}` 的 key 是自由文字）；(4) registry YAML 的方法 id、view type。
- MCP 工具的參數與回傳用 **snake_case**，與架構文件的工具簽名（`show_view(view_type, data_ref)`）及 01 的欄位名一致，大腦讀到的就是 01 的原名（原型決定）。

### 1.2 錯誤格式

沿用既有 `api/schemas/common.py` 的 `ErrorResponse`：

```json
{ "detail": "Evidence 7c1e… is level 1 and cannot be reviewed.", "code": "level1_readonly" }
```

`detail` 是一句英文（給 log 與開發者），UI 依 `code` 顯示中文。驗證優先序沿用既有：`404 → 422 → 409 → 503`。

| HTTP | `code` | 意義 |
| --- | --- | --- |
| 404 | `not_found` | 書、證據、run、job、session 不存在 |
| 422 | `validation_error` | 欄位格式錯（FastAPI 預設 422 也轉成此形狀） |
| 422 | `system_field_forbidden` | 寫入請求帶了系統欄位（§1.5），**拒絕而不是忽略**，讓呼叫端早點發現 |
| 422 | `unknown_ref` | 方法／方法論 id 不在 registry |
| 422 | `note_cites_level1`、`note_cites_rejected` | 筆記規則（01 §5），見 N-06c |
| 422 | `not_in_trace` | MCP 寫入工具引用了本 session 沒讀過的證據（§5.5） |
| 403 | `level1_readonly` | 嘗試審核或修改第 1 層證據（契約 v2 決策 #8） |
| 409 | `job_conflict` | 同一本書已有互斥的 job 在跑（§3.3），body 另帶 `jobId` 讓前端接手 |
| 409 | `invalid_state` | 狀態不允許（取消已結束的 job、續跑沒暫停的 job、審核已拒絕的證據、session 忙碌中） |
| 409 | `review_not_open`、`review_closed`、`review_submitted` | 章節審閱，語意沿用既有 #22a |
| 503 | `llm_unconfigured` | 觸發端點要用的 task 沒有可用模型（§1.6） |

### 1.3 分頁

原型決定：列表端點用 cursor 分頁。

| 參數／欄位 | 說明 |
| --- | --- |
| `limit` | 預設 50，上限 200 |
| `cursor` | 不透明字串；省略＝第一頁 |
| 回應 | `{ "items": [...], "nextCursor": "…" \| null, "total": 123 }`；`total` 是篩選後總數 |

不分頁的：書庫（N-01a）、章節（N-01e）、registry（N-07*）、job 列表（N-09a，沿用既有「非終態全列＋最近 N 筆」）。

### 1.4 證據可見範圍

依 01 §4 與契約 v2 決策 #8：

| 情況 | 是否含第 1 層 |
| --- | --- |
| 證據列表、結果卡、筆記、view 資料的主體 | **預設只回 `level ≥ 2`** |
| 帶 `includeL1=true`（開發者檢視，05 §1） | 含第 1 層 |
| 追溯樹（N-05c）、引文與原文段落（N-05b、N-05d） | 一律含第 1 層（01 §4「只在追溯與引文顯示時出現」） |
| view 資料的「被引用者」（N-04e 的 `referenced`） | 含第 1 層，但只回標籤用的最小欄位 |
| MCP 讀取工具 | 含第 1 層（大腦要讀角色、事件才能推理），每筆標 `level` |

預設也排除 `status=superseded` 與 `reviewStatus=rejected`；要看時明確帶 `status=superseded`、`reviewStatus=rejected`。

### 1.5 系統欄位（寫入時不得出現在參數裡）

以下欄位只由後端推得（01 §3、架構文件「寫入時由系統自動補上的欄位」）。寫入證據（含筆記、詮釋、審核修改）與方法論的端點（N-05e、N-06c、N-06e、N-07e）及 MCP 寫入工具，參數帶了這些 key → `422 system_field_forbidden`：

`id`、`bookId`（REST 從路徑取、MCP 從 session 取）、`claimType`（由端點決定）、`level`、`source`、`runId`、`producedVia`、`agentBackend`、`reviewStatus`、`status`、`basisChanged`、`basisChangedAt`、`derivedFrom`、`methodologyTrace`、`methodologyRunId`、`createdAt`、`updatedAt`。MCP 端同名的 snake_case key 一樣禁止。

引用證據用 `citedEvidenceIds`（MCP：`cited_evidence_ids`）表達「我引用了哪些」，**不是** `derived_from` 本身；`derived_from` 由系統依 §5.5 算出。

### 1.6 LLM 未設定（503）

沿用既有語意，但改成依 **task** 判斷（02 §11）：觸發端點在 404／422／409 驗證之後、建 job 之前，檢查這次會用到的 task（如 `core_extraction`、`method_strong`）是否有可用模型；沒有就回 `503 llm_unconfigured`，`detail` 指出缺哪個 task，**不建 job**。零成本端點（讀取、registry、S2 重跑）不檢查。

### 1.7 端點編號

沿用既有規則，只加前綴 `N-`：`N-<群組兩位數><字母>`，例如 `N-05e`。編號一經指派不重用；新增群組取下一個數字。標題格式固定 `### N-xxx METHOD path`，本文件每個 `###` 都是一個端點（說明性小節用 `##` 或 `####`），方便之後做漂移檢查。

## 2. 共用物件

下文 response 欄位以這些物件為單位引用。標 *（推得）* 的是回應時計算、不存在表裡的欄位。

### 2.1 `Evidence`

| 欄位 | 來自 | 說明 |
| --- | --- | --- |
| `id`、`bookId`、`claimType`、`level`、`summary` | 01 §3 外殼 | |
| `discourseChapter`、`discourseParagraphId`、`storyRank`、`knownBy` | 01 §3 | `knownBy` 形狀 `{reader, characters[]}` |
| `source`、`confidence`、`reviewStatus`、`status` | 01 §3 | 值域見 01 |
| `basisChanged`、`basisChangedAt` | 01 §3 | |
| `runId`、`producedVia`、`agentBackend`、`createdAt`、`updatedAt` | 01 §3 | |
| `subjects[]` | `evidence_subject` | `{subjectId, role}` |
| `derivedFrom[]` | `evidence_link` | `{upstreamId, upstreamKind}`；`upstreamKind`＝`evidence`／`run` *（推得：查 id 所在的表）* |
| `quotes[]` | `evidence_quote` | `{seq, paragraphId, start, end, text, verified}` |
| `genreExt[]` | `evidence_genre_ext` | `{genre, systemTag, data}`；`data` 內欄位見 01 §6.1／§6.2 的推理擴充，同樣轉 camelCase |
| `content` | `ev_<claim_type>` | 內容欄位見 01 §6.x，依 §1.1 轉換；`raw_label` 存在時一併回 `rawLabel` |

列表用的 `EvidenceListItem`：上表去掉 `quotes`、`genreExt`、`derivedFrom`，加 `quoteCount`、`firstQuote`（截短 120 字）*（推得）*。`content` 在列表中預設省略，帶 `withContent=true` 才回。

### 2.2 `Run`

`runs` 表欄位見 01 §8；以下是 API 回應的形狀。

| 欄位 | 來自 | 說明 |
| --- | --- | --- |
| `id`、`bookId`、`refId` | 01 §4、03 §3 | `refId`＝方法或方法論 id；入庫步驟用 `ingest.p1`…`ingest.s5`（原型決定） |
| `refKind` | *（推得）* | `method`／`methodology`／`ingest_step`，查 registry |
| `code`、`question`、`grade`、`basis` | *（推得）* | 從 registry 帶出，給結果卡詳情的標頭 |
| `scopeKey` | 01 §4 | 同一分析的識別 |
| `version`、`promptVersion`、`model`、`params`、`inputEvidenceIds` | 03 §3 | |
| `summary` | 01 §6.3 `runs.summary_json` | 書層級結論（如 NS2 的 `story_time_structure`） |
| `status` | 01 §8 | `queued`／`running`／`done`／`not_applicable`／`failed`／`cancelled` |
| `precheck` | 01 §8 `precheck_json` | 不適用時：`{missing[], howToFix, whenUselessEvenIfFixed}`（03 §3 前提條件） |
| `parentRunId`、`stepRunIds[]` | 01 §8（`stepRunIds` 推得） | 方法論與它的步驟、上游補跑的關係 |
| `jobId`、`startedAt`、`finishedAt` | 01 §8 | |
| `superseded` | *（推得）* | 同 `(bookId, refId, scopeKey)` 有較新的 `done` run |
| `evidenceCount`、`maxLevel`、`basisChangedCount` | *（推得）* | 本 run 產出的 current 證據統計 |

### 2.3 `Job`

`jobs` 表由本文件定義（01 §2「見 04」）：

| 欄位 | 說明 |
| --- | --- |
| `id`、`kind`、`bookId`（可 null）、`title` | `kind` 見 §3.1 |
| `status` | 見 §3.2 狀態機 |
| `progress`（0–100）、`stage` | `stage`＝目前步驟 key（入庫：`p1`／`review`／`s1`…`s5`；方法：方法 id） |
| `params`、`result` | json；`result` 依 kind 不同，見各觸發端點 |
| `error`、`errorKind` | `errorKind` 沿用既有分類：`encrypted`／`unreadable`／`no_text`／`interrupted`／`internal`／`llm_unconfigured`／`blocked`／`timeout`／`other`。`rate_limited` 不進 error，改走 `paused_quota` |
| `parentJobId` | 例如 S4 補跑由改主題材觸發 |
| `lastSeq` | 此 job 最後一個 SSE 事件的 seq，斷線補抓用 |
| `createdAt`、`startedAt`、`finishedAt` | |

### 2.4 `Card`（結果卡）

| 欄位 | 說明 |
| --- | --- |
| `refId`、`code`、`question` | 結果卡標題＝方法論的 `question`（02 §8、契約 v2 路徑一） |
| `perspective` | `universal`／`mystery`（來自 `registry/perspectives/*.yaml`，03 §5） |
| `viewType` | 05 §4 |
| `state` | `not_run`／`running`／`done`／`not_applicable`／`failed`／`basis_changed`（05 §3.1 的六態） |
| `runId`、`jobId`、`maxLevel`、`finishedAt`、`precheck` | 依狀態有值 |
| `implemented` | 原型決定（2026-11-17）：`false`＝原型尚未支援這個方法（範圍調整後只做 6 個方法），`state` 是 `not_run`，UI 標「尚未支援」，不當成錯誤 |

原型決定：03 §5 寫成 `EV2 → EV1`、`TM1 → TM2` 的卡，`refId` 取**最後一步**（EV1、TM2），前面的步驟靠一致性規則 7 的上游自動補跑，不另外宣告方法論。

### 2.5 `NoteDraft`（筆記草稿）

01 §5：agent 的 `create_note` 只產生草稿，存在 session 裡、不進 `evidence`。

| 欄位 | 說明 |
| --- | --- |
| `draftId`、`sessionId` | |
| `title`、`conclusion`、`citedEvidenceIds[]` | agent 給的（使用者確認時可改） |
| `question` | 系統填：觸發這次 `create_note` 的那則使用者訊息 |
| `state` | `open`／`confirmed`／`discarded` |
| `check` | `{ok, problems[]}`：即時套 N-06c 的筆記規則，讓卡片先顯示能不能存 |
| `noteId` | 確認後的筆記 id |
| `createdAt`、`updatedAt` | |

## 3. 背景工作與串流

### 3.1 Job 種類

| `kind` | 由誰建立 | 做什麼 | 對應 |
| --- | --- | --- | --- |
| `ingest` | N-01b | P1 → 章節審閱 → S1–S5 | 02 全部 |
| `ingest_retry` | N-02f | 只重跑指定的 `failed` 單位，接著重做其後的整併步驟 | 02 §7 |
| `ingest_rerun` | N-02g | 從某一步起重跑（S1 換模型、S2 調整併規則…） | 02 §4、§7 |
| `genre_s4` | N-02h | 改主題材後對新增主機制補跑 S4，再跑新預設卡 | 02 §5 |
| `method_run` | N-04a、N-04d、MCP `run_method`、S5 | 執行一個方法／方法論（含上游補跑） | 03 §3 |
| `note_rerun` | N-06d | 重跑筆記的方法論或重放 trace | §4.6 |
| `llm_test`、`brain_test` | N-08c、N-08g | 初次啟動測試 | 05 §6 |

### 3.2 狀態機

```
pending ─▶ running ─▶ done
              │  ├──▶ awaiting_review ─(N-02e)─▶ running        （只有 ingest）
              │  ├──▶ paused_quota   ─(N-09e)─▶ pending          （429／額度用完）
              │  ├──▶ interrupted    ─(N-09e)─▶ pending          （伺服器重啟時仍在 running）
              │  └──▶ error
pending／running／awaiting_review／paused_quota／interrupted ─(N-09d)─▶ cancelled
```

| 狀態 | 終態 | 說明 |
| --- | --- | --- |
| `pending` | 否 | 已建立、等待執行 |
| `running` | 否 | |
| `awaiting_review` | 否 | 章節審閱暫停（沿用既有 LangGraph `interrupt()`） |
| `paused_quota` | 否 | 02 §7：`classify_step_failure` 判為 `rate_limited`。**不算失敗**，UI 顯示「可稍後續跑」；已完成的單位不重跑 |
| `interrupted` | 否 | 原型決定：伺服器啟動時把殘留的 `running` 改成此狀態；使用者按續跑才繼續（不自動續跑，避免一開機就花額度） |
| `done` | 是 | 有單位失敗也算 done，`result.failedUnitCount > 0`（02 §7「其餘照跑，完成時列出失敗單位」） |
| `error` | 是 | 整個 job 無法繼續（檔案問題、`blocked` 擋到整本、內部錯誤） |
| `cancelled` | 是 | 使用者取消。原型決定：獨立成一個狀態，不沿用既有「`error` + `error: "cancelled"`」 |

續跑（N-09e）＝同一個 job id 回到 `pending`，只跑 `ingest_units.status ≠ done` 的單位（02 §7）。

### 3.3 互斥

| 規則 | 衝突時 |
| --- | --- |
| 同一本書同時只能有一個 `ingest*` 或 `genre_s4` job | `409 job_conflict`，帶進行中的 `jobId` |
| 入庫類 job 未完成時不能觸發 `method_run` | `409 job_conflict` |
| 同 `(bookId, refId, scopeKey)` 已有 `method_run` 在跑 | **不報錯**，回 `200 {status: "attached", jobId}`，接到既有 job（agent 與 UI 同時點同一張卡很常見） |
| 刪書時有非終態 job | `409 job_conflict` |

### 3.4 SSE 規格

兩條串流：單一 job（N-09c）與整本書（N-09f，書籍總覽與入庫頁用）。

| 項目 | 規則 |
| --- | --- |
| 格式 | `id: <seq>`、`event: <type>`、`data: <json>`；seq 在每條串流內單調遞增 |
| 斷線補抓 | 帶 `Last-Event-ID` 標頭或 `?after=<seq>`（沿用既有 `after` 的 delta 語意） |
| 緩衝 | 原型決定：每條串流在記憶體保留最近 1,000 筆；要求的 seq 已被丟掉時先送 `resync`，前端重新抓 REST 狀態 |
| 心跳 | 每 15 秒送一行 SSE 註解 `: ping` |
| 輪詢備案 | 不能用 SSE 時輪詢 N-09b，`lastSeq` 判斷有沒有新東西 |
| 事件來源 | 原型決定（2026-11-17）：入庫圖、單位、方法引擎都把狀態寫進資料庫；後端每 0.5 秒比對一次非終態 job 的狀態、單位與 run，有變就發事件，並寫回 `progress`、`lastSeq`。事件最多晚 0.5 秒；一個間隔內出現又消失的中間狀態不會發。伺服器重啟後 job 串流從 `jobs.last_seq` 接著編號，書的串流從 0 起算 |

### 3.5 事件型別

| `event` | 何時 | `data` 主要欄位 |
| --- | --- | --- |
| `job.status` | job 狀態或 progress 改變 | `jobId`、`kind`、`status`、`progress`、`stage`、`errorKind` |
| `ingest.step` | 入庫步驟切換（02 §1 的 P1、審閱、S1–S5） | `jobId`、`bookId`、`step`（`p1`／`review`／`s1`…`s5`）、`state`（`running`／`done`／`failed`／`skipped`） |
| `ingest.unit` | 一個抽取單位完成或失敗（02 §9） | `jobId`、`bookId`、`stage`、`unitId`、`chapter`、`status`（`done`／`failed`）、`attempts`、`preview{characters[], events[]}`（抽到的角色名、事件標題，各最多 5 個）、`error` |
| `run.status` | run 開始、完成、不適用、失敗 | `jobId`、`bookId`、`runId`、`refId`、`code`、`status`、`evidenceCount`、`precheck` |
| `basis.changed` | 01 §4 的反向傳播完成 | `bookId`、`cause{kind: rejected／reextracted, evidenceId／runId}`、`evidenceCount`、`evidenceIds[]`（最多 200）、`noteIds[]` |
| `resync` | 補抓範圍已不在緩衝內 | 無 |

`ingest.unit` 的 `stage` 值見 01 §8：`s1a`（呼叫 A）、`s1b`（呼叫 B）、`s4a`；S2、S4b 是書層級一次，不發單位事件。

## 4. REST 端點

### 4.1 書庫與上傳（畫面 1）

### N-01a GET /books

| 項目 | 內容 |
| --- | --- |
| 用途 | 書庫列表，**含入庫中的書**（與既有 #1 不同，05 畫面 1 要顯示入庫狀態） |
| Response | `Book[]`：`id`、`title`、`author`、`language`、`chapterCount`、`effectiveGenre`、`ingestStatus`、`ingestJobId`、`uploadedAt` |
| 說明 | `effectiveGenre`＝`genre_override ?? genre_profile.primary`；`ingestStatus` 取最近一個入庫類 job 的 `status` *（推得）* |
| 對應 | `books`、`jobs` |

### N-01b POST /books/upload

| 項目 | 內容 |
| --- | --- |
| 用途 | 上傳並建立 `ingest` job |
| Request | `multipart/form-data`：`file`（PDF／DOCX／TXT／EPUB，≤ 200 MB）、`title?`、`author?`、`language?`（沿用既有 #2） |
| Response 202 | `{jobId, duplicateTitle}`；`bookId` 在 P1 寫入 `books` 後出現在 `job.result.bookId` |
| 錯誤 | 413 `file_too_large`；422 格式不支援（副檔名不是 pdf／docx／txt／epub）；503 `core_extraction` 沒有模型。三者都不建 job |
| 對應 | 02 P1；寫 `jobs`，P1 寫 `books`、`chapters`、`paragraphs` |

### N-01c GET /books/:bookId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單本書基本資料 |
| Response | N-01a 的欄位，加 `genreProfile`（02 §5 的 JSON 原樣轉 camelCase）、`genreOverride`、其他沿用既有 `Document` 的欄位 |
| 對應 | `books` |

### N-01d DELETE /books/:bookId

| 項目 | 內容 |
| --- | --- |
| 用途 | 刪書；單一 SQLite 檔，同一交易刪除該書所有列（01 §1 的理由） |
| Response | 204；有非終態 job → `409 job_conflict`（帶 `jobId`）。同時刪掉該書各 job 的審閱 checkpoint；上傳的原始檔（`var/uploads/`）不刪 |
| 對應 | 01 §2 所有帶 `book_id` 的表 |

### N-01e GET /books/:bookId/chapters

| 項目 | 內容 |
| --- | --- |
| 用途 | 章節清單：證據篩選的章節下拉、view 的章節軸 |
| Response | `[{number, title, role, paragraphCount, firstParagraphId}]`；`role` 沿用 `ChapterRole` |
| 對應 | `chapters` |

### 4.2 入庫（畫面 2）

### N-02a GET /books/:bookId/ingest

| 項目 | 內容 |
| --- | --- |
| 用途 | 入庫步驟條與單位統計 |
| Response | `jobId`、`jobStatus`、`steps[{step, state, startedAt, finishedAt, runId}]`、`units{s1a, s1b, s4a: {total, done, failed, pending}}`、`failedUnits[{stage, unitId, chapter, error}]`、`genreProfile` |
| 說明 | `steps[].state`：`pending`／`running`／`done`／`failed`／`skipped`／`paused`；`runId` 是該入庫步驟的 run（`refId=ingest.s2` 等；P1、審閱、S1 沒有 run）。原型決定：已經走過的 S2–S4 沒有 run＝`skipped`，S5 沒有 `result.s5`＝`skipped`；job 為 `cancelled` 時當下那一步標 `failed`。`units.*.pending` 含執行中的單位 |
| 對應 | `jobs`、`ingest_units`、`runs`；02 §1、§7 |

### N-02b GET /books/:bookId/ingest/units

| 項目 | 內容 |
| --- | --- |
| 用途 | 單位格狀圖（完成、失敗、暫停） |
| Query | `stage`（必填：`s1a`／`s1b`／`s4a`）、`status?`、`chapter?`；分頁。依書中順序（章、單位第一段的位置） |
| Response | `items[{unitId, stage, chapter, firstParagraphPosition, status, attempts, model, promptVersion, error}]` |
| 說明 | `status`：`pending`／`running`／`done`／`failed`（01 §8）。job 為 `paused_quota` 時 UI 把非 done 的格子畫成「暫停」，不另存狀態 |
| 對應 | `ingest_units` |

### N-02c GET /books/:bookId/ingest/units/:unitId

| 項目 | 內容 |
| --- | --- |
| 用途 | 開發者檢視：看一個單位的原始 LLM 輸出 |
| Query | `stage`（必填） |
| Response | N-02b 的單筆欄位，加 `paragraphIds[]`、`contextParagraphId`（02 §2 的 `context_only` 段）、`rawOutput`（S1／S4a 輸出的 JSON 原樣，**不轉 camelCase**，因為它是 prompt 的輸出格式） |
| 對應 | `ingest_units`、`ingest_unit_outputs`（01 §8） |

### N-02d GET /books/:bookId/review-data

| 項目 | 內容 |
| --- | --- |
| 用途 | 章節審閱資料；只在 job 為 `awaiting_review` 時有效 |
| Response | 與既有 #22a 相同：`chapters[{chapterIdx, title, role, paragraphs[{paragraphIndex, text, role, titleSpan, sentences}]}]` |
| 錯誤 | 409 `review_not_open`／`review_closed`／`review_submitted`（語意同既有 #22a） |
| 對應 | `chapters`、`paragraphs`；02「章節審閱」沿用 `ingestion_graph.py` |

### N-02e POST /books/:bookId/review

| 項目 | 內容 |
| --- | --- |
| 用途 | 提交章節審閱，job 從 `awaiting_review` 回到 `running` 繼續 S1 |
| Request | 與既有 #22b 相同：`chapters?`、`roleOverrides`、`paragraphSplits`；省略 `chapters`＝接受系統判斷 |
| Response | 204；409 同 N-02d；503 `core_extraction` 沒有模型 |
| 說明 | 原型只做簡化版（05 畫面 2），既有 #22c 建議角色、#22d 解析目錄不搬 |
| 對應 | 寫 `chapters`、`paragraphs` |

### N-02f POST /books/:bookId/ingest/units/retry

| 項目 | 內容 |
| --- | --- |
| 用途 | 單獨重跑失敗單位（02 §7「完成時列出失敗單位，可單獨重跑」） |
| Request | `{stage, unitIds?}`；省略 `unitIds`＝該 stage 全部 `failed` 的單位 |
| Response 202 | `{jobId}`（`kind=ingest_retry`） |
| 說明 | 重跑後自動重做該 stage 之後的整併（S1 單位 → S2；S4a 單位 → S4b），因為整併是書層級的。重做整併會產生新的第 1 層 run → 觸發 `basis.changed`（02 §7 最後一列） |
| 錯誤 | 409 `job_conflict`；503 |
| 對應 | `ingest_units`、`ingest_unit_outputs`、`evidence*`、`runs` |

### N-02g POST /books/:bookId/ingest/rerun

| 項目 | 內容 |
| --- | --- |
| 用途 | 從某一步起重跑：換模型重跑第 1 層、或只調整整併規則重跑 S2（02 §4「S2 不叫 LLM，可在本機快速重跑」） |
| Request | `{fromStep}`：`s1`／`s2`／`s3`／`s4`／`s5` |
| Response 202 | `{jobId, willReextract: bool}`；`willReextract=true` 表示第 1 層會被取代、下游全部標「依據已變動」，UI 應先提示 |
| 錯誤 | 409 `job_conflict`；503 只在 `fromStep` 會用到 LLM 時檢查（`s2` 不檢查） |
| 對應 | 02 §4、§7；寫 `runs`、`evidence*`；觸發 01 §4 傳播 |

### N-02h PUT /books/:bookId/genre-override

| 項目 | 內容 |
| --- | --- |
| 用途 | 改主題材（02 §5） |
| Request | `{genre}`（契約 v2 視角表的 10 種）；`null`＝取消覆寫，回到系統判定 |
| Response 200 | `{effectiveGenre, jobId \| null, unsupportedMechanisms[]}` |
| 說明 | 只對新增的主機制補跑 S4（不重讀全文），完成後跑新視角的預設卡（`kind=genre_s4`）。**原型只實作資訊控制機制的 S4**（02 §6）：新主機制不是資訊控制時，不建 job，列進 `unsupportedMechanisms`，通用層的卡照常可用。舊題材已跑的卡與證據不刪（02 §5） |
| 錯誤 | 422 題材不在清單；409 `job_conflict` |
| 對應 | 寫 `books.genre_override`；02 §5、§6、§8 |

### 4.3 書籍總覽（畫面 3）

### N-03a GET /books/:bookId/genre

| 項目 | 內容 |
| --- | --- |
| 用途 | 題材判定卡 |
| Response | `primary`、`mixed[{genre, score, chapters}]`、`mechanismDensity{}`（key 是機制名，不轉換）、`rationale`、`detectedBy`、`detectedAt`、`override`、`effectiveGenre` |
| 對應 | `books.genre_profile`、`books.genre_override`；02 §5 |

### N-03b GET /books/:bookId/cards

| 項目 | 內容 |
| --- | --- |
| 用途 | 自動分析的結果卡格 |
| Response | `Card[]`（§2.4），依 registry 的視角順序；推理書為 5 張（03 §5） |
| 說明 | 卡片狀態由該 `refId` 最新 run 推得：無 run＝`not_run`；有 queued／running 的 run，或有該方法未結束的 `method_run` job＝`running`；`done` 且各 scope 最新 run 的 current 證據有 `basisChanged=true`＝`basis_changed`；`cancelled` 的 run 當 `failed`；其餘照 run 狀態。`maxLevel` 取各 scope 最新 run 的 current 證據。即時更新靠 N-09f 的 `run.status` |
| 對應 | `registry/perspectives/*.yaml`、`runs`、`evidence` |

### N-03c GET /books/:bookId/askable

| 項目 | 內容 |
| --- | --- |
| 用途 | 「也可以問」清單與其他題材訊號推薦 |
| Response | `askable[{refId, code, question, refKind, layer, mechanism, grade, priority, implemented, precheck}]`；`otherSignals[{mechanism, density, chapters, suggestedQuestion, supported}]` |
| 說明 | `askable`＝registry 所有 `question` 扣掉 N-03b 已列的（03 §5）；方法論一律 `implemented=false`（方法論執行器不做）。`precheck` 是不叫 LLM 的前提檢查：原型只檢查「要讀的第 1 層類型這本書沒有、方法也補不出來」（`plan_method` 的缺項），方法自己的 `check()`（數量門檻等）在 job 裡才跑。`otherSignals[].chapters`＝S1b 輸出裡有這個機制訊號的章；主機制原型只定義推理＝`info_control`。`otherSignals` 來自 `genre_profile` 中非主機制、密度 > 0 的機制；`supported=false` 對應 05 §3.1「尚未支援」。`suggestedQuestion` 取自 `registry/perspectives/mechanisms.yaml`（03 §5） |
| 對應 | registry、`books.genre_profile` |

### 4.4 Run 與方法執行（畫面 3、4）

### N-04a POST /books/:bookId/runs

| 項目 | 內容 |
| --- | --- |
| 用途 | 觸發一個方法或方法論：點結果卡、點「也可以問」 |
| Request | `{refId, subjectIds?, params?, force?: false, dryRun?: false}` |
| Response 200／202 | `{status, jobId?, runId?, plan[], precheck?, notImplemented[]}`。`status`：`queued`（202，新 job）／`attached`（已有同一分析在跑，§3.3）／`reused`（已有 current 的 done run 且依據未變動，直接回 `runId`；`force=true`、或帶了 `subjectIds`／`params` 時不重用）／`not_applicable`（前提不成立，不叫 LLM，回 `precheck`）／`not_implemented`（原型決定：原型尚未支援的方法，200、不建 job、不算錯誤）／`planned`（`dryRun=true`）。`notImplemented[]` 列出會被跳過的方法 |
| 說明 | `plan[]`＝要跑的方法 id，依 DAG 排序，含上游自動補跑（一致性規則 7）。`subjectIds` 覆寫 03 的 `scope_selector`（例如只跑某個角色），不給就照宣告。`dryRun` 讓 UI 在花 token 前顯示會跑哪些（03 §3「花 token 之前說清楚」） |
| 錯誤 | 422 `unknown_ref`；409 `job_conflict`（入庫未完成）；503 |
| 對應 | 03 §3、§6（`plan`／`check`／`run`）；寫 `jobs`、`runs`、`evidence*` |

### N-04b GET /books/:bookId/runs

| 項目 | 內容 |
| --- | --- |
| 用途 | 列出 run（結果卡詳情的歷史、開發者檢視） |
| Query | `refId?`、`status?`、`includeSuperseded?: false`、`includeIngest?: false`；分頁 |
| Response | `items: Run[]`（不含 `params`、`inputEvidenceIds`），依建立時間新到舊。`summary`、`precheck` 的 key 轉 camelCase |
| 對應 | `runs` |

### N-04c GET /books/:bookId/runs/:runId

| 項目 | 內容 |
| --- | --- |
| 用途 | 結果卡詳情的標頭（05 §3.2：方法、依據、等級、run、模型、prompt 版本、時間） |
| Response | 完整 `Run`（§2.2），含 `stepRuns: Run[]`（方法論的步驟與上游補跑） |
| 說明 | 證據列表另呼叫 N-05a（`runId=`），view 資料呼叫 N-04e |
| 對應 | `runs` |

### N-04d POST /books/:bookId/runs/:runId/rerun

| 項目 | 內容 |
| --- | --- |
| 用途 | 結果卡的「重跑」：同 `refId`、`scopeKey`、`params` 再跑一次 |
| Request | `{rerunUpstream?: false}`；`true` 時連上游一起重跑 |
| Response 202 | `{jobId}` |
| 說明 | 新 run 成功後舊 run 的證據變 `superseded`（01 §4）；被筆記引用的保留。用目前的 registry 版本與模型設定，與舊 run 不同時 run 上會看得出來。原型決定：回應與 N-04a 相同形狀（`status`＝`queued`／`attached`／`not_applicable`…）；主體取自舊 run 的 `scopeKey`（每章一筆的方法會重跑該角色的所有章）；`rerunUpstream=true` 尚未支援，回 422 |
| 錯誤 | 409；503 |
| 對應 | 03 §3；01 §4 取代規則 |

### N-04e GET /books/:bookId/view-data

| 項目 | 內容 |
| --- | --- |
| 用途 | view 卡片取資料（05 §4「view 自己向後端取資料」）；結果卡詳情與 agent 的 `show_view` 共用 |
| Query | `viewType`，加 `runId` 或 `evidenceIds`（逗號分隔，最多 200）二擇一；`includeL1?` |
| Response | `{viewType, primary: Evidence[], referenced: [{id, claimType, level, label, discourseChapter}], chapters: [{number, title}]}` |
| 說明 | `primary`＝run 產出的 current 證據（排除 rejected），或指定的證據（照請求順序，superseded／rejected 照實回）；都含 `content`。`referenced`＝`primary` 的 `content` 裡所有 `*_id`／`*_ids` 指到的證據，**只展開一層**，只回畫標籤要的欄位；`label` 取 `character.canonical_name`、`event.title`、`imagery_motif.term`，其餘取 `summary` *（推得）*。view 的形狀（圖、矩陣）由前端從這些證據組，後端不做 view 專屬轉換 |
| 錯誤 | 422 `viewType` 不在 05 §4 目錄 |
| 對應 | `evidence`、`ev_*`、`runs`；05 §4 |

### 4.5 證據（畫面 4、7）

### N-05a GET /books/:bookId/evidence

| 項目 | 內容 |
| --- | --- |
| 用途 | 證據瀏覽（畫面 7）、結果卡的證據列表（畫面 4） |
| Query | `claimType`（可多個）、`minLevel?`、`maxLevel?`、`reviewStatus?`、`status?: current`、`basisChanged?`、`chapterFrom?`、`chapterTo?`、`runId?`、`subjectId?`、`source?`、`q?`、`includeL1?: false`、`withContent?: false`、`sort?`（`chapter`／`level`／`confidence`／`createdAt`）；分頁 |
| Response | `items: EvidenceListItem[]` |
| 說明 | `q` 走 `evidence_fts`（FTS5，summary＋引文），整串當一個 phrase 比對（使用者輸入的 FTS5 語法字元不生效）；沒指定 `sort` 時依 FTS rank 排序。原型決定：trigram 搜不到少於 3 個字的查詢，這時改對 summary 與引文做子字串比對。可見範圍見 §1.4 |
| 對應 | `evidence`、`evidence_subject`、`evidence_quote`、`evidence_fts` |

### N-05b GET /books/:bookId/evidence/:evidenceId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單筆證據（含引文、題材擴充、修改紀錄） |
| Response | `Evidence`（§2.1），加 `edits[{editedAt, action, reason, before}]`（`evidence_edits`：`action`＝`modify`／`reject`，`before` 是原值，`reason` 是拒絕理由） |
| 說明 | 第 1 層證據可直接以 id 讀（追溯時點進來），不受 `includeL1` 限制；它只是不出現在列表裡 |
| 對應 | `evidence`、`ev_*`、`evidence_quote`、`evidence_genre_ext`、`evidence_subject`、`evidence_link`、`evidence_edits` |

### N-05c GET /books/:bookId/evidence/:evidenceId/trace

| 項目 | 內容 |
| --- | --- |
| 用途 | 追溯樹（05 §3.2「▾ 追溯」），沿 `derived_from` 往上游展開到第 1 層 |
| Query | `depth?`（預設展到第 1 層為止，上限 6）、`direction?: upstream`（`downstream`＝誰引用了它，供「依據已變動」說明） |
| Response | `{root, nodes[{id, kind: evidence／run, claimType, level, summary, reviewStatus, basisChanged, discourseChapter, firstQuote}], edges[{from, to}]}` |
| 說明 | 同類型多筆時前端可收合成「clue_points_to ×4」，後端不合併。run 節點顯示 `refId`、`code` |
| 對應 | `evidence_link`、`evidence`、`runs` |

### N-05d GET /books/:bookId/paragraphs/:paragraphId

| 項目 | 內容 |
| --- | --- |
| 用途 | 「↗原文」側板：段落原文並高亮引文 |
| Query | `context?: 0`（前後各帶幾段，上限 3）、`highlightEvidenceId?` |
| Response | `{paragraph, before[], after[], highlights[{evidenceId, seq, start, end, verified}]}`；段落欄位沿用既有 `Paragraph`（含 `ParagraphRole`、所屬章） |
| 說明 | `highlights` 只回 `highlightEvidenceId` 那筆證據落在本段的引文，沒帶就是空的。`before`／`after` 照全書順序取，會跨章。`verified=false` 的引文仍回傳位置（若有），UI 標「引文未對上原文」（01 §3） |
| 對應 | `paragraphs`、`evidence_quote` |

### N-05e POST /books/:bookId/evidence/:evidenceId/review

| 項目 | 內容 |
| --- | --- |
| 用途 | 審核第 2 層以上的證據：確認、修改、拒絕（01 §7、契約 v2 決策 #8） |
| Request | `{action: "approve"}`；`{action: "modify", summary?, content: {…部分內容欄位}}`；`{action: "reject", reason?}`（`reason` 存 `evidence_edits`，01 §7） |
| Response 200 | `{evidence: Evidence, propagation?: {evidenceCount, noteCount}}` |
| 規則 | 第 1 層 → `403 level1_readonly`。`modify` 的 `content` 只能改 01 §6 的內容欄位（不是該類型的欄位 → 422），且**不能改 `*_id`／`*_ids` 參照欄位**（改了等於改 `derived_from`，層級會變；原型決定，違反 → 422）；原值寫 `evidence_edits`，`reviewStatus=modified`。`reject` 同步做 01 §4 的反向 BFS，完成後發 `basis.changed`。狀態轉移：`pending`／`approved`／`modified` 可互轉或轉 `rejected`；`rejected` 為終態（原型決定，再審 → `409 invalid_state`） |
| 對應 | `evidence.review_status`、`ev_*`、`evidence_edits`、`evidence.basis_changed`（下游） |

### 4.6 筆記（畫面 4、5、6）

原型範圍（T23，2026-11-17，使用者決定）：N-06c 只做 `origin=draft` 以外的 `origin=run`（`draft` 回 422，T25／T27 補）；N-06d 只支援 `methodologyTrace.kind=ui_run`，回應用 N-04a 的 `TriggerOut` 形狀（含 `jobId`、`status`）；`methodologyTrace` 在 REST 回應裡和其他內容欄位一樣轉 camelCase。筆記與詮釋的 `confidence` 記 1.0（使用者已確認）。引用不在本書或一筆都沒有時回 `422 validation_error`。

### N-06a GET /books/:bookId/notes

| 項目 | 內容 |
| --- | --- |
| 用途 | 筆記列表（畫面 6） |
| Query | `basisChanged?`、`producedVia?`（`ui`／`agent`）、`q?`；分頁 |
| Response | `items[{id, title, question, level, basisChanged, producedVia, agentBackend, citedCount, createdAt}]` |
| 對應 | `evidence`（`claim_type=note`）、`ev_note` |

### N-06b GET /books/:bookId/notes/:noteId

| 項目 | 內容 |
| --- | --- |
| 用途 | 打開筆記：結論、引用證據、方法論 trace |
| Response | `Evidence`（`content` 為 01 §5 的 `title`、`conclusion`、`methodologyRunId`、`methodologyTrace`、`question`），加 `cited: EvidenceListItem[]`（即 `derived_from` 展開一層，可能含 superseded，照實標示）、`interpretations: EvidenceListItem[]`（引用此筆記的詮釋） |
| 對應 | `evidence`、`ev_note`、`evidence_link`、`ev_interpretation` |

### N-06c POST /books/:bookId/notes

| 項目 | 內容 |
| --- | --- |
| 用途 | 建立筆記。兩種來源，**都是使用者在 UI 按下確認才會呼叫**；agent 不能呼叫（它只有 MCP，01 §5） |
| Request（從 run） | `{origin: "run", fromRunId, title, conclusion, citedEvidenceIds[]}`（用 `fromRunId` 而不是 `runId`，因為 `runId` 是禁止出現的系統欄位名） |
| Request（從草稿） | `{origin: "draft", sessionId, draftId, title?, conclusion?, citedEvidenceIds?}`；帶了任一欄位＝使用者確認前改過 |
| Response 201 | `{note: Evidence}`；從草稿時同時把草稿標 `confirmed` 並發 AgentEvent `note_draft`（`op=confirmed`） |
| 規則 | (1) `citedEvidenceIds` 全部 `level ≥ 2`，否則 `422 note_cites_level1`；(2) 不得有 `rejected`，否則 `422 note_cites_rejected`（01 §5）；(3) 所有 id 屬於本書。使用者按確認本身就是審核，不要求先確認個別證據（01 §5） |
| 系統補上 | `level`＝引用最高層＋1；`source`（從 run＝`method`、從草稿＝`agent`，01 §5）；`producedVia`（`ui`／`agent`）；`agentBackend`（從草稿時取 session）；`reviewStatus`（從 run＝`approved`；從草稿：未改＝`approved`、改過＝`modified`）；`derivedFrom`＝`citedEvidenceIds`（從草稿時已在 §5.5 驗過）；`methodologyRunId`（從 run＝`fromRunId`；從草稿＝null，以 `methodologyTrace` 為準，01 §5）；`methodologyTrace`（從 run＝run 樹的執行紀錄；從草稿＝§5.6 的 trace 片段）；`question`（從 run＝run 的 `question`；從草稿＝草稿的 `question`） |
| 對應 | 寫 `evidence`、`ev_note`、`evidence_link`、`evidence_fts`；更新 `agent_sessions`（草稿狀態） |

### N-06d POST /books/:bookId/notes/:noteId/rerun

| 項目 | 內容 |
| --- | --- |
| 用途 | 筆記重跑（05 成功條件 3、架構文件階段二通過條件） |
| Request | `{}` |
| Response 202 | `{jobId}`；job 完成時 `result.runIds[]` |
| 說明 | 筆記本身**不變、不被取代**（契約 v2）。兩種模式依 `methodologyTrace.kind`：`ui_run` → 以同 `refId`、`params`、`scopeKey` 重跑（同 N-04d）；`mcp` → 依序重放 trace 裡的 `run_method` 呼叫（同參數），讀取類呼叫不重放（它們是決定性的）。UI 用 `result.runIds` 打開新結果與筆記並排比較。重跑結果不寫回筆記，只在 job 的 `result.runIds`（01 §5 原型決定） |
| 錯誤 | 409；503 |
| 對應 | `ev_note.methodology_trace`、`runs`；架構文件「使用者自訂方法論的重跑：依 note 的 trace 重放」 |

### N-06e POST /books/:bookId/interpretations

| 項目 | 內容 |
| --- | --- |
| 用途 | 使用者寫詮釋（契約 v2 決策 #6「存成證據時標明來源是使用者」）；05 畫面 6 筆記詳情的「加詮釋」輸入框 |
| Request | `{text, citedEvidenceIds[]}` |
| Response 201 | `{interpretation: Evidence}` |
| 規則 | 引用至少一筆、全部 `level ≥ 2`（第 1 層不給一般使用者直接用，與筆記一致；原型決定） |
| 系統補上 | `level`、`source=user`、`producedVia=ui`、`reviewStatus=approved`、`derivedFrom` |
| 對應 | 寫 `evidence`、`ev_interpretation`、`evidence_link`、`evidence_fts` |

### 4.7 Registry（畫面 8）

Registry 從 YAML 載入、唯讀（使用者方法論除外），回應把 YAML 的 snake_case key 轉 camelCase，值不轉。

### N-07a GET /registry/methods

| 項目 | 內容 |
| --- | --- |
| 用途 | 方法清單 |
| Query | `layer?`、`mechanism?` |
| Response | `[{id, code, version, layer, mechanism, question, basis, grade, produces, requires[], preconditions[], scope, scopeSelector, view, implKind, llmTask, priority, implemented}]` |
| 說明 | `implemented` *（推得）*：`impl.module` 能匯入且實作了 Method 介面（03 §6）。`priority` 取自 YAML（03 §1） |
| 對應 | `registry/methods/*.yaml` |

### N-07b GET /registry/methods/:methodId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單一方法的完整宣告（03 §1 的全部 key，含 `impl.prompt`、`impl.config`） |
| Response | 宣告內容，加 `usedByMethodologies[]`、`downstreamMethods[]` *（推得自 DAG）* |
| 對應 | `registry/methods/*.yaml` |

原型（T23）：N-07c／d 只回內建方法論（`registry/methodologies/*.yaml`），每筆加 `implemented`（原型沒有方法論執行器，都是 `false`）；N-07e 在 T27。

### N-07c GET /registry/methodologies

| 項目 | 內容 |
| --- | --- |
| 用途 | 方法論清單：內建（TM3、MY2）＋使用者存下的 |
| Response | `[{id, code, version, owner, question, grade, steps[], synthesis?, view}]` |
| 對應 | `registry/methodologies/*.yaml`、`methodologies` 表 |

### N-07d GET /registry/methodologies/:methodologyId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單一方法論的宣告 |
| 對應 | 同上 |

### N-07e POST /registry/methodologies

| 項目 | 內容 |
| --- | --- |
| 用途 | 把 agent 的臨時組合另存成使用者方法論（契約 v2 路徑二「這個臨時組合可以另存成新的方法論，與存成筆記是兩件不同的事」） |
| Request | `{question, steps[{method, input?}]}`、`{fromNoteId, question}`（從筆記的 `mcp` trace 抽出 `run_method` 順序），或 `{fromSession: {sessionId, turnId}, question}`（Agent 工作區結果上的「另存方法論」，取該輪的 `run_method` 順序，05 §3.3） |
| Response 201 | 方法論宣告；系統補 `id`（`user.<slug>`）、`owner=user`、`grade=使用者自建`、`version=1` |
| 規則 | 步驟只能是已登錄的方法或方法論（契約 v2 風險表）；存前跑 03 §2 的 DAG 檢查。沒有 `synthesis`，產出是筆記（03 §1） |
| 說明 | 05 畫面 8 的「另存方法論」（P1）；方法論開放給誰建是契約 v2 待決問題 |
| 對應 | 寫 `methodologies` |

### N-07f GET /registry/dag

| 項目 | 內容 |
| --- | --- |
| 用途 | 證據 DAG 圖 |
| Response | `{nodes[{id, kind: claim_type／method／methodology, layer, mechanism, level?}], edges[{from, to, kind: requires／produces／step}]}` |
| 說明 | `claim_type` 節點的 `level` 依 01 §6 表格（第 1 層類型＝1，產出類型取 01 標的層級） |
| 對應 | registry 啟動時算出的 DAG（03 §2 規則 4） |

### N-07g GET /registry/views

| 項目 | 內容 |
| --- | --- |
| 用途 | view 目錄與視角設定 |
| Response | `{viewTypes[{viewType, usedBy[]}], perspectives[{genre, cards[{refId, question}]}]}` |
| 對應 | 05 §4、`registry/views/*.yaml`、`registry/perspectives/*.yaml`（03 §1、§5） |

### 4.8 設定（畫面 9）

設定存 `var/settings.yaml`（01 §1），API 只讀寫它。主題與開發者檢視開關存前端 `localStorage`，沒有端點；開發者檢視只影響前端是否帶 `includeL1=true`。

### N-08a GET /settings/llm

| 項目 | 內容 |
| --- | --- |
| 用途 | provider → model → task 三層設定（架構文件「Pipeline 模型配置」） |
| Response | `providers[{name, type, apiKeyEnv, configured, via?, baseUrl?, riskNotice?}]`、`models[{name, provider, modelId, caps[]}]`、`tasks[{task, model, fallback[], requires[], capsOk}]` |
| 說明 | **不回傳 key 本身**，只回環境變數名與 `configured`（該變數是否有值）。`type=subscription` 帶 `riskNotice`（架構文件「設定畫面需提示」）。`capsOk=false`＝task 的 `requires` 與模型 `caps` 不符。task 清單＝02 §11 的 5 個入庫 task ＋ 03 方法用到的 `llm_task`。`modelId` 用 LangChain `init_chat_model` 的 `<整合>:<模型>` 字串（如 `google_genai:gemini-2.5-flash`），整合由前綴決定，provider 只管憑證；`type=openai_compatible` 與 `type=subscription` 的整合由 `type`／`via` 決定，`modelId` 不帶前綴。`var/settings.yaml` 不存在時讀 repo 的 `config/settings.default.yaml`（只有 Gemini），不自動建檔；N-08b 才寫入 `var/` |
| 對應 | 設定檔 |

### N-08b PUT /settings/llm

| 項目 | 內容 |
| --- | --- |
| 用途 | 更新三層設定 |
| Request | 與 N-08a 相同形狀；推得欄位（`configured`、`riskNotice`、`capsOk`）可以帶回來，不採用；其他多出來的 key → 422。provider 只能填環境變數名，**帶 key 值 → 422**（錯誤訊息不回顯輸入值）。`model=null` 的 task 不寫入。設定檔裡這個端點不管的頂層 key（如 `brain:`）保留 |
| Response | 同 N-08a |
| 錯誤 | 422：task 指到不存在的 model、caps 不符 |
| 對應 | 設定檔 |

### N-08c POST /settings/llm/test

| 項目 | 內容 |
| --- | --- |
| 用途 | 初次啟動測試：每個模型跑連線、structured output、延遲三項 |
| Request | `{models?: []}`；省略＝全部 |
| Response 202 | `{jobId}`（`kind=llm_test`）；`result.rows[{model, provider, connect, structuredOutput, latencyMs, error, affectedTasks[]}]`、`result.noUsableModel`（true 時 UI 引導 Ollama／vLLM） |
| 對應 | 架構文件「初次啟動測試」、05 §6 |

### N-08d GET /settings/llm/test/latest

| 項目 | 內容 |
| --- | --- |
| 用途 | 設定頁載入時顯示上次測試表 |
| Response | `{llmTest, brainTest}`：最近一次 `done` 的 `llm_test`／`brain_test` job 的 `{result, finishedAt}`；沒測過是 `null` |
| 對應 | `jobs` |

### N-08e GET /settings/brain

| 項目 | 內容 |
| --- | --- |
| 用途 | 大腦設定 |
| Response | `{defaultBackend: none／deepagents／claude-code, deepagents: {model}, claudeCode: {launchCommand, available}}` |
| 說明 | `launchCommand` 預設 `npx -y @agentclientprotocol/claude-agent-acp`（05 §5.2）；`available` 是上次 claude-code 大腦測試是否全部通過，沒測過是 `null`。原型決定（T25）：`deepagents.model` 就是 N-08a 的 `tasks.brain.model`（`models` 的 key）；其餘存在設定檔的 `brain:` 區塊（`default_backend`、`claude_code.launch_command`） |
| 對應 | 設定檔 |

### N-08f PUT /settings/brain

| 項目 | 內容 |
| --- | --- |
| 用途 | 更新大腦設定 |
| Request | N-08e 去掉 `available` |
| 說明 | StorySphere 不碰 Claude Code 憑證，這裡沒有任何登入欄位（05 §5.2） |
| 對應 | 設定檔 |

### N-08g POST /settings/brain/test

| 項目 | 內容 |
| --- | --- |
| 用途 | 「大腦」那一列的測試（05 §6） |
| Request | `{backend: deepagents／claude-code}` |
| Response 202 | `{jobId}`（`kind=brain_test`）；`result.checks[{check, ok, detail}]`，`check` 值：deepagents＝`session`、`tool_call`；claude-code＝`npx`、`adapter`、`login`、`session`、`tool_call` |
| 說明 | `tool_call`＝開一個暫時 session，請大腦呼叫一次 `list_genre_elements`，以 `trace_calls` 有這筆為準。原型決定（T25）：session 用書庫裡最早上傳的書，沒有書時只回一項 `session` 不通過；測完關掉 session；`result` 另帶 `backend`。claude-code 的順序是 `npx`（啟動命令找得到）→ `login`（`claude auth status`）→ `adapter`（子 process 啟動、建 session）→ `session` → `tool_call`，前面有一項失敗就停（T26） |
| 對應 | Agent Gateway、`agent_sessions`、`trace_calls` |

### 4.9 工作中心（側欄抽屜）

### N-09a GET /jobs

| 項目 | 內容 |
| --- | --- |
| 用途 | 工作中心列表 |
| Query | `bookId?`、`recentLimit?: 20` |
| Response | `Job[]`：所有非終態＋最近 `recentLimit` 筆終態，依 `createdAt` 新到舊（沿用既有 #8c） |
| 對應 | `jobs` |

### N-09b GET /jobs/:jobId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單一 job 狀態（SSE 的輪詢備案） |
| Response | `Job` |
| 對應 | `jobs` |

### N-09c GET /jobs/:jobId/events

| 項目 | 內容 |
| --- | --- |
| 用途 | 單一 job 的 SSE（§3.4、§3.5） |
| Query | `after?` 或 `Last-Event-ID` |
| 說明 | job 進入終態後送最後一個 `job.status` 並關閉串流 |
| 對應 | 記憶體事件緩衝、`jobs` |

### N-09d POST /jobs/:jobId/cancel

| 項目 | 內容 |
| --- | --- |
| 用途 | 取消 |
| Response | 204；已終態 → `409 invalid_state` |
| 說明 | 先停下背景工作再標 `cancelled`。入庫類 job 取消時刪除 LangGraph checkpoint（沿用既有 #8b；取消是終態，不會再續跑）；執行中的單位退回 `pending`、該 job 還在跑的 run 標 `cancelled`。已完成的單位與已寫入的證據保留 |
| 對應 | `jobs`、`ingest_units` |

### N-09e POST /jobs/:jobId/resume

| 項目 | 內容 |
| --- | --- |
| 用途 | 續跑 `paused_quota`／`interrupted` 的 job（02 §7） |
| Response 202 | `{jobId}`（同一個 id） |
| 錯誤 | 其他狀態 → `409 invalid_state`；503（`ingest` 的 `core_extraction` 沒有模型時；額度沒恢復時 job 會再進 `paused_quota`，不是 503）。原型只支援續跑 `ingest` 與 `method_run`，其他種類回 409 |
| 對應 | `jobs`、`ingest_units` |

### N-09f GET /books/:bookId/events

| 項目 | 內容 |
| --- | --- |
| 用途 | 整本書的 SSE：該書所有 job 的事件，加 `basis.changed` |
| 說明 | 書籍總覽（卡片狀態）、入庫頁（單位格、即時事件串）、筆記頁（依據已變動）都訂這一條 |
| 對應 | 同 N-09c |

### 4.10 Agent Gateway（畫面 5）

對應架構文件的 `AgentBackend` Protocol：`start_session` → N-10a、`send` → N-10d、`events` → N-10e、`resolve_approval` → N-10f、`cancel` → N-10g。「無大腦」＝不開 session，畫面 5 停用。

原型決定（T25，2026-11-17，見 `docs/plans/20261117-t25-gateway-deepagents.md`）：

- **Gateway 的位置**：`gateway/service.py`（組裝、輪次、確認、關閉）；後端只負責「跑一輪」（`gateway/base.AgentBackend`：`start`、`send`、`close`）。`text_delta` 由後端串流、`done`／`error` 由 Gateway 發，其餘 AgentEvent 由 MCP server 發。
- **SSE 的訊框**：`id`＝串流的 `seq`、`event`＝`type`，`data`＝`{sessionId, turnId, ts, data}`（§5.1 信封的其餘欄位）。
- **skills**：放 repo 根目錄 `skills/<name>/SKILL.md`；開 session 時複製到 `var/agent_sessions/<sessionId>/skills/`（環境變數 `STORYSPHERE_AGENT_DIR` 可改）。`event-analysis`、`character-analysis` 一律給；`mystery-fair-play` 只給 `genre=mystery`（05 §5.3）。
- **`allowedTools`**：L0＝§5.2 的 14 個 MCP 工具。
- **大腦連回 MCP 的位址**：環境變數 `STORYSPHERE_MCP_URL`，預設 `http://127.0.0.1:8000/mcp`。
- **N-10a**：`backend` 沒有對應後端（T25 只有 deepagents）→ 422；`model` 是 N-08a `models` 的 key。
- **伺服器重啟**：上次沒關的 session 一律標 `closed`（大腦已不在，token 跟著作廢）。deepagents 的對話記憶只在記憶體。
- **N-10f**：`requestId` 不屬於這個 session → 404；已回應 → 409。

### N-10a POST /agent/sessions

| 項目 | 內容 |
| --- | --- |
| 用途 | 開 session：選大腦、書、題材 |
| Request | `{backend: deepagents／claude-code, bookId, genre?, model?}`；`genre` 省略＝`effectiveGenre`；`model` 只對 deepagents 有效，省略＝N-08e 的設定 |
| Response 201 | `{sessionId, backend, bookId, genre, model, skills[], allowedTools[], permissionLevel: "L0", status}` |
| 說明 | Gateway 做三件事（架構文件「組裝 session」）：依題材挑 skills 寫進 session 工作目錄（05 §5.3：`event-analysis`、`mystery-fair-play`）；產生 session token 帶進 MCP 連線（token 不回給 UI）；依 L0 關掉大腦自帶的 shell、寫檔、抓網頁工具。`status`：`starting`／`ready`／`busy`／`closed`／`error` |
| 錯誤 | claude-code 啟動失敗 → 201 但 `status=error`，原因走 SSE `error` 事件；deepagents 的模型 task 未設定 → 503 |
| 對應 | 寫 `agent_sessions` |

### N-10b GET /books/:bookId/agent/sessions

| 項目 | 內容 |
| --- | --- |
| 用途 | 這本書的 session 列表（回到之前的對話） |
| Response | `[{sessionId, backend, model, status, createdAt, openDraftCount}]` |
| 對應 | `agent_sessions` |

### N-10c GET /agent/sessions/:sessionId

| 項目 | 內容 |
| --- | --- |
| 用途 | 單一 session 的設定、狀態、對話紀錄 |
| Response | N-10a 的欄位，加 `messages[{turnId, role: user／assistant, text, createdAt}]`、`lastSeq` |
| 說明 | 對話文字只是旁白（架構文件原則 3），存它只為了重新整理頁面時不空白；存在 `agent_sessions.messages_json`（01 §8） |
| 對應 | `agent_sessions` |

### N-10d POST /agent/sessions/:sessionId/messages

| 項目 | 內容 |
| --- | --- |
| 用途 | 送使用者訊息 |
| Request | `{text}` |
| Response 202 | `{turnId}`；回覆走 N-10e |
| 錯誤 | session `busy` → `409 invalid_state`；`closed` → `409 invalid_state` |
| 對應 | `AgentBackend.send` |

### N-10e GET /agent/sessions/:sessionId/events

| 項目 | 內容 |
| --- | --- |
| 用途 | AgentEvent 的 SSE（§5.1） |
| Query | `after?` 或 `Last-Event-ID`；規則同 §3.4 |
| 對應 | `AgentBackend.events`、MCP server |

### N-10f POST /agent/sessions/:sessionId/approvals/:requestId

| 項目 | 內容 |
| --- | --- |
| 用途 | 回應 `approval_request` |
| Request | `{allow: bool}` |
| Response | 204；請求已處理或不存在 → `409 invalid_state`／404 |
| 說明 | 原型不設逾時；取消或關閉 session 時未回應的請求一律視為拒絕 |
| 對應 | `AgentBackend.resolve_approval`；更新 `trace_calls.status` |

### N-10g POST /agent/sessions/:sessionId/cancel

| 項目 | 內容 |
| --- | --- |
| 用途 | 中止目前這一輪（不關 session） |
| Response | 204；沒有進行中的輪次 → `409 invalid_state` |
| 說明 | 已送出的 `run_method` job 不跟著取消（可能被 UI 或其他 session 共用，§3.3）；要停請到工作中心 |
| 對應 | `AgentBackend.cancel` |

### N-10h DELETE /agent/sessions/:sessionId

| 項目 | 內容 |
| --- | --- |
| 用途 | 關閉 session：結束 ACP 子 process、作廢 token |
| Response | 204 |
| 說明 | session 與 trace 保留（筆記重放、開發者檢視要用），`status=closed`；`open` 的草稿標 `discarded` |
| 對應 | `agent_sessions` |

### N-10i GET /agent/sessions/:sessionId/trace

| 項目 | 內容 |
| --- | --- |
| 用途 | 工具呼叫紀錄（畫面 5 收合的工具列、開發者檢視的原始 trace） |
| Query | 分頁 |
| Response | `items[{seq, turnId, tool, args, status, resultEvidenceIds[], resultRunIds[], jobId, approvalRequestId, errorCode, startedAt, durationMs}]` |
| 對應 | `trace_calls`（§5.6） |

### N-10j GET /agent/sessions/:sessionId/drafts

| 項目 | 內容 |
| --- | --- |
| 用途 | 本 session 的筆記草稿（重新整理後重畫草稿卡） |
| Response | `NoteDraft[]`（§2.5） |
| 對應 | `agent_sessions.drafts_json`（01 §8） |

### N-10k DELETE /agent/sessions/:sessionId/drafts/:draftId

| 項目 | 內容 |
| --- | --- |
| 用途 | 草稿卡的「捨棄」 |
| Response | 204；發 AgentEvent `note_draft`（`op=discarded`）；已確認 → `409 invalid_state` |
| 說明 | 「確認存成筆記」走 N-06c（`origin=draft`） |
| 對應 | `agent_sessions` |

## 5. Agent 事件與 MCP 工具

### 5.1 AgentEvent

信封：`{seq, sessionId, turnId, type, data, ts}`，SSE 的 `event` 欄位＝`type`。

| `type` | 來源 | `data` | 說明 |
| --- | --- | --- | --- |
| `text_delta` | 大腦串流 | `{text}` | 旁白文字 |
| `tool_call` | **MCP server** | `{callId, tool, args}` | 只從 MCP 端發，不解析各家 harness 的 log（架構文件原則 4）；`callId`＝`trace_calls` 的 seq |
| `tool_result` | MCP server | `{callId, ok, evidenceIds[], runIds[], jobId?, summary, errorCode?}` | `summary` 是一行人看的摘要（例「找到 12 筆」），完整回傳不推給 UI |
| `approval_request` | MCP server 或 ACP | `{requestId, callId?, tool, args, reason, origin: mcp／acp}` | `mcp`＝需要確認的 StorySphere 寫入工具；`acp`＝Claude Code 的 permission request。L0 白名單外的工具不發請求，Gateway 直接拒絕並記 `trace_calls.status=denied` |
| `view` | `show_view` | `{viewId, viewType, dataRef: {runId} 或 {evidenceIds[]}}` | **原型補充**。前端拿 `dataRef` 呼叫 N-04e |
| `note_draft` | `create_note`、`link_evidence`、N-06c、N-10k | `{op: created／updated／confirmed／discarded, draft: NoteDraft}` | **原型補充**。前端以 `turnId` 把同一輪的 `view` 與 `note_draft` 組成一個「結果」（05 §3.3） |
| `done` | 大腦 | `{stopReason: end_turn／cancelled／error}` | 一輪結束 |
| `error` | Gateway | `{code, message, retryable}` | `code` 例：`backend_start_failed`、`backend_crashed`、`llm_unconfigured`、`rate_limited` |

### 5.2 MCP 工具總覽

14 個：架構文件列出的 11 個，加 3 個補充（★）。

| 類別 | 工具 | 寫入？ | 需要使用者確認 | 背後 |
| --- | --- | --- | --- | --- |
| 讀取 | `search_evidence` | 否 | 否 | 同 N-05a 的查詢服務（FTS5） |
| 讀取 | `get_evidence` ★ | 否 | 否 | 同 N-05b、N-05c |
| 讀取 | `get_entity` | 否 | 否 | 同 N-05a（`claimType=character`）＋ N-05b |
| 讀取 | `get_events` | 否 | 否 | 同 N-05a（`claimType=event`） |
| 讀取 | `get_passage` | 否 | 否 | 同 N-05d |
| 讀取 | `list_genre_elements` | 否 | 否 | 同 N-03a ＋ registry ＋ 證據統計 |
| 讀取 | `list_methods` ★ | 否 | 否 | 同 N-03b、N-03c |
| 讀取 | `get_run` ★ | 否 | 否 | 同 N-04b、N-04c |
| 分析 | `run_method` | 是（經方法） | 否 | 同 N-04a |
| 分析 | `get_job_status` | 否 | 否 | 同 N-09b |
| 寫入 | `create_note` | 否（只產生草稿） | **一律**：草稿卡＋使用者按確認（非阻塞，不發 `approval_request`） | 草稿服務；確認走 N-06c |
| 寫入 | `add_interpretation` | 是 | **預設要**：發 `approval_request`，阻塞到使用者回應 | 同 N-06e 的寫入服務 |
| 寫入 | `link_evidence` | 否（只改草稿） | 否 | 草稿服務 |
| 呈現 | `show_view` | 否（只發 UI 事件） | 否 | Gateway 發 `view` 事件 |

補充工具的理由：

| 工具 | 為什麼需要 |
| --- | --- |
| `get_evidence` | 架構文件「文字預設截短、可用 id 再取全文」需要一個依 id 取全文的工具；另外大腦要能沿 `derived_from` 追溯，否則它說不出結論的原文依據 |
| `list_methods` | 契約 v2 路徑二要「對照各方法與方法論的 `question` 欄位與前提條件」挑方法，大腦沒有這張清單就只能猜 `method_id` |
| `get_run` | 自動觸發的 10 張結果卡已經跑過；沒有這個工具，大腦只能再 `run_method` 一次才拿得到結果 id |

共同規則：

- `book_id` 不是參數：由 session 決定，一個 session 只能碰一本書。
- 每個回傳都帶證據 `id` 與 `level`（架構文件「回傳帶 evidence id 與層級」），MCP server 據此記 trace。
- 截短：`summary` 200 字、引文 120 字；全文用 `get_evidence`。
- 讀取工具預設排除 `superseded`、`rejected`，含第 1 層（§1.4）；`basis_changed=true` 照回並標示。
- 參數與回傳 snake_case，證據內容欄位與 01 同名（§1.1）。
- 錯誤回傳 MCP tool error，內容 `{code, message, hint}`；`hint` 告訴大腦下一步（例：「先呼叫 run_method('event.causal_network')」）。

原型決定（T20，2026-11-17，見 `docs/plans/20261117-t20-mcp-server.md`）：

- **錯誤的形狀**：tool error（`isError=true`）的文字內容就是 `{code, message, hint}` 的 JSON 本身，不加 SDK 預設的「Error executing tool …」前綴。成功時文字內容是回傳值的 JSON，`structuredContent` 同值。
- **路徑與 Host**：`/mcp` 直接服務（不轉址到 `/mcp/`）；token 不對回 HTTP 401 `{detail, code: unauthorized}`。沿用 MCP SDK 的 DNS rebinding 防護，只接受本機 Host（`127.0.0.1`、`localhost`），其他回 421。
- **session 狀態放記憶體**：`agent_sessions` 只存 01 §8 的欄位；目前的 `turn_id` 與該輪使用者訊息（草稿的 `question`）由 Gateway 每輪設定（`SessionRegistry.set_turn`，T25 接上）。
- **AgentEvent 去處**：MCP server 發的事件（`tool_call`、`tool_result`、`approval_request`、`view`、`note_draft`）進記憶體事件緩衝的 `session:<sessionId>` 串流，形狀 `{sessionId, turnId, ts, data}`，`seq` 由串流給；N-10 的 SSE 端點讀它（T25）。
- **確認的等待點**：`add_interpretation` 發 `approval_request` 後等使用者回應，不設逾時；T25 的回應端點呼叫 `Approvals.resolve(requestId, allow)`，session 關閉時全部當成拒絕。
- **系統欄位**：MCP SDK 會默默丟掉 schema 外的參數；寫入工具改看原始參數，帶了 §1.5 的 key 回 `system_field_forbidden`。

### 5.3 讀取工具

| 工具 | 參數 | 回傳 |
| --- | --- | --- |
| `search_evidence` | `query`（FTS5 語法的子集：詞、片語、OR）、`claim_types?[]`、`min_level?`、`chapter_from?`、`chapter_to?`、`limit?: 20`（上限 50） | `hits[{id, claim_type, level, summary, discourse_chapter, confidence, review_status, basis_changed, first_quote}]`、`total` |
| `get_evidence` | `evidence_id`、`include_trace?: false`、`trace_depth?: 1` | 01 的完整證據：外殼、`content`、`quotes`、`genre_ext`、`subjects`、`derived_from`；`include_trace` 時加 N-05c 的節點清單 |
| `get_entity` | `entity_id` 或 `name`（比對 `canonical_name` 與 `aliases`）、`include_genre_ext?: true` | `character` 證據的外殼＋`content`＋`genre_ext`（推理的 `mystery_role` 等）＋前 3 段引文；`name` 對到多筆時回 `candidates[]` |
| `get_events` | `participant_id?`、`chapter_from?`、`chapter_to?`、`event_type?`、`limit?: 30`、`cursor?` | `events[{id, level, title, event_type, chapter, text_rank, visibility, summary, participant_ids[]}]` 依 `text_rank` 排序、`next_cursor` |
| `get_passage` | `paragraph_id`，或 `evidence_id`＋`quote_seq?: 1`；`context?: 0`（上限 3） | `{paragraph_id, chapter, text, before[], after[], highlight{start, end, verified}}`；原文不截短 |
| `list_genre_elements` | 無 | `{genre: {primary, mixed, effective}, elements[{claim_type, layer, mechanism, genre_ext?, level, count}]}`，`count` 是本書 current 證據數；05 §6 的大腦測試呼叫的就是它 |
| `list_methods` | `query?`（比對 `question`）、`layer?`、`mechanism?` | `methods[{id, code, kind: method／methodology, question, grade, requires[], produces, precheck{ok, missing[]}, has_current_run, run_id?, implemented}]` |
| `get_run` | `run_id`，或 `method_id`（取該方法最新 current run） | `{run_id, method_id, code, status, model, prompt_version, finished_at, summary, evidence_ids[]（上限 100）, evidence_count, precheck?}` |

原型決定（T20）：

- 回傳的 `content`、`genre_ext.data`、`precheck` 一律用 01 的 snake_case 原名（REST 是 camelCase）。
- `search_evidence` 的 `OR`：拆成各段分別查再合併，`total` 是合併後的筆數；不帶 `OR` 的多個詞當一個片語。
- `limit`、`context`、`trace_depth` 超出範圍時夾到上下限，不報錯；`get_events` 的 `limit` 上限 100，每筆另回 `basis_changed`，`participant_id` 比對 `role=participant` 的主體，章節篩選用內容的 `chapter`。
- `get_run` 帶 `method_id`：取最新、未被取代的 `done` run；沒有就回最新一筆任何狀態的 run（`not_applicable` 也能看到 `precheck`）。`evidence_ids` 只含 current、未被拒絕的證據。
- `list_methods` 的 `precheck`＝`{ok, missing[]}`（`plan_method` 的結果）；方法論的 `requires` 為空、`produces` 為 null。`list_genre_elements` 列 DAG 裡所有類型，`genre_ext` 是這類 current 證據實際帶的題材。
- 「讀過」的判定（§5.5 規則 1）：工具回傳值裡的證據 id 都算；`get_evidence` 的 `derived_from` 只是上游 id，不算，帶 `include_trace` 時追溯樹的節點才算。

### 5.4 分析工具

| 工具 | 參數 | 回傳 |
| --- | --- | --- |
| `run_method` | `method_id`（方法或方法論 id）、`inputs?: {subject_ids?[], params?{}}`、`force?: false`、`dry_run?: false` | `{status: queued／attached／reused／not_applicable／planned, job_id?, run_id?, plan[], precheck?}`，語意同 N-04a。`not_applicable` 時 `precheck` 說明缺什麼、怎麼補、補了也沒用的情況（03 §3、架構文件「缺什麼就回什麼」） |
| `get_job_status` | `job_id` | `{status, progress, stage, run_ids[], error_kind?}`；`paused_quota` 時 `hint` 請大腦告知使用者稍後續跑，不要重試 |

`run_method` 是分析類，自動放行（架構文件「讀取與分析類則自動放行」）；產出的證據 `produced_via=agent`、`agent_backend` 由 session 補上，其餘系統欄位照一般方法 run（03 §6 `EvidenceDraft` 不含系統欄位）。

### 5.5 寫入與呈現工具

| 工具 | 參數 | 回傳 | 系統自動補上（不在參數裡） |
| --- | --- | --- | --- |
| `create_note` | `title`、`conclusion`（markdown）、`cited_evidence_ids[]` | `{draft_id, check{ok, problems[]}}`；同時發 `note_draft`（`op=created`） | 草稿：`question`（觸發的使用者訊息）、`session_id`。使用者確認後（N-06c）：`level`、`source`、`produced_via=agent`、`agent_backend`、`review_status`、`derived_from`、`methodology_trace`、`methodology_run_id`、`status`、`basis_changed`、時間 |
| `add_interpretation` | `text`、`cited_evidence_ids[]` | 允許後 `{evidence_id, level}`；拒絕回 tool error `approval_denied` | `level`、`source=agent`、`produced_via=agent`、`agent_backend`、`review_status=approved`（使用者已在確認時看過；原型決定）、`derived_from`、`run_id=null`、時間 |
| `link_evidence` | `draft_id`、`add_ids?[]`、`remove_ids?[]` | 更新後的 `{draft_id, cited_evidence_ids[], check}`；發 `note_draft`（`op=updated`） | 無（不寫 `evidence`） |
| `show_view` | `view_type`（05 §4 目錄）、`data_ref`：`{run_id}` 或 `{evidence_ids[]}` | `{view_id}` | 無；發 `view` 事件 |

**`cited_evidence_ids` 的驗證（所有寫入工具共用）**：

1. 每個 id 必須出現在本 session 先前某筆 `trace_calls.result_evidence_ids` 裡，或是本 session `run_method` 產出的 run 的證據；否則 `not_in_trace`。大腦不能引用它沒讀過的證據，這是 `derived_from`「來自 trace 中的 evidence id」（架構文件）的落實方式。
2. 套筆記規則：第 1 層、`rejected` 不能引用；`create_note` 的草稿不擋，只寫進 `check.problems`，讓使用者在草稿卡上看到為什麼存不了。
3. `derived_from`＝通過驗證的 `cited_evidence_ids`。

原型決定（T20）：

- `check.problems[]` 每項 `{code, message, evidenceId?}`；`code` 用 `note_cites_level1`、`note_cites_rejected`、`not_found`（不在本書），一筆都沒引用時 `no_citation`。
- `add_interpretation` 在發確認前就套規則 2，不通過直接回該 `code` 的 tool error（不問使用者）；寫入的 `confidence` 記 1.0（使用者已確認）。
- `show_view` 的 `data_ref` 只驗證存在於本書，**不算讀過**：它回傳的 id 不進 `trace_calls.result_evidence_ids`，否則大腦能用 `show_view` 繞過規則 1。`view_type` 不在 05 §4 目錄回 `unknown_view`，`hint` 列出可用的。
- `run_method` 產出的證據 `agent_backend` 由 `runs.agent_session_id` 查 session 的 `backend` 補上。

`link_evidence` 原型決定只作用於草稿：01 §4 規定層級「寫入後不變」，已寫入的證據再加引用會改層級，所以不開放。

### 5.6 Trace（`trace_calls`）

MCP server 收到每一次工具呼叫時寫一筆，回傳前補完結果；這是 trace 的唯一來源（架構文件原則 4）。欄位以本節為準（01 §8 指向這裡）：

| 欄位 | 說明 |
| --- | --- |
| `id`、`session_id`、`seq` | `seq` 在 session 內遞增，也是 AgentEvent 的 `callId` |
| `turn_id` | 哪一輪使用者訊息 |
| `tool`、`args_json` | 原樣記錄參數 |
| `status` | `ok`／`error`／`denied`／`pending_approval`；原型補充 `running`（收到呼叫、還沒回傳） |
| `result_evidence_ids`、`result_run_ids` | json 陣列；寫入驗證與 `methodology_trace` 都靠它 |
| `job_id`、`approval_request_id`、`error_code`、`error` | `error`＝給人看的錯誤訊息（原型補充） |
| `started_at`、`duration_ms` | |

筆記的 `methodology_trace`（01 §5）形狀，原型決定：

```json
{ "kind": "mcp", "session_id": "8c1e…", "agent_backend": "deepagents",
  "calls": [ { "seq": 3, "tool": "run_method", "args": {"method_id": "character.belief"},
               "result_run_ids": ["…"], "contributing": true } ] }
```

- `calls`＝本 session 從開始到該次 `create_note` 為止的所有 `ok` 呼叫；`contributing=true` 標出回傳 id 與 `cited_evidence_ids` 有交集、或產出了被引用證據的呼叫。
- 從 run 建立的筆記用 `{"kind": "ui_run", "runs": [{run_id, ref_id, version, prompt_version, model, params}]}`（run 與它的步驟 run）。
- N-06d 重放與 N-07e 另存方法論都只讀這個欄位。

## 6. 對照檢查表

### 6.1 畫面 → 端點

| # | 畫面 | 端點 | 檢查結果 |
| --- | --- | --- | --- |
| 1 | 書庫 | N-01a、N-01b、N-01d、N-09f（入庫中的書即時更新） | 完整 |
| 2 | 入庫進度 | N-02a、N-02b、N-02c（開發者）、N-02d、N-02e、N-02f、N-02g、N-02h、N-03a、N-09c／N-09f、N-09e（續跑暫停） | 完整 |
| 3 | 書籍總覽 | N-01c、N-03a、N-03b、N-03c、N-04a（點卡、點也可以問）、N-02h（改主題材）、N-09f | 完整 |
| 4 | 結果卡詳情 | N-04c、N-04e、N-05a（`runId=`）、N-05b、N-05c、N-05d、N-05e、N-04d、N-06c（`origin=run`）、N-01e | 完整 |
| 5 | Agent 工作區 | N-10a–N-10k、N-04e（view 卡片）、N-06c（`origin=draft`）、N-08e（大腦選單） | 完整 |
| 6 | 筆記 | N-06a、N-06b、N-06d、N-05b／N-05c（點引用證據）、N-06e、N-09f（依據已變動） | 完整 |
| 7 | 證據瀏覽 | N-05a（`includeL1`）、N-05b、N-05c、N-05d、N-05e、N-01e、N-07f（類型篩選清單） | 完整 |
| 8 | 方法目錄 | N-07a–N-07d、N-07f、N-07g | 完整 |
| 9 | 設定 | N-08a–N-08g | 完整；主題、開發者檢視在前端 |
| — | 工作中心 | N-09a、N-09b、N-09d、N-09e、N-09c | 完整 |

### 6.2 MCP 工具 → REST 端點或服務

MCP 不呼叫 REST（不經 HTTP 繞一圈），兩邊共用同一個服務層；下表寫的是「與哪個端點共用服務」。

| 工具 | 共用服務／端點 | 備註 |
| --- | --- | --- |
| `search_evidence` | 證據查詢服務＝N-05a | MCP 預設含第 1 層 |
| `get_evidence` | N-05b、N-05c | |
| `get_entity` | N-05a ＋ N-05b | 多了名稱比對 |
| `get_events` | N-05a | 固定 `claimType=event`、依 `text_rank` |
| `get_passage` | N-05d | |
| `list_genre_elements` | N-03a ＋ N-07f ＋ 證據統計 | |
| `list_methods` | N-03b ＋ N-03c ＋ N-07a | |
| `get_run` | N-04b、N-04c | |
| `run_method` | N-04a（Method 介面，03 §6） | 架構文件「UI 按鈕與 agent 結果完全一致」 |
| `get_job_status` | N-09b | |
| `create_note` | 草稿服務 → 確認時 N-06c | |
| `add_interpretation` | N-06e 的寫入服務 | 系統欄位差在 `source`、`produced_via` |
| `link_evidence` | 草稿服務 | 沒有對應 REST，草稿只能由大腦改、由使用者在確認時改 |
| `show_view` | Gateway 事件 → 前端呼叫 N-04e | |

### 6.3 資料表 → 讀寫端點

| 表 | 寫入 | 讀取 |
| --- | --- | --- |
| `books` | N-01b（P1）、N-02h（`genre_override`）、ingest job S3（`genre_profile`）、N-01d | N-01a、N-01c、N-03a、`list_genre_elements` |
| `chapters`、`paragraphs` | N-01b（P1）、N-02e、N-01d | N-01e、N-02d、N-05d、`get_passage` |
| `evidence` | ingest 類 job（S2、S4b）、`method_run` job、N-06c、N-06e、`add_interpretation`、N-05e（審核、傳播）、N-01d | N-05a、N-05b、N-04e、N-03b、N-06a、N-06b、所有讀取工具 |
| `ev_<claim_type>`（33 張） | 同上；`ev_note` 只由 N-06c；`ev_interpretation` 由 N-06e、`add_interpretation`；N-05e 的 modify | N-05b、N-04e、N-06b、`get_evidence`、`get_entity`、`get_events` |
| `evidence_subject` | ingest、`method_run` | N-05a（`subjectId`）、N-05b、`get_events`（`participant_id`） |
| `evidence_link` | ingest、`method_run`、N-06c、N-06e、`add_interpretation` | N-05c、N-06b、`get_evidence`、01 §4 傳播 |
| `evidence_quote` | ingest（S2、S4b） | N-05b、N-05d、`get_passage`、`get_entity` |
| `evidence_genre_ext` | ingest（S4b） | N-05b、`get_entity`、`get_evidence` |
| `evidence_edits` | N-05e（modify） | N-05b |
| `runs` | ingest 類 job（每步一筆）、`method_run`、`note_rerun` | N-02a、N-03b、N-04b、N-04c、`get_run`、`list_methods` |
| `methodologies` | N-07e | N-07c、N-07d、`list_methods`、N-04a |
| `agent_sessions` | N-10a、N-10h、草稿操作（`create_note`、`link_evidence`、N-06c、N-10k） | N-10b、N-10c、N-10j |
| `trace_calls` | MCP server（每次工具呼叫）、N-10f | N-10i、N-06c（組 `methodology_trace`）、§5.5 驗證、N-08g |
| `ingest_units` | ingest 類 job、N-09d、N-09e | N-02a、N-02b、N-02c |
| `ingest_unit_outputs` | ingest 類 job | N-02c、S2 重跑（N-02g） |
| `jobs` | 所有觸發端點、N-09d、N-09e | N-09a、N-09b、N-01a、N-02a、N-08d |
| `evidence_fts` | 由 `evidence`、`evidence_quote` 寫入時同步（trigger） | N-05a（`q`）、N-06a（`q`）、`search_evidence` |

檢查結果：每張表都有寫入者與讀取者；沒有「只寫不讀」或「只讀沒人寫」的表。

## 7. 實作順序建議

| 批 | 端點／工具 | 理由 |
| --- | --- | --- |
| 1 | N-01*、N-02*、N-09*、SSE | 先能跑完入庫（05 成功條件 1） |
| 2 | N-03*、N-04*、N-05*、N-07* | 10 張卡能打開、追溯到原文（成功條件 2） |
| 3 | N-06*、N-08*、N-10*、MCP 14 個工具 | 兩種大腦產生草稿、存成筆記、重跑（成功條件 3） |

## 8. 待補（已處理）

初稿列出的 15 項都已回寫到其他文件，這一節只留對照，之後可刪。

| # | 項目 | 回寫到 |
| --- | --- | --- |
| 1 | `runs`、`agent_sessions` 的欄位 | 01 §8（`trace_calls` 以本文件 §5.6 為準） |
| 2 | `ingest_unit_outputs` | 01 §2、§8 |
| 3 | 入庫單位的 stage／status | 01 §8、02 §7 |
| 4 | 改主題材後的舊卡 | 02 §5 |
| 5 | 其他題材訊號的建議問句 | 03 §5（`registry/perspectives/mechanisms.yaml`） |
| 6 | P0／P1 | 03 §1（YAML 的 `priority`） |
| 7 | agent 筆記的 `methodology_run_id` | 01 §5（null） |
| 8 | 筆記的 `source` | 01 §5（從 run＝method、從草稿＝agent） |
| 9 | 筆記重跑的結果 | 01 §5（不寫回筆記） |
| 10 | 設定存放處 | 01 §1（`var/settings.yaml`） |
| 11 | 對話與草稿存放處 | 01 §8（`messages_json`、`drafts_json`） |
| 12 | 書層級證據、筆記、詮釋的外殼 | 01 §3、§5 |
| 13 | 拒絕理由 | 01 §7（選填 `reason`），N-05e |
| 14 | 方法的 `llm_task` | 03 §7 |
| 15 | 重啟後是否自動續跑 | 02 §7（不自動） |
