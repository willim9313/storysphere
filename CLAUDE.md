# CLAUDE.md

## 核心原則：少做、先想、做完驗證

動手前先問：**使用者真正要解決什麼？最少能達成的方法是什麼？**
能改 1 行不改 10 行；能用現成不寫新的。

---

## 開發前的必要 Checkpoint

**開始任何實作前，必須在回覆中明確回答以下所有問題，未完成此 checkpoint 前不得開始寫程式碼。**

**四個必答問題：**

1. **哪些檔案會被異動？** 列出每個新增 / 修改 / 刪除的檔案
2. **有沒有現成工具或函式可用？** 確認不重複造輪子
3. **會不會引入新依賴或新結構？** 若有，說明必要性
4. **改錯怎麼還原？** 說明回滾方式

**文件同步確認：**

- 會新增 / 修改哪些 API endpoint → 確認是否需要更新 `docs/API_CONTRACT.md`
- 涉及哪些 UI 元件、有無新元件 → 確認是否需要更新 `docs/UI_SPEC.md`

---

## 紅線禁令

以下行為一律禁止，無例外：

- **禁止為「未來可能會用到」加東西** — 只做任務明確要求的
- **禁止順手整理不在任務範圍內的程式碼** — 就算覺得它寫得醜
- **禁止憑「看起來沒用」就刪程式** — 有疑問先問使用者，確認後才動
- **禁止在任務範圍外順手做其他改動** — 另開獨立任務處理
- **一次異動超過 3 個檔案，先拆成子任務逐步確認**，不一次全做完

---

## 完成後必報（Definition of Done）

實作完成後，提交前必須**在回覆中列出**下列清單：

**異動清單：**
- 動了哪些檔案（每個檔案一行，標明新增 / 修改 / 刪除）
- 有無引入新依賴（套件、工具、外部 API）

**引用完整性確認：**
- 搜過哪些地方確認沒破壞現有引用
- 有無刪除或改名的函式 / 型別，是否已全面更新呼叫端

**文件同步確認：**
- 若有 API 變動，已依「API Contract 維護紀律」更新 `docs/API_CONTRACT.md`
- 若有 CSS token 變動，已同步更新 `docs/DESIGN_TOKENS.md` 的對照表
- 若功能對應 BACKLOG.md 條目，已將詳細內容移至 `docs/BACKLOG_ARCHIVE.md`，並更新 `docs/BACKLOG.md` 狀態表
- 有無孤兒腳本或文件因改動而與實作漂移

**程式碼品質——五道閘門，這裡是唯一的清單：**
- 執行 `ruff check backend/` 全綠
- 執行 `ruff check tests/` 全綠
- 執行 `python -m pytest -m "not integration"` 全綠
- 執行 `cd frontend && npm run lint` 全綠
- 執行 `cd frontend && npm run build` 全綠
- 實作範疇未超出 checkpoint 所列的檔案與 endpoint

**判準是「全綠」，也就是 exit code 為 0——不是「沒有比之前更糟」。** 前三道於 2026-08-20
（PR #66）清乾淨，`ruff check tests/` 於 2026-08-21 補上（126 條），所以不必再取基線比對，
直接看 exit code 即可。

**「幾道閘門」以本節為準。** 這個數字一度在三份文件裡各說各話——CLAUDE.md 說三道
（漏了 pytest）、B-085 說四道、`docs/guides/TESTING.md` 另外要求 `ruff check tests/`
而那道當時根本是紅的。清單散在多處就會各自漂移，所以現在只有這裡列全，
TESTING.md 與 B-085 都改為指回這裡。

`npm run build` 是必跑項：`lint` 攔不到型別問題（typescript-eslint 關掉了
`no-undef`），刪掉變數卻漏改使用端這類 runtime ReferenceError 只有 `tsc` 會抓到。

**沒有任何 CI 在盯這五道閘門**（2026-08-20 評估後決定暫不建，見 B-085），所以綠不綠
完全靠提交前自己跑。B-066 是這件事的反例：`tsc -b` 長期紅著，紅久了就沒人看，錯誤
一路累積到 10 個才被清掉——其中還混著一個已經不存在的 interface 引用。閘門會腐化，
而腐化是靜默的。

**若閘門日後又變紅**（有紅的東西進了 main，「全綠」暫時做不到）：退回「無新增」判準，
用 `git worktree add <tmp> main` 取基線（前端需 `ln -s` 既有 `node_modules`），兩邊輸出
抹掉行號後再 diff（`sed -E 's/:[0-9]+:[0-9]+:/::/'` → `sort` → `comm -13`），否則上游
多幾行就會讓下游行號整批位移、誤報成新增。清乾淨後改回「全綠」。

---

## API Contract 維護紀律

任何新增或修改 API endpoint，**實作完成後必須同步更新 `docs/API_CONTRACT.md`**，並在 commit message 標註 `[api-contract updated]`。

---

## 測試規範

- 測試分三層：**純函數單元測試**（無 fixture）、**API 端點測試**（用 `tests/api/conftest.py` 的 `client` fixture）、**服務整合測試**（真實 SQLite + `tmp_path`）
- 測試分組用 `class TestXxx`；方法命名 `test_<情境>` 或 `test_<條件>_<預期>`
- `AsyncMock.side_effect` 一律用**同步函數**，不加 `async`，除非實際有 `await`
- 若端點需要 `conftest.py` 未涵蓋的依賴，在**測試檔案內**建立局部 fixture 擴充，不修改共用 `conftest.py`
- `task_store` 是全域單例，測試寫入時用 `uuid4()` 產生唯一 ID 避免跨測試污染
- 完整說明見 @docs/guides/TESTING.md

---

## 套件管理

- Python 套件一律使用 `uv` 管理，安裝依賴用 `uv add`，不要用 `pip install`

---

## TypeScript 型別

- API response type **一律從 `frontend/src/api/generated.ts`** 取用，不要在 `types.ts` 手寫新增
- 修改任何 Pydantic model 或 endpoint 後，執行 `npm run gen:types`（在 `frontend/` 下執行）
- 欄位命名規則：`api/schemas/` → camelCase；`domain/` → snake_case
- 背景說明見 @docs/type-generation.md

---

## 主題系統

- 所有顏色、字體 token 一律使用 CSS variable（`var(--*)`），禁止在元件中硬編碼色碼
- Token 實作位於 `frontend/src/styles/tokens.css`；新增或修改任何 token 時，必須同步更新 `docs/DESIGN_TOKENS.md` 的對照表
- `docs/archive/FRONTEND_DEV_GUIDE.md` 為歷史參考文件，不得修改（其中的舊 token 定義已失效，一律以 `DESIGN_TOKENS.md` 為準）
- 主題切換邏輯唯一入口為 ThemeContext，不得在元件內直接讀寫 localStorage 或操作 `data-theme`

---

## 規劃文件存檔

涉及演算邏輯、框架整合、或架構決策的高複雜度開發任務，除了產出規劃文件供用戶確認外，**同時**將該文件儲存至 `docs/plans/`。

**命名格式：** `YYYYMMDD-<簡短功能描述>.md`
例如：`20250428-tension-scoring-algorithm.md`

**存檔時機：** 開始實作前，規劃內容確認後立即存檔。

**存檔後：** 在 `docs/plans/README.md` 的表格補一列（日期 + 主題連結）。
`tests/docs/test_docs_drift.py::TestPlansIndex` 會檢查索引與目錄是否一致，漏補會失敗。

**已存檔的文件不回頭修改。** plans 是規劃當下的評估快照，實作後即凍結；後續開發
推翻其中內容時，改的是程式碼與 `API_CONTRACT.md` / `UI_SPEC.md`，不是回去改舊計畫。
因此**引用 plans 的內容時不可當作現況**。

**搜尋注意：** `docs/plans/` 已列入根目錄 `.ignore`，`rg`（含 Grep 工具）預設不搜這裡，
避免舊規劃混進現況查詢。需要時明確指定路徑（`rg <pattern> docs/plans`）或加 `-u`。
這只影響搜尋，git 照常追蹤。
