# 規劃文件

涉及演算邏輯、框架整合、架構決策的任務，規劃經使用者確認後存在這裡（見 `CLAUDE.md`「規劃文件」）。已存檔的規劃不回頭修改；推翻時改的是 `docs/spec/`。

| 日期 | 檔案 | 內容 |
| --- | --- | --- |
| 2026-11-15 | [20261115-acp-spike.md](20261115-acp-spike.md) | T02：從 Python 經 ACP 驅動 Claude Code 的可行性與必要設定 |
| 2026-11-16 | [20261116-t19-rest-sse.md](20261116-t19-rest-sse.md) | T19：REST 與 SSE 的範圍切法（三批）、程式結構、04 沒寫的實作決定 |
| 2026-11-17 | [20261117-t20-mcp-server.md](20261117-t20-mcp-server.md) | T20：MCP server 的 session 識別、確認流程、事件去處、分三批 |
| 2026-11-17 | [20261117-t21-shell-library-ingest.md](20261117-t21-shell-library-ingest.md) | T21：外框、書庫、入庫進度、工作中心的範圍與分批 |
| 2026-11-17 | [20261117-t22-overview-detail-views.md](20261117-t22-overview-detail-views.md) | T22：總覽、結果卡詳情，view 範圍改成有資料的先做 |
| 2026-11-17 | [20261117-t23-evidence-notes-registry-settings.md](20261117-t23-evidence-notes-registry-settings.md) | T23：筆記端點範圍、方法論唯讀、設定頁不含大腦 |
| 2026-11-17 | [20261117-t25-gateway-deepagents.md](20261117-t25-gateway-deepagents.md) | T25：自寫 MCP 轉接（langchain-mcp-adapters 與 mcp 2 衝突）、完成標準換題、分兩批 |
| 2026-11-17 | [20261117-t26-claude-code-acp.md](20261117-t26-claude-code-acp.md) | T26：skill 經 ACP 的 plugins 帶過去、session 目錄放 repo 外（避免 CLAUDE.md 與 auto-memory） |
| 2026-11-17 | [20261117-t27-agent-workspace.md](20261117-t27-agent-workspace.md) | T27：N-06c draft、N-07e 照規格只取 run_method（大腦多半不重跑，按鈕常停用）、畫面 5 從 REST 重建 |
| 2026-11-17 | [20261117-my4-fair-play-audit.md](20261117-my4-fair-play-audit.md) | T18 MY4：一個真相一筆 run、數字由演算法算、只瞞角色的真相跳過、fairness_matrix 一起做 |
| 2026-11-17 | [20261117-ui-align-canvas.md](20261117-ui-align-canvas.md) | T28 前插入：UI 對齊設計稿，缺的 kit class 照設計稿補、同名保留，對話欄只留旁白，分五批、每批附並排截圖 |
| 2026-11-17 | [20261117-agent-chat-ux.md](20261117-agent-chat-ux.md) | Agent 對話介面改成主流 chat：左側對話清單（N-10b 加 firstQuestion）、內部捲動、工具收合；設計稿同批更新 |
| 2026-11-18 | [20261118-prototype-acceptance.md](20261118-prototype-acceptance.md) | T28 驗收：條件 1 部分通過（單位格不能點）、條件 2 通過、條件 3 不通過（agent 筆記重跑沒做）；09 不通過集中在 S2 角色合併與 S4 揭曉連結 |
| 2026-11-18 | [20261118-prototype-retrospective.md](20261118-prototype-retrospective.md) | 原型回顧：整理 11/15–11/18 對話中發現的設計、入庫品質、方法、大腦、成本、工程、UI、流程問題，給 v4 正式版重新設計用 |
