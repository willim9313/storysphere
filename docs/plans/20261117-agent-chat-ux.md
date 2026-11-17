# Agent 工作區的對話介面改成主流 AI chat 的用法

## 使用者的決定（2026-11-17）

- 照建議做：左側常駐對話清單、對話欄內部捲動、工具呼叫預設收合、已關閉的對話不能接著問（輸入框換成說明）。
- **設計稿跟實作一起改**：`docs/design/canvas/Agent.dc.html` 在同一批更新，之後才能從設計稿溯源到實作。

背景：UI 對齊（`20261117-ui-align-canvas.md`）照設計稿做完後，使用者實際操作發現「看既有對話」很難用：「之前的對話」是一顆按鈕，清單只寫時間與大腦，看不出每段在問什麼；對話欄跟著整頁捲，輸入框越推越下面；15 次工具呼叫全部攤開。

依據：05 §3.3；04 N-10b；與 ChatGPT／Claude.ai 的對話側欄、固定輸入框、工具呼叫收合的用法對照。

## 改什麼

1. **左側常駐對話清單**（取代「之前的對話」按鈕與頁首那一列）：最上面「＋ 新對話」與大腦選單；每段以第一個問題當標題，副行「時間 · 大腦 · N 份草稿」，目前這段標出；可收合成窄條。
2. **對話欄固定成視窗高度**：訊息區內部捲動、輸入框固定在底部、有新內容時自動捲到最下面。
3. **工具呼叫預設收合**成「使用了 N 個工具 ▸」；等待確認的寫入照舊直接顯示。
4. **已關閉的對話**：輸入框換成「這段對話已結束；按『＋ 新對話』接著問」。接著問舊對話要動 Gateway，不在這次範圍。
5. 有結果的輪次旁白折成 3 行照舊（完整內容在右側結果卡）。

## 分批

| 批 | 做什麼 | 檔案 |
| --- | --- | --- |
| A 後端 | N-10b 加 `firstQuestion`（取 session 的 `messages_json` 第一則使用者訊息，不多查） | `api/schemas/agent.py`、`api/routes/agent.py`、`tests/api/test_agent.py`、`docs/spec/04`、`frontend/src/api/generated.ts` |
| B 設計稿＋前端 | 先改 `Agent.dc.html`（版面與上面一致）並在 `docs/design/README.md` 記下本地修改；再改前端 | `docs/design/canvas/Agent.dc.html`、`docs/design/README.md`、`AgentPage.tsx`、`ChatPane.tsx`、新增 `components/agent/SessionList.tsx`、`docs/spec/05` |

## Checkpoint 四題

1. 異動檔案：見上表。
2. 現成可用：session 列已存對話（`messages_json`）；網址 `?session=` 沿用；`ss-tab` 當清單項目樣式。
3. 新依賴：無。
4. 還原：每批一個 commit，`git revert`。

## 規格同步

04 N-10b（`[api-spec updated]`）；05 §3.3（線框與原型決定）；`docs/design/README.md`（快照在本地改過，與 claude.ai 上的畫布不同步）。
