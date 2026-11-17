# T21 外框、書庫、入庫進度、工作中心 規劃（2026-11-17，使用者確認）

依據：05 §2、§3（畫面 1、2、工作中心）；畫布 `docs/design/canvas/`（`Library`、`Ingest`、`Jobs`，Warm 版為準）；04 N-01、N-02、N-09。

## 使用者的決定

1. **Kit 樣式**：只把畫布 `kit.css` 裡 T21 用到的 class（`ss-main`、`ss-steps`／`ss-step*`、`ss-log*`、`ss-loader` 等）抄進 `frontend/src/styles/ss-kit.css`，新開一段「原型畫布補充」；其他等用到再補。
2. **沒做的端點不放按鈕**：重跑失敗單位（N-02f）、改主題材（N-02h）先不放；失敗單位照樣顯示、題材只顯示判定結果。缺的端點記進 STATUS。
3. **章節審閱簡化版**：列出偵測到的章節（章號、標題、角色、段數），可改每章角色，確認送出（N-02e）。不做合併、切分、改標題。

## 技術

- 依賴照 05 §2 與舊 repo 的版本：`react-router-dom`（v6）、`@tanstack/react-query`、`lucide-react`。cytoscape、react-markdown 等 T22 之後用到才裝。
- API：型別一律從 `src/api/generated.ts` 取；`src/api/client.ts`（fetch＋`{detail, code}` 錯誤）參考舊 repo。
- SSE：`EventSource` 接 N-09f（書的串流）與 N-09c（job），收到事件後 invalidate 對應的 query，不在前端自己維護狀態。
- 圖示用 `lucide-react`（畫布的線條圖示就是 lucide）。
- 前端不加測試框架（閘門沒有前端測試）；用瀏覽器開實際頁面、接 `methods.db` 副本驗證。

## 分批

- **A（主對話）**：依賴、`api/client.ts`、react-query、router（05 §3 九條路由，未做的先放空頁）、外框（左側導覽列、書籍層麵包屑）、SSE hook、kit 補充樣式。
- **B（subagent）**：書庫（N-01a 列表、N-01b 上傳、N-09e 續跑、書串流更新）。
- **C（主對話）**：入庫進度（N-02a 步驟、N-02b 單位格、即時事件、N-09d 終止、N-09e 續跑、N-02d／e 章節審閱）。
- **D（subagent）**：工作中心抽屜（N-09a、終止、續跑、連到對應畫面）。

## 還原

前端改動都在 `frontend/`；`git stash` 或逐批 commit。`var/` 只複製 `methods.db` 到 scratchpad 用，不改原檔。
