# 專案結構重構規劃

**日期：** 2026-07-01
**狀態：** ✅ 全部完成（Phase 1 `1056ddc`、Phase 3 `35bf6ff`、Phase 2 `3004d7a`），branch `refactor/backend-namespace`
**分支：** `chore/repo-structure-cleanup`（清理 + plan），`refactor/backend-namespace`（Phase 1/2/3 實作）

---

## 背景與問題

專案為全端 monorepo，但目錄結構是「後端佔 root、前端附掛」的不對稱設計，源自開發歷程（先後端、後前端）。Review 發現三個層級的結構問題，由重到輕：

### 問題 1（核心）：後端套件是「扁平的通用頂層名」

後端把 9 個資料夾直接當成 9 個獨立頂層套件對外暴露：

```
api, core, domain, services, tools, agents, config, pipelines, workflows
```

- 全部是極易撞名的通用字（`config`、`core`、`api` 尤甚），沒有 `storysphere` 命名空間包住。
- 現在能跑純靠 `pythonpath = ["src"]`（pytest）＋ wheel 的 package 映射硬撐。
- `src/__init__.py` 存在 → `src` 自己也是套件，導致 `import api.main` 與 `import src.api.main` **兩種寫法都能跑**，更混亂（README 用 `src.api.main`，`main.py` docstring 用 `api.main`）。
- 與 memory 記的依賴方向規則（`tools/ → services/`）矛盾：這些本是**同一系統的內部模組**，理應是 `storysphere.tools`、`storysphere.services`。

### 問題 2（可讀性）：`src/`(後端) + `frontend/`(前端) 不對稱

`src/` 隱含「專案本體」、`frontend/` 隱含「子專案」。全端專案更直覺的是對稱式 `backend/` + `frontend/`。**注意：** 若問題 1 已做（`src/storysphere/`），此問題大幅緩解（`src/storysphere` 已能一眼看出是 Python source root），故此階段為選配。

### 問題 3（獨立）：runtime 資料散落 root

`storysphere.db`（root）、`data/*.db`(7 個)、`data/qdrant_local/`、`data/knowledge_graph.json` 混在 root。路徑是 **8+ 處 code 預設值**，搬移需改 config。

---

## 影響範圍（量化）

| 項目 | 數量 |
|------|------|
| src/ 內 import 9 套件的檔案 | 109 |
| tests/ 內 import 9 套件的檔案 | 76 |
| 總 import 行數（src+tests） | 775 |
| docs 提到 `src/` 路徑的檔案 | ~46 |
| runtime 路徑預設值散落的 code 位置 | 8+（`settings.py`×6、`token_store.py`、`store.py`、`analysis_cache.py`、`symbol_service.py`、`link_prediction_store.py`） |

---

## 目標結構

```
storysphere/
├── backend/                    # ← 問題2：與 frontend/ 對稱
│   └── storysphere/            # ← 問題1：單一命名空間
│       ├── api/ core/ domain/ services/ tools/
│       ├── agents/ config/ pipelines/ workflows/
│       └── __init__.py
├── frontend/
├── var/                        # ← 問題3：runtime 資料集中
│   ├── *.db  qdrant_local/  knowledge_graph.json
├── docs/  tests/  pyproject.toml
```
（實際落地即此結構：`backend/storysphere/`。）

---

## 階段規劃（每階段可獨立交付、獨立 commit / PR）

### Phase 1：命名空間化（核心，高價值）✅ 已完成

> 實作結果：306 檔異動、775 行 import 改寫、41 處 `patch()` 字串路徑修正、~41 docs 更新。驗證：873 passed / 19 skipped、ruff 全過、uvicorn 啟動正常、sanity grep 0 命中。Follow-up：`npm run gen:types`（需啟動後端）。

**動機：** 消除撞名風險、統一 import、清掉雙重可 import 的混亂。

**影響檔案：**
- 移動：`src/{9 套件}/` → `src/storysphere/{9 套件}/`（用 `git mv` 保留歷史）
- 刪除：舊 `src/__init__.py`（改放 `src/storysphere/__init__.py`）
- 改寫 import：109 src 檔 + 76 test 檔、共 775 行 `from X` → `from storysphere.X`
- `pyproject.toml`：
  - `[tool.hatch.build.targets.wheel] packages = ["src/storysphere"]`
  - `[tool.pytest.ini_options] pythonpath = ["src"]`（不變，因 `storysphere` 在 `src/` 下）
  - `--cov=src/storysphere`、`[tool.coverage.run] source = ["src/storysphere"]`
- entry point / 文件字串：`uvicorn src.api.main:app` 統一成 `uvicorn storysphere.api.main:app`（README、`main.py` docstring、`.env` 註解、`API_TESTING.md`）
- docs：~46 檔的 `src/api` 等路徑字串（可用批次取代，逐一 review）

**步驟：**
1. `git mv` 建立 `src/storysphere/` 並搬入 9 套件
2. 批次改寫 import：`from (api|core|...)` → `from storysphere.\1`（用 script，逐檔 diff review）
3. 更新 `pyproject.toml`（packages / cov / source）
4. 更新 entry point 與所有文件字串
5. `python -m pytest` 全綠、`ruff check src/` 無新錯、後端可 `uvicorn storysphere.api.main:app` 啟動、前端 `npm run gen:types` 正常

**驗證：** 全測試套件（858+）通過；後端啟動並打通一個 API；`grep -rE "^(from|import) (api|core|domain|services|tools|agents|config|pipelines|workflows)[. ]"` 在 src/tests 應為 0 命中。

**回滾：** 全程在獨立分支；未合併前 `git checkout main` 即可。已合併則 revert PR。import 改寫用 script + 全量測試把關，錯誤會被測試擋下。

**風險：**
- import 改寫誤傷字串 / 註解 → 用精準 regex（行首 `from`/`import`）+ 全量測試
- 動態 import（`importlib`、字串 module 名）→ 事前 `grep -rn "importlib\|__import__\|import_module"` 確認
- LangGraph checkpoint 若序列化了 module 路徑 → 確認 `ingestion_checkpoints.db` 不含 pickled class path（否則需清 checkpoint）

> ⚠️ 依 CLAUDE.md「一次異動超過 3 檔先拆子任務」：本階段雖動 185+ 檔，但屬**機械式同構改寫**，應以「一次搬移 + 一次批次改寫 + 全量測試」為單一原子任務，並委派 subagent 執行、主 agent review diff（見 memory `feedback_subagent_delegation`）。

### Phase 2：`src/` → `backend/` 對稱化（選配，純可讀性）✅ 已完成

> 實作結果：174 檔 git mv、46 檔路徑字串更新（pyproject/README/CLAUDE.md/docs）。import 不受影響（皆 `from storysphere.*`）。**關鍵坑：** editable install 的 `.pth` 仍指向舊 `src/`，需重跑 `uv sync` 才能 uvicorn 啟動。驗證：873 passed、ruff 過、uvicorn 啟動並讀 `var/` 資料。

**動機：** 與 `frontend/` 對稱。**前提：** Phase 1 完成後此項價值下降，可略過。

**影響檔案：** `git mv src backend`；`pyproject.toml` 所有 `src/` 字串（packages、pythonpath、cov、source）；docs / README / `.env` 註解的 `src/` 路徑；`.gitignore`、CI（若有）。

**步驟：** `git mv` → 全量取代 `src/storysphere` → `backend/storysphere`、`pythonpath=["backend"]` → 測試 → 文件。

**回滾：** 獨立分支 / revert PR。

**風險：** 純路徑字串異動，風險低於 Phase 1，但仍須全量測試 + 啟動驗證。

### Phase 3：runtime 資料歸位 `var/`（獨立，低耦合）✅ 已完成

> 實作結果：6 code 檔預設路徑 + `.env.example` + `.gitignore` 改為 `var/`；實體資料 `data/`+`storysphere.db` 搬至 `var/`（已備份）；本機 `.env` 同步。驗證：後端讀 `var/` 既有 book/KG 資料 HTTP 200、873 passed。



**動機：** root 不再散落 runtime DB。與 Phase 1/2 無耦合，可任意順序做。

**影響檔案：**
- code 預設值（8+ 處）：`./data/*.db`、`./storysphere.db`、`./data/qdrant_local`、`./data/knowledge_graph.json` → `./var/...`
  - `src/storysphere/config/settings.py`（database_url、qdrant_local_path、kg_persistence_path、analysis_cache、token_usage、inferred_relations、tasks、ingestion_checkpoints）
  - `src/storysphere/core/token_store.py`、`src/storysphere/api/store.py`、`src/storysphere/services/analysis_cache.py`、`src/storysphere/services/symbol_service.py`、`src/storysphere/services/link_prediction_store.py`
- `.env.example`（DATABASE_URL、QDRANT_LOCAL_PATH、KG_PERSISTENCE_PATH、TASK_STORE_DB_PATH…）
- `.gitignore`（`data/uploads`、`data/processed`… → `var/...`；`*.db` 規則保留）
- 實體搬移現有 runtime 檔（本機操作，非 git）：`data/` → `var/`、`storysphere.db` → `var/`

**步驟：** 改預設值 → 改 `.env.example` → 改 `.gitignore` → 停服務、實體搬移檔案、更新本機 `.env` → 啟動驗證資料讀得到。

**驗證：** 後端啟動後，既有書籍 / KG / analysis cache 仍讀得到（確認路徑指向搬移後位置）。

**回滾：** code / config 改動走分支可 revert；實體檔案搬移前先備份 `data/` 與 `storysphere.db`。

**風險：** 使用者本機 `.env` 需手動同步新路徑（`.env` 不進 git）；搬移前務必備份 DB。

---

## 建議執行順序

1. **Phase 1**（核心，先做，獨立 PR）
2. **Phase 3**（獨立低風險，可與 1 平行或接續）
3. **Phase 2**（選配，最後評估是否需要）

每階段獨立 PR、獨立驗證，不混在同一次改動。Phase 1 依 memory 規則委派 subagent 實作、主 agent review。

---

## 文件同步待辦（實作各階段時）

- Phase 1/2 完成後更新：`README.md`（結構圖、啟動指令）、`docs/CORE.md`（若含路徑）、`docs/guides/*`、`CLAUDE.md`（`ruff check src/` 等指令）
- 無 API endpoint 變動 → 不需動 `docs/API_CONTRACT.md`
- 無 CSS token 變動 → 不需動 `docs/DESIGN_TOKENS.md`
