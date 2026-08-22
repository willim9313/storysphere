# StorySphere — 已完成 Backlog 歸檔

**用途**: 已完成項目的設計決策記錄，供日後查閱
**建立日期**: 2026-04-01

---

## B-046 建構概覽：節點「觸發建構」CTA 對接 pipeline endpoint ✅ Phase 1 完成（2026-08-11）
**背景**: 2026-05-26 的 Direction A · Diagnostic Dashboard 重設計在「status ≠ complete 且無 blockers」時規劃了帶具體動作文字的主色 CTA，但一直以 disabled 灰按鈕（「觸發建構功能規劃中」）占位，pipeline 未接。

**先修的既有 bug**: `POST /books/:bookId/rerun/:step` 的背景協程 `_run_rerun_step` 只呼叫 `update_pipeline_status`，沒有 `save_document`。`SummarizationPipeline` / `FeatureExtractionPipeline` 是就地修改 `Document`、不碰 SQLite（落盤是 workflow 的責任，見 `ingestion.py` 兩處 `save_document`），所以補跑 summarization / feature-extraction 會照呼叫 LLM、照計費，產物卻隨 request 結束消失，只有 `pipeline_status` 被標成 done。CTA 的前兩個節點正好踩在這上面，故一併修掉：
- 新增 `_DOC_MUTATING_STEPS`（`summarization`、`feature-extraction`）與 `_persist_step_output()` helper
- **失敗路徑也存**：summarization 會跳過已有摘要的章節，把 rate-limit 中斷前完成的部分存下來，才是下次補跑能「續跑」而非重跑的前提
- 存檔失敗只記 warning 不讓 task 轉 error（與 ingestion workflow 一致）
- `knowledge-graph` / `symbol-discovery` 刻意不存：產物寫進 KG / symbol store，重寫整份 chapter/paragraph row 是有成本無效果

**前端實作**（`BuildOverviewPage.tsx`）:
- `NODE_TO_TRIGGER` 對照表（與既有 `NODE_TO_ROUTE` 同層），`TriggerDef = { run, dropsDerived }`
- 觸發全部復用既有端點：`rerunStep`（summaries / keywords / symbols / kg_*）、`triggerBatchEntityAnalysis`（cep、character_analysis_result）、`triggerBatchEventAnalysis`（eep、causality_analysis、impact_analysis）。CEP 與 character_analysis_result 回報同一組計數、同一次批次產出，故共用 trigger
- 確認視窗用既有 `ConfirmDialog`；`dropsDerived` 的 run（三個 rerun step）額外加一句「既有分析結果將被刪除」——只講 token 不足以描述 `invalidate_for_steps` 的後果
- 輪詢用既有 `useTaskPolling`，不自己寫遞迴 poll
- **running 狀態用推導而非另存 state**：taskId 保留、由 `task.status` 判斷是否仍在跑。清掉 taskId 會讓輪詢查詢無法回報結束方式，且 `setState` in effect 會觸發 `react-hooks/set-state-in-effect`
- `<NodeDetail key={selectedNode.nodeId}>`：不加 key 的話切換節點時 CTA state 會殘留，A 節點的執行中狀態會顯示在 B 節點上
- 未接的節點（`teu`、`voice_profile`、`chronological_rank`、`narrative_structure` 等）維持原本的 disabled 占位

**刻意不接 `narrative_structure`**: `POST /narrative/classify` 對已失去 event EEP 快取的書會覆寫 KG 的 kernel 權重（《名字的潮汐》已受影響）。這種副作用不適合放在一鍵 CTA 後面。

**i18n**: `unraveling.cta.*`（zh-TW + en）——`node.<nodeId>.{partial,empty}` 每個節點兩句具體動作，`generic.*` 作為 `defaultValue` fallback，`confirm.*` 四句組成確認視窗文案（ConfirmDialog 用單一 `<p>` 渲染，故以連續句子而非換行組合）。

**實作**: `backend/storysphere/api/routers/books.py`、`frontend/src/pages/BuildOverviewPage.tsx`、`frontend/src/i18n/locales/{zh-TW,en}/analysis.json`

**測試**: `tests/api/test_books_rerun.py` 新增 `TestRerunPersistsDocumentOutput`（5 tests — 兩個 doc-mutating step 各驗成功與失敗都落盤、兩個非 doc step 不重寫、存檔失敗不讓 task 轉 error）

**驗證**: 真實 app 走過四種狀態——active CTA（cep「分析全書角色」）、`dropsDerived` 確認文案（kg_event）、blocker 版（teu）、無端點占位版（voice_profile）；並用 playwright route mock 驗 POST → 輪詢 → done 後 invalidate `['buildOverview', bookId]` 的完整接線與錯誤訊息呈現，未實際消耗 token。

---

## B-076 provider 封鎖／空回應在 30+ 個呼叫點都會偽裝成解析失敗 ✅ 完成（2026-08-10）

**背景**: 2026-08-10 追 B-073 時發現。B-073 的根因不是象徵路徑特有的 ——
`response.content` 直接餵給 `extract_json_from_text()` 的寫法遍及全專案：

`analysis_service`（8 處）、`tension_service`（3）、`narrative_service`（3）、
`epistemic_state_service`（2）、`timeline_agent`、`concept_inference`、
`voice_profiling_service`、`imagery_extractor`、`keyword_service`、`toc_parser`、
`chapter_role_suggester`。

任何一條路徑遇到 provider 封鎖或空回應，都會回報 `no_json_found` 或
`both_parse_failed`，而不是真正的原因。角色 / 事件 / 張力分析若曾出現這類錯誤，過去的
判斷可能都指錯了方向。

**已完成**: 象徵路徑已於 commit `1e2ef06` 修正（`_detect_block()` +
`SymbolInterpretationBlocked`），可作為其餘路徑的參考實作。

**已完成（2026-08-10）**:
- `core/error_handling.py` 新增 `LLMResponseBlocked` / `raise_if_blocked()` / `llm_text()`
  —— 與既有的 `is_rate_limit_error()` 同一個模組，都是 provider 錯誤分類，不另立新模組
- **24 處**呼叫點改用共用版（原估 20 處；`extraction_service` 與 `summary_service` 另有
  4 處不走 extractor，同樣會吞掉封鎖）
- 象徵路徑刪除本地的 `SymbolInterpretationBlocked` / `_detect_block`，改用共用版

**兩個實作時才浮現的差異**:

1. **封鎖與空回應必須分開。** 封鎖是確定性的（同一個 prompt 每次都被拒），空回應不是。
   `SummaryService` 對空摘要**刻意重試**，一律換成不可重試的例外對它是退步。因此拆成
   `raise_if_blocked()`（只管確定性的那半）與 `llm_text()`（兩者都管），summary 用前者。
2. **metadata 必須先確認是 mapping。** `MagicMock.get()` 回傳另一個 MagicMock 而非 None，
   天真讀取與「有 block_reason」無法區分 —— 這會讓套件裡每個用 MagicMock 模擬 LLM 的測試
   全部誤判成封鎖（實際踩到 33 個）。真實 provider 附帶的 metadata 形狀也本來就不一。

**維持降級語意**: `toc_parser` / `chapter_role_suggester` 仍是 `logger.warning` 後降級，
只是 log 現在講真正的原因，不再指控 JSON extractor。

---

## B-077 語言顯示名查表大小寫敏感（`zh-TW` → 「Respond in Zh.」）✅ 完成（2026-08-10）

> **2026-08-10 更正：生產路徑沒有這個問題。** 原記載說「傳入 `zh-TW` 回傳簡體」——
> 那個 `zh-TW`（大寫）是**驗證腳本自己寫死的**，不是系統會傳的值。DB 存的是小寫
> `zh-tw`，`get_document_language()` 原樣回傳，查表得到 "Traditional Chinese"。
> 以生產路徑實測，輸出確為繁體。

**但查表本身是個真陷阱，已一併修掉**:

`get_language_display_name()` 原本大小寫敏感，且 fallback 是
`lang_code.split("-")[0].capitalize()`。因此任何**大寫或帶未知地區碼**的值都會落空：

```
zh-TW -> 'Zh'      zh-CN -> 'Zh'      zh-hk -> 'Zh'
```

結果不是報錯，而是 prompt 變成一句沒有意義的「**Respond in Zh.**」，模型只能猜。
影響 12 個模組、28 個呼叫點。

**這類 bug 咬過一次**: `tests/core/test_language_detection.py` 早有
`test_bare_zh_maps_to_chinese_not_capitalized_code`，註解就寫著「the meaningless prompt
directive "Respond in Zh."」。當時的修法是往表裡補 `zh` 條目，沒動查表邏輯；而
`test_zh_tw_maps_to_traditional_chinese` 只用小寫問，**測試自己選的大小寫讓大寫變體活了下來**。

**已完成（2026-08-10）**: 查表改為大小寫不敏感；未知地區碼回退到基礎語言而非代碼本身
（`zh-hk` → Chinese、`en-GB` → English）。新增大小寫與地區回退的測試。

---

## B-049 累積 Lint 債清理（ruff + eslint） ✅ 完成（2026-07-01）

**背景**: refactor/lightweight 分支長期未跑 lint 清理，合併前盤點發現 `ruff check src/` 有 194 個錯誤（154 個 `--fix` 可自動修，含 I001 import 排序、F401 unused import、F841、B905、E741 等）、前端 `eslint src` 有 39 個錯誤（react-refresh/only-export-components、set-state-in-effect 等）。皆為既有風格債，不影響正確性，故與扶正 main 的合併解耦、獨立處理。

**進度（2026-07-01，全部完成）**:
- ✅ 後端 ruff：194 → **0**（`chore/lint-cleanup`）
- ✅ 前端 eslint 安全子集：39 → **20**（`chore/lint-cleanup`）
- ✅ 前端 react-hooks 高風險 20 個 → **0**（`chore/lint-react-hooks`）
  - `refs ×1`：`onDoneRef.current` 移進 `useLayoutEffect`
  - `exhaustive-deps ×4`：`?? []` 表達式改用 `useMemo` 包覆
  - `set-state-in-effect ×11`：task-polling / DOM-measurement effects 加 eslint-disable block comment
  - `preserve-manual-memoization ×2`：移除 `cardRef` 的 `useCallback`；`sortedEvents` 改用中間變數
  - `immutability ×2`：重構 `useWebSocketChat` deps 後自然消失
- ✅ 驗證：`npm run lint` → 0 problems

---

## B-043 閱讀頁：欄 2 章節搜尋 ✅ 完成（2026-05-14）
**背景**: 欄 2 章節列表為純線性排列，用戶記得角色或關鍵詞但不記得章節時摩擦極高。
**實作**:
- `ReaderPage.tsx`：`searchQuery` state + `useMemo` filter（title / topEntities[].name / keywords）
- 欄 2 結構改為 `flex flex-col`，搜尋欄 sticky、章節列表獨立 scroll
- 選章節時自動清空搜尋（`handleSelectChapter` 內加 `setSearchQuery('')`）
- 結果為空時顯示 empty state（i18n `searchEmpty` key）
- `BezierConnectors`：`chapterCount` prop 改為 `chapterKey`（filtered id 串接字串），確保過濾後 DOM 重算
- Opus review 後修正：`e.name?.` null guard、Rules of Hooks（useMemo 移到 early return 前）

---

## B-044 閱讀頁：EpistemicSidePanel 入口可發現性優化 ✅ 完成（2026-05-14）
**背景**: Brain icon 按鈕無文字說明，功能完全不可發現；`title` tooltip 在行動裝置不顯示。
**實作**:
- Brain button 加常態文字標籤（`角色視角` / `收起`），`minWidth: 5rem` 防寬度跳動
- 首次進入 onboarding popover：`localStorage` flag `storysphere:reader-epistemic-hint-shown`，5 秒 auto-dismiss 或點擊消失，z-index 20
- `EPISTEMIC_HINT_KEY` 提取為 module 層級常數（防 magic string 重複）
- localStorage 讀寫均加 try/catch（Safari 隱私模式防護）
- useEffect timer 內 inline dismiss 邏輯（避免 stale closure lint 警告）
- 新增 i18n key：`epistemicLabel`、`epistemicClose`、`epistemicHint`（zh-TW + en）

---

## Wave 1 — 底層基礎建設 ✅ 全部完成（2026-04-28）

### F-02 進度感知 KG（章節時間切片）✅ 完成（2026-04-24，commit `4be9613`）
**分類**: 底層基礎 — Wave 1 核心

**已實作內容**:
- Domain: `Entity` / `Relation` / `Event` 新增時態欄位（`valid_from/to_chapter`, `chron_index`）；新增 `TimelineConfig` / `TimelineDetectionResult` model
- `KGService.get_snapshot(mode, position)` — 支援 chapter 模式與 story chronology 模式
- `TemporalPipeline` Step 8 分配 `chron_index`，回填 `Entity.first_chron_index`
- Ingestion 自動偵測章節結構，建立 `TimelineConfig`
- API: `GET /graph?mode=&position=`、`GET/PUT /timeline-config`、`POST /detect-timeline`
- 前端: `TimelineControls`（浮動面板，debounced slider）、`TimelineConfigModal`（confirm dialog）
- `GraphPage` + `UploadPage` 已整合

**解鎖**: F-03、F-05（What-If）、F-12（閱讀記憶）、F-13（Role Agent）

---

### F-01 隱性關係推論（KG Link Prediction）✅ 完成（2026-04-27）
**分類**: 加分項（無硬依賴）

**已實作內容**:
- Domain: `InferredRelation`（含 `visible_from_chapter`、`confidence`、`status`）
- `LinkPredictionStore`：aiosqlite SQLite 持久化
- `LinkPredictionService`：Common Neighbors + Adamic-Adar 算法，規則型關係分類，confirm/reject 流程
- API: `POST /inferred-relations/run`、`GET /inferred-relations`、`POST .../confirm`、`POST .../reject`
- `GET /graph?include_inferred=true`：推斷邊以 `inferred=true` 附加，快照過濾時使用 `visible_from_chapter`
- 前端：Cytoscape 虛線邊（amber 色）、GraphToolbar Toggle、`InferredEdgePanel`（確認/否定 UI）
- **注意**: Neo4j 支援缺口仍追蹤於 B-048（原 B-035，2026-06-30 重編以解除與本檔「坎伯英雄旅程」B-035 的撞號）

---

### F-03 角色認識論狀態 ✅ 完成（2026-04-25，commit `4729861`）
**分類**: 底層基礎 — Wave 1 核心

**已實作內容**:
- EventNode 新增 `visibility: Literal["public", "private", "secret"]` 欄位
- `backend/storysphere/services/epistemic_state_service.py`：計算角色認識論狀態
- Domain Model：`CharacterEpistemicState`（known_events, unknown_events, misbeliefs）
- API 端點：`GET /books/:bookId/entities/:entityId/epistemic-state?up_to_chapter={N}`

**解鎖**: F-05（What-If 約束）、F-10（敘事視角分析）、F-13（Role Agent 認識論邊界）

---

### F-04 角色語音側寫（Voice Profiling）✅ 完成（2026-04-25）
**分類**: 底層基礎 — Wave 1

**已實作內容**:
- `backend/storysphere/domain/voice.py`：`VoiceFingerprint` Pydantic model（定量指標 + LLM 質性描述 + 代表性引文）
- `backend/storysphere/services/voice_profiling_service.py`：用 Qdrant 語意搜索 + 量化特徵提取 + LLM 質性描述
- API 端點：`GET /books/:bookId/entities/:entityId/voice`（同步，SQLite cached）
- 前端：角色詳情面板新增「Voice Profile」tab（展示指紋 + 代表性引文）

**解鎖**: F-10（敘事視角）、F-13（Role Agent 對話風格約束）

---

## B-040 符號深度分析（Symbol Deep Analysis）✅ 完成（2026-04-22）
**背景**: B-022 SEP 完成後的下一層 — 以 SEP 為輸入，LLM 產出符號意義命題與跨層連結。架構類比 B-027~B-029（TensionLine → TensionTheme）與 B-026（CEP → CharacterAnalysisResult）。

**內容**:
- `domain/symbol_analysis.py` 新增 `SymbolInterpretation` — 欄位：`theme` / `polarity`(positive|negative|neutral|mixed) / `evidence_summary` / `linked_characters` / `linked_events` / `confidence` / `review_status`(pending|approved|modified|rejected)
- `services/symbol_analysis_service.py` — `SymbolAnalysisService.analyze_symbol(imagery_id, book_id, ...)` cache-first，讀取 SEP → LLM 詮釋 → 存入 `symbol_analysis:{book_id}:{imagery_id}`；`update_interpretation_review()` 支援 HITL
- `agents/analysis_agent.py` — `AnalysisAgent.analyze_symbol()` 入口，async task + metrics tracking
- API endpoints：
  - `POST /api/v1/symbols/{imagery_id}/analyze` → 202 + task_id
  - `GET  /api/v1/symbols/{imagery_id}/analyze/{task_id}` 輪詢
  - `GET  /api/v1/symbols/{imagery_id}/interpretation?book_id=` 取回詮釋
  - `PATCH /api/v1/symbols/{imagery_id}/interpretation` HITL review（可修改 theme/polarity）
- Unraveling DAG：Layer 3 新增 `symbol_analysis_result` 節點，edges `sep→` / `kg_entity→` / `kg_event→`；cache.count_keys 統計 `symbol_analysis:{book_id}:%`

**關鍵設計**:
- LLM 產生的 `linked_characters` / `linked_events` 必須在 SEP 的 `co_occurring_*_ids` 白名單內，超出範圍會被過濾（防幻覺）
- `confidence` clamp 到 [0.0, 1.0]；`polarity` 強制四選一，非法值 fallback 到 `"neutral"`
- tenacity retry 3 次（ValueError / KeyError），透過 `extract_json_from_text` 容錯 LLM 輸出
- 跨書比較（optional）延後評估，複雜度高

**實作**: `backend/storysphere/domain/symbol_analysis.py`（SymbolInterpretation）, `backend/storysphere/services/symbol_analysis_service.py`, `backend/storysphere/agents/analysis_agent.py`（analyze_symbol）, `backend/storysphere/api/routers/symbols.py`（analyze/interpretation endpoints）, `backend/storysphere/api/routers/unraveling.py`（symbol_analysis_result node）

**測試**: `tests/services/test_symbol_analysis_service.py`（9 tests — cache hit/miss/force、LLM ID 過濾、confidence clamp、polarity 校驗、HITL review）、`tests/api/test_symbols.py`（新增 analyze/interpretation/review 測試）、`tests/api/test_unraveling.py`（加入 `symbol_analysis_result` 到 expected nodes）

---

## B-008 Neo4j Backend ✅ 完成
**背景**: ADR-009 設計為 NetworkX（預設）↔ Neo4j（大規模可選），`kg_mode='neo4j'` 有 settings 但未實作。
**內容**:
- `KGServiceBase` ABC 定義 16 個抽象 method
- `Neo4jKGService` 使用 neo4j async driver v6（`properties(r)` 取代 `.data()` 序列化 tuple bug）
- Runtime 切換：`POST /api/v1/kg/switch`，清除 lru_cache，不需重啟
- 雙向遷移：`POST /api/v1/kg/migrate`（nx↔neo4j），async task + task_store 追蹤
- `GET /api/v1/kg/status` 顯示目前 backend、counts、連線狀態
- 前端 `/settings` 頁面：mode toggle、stats、migration 進度
- books.py 移除 `kg._graph` 直接存取，改用公開 API

**注意事項**:
- neo4j driver v6：`result.data()` 將 relationship 序列化為 tuple，需用 `properties(r)` in Cypher
- Pydantic `to_camel` 對 `neo4j_*` 欄位會產生 `neo4J*`（數字後大寫），改用 `graph_db_*` 命名迴避
- 前端型別必須用 `npm run gen:types` 生成，避免手寫欄位名錯誤

**實作**: `backend/storysphere/services/kg_service_base.py`, `kg_service_neo4j.py`, `kg_migration.py`; `backend/storysphere/api/routers/kg_settings.py`; `frontend/src/pages/SettingsPage.tsx`

---

## B-001 Relations Router（API 層遺漏）✅ 完成
**背景**: Phase 8 guide 有規劃但未實作
**內容**:
- `GET /api/v1/relations/paths?source_id={id}&target_id={id}` — 兩實體間關係路徑
- `GET /api/v1/relations/stats?entity_id={id}` — 全圖關係統計（entity_id 可選）

**實作**: `backend/storysphere/api/routers/relations.py`，已掛載至 `main.py`

---

## B-002 Documents Router（API 層遺漏）✅ 完成
**背景**: 架構圖有 Card Details，但沒有文件查詢 API
**內容**:
- `GET /books` — 列出已 ingest 的書籍
- `GET /books/:bookId` — 書籍詳情（含 chapters 列表）

**實作提示**: 呼叫已有的 `DocumentService.list_documents()` 和 `get_document()`
**備註**: 前端已對齊 `API_CONTRACT.md` 的 `/books` API（2026-03-15 重構完成）

---

## B-003 TaskStore 持久化（多進程安全）✅ 完成
**背景**: 目前 `api/store.py` 是 in-memory dict，多 worker (`uvicorn --workers 4`) 時 task 狀態會丟失
**實作**: `SQLiteTaskStore`（WAL mode）+ 啟動時自動清理 TTL 過期 task
**設定**: `task_store_backend`, `task_store_db_path`, `task_store_ttl_days`（預設 30 天）

---

## B-004 Langfuse 監控整合 ✅ 完成
**背景**: 改用 Langfuse（支援自託管）替代 LangSmith
**實作**:
- `backend/storysphere/core/tracing.py` — `configure_langfuse()` + `get_langfuse_handler()` singleton
- `backend/storysphere/agents/chat_agent.py` — `ainvoke`/`astream` 注入 `CallbackHandler`
- `backend/storysphere/agents/analysis_agent.py` — `@_langfuse_observe` 取代 `@traceable`
- Settings: `langfuse_enabled`, `langfuse_public_key`, `langfuse_secret_key`, `langfuse_base_url`
- **文件**: `docs/guides/LANGFUSE_SETUP.md`

---

## B-005 Analysis WebSocket 推送 ✅ 完成
**背景**: ADR-004 設計是 task_id → **WebSocket 主動推送**結果，目前只實作了 polling
**內容**:
- `WS /ws/tasks/{task_id}` — 客戶端訂閱 task_id，server 主動推送 TaskStatus 更新
- `api/ws_manager.py` — ConnectionManager singleton（task_id → list[WebSocket]）
- background task 在 running / done / error 時呼叫 `manager.push()`
- 連接後立即回傳目前狀態；若已 done/error 則直接關閉；進行中每 30s 送 ping

---

## B-006 Metrics API 端點 ✅ 完成
**背景**: Phase 7 `MetricsCollector` 收集了 7 個 KPI，但無法從外部查詢
**內容**:
- `GET /api/v1/metrics` — 回傳 `MetricsCollector.get_stats()` 的快照
- 可選：`GET /api/v1/metrics/history` — 近 N 筆 JSON-line logs（略過，MetricsCollector 未維護 rolling buffer）
**實作**: `backend/storysphere/api/routers/metrics.py`，直接呼叫 `get_metrics().get_stats()`

---

## B-007 多語系 `language` 參數統一傳遞 ✅ 完成
**背景**: CORE.md 多語系策略：透過 `output_language` 參數控制，但 API / Chat Agent 層未統一傳遞
**內容**:
- Chat WebSocket 訊息加入 `language` 欄位（預設 `"en"`）
- `ChatAgent.chat()` / `astream()` 接受 `language` 參數並注入 system prompt
- 同步查詢 API 加入 `?language=zh` query param（影響 summary 等文字輸出）
**備註**: `ChatState.language` 持久保留 session 語言；entity analyze endpoint 加 `language` query param 並傳給 `AnalysisAgent`

---

## B-009 GetChapterSummaryTool 完整實作 ✅ 完成
**背景**: CORE.md 工具目錄 Tool #15 目前是 stub
**內容**: 實作完整邏輯（目前 `DocumentService.get_chapter_summary()` 已存在，接線即可）
**備註**: `chapter_number` 為必填（與 GetSummaryTool 的可選設計不同），已加入 `get_chat_tools()` 作為第 6 個 Retrieval Tool

---

## B-010 Composite Tool #5 ✅ 完成
**背景**: CORE.md 設計 3-5 個 composite tools，目前只有 4 個
**實作**: `GetEventProfileTool` — 輕量級 no-LLM 事件資料聚合器（事件屬性 + 參與者 + timeline context + 段落 + 章節摘要）

---

## B-013 LLMKeywordExtractor 回傳解析強化 ✅ 完成
**背景**: 本地小模型（3B）回傳 JSON 不穩定，`_parse_response` 目前有三個脆弱點：
1. 只處理 ` ``` ` 開頭的 markdown fence，若 LLM 在 JSON 前加說明文字（如 `Here are the keywords:\n{...}`）直接 `JSONDecodeError`
2. 不嘗試從回傳內文中抽取 `{...}` substring，整段不是合法 JSON 就失敗
3. `retry` 只重試 `JSONDecodeError / ValueError / KeyError`，LLM API 錯誤不觸發 retry

**修法**: 在 `_parse_response` 加 regex 抽取第一個 `\{.*\}` block（`re.search(r'\{.*\}', content, re.DOTALL)`）再 parse

**相關檔案**: `backend/storysphere/services/keyword_service.py` — `LLMKeywordExtractor._parse_response()`

---

## B-015 Chat Agent Prompt & Flow Review ✅ 完成
**背景**: Chat Agent 目前會直接傾倒工具原始輸出，未根據使用者問題整理回應。已加 `RESPONSE RULES` 但屬於臨時修補。
**內容**:
- 全面審視 `_SYSTEM_PROMPT`（`chat_agent.py`）的指令品質
- 審視各 tool 的 `description` 是否足夠精確（影響 LLM tool selection 準確率）
- 審視 `QueryPatternRecognizer` fast-route 邏輯與 agent loop 的分工
- 審視 `_build_context_prompt` 動態注入的 context 格式
- 考慮加入 few-shot examples 或輸出格式指引
**完成內容**: LangGraph 低階 API 遷移 + Prompt & Tool Description 全面重構

---

## B-016 Chat Context 切頁殘留 ✅ 完成
**背景**: 從 Reader 切到 Graph 頁面時，chat agent 仍參考 Reader 的 chapter 資料。
**原因**:
1. 前端 `setPageContext` 用 merge（`{ ...prev, ...ctx }`），Graph 頁面未清除 `chapterId` / `chapterTitle`
2. 後端 `ChatState` 的 `book_id` / `chapter_id` 是 per-session 持久的，新訊息的 context 會覆蓋但舊欄位不會自動清除
**修法**:
- 各頁面 `setPageContext` 應重置不屬於該頁面的欄位（如 Graph 清 `chapterId`/`chapterTitle`）
- 後端 WebSocket handler 在 hydrate context 時，將未提供的欄位重置為 `None`

---

## B-023 Event 節點張力欄位強化 ✅ 完成
**背景**: 張力分析的觸發機制依賴 Event 節點的 `tension_signal` 標記。原 ingestion pipeline 提取 Event 節點時未產出此欄位，TEU 組裝無法啟動。
**設計文件**: `docs/plans/20260331-tension-analysis-design-notes.md` Section 五
**實作**:
- 更新 `backend/storysphere/domain/models.py` EventNode schema，新增三個欄位：`tension_signal`, `emotional_intensity`, `emotional_valence`
- 更新 `backend/storysphere/pipelines/entity_extractor.py` 的 Event 提取 prompt
- 與 B-031 合併為一次 migration（EventNode schema + ingestion prompt 只改一次）

---

## B-024 Concept 節點 surface/inferred 分類強化 ✅ 完成
**背景**: 張力分析用 Concept 節點描述對立極點，需區分「文本直接說出的概念」（surface）和「LLM 推斷的命題」（inferred），兩者可信度不同。
**設計文件**: `docs/plans/20260331-tension-analysis-design-notes.md` Section 四
**實作**:
- 更新 ConceptNode schema，新增：`extraction_method`, `source_spans`, `inferred_by`, `confidence`
- Ingestion pipeline 自動標記 `extraction_method="ner"`

---

## B-025 Pre-Analysis Step：Inferred Concept 節點產生流程 ✅ 完成
**背景**: Inferred Concept 節點（LLM 從段落群推斷的抽象命題）不在 ingestion 時產出，而是 TEU 組裝的前置作業。
**前置依賴**: B-024
**實作**: `backend/storysphere/pipelines/concept_inference.py` — 輸入候選段落群，LLM 產出帶置信度的 Concept 標籤，存入 KG

---

## B-026 TEU Domain Model + 組裝 Pipeline（模式 B 優先）✅ 完成
**背景**: TEU（Tension Evidence Unit）是張力分析的最小單元，描述一個場景內的對立關係。模式 B（按需、單 Event 觸發）優先實作。
**前置依賴**: B-023, B-024, B-025
**實作**:
- `backend/storysphere/domain/tension.py`：`TensionPole`, `TEU`, `TensionLine`, `TensionTheme` Pydantic models
- `backend/storysphere/services/tension_service.py`：`assemble_teu(event_id)` + 存取層

---

## B-027 TensionLine 自動 grouping + HITL 審核介面 ✅ 完成
**背景**: TensionLine 是跨場景的對立模式，由多個 TEU 群集而成。需 HITL 介入防止概念相似但獨立的主題被錯誤合併。
**前置依賴**: B-026
**實作**:
- 自動 grouping：概念相似性（向量距離）+ 承載者重疊兩個維度
- API 端點：`GET /api/v1/tension/lines` + `PATCH /api/v1/tension/lines/{id}/review`
- 前端 HITL 審核元件

---

## B-028 模式 A：全書掃描批次 TEU 組裝 ✅ 完成
**背景**: 對全書所有 `tension_signal != "none"` 的 Event 節點批次組裝 TEU，作為完整分析的入口。
**前置依賴**: B-026
**實作**:
- `TensionService.analyze_book_tensions(book_id)` — `asyncio.gather` 並發批次組裝
- API 端點：`POST /api/v1/tension/analyze` → task_id（異步，WebSocket 推送進度）

---

## B-029 TensionTheme 合成 + Frye/Booker 標籤對應 ✅ 完成
**背景**: TensionTheme 是全書層面的張力主題命題，由多條 TensionLine 合成，LLM 產出命題草稿，人工審核確認。
**前置依賴**: B-027
**實作**:
- `TensionService.synthesize_theme(book_id)`
- API 端點：`GET /api/v1/tension/theme` + `PATCH /api/v1/tension/theme/{id}/review`
- `backend/storysphere/config/mythos.py`（Frye/Booker 標籤，類比 `archetypes.py`）

---

## B-030 張力分析與 Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將 B-023 ~ B-029 所有元件串連為完整端到端工作流：ingestion → TEU → TensionLine（HITL）→ TensionTheme（人工審核）。
**前置依賴**: B-028, B-029
**實作**:
- 完整流程文件：`docs/guides/tension-analysis.md`
- 前端：張力分析儀表板（TensionLine 軌跡圖、TEU 列表、TensionTheme 命題展示）

---

## B-031 Event 節點敘事學欄位預留 ✅ 完成（已與 B-023 合併）
**背景**: Kernel/Satellite 分類和熱奈特時序分析都依賴 Event 節點的新欄位，應在 ingestion 時以預設值填入。
**設計文件**: `docs/plans/20260331-narratology-analysis-design-notes.md` Section 五
**實作**（與 B-023 合併為一次 migration）:
- 更新 `backend/storysphere/domain/models.py` EventNode，新增：`narrative_weight`, `narrative_weight_source`, `story_time`
- 新增 `StoryTimeRef` schema（`relative_order`, `time_anchor`, `absolute_time`, `confidence`）

---

## B-032 Ingestion prompt 時間線索提取預留 ✅ 完成
**背景**: 熱奈特時序分析需要故事時間軸，ingestion 時提取文本中已存在的時間線索成本低。
**實作**: `backend/storysphere/services/extraction_service.py` — `story_time_hint` 欄位已在 Event 提取 prompt 中（確認實作時發現已完成）

---

## B-033 Kernel/Satellite 第一階段：摘要啟發式分類 ✅ 完成
**背景**: 現有層級摘要隱含粗略重要性分層，直接作為 Kernel/Satellite 第一階段信號。
**實作**:
- `backend/storysphere/domain/narrative.py`：`NarrativeStructure`, `HeroJourneyStage`, `ProppFunctionRef`, `KernelSatelliteResult`
- `backend/storysphere/services/narrative_service.py`：`classify_by_heuristic(document_id)`, `get_kernel_spine(document_id)`

---

## B-034 Kernel/Satellite 第二階段：LLM 細化分類 ✅ 完成
**背景**: 啟發式結果有誤差，特別是出現在章節摘要但語義上是渲染性的事件。
**實作**: `NarrativeService.refine_with_llm()` — 預設對所有 satellite 進行 LLM 二次判斷；LLM 優先，分歧以 WARNING 記錄

---

## B-035 坎伯英雄旅程 LLM 結構對應 ✅ 完成
**背景**: 輸入章節摘要序列，LLM 輸出英雄旅程階段映射。
**實作**:
- `backend/storysphere/config/hero_journey.py`：12 階段 loader + `get_hero_journey_summary()`
- `backend/storysphere/config/hero_journey/hero_journey_{en,zh}.json`：階段定義
- `NarrativeService.map_hero_journey(document_id)`：章節範圍允許重疊；無證據的階段省略

---

## B-036 NarrativeStructure 節點儲存 + 查詢介面 ✅ 完成
**背景**: 整合 Kernel/Satellite 和英雄旅程結果，提供 API 查詢介面。
**實作**:
- `backend/storysphere/api/schemas/narrative.py`：request schemas
- `backend/storysphere/api/routers/narrative.py`：9 個端點（async classify/refine/hero-journey + polling + sync kernel-spine + GET/PATCH structure）
- `NarrativeService.get_cached_structure()` + `update_review()`

---

## B-037 熱奈特時序分析（倒敘/預敘識別）✅ 完成
**背景**: 文本位置排名 vs 故事時間排名的差值，量化倒敘/預敘。
**前置條件**: story_time_hint 覆蓋率 ≥ 60%（透過 GET /narrative/temporal/coverage 確認）
**實作**:
- `backend/storysphere/domain/narrative.py`：`TemporalAnalysis`, `TemporalDisplacement`
- `NarrativeService.check_temporal_coverage()` + `analyze_temporal_order()`
- API 端點：`POST /api/v1/narrative/temporal` + `GET /narrative/temporal/coverage`

---

## B-038 敘事結構視覺化 + Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將敘事學模組整合為端到端工作流並提供入口。
**實作**:
- `AnalysisAgent.analyze_narrative(document_id)` — 依序執行 heuristic → LLM refine → hero journey
- `AnalysisAgent.__init__` 加入 `narrative_service` 參數
- `docs/guides/narratology.md`：完整流程文件

---

## I 系列（多語系 / i18n）— I-01 ~ I-09 ✅ 全部完成（2026-04-24）

**技術選型**: `react-i18next` + `i18next`
**完成範圍**: 所有 9 個 ticket，涵蓋前端全部 35+ 元件 / 頁面
**字串數**: 約 380–420 個（共 10 個 namespace JSON 檔 + frameworksData.ts 雙語資料）

### I-08：其餘頁面（settings.json + chat.json）

**工作量**: ~2 小時
**涉及元件**: `pages/SettingsPage.tsx`、`pages/TokenUsagePage.tsx`、`pages/SymbolsPage.tsx`、`pages/UnravelingPage.tsx`、`components/chat/ChatWindow.tsx`
**預估字串數**: ~75 個
**實作說明**: SettingsPage / TokenUsagePage / SymbolsPage / ChatWindow 在 I-01~I-07 commit 時已順帶完成。UnravelingPage 的 `STATUS_LABEL`、`COUNT_LABELS`、`'not built'`、`'KG Features'` 在 I-08 專屬 commit 中遷移，新增 `unraveling.*` keys 至 analysis.json，並將 module-level const 重構為 `t()`-backed helper function（`statusLabel`、`countLabel`），TFunction 透過 `buildElements` 和 `getSubLabel` 參數傳入以支援 cytoscape canvas 標籤翻譯。

### I-09：框架索引頁（frameworks.json）⚠️ 特殊處理

**工作量**: ~3 小時
**涉及元件**: `pages/FrameworksPage.tsx`
**預估字串數**: 142+ 個（最大單頁）
**實作說明**: 採用雙層策略。UI 骨架字串（目錄、參考文獻、全站提示）存於 `frameworks.json` namespace。大量靜態內容資料（Jung/Schmidt 原型、英雄旅程、Frye/Booker 框架、SEP 步驟，共 6 個 framework × zh-TW + en）提取至 `src/data/frameworksData.ts`，以 `getFrameworks(lang)` 根據語言回傳對應資料集，FrameworksPage 透過 `i18n.language` 取得當前語言並載入對應資料。

**實作**: `frontend/src/data/frameworksData.ts`（Framework 介面 + FRAMEWORKS_ZH + FRAMEWORKS_EN + getFrameworks）, `frontend/src/i18n/locales/{zh-TW,en}/frameworks.json`, `frontend/src/i18n/index.ts`（新增 frameworks namespace）

---

### I-01 ~ I-07 詳細內容

### I-01：基礎設置

**工作量**: ~1–2 小時
**內容**:
- `cd frontend && npm install react-i18next i18next`
- 建立 `frontend/src/i18n/index.ts` — 初始化 i18next（語言偵測、fallback=en）
- 建立翻譯檔目錄結構：
  ```
  frontend/src/i18n/
    index.ts
    locales/
      zh-TW/
        common.json     ← 共用字串（取消、確認、載入中…）
        nav.json        ← 導覽 / Sidebar
        library.json    ← 書庫相關
        upload.json     ← 上傳相關
        analysis.json   ← 深度分析
        graph.json      ← 圖譜
        reader.json     ← 閱讀器
        settings.json   ← 設定 / Token 用量
        chat.json       ← 對話介面
        frameworks.json ← 框架索引（大量靜態內容）
      en/
        (同上結構)
  ```
- `frontend/src/main.tsx` 引入 `i18n/index.ts`
- Sidebar 新增語言切換按鈕（zh-TW / EN），以 `i18n.changeLanguage()` 切換

---

### I-02：共用字串（common.json）

**工作量**: ~1 小時
**涉及元件**: `components/ui/ConfirmDialog.tsx`、`components/library/StatusBadge.tsx`、`components/analysis/AnalysisListItems.tsx`
**預估字串數**: ~20 個
**代表字串**: 取消、確認、載入中…、搜尋…、重試、錯誤、已分析、尚未分析、處理中、已就緒、已完成、建立、觸發分析失敗，請稍後再試。

---

### I-03：導覽 & 書庫（nav.json + library.json）

**工作量**: ~1.5 小時
**涉及元件**: `components/layout/Sidebar.tsx`、`components/layout/BookNav.tsx`、`pages/LibraryPage.tsx`、`components/library/BookCard.tsx`、`components/library/EmptyLibrary.tsx`、`components/library/RecentBookCard.tsx`
**預估字串數**: ~45 個
**代表字串**: 書庫、上傳、框架索引、Token 用量、系統設定、閱讀、角色分析、事件分析、知識圖譜、時間軸、張力分析、符號意象、建構概覽、最近開啟、全部、已分析、上傳新書、繼續閱讀、開始閱讀、查看處理進度、確認、取消、刪除書籍

---

### I-04：上傳 & 處理（upload.json）

**工作量**: ~1 小時
**涉及元件**: `pages/UploadPage.tsx`、`components/upload/DropZone.tsx`、`components/upload/ProcessingTimeline.tsx`
**預估字串數**: ~25 個
**代表字串**: 上傳 & 處理進度、書籍名稱、作者、留空則由系統自動從文件 metadata 獲取、取消、確認上傳、進入書籍、拖曳 PDF 至此，或點擊選擇檔案、支援 .pdf 格式、PDF 解析、語言偵測、摘要生成、特徵提取、知識圖譜、符號探索、資料儲存

---

### I-05：深度分析（analysis.json）

**工作量**: ~2 小時
**涉及元件**: `pages/CharacterAnalysisPage.tsx`、`pages/EventAnalysisPage.tsx`、`components/analysis/CharacterAnalysisDetail.tsx`、`components/analysis/EventAnalysisDetail.tsx`、`components/analysis/AnalysisListItems.tsx`、`components/analysis/BatchEepPanel.tsx`
**預估字串數**: ~60 個
**代表字串**: 已分析、尚未分析、搜尋…、選擇角色以查看或生成分析、生成分析、覆蓋重新生成、角色簡介、Jung 12 原型、Schmidt 45 原型、信心度、主要原型、發展弧線、事件摘要、事件前後狀態、結構角色、因果分析、根本原因、影響分析

---

### I-06：張力 & 時間軸（分散至 analysis.json）

**工作量**: ~2 小時
**涉及元件**: `pages/TensionPage.tsx`、`pages/TimelinePage.tsx`、`components/timeline/MatrixCanvas.tsx`
**預估字串數**: ~55 個
**代表字串**: 張力分析、Step 1–3 標題、待審核、已核准、已修改、已拒絕、核准、修改標籤、拒絕、儲存、全書張力主題命題、重新計算時序、計算中…、章節順序、故事時序、矩陣視圖、敘事順序 (Sjuzhet)、故事時序 (Fabula)、時序未計算

---

### I-07：圖譜 & 閱讀器（graph.json + reader.json）

**工作量**: ~1.5 小時
**涉及元件**: `pages/GraphPage.tsx`、`components/graph/GraphToolbar.tsx`、`components/graph/EntityDetailPanel.tsx`、`components/graph/EventDetailPanel.tsx`、`pages/ReaderPage.tsx`、`components/reader/BookOverview.tsx`、`components/reader/ChapterCard.tsx`
**預估字串數**: ~35 個
**代表字串**: 節點、關係、搜尋實體…、角色、地點、概念、事件、重置視圖、事件分析、深度分析、相關段落、實體資訊、生成分析、章節、Chunks、實體、關係、全書關鍵字、實體分佈

**實作**: `frontend/src/i18n/locales/{zh-TW,en}/{common,nav,library,upload,analysis,graph,reader}.json`，35+ 個元件 / 頁面遷移至 `useTranslation()` hook

---

## B-022 SEP Domain Model + 組裝 Pipeline ✅ 完成
**背景**: 符號學原止於原始提取（`ImageryEntity` + 共現圖），缺乏結構化的語境 profile，無法作為 LLM 詮釋的輸入。本 ticket 對應 B-026（TEU 組裝）的符號學等價物，只做結構化、不做 LLM 詮釋。下游的 LLM 詮釋步驟拆分為 B-040。
**前置依賴**: B-020, B-021（均已完成）

**實作**:
- `backend/storysphere/domain/symbol_analysis.py`：`SEP`（Symbol Evidence Profile）+ `SEPOccurrenceContext`，欄位包含 `imagery_id`, `book_id`, `term`, `imagery_type`, `frequency`, `occurrence_contexts`（段落文字 + 章節位置）、`co_occurring_entity_ids`、`co_occurring_event_ids`、`chapter_distribution`、`peak_chapters`
- `SymbolService.assemble_sep(imagery_id, book_id, doc_service, kg_service, cache)` — `asyncio.gather` 並行拉取 imagery + occurrences + document + events，組裝 SEP 後存入 `AnalysisCache`（key: `sep:{book_id}:{imagery_id}`）
- `SymbolService.get_sep(imagery_id, book_id, cache)` — cache 查詢
- `GET /api/v1/symbols/{imagery_id}/sep?force=false` — 查詢已組裝的 SEP；cache miss 時即時組裝並持久化
- Unraveling DAG：Layer 2 新增 `sep` 節點（counts: analyzed / total_imagery），邊 `symbols → sep`、`kg_entity → sep`；`cache.count_keys(f"sep:{book_id}:%")` 計數

**設計決策**:
- SEP 存入 `AnalysisCache` 而非 SQLite，與 CEP/EEP/TEU 一致
- `co_occurring_entity_ids` 來源：在 imagery occurrence 所屬 paragraph 的 `paragraph.entities` 欄位；`co_occurring_event_ids` 取章節交集（事件所屬 chapter 出現在 imagery 的 `chapter_distribution` 鍵中）
- `peak_chapters` 取 top 3（`_SEP_PEAK_CHAPTER_COUNT`）
- `assemble_sep` 的依賴透過方法參數注入（類比 `TensionService.assemble_teu`），保持 `SymbolService` 仍為純資料層 + 組裝入口

**測試**: `tests/services/test_symbol_service.py::TestAssembleSEP`（5 案例）+ `tests/api/test_symbols.py::TestSEPEndpoint`（2 案例）

**後續**: B-040 LLM 詮釋以 SEP 為輸入，完成後需在 unraveling DAG 補 `sep → symbol_analysis_result` 邊

**實作**: `backend/storysphere/domain/symbol_analysis.py`, `backend/storysphere/services/symbol_service.py`, `backend/storysphere/api/routers/symbols.py`, `backend/storysphere/api/routers/unraveling.py`

---

## B-039 建構概覽（Unraveling）— 資料透明度 DAG ✅ 完成
**背景**: 系統為每本書建立的資料量體對用戶不可見，功能不可用時也難以診斷是哪個資料層尚未建立。
**實作**:
- `GET /api/v1/books/{book_id}/unraveling` — 聚合端點，兩輪並行查詢（服務計數 + cache key 計數）組裝 manifest JSON
- 5 層 DAG 節點（layer 0–4）：原生文本層（book_meta/chapters/paragraphs）、知識抽取層（summaries/keywords/symbols + KG compound group）、分析中間層（CEP/EEP/TEU）、合成結果層（character/causality/impact/tension/narrative/hero-journey/temporal）、書籍層面合成（tension_theme/chronological_rank）
- KG 子節點（kg_entity/kg_concept/kg_relation/kg_event/kg_temporal_relation）統一放入 `kg_features` compound group
- 前端 Cytoscape.js DAG 視圖，支援節點點擊高亮與 counts 展示
- `AnalysisCache.count_keys(pattern)` 非破壞性計數（含 TTL 過濾）
- TEU 計數特殊處理：fan-out per event_id（`teu:{event_id}` 鍵）並行查詢後加總

**設計決策**:
- Relation count v1 使用全域 `kg_service.relation_count`（KGService 無 document_id filter），meta 標注 `"scope": "global"`
- Symbol occurrence count 用 `sum(e.frequency for e in imagery_entities)`，避免載入所有 SymbolOccurrence

**實作**: `backend/storysphere/api/routers/unraveling.py`; `frontend/src/api/unraveling.ts`

---

## B-012 前端後端 API 整合驗證 ✅ 完成
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**驗收結論**:
- 所有端點回傳格式（camelCase）與前端 types 一致
- `TaskStatus.status` 為 `pending|running|done|error`，符合預期
- `EventAnalysisDetail` 後端已手動構建 camelCase dict，完全對應
- `uploadBook(file, title)` 前端傳兩欄位，後端 `title` 為 Optional，相容
- `.env.local` 中 `VITE_MOCK` 已註解（mock 關閉）
- Segment-based Chunk 回傳已實作（ingestion-time paragraph entity linking + stored offsets）

---

## B-017 意象實體識別策略研究（符號學前置依賴）✅ 完成
**背景**: 符號學分析模組的核心技術挑戰。評估三種識別策略（詞嵌入聚類、LLM 輔助標注、人工種子+擴展）。
**設計文件**: `docs/plans/20260331-symbolic-analysis-design-notes.md` Section 四
**結論**: 採用 LLM 輔助標注（主）+ 詞嵌入聚類（同義詞合併），為 B-018~B-022 的前置依賴。

---

## B-018 ImagerEntity Domain Model 設計 ✅ 完成
**背景**: 符號學模組需要新的實體類型表示意象實體，與現有 `Entity`（人物/地點）平行但語意不同。
**實作**:
- `backend/storysphere/domain/imagery.py`：`ImageryType` enum、`ImageryEntity`、`SymbolOccurrence`、`SymbolCluster`（純 Pydantic）
- 持久層：`backend/storysphere/services/symbol_service.py`（aiosqlite，兩張表：`imagery_entities` + `symbol_occurrences`）

---

## B-019 符號學第一層：候選符號發現 Pipeline ✅ 完成
**背景**: 三層架構的第一層，回答「有什麼值得追蹤？」。
**實作**:
- `backend/storysphere/services/imagery_extractor.py`：LLM 提取 + 貪心余弦相似度聚類（EmbeddingGenerator）
- `backend/storysphere/pipelines/symbol_discovery/pipeline.py`：`SymbolDiscoveryPipeline(BasePipeline)`，章節順序處理
- `backend/storysphere/workflows/ingestion.py`：新增 Step 3b（progress=75），`skip_symbols=True` 可跳過；`IngestionResult.imagery_extracted`

---

## B-020 符號共現網絡建構（Layer 2）✅ 完成
**背景**: 三層架構的第二層，回答「這些符號之間有什麼關係？」。
**實作**:
- `backend/storysphere/services/symbol_graph_service.py`：`SymbolGraphService`，on-demand `build_graph()`，NetworkX `DiGraph`
- 與 KGService 的 EntityNode 完全獨立，作為平行圖層

---

## B-021 詮釋輔助介面（Layer 3）— 符號時間軸 ✅ 完成
**背景**: 三層架構的第三層，組織統計結果為可讀格式。系統只呈現觀察，不提供詮釋。
**實作**:
- `backend/storysphere/api/schemas/symbols.py`：`ImageryEntityResponse`、`ImageryListResponse`、`SymbolTimelineEntry`、`CoOccurrenceEntry`（snake_case）
- `backend/storysphere/api/routers/symbols.py`：`GET /symbols`、`GET /symbols/{id}/timeline`、`GET /symbols/{id}/co-occurrences`
- `backend/storysphere/api/deps.py`：`SymbolServiceDep`、`SymbolGraphServiceDep`
- `frontend/src/api/symbols.ts` + `frontend/src/pages/SymbolsPage.tsx`：符號意象分析頁面

---

## F-17 UI 主題風格切換系統（B&W Theme System）✅ 完成（2026-05-28）
**分類**: UI 系統 — Wave 2
**設計文件**: `docs/plans/20260429-theme-system-bw.md`、`docs/DESIGN_TOKENS.md`、`docs/UI_SPEC.md` Section 3.13

**背景**: StorySphere 設計 token 已在 `tokens.css` 中抽離，主題切換架構基礎（`data-theme` on `<html>`、ThemeContext）已就位。F-17 完成填入第二、三主題 token 值並實作設定頁切換 UI。

**已實作**:
- `frontend/src/styles/tokens.css`：新增 `[data-theme="manuscript"]`、`[data-theme="minimal-ink"]`、`[data-theme="pulp"]` 三個覆蓋區塊（共 644 行）
- 三個 B&W 主題嚴格使用黑白灰，`default` 暖色 token 不受影響
- `frontend/src/contexts/ThemeContext.tsx`：localStorage key `storysphere:theme`，讀寫主題並套用 `data-theme` attribute
- `frontend/src/pages/SettingsPage.tsx`：card picker UI（三色縮圖預覽、選中 accent 邊框、即時套用）
- Cytoscape 節點、BarFill、Stat 卡、Keyword tag 等元件均已 tokenise
- 多個修正 commit 補全 B&W 主題下各元件的可讀性（tensor page、build overview legend、native form controls、BatchEepPanel progress track）
- `docs/DESIGN_TOKENS.md` 對照表同步更新

---

## F-18 系統啟動 Splash Screen ✅ 完成（2026-05-28）
**分類**: UI 體驗 — Wave 2

**背景**: 每個新 session 顯示全螢幕品牌印象畫面，以 `sessionStorage` 判斷是否已顯示，強化第一印象。

**已實作**:
- `frontend/src/components/SplashScreen.tsx`：全螢幕 overlay，`position: fixed; inset: 0; z-index: 9999`；淡入（0.4s）→ 停留（1.5s）→ 淡出（0.4s）後 unmount；點擊可立即略過；背景色 `var(--bg-primary)`
- `frontend/src/hooks/useSplash.ts`：讀寫 `sessionStorage` key `storysphere:splash-shown`，返回 `{ needsSplash, markDone }`
- `frontend/src/components/AppRoot.tsx`：頂層條件渲染 `{needsSplash && <SplashScreen onDone={markDone} />}`
- 後續強化 commit：theme-aware splash（faded bg）、imagery pool、loader bar

---

## I-001 輕量化部署模式（Lightweight Deployment Mode）✅ 完成（2026-05-28）
**性質**: Infrastructure Refactor
**設計文件**: `docs/plans/20260505-i001-lightweight-deployment.md`

**背景**: 系統原預設需要 Qdrant service，對新用戶不友善，且現有 fallback 靜默跳過造成資料狀態不明確。新增兩個明確的部署模式，不做跨模式自動降級。

**已實作**:
- `backend/storysphere/config/settings.py`：新增 `deploy_mode: Literal["lightweight", "standard"] = "lightweight"`、`qdrant_local_path`；lightweight 模式強制 `kg_mode=networkx` 並 log warning
- `backend/storysphere/services/vector_service.py`：依 `deploy_mode` 決定 Qdrant client（local file path vs. remote URL）；standard 模式連線失敗拋明確錯誤
- `backend/storysphere/api/main.py`：lifespan 啟動時針對 lightweight 模式發出多 worker 警告
- `.env.example`：新增 `DEPLOY_MODE=lightweight` 說明，最低配置僅需填 `PRIMARY_LLM_PROVIDER` + 對應 key
- 後續 fix commit 修正 lightweight 模式下多處 API 正確性問題

---

## I-003 主要 LLM Provider 可配置化 ✅ 完成（2026-05-28）
**性質**: Infrastructure Refactor
**設計文件**: `docs/plans/20260505-i003-primary-llm-provider.md`

**背景**: `_resolve_primary()` 原固定 Gemini → OpenAI → Anthropic → Local 的 fallback 順序，非 Gemini 用戶只能被動降級並收到 warning，且 `.env.example` 隱含「必須填 Gemini key」的假設。

**已實作**:
- `backend/storysphere/config/settings.py`：新增 `primary_llm_provider: Literal["gemini", "openai", "anthropic", "local"] = "gemini"`
- `backend/storysphere/core/llm_client.py`：`_resolve_primary()` 改為直接讀取 `settings.primary_llm_provider`；指定 provider 的 key 未設定時啟動報明確錯誤，不靜默降級
- `.env.example`：新增 `PRIMARY_LLM_PROVIDER` 說明，更新「最低配置」範例（只填 provider + 對應 key）
- 與 I-001 同批實作（commit `b6cdd53`、`5d1754a`）

---

## B-045 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 ✅ 完成（2026-06-01）
**設計文件**: `docs/plans/20260601-narrative-page-hero-journey.md`（Claude Design 交付，四佈局比較稿）

**背景**: 後端 `/narrative/*`（#21e/#21f/#21k/#21l）已實作，但前端無 `narrative.ts`、無頁面、無 BookNav 入口，建構概覽頁的 `hero_journey_stage` 節點永遠顯示「未建立」。

**已實作**:
- 後端型別：`GET /narrative`、`PATCH /narrative/{id}/review` 加 `response_model=NarrativeStructure`；`GET /narrative/kernel-spine` 加 `response_model=list[KernelSpineEvent]`（新增 schema）。回傳 shape 不變，`generated.ts` 重新產生後有 `NarrativeStructure` / `HeroJourneyStage` / `KernelSpineEvent` 型別。
- 前端 `api/narrative.ts`：`triggerHeroJourney` / `fetchHeroJourneyTask` / `fetchNarrativeStructure` / `fetchKernelSpine` / `reviewNarrativeStructure`。
- 新頁 `/books/:bookId/narrative`（`NarrativePage.tsx`）+ BookNav「敘事結構」入口（張力／符號之外的第三條平行分析線）。
- 英雄旅程主視圖：四種佈局可切換（A 水平軌跡 / B 三相位分欄 / C 圓環循環 / D 章節對位帶），共用三態視覺語言（filled 填色深淺 / low 警示三角+虛線 / absent「—」虛線空殼），點擊階段展開詮釋 + 章節 + 代表 Kernel 事件 pill + 理論描述/敘事功能。
- 情節骨幹摘要次區塊：書級 Kernel/Satellite 比例條 + 統計 + 依章節的核心事件骨幹 + 跳轉事件分析頁。
- HITL 調整為**書級**（API 只支援 `review_status`，不支援每階段）：區塊標題列 approve / 標記不適用 + 審核狀態徽章，走 #21l。
- 理論文案來源 `frameworksData.ts` hero_journey（localized）；i18n key 前綴 `narrative.*`（`analysis` namespace，zh-TW + en）。所有色彩走既有 token（無新增 token，`DESIGN_TOKENS.md` 不變）。

## B-047 知識圖譜：非預設主題下節點類型識別困難 ✅ 已解（2026-07-10，design system v2）
> 原 B-043，2026-06-30 重編。
**背景**: KG V1 設計統一節點為圓形，類型靠 `--graph-*-fill/-stroke` 區分；舊 manuscript / minimal-ink / pulp 主題把 entity token 收斂到灰階，圓形 + 灰階 = 類型幾乎無法區分。曾評估的方案：節點內疊 icon、標籤前加 type dot、非預設主題保留 shape variation。
**解法**: 未採用上述任何方案 —— design system v2（Ink on Paper，`docs/plans/20260710-design-system-v2-ink-on-paper.md`）移除全部灰階主題，改為 Warm / Ink 兩主題，且 **entity / graph 色環跨主題共用**（Ink 僅將 chrome 單色化，刻意不覆寫分類色）。節點類型在兩主題下均維持彩色可辨，問題由設計層面消解。

## B-054 Splash 圖庫更換 + wording 同步 ✅ 完成（2026-07-16）
**背景**: `SplashScreen.tsx` 的 `IMAGERY_POOL` 原只有 `library-of-books.png` 一張；William 準備新封面圖，備妥後一併更換並同步 wording / 清理。

**已實作**:
- `IMAGERY_POOL` 換為 William 新封面圖 `frontend/src/assets/splash/cover_v2.png`（取代 `library-of-books.png`），credit 落款 `Reading · ink illustration`。
- wordmark + 副標由置中改為**左側垂直置中**（容器 `justifyContent: flex-start` + `paddingLeft: clamp(2rem, 8vw, 8rem)`；前景 `alignItems: flex-start`），配合新圖左下人物、右側塗鴉雲構圖，文字落在左上留白不壓圖。
- 副標中文由「智能小說分析」改為「小說文本分析」。
- 清理換圖後已無引用的 `splash-main.png`、`library-of-books.png`。
- 瀏覽器實測 full-opacity 渲染確認左側置中、文字不壓構圖（warm 主題）。

**未做（刻意）**:
- credit 大小寫校正：新 credit 為全新字串、格式已一致，原「Library of Books/books」大小寫問題隨舊圖移除而消失。
- `tone`（light/dark）欄位：目前 `SplashScreen` 無任何 consumer 讀取 tone，加了即死資料，依「不為未來可能用到加東西」原則不補；日後真有 overlay 對比需求時再一併補欄位與 consumer。

## B-082 重跑 KG 抽取會累積重複的實體 / 關係 / 事件 ✅ 完成（2026-08-20）

**背景**: 2026-08-20 複查後端缺陷時，從 `var/knowledge_graph.json` 的實測資料反推出來的。

**症狀**（四本書實測）:

| 書 | entities | 相異 | events | 相異 | edges | 相異 |
|---|---|---|---|---|---|---|
| **dd129f3d** Age of Fire (併發驗證) | **195** | 73 | **101** | 67 | **326** | 168 |
| 1a1a7266 大唐雙龍傳 | 202 | 202 | 62 | 62 | 224 | 222 |
| 8f18dd59 名字的潮汐 | 39 | 39 | 47 | 47 | 84 | 84 |
| be6b8d99 3pigredhood | 34 | 34 | 25 | 25 | 62 | 62 |

edges 的簽章含 `chapters`，以免把 `_fill_relation_valid_to` 產生的**合法時序分期**
誤算成重複。dd129f3d 的事件是逐字同名的三胞胎（「林素卿召集家人宣讀遺囑」×3 等）。

**根因**: `_persist_to_kg`（`pipelines/knowledge_graph/pipeline.py:266`）呼叫的三個
`add_entity` / `add_relation` / `add_event` 都**以物件自己的 id 為 key**，而那個 id 是
每次抽取現生的 `uuid4`。memory backend 的 dict 賦值與 neo4j 的
`MERGE (ev:Event {id: $id})` 在語意上都是「覆蓋同一個 id」，實際上永遠是新增。
去重只發生在單次執行內（`EntityLinker`、`_remove_merged_relations`），跨執行無人看得到上一次的產出。

**對照**: `symbol_discovery/pipeline.py:63` 有 `delete_by_book()`，docstring 明寫
"Re-ingest safe"。**同一個 repo 裡兩條平行 pipeline，一條做了、一條沒做。**

**與 B-068 的區別**: B-068 是「同一場戲被切成多個 event」（抽取粒度），
這條是「同一個 event 被存了三次」（持久化）。兩者症狀都是「事件太多」，容易混淆。

**觸發條件**: 按第二次 `POST /books/{id}/rerun/knowledge-graph` 就會發生。
dd129f3d 是併發驗證的實驗書，同一步驟被反覆跑才中了三次。

**修法**: `remove_by_document()` 已存在（刪書路徑在用，且 entity / relation / event 三者都清），
在 `_persist_to_kg` 開頭 delete-first 即可。連帶要補 `inferred_relations` 的清理 ——
它存 entity id，而 rerun 路徑沒有對應的 `delete_by_document`。
完整規劃見 [`docs/plans/20260820-kg-rerun-idempotency.md`](plans/20260820-kg-rerun-idempotency.md)。

**既有髒資料**: 不寫遷移腳本。dd129f3d 是可丟棄的實驗書，直接刪書重跑即可；
修法落地後真實書中招也會在下次重跑時自癒。

---

**完成**: PR #60。`_persist_to_kg` 開頭以既有的 `remove_by_document()` delete-first；連帶在 `rerun_step` 成功後清掉 `inferred_relations`（它存 entity id）。順帶修掉一個測試污染：`_rerun` 把 `get_settings` patch 成 MagicMock，真的 `LinkPredictionStore` 會拿 mock 的 repr 當檔名，SQLite 照建不誤，跑完在 repo 根目錄留下三個垃圾 db 而測試仍回報綠。既有髒資料不寫遷移腳本 —— `Age of Fire (併發驗證)` 是可丟棄的實驗書，真實書中招則重跑一次即自癒。

## B-079 imagery occurrence 指向不含該詞的段落 ✅ 完成（2026-08-20）

**背景**: 2026-08-10 驗證 B-074 時發現。「戒指」的詮釋回傳「『戒指』在此後記中並未出現，
因此無法從文本中推斷其象徵意義」—— 模型是誠實的：存下來的段落文字確實不含該詞。

掃過《名字的潮汐》與另一本書全部已快取的 SEP：

```
古玉  3/4 筆的段落不含該詞（ch. 3, 4, 4）
手    1/7 筆                （ch. 7）
沙    3/4 筆                （ch. 5, 6, 11）
合計 7/39 筆 ≈ 18%
```

「戒指」的 `paragraph_text` 是後記首段（直排標題「作 　 者 　 後 　 記」），但
`context_window` 是對的 —— 兩者來源不同，其中一個對應錯了。

**影響範圍**: `occurrence_contexts` 是送進 LLM 的證據本體。約五分之一的引文與該意象無關，
詮釋因此可能建立在錯誤段落上。與 B-074（前置頁污染）是不同的問題：那是「不該送的送了」，
這是「送的內容根本對應錯」。

**根因已查明（2026-08-20）**: 上面列的兩個候選**都不是**。問題在抽取端，不在組裝端 ——
`paragraph_id` 查無此段的筆數是 **0**，`chapter_number` 的正確率是 **142/142**。

`pipelines/symbol_discovery/pipeline.py:159` 的 `_find_paragraph_id` 拿 LLM 生成的
`context_sentence` 去跟段落文字做子字串比對，**比對失敗就靜默退回該章第一段**
（`_find_position` 同型，退回 `0`）。而 `context_sentence` 從來就沒有「必須逐字引用」的約束 ——
142 筆裡有 25 筆連 `term` 本身都不含，模型是在轉述。

實測 22/142（15.5%）當初走了那個 fallback 分支；對不上的 28 筆只有 19 個相異
`paragraph_id`，因為不同意象一起掉進同一個「第一段」。

**修法與實測可行性**: 改用「詞優先、句子作 tiebreaker」後正確率由 80.3% → 99.3%
（83 筆唯一命中、44 筆需 tiebreaker、14 筆靠別名、1 筆確為 LLM 幻覺）。
完整規劃見 [`docs/plans/20260820-imagery-occurrence-anchoring.md`](plans/20260820-imagery-occurrence-anchoring.md)。

**觸發時機**: 已排入實作（2026-08-20）。

---

**完成**: PR #61。查出**兩個**根因：(1) `_find_paragraph_id` 拿 LLM 生成的 `context_sentence` 比對，失敗就靜默退回該章第一段；(2) pypdf 在 CJK 字中插空白，`礁石` 實際存成 `礁 石`。改為 `_find_anchor`：詞優先、別名次之、`context_sentence` 只當 tiebreaker，且比對前兩邊都去空白；定位不到就丟棄，空殼意象不落庫。真實資料重放 80.3% → **100%**，丟棄 0。第二個根因另立 B-083 追蹤未修的部分。

## B-081 四個服務的 token 歸屬缺口（共 7 處）✅ 完成（2026-08-20）

**背景**: 2026-08-19 執行「LLM 呼叫慣例收斂」計畫 P4 時清點出來的。計畫只
盤點了「有呼叫 `set_llm_service_context` 但漏帶 `book_id`」的站點，因此漏掉
更嚴重的一類 —— **根本沒有呼叫過的**：

| 位置 | LLM 呼叫處 | 作用域裡有書嗎 |
|---|---|---|
| `agents/timeline_agent.py:_process_batch` | 1 | **有** —— 簽章就帶 `document_id` |
| `services/epistemic_state_service.py:_infer_misbeliefs` | 1 | 沒有 |
| `services/epistemic_state_service.py:_classify_batch` | 1 | 沒有 |
| `services/voice_profiling_service.py:_llm_qualitative` | 1 | 沒有 |

這三個服務都由 `api/deps.py` 直接注入 router，**不經過任何會設 context 的
入口**。它們的 token 因此記在 contextvar 的預設值 `"unknown"` 上，或更糟 ——
同一個 context 裡前一段程式留下的服務名。

**為什麼本次沒順手修**: 要遷移它們就必須替它們指定一個 `service` 標籤，
而那會直接改變 token 帳目的分類結果。那是資料語意的決定，不是「收斂呼叫
慣例」的範圍（CLAUDE.md 紅線：任務範圍外的改動另開任務）。

**2026-08-20 複查：漏了第四個服務，而且穿透簽章那點是錯的**

`narrative_service` 的三處（`_call_refine_llm` / `_call_hero_journey_llm` /
`_call_temporal_order_llm`）**有**呼叫 `set_llm_service_context("analysis")`，
但不帶 `book_id`；而 `api/routers/` 底下**沒有任何一支 router 設過 book context**，
所以它靠不到上游。症狀與上表四處不同（不是 `"unknown"`，是 `service="analysis"` +
`book_id=NULL`），按「沒呼叫過」去找會直接漏掉。**缺口總數是 7 處，不是 4 處。**

原記「epistemic / voice 的 `book_id` 需要從 router 往下穿，會動到公開方法簽章」**不成立**：
`get_character_knowledge` / `classify_event_visibility` / `get_voice_profile`
三個公開方法**早就都有 `document_id`**，缺的是私有方法。而 contextvar 的語意本來就是
「進入點設一次、下游沿用」，所以設在公開進入點即可 —— **不動任何簽章、不動任何 router**。

**裁示（2026-08-20）**: service bucket 選**併入 `analysis`**，前端零改動。
完整規劃見 [`docs/plans/20260820-token-attribution-remaining.md`](plans/20260820-token-attribution-remaining.md)。

> **該計畫的 §5 Task 3 不必做（2026-08-20 查證）。** 計畫 §4.2 記「3 筆
> `summary` + `book_id=NULL` 是從 rerun 入口進來的」，並據此開了「Task 3：
> 查清 rerun 路徑的 summary NULL」。**那個判讀是錯的**：歸因修正 `7e5f4af`
> 落地於 **2026-08-19 10:08**，而那 3 筆的時間是 **2026-08-18 00:03** ——
> 修正當時還不存在，它們就是普通的修正前資料，rerun 路徑沒有缺口。
>
> 錯誤來源是拿日期粗估當分界（用「08-18 之後」代表「修正之後」），而沒查
> 修正 commit 的實際時間戳。以真正的分界重查：**之前 4,136 列全部 NULL
> （每個 service 都 100%），之後 70 列零 NULL**。
>
> 但「之後零 NULL」**不能**反證 B-081 沒必要做：那 70 列只涵蓋當時實際跑過的
> analysis / extraction / keyword / summary / imagery，本條目修的七處是潛伏的，
> 要那些功能被跑到才會現形。

**與該計畫的關係**: 這是 `docs/plans/20260819-llm-call-convention-consolidation.md`
§2.1 那個缺口的**第二層** —— 該計畫修掉了「有呼叫但漏帶書」，這條是「連
呼叫都沒有」。

**觸發時機**: 下次要讓 `GET /tokens/usage?bookId=...` 的 by-book 加總逼近總量時。

---

**完成**: PR #62。四處補 `set_llm_service_context`、narrative 三處補 `book_id`，全部設在**公開進入點**（四者本來就都收 `document_id`，原記「需從 router 往下穿、會動公開簽章」不成立）。service bucket 依裁示併入 `analysis`，前端零改動。另加 AST 掃描測試，要求每個含 `ainvoke` 的模組都設 context —— 該測試當場找出人工清點漏掉的第八處（`book_ingestion.py` 的 `graph.ainvoke`，查證為 LangGraph 非 LLM，已豁免）。

## B-083 pypdf 在 CJK 字中插空白，逐字元比對因此漏數 ✅ 完成（2026-08-20）

**背景**: 2026-08-20 修 B-079 時查出。原本把一筆定位不到的意象判成 LLM 幻覺，
用戶指出「意象都是從文本拉出來的，不可能不存在」才回頭查真因。

`loader.py:104` 的 `pypdf` `page.extract_text()` 依字形座標推斷空白，CJK 遇到行末
斷字就把一個詞切成兩半 —— 段落實際存的是 `走下了礁 石`，不是 `走下了礁石`。

**盛行率**（「中文字 + 空白 + 中文字」的段落佔比）:

| 書 | 來源 | 佔比 |
|---|---|---|
| 3pigredhood | pdf | **85.7%** |
| Age of Fire | pdf | **71.4%** |
| 名字的潮汐 | pdf | **66.0%** |
| 大唐雙龍傳 | txt | 12.1% |

**已修的**: 意象定位（B-079）已在 `symbol_discovery/pipeline.py` 加 `_squash()`，
比對前兩邊都去空白。

**未修的 —— 本條目**: `knowledge_graph/pipeline.py:161` 的
`chapter_text_lower.count(entity.name.lower())` 是同一種逐字元比對。實測 470 個實體
中 **41 個（8.7%）漏數**，累計漏掉 48 次：

```
薩爾瑪雷納   15 → 18        退名之潮   6 → 10   （漏 40%）
讀鹽人      22 → 24        母親      27 → 29
```

**為什麼值得修**: `mention_count` 不只是顯示用的數字。

| 消費端 | 用途 | 漏數的後果 |
|---|---|---|
| `entity_linker.py:96` | `max(group, key=mention_count)` 選**正規名稱** | 可能翻轉哪個字面成為正式名 |
| `faction_service.py:136` | 派系權重 | 權重偏移 |
| `book_graph.py:93` | 圖譜節點大小（`chunk_count`） | 節點大小失真 |
| `AnalysisListItems.tsx` | 角色列表的提及長條與數字 | 使用者直接看到 |

**待辦內容**:
- 決定正規化的落點：在 `pipeline.py` 就地 squash，或在 loader 端就把字中空白修掉
  （後者影響所有下游，但會改動已入庫文本的語意，且無法回溯既有書）
- 若採前者，`symbol_discovery/pipeline.py` 的 `_squash()` 可抽成共用 helper
- 英文書要留意：去空白會讓兩個相鄰單字接成一個假命中（中文無此問題）

**觸發時機**: 下次動到 KG 實體抽取或 EntityLinker 時。

---

**完成**: PR #64。新增 `core/utils/text_matching.squash_spacing()`，`mention_count` 與意象定位共用（後者原本在 `symbol_discovery` 就地寫了一份，一併收斂）。

規劃時列的「英文書要留意去空白會接出假命中」促使一度打算只去 CJK 之間的空白，**但那是錯的**：書裡的版權頁存的是 `霧  港  文  化 　 F O G  H A R B O R  P R E S S`，拉丁文一樣被逐字元加空白，只去 CJK 空白的話 `Fog Harbor Press` 這種實體永遠對不上。兩種算法在 470 個實體上結果完全相同（41 vs 41），測量分不出高下，故依證據選全部去空白；突變測試把這個決策釘住（改成只去 CJK 空白，拉丁文那項即紅）。代價（`"these ashes"` 含有 `"sea"`）寫成測試，讓它是已知取捨而非日後的意外。

小資料實跑（真實章節 + 真實 pipeline，只換掉 LLM 抽取）：ch9 礁石 **0 → 1**（確實出現在該章卻被算成零次）、ch8 瑪蒂爾德 5 → 6、ch10 瑪蒂爾德 3 → 4。

既有資料不寫遷移腳本 —— `mention_count` 是抽取階段算的，重跑 `rerun/knowledge-graph` 即重算，而該路徑已於 PR #60 修成冪等。

---

#### B-066 前端 `tsc -b` 既有 10 項型別錯誤
**背景**: `npm run build` 已納入 DoD（見 `CLAUDE.md`「完成後必報」），但判準是「無新增」而非「全綠」——因為 main 上本來就有 10 項既有錯誤。這些錯誤不影響 build 產物（vite 走 esbuild，不做型別檢查），但會讓 `tsc -b` 永遠是紅的，久了就沒人看，等於閘門形同虛設。2026-07-30 就有一個 runtime ReferenceError（`BatchEepPanel` 引用已刪除的 `runningAnalyzed`）混在噪音裡差點進 main。

**清單**（2026-07-30 於 main 實測）:
- `components/upload/MurmurWindow.tsx` × 3 — `Cannot find name 'MurmurWindowProps'`（型別定義整個不見），連帶兩個 implicit any
- `components/upload/ProcessingCard.tsx` × 2 — 讀 `TaskStatus.createdAt`，但該欄位不存在於型別上
- `pages/EventAnalysisPage.tsx` × 3 — `sourceData.passages` possibly undefined × 2、`TFunction` 傳入自訂 `(k, o?) => string` 簽章不相容
- `components/graph/EntityDetailPanel.tsx` × 1 — `factionData.factions` possibly undefined
- `hooks/useTaskNotifications.ts` × 1 — `string | null | undefined` 傳給只收 `string | undefined` 的參數

**待辦內容**:
- 逐項修掉（多數是補 optional chaining 或缺失的 props 型別，`MurmurWindowProps` 需確認是被誤刪還是從未定義）
- `ProcessingCard` 的 `createdAt` 要先確認後端是否真的有回傳——若有，是 `generated.ts` 沒重新產生；若沒有，是前端讀錯欄位
- 清完後把 DoD 的判準從「無新增」改成「全綠」，並考慮加進 CI

**注意**: 這是獨立的清理任務，不要夾帶在功能 PR 裡。

**觸發時機**: 下次動到 upload 或 event analysis 相關檔案時順修，或決定把 `tsc -b` 加進 CI 之前。

---

**完成**: 2026-08-20，批次 1（前端重構）。10 項逐條對應清完，`npm run build` 在 main 上
首次 exit 0。

規劃時的兩個未決問題都有了答案：

`MurmurWindowProps` 是**被誤刪**的，不是從未定義——`MurmurWindow` 一直在解構
`{ events, characterSrc }`，只是型別註解指向一個不存在的名字，所以 runtime 正常、
只有 tsc 紅。補回定義即可。

`ProcessingCard` 的 `createdAt` **後端確實有回**：`generated.ts` 的 `TaskStatus`
有 `createdAt` / `kind` / `title` 三個欄位，是手寫的 `api/types.ts` 那份沒跟上。
正解是把 `TaskStatus` 接回 generated schema，但實測那樣做會浮出 7 個真實的
nullability 缺口（generated 的 `subProgress` 是 `number | null`，而
`useSymbolBatch` / 角色頁 / 事件頁三份批次進度複製碼都假設它不會是 null），
範圍超出本次任務，故先補欄位並在型別上留註記。手寫型別遮蔽真實缺口這件事本身
待另開任務處理。

DoD 判準要不要從「無新增」改成「全綠」、要不要進 CI，留給使用者決定——`tsc -b`
與 `eslint` 現在都是全綠，但那是本次觀測，未與後端 ruff 的現況一起評估。

---

#### B-067 mock 模式下時間軸覆蓋率恆為 0%
**背景**: 時間軸頁新增了「已分析／未分析」的虛線圈與覆蓋率列，靠每個事件的 `hasAnalysis` 欄位驅動。但 `frontend/src/api/mock/data.ts` 裡 29 筆時間軸事件的 `hasAnalysis` 全是 `false`——因為這些事件用 `evt-t*` 命名空間，而 mock 的事件分析（`mockEventAnalyses`）走的是 `ent-*`，兩邊根本對不起來。結果是 mock 模式下覆蓋率永遠 0%，這個新視覺完全展示不出對比。

**待辦內容**:
- 決定 mock 的事件分析要不要與時間軸事件共用 id 命名空間（目前 `evt-t*` vs `ent-*` 是分裂的）
- 若要讓覆蓋率可展示，需要一組有意義的混合值，而非隨手填——建議與 `mockEventAnalyses` 對齊後由真實對應關係推導，不寫死
- 一併確認 `temporalAnalyzed: false` 的設定是否也讓其他時序視覺在 mock 下失效

**觸發時機**: 需要用 mock 模式展示或截圖時間軸頁時，或下次整理 mock 資料時。

---

**不做**: 2026-08-20，批次 1（前端重構）。`api/mock/` 整層（2,166 行）連同 7 個
`api/*.ts` 裡的 `MOCK_ENABLED` 分支已一併移除，這條的前提隨之消失。

移除的理由不是「沒在用」，而是**它已經做不到它存在的目的**：19 個 endpoint 模組
裡只有 7 個有 mock 分支，缺的 12 個正好是後來才做的功能（tension、symbols、
narrative、buildOverview、voice、search、tokenUsage…）。把 `VITE_MOCK=true`
打開會得到一個書庫與閱讀頁能動、其他頁全空的 app。要讓它重新可用，得補 12 個
模組的 mock 並讓 19 個模組永遠跟著後端同步，而它依賴的 `api/types.ts` 本身
正在與 `generated.ts` 漂移。

順帶一提，本條描述的 `evt-t*` vs `ent-*` 命名空間分裂確實存在，但那是 mock
資料內部的問題，不影響真實資料路徑。

#### B-070 張力分析頁 RWD 未做
**背景**: 2026-08-05 張力頁翻新（Phase 3）以設計交付包的 1440px 定寬為基準落地，`frontend/src/styles/tension.css` 目前**一個 `@media` 都沒有**。設計交付包本身也只出 1440px 一稿，未涵蓋 1280 / 1024 / 窄視窗。這與時間軸頁 (`docs/UI_SPEC.md` §3.7「已知缺口」) 是同一類缺口。

**具體待決**:
- 右側 `TensionReviewDrawer` 固定 432px：窄視窗改 overlay 蓋住主體，還是推擠主體？
- 章節格點 `grid-template-columns: 320px repeat(N, 1fr)`：章節數多的書（如大唐雙龍傳）超過 N 章時橫捲、分頁、還是按區間聚合？
- `TensionLineTable` 7 欄在 1024px 怎麼收（哪幾欄可折、可否改雙行）？

**注意**: 格點的收斂策略會影響 `TensionChapterGrid` 的資料聚合方式，不是純 CSS 題。

**觸發時機**: 窄視窗使用回報，或統一處理全站 RWD 時（與時間軸頁 RWD 缺口一起做較省）。

**完成**: 2026-08-21，分支 `feat/tension-rwd`。三項待決的結論與理由記在
`docs/UI_SPEC.md` §3.8「已知缺口」，此處只記關鍵發現：

**橫捲本來就是設計意圖，是實作漏了一半。** `tension.css` 早有註解「Wide books scroll the
grid rather than the page.」與 `overflow-x: auto`，但欄寬寫成 `1fr`——展開是
`minmax(auto, 1fr)`，長章節書的欄位會一路壓縮到剩柱子寬，溢出永遠不發生，捲軸也就永遠不出現。
補上 `minmax(var(--tn-grid-cell-w), 1fr)` 的下限之後才真的會捲；標籤欄同時要 `sticky`，
否則捲動後看不出那排柱子屬於哪條張力線。**兩個半成品互相掩護，所以缺陷一直沒被看見。**

**實測**（`/verify`，《名字的潮汐》10 章 / 6 條張力線）:
- 1440 / 1200：版面與 main 一致，格點 `320px + 10 欄`、表格維持 7 欄
- 1080：表格收成 5 欄，極點欄從 515px 回升到 557px；抽屜轉 `absolute`，主欄不再被壓縮
- 900：章節與證據數確實落到第二行（實測 bounding box row2），列高 48 → 86px
- 360（強制溢出）：`scrollWidth 430 > clientWidth 234`，捲動 0 → 196 標籤欄 `left` 恆為 87
- Ink 主題：sticky 欄背景為不透明白、右框線為黑，`--card-shadow: none` 下靠框線分隔
- 四個寬度下 `document.documentElement` 皆無水平捲動；console 0 errors

**未修（不在範圍）**: `審核` 欄 152px 裝不下「核准／修改標籤／拒絕」，三顆按鈕在 1440px
就已經是兩行（實測 44px 高，各寬 42 / 59 / 40）。**這是 main 既有的問題，非 RWD 造成**——
1440 / 1200 / 900 三個寬度量到的數值完全相同。

**未做**: B-071（a11y）仍獨立開著；本輪只動版面，沒有碰非視覺替代與 tab order。

---

#### B-062 tension / narrative 前端寫死 language='zh'
**背景**: `frontend/src/api/tension.ts` 與 `narrative.ts` 呼叫後端時預設寫死 `language = 'zh'`（NarrativePage 另以 i18n 語言判斷），而非書籍實際語言。籠統 `zh` 經 `get_language_display_name` 只能得到 "Chinese"，不保證繁簡變體——與 2026-07-17 角色分析簡體漂移是同一類 bug（該次已修 upload/ingestion/analysis 鏈，此兩處為殘留）。

**待辦內容**:
- 兩支 API helper 的 `language` 改由書籍 meta（document language，`zh-tw`/`zh-cn`）帶入，不用 i18n 語言、不寫死
- 檢查其他 `language` 參數呼叫端是否有同樣寫法（`symbols.ts` 等）

**觸發時機**: 張力 / 敘事分析輸出出現繁簡漂移回報時（或下次動到該兩頁時順修）。

---

### 🟢 低優先（可選升級）

**完成**: 2026-08-21，分支 `feat/book-language-field`（後端 Step 1 + 前端 Step 2）。

**影響比本條目記載的大。** 條目說「籠統 `zh` 只能得到 Chinese，不保證繁簡變體」，語氣像是
邊緣狀況。實測 DB 四本書**全部**存 `zh-tw`，而 `get_language_display_name` 是
`"zh" → "Chinese"`、`"zh-tw" → "Traditional Chinese"`，這字串直接進 prompt 的
`"Respond in {name}."`。所以每一本書的張力／敘事分析都在被告知「用中文回答」而非
「用繁體中文回答」，繁簡交給模型猜。**不是潛伏 bug，是四本書全部正在踩。**

**根因不是前端偷懶**: `BookResponse` / `BookDetailResponse` 都沒有 `language` 欄位，前端
根本拿不到書的語言。Step 1 先把輸入補上（只加在 `BookDetailResponse`，列表用不到）。

**範圍比條目記的廣**: 條目只提 tension / narrative 兩頁，實際是**三頁六個呼叫點**——
`TimelinePage.tsx:442` 的 `triggerTemporalAnalysis(bookId)` 連傳都沒傳，靜默吃預設值。

**做法**: 移除 `api/tension.ts` / `api/narrative.ts` 六處 `language = 'zh'` 預設值，改為必填。
**但這只擋得住「忘記傳」，擋不住「傳錯」**——實測 `tsc` 只抓到 TimelinePage 那一個，
其餘五處本來就有傳值（`'zh'` 字面量或 `i18n.language`），型別看不出語意錯誤。

`NarrativePage` 原本的兩處**比寫死更糟**：跟的是 `i18n.language`，也就是**介面語言**。
英文介面讀中文書會請求英文分析。與 B-060「EN 介面 + 中文書計數全 0」是同一個模式。

**驗證**（`/verify`，攔截 POST body，不讓請求打到後端以免燒 LLM 呼叫）:
- `GET /books/{id}` 回傳 `language: 'zh-tw'`
- `POST /tension/theme/synthesize` body 帶 `"language":"zh-tw"`（原為 `"zh"`）
- **英文介面 + 中文書**：`POST /narrative/hero-journey` 帶 `"language":"zh-tw"`（原為 `"en"`）
- `TimelinePage` 那條**只有 compile 層驗證**：觸發鈕被覆蓋率門檻擋住（見 B-065 記的同一情境），
  強制解除 `disabled` 後 handler 自己還有守衛，runtime 沒走到

**順帶產出**: `npm run gen:types` 帶出既有漂移（`bookId` 從未重生過）；`api/types.ts` 檔頭
「四個刻意留在手寫」更正為六個，見 B-084。

---

#### B-085 五道閘門沒有任何 CI 在盯
**背景**: 2026-08-20 前端批次 1–4（PR #66）把 `npm run build` 修綠之後，閘門首次同時
全綠，CLAUDE.md 的 DoD 判準也隨之從「無新增」改為「全綠」。評估後決定**暫不建 CI**，
此條記錄這個決定與它的代價。

**閘門清單以 CLAUDE.md「程式碼品質」為準，此處不重列。** 本條原本自己列了四道，
而 `docs/guides/TESTING.md` 另外要求 `ruff check tests/`、CLAUDE.md 又說三道——
三份文件三個數字。2026-08-21 已收斂：`ruff check tests/` 補綠（126 條），
清單統一放在 CLAUDE.md，本條與 TESTING.md 都改為指回去。

代價很具體：**B-066 就是「沒人盯」的產物**。那 10 個型別錯誤不是一次寫出來的，
是因為 `tsc -b` 長期紅著、紅久了沒人看，才從 0 慢慢累積到 10 個——其中還混著一個
引用了已不存在 interface 的檔案。把閘門弄綠而沒有東西在盯，等於只是把碼表歸零重跑。

**待辦內容**:
- 建 `.github/workflows/`，跑 CLAUDE.md 列的那幾道（repo 是 public，Actions 免費；實測合計約 3 分鐘）
- Python 依賴用 `uv`；測試跑 `-m "not integration"`（`integration` 那組需要真實 API key）
- 注意 `task_store_backend` 預設是 sqlite、`.env` 才是 memory，兩種 backend 的行為不同
  （見 2026-08-19 那次 22 項紅測試），CI 要明確指定用哪一種
- 建起來之後，CLAUDE.md 裡「沒有任何 CI 在盯這五道閘門」那段要一併改掉

**觸發時機**: 下次發現閘門又變紅時，或有第二個人開始提交時（單人開發靠自律還撐得住，
多人就撐不住）。

**完成**: 2026-08-22，`.github/workflows/gates.yml`。

**觸發條件是自己滿足的，不是改變主意。** 本條原本寫的觸發時機是「下次發現閘門又變紅時，
或有第二個人開始提交時」。2026-08-21 一輪工作裡同時撞到三件事，全部都是「沒有東西在盯」
的直接產物：

- `ruff check tests/` 紅著 **126 條**，而且查下來**從來沒綠過**——B-049 清的是 `src/`，
  PR #66 的 `14ffaf2` 對齊的是判準措辭，兩次都不含 `tests/`
- `generated.ts` 落後於後端，`bookId` 這個 query 參數前端手寫了型別、產生器從未重生
- 「幾道閘門」在三份文件裡三個數字（CLAUDE.md 三道、本條四道、TESTING.md 多一道且是紅的），
  沒有一個對

第三件最能說明問題：腐化的不只是閘門，還有**關於閘門的記載**。

**動工前查證的事**（決定了 workflow 長什麼樣）:

- **CI 上沒有 `.env`**（`.gitignore:11`）。實測把 `.env` 移開後 `pytest -m "not integration"`
  仍然 1822 passed，**所以 CI 不需要任何 secret**。這是最大的未知數，先確認才動工。
- **`TASK_STORE_BACKEND` 在 workflow 裡明確釘成 `sqlite`**。`.env` 設 `memory`，程式碼預設
  是 `sqlite`，CI 沒有 `.env` 所以會落到 `sqlite`——那是本機從沒跑過的路徑。兩種都實測過
  （各 1822 passed），但釘死而非放任預設：這兩條是真的不同的 code path，2026-08-19 的
  22 條紅測試就是這個差異造成的。
- **版本對齊本機**（Python 3.13、Node 24）。`pyproject` 只寫 `>=3.11`、`package.json` 沒有
  `engines`，若 CI 用比本機舊的版本，會產生本機重現不了的失敗。
- `uv.lock` 與 `package-lock.json` 都在 → `uv sync --frozen` / `npm ci`。無 extras，
  所以 `--all-extras` 拿掉了。

**指令逐字照抄 CLAUDE.md 的五道**，不發明變體——否則「CI 綠」與「閘門綠」會是兩件事，
而那份剛收斂成唯一權威的清單就不再是權威。

**額外加了一道 `pytest --collect-only`**：`integration` 那 3 條平常被 deselect，import
若被刪壞不會在一般測試裡顯示，只有 collect 會抓到。這是 2026-08-21 清 `tests/` lint 時
學到的——當時刪了 42 個未使用 import。
#### B-086 Ink 主題下狀態語意只靠顏色
**背景**: 2026-08-21 做 B-071 時從該條拆出。Ink 主題把 success / warning / error 塌成同一個黑，
所以任何「只用顏色區分狀態」的指示在 Ink 下都失去語意。stepper 已經處理過（用「圓形 machine /
方形 gate」的形狀差異），但其餘狀態指示**尚未逐一檢查**。

**為什麼獨立成條**: 這不是張力頁的問題。判準是全站的，且修法可能要動 `tokens.css` 與
`docs/DESIGN_TOKENS.md` 的對照表——與 B-071 其餘兩項（單頁、純元件層）的範圍不同，
混在一起做會讓一個 PR 同時改單頁行為與全站 token。

**待辦內容**:
- 先盤點：哪些元件的狀態指示只靠顏色（`tn-status-badge`、各頁的 review 狀態點、
  `--color-success` / `--color-warning` / `--color-error` 的所有使用端）
- 決定替代載體：形狀、圖示、或文字標籤——stepper 用形狀，可作為既有前例
- 若需新增 token，同步更新 `docs/DESIGN_TOKENS.md` 的對照表

**觸發時機**: a11y 稽核，或下次動到狀態指示元件時。

**完成**: 2026-08-22，分支 `fix/epistemic-timeline-row-labels`。

**盤點結果與條目的描述差很多。** 條目寫得像全站議題，實際上：

- **是四個 token 塌陷，不是三個**。本條原本只寫 success / warning / error，但 `--color-info`
  也在 Ink 下變成 `#151515`（`tokens.css:304`）。
- **109 處使用，但只有 14 組是「同一元件多種語意色」**。其餘 95 處是單一狀態（例如錯誤橫幅
  永遠是錯誤），沒有可混淆的對象，塌了也不影響語意。
- **14 組裡有 11 組本來就有非顏色載體**，顏色只是冗餘強化：

  | 元件 | 非顏色載體 |
  |---|---|
  | `.tn-stage` / `-dot` / `-kicker` | `done`→`<Check>`、`failed`→`<AlertTriangle>`，加 machine/gate 形狀，加標題文字 |
  | `.tn-status-badge` | badge 內就是狀態文字 |
  | `.ca-epi-block` / `-title` | `<Eye>` icon + 標題文字 |
  | `.ca-epi-count-dot` ×3 | 點旁邊就是數字 + 文字標籤 |
  | `.ea-participant-role` / `-legend-item` | `roleLabel()` 文字 |
  | `.st-input-flag` / `.st-nav-badge` | 各自的 badge 文字 |

- **2 組是死 CSS**（零 TSX 引用）→ 拆為 B-087，沒有順手刪。

**唯一的真問題是 `.ca-epi-pill`**（`ChapterTimeline`）。pill 內容只有數字，`title` tooltip 是
`Ch.3 · 事件A、事件B`——**不說 known 還是 unknown**，元件內也沒有圖例。兩列只靠
`top: 16px` vs `48px` 區分。預設主題下讀者是靠**顏色**把上方 `.ca-epi-counts` 的圖例對應到
下方 pill；Ink 下那些圖例點也全變黑，**對應關係整條斷掉**。計數本身還讀得到（有文字），
斷的是「哪一列 pill 是已知」。

**修法**: 在 timeline 左側加行首標籤，重用既有的 `knownLabel` / `unknownLabel`，未新增 i18n key。
選它而不選「pill 分形狀」，是因為形狀本身不自明——圓代表什麼仍然要查圖例，只是把「顏色要查
圖例」換成「形狀要查圖例」，而圖例在 Ink 下同樣是黑的。行首標籤所有主題、所有使用者都受益。

**實測**:
- 中文：標籤 top 351 / known pill top 350 —— 對齊；標籤右緣 377、最左 pill 400，間隙 23px
- **英文先撞了**：`Unknown` 右緣 403 > 最左 pill 400，**重疊 3px**。gutter 從 64px 加寬到 84px
  後間隙 17px。這個只在英文出現——gutter 要以最長的語系為準，不是最短的
- Ink：兩種 pill 背景皆 `rgb(21,21,21)`（**逐字相同**，證實塌陷屬實），標籤 `rgb(140,140,140)` 可讀
- `EpistemicCompareDrawer` 共用同一元件，容器 720px 扣掉 gutter 仍有 600px+ ——
  **此處是從寬度推算，未實測**（compare drawer 要先選兩個角色，pair mode 無法用合成事件驅動）

---

#### B-087 張力頁零引用的狀態色 CSS
**背景**: 2026-08-22 盤點 B-086 時發現，記為 `frontend/src/styles/tension.css` 有兩組狀態色規則
在 TSX 裡零引用（`.tn-summary-chip-dot.{approved,modified,rejected}` 與
`.tn-traj-status.{s-approved,s-modified,s-rejected}`，共 6 行），推測是張力頁翻新的殘留。
當時沒有順手刪除，因為 CLAUDE.md 的紅線寫明「禁止憑『看起來沒用』就刪程式」。

**完成**: 2026-08-22，分支 `chore/b087-dead-tension-css`。

**範圍比原記載大 40 倍：不是 6 行，是 243 行。** 原條目只查了那 6 行狀態色，沒有往上查父層。
實際零引用的是**兩個完整 section**：

| Section | 選擇器 | 規則數 |
|---|---|---|
| `/* Trajectory dashboard */` | `.tn-traj*`（含 `-legend`、`-chart`、`-density`、`-row-*`、`-axis-*`、`-status`） | 38 |
| `/* Summary chip bar */` | `.tn-summary*`（含 `-label`、`-chip`、`-chip-dot`、`-spacer`、`-actions`、`-hide-rejected`） | 13 |

原本的 6 行只是這兩段各自的最後幾條規則。刪除 `tension.css:379-621`，檔案 2112 → 1869 行。

**查證方法（比原條目的 grep 嚴格）**:
- 全 repo 搜尋不限副檔名，只有 `tension.css` 本身、worktree 副本、與 `BACKLOG.md` 提到這些字串
- 排除動態組出 class 名的可能：搜過 `` className={`tn-${ ``、`"tn-" +` 等組合形式，零命中
- 檔案內其餘部分（含 B-070 加的 RWD media query）沒有任何一處引用這兩組 class
- 刪除區間 379-621 內只有 `.tn-traj*` / `.tn-summary*` 選擇器，未夾雜其他規則

**旁證**: `TensionChapterGrid.tsx:25` 的註解自陳「This replaces the trajectory chart, which
encoded a line's chapter span as a…」——`.tn-traj*` 正是被它取代的那個元件留下來的。這比
grep 結果更有說服力：grep 證明「現在沒人用」，註解證明「為什麼沒人用」。

**教訓**: 盤點時查到零引用的葉節點，要往上查父層是不是也零引用。B-087 原本記成「兩段狀態色」，
是因為盤點 B-086 時只關心狀態色，看到 `.tn-summary-chip-dot.approved` 就停在那一行，沒有問
`.tn-summary-chip` 本身有沒有人用。結果把一次元件下架的殘留記成了幾行雜訊。

**異動**: `frontend/src/styles/tension.css`（-243 行，純刪除，無新增）。無 token 異動
（只是移除使用端），無 API 異動，無元件異動。五道閘門全綠。

#### B-052 log 中 `neo4j_url` / `qdrant_url` 遮罩
> 來源：2026-07-08 防禦性安全稽核（低風險項）。

**背景**: 啟動時會把 `neo4j_url`、`qdrant_url` 寫入 log。這兩個 URL 目前無內嵌帳密故無實害，
但一旦改用含帳密的連線字串（如 `neo4j://user:pass@host`）即會外洩。

**完成**: 2026-08-22，分支 `chore/b052-mask-db-urls`。

**盤點出 7 處，其中 1 處不是 log。** 條目寫的是「log 中」，但同一批變數還流進兩種非 log 的出口：

| # | 位置 | 型態 | 洩漏到哪 |
|---|---|---|---|
| 1 | `api/deps.py:91` | `logger.info` | log |
| 2 | `workflows/ingestion.py:846` | `logger.info` | log |
| 3 | `services/vector_service.py:99` | `logger.info` | log |
| 4 | `services/kg_migration.py:71` | `logger.info` | log |
| 5 | `services/kg_migration.py:179` | `logger.info` | log |
| 6 | `services/vector_service.py:95` | `RuntimeError` 訊息 | 例外訊息 → 進 log / traceback |
| 7 | `api/routers/kg_settings.py:139` | `HTTPException(detail=…)` | **HTTP response body** |

**#7 比原本要修的 log 更嚴重**，且純看條目標題不會發現：它把 URL 送進 503 的 response body
回給前端，一旦帶帳密就是外洩到瀏覽器，不只是本機 log 檔。決定一起做——同一個變數、同一種
洩漏、同一個 helper，把它留到另一條 backlog 只是讓已知的洞多開一陣子。

其餘 `neo4j_url` / `qdrant_url` 的出現處（`kg_settings.py:67/131/203/210`、`deps.py:87`、
`ingestion.py:848`、`vector_service.py:88`）都是把 URL 傳給 driver 或 migration 函式，
不是輸出，未動。URL 從來不是任何 response schema 的欄位（只出現在 `detail` 字串），
`API_CONTRACT.md` 也沒載明那段 503 文字，故 contract 無需更新。

**helper 搬到 `core/utils/url_masking.py`，不是複製。** 條目建議「複用 `settings_info.py` 的
`_mask_db_url` 遮罩模式」——照字面做會變成把同一段 `urlsplit` 邏輯抄五份。但直接 import 也
不行：`_mask_db_url` 是 api router 的私有函式，而要用它的是 `services/` 與 `workflows/`，
讓 service 去 import api router 是把依賴方向反過來。

所以搬到 `core/utils/`（`text_matching.py`、`output_extractor.py` 的同層），實作逐字不變。
沒有放進 `data_sanitizer.py`：那個模組管的是 LLM prompt 的注入防護，與連線字串遮罩是不同
關注點，同一個檔名下擺兩種「sanitize」只會讓之後的人找錯地方。

`settings_info.py` 的私有版本已刪除，四個既有測試隨受測對象移到 `tests/core/test_url_masking.py`
（依 TESTING.md「新測試依照受測程式碼的層級放入對應子目錄」），另補兩個：bolt URL 帶帳密、
無帳密 URL 不被改動。

**未做（可另開條目）**: 防回歸測試——以 AST 掃描確保新的 log 呼叫不會直接印 `settings.neo4j_url`
/ `qdrant_url`。B-081 用過這個手法。本次未做，因為條目沒要求，且 7 處已收斂到單一 helper。

**異動**: 新增 `backend/storysphere/core/utils/url_masking.py`；修改 `api/deps.py`、
`api/routers/kg_settings.py`、`api/routers/settings_info.py`、`services/kg_migration.py`、
`services/vector_service.py`、`workflows/ingestion.py`；`tests/api/test_settings_info.py`
→ `tests/core/test_url_masking.py`。無新依賴（`urllib.parse` 是標準庫）。五道閘門全綠。

#### B-064 未分析卡「生成分析」按鈕文字對齊 canvas「建立」
**背景**: 角色清單未分析卡的按鈕文字取自 `analysis.json` 的 `generate` key（「生成分析」），
設計稿 canvas 為「建立」。該 key 被多處共用，不能直接改值。

**完成**: 2026-08-22，分支 `fix/b064-create-btn-wording`。

**共用者是 4 個，不是條目寫的 3 個** —— 漏了 `EventRankingView`。逐一對 UI_SPEC 查過用字後
只改其中兩處：

| 呼叫點 | 介面 | UI_SPEC 用字 | 處置 |
|---|---|---|---|
| `AnalysisListItems.tsx:128` | 角色清單卡 | `:359`「建立」 | 改用新 key |
| `RankingView.tsx:110` | 角色排行列 | 未載明（同一顆 `ca-item-mini-btn`） | 改用新 key |
| `EventListItems.tsx:175` | 事件清單 | `:550`「建立分析」 | 不動 |
| `EventRankingView.tsx:134` | 事件排行列 | 未載明 | 不動 |
| `CharacterAnalysisPage.tsx:568` | 角色空狀態主 CTA | 未載明 | 不動 |

**`RankingView` 一併改的判準**（條目留的待確認項）: 排行列與清單卡是**同一顆按鈕** ——
都是掛在角色列右側的 `ca-item-mini-btn`，而 UI_SPEC `:425` 描述整條流程時寫的就是
「點擊『建立』（未分析角色）」。同一個檔案裡的 Hero 卡早已用 `character.overview.ranking.createHero`
=「建立核心角色分析」對過稿，只有排行列漏掉，是同一次對稿的殘留。

**事件兩處刻意不動**: 那是另一種介面，UI_SPEC 給的用字也不同（`:550`「建立分析」）。
把它們一起改成「建立」會是在本條範圍外替事件頁做對稿決定。

**新 key 放 `character.list.createBtn`**（zh-TW「建立」/ en `Create`）: `character.list`
namespace 已存在（`searchPlaceholder` / `frameworkLabel` / `mentionCount`），不建新結構。
`RankingView` 的排行列雖然在 `character.overview.ranking` 底下，仍取用這個 key —— 它渲染的是
`ca-ov-rank-list` 裡的角色列，與清單卡同一種 affordance，複製一份同值的 key 只會讓下次改字時
漏掉一邊。

`generate` key 保留，仍有三個呼叫端在用。

**UI_SPEC 未改**: `:359` 本來就寫「建立」，是實作沒跟上，spec 不需修正。

**異動**: `frontend/src/i18n/locales/{zh-TW,en}/analysis.json`、
`frontend/src/components/analysis/AnalysisListItems.tsx`、
`frontend/src/components/analysis/overview/RankingView.tsx`。無新依賴。五道閘門全綠。
