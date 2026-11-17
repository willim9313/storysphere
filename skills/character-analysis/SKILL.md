---
name: character-analysis
description: 使用者問角色怎麼變、某個角色的成長或轉折、兩個角色之間的關係怎麼發展、角色分成哪些陣營、誰在什麼時候知道什麼（誤解、被蒙在鼓裡）時使用。
---

## 前置條件

- 三個角色方法（`list_methods` 可看 `has_current_run`、`run_id`）：
  - `character.arc`（CH2）「主要角色怎麼變？」：產出 `arc_segment`，**每個角色一筆 run**（前 5 名主要角色）。
  - `character.network`（CH4）「角色分成哪些陣營？」：產出 `relation_network`，整本一筆。
  - `character.belief`（CH5）「誰在什麼時候知道什麼？」：產出 `belief_state`，**每個角色每一章一筆 run**。
- 已有 current run 就讀現成結果，**不要重跑**。`get_run(method_id=...)` 只回最新那一筆 run；CH2、CH5 要看特定角色時，改用下面的 `search_evidence`。

## 步驟

1. 角色 id：`get_entity(name="角色名")`。
2. 角色怎麼變、兩人關係怎麼發展：
   - `search_evidence(query="角色名", claim_types=["arc_segment"])` 取各角色的弧線段（`phase`、章節範圍、描述）；兩人關係就兩個角色各查一次，對照同一段章節裡彼此的變化。
   - 需要陣營或互動的整體位置：`get_run(method_id="character.network")`，再用 `get_evidence` 看 `relation_network` 的派系與中心度。
3. 誰知道什麼：`search_evidence(query="角色名", claim_types=["belief_state"])`，看到某章為止的已知、未知與錯誤認知。
4. 要原文依據時：`get_evidence(evidence_id, include_trace=true)` 沿 `derived_from` 追到第 1 層，再 `get_passage(evidence_id=...)`。只挑結論真正需要的幾筆，不要逐筆讀完。
5. 都沒有現成結果才 `run_method`；回 `queued` 時用 `get_job_status(job_id)` 等。

## 判讀標準

- 弧線看 `phase` 的轉換點與對應事件；沒有引文支持的轉折標為推測。
- 兩人關係：方法沒有直接產出「兩人關係」的證據，結論要說清楚是從兩條弧線與陣營結果比對出來的。
- 錯誤認知要指出「到第幾章為止」以及後來是否被修正。

## 結果處理

- 用 `show_view` 呈現：弧線 `character_arc`、陣營 `network`、認知 `knowledge_matrix`；`data_ref` 傳 `{"run_id": ...}` 或 `{"evidence_ids": [...]}`。
- 只引用工具回傳過的證據 id；要存結論時呼叫 `create_note`（草稿，使用者確認後才寫入）。筆記引用方法產出的證據（`arc_segment`、`relation_network`、`belief_state`），不要引用第 1 層。
