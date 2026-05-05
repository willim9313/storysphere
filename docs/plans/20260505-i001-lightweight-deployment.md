# I-001 輕量化部署模式 — 實作規劃

**日期**: 2026-05-05  
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

### 1. `ingestion.py` — 靜默吞錯（第 420–422 行）

```python
# 現有：連不上 Qdrant 就 return None，ingestion 繼續但不存向量
except Exception as exc:
    logger.warning("Qdrant unavailable (%s) — embeddings will not be stored", exc)
    return None
```

standard 模式下，這個行為讓系統在資料不完整的狀態下繼續執行，違反「明確錯誤」原則。

### 2. `vector_service.py` — 無 local path 支援

`__init__` 只有 remote URL 一條路徑，lightweight 模式所需的 `QdrantClient(path=...)` 完全未實作。

### 3. `settings.py` — 無 `deploy_mode`，`kg_mode` 未與部署模式連動

`kg_mode` 可以被設為 `neo4j`，但 lightweight 模式下不應允許（Neo4j 需要外部 service）。

---

## 修改方案

### 1. `src/config/settings.py`

新增兩個欄位：

```python
deploy_mode: Literal["lightweight", "standard"] = "lightweight"
qdrant_local_path: str = "./data/qdrant_local"
```

新增 `qdrant_mode` property（衍生值，不單獨設定）：

```python
@property
def qdrant_mode(self) -> Literal["local", "remote"]:
    return "local" if self.deploy_mode == "lightweight" else "remote"
```

新增啟動時的 `kg_mode` 保護邏輯（用 `model_post_init` 或 validator）：

```python
@model_validator(mode="after")
def enforce_lightweight_constraints(self) -> "Settings":
    if self.deploy_mode == "lightweight" and self.kg_mode != "networkx":
        logger.warning(
            "deploy_mode=lightweight forces kg_mode=networkx (ignoring kg_mode=%s)",
            self.kg_mode,
        )
        object.__setattr__(self, "kg_mode", "networkx")
    return self
```

> 注意：`BaseSettings` 預設 frozen=False，可直接 setattr；若需要用 `object.__setattr__` 視 pydantic 版本而定。

---

### 2. `src/services/vector_service.py`

修改 `__init__` 的預設初始化邏輯：

```python
# 現有（只有 remote）：
self._client = QdrantClient(
    url=settings.qdrant_url,
    api_key=settings.qdrant_api_key or None,
)

# 修改後（依 deploy_mode 分支）：
if settings.qdrant_mode == "local":
    Path(settings.qdrant_local_path).mkdir(parents=True, exist_ok=True)
    self._client = QdrantClient(path=settings.qdrant_local_path)
    logger.info("VectorService: using local Qdrant at %s", settings.qdrant_local_path)
else:
    self._client = QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )
    logger.info("VectorService: connecting to %s", settings.qdrant_url)
```

**`in_memory` 參數**：保留，僅供測試使用（明確傳入時才生效）。

**standard 模式連線驗證**：在 remote 初始化後加一次 `get_collections()` ping，連線失敗直接 raise，不讓後續操作在未連線狀態下進行：

```python
else:
    self._client = QdrantClient(url=..., api_key=...)
    try:
        self._client.get_collections()
    except Exception as exc:
        raise RuntimeError(
            f"VectorService: cannot connect to Qdrant at {settings.qdrant_url} "
            f"(DEPLOY_MODE=standard requires Qdrant service): {exc}"
        ) from exc
```

---

### 3. `src/workflows/ingestion.py`

修改 `_build_qdrant_client()`：

```python
@staticmethod
def _build_qdrant_client():
    from config.settings import get_settings
    from qdrant_client import QdrantClient

    settings = get_settings()

    if settings.qdrant_mode == "local":
        Path(settings.qdrant_local_path).mkdir(parents=True, exist_ok=True)
        client = QdrantClient(path=settings.qdrant_local_path)
        logger.info("IngestionWorkflow: using local Qdrant at %s", settings.qdrant_local_path)
        return client
    else:
        # standard 模式：連線失敗要明確拋錯
        try:
            client = QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key or None,
            )
            client.get_collections()  # 驗證連線
            return client
        except Exception as exc:
            raise RuntimeError(
                f"IngestionWorkflow: Qdrant unavailable at {settings.qdrant_url} "
                f"(DEPLOY_MODE=standard requires Qdrant service): {exc}"
            ) from exc
```

**`skip_qdrant` 參數**：保留，用於測試場景（`skip_qdrant=True` 時繞過 client 初始化）。  
**移除**：現有的 `try/except` 靜默吞錯邏輯（原第 420–422 行）。

---

### 4. `.env.example`

在 `# ========== Vector Database (Qdrant) ==========` 段落前新增：

```
# ========== Deployment Mode ==========
# lightweight (default): zero-config startup, Qdrant stores data locally at QDRANT_LOCAL_PATH.
#   Required: nothing beyond Python environment.
#   KG: always networkx (Neo4j not available in this mode).
#
# standard: production-grade, requires external Qdrant service (and optionally Neo4j).
#   Required: Qdrant service running at QDRANT_URL before startup.
#   On startup failure: explicit error, no silent fallback.
DEPLOY_MODE=lightweight
QDRANT_LOCAL_PATH=./data/qdrant_local
```

---

## 不在本票範圍

- Migration CLI（I-002：`src/cli/migrate.py`）
- Vector migration（Qdrant local path → Qdrant service，I-003）
- Docker / docker-compose 配置更新（B-011）
- Neo4j 連線驗證邏輯（kg_mode=neo4j 在 standard 模式下的啟動驗證）

---

## 驗收確認清單

- [ ] `uv sync && uv run uvicorn main:app` 在只設任一 LLM provider API key（+ `PRIMARY_LLM_PROVIDER`）的環境下啟動成功
- [ ] 上傳書、ingestion 後重啟，`VectorService.search()` 仍回傳結果
- [ ] `DEPLOY_MODE=standard`（未啟動 Qdrant）啟動時出現明確 RuntimeError，非靜默
- [ ] `DEPLOY_MODE=lightweight` + `KG_MODE=neo4j` 啟動時有 warning log，kg_mode 被強制為 networkx
- [ ] `ruff check src/` 無新增錯誤
- [ ] `cd frontend && npm run lint` 無新增錯誤（無前端變動，預期零錯誤）
