# 無測試覆蓋的後端服務：補齊計畫

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `tests/services/` 新增測試檔；原則上**不改動被測程式碼**
**依據**: `docs/guides/TESTING.md`

---

## 1. 現況清點（2026-08-19 實測）

`backend/storysphere/services/` 下有 6 個檔案沒有對應的測試檔。逐一查證後，實際情況分兩級：

### 1.1 完全零覆蓋

| 檔案 | 行數 | 全 `tests/` 提及次數 |
|---|---|---|
| `kg_migration.py` | 302 | **0** |

`migrate_networkx_to_neo4j()` 與 `migrate_neo4j_to_networkx()` 兩支資料搬遷函式，加一個 CLI parser。**出錯的後果是圖譜資料損毀**，而目前沒有任何測試碰過它。這是本份文件中唯一的高優先項。

它同時是 `POST /kg/migrate` 端點（`api/routers/kg_settings.py:174`）的實作，該端點的 runner 也在
[背景任務 runner 收斂](./20260819-background-task-runner.md) 的遷移清單裡。

### 1.2 只在 API 層以 mock 觸及，服務內部純邏輯無測試

| 檔案 | 行數 | 現有觸及 | 未測的部分 |
|---|---|---|---|
| `link_prediction_service.py` | 269 | `tests/api/test_inferred_relations.py`，但服務整個被 `AsyncMock` 取代（`:99-101`） | `_infer_type()`、`_visible_from_chapter()`、`run_inference()` 的 adamic-adar 路徑 |
| `epistemic_state_service.py` | 298 | 只在快取失效測試中被提及 | `get_character_knowledge()`、`_infer_misbeliefs()`、`classify_event_visibility()`、`_classify_batch()` |
| `symbol_graph_service.py` | 133 | `tests/api/test_symbols.py` 間接 | `build_graph()`、`get_co_occurrences()` |
| `link_prediction_store.py` | 132 | 同 link_prediction | 持久化往返 |
| `query_models.py` | 134 | 無 | 純資料模型，優先度最低 |

「API 測試有跑過」與「服務邏輯被測過」是兩件事 —— 端點測試把服務換成 mock，驗的是 router 的接線，不是服務的行為。

---

## 2. 為什麼值得補

- `kg_migration` 是**破壞性操作**，且雙 backend（NetworkX / Neo4j）的欄位對應靠人工維護。兩版 KG service 的私有 helper 完全不同構（見 [結構性殘留](./20260819-backend-structural-residue.md) §4），搬遷是這個落差唯一的交會點
- `link_prediction_service._visible_from_chapter()` 與 `_infer_type()` 是**純函數**，是 `docs/guides/TESTING.md` 定義的第一類測試，補起來成本最低、回報最直接
- `epistemic_state_service` 有 2 個 `@retry` 的 LLM 路徑，且是 `POST /narrative/classify` 洗掉 KG kernel 權重那個已知風險（`project_narrative_classify_hazard`）的鄰居

---

## 3. 建議順序

| 階段 | 內容 | 測試類型（依 TESTING.md） |
|---|---|---|
| P1 | `test_link_prediction_service.py` —— `_infer_type()`、`_visible_from_chapter()` 的空輸入／正常／邊界 | 純函數單元測試（無 fixture） |
| P2 | `test_kg_migration.py` —— NetworkX → Neo4j → NetworkX 往返，斷言實體／關係／事件數與關鍵欄位不失真。Neo4j 側以 mock driver 或 `pytest.mark.integration` 隔離 | 服務整合測試 |
| P3 | `test_epistemic_state_service.py` —— `get_character_knowledge()` 的快取命中／未命中兩條路徑；LLM 以 `AsyncMock` 取代（`side_effect` 用**同步**函數，見 TESTING.md） | 服務整合測試 |
| P4 | `test_symbol_graph_service.py`、`test_link_prediction_store.py` | 服務整合測試 |

`query_models.py` 暫不補 —— 純資料模型，投報比最低。

---

## 4. 明確不做

- **不為了好測而改被測程式碼**。若某段真的測不動，先在本文件外記下原因，不順手重構（那是另一個任務）
- **不修改 `tests/api/conftest.py`**。需要額外依賴時在測試檔內建局部 fixture（TESTING.md 明定）
- 不補 `query_models.py`
- 不新增測試依賴套件

---

## 5. 驗證方式

- `python -m pytest` 無新增失敗
- `python -m pytest --cov=backend/storysphere/services` 對上述 4 個檔案的覆蓋率由 0 提升（具體數字不設 KPI —— 目標是關鍵路徑有測試，不是數字好看）
- `ruff check tests/` 無新增錯誤

---

## 6. 回滾

純新增測試檔，revert 或直接刪檔即可，對生產程式碼零影響。
