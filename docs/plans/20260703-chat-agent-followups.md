# Chat Agent — Review Follow-ups

日期：2026-07-03
來源：chat agent prompt & flow 全面 review（memory: `project_chat_agent_backlog.md`）
分支：`refactor/chat-agent-cleanup`

本次 review 讀了 chat agent + entity flow + metrics + langfuse 一整圈。已落地的 cleanup 見下方「已完成」，尚未做的候選見「待辦」。

---

## 已完成（本分支 6 commits）

1. `refactor`：抽 `_build_messages`（astream / `_agent_invoke` 訊息組裝去重）
2. `fix`：移除 SYSTEM_PROMPT 重複的 language 指令（`build_context_prompt` 為單一來源）
3. `docs`：修正 `PHASE_4_CHAT_AGENT.md` 漂移（手動 `StateGraph`、快速路由已移除）
4. `refactor`：抽 `_preprocess` / `_postprocess`（chat / astream 前後處理去重；entity 邏輯原樣 + 註釋標明 KG 對齊意圖）
5. `feat`：astream 補 `record_agent_query` metric（生產路徑終於有 agent 層可觀測性；本地 metric、不吃 langfuse units）
6. `feat`：langfuse trace 採樣率 `LANGFUSE_SAMPLE_RATE`（預設 1.0；控免費額度 50k units/月）

---

## 待辦候選（依價值/大小）

| # | 項目 | 大小 | 看法 |
|---|------|------|------|
| A1 | **`selected_entity` id 窄優化** — WS handler（`_chat_ws_shared.py`）只用 `["name"]`、丟掉前端傳的 canonical id/type；name 有歧義時對不到使用者選的實體。讓 focus 在有 id 時走精確查 | 小 | 可做，實質小改善 |
| A2 | **死代碼查證清理** — 快速路由移除後的殘留：`ChatState.tool_results` / `intent` / `cache_tool_result` / `get_cached_result` / `update_entity_state` 的 3 個 unused 參數（`recognizer`/`tool_map`/`query`）。先查證有無消費者再刪 | 小-中 | 值得，先查證 |
| A3 | **pattern recognizer 中文實體抽取** — `_ENTITY_PATTERNS` 只認英文/引號名，中文非引號名抽不到 | 中 | 優先度中；entity 主要靠 `selected_entity` |
| A4 | **多輪 history 丟 tool context** — `conversation_history` 只存 user/assistant text，跨輪丟失工具呼叫結果，可能影響連續追問 | 中-大 | 真實限制；需設計（存多少、怎麼存） |
| A5 | **entity tracking → KG id 對齊** — 讓 `current_focus_entity` 真的攜帶 canonical id（原設計方向）。**注意：name-only 對 prompt 注入 / pronoun resolution 是刻意且合理的**，這是增強不是 bug | 中-大 | 獨立規劃 |
| A6 | **`chat()` 去留** — 無生產調用（只測試用）、現在很薄 | 小 | 低價值，傾向不動 |

### 確認過「不動」的
- **entity tracking 結構 / `entity_mentions` 計數 / F2「重複」**：查證為刻意的 KG 對齊設計（`current_focus_entity` 存 name 是對的），非 cosmetic 垃圾，勿去重清理。詳見 memory `project_chat_agent_backlog.md`。

---

## 收尾雜務
- 這批 6 commits push + PR（進行中）
- PR #7（前端空態+置中）review / merge
- 實刪 13 個已合併分支（本地 6 + 遠端 7，全 `ahead of main = 0`）
- 重開 dev server
- （獨立）B-049 lint 債：`tests/agents/test_chat_agent.py` 的既存 ruff error（I001、unused import）屬此類
