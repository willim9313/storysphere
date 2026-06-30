# I-001 輕量化部署模式 — 實作規劃

**日期**: 2026-05-05（v2：納入 Opus review 修正）
**Branch**: `refactor/lightweight`  
**Backlog**: `docs/BACKLOG.md` → Infra 系列 I-001

---

## 目標

讓首次使用者在只設定任一 LLM provider 的 API key 的情況下能直接啟動系統，同時確保兩個部署模式之間的狀態邊界清晰，不做靜默降級。（Primary LLM 可配置化詳見 I-003，兩者建議同批實作）

---

## 兩個部署模式定義

| 項目 | `lightweight`（預設） | `standard` |
|------|----------------------|------------|
| Qdrant | Local file（`qdrant_local_path`） | Remote service（`qdrant_url`） |
| KG | 強制 `networkx` | 依 `kg_mode` 設定（networkx 或 neo4j） |
| 前置需求 | 無（只需 Python 環境） | Qdrant service 必須可連線 |
| 連線失敗行為 | 不適用（local file） | 拋明確錯誤，不靜默繼續 |

模式互斥，**不做跨模式自動 fallback**。

---

## 現有問題點（需修正）

### 1. Local 模式多 client 互鎖（最高風險）

`QdrantClient(path=...)` 使用嵌入式儲存，**同一 path 不允許兩個實例同時開啟**，否則拋 `RuntimeError: Storage folder is already accessed by another instance`。

目前有三個 client 建立點：
- `api/deps.py:80` — `get_vector_service()` 每次 request 都建新 `VectorService()`
- `api/main.py:137` — startup 時呼叫一次 `get_vector_service()`
- `workflows/ingestion.py:111` — `_build_qdrant_client()` 建 raw `QdrantClient`，傳給 `FeatureExtractionPipeline`

解法：**VectorService singleton + FeatureExtractionPipeline 改用 VectorService**（詳見修改方案 §5、§6）。

### 2. `ingestion.py` — 靜默吞錯（第 420–422 行）

```python
except Exception as exc:
    logger.warning("Qdrant unavailable (%s) — embeddings will not be stored", exc)
    return None
```

standard 模式下應拋明確錯誤，不繼續。

### 3. `vector_service.py` — 無 local path 支援

`__init__` 只有 remote URL 一條路徑，lightweight 所需的 `QdrantClient(path=...)` 未實作。

### 4. `settings.py` — 無 `deploy_mode`，`kg_mode` 未與部署模式連動

### 5. `qdrant_local_path` 相對路徑問題

預設值 `./data/qdrant_local` 與 cwd 綁定，從不同目錄啟動 uvicorn 會建到不同地方。

---

## 修改方案

### 1. `src/config/settings.py`

在檔案頂部補 logger：
```python
import logging
logger = logging.getLogger(__name__)
```

新增欄位：
```python
deploy_mode: Literal["lightweight", "standard"] = "lightweight"
qdrant_local_path: str = "./data/qdrant_local"
```

新增 derived property（解析為絕對路徑）：
```python
@property
def qdrant_mode(self) -> Literal["local", "remote"]:
    return "local" if self.deploy_mode == "lightweight" else "remote"

@property
def qdrant_local_path_absolute(self) -> Path:
    return Path(self.qdrant_local_path).resolve()
```

新增 `kg_mode` 保護 validator：
```python
@model_validator(mode="after")
def enforce_lightweight_constraints(self) -> "Settings":
    if self.deploy_mode == "lightweight" and self.kg_mode != "networkx":
        logger.warning(
            "deploy_mode=lightweight forces kg_mode=networkx (ignoring kg_mode=%s)",
            self.kg_mode,
        )
        self.kg_mode = "networkx"  # 直接賦值，BaseSettings 非 frozen
    return self
```

> **執行時機說明**：validator 僅在 `Settings()` 建構時觸發。`get_settings()` 快取後不會重跑。測試覆寫 `kg_mode` 時必須走 `get_settings.cache_clear()` 重建，否則保護邏輯被繞過。

---

### 2. `src/services/vector_service.py`

**修改 `__init__` 的最後 `else` 分支**（`client` 注入與 `in_memory` 兩條短路維持不變，不動）：

```python
# 修改點：僅限最後 else 分支（無注入 client、非 in_memory 的預設路徑）
if settings.qdrant_mode == "local":
    local_path = settings.qdrant_local_path_absolute
    local_path.mkdir(parents=True, exist_ok=True)
    self._client = QdrantClient(path=str(local_path))
    logger.info(
        "VectorService: using local Qdrant at %s "
        "(switching modes requires migration, see I-002)",
        local_path,
    )
else:
    self._client = QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )
    # standard 模式：啟動時驗證連線，失敗直接拋錯
    try:
        self._client.get_collections()
    except Exception as exc:
        raise RuntimeError(
            f"VectorService: cannot connect to Qdrant at {settings.qdrant_url} "
            f"(DEPLOY_MODE=standard requires Qdrant service running): {exc}"
        ) from exc
    logger.info("VectorService: connected to %s", settings.qdrant_url)
```

---

### 3. `src/api/deps.py`

`get_vector_service()` 改為 singleton，確保整個 process 只有一個 `VectorService` 實例：

```python
# 替換原本每次建新實例的寫法
from functools import lru_cache

@lru_cache(maxsize=1)
def get_vector_service() -> "VectorService":
    from services.vector_service import VectorService
    return VectorService()
```

> local 模式下多個 request 共用同一個 client 實例，避免互鎖。

---

### 4. `src/workflows/ingestion.py`

**移除 `_build_qdrant_client()`**，改為注入或取得 `VectorService` singleton：

```python
# __init__ 中，不再自建 QdrantClient
from api.deps import get_vector_service  # 或直接 import VectorService

vector_service = vector_service or get_vector_service()
self._vector_service = vector_service
```

`IngestionWorkflow.__init__` 簽名新增選用參數：
```python
def __init__(
    self,
    ...
    vector_service: Optional[VectorService] = None,
    skip_qdrant: bool = False,
    ...
):
```

傳給 `FeatureExtractionPipeline` 時改傳 `VectorService`（見 §5）。

---

### 5. `src/pipelines/feature_extraction/pipeline.py`

`FeatureExtractionPipeline.__init__` 的 `qdrant_client` 參數改為接受 `VectorService`（或保持向下相容接受兩者，實際使用改用 `VectorService`）：

`_upsert_to_qdrant()` 改用 `vector_service.ensure_collection()` + `vector_service.upsert_paragraphs()`，移除直接操作 raw client 的邏輯：

```python
async def _upsert_to_qdrant(self, doc, paragraphs, vectors) -> list[str]:
    await self._vector_service.ensure_collection(doc.id)
    para_dicts = [
        {
            "id": para.id,
            "embedding": vec,
            "text": para.text,
            "document_id": doc.id,
            "chapter_number": para.chapter_number,
            "position": para.position,
            "keywords": para.keywords,
            "keyword_scores": para.keyword_scores,
        }
        for para, vec in zip(paragraphs, vectors)
    ]
    return await self._vector_service.upsert_paragraphs(para_dicts, document_id=doc.id)
```

> 這同時消除了 `_upsert_to_qdrant` 與 `VectorService.ensure_collection` 的重複 collection 建立邏輯。

---

### 6. `.env.example`

在 `# ========== Vector Database (Qdrant) ==========` 段落前新增：

```
# ========== Deployment Mode ==========
# lightweight (default): zero-config startup, Qdrant stores data locally at QDRANT_LOCAL_PATH.
#   Required: nothing beyond Python environment.
#   KG: always networkx (Neo4j not available in this mode).
#   Note: first run will download embedding model (~80MB from HuggingFace).
#
# standard: production-grade, requires external Qdrant service.
#   Required: Qdrant service running at QDRANT_URL before startup.
#   On startup failure: explicit error, no silent fallback.
#   Switching modes requires data migration (see I-002 Migration CLI).
DEPLOY_MODE=lightweight
QDRANT_LOCAL_PATH=./data/qdrant_local
```

---

## 已知限制（不在本票處理）

- **Embedding 首次下載**：`all-MiniLM-L6-v2` 第一次啟動會從 HuggingFace 下載 ~80MB，屬正常行為（`.env.example` 已加說明）
- **`qdrant-client` local extras**：實作前確認 `pyproject.toml` 中 `qdrant-client` 的版本是否已包含本地儲存所需的 extras（`qdrant-client>=1.7` 目前已涵蓋，但實作時需驗證）
- **模式切換不自動遷移資料**：切換 `deploy_mode` 後需手動 migration（I-002）
- **Neo4j + standard 模式連線驗證**：`kg_mode=neo4j` 在 standard 模式下的啟動驗證留待後續

---

## 不在本票範圍

- Migration CLI（I-002）
- Vector migration（Qdrant local path → Qdrant service，I-003 後續）
- Docker / docker-compose 配置更新（B-011）

---

## 修改檔案清單

| 檔案 | 動作 |
|------|------|
| `src/config/settings.py` | 新增 `deploy_mode`、`qdrant_local_path`、derived properties、model_validator |
| `src/services/vector_service.py` | `__init__` 最後 else 分支改為依 `qdrant_mode` 分路 |
| `src/api/deps.py` | `get_vector_service()` 改為 `lru_cache` singleton |
| `src/workflows/ingestion.py` | 移除 `_build_qdrant_client()`；新增 `vector_service` 參數 |
| `src/pipelines/feature_extraction/pipeline.py` | `_upsert_to_qdrant()` 改用 `VectorService` |
| `.env.example` | 新增 `DEPLOY_MODE`、`QDRANT_LOCAL_PATH` |

---

## 驗收確認清單

- [ ] `uv sync && uv run uvicorn main:app` 在只設任一 LLM provider API key（+ `PRIMARY_LLM_PROVIDER`，見 I-003）的環境下啟動成功
- [ ] 上傳書、ingestion 後重啟，`VectorService.search()` 仍回傳結果（local file 持久化）
- [ ] `DEPLOY_MODE=standard`（未啟動 Qdrant）啟動時出現明確 RuntimeError，非靜默
- [ ] `DEPLOY_MODE=lightweight` + `KG_MODE=neo4j` 啟動時有 warning log，`kg_mode` 被強制為 `networkx`
- [ ] 同一 process 內 ingestion 執行期間，`VectorService.search()` 可被呼叫不拋 client 互鎖錯誤
- [ ] `ruff check src/` 無新增錯誤
- [ ] `cd frontend && npm run lint` 無新增錯誤（無前端變動，預期零錯誤）
