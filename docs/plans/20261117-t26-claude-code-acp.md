# T26 Claude Code（ACP）規劃（2026-11-17，使用者確認）

依據：05 §5.2、04 N-08g、T02 spike（`docs/plans/20261115-acp-spike.md`）。

## 實測決定 skill 的注入方式

同一個問題各問一次（用使用者的 Claude 訂閱，不叫 Gemini）：

| 設定 | 結果 |
| --- | --- |
| 05 §5.2 原寫法：`tools: []`、`settingSources: []`，skills 放 cwd 的 `.claude/skills/` | 看不到任何 skill（`Skill` 工具也被拿掉） |
| `tools: ["Skill"]`、`settingSources: []` | 只有 CLI 內建 skill |
| `tools: ["Skill"]`、`settingSources: ["project"]` | 看得到 skill，但 session 目錄在 repo 裡時會讀進 repo 的 `CLAUDE.md` |
| `tools: ["Skill"]`、`settingSources: []`、`plugins: [{type: local, path}]` | 看得到 `storysphere:<skill>`，沒有 `CLAUDE.md` |

**使用者決定**：skill 經 ACP 建 session 時一起帶過去（`_meta.claudeCode.options.plugins` 指向 session 目錄裡的 plugin），不靠 `settingSources`。另外發現 session 目錄在 repo 裡時，Claude Code 會依 git repo 帶進本機的 auto-memory（`MEMORY.md`），所以 Claude Code 的 session 目錄放在系統暫存目錄（repo 外），並設 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。CLI 內建 skill 仍會出現，但沒有工具可用。

## 實作

- `gateway/acp_backend.py`：每個 session 一個 adapter 子 process，由常駐 task 持有（anyio context 同 task 進出）。啟動命令讀 N-08e `launchCommand`；環境變數白名單（`HOME`、`PATH`、`USER`、`TMPDIR`、`LANG`），不傳後端金鑰。
- 建 session：MCP 帶 token、四項隔離（`tools: ["Skill"]`、`settingSources: []`、`plugins`、`strict-mcp-config`），之後 `set_session_mode("default")`；收到模式被切走的通知就切回 `default`。
- 權限分流：白名單內的 `mcp__storysphere__*` 與 `Skill` 回 `allow_once`（`add_interpretation` 的確認由 MCP server 自己發）；其餘拒絕並記一筆 `trace_calls.status=denied`。不回 `allow_always`。
- 事件：`agent_message_chunk` → `text_delta`；取消時 `conn.cancel`。`auth/status_update` 的錯誤日誌用 logging filter 擋掉。
- 大腦測試補 `npx`（`shutil.which`）、`adapter`（`initialize`）、`login`（`claude auth status`）。

## 驗證

單元測試用假的 ACP 連線；實測用 Claude 訂閱問 T25 的兩題，比對工具呼叫順序與 deepagents 大致相同，確認 Bash、寫檔、抓網頁都擋下。

## 還原

刪新檔、`uv remove agent-client-protocol`，改過的檔案 git 還原；session 目錄在系統暫存目錄。
