---
name: event-analysis
description: 使用者問情節的因果、哪些事件是關鍵（kernel）或枝節（satellite）、故事靠什麼推動、某件事怎麼導致另一件事時使用。
---

## 前置條件

- 需要第 1 層的 `event` 證據（入庫產生）。
- 先呼叫 `list_methods`（`query` 可帶使用者的問句），看 `event.causal_network`（EV2）與 `event.kernel_satellite`（EV1）的 `implemented`、`has_current_run`、`run_id`。
- 已有 current run 就用 `get_run` 取結果，**不要重跑**；沒有才 `run_method`。EV1 依賴 EV2 的 `causal_link`，`run_method` 會自己排上游。

## 步驟

1. `get_run(method_id="event.kernel_satellite")` 取 kernel／satellite 的結果與 `evidence_ids`；需要因果鏈時再 `get_run(method_id="event.causal_network")`。
2. 問到特定角色或章節時，用 `get_events`（`participant_id`、`chapter_from`、`chapter_to`）縮小範圍；角色 id 用 `get_entity(name=...)` 查。
3. 要說明某個結論的原文依據時，`get_evidence(evidence_id, include_trace=true)` 沿 `derived_from` 追到第 1 層，再用 `get_passage(evidence_id=...)` 取原文。
4. `run_method` 回 `queued` 時用 `get_job_status(job_id)` 等完成；`paused_quota` 就告訴使用者稍後續跑，不要重試。

## 判讀標準

- kernel：拿掉就會改變故事走向的事件（Barthes／Chatman 的「核心」）；satellite：可刪去而不影響因果主線的補充。
- 因果連結看 `strength` 與引文：引文說不出「因為」的連結，回答時標為推測。
- kernel 比例過高（例如超過一半）時要提醒使用者，判定可能過寬。

## 結果處理

- 用 `show_view(view_type="causal_graph", data_ref={"run_id": ...})` 呈現；只談幾筆時傳 `{"evidence_ids": [...]}`。
- 回答只引用工具回傳過的證據 id；結論要存下來時呼叫 `create_note`（只產生草稿，使用者確認後才寫入）。第 1 層證據不能直接當筆記引用，要引用方法產出的證據（`event_role`、`causal_link`）。
- 證據不足就說不足，不要用自己的印象補。
