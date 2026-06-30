# Genette 時序分析前端顯示設計計劃

## 背景

後端已有 Genette 時序分析功能（`POST /narrative/temporal`），產出：
- **全書層次**：`story_time_structure`（linear / partially_linear / non_linear / unknown）
- **事件層次**：每個事件的 `displacement_type`（analepsis / prolepsis / linear）與位移量 `displacement`
- **事件清單**：`analepsis_event_ids`、`prolepsis_event_ids`
- **逐事件明細**：`displacements: TemporalDisplacement[]`（含 `event_id`、`displacement_type`、`displacement`、`story_rank`、`text_rank`）

目前前端：
- Timeline 工具列已有觸發按鈕與結果 banner（fa73c48、8d266fb、6aea086）
- Matrix view 有倒敘/預敘象限標籤，但純幾何推斷，非 LLM 確認資料
- 無任何介面消費 Genette 的 displacement 欄位

**核心價值**：Genette 分析能找出外表像 `present` 但時序上實為倒敘的事件（`narrativeMode` ≠ `displacement_type`），是 KG 萃取階段看不到的新資訊。

---

## 資料流限制

目前後端無 `GET /narrative/temporal?book_id=...` 直讀 endpoint，
Genette 結果只能透過：
1. 任務完成後的 `genettTask.result`（in-memory，頁面重整後消失）
2. 未來新增 GET endpoint（Phase 2 後再做）

本計劃 Phase 1 使用方案 1，Phase 2 才加持久化讀取。

### 型別取用：對型別生成紀律的暫時偏離（重要）

CLAUDE.md 規定 API response type 一律從 `frontend/src/api/generated.ts` 取用。
但 **`TemporalAnalysis` 目前並不存在於 `generated.ts`**——後端只有 `POST` 回傳通用 `TaskStatus`、沒有任何 endpoint 以 `TemporalAnalysis` 為 `response_model`，因此 OpenAPI 不含該 schema（generated.ts 僅有 `TemporalAnalysisRequest`）。

結論：
- Phase 1 必須從 `genettTask.result`（型別為 `{ [key: string]: unknown }`）手動轉型，這是**刻意、暫時的偏離**，與既有 `GenettBanner`（[TimelinePage.tsx:335-347](../../frontend/src/pages/TimelinePage.tsx#L335-L347)）作法一致。
- 為避免 `as` 散落各處，**集中宣告一個 local interface `TemporalResultShape`** 描述 result 形狀，所有轉型只在 Step 1 做一次。
- Phase 2 新增 GET endpoint 後，`TemporalAnalysis` 會自動進入 generated.ts，屆時改為 `components['schemas']['TemporalAnalysis']`，移除 local interface。

```typescript
// 僅 Phase 1 暫用；Phase 2 以 generated.ts 的 TemporalAnalysis 取代
interface TemporalResultShape {
  coverage_sufficient?: boolean;
  coverage?: number;
  story_time_structure?: string;
  analepsis_event_ids?: string[];
  prolepsis_event_ids?: string[];
  displacements?: { event_id: string; displacement_type: string; displacement: number }[];
}
```

> 實作時請先確認 `analepsis_event_ids` / `displacements[].event_id` 的 ID 與 timeline 的 `event.id` 屬同一空間（兩者皆源自 KG event，預期一致；以一個事件比對驗證即可）。

---

## 三個呈現面

### 面① 工具列：全書結構 chip

**位置**：Timeline 工具列，Genette 按鈕右側
**觸發**：有可用的 Genette 結果（`genettData != null`，見 Step 1 的持久化 state）且 `coverage_sufficient === true`
**內容**：

```
[⌥ Genette 分析 ✓]  [非線性 · 倒敘 3 · 預敘 1]
```

chip 樣式：細框 badge，沿用既有 `.tl-quality-chip` 的視覺語彙（細框、`--bg-secondary` 底），顏色依 `story_time_structure`：
- `linear` → 綠色（`--color-success`）
- `partially_linear` → 琥珀（`--color-warning`）
- `non_linear` → 藍紫（`--accent` 系）

文案一律走 `t('timeline.genett.chip.*', { defaultValue })`，**不得硬編碼中文字串**（與既有 banner 一致）。

覆蓋率不足時不顯示 chip（只有 banner 提示原因）。

---

### 面② Matrix View：位移著色 toggle

**位置**：Matrix 視圖右上角，現有 quadrant label 同層（HTML overlay，與 `.tl-quadrant-label` 同樣絕對定位）
**觸發**：有 Genette 資料時才出現 toggle
**狀態**：`colorByGenett` 為 **MatrixCanvas 內部 local state**（唯一消費者就是 MatrixCanvas，不上提到 TimelinePage，避免過度配線）

**toggle 開啟時行為**：

| displacement_type | 點顏色 | 說明 |
|---|---|---|
| `analepsis` | `--narrative-flashback-border`（藍） | 與現有 flashback token 一致 |
| `prolepsis` | `--narrative-flashforward-border`（琥珀） | 與現有 flashforward token 一致 |
| `linear` | `var(--fg-muted)` 淡化 | 無時序錯位 |
| 無 Genette 分類 | 維持原 narrativeMode 著色 | 資料不足的事件 |

著色來源：用 `displacements` 建一個 `Map<event_id, displacement_type>`，可同時取得 `linear` 與位移量（供 tooltip 顯示）。

**toggle 關閉**：維持原本 narrativeMode 著色（預設）

**幾何象限標籤的取捨（先前未處理，本次補上）**：
現有 `prolepsisZone` / `analepsisZone` 兩個象限標籤是**純幾何推斷**，與 LLM 著色會互相矛盾（例如被 LLM 判為 `linear` 的灰點落在「倒敘區」標籤內）。因此：
- **toggle 開啟時**：隱藏 `prolepsisZone` / `analepsisZone` 兩個幾何象限標籤（保留 `unrankedZone`），並把 45° 線說明文字改為「零位移基準線」。LLM 著色取代幾何推斷，成為權威來源。
- **toggle 關閉時**：維持現狀（顯示幾何象限標籤、45° 線為「完全按故事順序敘事」）。

legend 同步：toggle 開啟時，SVG legend 切換為 analepsis / prolepsis / linear 三類色碼說明；關閉時維持原 narrative mode 四類。

---

### 面③ 敘事視圖：事件卡片色帶

**位置**：TimelineCanvas 的 EventCard 右側邊框
**觸發**：事件 ID 命中 `analepsisIds` 或 `prolepsisIds`

```
現有左側線 .tl-card::before（narrativeMode 色）  ← 維持不動
新增右側色帶 .tl-card::after（displacement 色）   ← 疊加在右側
```

| 分類 | 色帶顏色 |
|---|---|
| analepsis | `--narrative-flashback-border`（藍） |
| prolepsis | `--narrative-flashforward-border`（琥珀） |

實作沿用既有 CSS custom property 注入手法（卡片已用 `--card-narrative`，此處加 `--card-displacement`），不與 narrativeMode 色衝突（narrativeMode 在左、displacement 在右）。

---

## 開發前 Checkpoint（CLAUDE.md 要求）

1. **API endpoint**：Phase 1 不新增 / 不修改任何 endpoint → **不需更新 `docs/API_CONTRACT.md`**。
2. **UI 元件**：新增 `GenettStructureChip`（chip）、Matrix Genette 著色 toggle、EventCard 右側色帶 → **需更新 `docs/UI_SPEC.md` 第 3.7 節**（在 3.7.1 工具列補 chip、3.7.4 EventCard 補右側色帶、3.7.7 矩陣視圖補 Genette 著色 toggle 與象限標籤取捨）。
3. **會被修改的檔案**：見下方清單，範疇限定於 Timeline 頁面與其樣式、i18n、UI_SPEC，不外溢。
4. **Design token**：全部沿用既有 token，**無新增 / 修改 token** → 不需更新 `docs/DESIGN_TOKENS.md`。

---

## 實作計劃

### Phase 1（本次實作）

#### Step 1：資料下傳架構（含 banner 解耦——先前致命缺陷）

**問題**：若 `genettData` 直接從 `genettTask` 派生，而 banner 的關閉按鈕做 `setGenettTaskId(null)`（[TimelinePage.tsx:383](../../frontend/src/pages/TimelinePage.tsx#L383)），則使用者一關閉結果 banner，chip / Matrix 著色 / 卡片色帶會被一起連坐清除。banner 本就被設計成可關閉，這是 UX 破綻。

**修正**：把「結果資料」與「banner 顯示」兩個狀態解耦。

```typescript
// 持久化的 Genette 結果（不隨 banner 關閉而消失）
const [genettResult, setGenettResult] = useState<TemporalResultShape | null>(null);
// banner 是否已被使用者關閉（只控制 banner 顯隱）
const [genettBannerDismissed, setGenettBannerDismissed] = useState(false);

// 任務完成時，一次性把 result 寫入持久化 state
useEffect(() => {
  if (genettTask?.status === 'done' && genettTask.result) {
    setGenettResult(genettTask.result as TemporalResultShape);
    setGenettBannerDismissed(false); // 新結果重新顯示 banner
  }
}, [genettTask?.status, genettTask?.result]);

// 三個面只依賴 genettResult，不依賴 genettTask
const genettData = useMemo(() => {
  if (!genettResult?.coverage_sufficient) return null;
  const dispMap = new Map<string, string>(
    (genettResult.displacements ?? []).map((d) => [d.event_id, d.displacement_type]),
  );
  return {
    structure: genettResult.story_time_structure ?? 'unknown',
    analepsisIds: new Set(genettResult.analepsis_event_ids ?? []),
    prolepsisIds: new Set(genettResult.prolepsis_event_ids ?? []),
    analepsisCount: genettResult.analepsis_event_ids?.length ?? 0,
    prolepsisCount: genettResult.prolepsis_event_ids?.length ?? 0,
    displacementByEvent: dispMap,
  };
}, [genettResult]);
```

- banner 的 `onDismiss` 改為 `() => setGenettBannerDismissed(true)`（**不再清空資料**）。
- banner 顯示條件加上 `&& !genettBannerDismissed`。
- `genettData` 往下傳給 Toolbar、TimelineCanvas、MatrixCanvas。

#### Step 2：面① 工具列 chip

修改 `Toolbar` component（定義於 TimelinePage.tsx 內）：
- 新增 `genettData` prop
- `genettData` 有值時，在 Genette 按鈕右側渲染 `GenettStructureChip`
- 文案走 `t()` + `defaultValue`
- 修改檔案：`TimelinePage.tsx`、`timeline.css`、`i18n .../analysis.json`

#### Step 3：面② Matrix 著色 toggle

修改 `MatrixCanvas` component：
- 新增 prop：`genettData`
- 內部新增 local state `colorByGenett`
- toggle UI：HTML overlay 文字按鈕「Genette 著色」，有 `genettData` 才顯示
- dot 著色邏輯：`colorByGenett` 開啟時依 `displacementByEvent`（analepsis/prolepsis/linear/無分類 fallback），關閉時維持原邏輯
- 幾何象限標籤：開啟時隱藏 `prolepsisZone` / `analepsisZone`，45° 線說明改「零位移基準線」
- SVG legend：依 `colorByGenett` 切換兩套類別
- 修改檔案：`MatrixCanvas.tsx`、`timeline.css`、`i18n .../analysis.json`

#### Step 4：面③ 事件卡片色帶

修改 `EventCard` component（與 `TimelineCanvas` / `ParallelGroup` 同在 TimelinePage.tsx 內，需把 `analepsisIds` / `prolepsisIds` 從 TimelinePage 一路貫穿下傳）：
- 新增 props：`analepsisIds: Set<string>`、`prolepsisIds: Set<string>`
- 命中時注入 `--card-displacement`，由 `.tl-card::after` 畫右側 2px 色帶
- 修改檔案：`TimelinePage.tsx`、`timeline.css`

#### Step 5：文件同步

- 更新 `docs/UI_SPEC.md` 第 3.7 節（3.7.1 / 3.7.4 / 3.7.7）
- commit message 不需 `[api-contract updated]`（無 API 變動）

---

### Phase 2（之後）

- 後端新增 `GET /narrative/temporal?book_id=...` endpoint，回傳快取的 `TemporalAnalysis`
- 前端改為頁面載入時 fetch，不依賴 task in-memory；`genettResult` 改由 query 初始化
- 型別改用 generated.ts 的 `components['schemas']['TemporalAnalysis']`，移除 Phase 1 的 `TemporalResultShape`
- 讓 Matrix 著色、卡片色帶、chip 跨 refresh 持久

---

## 修改檔案清單

| 檔案 | 變動類型 |
|---|---|
| `frontend/src/pages/TimelinePage.tsx` | genettResult 持久化 state + banner 解耦 + genettData 派生 + props 下傳 |
| `frontend/src/components/timeline/MatrixCanvas.tsx` | 新增 toggle + 著色邏輯 + 象限標籤取捨 + legend 切換 |
| `frontend/src/styles/timeline.css` | chip、toggle、`.tl-card::after` 色帶樣式 |
| `frontend/src/i18n/locales/zh-TW/analysis.json` | 新增 `timeline.genett.*` 與 matrix toggle 文案 key |
| `frontend/src/i18n/locales/en/analysis.json` | 同上（英文） |
| `docs/UI_SPEC.md` | 第 3.7 節補 chip / 卡片色帶 / Matrix 著色 toggle |

不需新增檔案、不需修改 API contract、不需修改 design token（Phase 1 不加後端 endpoint、全用既有 token）。

---

## 給設計實作參考的相關檔案（claude design 入口）

以下是實作三個面時必須對齊的既有結構、class 名稱與設計慣例，請務必比照沿用、保持視覺語彙一致：

### 既有元件與結構
- [frontend/src/pages/TimelinePage.tsx](../../frontend/src/pages/TimelinePage.tsx)
  - `GenettBanner`（L435-491）：banner 既有樣式與 t() 文案慣例，chip 文案請比照
  - `Toolbar`（L528-772）：Genette 按鈕在 L674-705，chip 要插在其右側；`.tl-quality-chip` 的 markup 在 L640-655 可參考
  - `EventCard`（L1240-1325）：左色帶用 `style={{ ['--card-narrative']: ... }}` 注入（L1282），右色帶比照加 `--card-displacement`
  - `TimelineCanvas` / `ParallelGroup`：props 貫穿路徑（L981-1236）
- [frontend/src/components/timeline/MatrixCanvas.tsx](../../frontend/src/components/timeline/MatrixCanvas.tsx)
  - `modeColor()`（L12-22）：取 token 顏色的既有寫法，Genette 著色比照
  - dots 著色（L300-303）、SVG legend（L394-436）、HTML quadrant labels（L472-496）：三處皆需依 `colorByGenett` 調整

### 樣式與 token
- [frontend/src/styles/timeline.css](../../frontend/src/styles/timeline.css)
  - `.tl-card` / `.tl-card::before`（L415-442）：右色帶要新增 `.tl-card::after`
  - `.tl-quality-chip`（L168-181）：chip 視覺語彙來源
  - `.tl-quadrant-label`（L832-847）：Matrix HTML overlay 定位範式，toggle 按鈕比照
  - `.tl-genett-banner*`（L1065-1124）：Genette 既有配色
- [frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css)
  - 著色用 token：`--narrative-flashback-border`（L106）、`--narrative-flashforward-border`（L107）、`--color-success`（L119）、`--color-warning`（L121）、`--fg-muted`（L12）、`--accent`（L18）。**全部已存在，不得新增 token。**

### 資料來源（後端）
- [src/domain/narrative.py](../../src/domain/narrative.py)：`TemporalDisplacement`（L64-74）、`TemporalAnalysis`（L77-112）欄位定義（snake_case）
- [src/api/routers/narrative.py:215](../../src/api/routers/narrative.py#L215)：result = `TemporalAnalysis.model_dump()`
- [frontend/src/api/narrative.ts](../../frontend/src/api/narrative.ts)：既有 trigger / coverage 取用方式

### i18n 既有 key
- [frontend/src/i18n/locales/zh-TW/analysis.json](../../frontend/src/i18n/locales/zh-TW/analysis.json)
  - `timeline.matrix.*`（L507-521）：matrix 文案區，新 toggle 文案加在此
  - 目前無 `timeline.genett.*` key（banner 全靠 defaultValue）；本次正式補上 zh-TW 與 en 兩份

### 規格文件
- [docs/UI_SPEC.md](../../docs/UI_SPEC.md) 第 3.7 節（L507-622）：時間軸頁規格，實作後須回填

---

## Definition of Done

- [ ] 工具列 chip 在分析成功後正確顯示 story_time_structure，顏色依結構別
- [ ] **關閉結果 banner 後，chip / Matrix 著色 / 卡片色帶仍保留**（banner 解耦驗證）
- [ ] Matrix toggle 切換著色模式，analepsis/prolepsis/linear 點顏色正確
- [ ] Matrix toggle 開啟時隱藏幾何象限標籤、45° 線說明改為「零位移基準線」
- [ ] Matrix legend 隨 toggle 切換兩套類別
- [ ] 事件卡片在 narrative 視圖顯示右側色帶（不與左側 narrativeMode 色衝突）
- [ ] 覆蓋率不足時三個面都不顯示（只有 banner 警告）
- [ ] 文案全部走 t() + defaultValue，無硬編碼字串
- [ ] `docs/UI_SPEC.md` 第 3.7 節已同步
- [ ] `cd frontend && npm run lint` 無新增錯誤
- [ ] 手動驗證：觸發分析 → 確認三個面的資料呈現 → 關閉 banner 確認資料不消失
