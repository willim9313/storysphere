# Design 畫布快照

M6 UI（T21–T24）的完成標準要對照的設計稿：Design 畫布「StorySphere v4 原型」。

- 來源：https://claude.ai/code/artifact/e5513b26-1509-4b8b-bf2c-840bd0415439
- 快照版本：`1794878714-2b8b`（2026-11-17 存入）。畫布之後若有修改，這裡不會自動更新；要更新就重新匯出整個 `canvas/`。
- `canvas/canvas.json`：artboard 索引（位置、尺寸、標題）。每個 `canvas/*.dc.html` 是一個畫面。`canvas/ds/` 是畫布用的設計系統樣式（與 `frontend/src/styles/` 同一套 token）。

| 畫面（05 §3） | 檔案 |
| --- | --- |
| 1 書庫 | `Library.dc.html` |
| 2 入庫進度 | `Ingest.dc.html` |
| 3 書籍總覽 | `Main.dc.html` |
| 4 結果卡詳情 | `Detail.dc.html` |
| 5 Agent 工作區 | `Agent.dc.html` |
| 6 筆記 | `Notes.dc.html` |
| 7 證據瀏覽 | `Evidence.dc.html` |
| 8 方法目錄 | `Registry.dc.html` |
| 9 設定 | `Settings.dc.html` |
| — 工作中心（側欄抽屜） | `Jobs.dc.html` |
| Ink 版（先前的版本，暫不更新） | `OverviewInk.dc.html`、`DetailInk.dc.html` |

## 讀的時候要知道

- **以 Warm 版為準**；Ink 版只是把總覽、詳情換主題，沒有跟著更新。
- 畫布上的書名、數字、判定、引文都是示意資料。
- **畫布早於範圍調整（2026-11-16）**：總覽畫 10 張自動結果卡、工作中心出現 MY5／TM3／TM2。實作照現況：預設卡 5 張（EV1、CH2、CH4、CH5、MY4），其餘方法顯示「尚未支援」（見 `docs/STATUS.md`）。
- **要渲染出來看，不能只讀 HTML。** 用靜態 server 開：`python3 -m http.server 5199 --directory docs/design/canvas`，瀏覽器開 `http://localhost:5199/<畫面>.dc.html`，視窗設 1440 寬。只有畫布模板的 `{{hole}}` 示意資料是空的（缺 `support.js`），版面、元件、樣式都照設計稿顯示。用 `file://` 開會缺樣式，不要用。
  - 2026-11-17 更正：這裡原本寫「不能直接用瀏覽器開」，沒驗證過，導致 T21–T27 沒人看過設計稿長相（見 `docs/plans/20261117-ui-align-canvas.md`）。
- **UI 的完成標準要附「設計稿 vs app」並排截圖**：同視窗寬、同一狀態、用真實資料；差異逐條標「已修」或「刻意不做（附理由）」。
