# T22 書籍總覽、結果卡詳情、view 規劃（2026-11-17，使用者確認）

依據：05 §3.1、§3.2、§4（本次補 §4.1 各 view 的資料與畫法）；畫布 `docs/design/canvas/Main.dc.html`、`Detail.dc.html`；04 N-03、N-04、N-05。

## 使用者的決定

1. **View 範圍改成「有資料的先做」**：T22 做 `knowledge_matrix`（CH5）、`evidence_list`（通用），並把 `causal_graph`（EV1／EV2）、`character_arc`（CH2）、`network`（CH4）從 T24 拉進來；動手前先在 05 §4.1 補這三種的規格。`fairness_matrix` 等 MY4 做完再做；`timeline_dual`、`suspect_matrix` 的方法不做，拿掉。
2. **「存成筆記」先不放**：N-06c 還沒做，T23 做筆記畫面時一起補。
3. **審核只做確認＋拒絕**（N-05e）；「修改」往後放。

## 實作決定

- **每個角色一筆 run 的方法（CH2、CH5）**：結果卡的 `runId` 只是最新的一筆（一個角色、一章）。view 要畫的是整個分析，所以 view 依「方法產出的證據類型」取本書所有 current 證據（N-05a `claimType=`），不是只取那一個 run。詳情頁的 run 資訊列照常顯示該 run。
- **因果圖要兩個方法的證據**：EV1 只產 `event_role`，邊在 EV2 的 `causal_link`。`causal_graph` 一律取 `event`（第 1 層）＋`causal_link`＋`event_role`，有就畫粗細，沒有 `event_role`（EV2 的卡）就全部同樣粗細。
- 圖用 cytoscape（05 §2），`network` 依派系群聚用 `cytoscape-fcose`（舊 repo 同版本）。
- 「改主題材」（N-02h）沒做：題材卡只顯示判定。
- 「↗原文」開側板：N-05d，高亮引文偏移，未對上原文時標示。

## 分批

- **A（主對話）**：05 §4.1 規格；總覽（題材卡、結果卡格、也可以問、也偵測到）；詳情頁外殼（標頭、run 資訊、重跑、證據列表＋確認／拒絕、追溯、原文側板）；view 容器與 `evidence_list`。
- **B（subagent）**：`knowledge_matrix`、`character_arc`。
- **C（subagent）**：`causal_graph`、`network`（cytoscape）。

## 還原

前端改動都在 `frontend/`；規格改動在 05 §4.1。逐批 commit。
