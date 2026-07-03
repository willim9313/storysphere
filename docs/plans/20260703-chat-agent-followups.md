# Chat Agent — Review Follow-ups

日期：2026-07-03
來源：chat agent prompt & flow 全面 review（memory: `project_chat_agent_backlog.md`）
分支：`refactor/chat-agent-cleanup`（第一批，PR #8）、`feat/chat-focus-entity-id`（第二批 A1–A3，PR #10）

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

> A1 / A2 / A3 已完成（見上方第二批 / PR #10）。

| # | 項目 | 大小 | 看法 |
|---|------|------|------|
| A4 | **多輪 history 丟 tool context** — `conversation_history` 只存 user/assistant text，跨輪丟失工具呼叫結果，可能影響連續追問 | 中-大 | 真實限制；需設計（存多少、怎麼存） |
| A5 | **entity tracking → KG id 對齊** — 讓 `current_focus_entity` 真的攜帶 canonical id（原設計方向）。**注意：name-only 對 prompt 注入 / pronoun resolution 是刻意且合理的**，這是增強不是 bug。A1 已讓 focus 攜帶 id，此項為更全面的對齊 | 中-大 | 獨立規劃 |
| A6 | **`chat()` 去留** — 無生產調用（只測試用）、現在很薄 | 小 | 低價值，傾向不動 |
| A7 | **`entity_info` pattern 中文 `\b` bug**（A3 複查副產物）— 尾部 `\b` 在中文緊鄰（如「介紹李明」）不成立，該類 query 不觸發 pattern。改法：去尾部 `\b` 或改 lookahead | 小 | 可做；屬 pattern 匹配層 |

### 確認過「不動」的
- **entity tracking 結構 / `entity_mentions` 計數 / F2「重複」**：查證為刻意的 KG 對齊設計（`current_focus_entity` 存 name 是對的），非 cosmetic 垃圾，勿去重清理。詳見 memory `project_chat_agent_backlog.md`。

---

## 收尾雜務
- ~~第一批 6 commits push + PR~~ ✅ PR #8 merged
- ~~PR #7（前端空態+置中）review / merge~~ ✅ merged
- 第二批 A1–A3 → ✅ PR #10（待 review）
- 實刪已合併分支（多個本地/遠端 `ahead of main = 0`）— 未做
- 重開 dev server — 未做
- （獨立）B-049 lint 債：`tests/agents/test_chat_agent.py` 的既存 ruff error（I001、unused import）屬此類
