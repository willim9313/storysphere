# T25 Gateway＋deepagents 規劃（2026-11-17，使用者確認）

依據：05 §5.1、§5.3，04 §4.10（N-10）、N-08e–g、§5.1，架構文件「Agent Gateway」。

## 現況

- T20 已有 MCP server（`/mcp`，Bearer token）、`store/agent.create_session`、`SessionRegistry.set_turn`、`Approvals`、`session_stream`；工具的 `tool_call`／`tool_result`／`view`／`note_draft`／`approval_request` 由 MCP server 發到 EventBus 的 `session:<id>`。
- `langchain-mcp-adapters`（最新 0.3.2）要求 `mcp<2`，與 T20 的 server（`mcp` 2.3）衝突。

## 使用者決定

1. **MCP 轉接自己寫**：不用 `langchain-mcp-adapters`。Gateway 用 `mcp` 2.x 的 client 經 HTTP、帶 session token 連 `/mcp`，`list_tools` 後依白名單把每個工具包成 LangChain `StructuredTool`。路徑、token 驗證、trace 與規格相同。05 §5.1 改寫這一句。
2. **完成標準換題**：「線索公平嗎？」要 MY4，等 MY4 做完再驗。T25 改驗「福爾摩斯和華生的關係怎麼變？」（透過 `get_run` 拿現成 CH 結果、不重跑）與一個沒有現成方法的問題（組合方法並產生筆記草稿）。07 註記。
3. **範圍與分批**：A 批 Gateway＋deepagents 後端＋N-10a–k＋兩份 skill；B 批 N-08e–g。ACP 後端在 T26，畫面在 T27。

## 實作決定

- `gateway/base.py`：`AgentBackend` Protocol、`SessionConfig`、AgentEvent 寫入 helper（同 MCP server 的信封，進 `session:<id>`）。
- `gateway/service.py`：組裝 session（依題材挑 skill 複製到 `var/agent_sessions/<id>/skills/`、`create_session` 拿 token、L0 白名單）、每輪 `set_turn`、對話旁白存 `messages_json`、關 session 時 `cancel_all` 並把 open 草稿標 `discarded`。
- `gateway/deepagents_backend.py`：`create_deep_agent`，檔案工具只讀、限在 session 目錄，不給 shell；`astream_events` 轉 `text_delta`／`done`／`error`。
- 大腦模型：新 LLM task `brain`；deepagents 要能 `bind_tools`，取第一個可用模型（不包 fallback 鏈），仍經 router，不寫死 provider。
- skills 放 repo 根目錄 `skills/<name>/SKILL.md`。
- 確認存成筆記（N-06c `origin=draft`）在 T27。

## 分工

- 主對話：Gateway 組裝、deepagents 事件轉接、MCP 轉接。
- subagent：N-10 端點與 API 測試；兩份 skill 初稿。產出由主對話核對、重跑閘門。

## 驗證

測試全用 mock LLM。真的用 Gemini 驗完成標準時（估 15–25 次呼叫）先報再跑。

## 還原

新增檔案刪掉；`uv remove deepagents`；改到的既有檔案 git 還原。`var/` 不碰（session 目錄用測試的 `tmp_path`）。
