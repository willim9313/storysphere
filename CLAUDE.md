# CLAUDE.md

## 套件管理

- Python 套件一律使用 `uv` 管理，安裝依賴用 `uv add`，不要用 `pip install`

## TypeScript 型別

- API response type **一律從 `frontend/src/api/generated.ts`** 取用，不要在 `types.ts` 手寫新增
- 修改任何 Pydantic model 或 endpoint 後，執行 `npm run gen:types`（在 `frontend/` 下執行）
- 欄位命名規則：`api/schemas/` → camelCase；`domain/` → snake_case
- 背景說明見 @docs/type-generation.md

## 規劃文件存檔

涉及演算邏輯、框架整合、或架構決策的高複雜度開發任務，除了產出規劃文件供用戶確認外，**同時**將該文件儲存至 `docs/plans/`。

**命名格式：** `YYYYMMDD-<簡短功能描述>.md`
例如：`20250428-tension-scoring-algorithm.md`

**存檔時機：** 開始實作前，規劃內容確認後立即存檔。