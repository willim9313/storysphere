# T27 Agent 工作區畫面

## 使用者的決定（2026-11-17）

- **#1 選 A：照 04 N-07e 的規格，另存方法論只取該輪的 `run_method`。** 理由（使用者原話的意思）：不要偏離規格太遠，免得之後回頭重做時，留下一堆說不出理由的決策。
  - 已知後果：實測的大腦都是取用現成結果（`get_run`、`search_evidence`），幾乎不呼叫 `run_method`，所以實際的結果上這顆按鈕**大多是停用的**，停用時要寫明原因（「這一輪沒有執行任何方法，沒有可存的步驟」）。
  - 停用的根本原因不是範圍調整：方法論的定義是「重跑了什麼」還是「用到了哪些方法」，規格選了前者。要改成後者（原本的選項 B）是改 04 N-07e，留到驗收（T28）後再看。
  - 完成標準「另存方法論能用」用測試驗（假造帶 `run_method` 的 trace）；手動測要讓大腦真的 `run_method` 會叫方法的 LLM（Gemini），要先問使用者。
- #2、#3 照下面的建議做。


依據：07 T27、05 §3.3、04 §2.5、§4.6 N-06c、§4.7 N-07e、§4.10 N-10a–k、§5.1、§5.5、§5.6。設計稿 `docs/design/canvas/Agent.dc.html`。

完成標準（07）：同一輪的 view 與草稿組成一個結果；存成筆記、另存方法論、捨棄都能用；沒存的結果有明示。

## 現況盤點

- 後端 N-10a–k 都在；SSE 是記憶體裡的 `EventBus`，伺服器重啟後串流就沒了。
- 草稿（`agent_sessions.drafts_json`）**沒有記 `turn_id`**，重新整理後無法把草稿放回它那一輪。
- `show_view` 的 `trace_calls` 列有 `turn_id` 與 `args_json`（`view_type`、`data_ref`），重新整理後可以從 trace 重建 view。
- N-06c `origin=draft` 目前回 422（T23 留下的）。
- **N-07e 在 04 有定義，但後端完全沒做**：沒有 `methodologies` 表（01 §2 只有一行說明，沒有欄位）、N-07c／d 只讀 YAML。
- **T25／T26 的四個實測 session 裡，`run_method` 一次都沒出現**（大腦都用 `get_run`、`search_evidence` 取現成結果，這正是設計要的「不重跑」）。N-07e 的 `fromSession` 規定「取該輪的 `run_method` 順序」，照現在的寫法，實際的結果另存出來都是空的方法論。→ 見下方「要你決定的事」#1。

## 要你決定的事（P3）

### #1 另存方法論要取哪些步驟

- **位置**：04 N-07e（`fromSession`）、05 §3.3、01 §2 `methodologies`。
- **問題**：規格只取該輪的 `run_method`，但實際的大腦幾乎不呼叫它（4 個 session、0 次）。另外 05 §3 畫面 8 把「另存方法論」標成 P1，原型也沒有方法論執行器，存下來的方法論 `implemented=false`、不能跑。
- **影響**：照規格做，按鈕在實際的結果上幾乎都是空的，完成標準「另存方法論能用」形同沒驗到。
- **選項**：
  - **A. 照規格**：只取 `run_method`；該輪沒有就停用按鈕並說明原因。改動最少，但實際上幾乎都停用。
  - **B. 步驟改成「這個結果用到的方法」**（建議）：結果裡引用的證據各自由哪個 run 產出 → 取那個 run 的方法 id；再加上該輪的 `run_method`，依 trace 出現順序去重。沒有草稿只有 view 的結果，用 view 指到的證據。這樣「取用結果卡 CH2＋EV1」的結果另存出來就是 `[character.arc, event.kernel_satellite]`。要改 04 N-07e 的說明。
  - **C. 延後**：照 05 把它當 P1，T27 不做，從 07 的完成標準拿掉；按鈕顯示「尚未支援」。
- **若選 A 或 B，還要的最小範圍**：新增 `methodologies` 表（`id`＝`user.<slug>`、`question`、`steps_json`、`version=1`、`owner=user`、`source_json`＝`{sessionId, turnId}`、`created_at`），補進 01 §2；N-07c／d 合併列出使用者方法論（`implemented=false`）；寫入前檢查步驟都是已登錄的方法（03 §2）。04 的另外兩種 request（`steps[]` 直接給、`fromNoteId`）**不做**，回 422。

### #2 結論文字裡抄錯的 evidence id（已知問題）

建議**只在前端處理**：結果卡的結論裡，看起來像 evidence id、但不在 `citedEvidenceIds` 裡的字串標成警示；結論本來就能在存之前改。不改 `check` 的規則，也不擋儲存。（另一種做法是在 `create_note` 的 `check.problems` 加一個 `conclusion_unknown_id`，要改 04 §5.5；我覺得不值得。）

### #3 其他兩個已知問題：T27 不處理

- Claude Code 回覆不附 id：結果卡的「引用的證據」來自草稿，不靠回覆文字，所以畫面不受影響。要改的話是 system prompt 的事，另開任務。
- 推理題沒有 MY4 時草稿帶 `note_cites_level1`：這是規格要的行為。結果卡顯示 `check.problems`、停用「存成筆記」，使用者可以在卡上把第 1 層的引用拿掉再存。

## 做法

分四批，每批做完跑閘門、回報。

### A 批：後端，N-06c `origin=draft`

1. `create_note`（MCP）寫草稿時多記 `turn_id` 與 `call_seq`（那次 `create_note` 在 trace 的 seq）。`NoteDraft` 加 `turnId`（04 §2.5）；`call_seq` 不對外。舊草稿沒有這兩個欄位：`turnId` 為 null，methodology trace 改用「到草稿建立時間為止」的呼叫。
2. N-06c 接受 `{origin: "draft", sessionId, draftId, title?, conclusion?, citedEvidenceIds?}`：
   - 草稿不屬於這本書或這個 session → 404；不是 `open` → `409 invalid_state`。
   - 引用規則與 `origin=run` 相同（第 1 層、`rejected`、不屬於本書都擋）。
   - 帶了任一欄位＝改過 → `reviewStatus=modified`，否則 `approved`；`source=agent`、`producedVia=agent`、`agentBackend` 取 session；`methodologyRunId=null`。
   - `methodologyTrace`＝04 §5.6 的 `{kind: "mcp", session_id, agent_backend, calls[]}`：本 session 到 `call_seq` 為止的 `ok` 呼叫；`contributing=true`：回傳的證據 id 與引用有交集，或 `result_run_ids` 含有被引用證據的 run。
   - 寫入後草稿標 `confirmed`、記 `note_id`，發 `note_draft`（`op=confirmed`）。session 已關閉也能確認（草稿在關閉時已標 `discarded`，所以實際上只有沒關的 session 可以確認——照 N-10h，不改）。
3. 04 §4.6 拿掉「draft 回 422」的原型註記；§2.5 補 `turnId`。重產 `generated.ts`。
4. 測試：`tests/api/test_notes.py` 加 draft 的情境（未改／改過、第 1 層被擋、已確認 409、別本書 404、trace 的 contributing、事件有發）。

### B 批：後端，N-07e（依 #1 的決定；選 C 就跳過）

`store/methodologies.py`（新表）、`api/routes/registry.py`、`api/schemas/registry.py`、測試、01 §2 與 04 N-07c–e。

### C 批：前端，畫面 5

- 路由 `/books/:bookId/agent` 換成 `AgentPage`。
- 上方：大腦選擇（N-08e 的可用後端；deepagents 再選模型）、session id、L0、「之前的對話」（N-10b）、「新對話」（N-10h 關掉目前的＋N-10a）。
- 左欄對話：訊息（N-10c 的 `messages`＋SSE 的 `text_delta`）、每次工具呼叫一行摘要（開發者檢視可展開參數與回傳摘要）、「→ 結果 A」連結、寫入確認卡（`approval_request` → N-10f）、送出／中止（N-10d、N-10g）。
- 右欄「本次分析結果」：依 `turnId` 分組，每組＝該輪的 view（`ViewRenderer` 傳 `runId` 或 `evidenceIds`）＋草稿（標題、結論可改、引用列表可移除、`check.problems`）＋「怎麼得出的」（該輪的工具呼叫）＋「取用結果卡 CH2」標籤（該輪的 `get_run`）。三個動作：存成筆記（N-06c draft）、另存方法論（N-07e）、捨棄（N-10k）。篩選：全部／未儲存／已儲存；已存的收合成一行連到筆記。
- 「未儲存」的明示：每個結果的狀態徽章，加上方固定的說明（「未儲存的結果只是一次分析結果，下次重跑同一個分析就會被取代…」，照設計稿）。
- 狀態來源：重新整理時從 N-10c、N-10i、N-10j 重建；SSE 只負責即時的 `text_delta`，其餘事件收到就重抓對應的 query（不在前端維護第二份狀態）。
- `useEventStream` 加一個參數接受事件型別清單（目前寫死成 job 的六種），agent 串流共用它。
- 草稿卡的結論顯示 #2 的 id 警示。
- **不做**：設計稿上「怎麼得出的」旁的「重跑」（規格沒列；存成筆記後可以用筆記的重跑）、Ink 主題的調整。

### D 批：手動測

- 伺服器用 `var/benchmark_runs/sign_of_four/t25_brain/neo.db` 的**副本**（`t27/` 下），設好 `STORYSPHERE_DB`、`STORYSPHERE_CHECKPOINT_DB`、`STORYSPHERE_UPLOAD_DIR`、`STORYSPHERE_AGENT_DIR`；在沙箱外跑。
- 先不叫大腦：打開 T25／T26 留下的 session，確認重建、捨棄、存成筆記（Claude Code 的第二題草稿 `check.ok=true`）、另存方法論。
- Claude Code：送 1–2 題（用你的訂閱）。
- Gemini：要跑時先報估計（以 T25 的實測，一題約 6–12 次 flash 呼叫），等你同意。

## Checkpoint 四題

1. **異動檔案**
   - A：`mcp/tools_write.py`、`api/routes/notes.py`、`api/schemas/notes.py`、`api/schemas/agent.py`、`gateway/service.py`（確認草稿的狀態更新與事件，或放在 `store/agent.py`）、`tests/api/test_notes.py`、`tests/mcp/` 的草稿測試、`docs/spec/04`、`frontend/src/api/generated.ts`。
   - B：新增 `store/methodologies.py`；修改 `store/db.py`（建表）、`api/routes/registry.py`、`api/schemas/registry.py`、`tests/api/test_registry.py`、`docs/spec/01`、`docs/spec/04`。
   - C：新增 `pages/AgentPage.tsx`、`components/agent/`（約 5 個元件）、`api/agent.ts`；修改 `router.tsx`、`api/queryKeys.ts`、`hooks/useEventStream.ts`、`docs/spec/05`（若畫面與 §3.3 有出入）。
2. **現成可用**：`store/notes.citation_problems`（引用規則）、`write_evidence`、N-06c 的 run 路徑、`mcp/tools_write.draft_event`、`ViewRenderer`（已支援 `evidenceIds`）、`useEventStream`、`useDevView`、`SaveNote` 的表單樣式、`registry.checks`。舊 repo 沒有對應的 agent 畫面。
3. **新依賴或新結構**：無新依賴。新結構只有 `methodologies` 表（B 批，視 #1 而定）。
4. **改錯怎麼還原**：每批獨立，未 commit 前用 `git stash`；手動測只動 `var/benchmark_runs/.../t27/` 的副本，不碰原檔。

**規格同步**：04（§2.5、§4.6、N-07c–e）、01 §2（`methodologies` 欄位）、05 §3.3（若有出入）。commit message 標 `[api-spec updated]`。
