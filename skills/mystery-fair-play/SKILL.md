---
name: mystery-fair-play
description: 推理小說中，使用者問線索公不公平、讀者能不能在揭曉前自己推出真相、某條線索指向誰、真相怎麼被藏起來或何時揭曉時使用。
---

## 前置條件

- 需要推理題材的證據：`hidden_truth`（被隱藏的真相）、`reveal`（揭曉）、`clue_points_to`（線索指向）。先 `list_genre_elements` 確認這些類型的 `count` 不是 0。
- 正式的公平性稽核是 `info.fair_play_audit`（MY4）。先 `list_methods(query="線索")` 看它的 `implemented`、`has_current_run`、`run_id`：
  - 有 current run → `get_run(method_id="info.fair_play_audit")`，不要重跑。
  - `implemented=false` → 原型尚未支援正式稽核，改走下面的「直接讀證據」，並在回答開頭說明。

## 步驟（直接讀證據）

1. `search_evidence(query=..., claim_types=["hidden_truth"])` 找出真相；每一筆用 `get_evidence(evidence_id)` 看全文與揭曉章。
2. `search_evidence(query=..., claim_types=["clue_points_to", "reveal"])` 找相關線索與揭曉，比較線索的 `discourse_chapter` 與揭曉章。
3. 對關鍵線索用 `get_passage(evidence_id=...)` 讀原文，判斷讀者當下是否看得到（偵探私下看到、敘述沒交代的不算）。

## 判讀標準

- 公平：揭曉之前，讀者可見的線索足以排除其他解釋（Knox／Van Dine 的公平原則）。
- 不公平的常見形態：關鍵線索只在揭曉時才補述；偵探掌握的事實沒交代給讀者；誤導線索在揭曉後沒有回收。
- 沒有 MY4 時**不要給公平性分數**，只列出「揭曉前出現的線索」與「揭曉時才補的資訊」，讓使用者自己判斷。

## 結果處理

- MY4 有結果時用 `show_view(view_type="fairness_matrix", data_ref={"run_id": ...})`；否則用 `show_view(view_type="evidence_list", data_ref={"evidence_ids": [...]})` 列出比對過的線索與揭曉。
- 只引用工具回傳過的證據 id；要存結論時呼叫 `create_note`（草稿，使用者確認後才寫入）。
