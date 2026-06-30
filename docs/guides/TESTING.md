# 測試規範

本文件記錄後端自動化測試的寫法慣例，供撰寫新測試時遵循。

---

## 指令速查

```bash
# 跑全部測試
python -m pytest

# 跑單一檔案
python -m pytest tests/api/test_reader.py -v

# 跑單一 class
python -m pytest tests/api/test_reader.py::TestListChapters -v

# 顯示覆蓋率（HTML 報告在 htmlcov/）
python -m pytest --cov=src
```

---

## 目錄結構

```
tests/
├── conftest.py              # 全域 pytest 設定（markers）
├── api/
│   ├── conftest.py          # API 層共用 fixtures（client、mock_kg、mock_doc …）
│   ├── test_reader.py       # 閱讀頁相關端點
│   ├── test_chapter_review.py
│   └── ...
├── services/
│   ├── test_document_service.py
│   └── ...
├── pipelines/
└── domain/
```

新測試依照受測程式碼的層級放入對應子目錄。

---

## 三種測試類型

### 1. 純函數單元測試

針對無副作用的 helper function（如 `_build_entity_segments`）。
不需要任何 fixture，直接呼叫並斷言。

```python
class TestBuildEntitySegments:
    def _seg(self, text, entities):
        from api.routers.books import _build_entity_segments
        return _build_entity_segments(text, entities)

    def test_no_entities_returns_single_segment(self):
        result = self._seg("Hello world.", [])
        assert len(result) == 1
        assert result[0].entity is None
```

### 2. API 端點測試

使用 `tests/api/conftest.py` 裡的 `client` fixture，所有外部依賴已被 mock。

```python
def test_returns_404_for_unknown_book(self, client):
    resp = client.get("/api/v1/books/no-such-book/chapters")
    assert resp.status_code == 404
```

若端點需要 `conftest.py` 未涵蓋的依賴（如 `EpistemicStateService`），在**測試檔案內**建立局部 fixture 擴充，不要修改共用 `conftest.py`：

```python
@pytest.fixture
def epistemic_client(mock_kg, mock_doc, ...):
    from api.main import create_app
    from api import deps
    app = create_app()
    mock_epistemic = AsyncMock()
    app.dependency_overrides[deps.get_epistemic_state_service] = lambda: mock_epistemic
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

### 3. 服務層整合測試

使用真實 SQLite（`tmp_path`），不 mock 服務內部，只 mock 外部呼叫（LLM、Qdrant）。

```python
@pytest.fixture
async def service(tmp_path):
    svc = DocumentService(database_url=f"sqlite+aiosqlite:///{tmp_path}/test.db")
    await svc.init_db()
    return svc

class TestDocumentServiceSave:
    @pytest.mark.asyncio
    async def test_save_and_retrieve(self, service):
        doc = _make_document()
        await service.save_document(doc)
        retrieved = await service.get_document(doc.id)
        assert retrieved.id == doc.id
```

---

## 命名規則

| 對象 | 格式 | 範例 |
|------|------|------|
| 測試 class | `TestXxx`（依功能分組） | `TestListChapters` |
| 測試方法 | `test_<情境>` 或 `test_<條件>_<預期>` | `test_returns_404_for_unknown_book` |
| 輔助方法 | 底線開頭 | `_make_document`, `_setup_awaiting` |
| 輔助函數（模組層級）| 底線開頭 | `_make_paragraph` |

---

## Mock 慣例

**AsyncMock side_effect 用同步函數**，除非確實需要 `await`：

```python
# 正確
def _get(doc_id):
    return doc if doc_id == "book-1" else None
mock_doc.get_document.side_effect = _get

# 避免（沒有用到 await 卻宣告 async）
async def _get(doc_id):
    return doc if doc_id == "book-1" else None
```

**mock 物件的初始化放在 `conftest.py` 的 fixture 裡**，不要在每個測試方法裡重新建 mock；如需覆寫，用 `side_effect` 或 `return_value` 在測試方法內調整。

---

## 測試隔離

- **API 測試**：`task_store` 是全域單例，若測試會寫入 task，使用 `uuid4()` 產生唯一 ID，避免跨測試污染
- **服務測試**：每個 test 用獨立的 `tmp_path`，確保 SQLite 不共用
- 不依賴測試執行順序；每個測試應能獨立通過

---

## 何時需要寫測試

新增或修改以下內容時需補測試：

| 類型 | 要測什麼 |
|------|---------|
| 新 API endpoint | happy path、404/422 邊界、關鍵欄位出現在回傳中 |
| 純函數 / helper | 空輸入、正常路徑、邊界條件 |
| Service 方法 | 儲存後可取回、欄位正確對應 |
| 分支邏輯（if/else） | 兩條路徑各至少一個測試 |

不需要測試的情況：框架本身的行為（FastAPI 自動做的 validation）、第三方套件的內部實作。

---

## Definition of Done（測試面）

- `python -m pytest` 無新增失敗
- `ruff check tests/` 無新增錯誤
- 新增的 endpoint / helper 有對應測試（參考上表）
