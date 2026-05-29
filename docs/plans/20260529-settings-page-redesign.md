# Settings Page 重設計規格

**日期**：2026-05-29
**狀態**：設計完成，待實作
**設計決策來源**：設計討論（wireframe 迭代 × 4 輪）

---

## 1. 目標與動機

### 1.1 痛點

1. **視覺缺乏層次**：標題與 section 僅靠間距區隔，無視覺重量差異；ThemePicker 的色票 swatch 太小，難以判斷主題外觀
2. **KG 設定對一般使用者不友善**：進階開發者設定與主題選擇並排在同一層級，造成干擾
3. **可擴充性差**：現有 flat 單欄滾動，未來新增設定項（語言、LLM、通知⋯）會越堆越長
4. **語言切換入口不易被發現**：Globe 按鈕隱藏於 Sidebar 底部，無文字說明，不符合設定頁的資訊架構

### 1.2 不做的事

- API 異動限縮在以下兩處，其餘 schema 不動：
  - `KgStatusResponse` 加入 `deploy_mode` 欄位
  - 新增唯讀 `GET /api/v1/settings/info` endpoint（供 LLM 設定 panel 與關於 panel 讀取後端設定值）
- 不動現有的 `ThemeContext`、`i18n` 初始化邏輯
- Token Usage 維持獨立頁面（`/token-usage`），不併入 Settings

---

## 2. 版面架構（方向 B：左 nav + 內容區）

```
┌─────────────────────────────────────────────────────────────┐
│ [48px Sidebar]  [172px Left Nav]  [Content Area flex]       │
│                  設定              ← 目前選中的 panel        │
│                  ─────────────                              │
│                  偏好設定                                    │
│                    外觀與主題                                │
│                    語言          ← 從 Sidebar 整合移入       │
│                  系統                                        │
│                    LLM 設定                                  │
│                    環境設定  [開發者]                        │
│                  其他                                        │
│                    快捷鍵    [規劃中]                        │
│                    實驗性功能 [規劃中]                       │
│                    關於 & 版本                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Nav 設計規格

- 寬度：172px，與 `CharacterAnalysisPage` / `EventAnalysisPage` 左側清單風格一致
- 標題：serif 字體（`var(--font-serif)`），與其他分析頁 page title 一致
- Nav item：14px，選中時左側 2px `var(--accent)` 藍色指示條 + `var(--bg-secondary)` 背景
- 分組標籤：10px uppercase，`var(--fg-muted)`
- Badge 類型：
  - `開發者`：`var(--color-warning-bg)` / `var(--color-warning)` — 提示一般使用者無需調整
  - `整合`：`var(--color-success-bg)` / `var(--color-success)` — 首次上線時標示從 Sidebar 移入
  - `規劃中`：`var(--bg-tertiary)` / `var(--fg-muted)` 加 border — 功能尚未實作的佔位
- 版本號固定在 nav 底部（`StorySphere vX.Y.Z`）

### 2.2 Sidebar 變更

- 移除底部 `Globe` 語言切換按鈕（功能整合至 Settings → 語言）
- Settings icon 的 active 狀態維持不變

---

## 3. 各 Panel 設計規格

### 3.1 外觀與主題

**元件改動**：`ThemePicker` 升級

現況：2×2 grid，每個 option 是小卡片，顯示三段色塊 swatch（bg / accent / fg）。

新版：

- 預覽高度從目前約 20px 升級至 **64px**，直接模擬各主題的實際視覺感
  - Warm Analytical：`#faf8f4` 底色 + accent bar + 文字線條
  - Manuscript：`#f8f6f2` + `repeating-linear-gradient` 橫線底紋（模擬手稿紙）
  - Minimal Ink：純白 + 高對比黑色元素
  - Pulp：白底 + 粗邊框 + offset shadow 元素
- 選中狀態：`2px solid var(--accent)` 邊框，右上角出現「目前」badge
- 點擊即時切換（行為同現有，呼叫 `setTheme()`），無需確認

**i18n**：沿用現有 `settings.theme.*` keys，無需新增

---

### 3.2 語言

**新 panel，對應從 Sidebar 移入的 Globe 功能**

內容：

1. **介面語言**（`i18n.changeLanguage()`）
   - pill toggle：繁體中文 / English
   - 說明文字：「影響所有 UI 文字，不影響書籍內容或分析結果」
   - 行為：點擊即時切換，持久化至 `localStorage('lang')`（沿用現有邏輯）

2. **分析輸出語言**（預留，目前 disabled）
   - pill toggle：跟隨介面語言 / 自訂語言（disabled，tooltip「即將推出」）
   - 說明文字：「決定 LLM 分析文字的回覆語言」

**i18n**：新增 `settings.language.*` keys（zh-TW + en 同步）

```json
// 新增 keys
"language": {
  "title": "語言",
  "subtitle": "介面語言與分析輸出語言設定",
  "uiLanguage": "介面語言",
  "uiLanguageHint": "影響所有 UI 文字，不影響書籍內容或分析結果",
  "outputLanguage": "分析輸出語言",
  "outputLanguageHint": "決定 LLM 分析文字的回覆語言",
  "followUi": "跟隨介面語言",
  "custom": "自訂語言",
  "zhTW": "繁體中文",
  "en": "English"
}
```

---

### 3.3 LLM 設定

**新 panel（首版：唯讀狀態列，待完整設計）**

首版顯示目前設定的唯讀狀態，資料來自 `GET /api/v1/settings/info`：

| 欄位 | Response 欄位 | 說明 |
|------|------|------|
| Provider | `primaryLlmProvider` | Anthropic / OpenAI / Gemini / Local |
| 主模型 | 依 provider 決定 | 顯示 model string |
| Temperature | `analysisTemperature` / `chatAgentTemperature` | 顯示兩個值 |
| Local LLM | `localLlmModel` | 有值才顯示 |

> **注意**：LLM 設定修改需改 `.env` 並重啟（見 §4 約束說明）。首版不提供編輯功能，只顯示狀態。完整的 LLM 設定 UI（含 provider 切換、model 選擇、temperature 調整）留待獨立設計票。

---

### 3.4 環境設定（開發者）

這是本次重設計中概念變動最大的 panel。

#### 3.4.1 核心概念

`DEPLOY_MODE` 是唯一主控項，決定所有儲存層的行為：

| | `lightweight`（預設） | `standard` |
|---|---|---|
| Qdrant | embedded local file（`./data/qdrant_local`） | 自建 Qdrant service（`QDRANT_URL`） |
| KG | 強制 NetworkX | 可選 NetworkX 或 Neo4j |
| 前置需求 | 無，開箱即用 | 需自行起 Qdrant service |

> **重要**：Qdrant 在兩種模式下都必然運作。`lightweight` 使用 `QdrantClient(path=...)` 內嵌式儲存，無需外部 service；`standard` 使用 `QdrantClient(url=...)` 連接自建的 Qdrant service。兩者都不是「雲端代管」。

#### 3.4.2 兩種設定的層級差異

**可 runtime 切換（無需重啟）：**
- KG 後端：NetworkX ↔ Neo4j
- 後端已實作 `set_kg_mode_override()` + 完整 `cache_clear()` 鏈

**必須改 `.env` + 重啟才生效：**
- `DEPLOY_MODE`
- `QDRANT_URL`、`QDRANT_API_KEY`
- `NEO4J_URL`、`NEO4J_USER`、`NEO4J_PASSWORD`

#### 3.4.3 UI 設計要求

**A. 部署模式選擇器（radio card 二選一）**

```
○ Lightweight（目前）          ○ Standard
  開箱即用，無需額外服務          需自行啟動外部服務
  Qdrant: embedded local file    Qdrant: 自建 Qdrant service
  KG: NetworkX（固定）           KG: NetworkX 或 Neo4j 可選
```

- 兩張 card，radio 選擇
- 選中狀態：`2px solid var(--color-border-info)` + `var(--color-background-info)` 淡底

**B. Lightweight 選中時：唯讀狀態列**

顯示目前實際狀態（來自 `/api/v1/kg/status`）：

- Qdrant：embedded local file + 本機路徑 + vector 數量
- KG：NetworkX（標注「lightweight 固定」）+ 實體數 / 關係數
- KG 持久化路徑

**B. Lightweight 選中 / Standard 選中的資料來源**

- 目前 `deploy_mode` 來自 `GET /api/v1/kg/status` 的 `deployMode` 欄位（`KgStatusResponse` 新增）
- 選中狀態以此欄位決定，radio card 為唯讀展示，無法從 UI 儲存（見 §4.1）

**C. Standard 選中時：條件式設定欄 + 警示**

警示 banner（`var(--color-background-warning)` 底色）：

> ⚠ 切換至 Standard 需修改 `.env` 並重啟服務，下方設定為預覽。建議先執行遷移再切換。

展開設定區塊：

1. **Qdrant Service**
   - `QDRANT_URL`：text input（`http://localhost:6333`）
   - `QDRANT_API_KEY`：password input（選填）
   - 提示：「需自行啟動 Qdrant service（docker run qdrant/qdrant）」

2. **知識圖譜後端**（Standard 下可選）
   - segmented control：NetworkX / Neo4j
   - 選 Neo4j 時展開：
     - `NEO4J_URL`：text input（`bolt://localhost:7687`）
     - `NEO4J_USER`：text input
     - `NEO4J_PASSWORD`：password input

   > 注意：Neo4j 切換是 **runtime 生效**的例外（呼叫 `POST /api/v1/kg/switch`），不需要重啟。UI 上應區分這個差異（例如 Neo4j segmented control 旁標注「即時生效」，而其他欄位標注「需重啟」）。

**D. Migration**

Migration 區塊在兩種模式下都顯示，但按鈕的 enabled 狀態不同：

| Migration 項目 | 方向 | Lightweight 下 | Standard 下 |
|---|---|---|---|
| Qdrant：local → service | 單向 → | disabled（功能尚未實作） | disabled（功能尚未實作） |
| KG：NetworkX → Neo4j | 單向 → | disabled | enabled（KG 選 Neo4j 時） |
| KG：Neo4j → NetworkX | 單向 ← | disabled | enabled（KG 選 Neo4j 時，備份用） |

Migration 說明文字：
- Qdrant migration 首版全部 disabled，tooltip 顯示「功能尚未實作」
- KG migration 為幂等操作（重複執行不產生重複資料）

Migration 執行中：顯示 `Loader2` spinner + 進度文字（沿用現有 `useMigrationTask` polling 邏輯）

---

### 3.5 關於 & 版本

**新 panel**，整合版本資訊與套件清單

顯示內容：

資料來自 `GET /api/v1/settings/info`。

**版本資訊**
- StorySphere 版本（讀自 env 或 build manifest）
- `appEnv`（development / production）

**前端套件版本**（關鍵套件）
- React
- TypeScript
- TanStack Query
- React Router
- Cytoscape.js
- i18next

**後端套件版本**（關鍵套件）
- Python
- FastAPI
- LangChain / LangGraph
- Qdrant Client
- sentence-transformers（embedding model）
- Neo4j Driver

**資料路徑**（唯讀，方便 debug，來自 `GET /api/v1/settings/info`）
- `qdrantLocalPath`
- `kgPersistencePath`
- `databaseUrl`
- `analysisCacheDbPath`

呈現方式：`var(--bg-secondary)` 底色的 key-value 列表，key 用 `monospace`

---

## 4. 技術約束（實作時必讀）

### 4.1 Settings singleton 行為

`get_settings()` 使用 `@lru_cache(maxsize=1)`，整個 process 生命週期只建一次。`DEPLOY_MODE`、`QDRANT_URL`、Neo4j 連線參數等設定**不支援 runtime reload**。

UI 上所有涉及這些欄位的地方，必須顯示「需修改 .env 並重啟」的說明，不提供「儲存並套用」按鈕。

### 4.2 KG 後端是唯一的 runtime 例外

`POST /api/v1/kg/switch` 呼叫 `set_kg_mode_override()`，會清除所有相關 singleton 的 `lru_cache`，讓新後端即時生效。UI 上 KG segmented control 可以直接切換，切換後顯示連線驗證結果。

### 4.3 lightweight 模式下 KG 強制 NetworkX

`enforce_lightweight_constraints` validator 在 Settings 建構時執行。UI 上當 `deploy_mode = lightweight` 時，KG 選項必須顯示為 disabled + tooltip「Lightweight 模式固定使用 NetworkX」。

---

## 5. 必要保留（hard constraint）

- **Token 制度**：所有顏色一律用 `var(--*)` token，禁止 hardcode 色碼
- **i18n**：所有文案走 `useTranslation('settings')`，不可硬寫中文/英文；新增 key 必須 zh-TW + en 同步
- **現有 KG migration API**：`POST /api/v1/kg/migrate`、`GET /api/v1/kg/migrate/{task_id}` 不動
- **現有 ThemeContext**：`useTheme()` / `setTheme()` 介面不動
- **CSS class 命名**：新建 `frontend/src/styles/settings.css`，使用 `.st-*` prefix

---

## 6. 實作前必讀的參考檔案

### 樣式 / Token
| 檔案 | 用途 |
|------|------|
| `frontend/src/styles/tokens.css` | 所有 CSS variable 定義（顏色、字體、間距） |
| `docs/DESIGN_TOKENS.md` | Token 對照表與語意說明 |

### 現有頁面（風格一致性參考）
| 檔案 | 用途 |
|------|------|
| `frontend/src/pages/CharacterAnalysisPage.tsx` | 左側清單 + 內容區骨架，nav 風格主要參考 |
| `frontend/src/pages/EventAnalysisPage.tsx` | 同上，確認分組標籤與 section title 樣式 |

### 要修改 / 重寫的現有檔案
| 檔案 | 用途 |
|------|------|
| `frontend/src/pages/SettingsPage.tsx` | 目前實作，了解要保留的邏輯（KG switch、migration polling） |
| `frontend/src/components/layout/Sidebar.tsx` | 了解 Globe button 位置與移除方式 |

### 型別 / API / i18n
| 檔案 | 用途 |
|------|------|
| `frontend/src/api/kgSettings.ts` | 現有 KG API 呼叫方式（`fetchKgStatus`、`switchKgMode` 等） |
| `frontend/src/i18n/locales/zh-TW/settings.json` | 現有 i18n keys，確認哪些可沿用 |
| `frontend/src/i18n/locales/en/settings.json` | 英文對照 |

---

## 7. 新增 / 修改檔案清單

| 檔案 | 動作 | 說明 |
|------|------|------|
| `frontend/src/styles/settings.css` | 新建 | `.st-*` prefix，settings page 專用樣式 |
| `frontend/src/pages/SettingsPage.tsx` | 重寫 | 左 nav + panel 架構 |
| `frontend/src/i18n/locales/zh-TW/settings.json` | 更新 | 新增 `language.*` keys |
| `frontend/src/i18n/locales/en/settings.json` | 更新 | 同步 `language.*` keys |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | 移除 Globe 語言切換按鈕 |
| `src/api/schemas/kg_settings.py` | 修改 | `KgStatusResponse` 加入 `deploy_mode` 欄位 |
| `src/api/routers/settings_info.py` | 新建 | `GET /api/v1/settings/info` 唯讀 endpoint |
| `src/api/schemas/settings_info.py` | 新建 | `SettingsInfoResponse` schema |
| `frontend/src/api/generated.ts` | 重新產生 | `npm run gen:types` 後自動更新 |

---

## 8. 與其他頁面的一致性

- **左 nav 骨架**：與 `CharacterAnalysisPage`（260px 清單）精神一致，差別在 settings 的左欄是 nav 而非資料清單
- **Panel 標題**：serif 字體，與 `ea-title` / `ca-title` 對齊
- **Section 分組標籤**：10px uppercase + 分隔線，與 `CharacterAnalysisPage` 的分組方式一致
- **Badge / pill 樣式**：沿用現有 `.pill` 系統

---

## 9. 不在本次範圍（後續 ticket）

- LLM 設定的完整編輯 UI（provider 切換、model 選擇、per-task temperature）
- 快捷鍵設定
- 實驗性功能開關
- `.env` 寫入 API（如果未來要支援從 UI 直接改 .env）
- Qdrant collection 管理（查看 / 刪除個別書籍的 embedding collection）
- Qdrant migration（local → service）：後端尚未實作，首版 disabled
