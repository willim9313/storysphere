# CLAUDE.md

## 套件管理

- Python 套件一律使用 `uv` 管理，安裝依賴用 `uv add`，不要用 `pip install`

## 前後端型別一致性

### 問題背景
後端 Pydantic model 輸出的 JSON 欄位命名**不一致**：
- `api/schemas/` 下的 model（如 `TaskStatus`）有 `alias_generator=to_camel` → 輸出 **camelCase**（`taskId`, `reviewStatus`）
- `domain/` 下的 model（如 `TensionLine`, `TensionTheme`）無 alias → 輸出 **snake_case**（`document_id`, `canonical_pole_a`）

手寫 TypeScript type 非常容易與實際 JSON 欄位不符，且 TypeScript 在 runtime 不會警告。

### 正確做法：從 OpenAPI spec 自動產生型別

後端啟動後，在 `frontend/` 執行：

```bash
npm run gen:types
```

這會從 `http://localhost:8000/openapi.json` 抓取 schema，自動生成 `frontend/src/api/generated.ts`，欄位名稱保證與實際 JSON 一致。

**觸發時機：**
- 新增或修改任何 Pydantic response model（`api/schemas/` 或 `domain/`）
- 新增後端 API endpoint
- 修改現有 endpoint 的回傳型別

**使用方式：**
- 新 API 的 TypeScript type 優先從 `generated.ts` 的 `components["schemas"]` 取用，不要手寫
- 現有 `types.ts` 的手寫型別可逐步遷移，但不要在裡面繼續新增 API response type

### 確認欄位名稱的快速方法
不確定某個欄位是 camelCase 還是 snake_case 時：
1. 看後端 model 是否有 `alias_generator=to_camel` → 有則 camelCase
2. 或直接查 `http://localhost:8000/docs` 的 Response Schema
