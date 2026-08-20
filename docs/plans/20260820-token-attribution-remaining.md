# Token 歸屬的最後七個缺口（B-081 擴充）

**日期**: 2026-08-20
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/agents/timeline_agent.py`、`backend/storysphere/services/epistemic_state_service.py`、`backend/storysphere/services/voice_profiling_service.py`、`backend/storysphere/services/narrative_service.py`，以及對應的 4 支 router
**前置**: PR #58（`core/llm_call.py` 已是共用入口）
**Backlog**: B-081（2026-08-19 開立，本文件補上漏記的第四個服務）

> 本文是規劃當下的評估快照，實作後凍結。與現況衝突時以程式碼為準。

---

## 1. 現況：兩種不同的缺口，B-081 只記了一種

`grep -rn "\.ainvoke(" backend/storysphere` 掃出所有沒走 `call_llm()` 的 LLM 呼叫，
扣掉 docstring 範例與 `llm_call.py` 自己，剩下這些：

| 檔案:行 | `set_llm_service_context` | `book_id` | 症狀 |
|---|---|---|---|
| `agents/timeline_agent.py:286` | ❌ 沒呼叫 | — | `service="unknown"` 或殘留值 |
| `services/epistemic_state_service.py:173` | ❌ 沒呼叫 | — | 同上 |
| `services/epistemic_state_service.py:276` | ❌ 沒呼叫 | — | 同上 |
| `services/voice_profiling_service.py:217` | ❌ 沒呼叫 | — | 同上 |
| `services/narrative_service.py:455` | ✅ `"analysis"` | ❌ **不帶** | `service` 對、`book_id=NULL` |
| `services/narrative_service.py:719` | ✅ `"analysis"` | ❌ **不帶** | 同上 |
| `services/narrative_service.py:925` | ✅ `"analysis"` | ❌ **不帶** | 同上 |
| `services/summary_service.py:118, :148` | ✅ `"summary"` | 繼承 ingestion | **刻意不動**，見 §4.2 |

**B-081 原本只記了前四列。** 後三列（narrative）的症狀不同，所以按「沒呼叫
`set_llm_service_context`」去找會直接漏掉：它有呼叫，只是第二個參數沒帶。

### 為什麼 narrative 的 `book_id` 一定是 NULL

`set_llm_service_context(service, book_id=None)` 的語意是
**「`book_id is not None` 時才覆寫」**（`core/token_callback.py:62`）—— 設計上讓進入點設一次、
下游沿用。narrative 的三處都不帶，所以它靠上游。但：

```
$ grep -rln "set_llm_book_context\|set_llm_service_context" backend/storysphere/api/routers/
（無）
```

**`api/routers/` 底下沒有任何一支 router 設過 book context。** narrative 的端點
（`api/routers/narrative.py`）直接注入 `NarrativeServiceDep` 就呼叫，中間沒有任何
ingestion workflow。contextvar 停在預設值 `None`，於是整條 narrative 路徑的 token
記進 `service="analysis"`、`book_id=NULL`。

---

## 2. 實測佐證

`var/token_usage.db`，2026-08-18（歸屬修好）之後的資料：

```
analysis    45 筆  book_id_null=0
extraction  10 筆  book_id_null=0
summary      8 筆  book_id_null=3   ← §4.2 刻意排除的兩處
keyword      6 筆  book_id_null=0
imagery      4 筆  book_id_null=0
```

已修的部分確實在運作。**上表七處一筆都沒出現**，因為那些功能 08-18 之後沒被跑過 ——
是潛伏缺口，不是已顯現的錯帳。歷史資料（4,136 列）無法回填，永遠是未歸屬。

---

## 3. 需要你裁示的一件事：service 標籤

這是 B-081 當初「沒順手修」的真正原因 —— 不是工程難度，是**分類語意**。

前端 `TokenUsagePage.tsx:139` 用
`t('token.services.${k}', { defaultValue: k })` 顯示，i18n 目前有 8 個標籤
（`frontend/src/i18n/locales/{zh-TW,en}/settings.json` 的 `token.services`）：

```
analysis 深度分析 / chat 對話 / summary 摘要 / extraction 擷取
keyword 關鍵字 / unknown 其他 / imagery 意象 / ingestion 匯入
```

未知 key 會 fallback 成原始字串 —— **不會壞，但會在畫面上露出英文 key**。

| | 選項 A：併入既有標籤 | 選項 B：各給新標籤 |
|---|---|---|
| 做法 | 四者都設 `"analysis"` | `timeline` / `epistemic` / `voice` |
| 前端 | **零改動** | 兩個 i18n 檔各加 3 個 key |
| 帳目 | 時間軸／認識論／語音側寫的花費**看不出來**，全混在「深度分析」 | 各自可見 |
| 與現況一致性 | 與 narrative 一致（它就是掛在 `analysis` 下） | 更細，但「深度分析」的定義變窄 |

`narrative` 那三處不受影響（它已經是 `analysis`，只缺 `book_id`）。

### 裁示結果（2026-08-20）：選項 A —— 四者都併入 `analysis`

前端零改動，i18n 不動。接受「時間軸／認識論／語音側寫的花費混在深度分析裡看不出來」
這個代價，換取本計畫維持純後端、且不在 token_usage 表裡留下一段用短命標籤記帳的歷史
（見 §6 的不可逆性說明）。

日後若真的需要細分，屆時新增標籤仍然可行 —— 但那時的舊列一樣不會回溯，
所以「先粗後細」與「先細後粗」的不可逆代價是對稱的，這個選擇沒有把路走死。

---

## 4. 查證出的事實

### 4.1 book_id 都拿得到，但**不在 `ainvoke` 那一層**

B-081 原記「epistemic / voice 的 `book_id` 需要從 router 往下穿，會動到公開方法簽章」。
逐一查證後：**公開方法早就有 `document_id`，要往下穿的是私有方法。**

| 服務 | 實際發出 LLM 呼叫的私有方法 | 它有 book_id 嗎 | 它的公開進入點 | 進入點有嗎 |
|---|---|---|---|---|
| `timeline_agent` | `_process_batch(pairs, events_by_id, eep_map, document_id, language)` | ✅ **有** | `infer_temporal_relations` | ✅ |
| `epistemic_state_service` | `_infer_misbeliefs(character, known_events, unknown_events, language)` | ❌ 沒有 | `get_character_knowledge(character_id, document_id, ...)` | ✅ |
| `epistemic_state_service` | `_classify_batch(events)` | ❌ 沒有 | `classify_event_visibility(document_id, ...)` | ✅ |
| `voice_profiling_service` | `_llm_qualitative(char_name, paragraphs, language)` | ❌ 沒有 | `get_voice_profile(document_id, character_id, ...)` | ✅ |
| `narrative_service` | `_call_refine_llm` / `_call_hero_journey_llm` / `_call_temporal_order_llm` | ❌ 沒有 | 三者的上層方法都收 `document_id` | ✅ |

**結論：`set_llm_service_context` 要設在公開進入點，不是設在 `ainvoke` 旁邊。**
這正是 §1 描述的 contextvar 語意（進入點設一次、下游沿用），也表示
**不需要動任何私有方法的簽章、不需要動任何 router**。

前提是那些私有方法沒有別的呼叫端會繞過公開進入點 —— 已查證：四者都只被自己的
公開方法呼叫。實作時若發現新的呼叫端，該處也要設，這一點列入 §5 Task 4 的掃描測試。

`timeline_agent._process_batch` 是唯一 `document_id` 就在手上的，但即使是它，
設在 `infer_temporal_relations` 也比設在 `_process_batch` 好 —— 一個入口一次，
而不是每個 batch 重設一次。

### 4.2 `summary_service` 兩處刻意不動（沿用 PR #58 的裁決）

它用 `raise_if_blocked` 而非 `llm_text`，刻意把「provider 拒絕」與「回空」分開
（空要重試、拒絕不重試），而 `call_llm` 會把兩者合成同一個例外。原因已寫在該處註解。
它的 `book_id` 由 ingestion 入口設好，本來就有歸屬；那 3 筆 NULL 是從別的入口
（rerun summarization）進來的，屬 §5 Task 3 的範圍。

### 4.3 遷移到 `call_llm()` 是順帶而非必須

四個服務目前直接 `llm.ainvoke()`。改走 `call_llm()` 會**同時**解決 service 標籤與
`book_id`（它的 `book_id` 是必填、無預設值）。但 `voice_profiling_service:217` 包在
`asyncio.wait_for(..., timeout=_LLM_TIMEOUT)` 裡，而 `call_llm` 自己有 `timeout` 參數 ——
兩者語意是否等價需在實作時逐一比對，**不可假設**（PR #58 對 26 個 retry 裝飾器就是這樣
逐項 dump 比對才發現「參數完全相同」的前提是錯的）。

---

## 5. 做法

### Task 1｜narrative 三處補 `book_id`（零決策，先做）

`_call_refine_llm` / `_call_hero_journey_llm` / `_call_temporal_order_llm` 的
`set_llm_service_context("analysis")` 改為帶 `book_id`。三個方法的上層都有 `document_id`，
沿著呼叫鏈傳下去即可。

不需要任何裁示、不動 service 分類、前端零影響。**單獨一個 commit。**

### Task 2｜四個服務補 service context

依 §3 的裁示，四處都設 `set_llm_service_context("analysis", book_id=...)`。
**前端零改動，i18n 不動。**

### Task 3｜順帶查清 rerun 路徑的 summary NULL

§4.2 提到的 3 筆 `summary` + `book_id=NULL`。`IngestionWorkflow.run_step` 有設
（`ingestion.py:299/525/583`），所以理論上 rerun 也該有。**這 3 筆的存在說明理論不成立**，
需要實際跑一次 `POST /books/{id}/rerun/summarization` 確認是哪條路徑漏掉。

若查出是 `rerun_step` 沒經過設 context 的入口，修法與 Task 1 同型。
**先查證再決定要不要動**，不預先假設。

### Task 4｜防回歸測試

`call_llm()` 的必填 `book_id` 已經擋住新呼叫點漏帶。但直接 `ainvoke` 的路徑沒有這層保護，
所以補一個掃描測試：**`backend/storysphere/` 底下所有 `.ainvoke(` 呼叫點，
所在函式必須能追溯到一個 `set_llm_service_context` 或 `call_llm`。**

比照 PR #58 那三個「只有 tracing.py 能提到 langfuse」的 AST 測試 —— 同樣的手法，
把「要記得寫」變成「不寫就紅」。允許清單只留 `summary_service` 兩處與 docstring 範例。

### 不做

- **歷史資料回填**。08-18 之前的 4,136 列缺 `book_id`，來源已不可考。
- **`concept_inference`**。它已經走 `call_llm()`（§1 的掃描沒掃到它），
  `project_token_attribution_partial` 記的「仍未歸屬」那一項需要複查後更新，
  但那是記憶的修正，不是程式碼工作。

---

## 6. 回滾

Task 1、2 都是在既有函式加一行／改一個參數，revert 即回到現況（回到不歸屬，不會錯歸）。
Task 4 是純新增測試。無 schema 異動、無資料遷移。

§3 已裁示為選項 A（併入 `analysis`），因此本計畫**沒有標籤層面的不可逆風險** ——
不會有任何一列用到日後可能被廢棄的短命標籤。

---

## 7. 文件同步

- 無 endpoint 異動 → `docs/API_CONTRACT.md` 不需更新
- 前端零改動（§3 裁示為選項 A）；無 CSS token 異動 → `docs/DESIGN_TOKENS.md` 不需更新
- `docs/BACKLOG.md` 的 B-081 需擴充：加入 narrative 三處，並改寫標題
  （「三個服務完全沒有 token 歸屬呼叫」已不準確）
