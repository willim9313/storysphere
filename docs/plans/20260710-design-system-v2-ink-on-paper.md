# Design System v2 — "Ink on Paper" 全面翻新

**日期：** 2026-07-10
**Branch：** `feat/book-upload-revamp`
**設計來源：** Claude Design 專案 `a070c329-f8c9-40e9-909c-972820471834`（live contract = `colors_and_type.css`，元件參考 = `ui_kits/web_app/kit.css`）

---

## 1. 目標

移除舊的四主題系統（`default` / `manuscript` / `minimal-ink` / `pulp`），換成設計定案的兩主題系統：

| 主題 | 定位 | 關鍵值 |
|------|------|--------|
| **Warm**（預設，`:root`） | 暖象牙紙上的墨線 | 表面 `#f8f3e7→#f1e8d5→#e9ddc6`、墨色 `#2a2620`、焦赭 accent `#b05a34`、entity 為低彩度 warm hue arc（oklch） |
| **Ink**（`data-theme="ink"`） | 純黑白鋼筆線稿 | 表面 `#ffffff→#f6f6f4→#ececea`、墨色 `#151515`、border `#1a1a1a`；entity/symbol pill **沿用 Warm arc**（分類語意跨主題一致） |

新增一層 **component shape tokens**（`--card-radius`、`--btn-radius`、`--pill-radius`、`--badge-radius`、`--control-radius`、`--*-border-width`、`--card-shadow`、`--btn-shadow`），讓兩主題在「形」上分化：Warm 圓角軟影、Ink 直角平面重線。

字體改為：內容 serif = **Spectral + Noto Serif TC**；chrome sans = DM Sans + Noto Sans TC；**Caveat** 僅限插畫語彙；mono = Fira Code。移除 Libre Baskerville、IM Fell English、Space Mono、Permanent Marker。

---

## 2. 設計未直接定義的 domain token 推導規則

`colors_and_type.css` 未覆蓋 repo 既有的 domain 家族。依 README 規則「**不發明新色相** — 從既有 entity/symbol/status token 或 warm arc 未用步取用」推導：

| 家族 | Warm 推導 | Ink 推導 |
|------|-----------|----------|
| `--graph-*-fill/stroke/label` | 由 `--entity-*-bg/dot/fg` 派生（設計明言 graph node 消費 entity token） | 同 Warm（pill arc 跨主題共用） |
| `--polarity-*` | positive→success 橄欖、negative→error 磚紅、neutral→紙面、mixed→warning 赭黃 | 單色 fill-polarity（沿用舊 minimal-ink 模式） |
| `--symbol-density-*`、`--tension-intensity-*` | 焦赭單色 ramp（paper → sienna → 深 sienna） | 灰階 ramp |
| `--narrative-*` | present=accent、flashback=info 灰藍、flashforward=warning 赭黃、parallel=concept 藕紫、unknown=muted | 灰階線重差異 |
| `--frye-*` | romance=赭黃、comedy=橄欖、tragedy=磚紅、irony=灰藍 | 灰階 fill-polarity |
| `--booker-*` | 沿用「單一畫框」概念，色值換 warm paper + 焦赭 accent | 單色框 |
| `--timeline-*` | causal stroke=accent、selected ring=`rgba(176,90,52,0.3)` | ring=`rgba(0,0,0,0.2)` |
| `--status-*`（DAG） | 設計已定義，直接採用 | 設計已定義（fill polarity + 線重載義） |

**命名決策：** repo 消費端使用縮寫名（`--entity-char-*` 等，15 個檔案）；本次**保留縮寫名、只換值**（改 1 個檔案 vs 改 15 個），並在 `DESIGN_TOKENS.md` 記錄與設計 contract 全名（`--entity-character-*`）的對照。

---

## 3. 子任務拆分（依 CLAUDE.md >3 檔規則逐步進行）

### S1 — Token 基座
- `frontend/src/styles/tokens.css`（重寫）：Warm `:root` + Ink 覆寫塊，含 shape token 層與 §2 推導家族；移除 manuscript/minimal-ink/pulp 區塊
- `frontend/index.html`（修改）：Google Fonts 請求換成設計的六字體組
- `docs/DESIGN_TOKENS.md`（重寫）：兩主題對照表 + shape token 說明 + 縮寫名對照

### S2 — 主題機制
- `frontend/src/contexts/ThemeContext.tsx`（修改）：`Theme = 'warm' | 'ink'`，預設 `warm`；localStorage 遷移：`default`/`manuscript` → `warm`，`minimal-ink`/`pulp` → `ink`
- `frontend/src/pages/SettingsPage.tsx`（修改）：主題卡縮為兩張，swatch 預覽照 kit.css `.ss-theme-card` 規格
- `frontend/src/i18n/locales/zh-TW/settings.json`、`en/settings.json`（修改）：主題名稱與描述字串
- `frontend/src/components/SplashScreen.tsx`（修改）：imagery pool 的 themes 欄位改為新主題名

### S3 — 舊主題殘留清理 + shape token 接線
- `frontend/src/styles/global.css`（修改，39 處 data-theme）：舊主題 selector 移除；黑白系處理改寫為 `[data-theme="ink"]`（照 kit.css 的 ink badge / btn-danger / toggle 模式）；card/btn/pill/badge/control 改讀 shape tokens
- `frontend/src/styles/{symbols,search,build-overview,methodology,settings,tension,narrative}.css`（修改）：同上清理
- `frontend/src/lib/cytoscapeConfig.ts`（修改）：graph 色由 entity token 派生、node border-width 讀 `--line-weight`、`--node-shadow` 恆 none；同步檢視 B-043 是否可關閉

### S4 — 文件同步
- `docs/UI_SPEC.md`（修改）：主題清單、設定頁主題卡、`--status-*` 敘述等段落
- `docs/BACKLOG.md`（視 S3 結果）：B-043 狀態更新

---

## 4. Checkpoint 四問

1. **異動檔案：** 見 §3，共約 16 檔（4 子任務逐步進行），無刪除檔案
2. **現成工具：** 設計 `colors_and_type.css` / `kit.css` 逐字翻譯為 repo token；不新造元件、不引入 CSS 框架
3. **新依賴：** 無新套件。Google Fonts 字體組替換（新增 Spectral / Noto Serif TC / Caveat / Fira Code；移除 4 個舊字體）
4. **回滾：** 每個子任務獨立 commit，`git revert` 即可整段還原；branch 為 `feat/book-upload-revamp`

## 5. 驗證

- `cd frontend && npm run lint` 無新增錯誤
- `npm run dev` 實際切換 Warm / Ink 檢查：Library 卡、閱讀頁、KG、timeline、tension、symbols、settings、splash
- localStorage 舊值遷移驗證（四個舊值各測一次）
- API 無異動 → `API_CONTRACT.md` 不需更新；無 endpoint / Pydantic 變更 → 不需 `gen:types`
