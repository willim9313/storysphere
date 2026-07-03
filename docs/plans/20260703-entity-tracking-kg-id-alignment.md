# A5 — entity tracking 全面對齊 KG canonical id

日期：2026-07-03
來源：`docs/plans/20260703-chat-agent-followups.md` 待辦 A5
分支：`feat/chat-tool-context`（接續 A4/A7）或另起

---

## 背景（A1/A3 之後的實況，已複查）

- **A1**：WS handler 從 `selected_entity` 取 canonical id → `current_focus_entity_id`；prompt hint 有 id 時指示 LLM 用 `entity_id` 精確查。**只涵蓋 UI 選取的實體。**
- **A3**：`_known_entity_names` 抓 `list_entities`（`Entity` 有 `.id`/`.name`/`.aliases`），但**只回傳 names**，id 被丟掉。字典比對出的實體只帶 name 進 `add_entity_mention(name)`。
- 結果：**文字提及**（非 UI 選取）的 KG 實體，focus 只有 name、沒有 id → 下一輪工具只能走 name fallback，即使該實體其實有明確 id。

## A5 範圍（收斂後：比原評估小）

讓「文字提及且能對到 KG 的實體」也帶上 canonical id：`_known_entity_names` 順手建**名稱→id 對照**，在兩個 `add_entity_mention` 呼叫點解析 id 傳入。

**不改**：pronoun resolution / prompt 注入仍用 name（刻意且合理，見 A5 原註）。這是**增量**，不是重寫。

### 歧義防護（核心設計點）
一個 name/alias（lowercased）對到**多個不同 id** 時 → **不設 id**（該名維持 name-only）。只有唯一對應才給 id。避免把歧義名硬綁到錯的實體（正是 A1 要解的問題，別在此重新製造）。

---

## 設計

1. **`chat_agent.py` — 建並快取名稱→id 對照**
   - `_known_entity_names` 抓 entities 的那一輪，同時建 `{name_lower: id}`（含 aliases），只保留**唯一對應**；歧義名記錄後排除。存 `self._entity_id_cache[book_id]`。
   - 新增 sync helper `_focus_entity_id(state, name) -> str | None`：讀 `self._entity_id_cache.get(state.book_id, {}).get(name.lower())`。
2. **`chat_agent_base.py` — `update_entity_state` 收 id resolver**
   - 簽名加可選 `id_resolver: Callable[[str], str | None] | None = None`；每個 entity 呼叫 `state.add_entity_mention(entity, id_resolver(entity) if id_resolver else None)`。
3. **`chat_agent.py` — 兩個呼叫點傳 resolver**
   - `_preprocess`：`update_entity_state(match, state, id_resolver=lambda n: self._focus_entity_id(state, n))`
   - `_postprocess`：迴圈改 `state.add_entity_mention(entity, self._focus_entity_id(state, entity))`

## 檔案異動

- `backend/storysphere/agents/chat_agent.py` — id 對照快取建置、`_focus_entity_id`、兩呼叫點
- `backend/storysphere/agents/chat_agent_base.py` — `update_entity_state` 加可選 resolver
- `tests/agents/test_chat_agent.py` — id 對照建置（唯一/歧義）、resolver 解析、兩路徑帶 id
- **無新依賴**

## 風險 / 邊界

- **歧義**：唯一對應才給 id（已設計防護）。
- **UI 選取 vs 文字提及並存**：兩者最終都指向同一 KG id（前端 id 源自 KG），一致；後寫者贏但值相同。
- **快取時效**：沿用 A3 的 per-book 快取假設（一次 chat session 內實體穩定）。
- **向後相容**：`update_entity_state` 新增可選參數；`add_entity_mention` 早在 A1 已支援可選 `entity_id`。純加法。

## 回滾
`git revert` 該 commit；無資料遷移、無 API 變動。

## 測試（DoD）
- `pytest tests/agents` 全綠、無新增失敗
- `ruff check backend/ tests/agents` 無新增錯誤
- 涵蓋：唯一名→id、歧義名→無 id、_preprocess/_postprocess 兩路徑帶 id、無 book_id 時安全回 None
