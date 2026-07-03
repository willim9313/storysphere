# A4 — 跨輪 tool context 保存（Option A：ChatState 存並重播 tool 交換，有界）

日期：2026-07-03
來源：`docs/plans/20260703-chat-agent-followups.md` 待辦 A4
分支（規劃）：`feat/chat-focus-entity-id` 之後另起 `feat/chat-tool-context`

---

## 現況（已複查 code）

每輪：
1. `_build_messages` 組 `[SystemMessage, *history, HumanMessage(query)]`
2. `build_history_messages` 只回放 `conversation_history` 中 `role in {user, assistant}` 的**純文字**
3. 圖跑 ReAct loop：`AIMessage(tool_calls)` → `ToolNode` → `ToolMessage`，**只活在單次 invocation 的 `MessagesState`**
4. `_postprocess` 只 `add_message("assistant", 最終文字)` → **tool 呼叫與 ToolMessage 全丟**

**限制：** 下一輪 LLM 看不到上一輪的 tool 輸出，只有 assistant 摘要文字。drill-down 追問（「那第二個呢？」）會缺 context。

---

## 設計決策（存多少 / 怎麼存）

### 1. 存多少（bounded）
- 只在**回放時**帶入「最近 `TOOL_CONTEXT_TURNS`（預設 = 1）輪」的 tool 交換；更舊的 assistant 輪只回放純文字。
- 每個 tool 輸出於**存入時**截斷至 `MAX_TOOL_CHARS`（預設 2000 字元），bound 記憶體與 token。
- `trim_history` 仍以 `max_turns` bound 總量。

→ token 成長有界：最多一輪 tool 輸出、且每個截斷。

### 2. 怎麼存
擴充 `ChatState.Message`（新增**可選**欄位，向後相容）：
- `tool_calls: list[dict] | None`（assistant 訊息帶的工具呼叫：`[{id, name, args}]`）
- `tool_call_id: str | None` + `name: str | None`（`role="tool"` 訊息用）

新增記錄整輪的方法（取代/擴充現有 `add_message("assistant", ...)`）：把該輪圖輸出中的 `AIMessage(tool_calls)` 與其後的 `ToolMessage` 依序存入，tool 輸出截斷。

### 3. 怎麼回放（配對完整性是硬約束）
`build_history_messages` 依 role 產生對應 LangChain message：
- `assistant` 且在「最近 N 輪」窗內 → `AIMessage(content, tool_calls=...)`；否則 → `AIMessage(content)`（丟 tool_calls）
- `tool` 且在窗內且其對應 `AIMessage(tool_calls)` 也在窗內 → `ToolMessage(content, tool_call_id, name)`；否則**略過**
- **防禦式配對**：只有當一組 `AIMessage(tool_calls)` 的所有 `ToolMessage` 都齊時才回放該組的 tool_calls，避免 provider API「tool_calls 必須緊接 tool response」報錯（trim 切在配對中間時尤其重要）。

### 4. 捕捉來源
- `chat` / `_agent_invoke`：已有 `result["messages"]`（完整含 tool 交換）→ 直接取。
- `astream`（生產路徑）：目前 `stream_mode="messages"` 不含完整訊息列。改用 `stream_mode=["messages", "values"]`（或等價方式）在串流結束後取最後一份 state values 的 `messages`。**實作時需驗證**串流 chunk 格式與現有 `chunk.get("type")` 判斷相容。

---

## 檔案異動

1. `backend/storysphere/agents/states.py`
   - `Message` 加 `tool_calls` / `tool_call_id` / `name`（可選）
   - 新增 `add_turn_messages(...)`（或擴充），存 assistant + tool 交換、tool 輸出截斷
   - `trim_history` 調整：保持配對不被切散（或交由 builder 防禦式處理）
2. `backend/storysphere/agents/chat_agent_base.py`
   - `build_history_messages` 支援 tool / assistant-with-tool_calls，只帶最近 N 輪 tool、防禦式配對
3. `backend/storysphere/agents/chat_agent.py`
   - `_postprocess` 改存整輪 tool 交換（chat 從 `result["messages"]` 傳入；astream 從 values 傳入）
   - `astream` 調整 stream_mode 以取得完整訊息；`_agent_invoke` 回傳/暴露 output messages 供 `_postprocess`
4. 測試
   - `tests/agents/test_states.py`：Message 帶 tool_calls 序列化、截斷、trim 不破配對
   - `tests/agents/test_chat_agent.py`：`build_history_messages` 回放配對正確、只含最近 N 輪 tool、超界降級為文字、`_postprocess` 存入 tool 交換

**無新依賴**（純用現有 LangChain message 型別 + Pydantic）。

---

## 風險 / 邊界

- **provider 配對規則**（Anthropic/OpenAI）：孤兒 `tool_calls`（無對應 ToolMessage）會 API error → 防禦式回放為必須。
- **astream 捕捉**：stream_mode 調整需實測，是本任務最不確定處；若不可行，fallback 為「astream 結束後不持久化 tool 交換、僅 chat 持久化」（降級但安全）。
- **token 成長**：截斷 + 只回放最近 1 輪 → 有界。
- **entity/pronoun 追蹤不受影響**：仍讀 assistant/user 文字。

## 回滾
純加法 + 可選欄位；`git revert` 該分支 commit 即還原，無資料遷移。

## 測試（DoD）
- `python -m pytest tests/agents` 全綠、無新增失敗
- `ruff check backend/ tests/agents` 無新增錯誤
- 新增 Message 欄位 / builder 分支 / _postprocess 皆有對應測試
