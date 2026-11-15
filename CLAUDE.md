# CLAUDE.md

## 這是什麼

StorySphere v4 的 prototype：新版分析契約（證據外殼＋內容表、方法 registry、筆記）的後端，加一個檢視成果、可接 agent 大腦的簡易 UI。範圍是通用層＋推理一個題材。

**規格在 `docs/spec/`**（即 `prototype_v0_草案` 的 00–09，開工時整包複製進來；06 本身就是這份 CLAUDE.md）。規格與程式衝突時先問，不要自己挑一邊；上層設計（契約 v2、Agent 整合架構）高於 `docs/spec/`。

| 想知道 | 準據 |
| --- | --- |
| 證據類型與欄位、資料表 | `docs/spec/01_證據格式與儲存.md` |
| 入庫步驟 | `docs/spec/02_入庫流程.md` |
| 方法宣告、registry、預設結果卡 | `docs/spec/03_方法宣告.md` |
| REST、SSE、MCP 工具 | `docs/spec/04_API.md` |
| 畫面、view、大腦接法 | `docs/spec/05_原型UI與大腦接法.md` |
| 任務與完成標準 | `docs/spec/07_任務清單.md` |
| 驗收用的預期結果 | `docs/spec/09_驗收清單.md` |

## 核心原則：少做、先想、做完驗證

動手前先問：**使用者真正要解決什麼？最少能達成的方法是什麼？** 能改 1 行不改 10 行；能用現成不寫新的。

## 開發前的必要 checkpoint

開始任何實作前，在回覆中回答以下四題，未完成前不寫程式碼：

1. **哪些檔案會被異動？** 列出每個新增／修改／刪除的檔案。
2. **有沒有現成工具或函式可用？** 包含舊 repo（`willim9313/storysphere`）裡能沿用的模組，見 `docs/spec/00_README.md`「與既有 storysphere 的關係」。
3. **會不會引入新依賴或新結構？** 有的話說明必要性。
4. **改錯怎麼還原？**

**規格同步確認**：這次改動碰到哪份規格？

| 改了 | 要同步 |
| --- | --- |
| 證據類型、欄位、資料表 | `docs/spec/01` ＋ `domain/evidence/` 的 Pydantic model ＋ registry |
| 入庫步驟或單位 | `docs/spec/02` |
| 方法宣告、預設結果卡 | `docs/spec/03` ＋ `registry/` YAML |
| REST／SSE／MCP 介面 | `docs/spec/04`，commit message 標 `[api-spec updated]` |
| 畫面、view | `docs/spec/05` |

## 紅線

既有紀律，照舊：

- 禁止為「未來可能會用到」加東西——只做任務明確要求的。
- 禁止順手整理不在任務範圍內的程式碼。
- 禁止憑「看起來沒用」就刪程式；有疑問先問。
- 一次異動超過 3 個檔案，先拆成子任務逐步確認。
- 禁止在專案目錄內執行會刪檔的批次指令（見下一節）。

新版契約的規則（違反等於破壞資料的可信度）：

- **方法只讀證據庫，不讀原文段落。** 需要原文的只有入庫；方法拿原文靠上游證據的 `evidence_quote`。
- **方法不改第 1 層證據。** 需要補資訊就產出新證據類型。
- **證據類型只能由 registry 宣告。** 新增類型先改 `docs/spec/01` 與 registry，registry 檢查通過才能用。
- **系統欄位不進任何寫入參數**（`level`、`source`、`run_id`、`produced_via`、`agent_backend`、`methodology_trace`…，清單見 `docs/spec/04` §1.5）。帶了就回 422，不是默默忽略。
- **筆記只能由使用者確認後寫入。** agent 的 `create_note` 只產生草稿。
- **LLM 一律經 `llm_for("<task>")`**，不寫死 provider 或模型名。
- **改 prompt 就升 `version`**，寫進 `runs.prompt_version`；不改版號等於讓舊結果無法追查。
- **大腦只經 MCP 碰系統。** 不給它 shell、檔案系統或 REST；關掉外接 harness 自帶的 Bash、寫檔、抓網頁工具。
- **金鑰只存環境變數名。** 不寫進設定檔、log、trace 或測試快照。

## 破壞性指令

`rm -rf`、`rsync --delete`、`git clean -fdx`、`git checkout -- .`、`git reset --hard` 這類會刪掉或覆蓋「沒有明確列出」的檔案的指令：

- 備份放到專案目錄外。
- 先看會動到什麼：`--dry-run`、`git clean -n`，沒有 dry-run 的先 `ls` 目標範圍。
- **`var/` 是使用者資料**（`var/neo.db`、`var/settings.yaml`），被 `.gitignore` 忽略，git 救不了，預設當成不可逆。
- 還原工作樹用 `git stash` 或另開 checkout。

## 完成後必報（Definition of Done）

提交前在回覆中列出：

**異動清單**：每個檔案一行（新增／修改／刪除）；有無新依賴。

**引用完整性**：搜過哪些地方確認沒破壞引用；刪除或改名的函式、型別是否已更新呼叫端。

**規格同步**：依上面的表格確認。

**閘門——全部 exit code 為 0**：

1. `uv run ruff check backend/ tests/`
2. `uv run pytest -m "not integration"`
3. `uv run python -m storysphere.registry check`（03 §2 的六條檢查）
4. `cd frontend && npm run lint`
5. `cd frontend && npm run build`
6. `cd frontend && npm run knip`

前端還沒建立時只跑 1–3。CI 跑同一組；CI 是安全網，提交前仍要自己跑。

## 測試規範

- 三層：純函數單元測試、API 端點測試（`tests/api/conftest.py` 的 `client` fixture）、服務整合測試（真實 SQLite＋`tmp_path`）。
- **LLM 一律 mock**，fixture 放 `tests/fixtures/llm/<task>/*.json`（真實輸出存下來當 fixture）。真的呼叫 LLM 的測試標 `@pytest.mark.integration`，不進 CI。
- **方法的測試**：給一組固定證據、mock LLM 回應，檢查產出證據的欄位、層級、`derived_from`。
- **入庫的整合測試**：用 benchmark 的推理文本，結果對照 `docs/spec/09_驗收清單.md`。benchmark 文本不放進 repo（路徑由環境變數 `BENCHMARK_DIR` 指定）。
- 分組用 `class TestXxx`；命名 `test_<情境>` 或 `test_<條件>_<預期>`。

## 套件與型別

- Python 一律 `uv`（`uv add`，不用 `pip install`）。
- 前端 API 型別一律從 `frontend/src/api/generated.ts` 取（`npm run gen:types`，由 openapi.json 產生），不手寫。
- 欄位命名：API schema camelCase；domain、MCP、registry YAML snake_case（`docs/spec/04` §1.1）。

## 主題與 UI

- 兩套主題：Warm（預設）與 Ink。token 從舊 repo 的 `frontend/src/styles/tokens.css` 複製，只用 `var(--*)`，不硬寫色碼。
- 原型只做繁體中文介面；不做 i18n。
- 會呼叫 LLM 的按鈕都帶 sparkles 標記（`.ss-btn-llm`）；零成本的不帶。
- 設計稿：Design 畫布「StorySphere v4 原型」（Warm 版為準）。

## 語言

- 程式碼、識別字、core prompt：英文。LLM 輸出的描述用書的語言；引文保留原文。
- 文件、註解中的說明、UI：繁體中文。

## 規劃文件

涉及演算邏輯、框架整合、架構決策的任務，先寫規劃給使用者確認，確認後存到 `docs/plans/YYYYMMDD-<描述>.md`，並在 `docs/plans/README.md` 補一列。已存檔的規劃不回頭修改；推翻時改的是 `docs/spec/`。
