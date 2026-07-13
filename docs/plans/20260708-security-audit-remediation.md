# 安全稽核修正計劃（2026-07-08）

依據 `SECURITY_AUDIT_2026-07-08.md`（Fable 產出）。使用者決策：**只綁 loopback、不加認證層**；**依賴只升有 CVE 的套件**。

## 範圍分工

三個平行 sub-agent 處理可追蹤程式碼；主 agent 直接處理本機/gitignore 設定；其餘為人工建議。

### Sub-agent A — 網路暴露收斂（disjoint files）
- `backend/storysphere/config/settings.py`：`app_host` 預設 `"0.0.0.0"` → `"127.0.0.1"`
- `backend/storysphere/api/main.py`：
  - CORS `allow_origins` dev 由 `["*"]` 改明確白名單 `["http://localhost:5173", "http://127.0.0.1:5173"]`
  - `docs_url` / `redoc_url` 在非 development 時設 `None`
- 測試：`tests/api/` 加最小斷言（prod 關 docs、CORS 白名單）

### Sub-agent B — 資訊外洩 + 上傳 DoS 收斂（disjoint files）
- `backend/storysphere/api/routers/settings_info.py`：`database_url` 遮罩，只回 scheme/host（去除帳密與路徑）
- `backend/storysphere/api/routers/books.py`（upload，line ~631）：改**分塊串流**寫入 tmp，累計超過 `MAX_UPLOAD_BYTES` 即中止（413）並清檔；`detect-language`（已 bounded read）不動
- 測試 + 若 `docs/API_CONTRACT.md` 有記 settings/info 欄位語意則同步

### Sub-agent C — 依賴 CVE 修補（disjoint files）
- Python：`pyproject.toml` 提升 floor 並 `uv lock`，升到修復版：pypdf 6.13.3、python-multipart 0.0.31、starlette 1.3.1、langchain 1.3.9、langsmith 0.8.18、pydantic-settings 2.14.2、cryptography 48.0.1（torch 無修復版，略）；跑 `python -m pytest -m "not integration"`
- 前端：`cd frontend && npm audit fix`（**不加** `--force`），確認 react-router 留 6.x；`npm run lint` + build

### 主 agent 直接處理（本機/設定）
- `.claude/settings.local.json`（gitignored）：移除 `Bash(python3:*)`、清失效條目（舊 `Documents/GitHub/storysphere`、舊 `src/` 路徑）、加 `deny`（`Read(.env)`、`Bash(rm -rf:*)`）
- `.claude/skills/playwright-cli/SKILL.md`：`allowed-tools` 收斂，移除 `Bash(npx:*) Bash(npm:*)` 萬用
- `.gitignore`（tracked）：補 `*.pem`、`*.key`、`credentials*`
- `.env`（gitignored）：line 109 `APP_HOST` → `127.0.0.1`

## 人工/建議（不自動化）
- 輪替 GEMINI / Langfuse live key；prod 走 secret manager
- context7 MCP：使用者常用，保留（可選 pin 版本）
- WebSocket session 認證：對外部署再處理（audit 判低），列 backlog
- `.env.example` Langfuse 值經確認為佔位符，無需動作

## 回滾
每個 sub-agent 獨立 diff，主 agent review 後才 commit；`git checkout -- <file>` 或整體 `git reset` 即可還原。依賴類：`uv.lock` / `package-lock.json` 可 `git checkout` 還原。
