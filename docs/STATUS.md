# 進度與後續待辦

最後更新：2026-11-17（T19 A 批完成）。這份是給「開新對話接手」用的：新 session 先讀 `CLAUDE.md`、本檔，再讀要做的那張任務在 `docs/spec/07_任務清單.md` 的段落與它「依據」欄列的規格。

## 接手先看這裡（2026-11-16 使用者的決定）

1. **下一張做 T19（REST 與 SSE），不是 T16。** 順序改成 T19 → T20 → M6 UI；方法的部分先停。
2. **原型的方法砍到 6 個。** 已完成 5 個（EV2、EV1、CH2、CH4、CH5）。還要做的只剩 **MY4（公平性稽核）**，而且排在 UI 之後。**不做**：NS2、TM1、TM2、SY1、TM3、MY1、MY5（以及原本就不在 P0 的 MY2、EV3、CH1、CH3、NS1、NS3、MY3）。它們的宣告留在 `registry/`，引擎會當成「尚未實作」：入庫的 S5 自動跳過，API／UI 要顯示成尚未支援，不能當成錯誤。T16、T17 整張不做；T18 只剩 MY4。
3. **開發時不要拿整本書去跑真的 LLM。** T09–T15 每張都用整本《四簽名》實跑，共約 480 次 Gemini 呼叫（S1 70、s1b 重跑 36、S4 約 40、EV2 22、EV1 278、CH 系列 30），費用比使用者預期高很多。之後：
   - 單一任務的驗證**只用 mock LLM 的測試**；真的要打 LLM 時只跑一兩個單位或兩三章，目的只是確認 prompt 與解析能通。
   - **整本實跑只在里程碑做，先報預估的呼叫次數與模型，使用者說可以才跑。**
   - 任務清單裡「用四簽名跑一次整合測試、對照 09」的完成標準，先記成「未驗證」，累積到里程碑再一起跑。
   - subagent 開發也在花使用者的 Claude 額度（每張任務約 10–30 萬 token），交辦要精簡、不要重複派工。
4. **已經有一份跑好的四簽名資料可以直接用**，T19–T24 開發與手動操作都拿它，不必再叫 LLM：`var/benchmark_runs/sign_of_four/methods.db`（入庫到 S4＋EV2、EV1、CH2、CH4、CH5 的結果；用之前先複製）。
5. 因為方法減少而要連帶調整、還沒動的地方（做到時再處理，先改 `docs/spec/` 再改程式）：
   - `registry/perspectives/universal.yaml`、`mystery.yaml` 的預設卡仍列著不做的方法（「故事怎麼打亂時間？」「故事在哪些價值之間拉扯？」「這本書在說什麼？」「真相怎麼被藏起來？」「讀者被誤導到誰身上？」）。要決定是留著顯示「尚未支援」還是從預設卡拿掉。
   - `docs/spec/07_任務清單.md` 的 M4、`docs/spec/05`「10 張自動結果卡」、`docs/spec/09` 的 F6、F8（MY1、MY5）與 D4（NS2）都還是原本的範圍。
   - 方法論執行器（TM3、MY2 用）不做。

## 現況

| 任務 | 狀態 | commit |
| --- | --- | --- |
| T01 專案骨架與閘門 | 完成 | `2d56eba` |
| T02 ACP spike（人工檢查） | 完成，使用者已看過 | `c8245d4` |
| T03 證據外殼與關聯表 | 完成 | `d5383db` |
| T04 33 種證據的 model 與內容表 | 完成 | `f1fda7c` |
| T05 registry | 完成 | `20663fb` |
| T06 LLM 路由與設定 | 完成 | `95c752b` |
| T07 文件處理與章節審閱 | 完成 | `79ba6f3` |
| T08 抽取單位與斷點續跑 | 完成 | `80889bf` |
| T09 S1 核心抽取＋訊號標記 | 完成（四簽名實跑通過） | `227e075` |
| T10 S2 整併 | 完成；B1 有兩項未過（見「T10 現況」）；**人工檢查延到有畫面時** | `649144c` |
| T11 S3 題材判定 | 完成（四簽名判為推理；`signal_tagging` 升 v2） | `778aa27` |
| T12 S4 資訊控制的深度抽取 | 完成；四簽名實跑對照 09 E 段通過；人工檢查延到有畫面時 | `44b68c6` |
| T13 方法引擎 | 完成 | `42a7710` |
| T14 EV2、EV1 | 完成；F1 過但 kernel 佔 72%，**使用者決定 T15–T18 跑完後再調** | `c72cea5` |
| T15 CH2、CH4、CH5 | 完成；F2 過、F3 大致過、F4 一項成立、F5 無法判定（見「T15 現況」） | `9dc6a59` |
| T16 NS2 | **不做**（範圍調整） | — |
| T17 TM1、TM2、SY1、TM3 | **不做**（範圍調整） | — |
| T18 MY1、MY4、MY5 | 只做 MY4，排在 UI 之後；MY1、MY5 不做 | — |
| **T19 REST 與 SSE** | **進行中**：A 批（底座＋唯讀端點）完成，下一步 B 批；見「T19 現況」 | — |
| T20 之後 | 未開始 | — |

- 分支：本機 `main`，沒有遠端，沒推過。CI（`.github/workflows/gates.yml`）寫好但從沒跑過。
- 閘門現況：後端三道（ruff、pytest 沒設 `BENCHMARK_DIR` 時 1202 passed、2 skipped、registry check）exit 0；前端三道在 T01 通過後沒再動過。
- 這台有 `.env`（`GEMINI_API_KEY`，被 gitignore）。程式不會自己讀 `.env`，要 `uv run --env-file .env`。
- 相關目錄：
  - 本專案：`~/Desktop/storysphere_v4_app`
  - 舊 repo（只讀參考）：`~/Desktop/storysphere_ref`
  - 規格原稿、上層設計、benchmark：`~/Desktop/storysphere_v4`（`prototype_v0_草案/`、`StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/`、`storysphere_benchmark/`）
- **`docs/spec/` 已經和原稿 `prototype_v0_草案/` 不同步**：01、02、03、05 在本專案改過，原稿沒回寫。以 `docs/spec/` 為準。

## 工作方式（使用者的指示）

- **不拿整本書跑真的 LLM 來驗證單一任務**；整本實跑先報呼叫次數、等同意（見最上面「接手先看這裡」第 3 點）。
- **真的呼叫 LLM 產生的資料放 `var/benchmark_runs/`**（被 gitignore；說明見該目錄的 README）。`sign_of_four/ingest_s4.db`＝四簽名入庫到 S4；`sign_of_four/methods.db`＝再加上 EV2、EV1、CH2、CH4、CH5 的結果（最新）。用之前先複製。STATUS 較早段落提到「scratchpad 的 `s1run/`」的地方都已搬到這裡。
- **用 subagent 分擔開發**（使用者要求，減輕主對話的 context 與額度）；回報時標明哪些是 subagent 做的，產出要核對、閘門要自己重跑。
- 一張任務一張做；做完照 `CLAUDE.md` 的 Definition of Done 回報，並逐條列完成標準。
- checkpoint 四題照寫，但不必等同意就可以動手；**遇到要使用者決定的事才停**。
- **簡易、機械性的工作交給 subagent**（搭骨架、照規格表填檔、寫大量同型檔案），需要判斷的自己做。subagent 的產出要核對。
- **安裝與工具鏈盡量照舊 repo**（`pyproject.toml`、`frontend/package.json`、CI、`.env.example`）；依賴只在任務用到時才 `uv add`。
- **commit 要使用者說了才做**；不要自己推送或建遠端。
- 人工檢查點（T10、T12、T18、T28）做完就停，用規格 10 的 P2 格式準備材料。
- 規格有缺口或矛盾：停下來，用 P3 格式回報（位置、問題、影響、最多 3 個選項＋建議）；決定後**先改 `docs/spec/` 再改程式**。

## 環境注意事項

- **npm 官方 registry 連不上**（這台機器的系統 DNS 把 `registry.npmjs.org` 解析到連不通的位址；`dig` 查到的是對的）。目前做法：`npm install --registry=https://registry.npmmirror.com`，裝完把 `package-lock.json` 的 `resolved` 網址換回 `registry.npmjs.org`。`npx` 也要設 `npm_config_registry`。先測 `curl -m 6 https://registry.npmjs.org/react`，通了就用官方。
- **Claude Code CLI 要另外登入**（桌面 app 的登入不算）。T26 之前確認 `claude auth status` 是 `loggedIn: true`。跑 ACP 相關指令要在沙箱外。
- 本機：uv 0.7.3、Node 24.3、Python 3.13、SQLite 3.47（支援 FTS5 trigram）。
- `pytest` 有兩則已知警告，沒處理：Starlette TestClient 建議改用 `httpx2`；pytest-asyncio 的 `asyncio_default_fixture_loop_scope` 未設。

## 等使用者決定的事

| # | 問題 | 最晚何時要決定 | 我的建議 |
| --- | --- | --- | --- |
| 1 | ~~MY1 必讀 `anachrony`~~ | — | **不用決定了**：MY1、NS2 都不做 |
| 6 | **CH4 的宣告要不要加讀 `character`**（現在讀不到角色名稱與種類，群體也被當成角色；改 `registry/methods/CH4.yaml` 與 03 §4.1） | 陣營畫面（T24）前 | 加 |
| 8 | **S4 三件事**：角色的推理屬性（mystery_role 等）怎麼寫入；`reveal.revealer_id` 要不要放寬成可空（現在 33 筆揭曉因此被丟）；`hidden_truth.reveal_id` 回填繞過 `write_evidence` 是否接受 | MY4 前 | 推理屬性先不做；揭曉者放寬成可空；回填接受 |
| 9 | **使用者說之後再調的**：EV1 的 kernel 佔 72%；S2 有兩個角色沒合併（巴塞洛謬、肖爾托少校）；CH5 的錯誤認知品質 | 里程碑整本實跑前 | 有畫面可看之後再調 |
| 3 | **7 個草擬的方法問句**（EV2、EV3、CH3、NS1、NS3、TM1、MY3；YAML 裡標了「草擬，規格未定」） | T19（「也可以問」清單上線）前 | 使用者過目後把註記拿掉 |
| 4 | **Design 畫布「StorySphere v4 原型」不在任何資料夾裡**，M6 的完成標準要對照它 | T21 前 | 請使用者提供匯出檔或連結 |
| 5 | 要不要把 `docs/spec/` 的修改回寫到原稿 `prototype_v0_草案/` | 不急 | 驗收（T28）後一次回寫 |

已決定、沒寫進規格的：Codex（ChatGPT 訂閱）先不接（設定檔可寫，選到時回報未支援）；段落維持約 1,200 字的 chunk，不改回原文段落。

已決定、已寫進規格的：checkpoint 用獨立檔 `var/ingestion_checkpoints.db`（01 §1、`CLAUDE.md`）；第一個標題之前的無標題內容預設角色 `other`（02 §1）；書章段不搬舊的摘要／關鍵字／embedding 等欄位、`evidence.book_id` 不設外鍵（01 §2）；`modelId` 用 `<整合>:<模型>` 前綴字串、`var/settings.yaml` 不存在時讀 `config/settings.default.yaml`（04 N-08a、01 §1）；`character` 的引文取 S2 段落標記的首次提及（01 §3、02 §4）；CH5 不讀 `reveal`（03 §4.1）；Claude Code 的四項隔離設定（05 §5.2）。

## 後續任務

每張的完成標準見 `docs/spec/07_任務清單.md`；這裡只記「做的時候要知道、但規格沒寫」的事。

### T19 現況（2026-11-17）

- 範圍與接法見 `docs/plans/20261116-t19-rest-sse.md`（使用者確認：最小集合三批；不做的方法從預設卡拿掉）。
- **預設卡已改成 5 張**（EV1、CH2、CH4、CH5、MY4）：`registry/perspectives/`、03 §5（原型決定）、04 N-03b 都已改；拿掉的問句由 N-03c（C 批）標 `implemented=false`。
- **A 批完成**：lifespan 接上 engine／`init_db`／`mark_interrupted_jobs`／`MethodEngine`（`app.state`）；DB 路徑用環境變數 `STORYSPHERE_DB`，預設 `var/neo.db`。端點 N-01a/c/e、N-03a、N-04b/c/e、N-05a–d、N-07a/b/f/g、N-09a/b，每個都有 API 測試（`tests/api/`，共 73 個）。用 `methods.db` 副本手動打過一輪，回應形狀正確。
- 程式位置：`api/errors.py`（`{detail, code}`）、`api/deps.py`、`api/schemas/`、`api/routes/`、`api/queries/`（T20 的 MCP 讀取工具共用 `queries/evidence.py`）。測試資料用 `tests/api/support.seed(db_file, fill)`。
- 已同步到 04：N-05b 的 `edits` 加 `action`、`reason`；N-05a 的 `q` 少於 3 個字改用子字串比對；N-04b 排序與 `summary`／`precheck` 轉 camelCase；N-05d 的 `highlights` 與跨章前後文；N-04e 兩種模式回哪些證據。
- **還沒接進 lifespan**（B 批）：checkpointer、`IngestService`（`stages=build_s1_stages()`）、`MethodJobs`。
- **已知不穩定的測試**：`tests/ingest/test_unit_runner.py::TestTwoStages::test_429_in_one_stage_pauses_without_stuck_running_then_resumes` 在整套測試負載下偶爾失敗（3 次裡 1 次），單獨跑 15 次都過。之前就有，不是 T19 造成的；還沒查。

### T19 動工前要知道的（彙整前面各張留下來的）

- **還沒接進 app 啟動的東西**（`api/main.py` 的 lifespan 目前只做 LLM 能力檢查）：engine 與 `init_db`、DB 路徑的設定來源、checkpointer（`ingest/service.open_checkpointer`）、`IngestService`（要傳 `stages=build_s1_stages()`、`method_engine=default_method_engine(sf)`）、`MethodJobs`、啟動時呼叫 `mark_interrupted_jobs()`。
- **service 層已備好、只差端點的**：
  - 入庫：`IngestService.create_job()`＋背景跑 `run_to_review()`（N-01b）；`get_review_data()`（N-02d）；`submit_review()`（N-02e）；`resume()`（N-09e）；`ReviewStateError.code`、`JobStateError` 對應 409。service 的 payload 是 snake_case，API 層轉 camelCase。
  - 方法：`MethodEngine.plan_method()`（N-04a 的 dryRun）、`run_method()`；`MethodJobs.trigger_method()` 回 `TriggerResult(job_id, attached)`；`JobConflictError` 對應 409 `job_conflict`。
  - LLM 設定：`llm/settings.py`、`llm/startup_test.run_llm_test()`（N-08a–d）。
  - 題材：`store/books.set_genre_override()`。
- **還沒有、T19 要新做的**：取消（N-09d，要清 checkpoint）、只重跑失敗單位（N-02f）、從某一步重跑（N-02g）、`genre_s4`（N-02h）、SSE 與 `job.progress`／`last_seq`、N-04a 的 `reused`、依 `scopeKey` 重跑（N-04d）、刪書（N-01d，要在同一交易清所有帶 `book_id` 的表，含 `paragraph_entities`、`ingest_units`、`ingest_unit_outputs`、`runs`、`jobs`）。
- **範圍建議**：T19 的端點很多（04 全文）。先做讓 UI 能動的最小集合——書單與書的總覽、入庫與審閱、job 狀態與 SSE、證據列表與單筆（含引文與上游）、觸發與查詢方法 run、LLM 設定——其餘（筆記、agent、重跑類）排後面。動工前把要做的端點清單列給使用者確認。
- 測試全用 mock；手動驗證用 `var/benchmark_runs/sign_of_four/methods.db` 的副本，不叫 LLM。
- 其他提醒見下方「M5 API」一段（系統欄位 422、第 1 層 403、FTS 短查詢、時間補時區）。

### T06 留給後面的事

- **N-08a–N-08d 的 REST 端點沒做**，留給 T19：`llm/settings.py`（`load_settings`、`caps_ok`、`provider_configured`、`SUBSCRIPTION_RISK_NOTICE`）與 `llm/startup_test.py`（`run_llm_test` 的結果 `model_dump(by_alias=True)` 就是 N-08c 的 `result`）已備好。寫入 `var/settings.yaml`（N-08b）與建 `llm_test` job 也在 T19。
- 觸發端點的 503 檢查用 `router.task_available()`；run 的 `model` 欄用 `router.primary_model_id()`。
- 要 structured output 時寫 `llm_for(task, schema=Model)`，不要自己接 `.with_structured_output()`（有備援時回傳的是 fallback 鏈）。
- `classify_step_failure` 已在 T08 搬到 `llm/errors.py`；`llm_retry` 沒搬（單位重試由 `unit_runner` 自己做）。
- **Gemini 沒有實測**：這台沒有 `GEMINI_API_KEY`、沒有 `.env`。T09 前要設好並跑一次 `run_llm_test`。Claude 訂閱（`via: claude_agent_sdk`）實測通過（連線、structured output）。
- 設定檔路徑可用環境變數 `STORYSPHERE_SETTINGS` 指定；`tests/api/conftest.py` 固定指到預設檔。

### M2 入庫前半

**T07 留給後面的事**
- **「段落」是 chunk，不是原文段落**：沿用的 chunker 把一章的文字接起來，再依句界切成最多約 1,200 字的塊。四簽名整本是 70 個 chunk（含 1 個非正文）。引文的 `paragraph_id` 指的是 chunk；T08 的抽取單位（3,000 字）大約是 2–3 個 chunk。每章第一個 chunk 開頭含章名（`title_span`）。
- REST 沒做（T19）：N-01b 呼叫 `IngestService.create_job()`＋背景跑 `run_to_review()`；N-02d＝`get_review_data()`；N-02e＝`submit_review()`；`ReviewStateError.code` 對應 409。service 的 payload 是 snake_case，API 層轉 camelCase。
- **審閱省略 `chapters` 時，`role_overrides`、`paragraph_splits` 也不會套用**（舊行為，照搬）。前端要改任何東西都得一併送 `chapters`。
- `IngestService`、checkpointer、engine 還沒接進 app 的 lifespan（T19）；`store/db.py` 的 DB 路徑也還沒有設定來源。
- 圖目前是 P1 → 審閱 → `finish_node`（直接把 job 標 `done`）；T09 把 S1 之後的節點插在 `finish_node` 前。`stage` 在完成後仍是 `review`。
- 失敗或取消的 job 不會清 checkpoint（N-09d 取消時要刪，T19）。
- `ParagraphSource` 的真實實作是 `store/books.BookParagraphSource(session)`。
- `evidence.book_id` 沒有外鍵；N-01d 刪書要在同一交易清所有帶 `book_id` 的表。
- 只有 TXT 用真實書測過；PDF／DOCX／EPUB 只有搬過來的單元測試。

**T08 留給後面的事**
- 入庫圖現在是 P1 → 審閱 → `units` 節點 → `finish`。`units` 節點跑 `IngestService(stages=[...])` 傳進來的 `UnitStage(name, call, model, prompt_version)`；**目前預設沒有任何 stage**，所以正式流程不會產生單位。T09 把 S1 的兩個呼叫做成 `s1a`、`s1b` 兩個 stage 接上去，`call(unit)` 的回傳值就是存進 `ingest_unit_outputs.raw_json` 的東西。
- 單位依序跑、兩個 stage 也是先後跑；02 §3 的「同一單位兩個呼叫並行」要在 T09 決定怎麼做（改 `run_stage` 或在一個 stage 裡自己並行）。
- **四簽名切出 35 個單位**（規格估 25–30）：chunk 約 1,200 字，3,000 字上限下一個單位通常只裝得下 2 個 chunk。S1 約 70 次呼叫。
- `mark_interrupted_jobs(session_factory)` 還沒接進 app 啟動（T19，和 engine 一起）。`IngestService.resume(job_id)`＝N-09e，`JobStateError`＝409 `invalid_state`。
- 被拒絕的回應要丟 `llm/errors.LLMResponseBlocked` 才不會被重試；T09 的呼叫要自己檢查空回應／`prompt_feedback`（舊 repo 的 `llm_text`、`raise_if_blocked` 沒搬）。
- `is_rate_limit_error` 是照搬的字串比對（訊息含 `429`、`quota` 就算），可能誤判。
- N-02f（只重跑指定的 failed 單位）沒做；現在續跑會連 failed 一起重試。
- `job.progress` 在單位階段不更新（T19 的 SSE 一起做）。
- `agent_sessions`、`trace_calls`、`methodologies` 三張表也還沒建（T13／T20／T25 用到時建）。

**T09 留給後面的事**
- `ingest/s1.build_s1_stages(settings)` 回傳 `s1a`、`s1b` 兩個 stage；**還沒接進 `IngestService` 的建構**（T19 在 app 啟動時傳 `stages=build_s1_stages()`）。
- **四簽名整本實跑結果（Gemini 2.5 flash，2026-11-16）**：35 個單位，`s1a`、`s1b` 各 35 份輸出，0 個失敗單位；72 次呼叫中 2 次 JSON 語法壞掉（2.8%），重試後成功；沒遇到 429。總計：角色 333、事件 442、關係 206、話語 333、意象 174、設定提示 143、訊號 245（都是整併前、跨單位重複的數字）。
- **太慢：整本 S1 跑了 34 分鐘。** `s1a` 每個單位 50–60 秒，而同一個 stage 內單位是依序跑的。要在 `run_stage` 加同一 stage 內的併發（02 §3 本來就要 `ingestion_concurrency`）。
- **訊號幾乎都標 strong**：`info_control` 35 個單位全是 strong、`language_form` 33 個 strong。prompt 要的是「拿不準標 weak」，實際上模型很少用 weak。T11 題材判定算密度時要注意，可能要改 prompt（改了要升 version）。
- 這台已有 `.env`（`GEMINI_API_KEY`，被 gitignore）；程式不會自己讀 `.env`，要 `uv run --env-file .env`。Gemini 初次啟動測試通過。
- `tests/fixtures/llm/core_extraction/sample.json`、`signal_tagging/sample.json` 是那次實跑的真實輸出（合成文本，不是 benchmark）。
- 被取消的單位退回 `pending`（一個 stage 遇到 429 時另一個 stage 會被取消）。
- prompt 載入器 `llm/prompts.load_prompt("ingest/core_extraction")`；之後的 prompt（S3、S4、方法）照同一格式放 `prompts/`。
- S1 的 `raw_json` 沒有做欄位驗證；T10 讀的時候要容錯（缺欄位、枚舉外的值、`quote` 不是逐字）。

**T10 現況（2026-11-16，等使用者看過）**
- 程式在 `backend/storysphere/ingest/s2/`（`run_s2(session_factory, book_id)`），索引表 `store/paragraph_entities.py`；入庫圖是 P1 → 審閱 → units → s2 → finish。新依賴 `sentence-transformers`。閘門通過（833 passed）。
- 四簽名試跑（用 T09 那批 S1 輸出）：角色 109、事件 431、關係 178、話語 289、聚焦 16、意象 96、書籍背景 5；引文驗證 1233/1310＝94.1%（嚴格比對只有 87%，另有「忽略標點」的退路，規格 01 §3 沒寫）。
- **驗收 B1 有兩個沒過**：「巴塞洛謬」與「巴塞洛謬·肖爾托」各一筆；「肖爾托少校」與「約翰·肖爾托少校」各一筆。沒有誤併。**使用者決定先不加「唯一包含」合併規則（2026-11-16），B1 這兩項維持未過。** C1–C8 的事件都找得到，`text_rank` 連續且不倒退。
- 已知雜訊：別名裡有代名詞（他、你、我）；群體角色 30 個大多是泛稱（警察、工人們）；意象在 0.75 下併得太兇；`polarity=mixed` 被改成 `neutral`。
- 使用者決定保留引文的「忽略標點」退路（2026-11-16）。規格已補：`paragraph_entities` 表（01 §1）、S2 的引文定位（01 §3）、S2 的原型決定（02 §4）。
- **人工檢查延後**：使用者說他能做的測試要等有畫面可操作才算（2026-11-16），所以先繼續 T11；T10、T12 的人工檢查等開發者檢視（T23）做好後一起看。

**T10 S2 整併（人工檢查）**
- 角色引文＝首次提及；完全標不到的角色不入庫。
- **去重門檻對短摘要很嚴**：10 個字的摘要差 1 個字，3-gram Jaccard 只有 0.55，不會合併。看四簽名的實際結果，可能要調門檻或改比法。
- 去重只比同一批草稿，不比資料庫裡既有的。

### M3 入庫後半

**T11 現況（2026-11-16）**
- `ingest/s3.run_s3`；入庫圖 P1 → 審閱 → units → s2 → s3 → finish。`domain/genres.GENRES`、`store/books.set_genre_override`。閘門通過（870 passed）。
- **`signal_tagging` 已升到 v2**（使用者同意）。v1 每個單位把七個機制全標一遍，密度全是 1.00；v2 只列真的出現的。執行用的 prompt 在 `prompts/ingest/signal_tagging.md`，`docs/spec/08_prompts/` 那份仍是 v1，沒同步。
- 四簽名 v2 實跑（Gemini 2.5 flash）：`s1b` 35/35、1 次解析失敗後重試成功、約 11 分鐘；訊號 245 → 171 筆（每單位 4.9 個）。密度 info_control 1.00、threat 0.80、language_form 0.74、relations 0.66、journey 0.63、world_rules 0.54、historicity 0.51。`primary = mystery`（D2 過）；`mixed`＝thriller（章 3,4,5,7,10,11,12）、romance（1,2,4,6,7）、adventure（3,6,7,10,11,12），第 10、12 章有涵蓋（D3 過）。
- 仍要注意：info_control 在 35 個單位全是 strong，T12 的 S4 靠它挑單位還是等於全選。
- 試跑資料庫在 scratchpad 的 `s1run/`：`neo.db`（S1 v1）、`s2work.db`、`s3work.db`（v1 的 S2、S3）、**`v2.db`（s1a v1＋s1b v2＋S2＋S3，T12 用這份）**。重開機可能消失。

**T12 現況（2026-11-16）**
- `ingest/s4/`（`run_s4`）；入庫圖 P1 → 審閱 → units → s2 → s3 → s4 → finish。`run_stage(concurrency=)`，服務預設 4。閘門通過（933 passed）。
- **有一個不穩定的測試沒抓到**：全套跑第一次時 1 個失敗，之後 22 次都過。懷疑是 `tests/ingest/test_stage_concurrency.py`（用很短的 sleep 排時序）。
- 四簽名實跑（Gemini 2.5 flash，`s1run/s4.db`）：S4a 35 單位、1 次解析失敗後重試成功；S4b 4 批；共 15 分鐘。寫入真相 30、揭曉 152、線索 176、詭計 38；引文驗證 545/568＝96%。
- 對照 09 E 段：E1–E5 五個真相都有且連到對的揭曉章；E6、E7、E8、E10、E11、E12 都有；E9 只找到 1 條（譯文寫「木焦油」）。誤導線索 7 條。每條線索都連到一個真相。
- 品質問題：(1) 真相併得太粗，一筆包好幾件事（例：寶藏的存在、價值、藏匿地點、鑰匙下落、珍珠去向併成一筆），E2「寶藏沉入河中」沒有獨立一筆；(2) 有瑣碎的真相（福爾摩斯吸古柯鹼、華生的懷疑）；(3) 第 12 章有 6 個真相沒有任何揭曉，是分批造成的；(4) 55 條線索沒有指向任何角色（E8 毒刺沒指向通加，E7 指向「同夥」而非通加）；(5) 33 筆揭曉因為沒有揭曉者被丟。
- 還沒做、等使用者決定：角色的推理屬性（mystery_role 等）怎麼寫入；`hidden_truth.reveal_id` 的回填繞過 `write_evidence` 是否接受；`reveal.revealer_id` 要不要放寬成可空。
- fixture `deep_extraction`、`consolidation` 仍是手寫的（真實輸出含 benchmark 譯文，不能放進 repo）。

**T11 S3**、**T12 S4（人工檢查）**
- `reveal.revealer_id` 目前必填；敘述者直接向讀者揭曉時沒有角色可填，看抽取結果決定要不要放寬（01 §6 已註記）。
- 推理擴充欄位的枚舉（`mystery_role`、`case_type`）遇到未知值會驗證失敗，不會改成 `other`；LLM 輸出不穩的話要處理。
- `trick_category` 的分類規格自己說「實作前要對照原典確認」。

### M4 P0 方法

**T13 現況（2026-11-16）**
- `methods/`：`MethodEngine`（`run_method`、`plan_method`）、`MethodJobs.trigger_method`、`EvidenceReader`、選擇器、`run_s5`；入庫圖 … s4 → s5 → finish。閘門通過（1016 passed，連跑 3 次穩定）。原型決定寫在 03 §3 末。
- **寫新方法的方式（T14 起）**：繼承 `methods/base.MethodBase(decl)`，實作 `run(ctx, item)`（必要時覆寫 `check`、`plan`），設 `prompt_version`；在 `methods/implementations.default_implementations()` 註冊。取模型用 `ctx.llm()`，讀證據用 `ctx.evidence.list/get/count`（只能讀宣告的類型）。書層級結論可放 `ctx.summary`。測試範本在 `tests/methods/`（`support.py` 有假方法與假宣告）。
- 還沒做：方法論執行器（TM3、MY2，T17 前要有）；`reused`；依 `scopeKey` 重跑；`genre_ext`／`requires.source` 的語意；token 用量。
- 留意：`_execute_item` 在一個交易裡跑 `check → run（含 LLM 呼叫）→ 寫入`。SQLite 讀取不佔寫鎖所以目前沒事，但 T19 有並發寫入時要再確認。

**T14 現況（2026-11-16）**
- `methods/universal/causal_network.py`（EV2）、`kernel_satellite.py`（EV1）、`_llm.py`（`ainvoke_json`、`gather_limited`，並行上限 6）；prompt 在 `prompts/methods/`。閘門通過（1072 passed）。原型決定寫在 03 §3 末。
- 四簽名實跑（`var/benchmark_runs/sign_of_four/methods.db`＝`ingest_s4.db`＋EV2＋EV1；log 在同目錄）：EV2 22 窗、402 條連結，依序跑花了 19 分鐘（之後才加並行，沒重跑）；EV1 278 個邊界事件並行 6，6.5 分鐘。
- 驗收 F1 過（C3、C6、C8 對應的事件都是 kernel）。**但 431 個事件有 309 個是 kernel**，等於沒分。待決：調 EV1 的門檻與 prompt。
- `tests/ingest/test_stage_concurrency.py` 已改成不靠 sleep 排時序；先前那個偶發失敗應該就是它。
- **註冊真方法後，入庫圖的測試要傳 `method_engine=no_method_engine(sf)`**（`tests/methods/support.py`），否則 S5 會去建真模型。
- 實跑腳本：`var/benchmark_runs/scripts/run_method.py <db> <method_id>…`（會寫入該 db，先複製）。

**T15 現況（2026-11-16）**
- `methods/universal/arc.py`（CH2）、`network.py`（CH4）、`belief.py`（CH5）；新依賴 `networkx`。閘門通過（1133 passed）。原型決定在 03 §3 末。
- 四簽名實跑（結果在 `var/benchmark_runs/sign_of_four/methods.db`，log 是 `log_CH.txt`）：CH2 2.3 分鐘、CH4 20 秒、CH5 8.3 分鐘（60 筆 run 依序跑，其中 24 筆叫 LLM）。
- 驗收：F2 過（華生的弧線有對瑪麗的感情與訂婚）。F3 大致過（福爾摩斯一方、莫斯坦與肖爾托家、斯莫爾與通加各一個陣營；但四簽名的另外三人在另一個陣營）。F4 只有「瓊斯對撒迪厄斯的錯誤認知」明確成立；另兩項從 `belief_state` 看不出來。F5（讀者與華生同步）沒有資料可判：`belief_state` 沒有讀者這個主體。
- **待決**：CH4 的宣告要不要加 `requires: character`（改 `registry/methods/CH4.yaml` 與 03 §4.1）。2026-11-16 問過，使用者選擇先提交現狀，尚未決定。
- CH5 的錯誤認知品質不穩：有猜測語氣，有的「真相」本身說錯（例：說莫斯坦上尉是被殺害的）。

**T13 方法引擎（原提示）**
- `registry/checks.py` 已有 `execution_order()`、`producers()` 可用來做上游補跑。
- 要實作的範圍選擇器：`top_characters(n)`、`main_motifs(n)`、`events_with_out_degree(n)`、`characters_with_utterances(n)`、`events_with_tension_signal()`。
- 數量門檻（「事件 < 5」等）、NS1 的「無 kernel 事件」、TM3 的「tension_line 0 條」都不在宣告裡，要在各方法的 `check()` 做。
- run 完成要呼叫 `store/lifecycle.complete_run()`（取代舊證據、第 1 層重抽時傳播依據已變動）。

**T14–T18**：每個方法的 prompt 在 `docs/spec/08_prompts/methods/`，規則摘要在 `docs/spec/08_config/`。T18 是人工檢查。T16／T18 前先決定上表 #1。

### M5 API

**T19 REST 與 SSE**、**T20 MCP server**
- `assert_no_system_fields()` 已在 `store/evidence_writer.py`，API 層接上回 422。
- `store/lifecycle.reject_evidence()` 不分層級；「第 1 層回 403」要在 N-05e 擋。
- **FTS 用 trigram，少於 3 個字的查詢搜不到**（搜「華生」沒結果）。`search_evidence` 與 N-05a 的 `q` 可能要補短查詢的退路（例如 LIKE）。使用者輸入要跳脫 FTS5 語法字元。
- 從 SQLite 讀回的時間沒有時區資訊，輸出 UTC `Z` 時要補。
- `evidence_edits` 的 `action`、`reason` 在 04 的 N-05b 回應與 §6.3 沒寫到，實作時同步規格。
- 新依賴：`mcp`（spike 用的是 2.3.0，`MCPServer`，不是舊的 `FastMCP`）。

### M6 UI

**T21–T24**（先解決上表 #4）
- T24 的 8 種 view 還沒有規格，動手前要補（00「還沒寫的」）。
- 前端目前只有 react、react-dom；router、react-query、cytoscape、react-markdown、lucide-react 用到時才裝（knip 會擋沒用到的套件）。
- `npm run gen:types` 需要後端在 8000 埠跑著。

### M7 大腦

**T25 Gateway＋deepagents**：兩份 skill（`event-analysis`、`mystery-fair-play`）還沒寫（00「還沒寫的」）。

**T26 Claude Code（ACP）**：必讀 `docs/plans/20261115-acp-spike.md`。重點：
- 建 session 必設 `tools: []`、`settingSources: []`、`strict-mcp-config`，建好後 `set_session_mode("default")`。
- permission request 依工具名分流，不回 `allow_always`。
- 待驗證：`settingSources: []` 下 `.claude/skills/` 還會不會被載入；對話中切換權限模式能否擋下；`auth/status_update` 通知要接掉。
- 新依賴：`agent-client-protocol`（spike 用 1.0.0）。spike 腳本在 `scripts/acp_spike/`。

**T27 Agent 工作區畫面**

### M8

**T28 驗收報告（人工檢查）**：05 §1 三個成功條件＋09 逐列。

## 程式地圖（已完成的部分）

| 位置 | 內容 |
| --- | --- |
| `backend/storysphere/api/` | FastAPI：`main.py`（lifespan）、`errors.py`、`deps.py`、`schemas/`、`routes/`、`queries/`；T19 A 批的唯讀端點 |
| `backend/storysphere/domain/evidence/` | 33 個內容 model、`base.py`（枚舉轉 `other`＋`raw_label`）、`genre_ext.py` |
| `backend/storysphere/store/tables.py`、`db.py` | 外殼與關聯表、`runs`、`jobs`、FTS5 與 trigger |
| `backend/storysphere/store/content_tables.py` | `ev_*` 由 model 產生 |
| `backend/storysphere/store/evidence_writer.py` | 唯一的寫入路徑：層級、系統欄位、內容驗證、引文驗證 |
| `backend/storysphere/store/lifecycle.py` | `complete_run`、`mark_basis_changed`、`reject_evidence`、`purge_superseded` |
| `backend/storysphere/store/quotes.py`、`dedupe.py` | 引文比對、去重 |
| `backend/storysphere/llm/` | `settings.py`（三層設定、能力檢查）、`router.py`（`llm_for`）、`startup_test.py`（初次啟動測試） |
| `config/settings.default.yaml` | 預設 LLM 設定（只有 Gemini） |
| `backend/storysphere/domain/documents.py` | `Document`／`Chapter`／`Paragraph`、章節與段落角色 |
| `backend/storysphere/ingest/document_processing/`、`language_detection.py` | P1：載入、章節偵測、切段、語言偵測（搬自舊 repo） |
| `backend/storysphere/ingest/review.py`、`graph.py`、`service.py` | 審閱套用、LangGraph 入庫圖、`IngestService`（含續跑、`mark_interrupted_jobs`） |
| `backend/storysphere/ingest/units.py`、`unit_runner.py` | 切抽取單位；逐單位跑一個 stage（重試、額度暫停） |
| `backend/storysphere/store/ingest_units.py` | `ingest_units`／`ingest_unit_outputs` 表與存取 |
| `backend/storysphere/ingest/s2/`、`store/paragraph_entities.py` | S2 整併（`run_s2`）；段落角色索引表 |
| `backend/storysphere/ingest/s3.py`、`domain/genres.py` | S3 題材判定（`run_s3`）；10 種題材 id |
| `backend/storysphere/ingest/s4/` | S4 深度抽取與整併（`run_s4`） |
| `backend/storysphere/methods/base.py`、`reader.py`、`selectors.py`、`engine.py`、`jobs.py`、`s5.py`、`implementations.py` | 方法引擎：介面、唯讀查詢、選擇器、執行與上游補跑、`method_run` job、S5 預設觸發、方法註冊 |
| `backend/storysphere/methods/universal/` | EV2 `causal_network.py`、EV1 `kernel_satellite.py`、CH2 `arc.py`、CH4 `network.py`、CH5 `belief.py`；共用 `_llm.py` |
| `prompts/methods/` | 方法的 prompt（EV1、EV2、CH2、CH4、CH5） |
| `var/benchmark_runs/`（不進 git） | 四簽名的實跑資料庫、log、一次性腳本；見該目錄 README |
| `backend/storysphere/llm/errors.py` | `classify_step_failure`、`LLMResponseBlocked`、`llm_text` |
| `backend/storysphere/llm/prompts.py`、`json_output.py` | prompt 載入與 render；4 步 JSON 解析 |
| `backend/storysphere/ingest/s1.py` | S1 的兩個 stage（`s1a` 核心抽取、`s1b` 訊號標記） |
| `prompts/ingest/` | 入庫的 prompt（`core_extraction`、`signal_tagging` v2、`genre_detection`、`deep/`、`consolidate/`） |
| `backend/storysphere/store/books.py` | `books`／`chapters`／`paragraphs` 表與存取、`BookParagraphSource` |
| `backend/storysphere/registry/` | `models.py`、`loader.py`、`checks.py`、CLI |
| `registry/` | 方法、方法論、view、視角、機制、第 1 層類型的 YAML |
| `frontend/` | 只有外殼：健康檢查＋ Warm／Ink 切換 |
| `scripts/acp_spike/` | T02 的 spike 腳本 |
| `tests/` | `api/`、`ingest/`、`llm/`、`registry/`、`domain/`、`store/`；`tests/store/conftest.py` 有建各層證據的輔助 |
