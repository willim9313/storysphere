# DS v3 第 5 批：補充包（研究者導覽・敘事結構・批次面板・語氣色／類別色・兩份補稿）—— 實作計畫

> 規劃日期：2026-10-04 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 `cc41d08`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_5.zip`（`design_handoff_05_supplement/`，只留本機，不進 repo）。收尾批。
權威順序同前幾批：**決議紀錄 `.dc.html` > 提案／補稿 `.dc.html` > README**；另有 `FINAL_RULINGS.md`（優先於第 0–4 批 README 所有待裁決項）。
`specs/family3/spec-function.md` 的 `/narrative` 一節，第 6 節「不可丟失」為硬約束——但「`依 EEP 重新分類` 必須標不可逆」
已被 16 決議紀錄 B 區推翻（危害一因 B-096 作廢），以決議紀錄為準。
`ss-kit.css`、`colors_and_type.css`、`styles.css` 與第 4 批**位元組相同**；語氣色、類別色 token 由我方寫進 `tokens.css`（DS 回寫清單 #5 由設計端處理）。

本批內容：19 研究者導覽（2026-09-25 已定案，補登）、16 敘事結構（v2 定案）、09·10 批次面板收合（整份採用，覆蓋第 3 批數條）、
語氣色／類別色納入 DS、11 已生成詮釋＋並看補稿、12 時間軸矩陣密度版補稿。

## API 完備性檢查

| 稿 | 現況 | 結論 |
|---|---|---|
| 16 | `chapter_range` 是離散 `list[int]`，未排序未去重；前端四處只取首尾畫成連續區間；後端推代表事件也取 min／max | 前端 sort＋dedupe 後分段畫；後端代表事件改只取實際章節（Q1） |
| 16 | 理論定義來自前端 `frameworksData.ts` 副本，`StageDetail.tsx:173-185` 包在 `<details>`，`methodLink` 在裡面 | 前端拿掉 `<details>` |
| 16 | `PATCH /narrative/{id}/review` 只收 approved／rejected，沒有回「未審閱」 | 開放 pending（Q1、Q5） |
| 16 | `POST /narrative/hero-journey`、`/narrative/refine` 沒有 `require_llm_provider()` | 補 503（Q1） |
| 16 | summarization 只標 `hero_journey:` 過期，`GET /narrative` 只看 `narrative_structure:` | 重跑摘要後本頁要顯示過期（Q1） |
| 16 | 摘要缺章硬閘門只在空態按鈕；重新分析／過期帶不經閘門 | 前端補到重新分析路徑 |
| 16 | 409 body 只有 `{detail}`；`force` 參數無作用；`GET /narrative/kernel-spine` 有自動分類副作用 | 稿：409 照現況、不設 force 鈕；三張既有票，版面不動 |
| 16 | 頁面完全沒接 `failureKind`／`PageFailure`／`LlmUnconfiguredNotice`；`heroJourneyOp.llmBlocked` 算了沒用 | 前端補錯誤四分 |
| 16 | 代表事件連結用過濾後索引回取 id（`StageDetail.tsx:146`），解析失敗時錯位；「止於第 N 章」在範圍內缺 kernel 時也出現 | 改到區域裡的既有 bug，子任務內修 |
| 11 | `PATCH /symbols/{id}/interpretation` 收 review_status（不含 pending）、theme、polarity，**不收 evidence_summary** | 後端加 `evidence_summary`（Q2） |
| 11 | 後端狀態三值任意互轉，無狀態機 | 稿的假設成立：三鈕各態都在，disable 同值那顆 |
| 11 | 「已駁回不列入跨頁引用」——全專案沒有任何其他頁／服務讀詮釋，也沒有過濾 | **不屬實** → 依稿 E 區註，`rejectedNote` 刪去前句 |
| 11 | 信心「區間」是 07 方法論三層級的固定範圍（`frameworks.json tier.*`），不是 API 區間；provenance 只有 `assembled_by`＋`assembled_at` | 前端由分數對到層級；provenance 顯示 API 實值（稿上 `symbol_interpreter_v2` 是示範資料） |
| 11 | 重新生成整筆覆寫、回 pending，有 503；確認框現為 `window.confirm` | 改 `ConfirmDialog` 損失清單版 |
| 11 | interpretation 與 block 可並存，詳情目前不顯示 block | 前端加 warning 列 |
| 11 | 釘選並看已實作（`pin` query、`ChapterDistChart` 下排、`symbol.pin.*` 字串） | 對齊稿的展開態 |
| 09·10 | 失敗項帶 `entity_id`／`event_id`；taskId 只在 React state；失敗無持久化標記；失敗項仍在未分析 | 「本次」只在本次瀏覽（Q3）；「只看失敗」前端篩選 |
| 09·10 | 角色頁沒用 `BatchEepPanel`；`character.batch.*` 缺面板 key | 角色頁改用共用面板，補 key |
| 色 | 語氣色、派系色都是 `character-analysis.css` 的 page-local oklch；派系 dim-on-select（0.3）**已實作** | 收進 `tokens.css`（`--tone-*`、`--cat-*`），cat-1 改磚紅 |
| 19 | 產品沒有 `.ss-guidance`（`GuidanceRibbon` 用 `sg-ribbon*`＋四頁覆寫）；`BookNav` 無右端插槽；設定頁無 guidance 節 | 全前端 |
| 12 | `chronologicalRank` 是 0–1 正規化、null＝未排序；`MatrixCanvas.tsx`（孤兒）是散點不是格子；`--symbol-density-*` 四階但符號熱圖只用兩階 | 全前端，格子新寫、外框可回收 |

## 已裁決（2026-10-04）

- **Q1 16 後端範圍**：5-0 一起修四項——(a) `POST /narrative/hero-journey`、`/narrative/refine` 加 `require_llm_provider()`；
  (b) 重跑章節摘要後 `GET /narrative` 顯示過期；(c) 代表事件只取 `chapter_range` 實際列出的章；
  (d) `PATCH /narrative/{id}/review` 開放 `pending`，回到未審閱時同樣還原 `classification_source`。更新 `API_CONTRACT.md`（含 #21a 409 描述過時、#21j `narrative_weight` 型別）。
- **Q2 11 修訂欄位**：後端 `PATCH /symbols/{id}/interpretation` 加選用 `evidence_summary`；修訂框可改主題＋證據摘要（＋極性）。
- **Q3 09·10 第 3 態**：只在本次瀏覽。重新整理後失敗項仍在未分析清單，面板回第 1 態；不動後端、不存 taskId。
- **Q4 19 重開鈕範圍**：所有有導覽條的書籍頁（10 個 surface，含稿上漏列的時間軸、知識圖譜）。非書籍路由目前沒有導覽條，不做，記回饋。
- **Q5 16 撤銷入口**：再按一次亮著的「核可」／「標記不適用」＝回到未審閱（`aria-pressed` 切換鈕），不加新鈕；Tooltip 說明為新草稿字串。
- **Q6 12 選格事件列圓點色**：用前端由偏離量推導的敘事模式（`datum.mode`，與事件詳情面板一致），不用後端 `narrative_mode`（種子書 100% present）。

## 工程決定（記入 `DS_V3_DESIGN_FEEDBACK.md` 第 5 批）

**共用**
- `--tone-{warm,inquire,steady,cold,ironic,agitated,unmapped}`、`--cat-{1..5}`、`--cat-other`、`--cat-none` 進 `tokens.css`，兩主題共用（同 entity 家族先例），
  另給 `-fg`（深槽紙色字、淺槽墨色字）。`character-analysis.css` 的 `--ca-tone-*`／`--ca-cat-*` 改指向新 token，不留兩份值。
  命名照稿（`inquire`／`ironic`），不沿用頁內舊名。
- `.ss-guidance`／`.ss-guidance-bleed` 照設計 `ss-kit.css` 加進產品 kit；`GuidanceRibbon` 改用它（graph 的 `float` 用 bleed），四頁 `sg-ribbon` 覆寫一併移除。
- 導覽條關閉狀態集中到一個 context（讀寫 `storysphere:guidance-dismissed:*`）：`GuidanceRibbon` 註冊當下顯示的 surface，
  `BookNav` 右端在「當下顯示的 surface 已關閉」時出現 ghost「研究者導覽」鈕。既有「研究者導覽：」都是各頁 prefix（帶冒號），鈕的標籤改用已裁決的 `settings:guidance.title`「研究者導覽」，不另造 key。
- 確認框一律 `ConfirmDialog`（第 4 批的 `costHint`／`sections`）。

**16 敘事結構**
- 409 文案照現況（標待修，歸 i18n 線）；不加 force 鈕；`kernel-spine` 自動分類、`hasHeroJourney` gate 不動。
- 「依 EEP 重新分類」：無字符、無危險色、有確認框（`sections` 用新字串 `classifyAffects`，`costHint` 用 `classifyCost`）。
- 過期帶 `{step}` 用 `timelineModel.staleStepKey` 對照既有步驟名，不插原始 id。
- 交叉證據倒敘／預敘筆數由 timeline `temporalDisplacement.type` 計數。

**11 已生成詮釋**
- i18n 照既有 `analysis:symbol.*` 命名空間放新 key（稿上的 `symbols.interp.*` 是示意名），區塊標題用既有 `symbol.interpretation.tag`「LLM 詮釋」。
- `rejectedNote` 只留後句「內容保留供對照；要換一份，按「重新生成」。」。

**09·10 批次面板**
- 角色頁 toast 不再因失敗常駐（決議 C 區：toast 只當完成通知）；事件頁同。
- 收合覆寫存 localStorage `storysphere:batch-panel:<bookId>:<page>`；回到第 4 態時清除。

**12 矩陣密度版**
- 新 key 與既有 `timeline.matrix.legendTitle`（「章節 × 故事時序」）撞名 → 稿上的「每格事件數」改用新 key 名，不覆寫既有。
- 色階四階 1／2／3／4+ 對 `--symbol-density-low/mid/high/peak`（新 step 函式，不改符號熱圖的兩階規則）。
- `MatrixCanvas.tsx` 外框（章欄、軸標、未排序帶）回收；散點、beeswarm 不用。對照模式切換不寫 URL（同對照開關）。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`。5-0 合入後分三波，每波兩個（避開 429）：
第一波 5-1、5-3；第二波 5-2、5-4（5-1 改過四頁導覽條覆寫後才動角色／事件／符號頁）；第三波 5-5。

| # | 分支 | 內容 |
|---|---|---|
| 5-0 | `feat/ds-v3-36-batch5-shared` | 後端 Q1 四項＋Q2＋測試＋`API_CONTRACT.md`＋`gen:types`；`tokens.css` 語氣色／類別色＋`DESIGN_TOKENS.md`＋角色頁改指向；本計畫、plans 索引、feedback 第 5 批骨架 |
| 5-1 | `feat/ds-v3-37-guidance` | 19：`.ss-guidance` 進 kit、`GuidanceRibbon` 改版、dismiss context、`BookNav` 重開鈕、設定頁「研究者導覽」nav＋面板、四條 `settings.guidance.*` |
| 5-2 | `feat/ds-v3-38-batch-panel` | 09·10：四態＋收合、只看失敗、角色頁面板搬左欄最上、landing 標頭只留 toggle、五條字串、toast 只當完成通知 |
| 5-3 | `feat/ds-v3-39-narrative` | 16：B 檢視、四版面分段切換、四項翻新、理論常開、信心但書、三值審核（再按撤銷）、代表事件三理由、交叉證據、未分類區塊兩確認框、409、空態／硬閘門／分析中、過期、錯誤四分 |
| 5-4 | `feat/ds-v3-40-symbol-interp` | 11 補稿：已生成詮釋四態、修訂框（主題＋證據＋極性）、重新生成確認框、詮釋與阻擋並存、並看展開態、九組字串 |
| 5-5 | `feat/ds-v3-41-timeline-matrix` | 12 補稿：對照模式分段切換、密度矩陣、點格篩選＋事件列、七條字串 |

## 驗證

- 每個子任務：五道閘門＋vitest 全綠。
- 畫面：對應決議紀錄／補稿逐區並排截圖（Warm／Ink）。
- 失敗態：`playwright-cli route` 模擬 JSON 500、無 body 502、JSON 503。
- 5-0 後端：未設定 provider 時兩端點回 503；review pending 還原 source；重跑摘要後 `is_stale`；代表事件不含範圍內未列出的章；PATCH 收 evidence_summary。

## 不做

- DS 回寫清單 7 項（設計端處理）。
- ENG-001（同第 3 批，已另案）、ENG-002 跨書搜尋失敗計數、ENG-003 型別升級回饋。
- 16 的三張既有票（hasHeroJourney gate、kernel-spine GET 副作用、409 文案）。
- 非書籍路由的導覽重開鈕（目前無導覽條）。
- 弧線色帶改類別色（候選，延後）。
