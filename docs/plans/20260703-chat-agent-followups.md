# Chat Agent — Review Follow-ups

日期：2026-07-03
來源：chat agent prompt & flow 全面 review（memory: `project_chat_agent_backlog.md`）
分支（皆已 merged、分支已清）：`refactor/chat-agent-cleanup`（第一批，PR #8）、`feat/chat-focus-entity-id`（第二批 A1–A3，PR #10）、`feat/chat-tool-context`（第三批 A4/A5/A7，PR #11→#12）
狀態：**A1–A7 全數落地 main**（截至 2026-07-04）。

本次 review 讀了 chat agent + entity flow + metrics + langfuse 一整圈。已落地的 cleanup 見下方「已完成」，尚未做的候選見「待辦」。

---

## 已完成（第一批 `refactor/chat-agent-cleanup`，6 commits，PR #8 merged）

1. `refactor`：抽 `_build_messages`（astream / `_agent_invoke` 訊息組裝去重）
2. `fix`：移除 SYSTEM_PROMPT 重複的 language 指令（`build_context_prompt` 為單一來源）
3. `docs`：修正 `PHASE_4_CHAT_AGENT.md` 漂移（手動 `StateGraph`、快速路由已移除）
4. `refactor`：抽 `_preprocess` / `_postprocess`（chat / astream 前後處理去重；entity 邏輯原樣 + 註釋標明 KG 對齊意圖）
5. `feat`：astream 補 `record_agent_query` metric（生產路徑終於有 agent 層可觀測性；本地 metric、不吃 langfuse units）
6. `feat`：langfuse trace 採樣率 `LANGFUSE_SAMPLE_RATE`（預設 1.0；控免費額度 50k units/月）

## 已完成（第二批 `feat/chat-focus-entity-id`，4 commits，PR #10）

> 每項動手前都重新對照 code 複查一次，不盲信本文件最初判斷。

- **A1** `feat`：`selected_entity` id 帶入 focus — WS handler 取 canonical id 存 `current_focus_entity_id`；有 id 時 prompt hint 指示 LLM 用它填 `entity_id`，走 `resolve_entity` 的 `get_entity(id)` 精確查。name-only 提及清掉舊 id，避免殘留。（A5 方向的一部分已藉此落地。）
- **A2** `refactor`：死代碼清理（查證無生產消費者）— `update_entity_state` 砍 unused 的 `recognizer`/`tool_map`/`query` 參數；刪 `ChatState.intent`、`tool_results`、`last_tool_results` + `cache_tool_result`/`get_cached_result` + `TestToolCache`。
  - 留在範圍外：`self._tool_map`（現 vestigial 但有測試）、`ChatState.last_query_type`（write-only）。
- **A3** `feat`：中文實體抽取改用 **KG 名稱字典對比**（非 fragile CJK regex）— `recognize`/`_extract_entities` 收可選 `known_entities`，子字串比對（len≥2、長名優先）；`ChatAgent._known_entity_names` 用 `list_entities` 抓 name+aliases、per-book 快取，經 `_preprocess` 傳入 chat / astream。

---

## 待辦候選（依價值/大小）

> A 項全數處理完畢。A1–A3 見上方第二批（PR #10）；A4/A5/A7 見下方第三批（`feat/chat-tool-context`）；A6 評估後決定保留。

## 已完成（第三批 `feat/chat-tool-context`，PR #11→#12 merged）

> 每項動手前都重新對照 code 複查一次；A4/A5 另有獨立規劃文件。

- **A4** `feat`：跨輪 tool context 保存（`docs/plans/20260703-chat-tool-context-persistence.md`）— `Message` 加 tool_calls/tool_call_id/name；`build_history_entries` 存整輪 tool 交換（截斷 `MAX_TOOL_CHARS`）；`build_history_messages` 只回放最近 `TOOL_CONTEXT_TURNS=1` 輪、防禦式配對；`astream` 改 `stream_mode=["messages","values"]` 擷取完整訊息。
- **A5** `feat`：KG canonical id 全面對齊（`docs/plans/20260703-entity-tracking-kg-id-alignment.md`）— `_index_known_entities` 建唯一 `{name→id}`（歧義名剔除、維持 name-only 安全）；`update_entity_state` 加 `id_resolver`；`_preprocess`/`_postprocess` 兩路徑帶 id。文字提及的 KG 實體現在也能精確查（A1 只做 UI 選取）。
- **A6** 決定 **保留 `chat()`**：複查確認無生產調用（唯二為 docstring 範例 + 1 測試），但它是合法非串流單發 API、與 astream 共用內部方法，刪它換不到簡化。符合 plan「傾向不動」判定。
- **A7** `fix`：`entity_info` pattern 中文 `\b` bug — `\b` 只綁 ASCII 關鍵字，CJK 關鍵字（是誰/背景/介紹）不需邊界，修好「介紹李明」不觸發的問題，同時保留英文 `describe`/`described` 的 guard。

### 確認過「不動」的
- **entity tracking 結構 / `entity_mentions` 計數 / F2「重複」**：查證為刻意的 KG 對齊設計（`current_focus_entity` 存 name 是對的），非 cosmetic 垃圾，勿去重清理。詳見 memory `project_chat_agent_backlog.md`。

---

## Observability 困境（langfuse 採樣的根本限制）

**現狀兩難**：全域 `LANGFUSE_SAMPLE_RATE` 一刀切 → 正式環境為省 50k units 只能把 langfuse 關掉（測試才開），但關掉後出問題就沒 trace 可查。

**根因**：
- handler 注入在 **LLM 構造層**（`_make_callbacks`），不在 graph/chain invoke → **每次 LLM 呼叫各自起一條獨立 trace**（不是一次對話/一次 ingest 一條）。
- langfuse 雲端是 **head sampling（`TraceIdRatioBased`）**：trace 一開始就決定採不採，單條完整、但**整條整條隨機丟**。所以大書 ingest 採樣後 = 一堆 trace 整條缺席，觀測零散不連貫；且**做不到「出錯才 trace」**。

**方向（未實作）**：
- **A（推薦、低成本）**：正式環境靠**本地 metrics + 錯誤路徑結構化 log** 排錯，不依賴 langfuse。
  - `record_agent_query` 已記 success/latency/error（本地、不吃 units）。
  - 補 `astream` 的 except / WS handler：記下 query + page context + traceback（目前只記 session_id / `logger.exception`），就能從 log 定位出錯的那次對話。
- **B**：要「只留出錯的 trace」→ head sampling 做不到，需 **tail sampling（自建 OTel Collector）** 或錯誤路徑用 `@observe` 顯式記一條。
- **C**：想「chat 壓低、ingest 全留」→ 全域比率做不到，需**自訂 sampler 依 service context 給不同率**（額外工程）。

## 收尾雜務
- ~~第一批 6 commits push + PR~~ ✅ PR #8 merged
- ~~PR #7（前端空態+置中）review / merge~~ ✅ merged
- ~~第二批 A1–A3~~ ✅ PR #10 merged
- ~~第三批 A4/A5/A7~~ ✅ PR #11（誤疊在 #10 base）→ 補開 **PR #12**（base=main）才真正落地 main
- ~~實刪已合併分支~~ ✅ 遠端/本地皆只剩 `main`
- 重開 dev server — 依需要手動處理
- （獨立）B-049 lint 債：`tests/agents/test_chat_agent.py` 的既存 ruff error（I001、unused import）屬此類
- （獨立、非本次引入）`tests/test_llm_client.py::…returns_primary_when_no_local` 全套件跑會 1 failed、單獨跑通過 → test-isolation 污染（settings 全域），A1 之前就存在
