# CLAUDE.md

## 測試規範

- 測試分三層：**純函數單元測試**（無 fixture）、**API 端點測試**（用 `tests/api/conftest.py` 的 `client` fixture）、**服務整合測試**（真實 SQLite + `tmp_path`）
- 測試分組用 `class TestXxx`；方法命名 `test_<情境>` 或 `test_<條件>_<預期>`
- `AsyncMock.side_effect` 一律用**同步函數**，不加 `async`，除非實際有 `await`
- 若端點需要 `conftest.py` 未涵蓋的依賴，在**測試檔案內**建立局部 fixture 擴充，不修改共用 `conftest.py`
- `task_store` 是全域單例，測試寫入時用 `uuid4()` 產生唯一 ID 避免跨測試污染
- 完整說明見 @docs/guides/TESTING.md

## 套件管理

- Python 套件一律使用 `uv` 管理，安裝依賴用 `uv add`，不要用 `pip install`

## TypeScript 型別

- API response type **一律從 `frontend/src/api/generated.ts`** 取用，不要在 `types.ts` 手寫新增
- 修改任何 Pydantic model 或 endpoint 後，執行 `npm run gen:types`（在 `frontend/` 下執行）
- 欄位命名規則：`api/schemas/` → camelCase；`domain/` → snake_case
- 背景說明見 @docs/type-generation.md

## 開發前的必要 Checkpoint

**開始任何實作前，必須在回覆中明確列出：**

1. 會新增 / 修改哪些 API endpoint → 確認是否需要更新 `docs/API_CONTRACT.md`
2. 涉及哪些 UI 元件、有無新元件 → 確認是否需要更新 `docs/UI_SPEC.md`
3. 哪些檔案會被修改 → 防止範疇擴散

未完成此 checkpoint 前不得開始寫程式碼。

## API Contract 維護紀律

任何新增或修改 API endpoint，**實作完成後必須同步更新 `docs/API_CONTRACT.md`**，並在 commit message 標註 `[api-contract updated]`。

## Definition of Done

實作完成後，提交前必須確認：

- 實作範疇未超出開發前 checkpoint 所列的檔案與 endpoint
- 執行 `ruff check src/` 無新增錯誤
- 執行 `cd frontend && npm run lint` 無新增錯誤
- 若有 API 變動，已依「API Contract 維護紀律」更新文件
- 若有 CSS token 變動，已同步更新 `docs/DESIGN_TOKENS.md` 的對照表
- 若功能對應 BACKLOG.md 條目，已將詳細內容移至 `docs/BACKLOG_ARCHIVE.md`，並更新 `docs/BACKLOG.md` 狀態表

## 主題系統

- 所有顏色、字體 token 一律使用 CSS variable（`var(--*)`），禁止在元件中硬編碼色碼
- Token 實作位於 `frontend/src/styles/tokens.css`；新增或修改任何 token 時，必須同步更新 `docs/DESIGN_TOKENS.md` 的對照表
- `FRONTEND_DEV_GUIDE.md` 為歷史參考文件，不得修改
- 主題切換邏輯唯一入口為 ThemeContext，不得在元件內直接讀寫 localStorage 或操作 `data-theme`

## 規劃文件存檔

涉及演算邏輯、框架整合、或架構決策的高複雜度開發任務，除了產出規劃文件供用戶確認外，**同時**將該文件儲存至 `docs/plans/`。

**命名格式：** `YYYYMMDD-<簡短功能描述>.md`
例如：`20250428-tension-scoring-algorithm.md`

**存檔時機：** 開始實作前，規劃內容確認後立即存檔。