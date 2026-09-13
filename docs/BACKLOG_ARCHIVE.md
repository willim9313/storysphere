# StorySphere — 已完成 Backlog 歸檔

**用途**: 已完成項目的設計決策記錄，供日後查閱
**建立日期**: 2026-04-01

---

## F-16 角色派系偵測（Faction Detection）✅ 完成（2026-05-28）

> **2026-09-13 補記**: 本項 2026-05-28 `f0603fd` 就已上線並更新 API_CONTRACT #6d，
> 但 BACKLOG 狀態表一直掛著「待開始」，三個半月後盤點才發現。下列「內容 / 開發方法」
> 是**規劃當時**的描述，落地結果以程式碼為準——實作比規劃多做了 `top_member_names`、
> `unaffiliated_names`、`FactionCanvas` 專用渲染器與圖譜頁深連結 `mode` 參數。
**分類**: 分析功能 — Wave 2
**設計文件**: 不需獨立設計文件，邏輯可自文件內說明

**背景**: KG 已有豐富的角色關係邊（盟友、敵對、家族、友誼、成員隸屬），但目前沒有任何功能把這些關係聚合成「群體結構」。讀者無法快速看出故事中有哪幾個自然派系、派系間的對立態勢如何；創作者也無法確認自己設計的陣營是否在 KG 結構上有足夠的分化。F-16 用社群偵測演算法自動識別角色網路中的自然聚落，並計算派系間的合作 / 對立強度。

**所需資料**:
- KG Entity 節點（角色，已有）
- Relation 邊及 `weight` 欄位（ALLY、ENEMY、FAMILY、FRIENDSHIP、MEMBER_OF，已有）
- F-01 推論的 `potential_ally` / `potential_enemy`（已有，可選強化邊）
- F-02 章節快照（已有，可選：支援依章節切換派系視圖）

**開發方法**:
- 純圖演算，無額外 LLM
- 圖構建：從 KGService 取出全書角色間關係，建立 NetworkX 加權無向圖
  - 正向關係（ALLY、FAMILY、FRIENDSHIP、MEMBER_OF）→ 正權重邊（`weight = relation.weight`）
  - 敵對關係（ENEMY）→ 排除在社群偵測圖外（另行記錄作為派系間對立指標）
  - F-01 推論的 `potential_ally` → 低權重正邊（`weight × 0.5`，可選）
- 社群偵測：使用 `networkx.algorithms.community.greedy_modularity_communities()`（NetworkX 已引入，無需新套件）
  - 每個返回社群 = 一個派系候選
  - 凝聚力分數（cohesion score）= 社群內部邊總權重 / 社群節點數
- 孤立角色處理：與任何角色皆無關係邊的節點歸類為「獨立（unaffiliated）」，不強制分配派系
- 派系間關係計算：對每對派系，統計跨派系正向邊（合作度）與 ENEMY 邊（對立度），形成 N×N 矩陣
- 章節快照模式（可選，需 F-02）：依 `valid_from_chapter` / `valid_to_chapter` 篩選關係邊，支援派系演化時序查詢

**內容**:
- `backend/storysphere/domain/faction.py`：`Faction`、`FactionRelation`、`FactionAnalysis` Pydantic models
  ```
  Faction: id, label, member_ids, cohesion_score
  FactionRelation: source_faction_id, target_faction_id, cooperation, rivalry
  FactionAnalysis: factions, relations, unaffiliated_entity_ids, book_id, chapter (Optional)
  ```
- `backend/storysphere/services/faction_service.py`：圖構建、社群偵測、凝聚力與派系間關係計算
- `KGService` 新增 `get_character_relations(book_id, chapter)` 查詢方法（若現有方法不足）
- API 端點：
  - `GET /books/:bookId/analysis/factions` — 返回完整派系分析
  - `GET /books/:bookId/analysis/factions?chapter={N}` — 返回指定章節快照的派系狀態（需 F-02）
- 前端（兩處）：
  - 圖譜頁：cluster mode 的「社群」按鈕目前 `disabled`（V1 已上 placeholder + tooltip 指向 F-16）。F-16 完成後：解除 disabled、把 `frontend/src/services/kgClustering.ts` 的 `byCommunity()` 從 throw 換成 fetch `GET /books/:bookId/analysis/factions`、`SuperNode.label` 改取 `Faction.label`。視覺：handoff 規格的 multi-color dot ring + 派系歸屬顏色、敵對邊以紅色虛線標示。
  - 深度分析頁：新增「派系分析」tab，展示派系清單（成員列表 + 凝聚力分數）+ 派系間關係熱圖（Recharts `ResponsiveContainer` + 自訂格狀 cell）

**前置依賴**: KG 角色關係（已有）→ **前置依賴已全部滿足**；~~F-01~~（✅ 已完成，可選強化邊）；F-02（可選，用於章節快照模式）

**V1 銜接點**（2026-05-17）: KG 頁面 V1 重新設計已預留接點，見 `docs/plans/20260517-kg-page-redesign-v1-impl.md`。

---

## B-065 各功能頁操作說明缺乏統一機制 ✅ 完成（2026-09-13）
**背景**: 9 個功能頁裡只有角色分析、事件分析兩頁有常駐操作說明，而且是兩套各自實作的元件（`CharacterTipRibbon` 用單一 `STORAGE_KEY`，`EventGuideRibbon` 用 overview/detail 兩個 surface key）。閱讀、符號、敘事結構、建構概覽四頁完全沒有；圖譜、時間軸、張力只有 `*OnboardingHero`——那是「資料還沒產生」時的空狀態引導，不是操作說明，有資料後就消失。其餘說明散落成各元件內的 caption / footnote / legendNote，沒有統一位置、樣式或收合行為。

實際踩到的案例（2026-07-30）：時間軸頁「倒敘與預敘」被 `story_time_hint` 覆蓋率擋住，提示叫使用者去事件分析頁補，但該欄位在抽取階段就決定、事件分析不會改變它，事件分析頁也沒有任何地方講這件事。想補一行說明時發現無處可放——臨時塞進左側篩選欄會直接佔掉列表空間。缺的不是那一行字，是「這類說明該放哪」的規範。

**待辦內容**:
- 盤點現有說明載體：`CharacterTipRibbon`、`EventGuideRibbon`、`*OnboardingHero`、`LegendCard`，以及散在元件內的 caption / footnote / legendNote
- 定義說明的層級與各自的固定位置，例如：頁層導覽（這頁能回答什麼問題）／區塊說明（這個圖表怎麼讀）／欄位溯源（這個值哪來的、什麼會改變它）
- 收斂成單一可重用元件（合併現有兩套 ribbon），dismiss key 命名規則統一
- 逐頁盤點「這頁必須講清楚的事」，其中應包含資料溯源類問題（哪個階段產生、跑哪個分析會變、跑哪個不會）
- 同步寫入 `docs/UI_SPEC.md`，讓新頁面有可依循的規範

**注意**: 這是規範先行的任務，不是逐頁補文案。先有放置準則與元件，再談各頁內容，否則會重演「想補說明卻沒地方放」。

**觸發時機**: 下次翻新任一功能頁時一併設計，或使用者對某頁資料來源產生誤解的回報再次出現時。

---

**✅ 已完成（2026-09-13）——規範先行，不是逐頁補文案**

分三批做：

1. **規範**：`UI_SPEC.md` §4.2 定義三層——頁層導覽（這頁能回答什麼）／區塊說明
   （這圖怎麼讀）／欄位溯源（這值哪來的、跑什麼會變、跑什麼不會）。**三層刻意不做成
   一個帶 `level` prop 的元件**：關閉規則與位置都不同，塞進一個名字會比分開更難用
2. **元件**：兩套 ribbon（`CharacterTipRibbon` / `EventGuideRibbon`）收成
   `GuidanceRibbon`，class 前綴改 `sg-`（舊的跟著「第一個剛好需要它的頁面」命名，
   那正是沒人重用的原因），dismiss key 統一 `storysphere:guidance-dismissed:<surface>`
3. **內容**：九個功能頁全數補上頁層說明（原本只有 2 頁有）

**起因那句錯提示比條目記的更嚴重。** 條目說「事件分析不會改變 `story_time_hint`」，
實際查證是：唯一寫入者是抽取階段的 `_parse_events`，後端**沒有寫入端點**、前端
**沒有編輯介面**——「在事件分析頁逐筆補」這個動作**根本不存在**。而那行提示可點，
點下去導到事件分析頁。已改為講清楚三件事並導向建構概覽（`KG_RERUN` 在那裡）。

**兩個只有看畫面才抓得到的錯，都是我自己造的：**

- **初版拿掉圖示、只留 accent 左邊框當標記。** warm 主題下看起來完全成立，但
  **ink 把所有語意色塌成同一個 `#111111`**，3px 近黑邊框貼著 `#1a1a1a` 外框只讀成
  「邊框比較粗」。而 `tokens.css` 本來就寫著「狀態由 icon 字形承載」——我沒讀到那行
  就推了相反的判斷。規範現在明訂：**任何只靠顏色區分狀態的設計都要在 ink 下再看一次**
- **圖譜頁的浮動 ribbon 蓋住了鏡頭工具列**（個別／類型／社群）。我只掃了頁面原始碼
  裡的絕對定位疊層，而那個工具列由子元件畫，grep 不到。**頁面的主控制項絕不該是被
  說明文字蓋住的東西**；已下移至工具列下方

**驗證**：九頁逐頁瀏覽器實測，各 1 個 ribbon、零橫向溢出、關閉後重載不再出現。
build 過不代表渲染得出來（B-113 的教訓）。

**未做**：第 2 層（區塊說明）與第 3 層在其餘頁面的內容。規範與元件已就位，
往後哪一頁需要就照 §4.2 加，不必再設計一次。

---


## B-119 系統提示硬寫工具名，與註冊表會各自漂移 ✅ 完成（2026-09-13）

**背景**: 2026-09-12 量 §3-4 的工具選擇基線時撞到。跑 21 工具對照組（`analysis_agent=None`）
時，模型叫了 `analyze_event`——**那個工具根本沒被提供**。獨立重驗 5/5 全中，
參數還編得像模像樣（`{"event_id": "泰奧多爾背叛婚約"}`）。

**不是幻覺，是提示在指揮。** `chat_agent_base.SYSTEM_PROMPT` 硬寫了 **16/23 個工具名**
當路由規則：

```
For "What happened in event X?" … → get_event_profile …;
for deep causal/impact analysis → analyze_event
```

而 `get_chat_tools()` 在 `analysis_agent is None` 時把 `analyze_character` /
`analyze_event` 拿掉。**提示說有、schema 說沒有，模型聽提示的。**

**這推翻了 `tool_registry.py:96` 寫下的保證**：

> The guard stays because the argument is optional: a caller that has no
> AnalysisAgent still gets a working agent, minus these two.

拿到的不是「少兩個工具的正常 agent」，是一個會發出 `ToolNode` 解不掉的工具呼叫的 agent。

**目前不是活的 bug**: `api/deps.py:284` 永遠傳 `analysis_agent`，正式路徑一直是 23 個
工具，21 那個狀態在跑著的程式裡不會發生。**這是潛伏的**——而潛伏處正是 B-092 / B-104
踩過的同一個坑：工具存在、沒接線、沒人發現。

**處置方向（未定，要先想清楚再動）**:
- 最小改法：把那個條件註冊拿掉，讓 `analysis_agent=None` 直接失敗而不是靜默降級
  ——「可選參數」這個設計本身就是矛盾的來源
- 或讓提示裡的工具清單由 `get_chat_tools()` 產生，而不是手寫兩份
- **不要只改註解了事**：那句保證是錯的，但真正的問題是兩份真相，不是那句話

**量測見** `docs/plans/20260912-chat-tool-selection-baseline.md` 第六節。

**觸發時機**: 下次動 chat 工具清單或 `SYSTEM_PROMPT` 時；或有任何呼叫端真的不帶
`analysis_agent` 時（那時它會從潛伏變成活的）。

---


## B-068 事件抽取把同一場戲切成多個 event ✅ 完成（2026-09-12）
**背景**: 2026-08-02 為張力頁 `scene_group_id` 驗證判準時發現的**根因**。`名字的潮汐` ch3 有三則 TEU 描述的是同一場戲（伊內絲 vs 泰奧多爾，「記憶不能買賣」），但它們來自**三個不同的 `event_id`**——TEU 快取鍵是 `teu:{event_id}`，一 event 一 TEU，所以重複源頭在事件抽取階段，不在 TEU 組裝。

**後果**:
- 張力頁的證據會呈現「3 則證據」，審核者讀成三重佐證，實為一場戲的三次改寫
- TEU 密度圖被灌水（ch3 顯示 3，實為 1 場）
- 下游任何以 event 數量為基礎的統計都偏高

**調查結果（2026-09-10）—— 原本的三條待辦有兩條前提不成立**:

**1. 「同一 chunk 重複產出」不可能發生。** 事件抽取**每章一次 LLM 呼叫、吃整章
全文**（`pipelines/knowledge_graph/pipeline.py:232` → `extraction_service.py:275`）。
chunk 只存在於**實體**抽取那一段，事件這段沒有。那三個 event 是**同一次回應裡的
三個項目**，補 chunk 錨點對這件事沒有幫助——它們的 chunk 會是同一個。

**2. 它們也不是「重複」，是「節拍」。** 《名字的潮汐》ch3 的四個事件：

| # | 標題 | type | 張力 |
|---|---|---|---|
| 1 | 陌生人抵達薩爾瑪雷納 | meeting | potential 0.4 |
| 2 | 伊內絲與泰奧多爾在鹹水井邊相遇 | meeting | explicit 0.7 |
| 3 | 泰奧多爾請求伊內絲協助尋找記憶 | revelation | explicit 0.8 |
| 4 | 伊內絲拒絕泰奧多爾的請求 | conflict | explicit 0.7 |

2/3/4 確實是一場戲，但它們是**相遇 → 請求 → 拒絕**三個節拍，各自 `event_type`
與張力值都不同。**不是同一件事的三次改寫**，所以「去重」是錯的處置——刪掉會毀掉
真實的節拍。原條目說的「審核者讀成三重佐證」仍然成立，但成因不是重複。

抽取提示只說 `Significant EVENTS that occur in the chapter`
（`extraction_service.py:140`），**沒有定義顆粒度、沒有場景概念**。LLM 選了節拍，
這不算它錯。

**3. 這解釋了 B-069 為什麼驗證失敗。** 判準是「引文集合 Jaccard ≥ 0.5」，而三個
節拍本來就引不同的句子，任何門檻都會產出 0 組。判準沒錯，是它在找一個不存在的
東西。

**4. 量測必須排除 Age of Fire。** 那本書 60/101 筆是重跑累積的舊資料（B-107），
與本項成因不同，混在一起會得到錯的結論。其餘三本完全相同標題 **0 筆**。

**改後的處置：場景分組，不是去重**
- 把連續節拍繫在一起，保留每一個 event
- **判準已於 2026-09-11 在標註過的真實資料上試算**，見
  `docs/plans/20260911-scene-grouping-criteria.md`：**參與者重疊確定出局**（同場配對
  可低到 0.00、邊界可高到 0.33，任何門檻都切不開）

**第一層已落地，但那份 plans 的判讀有一處是錯的（2026-09-11 端到端實測後更正）**

`narrative_mode` 未轉換這個判準**不是保守的，它預設合併**——只有敘述層切換才會分段，
所以同一層內換幾次場景都看不見。plans 把 ch3 的案例寫成「召回率 0%」，語氣像是無害的
漏抓；**實際上那是錯併**，正是該份文件自己定義的危險方向。

實測規模（plans 未涵蓋）：

| 書 | 事件 → 段 | 整章塌成一段 |
|---|---|---|
| 名字的潮汐 | 65 → 19 | 5/10 章 |
| Age of Fire | 49 → **5** | **5/5 章**（ch5 把 16 個事件併成一段） |

**處置**：欄位與函式改名為 `narrative_run_index` / `group_narrative_runs`——它量的是
「敘述層未切換的連續事件」，不是場景，原本的命名把窄訊號冠上寬概念。密度圖長條**改回
以 TEU 數繪製**：用段數繪製會讓 Age of Fire 五章變成一模一樣的矮條，圖表失去全部
鑑別力，比原本的高估更誤導。段數只以純文字呈現。

**plans 文件依紀律不回頭修改**，這段更正記在這裡。

**第二層的判準已定（2026-09-12），但設計與 plans 寫的不同**

`docs/plans/20260912-scene-boundary-from-typographic-dividers.md` 提出改用文本裡的
排版分隔符（`✦ ✦ ✦`）。**該份文件推薦「分隔符 ∪ narrative_mode」的聯集，事後擴充
標註證明那是錯的**；plans 依紀律不回頭修改，結論記在這裡：

把標註從 2 章擴到 10 章（13 個真實邊界、52 個相鄰配對）後，改以**邊界位置**而非
段數評分：

| 判準 | P | R | F1 |
|---|---|---|---|
| 純 `narrative_mode`（第一層現況） | 0.71 | **0.38** | 0.50 |
| **純分隔符（字元集修正後）** | 0.73 | 0.85 | **0.79** |
| 聯集 | 0.67 | 0.92 | 0.77 |

**決定：主判準用排版分隔符，`narrative_mode` 降為輔助訊號、不再單獨當場景判準。**

**實作時不要自己寫正規表示式**：`paragraphs.role` 已經有 `separator` 這個值，是
ingestion 階段 `_is_separator_segment()` 標好的（16 筆，比我試算用的 regex 多抓到
`❦` 與 `～` 兩種）。判準直接讀它即可——**但它有偽陽性，見 B-115**。
聯集被否決的理由是它拿 2 個偽陽性換 1 個偽陰性——而 09-11 已議定**偽陽性（把兩場戲
併成一場）比偽陰性嚴重**，方向相反。偽陽性全部來自對話中引述的倒敘（ch8 瑪蒂爾德
講述外婆的故事），mode 把它讀成敘述層切換，實際上是同一場戲。

**方法論上的兩個教訓**：
- **用「段數 vs 真值」評分會系統性高估。** ch8 的分隔符段數剛好對、位置完全錯
  （切在對話中間的戲劇性停頓）。必須評邊界位置。
- **分隔符偵測的字元集要校準。** 漏掉單一字元的 `❦`（尾聲分隔）就少一個邊界，
  補上後 recall 0.77 → 0.85。這是讀原文才看得到的，統計上只是「少一個」。

**退化測試已做（2026-09-12），結果是：沒有備援可退**

ageoffire：46 個事件、**全部 `present`**、0 個分隔符。純分隔符 5 段、純 mode 5 段、
聯集 5 段——**三者完全相同且完全無用**（ch5 把 14 個事件併成一段）。原本設想的
「沒有分隔符就退回第一層」**不成立**，因為 mode 在這種平鋪直敘的書上同樣產出 0 個邊界。

**所以判準是書籍相依的，而且沒有備援。設計必須據此改**：偵測不到分隔符時
**不要產出分組**，而不是產出「每章一段」。「每章一段」不是「整章是一場戲」，是
「不知道」——把不知道畫成一段，正是本條目更正裡記的那個誤導。兩者在資料上長得
一樣，意思相反，消費端必須能分辨。

**測試語料的但書**：ageoffire 的段落切分本身是壞的（整章一段 + 多個 2 字殘渣，
見 B-115），所以它同時混了「真的沒有分隔符」與「段落資料不可用」兩件事。
`narrative_mode` 全 `present` 那一項與段落無關，核心結論不受影響。

**判準已實作（2026-09-12）**: `domain/scene_groups.py` 的 `group_scenes()`，
純計算不落盤，與 `group_narrative_runs` 同形。**沒有分隔線的章節整章不出現在回傳裡**
——不是回傳「一場」。實測《名字的潮汐》62 事件全部分組、逐章完全正確 5/10（錯的
四章正是已知的偽陽性/偽陰性），ageoffire **46 事件 0 個分組、5 章全部省略**。

實作時修正了兩處自己的錯誤：`_normalise` 換成既有的 `squash_spacing()`（B-083 同一
個問題、同一個理由），以及 `_is_separator_segment` **從 pipeline 搬進
`domain/documents.py`** 並更名 `is_separator_segment`——`domain/` 不該 import
`pipelines/`，而「什麼算分隔線」本來就是 domain 規則。pipeline 端以別名保留舊名。

讀取端會**重新套一次** `is_separator_segment()`，不信任存下來的 role，這樣 B-115
之前入庫的壞 separator 不必重跑 ingestion 也不會變成假邊界。

**消費端已接上（2026-09-12，`f799153` + `2573ff4`），本項完成。** TEU 帶上
`scene_index`（無分組訊號時為 null），張力頁 Step 1 卡片顯示場景數；**「判定不出」
呈現為文字而非數字**，不畫成一場——那是本次設計的重點。

**三個「從上游解」的方向都試過了，都比這個讀取端方案差（2026-09-12）。**
見 `docs/plans/20260912-untried-granularity-directions.md`：

| 上游做法 | 結果 | vs 本方案 |
|---|---|---|
| 兩段式抽取（LLM 自己找場景） | 事件層 F1 **0.62**，P 0.53 | 輸給分隔符的 0.79，偽陽性過半 |
| 兩段式抽取（給它完美場景切分） | 顆粒度 ch1 **+131%** | 反效果，且呼叫 ×3 |
| `_parse_events` 後合併 | 抹掉 **60%** 事件 | 不可逆，且做的事更少 |

**所以「不去動抽取、改在讀取端加場景層」不只是當時的權宜，是量過之後的最佳解。**
附帶一個工程上成立的機制值得記著：要 LLM「引一段原文當錨點」非常可靠——10 章 31
個場景，引句 100% 找得回原文位置。找錯的是邊界，不是錨定。

**限制**：一本書、一位標註者、10 章。ch5 與 ch9 的標註可爭議（「傍晚 → 入夜」算不算
時間跳躍）。分隔符是**這本書的排版慣例**，不是通例。

**沒有分隔符的書仍然無解，而且已知 LLM 頂不上。** ageoffire 全書 0 個分隔符，是最
需要場景層的對象；兩段式在有真值的書上 P 只有 0.53，沒有理由相信它在沒真值的書上
更好。要重啟這條路，得先人工標註一本沒有分隔符的書——**在那之前，那類書就是
「不知道」，這是誠實的輸出**。

**不再需要 `scene_id` 欄位**：分組是純計算（`group_scenes()`），不落盤、無 migration，
判準改進即時生效。原本「等 B-106 落地後再決定」的問題，答案是不加。

---


## B-069 張力證據「同場景摺疊」無可用判準 ✅ 完成（2026-09-12）
**背景**: 設計稿要求證據區顯示「6 → 3 則」與逐字對照，需要後端提供 `scene_group_id`。2026-08-02 議定判準為「同章 + 引文集合 Jaccard ≥ 0.5」，**在真實資料上驗證失敗**：`名字的潮汐` 38 個 TEU 在門檻 0.3 / 0.4 / 0.5 / 0.6 / 0.7 全部產出 0 組。

**2026-09-10 補充——失敗原因已查明**: 不是門檻沒調對。B-068 的走查顯示，被期待
摺疊在一起的那幾則 TEU 背後是**同一場戲的不同節拍**（相遇 / 請求 / 拒絕），它們
本來就引不同的句子，所以引文 Jaccard 在任何門檻都會是 0。**判準沒錯，是它在找
一個不存在的東西**。正確的判準方向是相鄰性 + 參與者重疊，而那需要 B-106 的章內
順序。這一項改為等 B-068 的場景分組。

**失敗原因**: LLM 每次都用不同方式轉述同一句對白，集合比對看不出是同一句：

```
「記憶不能買賣，」伊內絲說，「你不能竊取不屬於你的記憶。」
「記憶不能買賣，你這是想竊取不屬於你的記憶。」
「記憶不能買賣。」伊內絲說，她引用了瑪蒂爾德夫人的話。
```

全書只有 5 個引文字串曾出現在兩個 TEU 中，其中 1 個還跨章。改用字元級相似度也不行：description 相似度能連上其中兩則（0.68），第三則只有 0.32 / 0.33，會把 3 摺成 2——**宣稱做了分組卻漏一則，比不摺更糟**；壓低門檻則會掃進其他章的偽陽性。另外同章同角色仍可能是不同張力（ch3 的「外來者 vs 地方傳統」），判準必須有鑑別力。

**已排除**: `event_id` 不能當 scene group（一 event 一 TEU）；`Event` 無 chunk / scene 錨點。

**待辦內容**:
- 若要做，候選是 embedding 相似度（專案已有 Qdrant）——但只有一本書可校準門檻，且 ground truth 目前僅靠人工判讀
- 或等 B-068 從上游解掉，這一項自然消失（較根本）

**2026-09-12——「摺疊」這個目標本身已量化證明是錯的，本項可以關掉。**
`docs/plans/20260912-untried-granularity-directions.md` 方向三直接量了「同場景合併
成一個」的代價：62 個事件塌成 25 個（**−60%**），20 個多節拍場景裡 **16 個
`event_type` 不只一種、14 個 `tension_signal` 不只一種**。ch7 場景 2 一個場景裡有
`romance / conflict / turning_point / death` 四種，合併要丟掉三種，**其中一種是死亡**。

**所以不是「判準找不到」，是不該摺。** 正確的呈現是**分組但全部保留**——B-068 的
`scene_index` 已經上線，張力頁可以顯示「這 4 則屬於同一場戲」而不是把 4 摺成 1。
設計稿要的「6 → 3 則」是基於「它們是重複」的誤解，那個前提 B-068 已經推翻。

**現況**: 張力頁證據區誠實顯示「n 則」，不做摺疊，不提供逐字對照。

**觸發時機**: 不再等判準。若使用者仍要「摺疊」，做的是**按 `scene_index` 分組顯示**，
不是減少則數。

---


## B-072 張力 Step 1 組裝失敗的 TEU 無清單可看 ✅ 完成（2026-09-12）
**背景**: stepper step 1 顯示 `{{assembled}} / {{candidates}} 場景`，兩數不等時 `TensionStepperStrip` 只亮一個 `failed` 旗標與 AlertTriangle warning note（P0-5 的最小落點），**看不到是哪些場景失敗、為何失敗**。設計交付包沒有為失敗清單留位置，也沒出失敗態樣式。

**原記載有誤，一併更正（2026-09-12）**: 「兩數不等時只亮一個 `failed` 旗標與 warning
note」**不成立**。`TensionPage.tsx` 的 `failed` 只綁 `analyzeOp.error`，那是**整個 task
炸掉**才會真。部分失敗的路徑上 `failed` 一直是 `false`——畫面上只有兩個不相等的數字，
**沒有旗標、沒有 warning note、什麼都沒有**。實情比票面更糟一級。

**前置已查明**: 後端**沒有**留任何清單。`_assemble_one` 的 `except` 只
`logger.warning` + `failed += 1`，失敗的 event id 只進 server log，按按鈕的人看不到。

**✅ 已完成（2026-09-12）**:
- **後端**（`tension_service.analyze_book_tensions`）：`failed` 計數器換成 `failures`
  清單，每筆帶 `event_id` / `title` / `chapter` / `reason`。**標題與章號隨清單帶出**，
  因為組裝失敗就沒有 TEU 可供回查——只給 id 等於沒給。依章排序：完成順序是 semaphore
  放行的順序，同一本書跑兩次會換位置。`failed` 保留為 `len(failures)`，舊消費端不壞
- **前端**：part-failure 改亮 warning note（`teuPartial`），strip 下方多一個預設收合的
  `.tn-teu-failures` `<details>`
- **stepper 新增第四個狀態 `partial`**（2026-09-12 使用者裁決，推翻原判斷）。原本只用
  warning note 承擔缺口、dot 維持綠勾，實測畫面是**一邊打勾一邊說「3 則失敗」**。
  現在 dot 改用 `Minus`（三態 checkbox 的 indeterminate 慣例：有一些但不是全部），
  框色轉 warning。`partial` 與 `done` 同時為真、dot 上 `partial` 優先——**不擋下游**，
  因為那一段確實產出了其餘場景，擋住會逼使用者重跑一次完整 LLM pass（B-110 的坑）。
  字符而非顏色承載語意，因為 Ink 主題把 success / warning / error 塌成同一個黑
- **測試**：`TestAnalyzeBookTensionsFailures` 五項，涵蓋兩個出口（有候選 / 無候選）、
  部分失敗、排序。五項均實測過「拿掉修正就會紅」（B-061 慣例）

**瀏覽器實測抓到兩個靜態檢查抓不到的缺陷（2026-09-12，playwright-cli）**：先以
`page.route()` 攔掉 Step 1 的兩個請求渲染面板（沒打到後端、`token_usage` 維持 108 筆
不變），再查 a11y tree 與 computed style：

1. **收合指示消失**。`summary` 設了 `display: flex`，而 summary 預設是 `list-item`
   ——改掉就沒有 marker，**那個三角形是唯一告訴人「這裡可以展開」的東西**。畫面上
   只剩警示圖示加文字，`cursor: pointer` 要滑上去才看得到，那時已經太晚。補了
   `::after` 的 chevron（收合 ▸ / 展開 ▾），純 CSS、不動 TSX
2. **焦點環不是全站規格**。`global.css` 的焦點環選擇器是
   `:where(a, button, input, select, textarea, [tabindex])`，而原生 `summary`
   **可聚焦但沒有 tabindex 屬性**，一條都不match，於是落回瀏覽器預設的藍圈。已在
   本元件用同一組 token 補上（實測 `#b05a34` / 2px / offset 2px）

鍵盤語意本身是好的：`tabIndex` 0、focus 後按 Enter 會展開，`<details>` 的原生行為
沒有被 CSS 破壞——這也是實測才敢講的。
- 文件：`API_CONTRACT.md` #14b 首次記載 result 形狀；`UI_SPEC.md` P0-5 改為已做

**已知限制（寫進 UI_SPEC，不留給人踩）**: 清單只活在那次 task result 裡，**重新整理
即消失**——後端沒有按書留存失敗紀錄。這與 B-110 是同一個形狀。面板內的 hint 據實說明，
不假裝它會留著。要讓它留存需要後端持久化，是獨立的一題。

**順帶修掉 stepper 在 640px 以下的擠壓（2026-09-12，依使用者指示）**: 這是 B-070 漏掉
的範圍，不是本票造成的。五格用 flex 壓縮，640px 以下標題折行、400px 折三行、
「TensionLine 聚合」疊到隔壁。補 `max-width: 640px` 的直向堆疊後，360px 都維持一行。
斷點由實測決定（641px 每格 100px、標題仍一行；640px 起折行），不是猜的。
連帶把 `flex` 從 inline style 改成 `--tn-stage-flex` 自訂屬性——inline 值會壓過
media query，只能靠 `!important` 扳回來。**已回填 B-070 的 ARCHIVE 條目**，
那輪「四個寬度皆無水平捲動」的判準看不到這個缺陷：strip 是壓縮不是溢出，
**不捲動，只是讀不了**。

**未做——同形狀還有三處**: `failed += 1` 然後繼續、不留清單這個形狀在
`analysis_agent.py:380`、`book_event_analysis.py:476`、`book_entity_analysis.py:353`
還有三份（走查時已點名，見 `20260909-post-sweep-development-plan.md` 第五節）。本次
**刻意只收張力這一處**：四處一起改會超過 CLAUDE.md 的三檔上限，且各自的消費端不同。
另開 B-113。

---


## B-100 token 歸屬修好之後沒有任何資料驗證過 ✅ 完成（2026-09-12）

**背景**: 走查 core/ 時查 `var/token_usage.db`：**4206 筆、8.6M tokens，只有 70 筆
帶 `book_id`**。乍看像是歸屬壞掉，但比對時間就不是這個故事：

| | |
|---|---|
| DB 最早 / 最晚一筆 | 2026-03-21 / **2026-08-19 11:49** |
| ingestion / imagery 補上 `set_llm_service_context` | 2026-08-19 |
| epistemic / voice / timeline 補上 | **2026-08-20**（B-081 PR #62） |

也就是說**最後一次修正之後，這個 store 一筆新資料都沒有**。98.3% 未歸屬是歷史，
不是現況；而現況**未經任何實測**。

**架構本身是好的**（走查結論）: `call_llm()` 把 `service` 與 `book_id` 設為**必填
參數、刻意不給預設值**，docstring 寫得很清楚——「忘記傳」因此變成簽章錯誤而不是
靜默的錯誤歸屬。20 個 `service=` 呼叫點分成 5 個 bucket（`analysis` 佔 14 個，
那是 B-081 刻意的併入）。

**待辦**: 下次真的跑一次分析之後查一次
`select service, count(*), sum(book_id is not null) from token_usage where ts > <該次時間> group by service`，
確認新資料帶得上 `book_id`。帶不上才是新的 bug。

**為什麼值得記**: B-081 標示 ✅ 完成、也加了 AST 掃描測試防回歸，但那個測試驗的是
「呼叫點有沒有設 context」，不是「資料庫裡真的有歸屬」。**宣告與現實之間還差一次
實測**——這輪走查一再撞見的正是這個形狀。

**✅ 已完成（2026-09-12）—— 那次實測有了，結論是好的**:

```
service     n   attributed        service    n   attributed
analysis    70  70                summary     6   6
extraction  15  15                imagery     5   5
keyword     10  10                ingestion   2   2
```

**108 筆、未歸屬 0 筆**，跨 6 個 service、2 本書，全部是 2026-09-12 當天跑
B-068 / B-111 那批分析產生的。歸屬是好的，這一項結案。

**一個要記下來的意外**: 全庫現在**只有**這 108 筆——原本那 4206 筆歷史資料
（含 98.3% 未歸屬的那批）已經不在庫裡，`var/token_usage.db` 像是被重建過。
所以「未歸屬比例從 98.3% 降到 0%」這句話**不能這樣講**：不是同一個母體。
能成立的只有「修正之後產生的新資料，歸屬率 100%」——而那正是本條要驗的東西。

**順帶確認**: `analysis` 那 70 筆是 B-081 刻意的併入 bucket，所以從 service 名稱
**看不出** timeline / epistemic / voice 三者是否各自帶上了 book_id。要單獨驗那三個，
得跑一次只觸發它們的分析。本次未做，但全庫零未歸屬已排除「某個 service 整批漏掉」
這個結局。

**範圍限制（2026-09-12 補記）**: `set_token_store()` **只在 `api/main.py:239` 被呼叫**，
也就是只有 FastAPI app 程序內才會記錄。App 之外的路徑（離線腳本、一次性實驗）
`_token_store is None`，`_schedule_store()` 直接 return，用量**完全不留痕跡**。
做 B-116 的實測時撞到：5 次 extraction 呼叫一筆都沒進庫。

目前所有生產路徑都在 app 內，所以上面「歸屬率 100%」的結論不受影響——但那句話的
正確說法是「**API 程序內**產生的用量歸屬率 100%」，不是全系統。

**觸發時機**: ~~下次跑分析時順手查~~ —— 已查，結案。

---


## B-109 `Event.location_id` 是第二個零寫者欄位 ✅ 完成（2026-09-12）

**背景**: 2026-09-11 試算 B-068 場景分組判準時發現。`Event.location_id` 全庫填充率
**0/201**——欄位在 `domain/events.py` 裡、抽取提示不問、`_parse_events` 不設。

**✅ 已完成（2026-09-12）：刪掉欄位，地點改認 `participants`。**

**原記載有兩處錯誤，一併更正**：

1. **「目前查不到消費者」不成立。** 有四個：`tools/base.py`、`book_graph.py` 的
   `occurs_at` 邊、`book_timeline.py` 的 `location` 欄位、`book_event_analysis.py`
   的地點解析。全部讀到 null。
2. **但也不是「四個功能都壞了」**（我一度這樣誤判，被使用者的截圖推翻）。地點其實
   **一直都在**——它走 `participants`：抽取提示要的是「entity names involved」
   且**刻意不限型別**，所以地點跟角色、物品一樣落在那裡。圖譜照樣畫邊（標籤是
   `participates_in` 而非 `occurs_at`），事件詳情的參與者清單也看得到地點。

**實測（《名字的潮汐》62 筆事件）**：`participants` 含地點型實體的有 **34 筆（54%）**，
`location_id` 有值的 **0 筆**。唯一的實害是**時間軸的地點篩選永遠不出現**——前端只把
`p.type === 'character'` 計入 facet，而 `location` 欄位恆為 null。

**為什麼是刪掉而不是補生產者**：

- **從 participants 推導不出來。** 兩者語意不同：`participants` 是「誰涉入」、
  `location_id` 是「戲在哪演」。實測 **16% 的事件列出多個地點**——「伊內絲向瑪蒂爾德
  夫人報信」的地點是 `麵包鋪 / 鹹水井 / 教堂`，那是她**跑過**的三個地方，沒有一個是
  場景所在。挑第一個會在這些情況下挑到路過的地點，**比留空更糟**：空欄位誠實，
  錯地點會被當真。
- **補進提示的收益比想像小。** 45% 的事件連一個地點型參與者都沒有，代表相當一部分
  場景在文本裡就沒有明確地點。就算加了欄位，那部分大概還是空的——會付 B-116 量到的
  顆粒度稅，換來一半填充率的欄位，而消費端仍要處理 null。

**改動**：`Event.location_id` 與四個消費端分支、連同隨之成為孤兒的 `EventLocation`
與 `LocationRef` 兩個 schema 一併移除。時間軸的地點 facet 改由 `p.type === 'location'`
的參與者組出——**實測從 0 個選項變成 9 個**（海 27、薩爾瑪雷納 6、鹹水井 2…）。

**語意上的降級要講清楚**：那個 facet 現在的意思是「**涉及**這個地點的事件」而不是
「**發生在**這裡的事件」。較弱但誠實，已寫進 `API_CONTRACT.md` 與程式碼註解。

**順帶**: `filterState.ts` 原本留著一句註解「`location` is empty in real data today;
the section hides itself when so」——有人注意到症狀、沒追到原因，而那個 facet 從存在
的第一天起就是空的。

**與 B-068 的綁定已解除**: 原記「等第二層動工時一併決定」，但第二層最後用排版分隔符
解決，完全沒用到 location。09-11 那份 plan 試過的「地點型參與者」判準也是在
`participants` 上試的，與本欄位無關。

---


## B-113 「`failed += 1` 然後繼續、不留清單」還有三處 ✅ 完成（2026-09-12）

**背景**: 2026-09-12 做 B-072 時確認。B-072 修掉的是張力 TEU 組裝那一處，但同一個
形狀在批次分析路徑上還有三份：

| 位置 | 批次對象 |
|---|---|
| `agents/analysis_agent.py:380` | — |
| `api/routers/book_event_analysis.py:476` | 事件批次分析 |
| `api/routers/book_entity_analysis.py:353` | 角色批次分析 |

三處都是 `except` → `logger.warning` → `failed += 1` → 繼續，**失敗的 id 只進 server
log**。走查時已點名（`20260909-post-sweep-development-plan.md` 第五節「失敗要留清單，
不只留計數」），B-096 查成因時也撞到過同一個形狀。

**為什麼不在 B-072 一起收**: 四處一起改會超過 CLAUDE.md 的三檔上限，且三者的消費端
與 B-072 不同（事件頁 / 角色頁各有自己的批次 UI），失敗清單要落在哪裡是各自的設計題，
不是把同一段程式碼複製三次。

**可直接沿用 B-072 的部分**: 後端形狀（`failures` 清單帶 id / 標題 / 章 / 例外字串、
依章排序、`failed` 保留為 `len(failures)` 以免打壞既有消費端）與前端形狀
（`.tn-teu-failures` 那個收合面板）。

**已知限制會一起繼承**: 清單只活在 task result 裡、重新整理即消失。要留存需要後端
按書持久化失敗紀錄，那是這三處與 B-072 共同的第二階段。

**✅ 後端已完成（2026-09-12）**: 三處都改為收集 `failures` 清單，`failed` 保留為
其長度，既有消費端不壞。識別欄位依各自有什麼而定：

| 位置 | 清單欄位 | 排序 |
|---|---|---|
| 事件批次 | `event_id` / `title` / `chapter` / `reason` | (chapter, title) |
| 角色批次 | `entity_id` / `name` / `reason` | name |
| 象徵批次 | `imagery_id` / `reason` | 產生順序 |

**象徵那一份只有 id 沒有名稱**——那個迴圈拿到的就只有 id，不像另外兩處手上有物件。
象徵的 **rate limit 提前 return 也帶著清單**，那正是最需要知道「哪些已經跑掉」的時候。

**刻意不抽共用 helper**：三處的識別欄位各不相同，抽出來要傳一堆參數，讀起來反而比
各自 inline 的五行 dict 難懂。與 B-072 的張力版同形。

測試 8 項，其中 7 項實測過拿掉修正會紅（剩下那項是「部分失敗不中止批次」的行為守衛，
本來兩邊都該綠）。`docs/API_CONTRACT.md` 的 `BatchEepResult`（#7g/#7h）與 #15j 已更新。

**✅ 前端已接（2026-09-12）**: 三頁共用 `BatchFailureList`——它們本來就共用
`useBatchTask`，所以清單是一個元件而不是抄三份。形狀刻意與張力 Step 1 的
`.tn-teu-failures` 相同：兩份清單意思一樣，不該要人學兩次。

放置位置各頁不同，因為各頁能提供的落點不同：

| 頁 | 落點 | 理由 |
|---|---|---|
| 事件 | `BatchEepPanel` 的 summary 區塊 | 常駐，就在它解釋的 failed 計數旁邊 |
| 角色 | 完成 toast 內 | 該頁**沒有**常駐批次面板，只有 toast |
| 象徵 | `SymbolsDashboard` 的 batch panel | 同事件頁，常駐 |

**刻意不放事件頁的 toast**：toast 可關閉且**5 秒自動隱藏**，清單放進去會讓「是哪幾個」
這個唯一的答案跟著消失。角色頁沒有別的落點（`CharacterOverviewLanding` 只收
`batchError`，不收 summary），只好放 toast——**所以兩頁的 toast 都改成「有失敗清單時
不自動消失」**，全成功時照舊淡出（那時本來就沒東西要讀）。

這個修正是被問出來的：先前只說「toast 會自動隱藏」而沒去查角色頁，結果把清單放進了
一個同樣 5 秒就消失的地方——移出事件頁 toast 的理由與放進角色頁 toast 的做法互相
矛盾。**查證兩頁都是 5000ms 之後才發現。**

**象徵那份只有 id**：元件顯示 `title ?? name ?? imagery_id`，回退到 id 比塞一個
假的名稱誠實——那個迴圈本來就只拿得到 id。

**未在瀏覽器中看過渲染結果**: 要讓面板出現得先讓批次跑完，而三頁的批次都是真實 LLM
呼叫（事件頁 62 筆）。用 route 攔截驅動失敗——按鈕先開確認對話框，模擬點擊沒能走完
那條路徑。已驗證的是：五道閘門、i18n 八個 key 在兩語系都解析、CSS 選擇器與 markup
逐一對得上、以及**同一份 markup 形狀在 B-072 已經實測過**。剩餘風險是版面而非功能。

---


## B-114 全站焦點環漏掉 `<summary>` ✅ 完成（2026-09-12）

**背景**: 2026-09-12 做 B-072 的瀏覽器實測時發現。`global.css:95` 的焦點環是

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible { … }
```

原生 `<summary>` **可聚焦，但沒有 `tabindex` 屬性**（`tabIndex` 屬性值是 0，屬性卻不
存在），所以 `[tabindex]` 選不到它，六個選擇器一條都不match。結果是落回瀏覽器預設的
藍色外框——而 `tokens.css:38` 明寫這個焦點環是「全站單一規格」。

**影響範圍**: 三個元件用 `<details>` / `<summary>`：

| 檔案 | 現況 |
|---|---|
| `components/graph/InferredEdgePanel.tsx` | 藍圈 |
| `components/narrative/StageDetail.tsx` | 藍圈 |
| `pages/TensionPage.tsx`（B-072 新增） | 已在 `tension.css` local 補上 |

**修法是一個字**: 在 `:where(...)` 清單裡加 `summary`。零 specificity，不會蓋掉任何
元件自帶樣式。改完之後 `tension.css` 裡那條 local 規則就可以刪掉。

**為什麼 B-072 沒順手改**: 動 `global.css` 會改到另外兩個元件的外觀，那是任務範圍外
的改動（CLAUDE.md 紅線）。B-072 只修自己新增的那一個。

**順帶一提**: 這種漏網只有跑瀏覽器查 computed style 才看得到——`lint` 與 `tsc` 都不會
說話，畫面上也只是「藍圈而不是橘圈」，不盯著看不會發現。

**✅ 已完成（2026-09-12）**: `:where()` 清單加入 `summary`。三個 `<details>` 元件
一次涵蓋，`tension.css` 裡那條 local 規則同時刪除。實測注入的裸 `<details>` 與張力頁
的失敗面板，兩者都拿到 `#b05a34` / 2px / offset 2px。

**量測方法的教訓**: 第一次量到「warning 色、3px」以為規則沒生效——那是假象。
**沒有 outline 時 `outlineColor` 回報 `currentColor`、`outlineWidth` 回報 `medium`
（3px）**，而該 summary 的 `color` 正好是 warning。真正的判準是 `outlineStyle`
是否為 `none`。另外程式化 `focus()` 在剛用滑鼠點擊過之後不算 `:focus-visible`，
要用鍵盤或 `focus({focusVisible:true})`。

---



## B-115 只有收尾標點的一行被判成場景分隔線 ✅ 完成（2026-09-12）

**背景**: 2026-09-12 跑 B-068 退化測試時，發現 ageoffire 有 2 字的「段落」。追下去
不是段落切分的問題，是**分隔線偵測的偽陽性**。

`_is_separator_segment()`（`pipelines/document_processing/pipeline.py:33`）的判準是
「非空、≤40 字、**不含任何 `\w` 字元**」。`。」` 與 `？」` 全是標點，`\w` 不匹配，
於是被判成視覺分隔線，並以 `role=separator` 獨立成段。

成因是 PDF 逐行輸出時，引號收尾落在行首，產生只有 `。」` 的一行。

**實測**（全庫 `role='separator'` 共 20 筆）:

| 書 | separator | 正確性 |
|---|---|---|
| 名字的潮汐 | 16 | 全部是真的（`✦ ✦ ✦`、`❦`、`～`） |
| ageoffire | 4 | **全部是偽陽性**（`。」`×3、`？」`×1） |

**後果**: B-068 的場景分組要靠 `role=separator`，偽陽性會直接變成假的場景邊界。
在只有 4 個分隔線而且全錯的書上，等於憑空生出 4 個場景界線。

**修法方向**: 排除「只由句末／收尾標點組成」的片段。**不要**改成看長度——真的分隔線
`～` 只有 1 字，比 `。」` 還短。

**原記載有誤，一併更正**: 本條原記為「段落切分把整章塌成一段，另有 2 字殘渣」。
「整章一段」**不是缺陷**——`chunk_segments` 的 `MAX_CHARS=1200`，ageoffire ch1 是
886 字，本來就只會切成一塊。

**但確實有一件事值得知道**: `Paragraph` 不保存原文的段落結構。`chunk_segments` 先把
整章所有行 `" ".join()` 成一塊，再依句末標點切到 ≤1200 字——**原本的分段在這一步就沒了**。
所以這個型別叫 paragraph，實際是「上限 1200 字的句子塊」。`role=separator` 是唯一
被保留下來的原文結構訊號。這也說明 09-11 設想的「段落索引錨點」為什麼不會好用。

**✅ 已完成（2026-09-12）**: `_is_separator_segment()` 加一條排除——整段只由
「屬於行文的標點」（句末、逗號、各式引號與括號）加空白組成者，不算分隔線。
實測套回既有的 20 筆 `role='separator'`：**名字的潮汐 16 筆全保留、ageoffire 4 筆
全移除**。測試 18 項，其中 13 項實測過拿掉修正會紅。

**刻意不用長度判準**，並加了守衛測試釘住理由：真的分隔線 `～`、`❦` 只有 1 字，
比被排除的 `。」` 還短。另有一項釘住「只有整段都是標點才排除」——`…✦…` 仍是分隔線。

**⚠️ 已存資料不會自動修正**: 這是 ingestion 階段的判斷，既有的 ageoffire 那 4 筆
壞 separator 仍在 DB 裡，要重跑 ingestion 才會消失。**B-068 的分組實作應該在讀取端
再套一次 `_is_separator_segment()`**——一行防禦，就不必為此重跑書，也擋得住其他
陳舊資料。這件事沒有另開票，因為它是 B-068 實作的一部分。

---

**瀏覽器實測已補（2026-09-12），並且抓到一個只有實測才看得見的缺陷。**

原本記「驅動批次需真實 LLM 呼叫」所以沒看過渲染——**那個前提是錯的**。攔截
`/tasks/{id}/status` 的輪詢回應、塞進真實形狀的 `result`，元件就會用真資料渲染；
要驗的本來就是渲染，不是 LLM。三筆的情況全部正確，包含符號批次沒有名字時退回
「（無名稱）」。

**缺陷：角色頁 toast 裡的清單沒有高度上限。** `.ca-toast` 是
`position:absolute; bottom:24px`，**往上長**。實測 20 筆失敗時 toast 高 1199px、
`top:-336px`——標題與關閉鈕被頂出畫面上緣。而本條目自己加的「有失敗清單就不自動
消失」（`72c4841`）讓它**永久停在畫面上且關不掉**，兩個改動單獨看都對，疊起來才成立。

**修法**：`.ca-toast .ea-batch-failures > ul { max-height: 40vh; overflow-y: auto; }`。
**只封 toast 這一份**——事件頁與符號頁的同一個元件在正常文流裡，讓頁面捲比塞一個
巢狀捲軸好。修後三種視窗高度（900 / 600 / 500）都完整在畫面內。

**教訓**：兩個各自正確的改動可以疊出一個缺陷，而它只在「資料量大到超出你手測的
筆數」時出現。手測三筆看不到，得刻意餵 20 筆。

---


## B-116 `temperature=0` 之下 Gemini 仍然不可重現 ✅ 完成（2026-09-12）

**背景**: `docs/plans/20260910-event-granularity-ordering-experiments.md` 第五節把這件事
列為「本次最大的方法論缺口」——基準組出現 5 和 6、B1 出現 4 和 10、現行組在兩次批次之間
從 10.3 掉到 7.7，而 `temperature=0.0` 之下這些都不該發生。當時列了兩個嫌疑
（`llm_retry` 走不同路徑、供應端非決定性）但**未查明**。

**已查明（2026-09-12）—— 是供應端。**

程式碼層面：`llm_client._build_gemini()` **沒有傳 `seed`**，而 Gemini API 根本沒有這個
參數（OpenAI 才有）。`top_k` / `top_p` 也沒設。`temperature=0` 只給貪婪解碼，不保證
可重現。

實測：完全相同的輸入（《名字的潮汐》ch1、1316 字、12 個實體、同一個提示）連續呼叫
5 次——

| 次數 | 輸出雜湊 | events | relations |
|---|---|---|---|
| #1 #2 #4 #5 | `ea3eac8a` | 4 | 10 |
| **#3** | `b964512f` | **6** | 11 |

**5 次得到 2 種輸出，而離群那次的事件數多出 50%。**

**雜訊基線已量（N=30，2026-09-12）**，同一輸入重複呼叫、兩章各 15 次：

| | ch1（12 實體） | ch7（30 實體） |
|---|---|---|
| 相異輸出 | 2 種 | 2 種 |
| events 分布 | `4×6, 6×9` | `11×15` |
| events sd / range | 0.98 / **2** | **0.00 / 0** |
| relations | 10 或 11 | 8 或 9 |

**最重要的一點：非決定性不一定打到你在量的指標。** ch7 的事件數 15 次全是 11，
變動的是關係數；ch1 反過來，事件數在 4 與 6 之間跳而關係數跟著動。
**所以雜訊基線必須逐章逐指標量，沒有全域值可用。**

**更正本條先前根據 N=5 寫下的判斷。** 當時寫「雜訊帶與效應帶重疊，小 N 之下連效應
大小都不可靠」——**過頭了**。N=30 的實情是最壞的 ch1 波動範圍 2 個事件，而 09-10
在 ch7 上量到的措辭效應是 5.40 → 9.00（差 3.6）。**效應確實超出雜訊**，那份實驗的
N=10 是勉強夠用，不是無效。成立的部分是：**`sd=0.00` 不能當成「這個措辭比較穩」的
證據**——ch7 在任何措辭下事件數都不太動，那是章節性質不是措辭功勞。

**與 plans 數字不可直接比較**: 本次量的是 `raw.events`（LLM 原始輸出），
`20260910` 量的是 `_parse_events` 之後。ch7 原始 11 筆、入庫 10 筆，中間有過濾。

**對「三個沒試過的方向」的意思**: 可以動工了，但**要先在目標章節上量該指標的雜訊**。

**更正上面那句「不要選 ch7 量事件顆粒度」（2026-09-12）。** 原文的理由是「它在那個
指標上沒有變異，看不出差別」——**寫反了。零變異是零底噪，鑑別力最高而不是最低。**
ch7 在 09-10 的措辭實驗裡從 5.40 動到 9.00，證明它對**措辭**敏感；它只是對**雜訊**
不敏感，而那正是好的對照章該有的樣子。

**而且雜訊會被措辭推著搬家（2026-09-12 實測，見
`docs/plans/20260912-untried-granularity-directions.md`）**：

| | 現行提示 range | 變體 D range |
|---|---|---|
| ch1 | **2**（雙峰 4/6） | **0**（全 5） |
| ch7 | **0**（全 11） | **1**（10/11） |

**兩章方向相反，總變異沒減少、只是換了落點。** 實務結論：
- **`sd=0` 不能當「這版比較穩」的證據，即使是同章對照。** ch1 上變體 D 的 range 0
  看起來像穩定性勝利，ch7 上同一個變體就是退步
- 要宣稱穩定性，**至少兩章而且兩章都要報告**。單章 range 是章節性質與措辭的混合

**不做**: 改用其他 provider 求可重現性。跨雲的前提已於 B-099 收攏為不成立。

**觸發時機**: 下次要比較提示措辭之前，先用 N≥30 估一次雜訊基線。

---


## B-117 已刪書籍的殘留快取 ✅ 完成（2026-09-12）

**背景**: `20260910` 的 plans 第六節點名「量測必須排除 Age of Fire 與**已刪書籍的
殘留快取**」。《名字的潮汐》誤刪重傳（新 id `c4185113`）之後，那句話正中紅心。

**✅ 已完成（2026-09-12）**: `analysis_cache` 清掉 17 筆，屬於兩個已不存在的 book id：

| 家族 | `8f18dd59`（潮汐舊 id） | `1a1a7266` |
|---|---|---|
| `character` | 10 | — |
| `epistemic` | 1 | 3 |
| `narrative_structure` | 1 | 1 |
| `symbol_overview` | — | 1 |

共 119,546 bytes。26 → 9 筆，留下的逐筆核對過都屬於活書（ageoffire 7、潮汐 2）。
清除後 pytest 2062 全綠、`GET /symbols/overview` 對活書仍回 200。

**作法依 CLAUDE.md 的破壞性指令紀律**：整份 DB 先備份到**專案目錄外**的 scratchpad
（同目錄備份等於沒備份）、兩邊的清單逐項列出核對而不是只看差集、刪除前把 17 筆
key 與刪後留下的 9 筆都攤開給使用者確認。

**其他 store 不需要清**: `symbol_store` 只有兩本活書；`inferred_relations` 與
`inferred_concepts` 是空的。

**順帶讓一項走查任務失效**: `20260909-post-sweep-development-plan.md` §3-3
「書 `1a1a7266` 有 40 筆 pending 推斷關係、0 筆採用，要查是沒人看還是品質不好」——
**前提已消失**，那本書刪掉時推斷關係一起沒了，`inferred_relations` 現在是空表。
該項不必再查。

---


## B-118 「只被測試引用」的 8 筆已走查，掃描器補上兩個缺口 ✅ 完成（2026-09-12）

**背景**: `20260909-post-sweep-development-plan.md` §3-1 列的三個未掃範圍之一。
B-091 標 ✅ 結案，但那三個範圍只寫在它的內文裡，從沒開成票——計畫自己警告過
「不收進來就會徹底遺失」。

**✅ 逐一走查完成（2026-09-12）**，依 B-091 的三種結局分類：

| 符號 | 結局 |
|---|---|
| `TokenTrackingHandler.on_llm_start` / `on_llm_end` / `on_llm_error` | **不是死碼**——LangChain 框架呼叫，永遠不會有具名呼叫端 |
| `MetricsCollector.reset` | **不是死碼**——docstring 明寫「Intended for use in tests」 |
| `AnalysisAgent.analyze_narrative` | **有取代者**：它串的兩個階段在 `narrative.py:54` / `:68` 各有呼叫端，前端也是分開的按鈕。是被繞過的便利入口 |
| `DocumentService.save_chapter_keywords` / `save_book_keywords` | **有取代者**：pipeline 設在物件上、由 `save_document` / `replace_chapters` 整批寫 `keywords_json` |
| `VectorService.collection_name_for` | **有取代者且是陷阱**：它是 `f"{prefix}_{id}"` 的天真版，而真正的 `_col()` 有四段解析。用它會繞過 slug 解析 |

**掃描器補了兩個缺口**（這比走查結果重要——結果會過期，機制不會）:

1. **corpus 拆成生產／測試兩份。** 原本 backend + tests + scripts 併成一個 corpus，
   於是「只有測試在用」看起來就是「有人用」。新增獨立的
   「referenced ONLY by tests/scripts」區段——B-091 把這類標為**最危險**，正因為
   測試會讓死碼看起來活著。§3-1 提的掃描方式至此才真的內建。
2. **框架回呼排除。** `CallbackHandler` 子類的 `on_*` 由框架呼叫，列進候選只會
   訓練讀者略過清單——而那正是真條目被漏掉的方式。判斷依基底類別名稱，不是
   `on_` 前綴。另有 `_NOT_DEAD` 允許清單，**每筆必須附理由**，並有測試釘住這件事。

跑出來的現況：zero-reference **1 筆**（`get_fallback`，B-099 刻意保留）、
只被測試引用 **5 筆**——上表四筆，**外加 `group_scenes`**：那是本輪新寫的場景分組，
消費端還沒接。掃描器抓到自己人，是它正常運作的證據。

**已刪（2026-09-12，使用者批准後，commit `ba15406`）**: 上表四個「有取代者」連同
各自的測試一起移除。刪除時踩到兩次**文字手術殘渣**：拿掉 `analyze_narrative` 留下
一個沒有主人的 `@pytest.mark.asyncio`；拿掉 `collection_name_for` 留下 `@staticmethod`，
它接著套用到下一個 `_col` 上，打壞 7 個向量測試。兩次都是閘門抓到的——**刪一個
符號不等於刪掉它上面那幾行裝飾器**。

**§3-1 另兩個範圍也掃完了（2026-09-12）——至此 §3-1 全數收束**

**`scripts/` 三個「孤兒」，實際只有兩個是**：

| 腳本 | 判定 |
|---|---|
| `explore_api.py` | **不是孤兒**——`docs/guides/API_TESTING.md:22` 有文件化用法 |
| `prune_orphan_symbols.py` | docstring 明寫 one-off。**目標已空**：`symbol_store` 兩張表的 book_id 全部對得上活書 |
| `renumber_chapters.py` | docstring 明寫 one-off。**目標已空**：章號正確（toc=0、body=1–10、afterword=11），前置頁沒佔用正文章號 |

兩個 one-off 的條件**不會再出現**——`delete_book` 自 2026-08-18 起會清 symbol_store，
`assign_chapter_numbers()` 已在 pipeline 裡。所以它們是已用畢的遷移腳本。
**已刪（2026-09-12，同一個 commit）**；`explore_api.py` 留下。

**45 個巢狀函式：掃完是 0 筆。** 掃描器新增這個範圍，第一次跑挑出 1 個
（`create_app() -> _global_handler`），查證是偽陽性——`@app.exception_handler`
由 FastAPI 註冊呼叫，與既有的路由處理器同一類。套用同一條 decorator 排除規則後歸零。

**這個結果與 B-098 把私有方法納入掃描時一樣**：範圍清空本身就是有用的答案，
而且現在它是自動的，不必再有人記得「還有一個範圍沒掃」。巢狀掃描刻意不用
`ast.walk` 找巢狀定義——那會讓雙層巢狀的函式被上面每一層各報一次，而同一個符號
在候選清單裡出現兩次，正是讀者開始不信任清單的起點（有測試釘住）。

---

**§3-2 `pipelines/` 結構分歧：規律已經在那裡，只是沒人寫下來（2026-09-12）**

走查計畫問「要不要在目錄上分開 ingestion 步驟與 on-demand orchestrator」。
**查證後：已經分開了**，七個 pipeline 無一例外——

| 形狀 | pipeline | 呼叫端 |
|---|---|---|
| package | document_processing / feature_extraction / knowledge_graph / summarization / **symbol_discovery** | `workflows/ingestion.py` |
| 裸模組 | concept_inference / temporal_pipeline | `api/deps.py` |

**`symbol_discovery/` 是規律成立的證據，不是反例。** 它只有 `pipeline.py`、沒有任何
helper，卻仍是 package——唯一的解釋就是「ingestion 驅動它」。計畫說「形狀由呼叫端
決定而非 pipeline 自身」，完全正確。

**處置：寫下來 + 加守衛，不重構目錄。** 重構是範圍外的順手整理（CLAUDE.md 紅線），
而且沒有任何東西壞掉。真正的風險是這條慣例**沒有任何地方陳述**——下一個人把
`symbol_discovery/` 攤平成單檔會通過「整理孤零零的檔案」這種 review，訊號就沒了。
已寫進 `pipelines/__init__.py`，並加 `tests/pipelines/test_pipeline_shape.py`
四項守衛，**兩個哨兵實測會紅**（把 on-demand 做成 package、把 symbol_discovery
攤平），其中一項專門釘住 symbol_discovery。

**§3-2 至此收束。走查 §3 只剩 3-4 langfuse 基線（只有使用者能做）。**

---


## B-120 Langfuse 憑證錯誤是沉默失敗 ✅ 完成（2026-09-12）

**背景**: 2026-09-12 為走查 §3-4 開啟追蹤時踩到。`.env` 裡 public / secret 兩個金鑰
互換了，結果是：後端啟動**不報錯**、chat **照常回答**、log 還印
`Langfuse tracing enabled`——只有 span 靜靜地一筆都沒送出去。發現方式是手動去數
langfuse 的 trace 總數，不是任何告警。

**成因**: `CallbackHandler()` 的建構**不連伺服器**，建得起來完全不代表金鑰能用。
`configure_langfuse()` 建完就 `return True`。

**✅ 已修（2026-09-12）**: 啟動時加一次 `get_client().auth_check()` 探測，
**三種結果刻意分開而不是兩種**：

| 結果 | 處置 | 理由 |
|---|---|---|
| 通過 | 照常啟用 | |
| **被拒** | **ERROR + 關閉追蹤** | 認證不了的 handler 是純粹的逐次呼叫開銷，留著還會讓「enabled」那行 log 繼續說謊。訊息直接點名兩個真正會出錯的地方：金鑰放反、region 弄錯 |
| 無法驗證（連不上） | WARNING + 保持啟用 | 啟動時的網路抖動不是設定錯誤。**無法「檢查」金鑰，不等於金鑰是錯的** |

**實作時被自己的守衛打臉一次，這點值得記**: `auth_check()` 在憑證錯誤時是
**丟 `UnauthorizedError`**，不是回傳 False。第一版用 `except Exception` 一把抓，
於是「金鑰是錯的」被歸進「無法檢查」，追蹤照樣開著——**守衛看起來完全正確，
實際上什麼都沒擋**。是照 B-061 拿真金鑰對調實測才發現的。

**驗證**: 三種情境各跑一次真實環境（正確 / 對調 / 連不上的 host），行為皆符合上表。
測試補 3 條，並修好一條既有測試——它只 patch 了 `CallbackHandler`、沒 patch
`get_client`，我的改動會讓它去打真的網路（順帶：該檔從 5.11s 降到 0.92s）。
哨兵測試兩種拆法（移除 `UnauthorizedError` 分支、整個探測拿掉）都確認會變紅。

---


## B-110 張力頁重新整理後就忘記 Step 1 跑過 ✅ 完成（2026-09-11）

**背景**: 2026-09-11 為 B-068 第一層接線做瀏覽器實測時撞見。

`TensionPage.tsx:178` 的 `hasTeus = analyzeResult !== null || hasLines` **不看
`teus` 那個 query**——它只知道「這個 session 剛跑過 Step 1」或「已經有張力線」。
而 Step 1 卡片的渲染條件是 `hasTeus && !hasLines`，兩者相減之後，**那張卡片只在
「剛跑完 Step 1、還沒跑 Step 2」的那一小段時間存在**。

**實測**: 《大唐雙龍傳》有 **23 筆 TEU**（`GET /tension/teus` 回得好好的），頁面
顯示的卻是「尚未進行張力分析」的空狀態。重新整理，Step 1 的成果就從畫面上消失。

**後果比「看不到」嚴重**: 空狀態那張卡片的 CTA 是「開始 Step 1 · TEU 組裝」，
所以使用者會被引導去**重跑一次已經做完的工作**——一次完整 LLM pass，而且會覆蓋
既有產出。

**修正（2026-09-11）**: `hasTeus` 補上 `|| teus.length > 0`。`analyzeResult` 留在
最前面，因為它比 TEU query 的 refetch 先到，否則卡片會閃過空狀態。

**紅線說明**: 這是任務範圍外的改動，依 CLAUDE.md 本應另開任務。之所以與 B-068
第一層接線同一個 PR（分開的 commit），是因為那次接線的產出——密度圖改以場景數
繪製——正好掛在這張看不到的卡片上，分開送兩邊都無法驗證。經使用者確認後合併送出。

---


## B-106 `narrative_position` 有五個讀者、零個寫者 ✅ 完成（2026-09-10）

**背景**: 2026-09-10 走查 B-068 時挖到。`Event.narrative_position`（章內文本序）
在全部 235 個事件上的填充率是 **0/235**——不是「大多沒填」，是**從來沒有任何地方
賦值**。它不在事件抽取的提示裡（`_RELATION_SYSTEM_PROMPT` 沒有這個欄位），
`_parse_events` 也不設它；`kg_service_neo4j` 的讀寫只是把 None 存進去再讀回來。

**但有五處在讀它排序**:

| 位置 | 用途 | 實際結果 |
|---|---|---|
| `services/narrative_service.py:300` | kernel spine 排序 | `or 0` 全部打平 |
| `services/narrative_service.py:350` | 全事件文本序 | 同上 |
| `services/narrative_service.py:892` | 文本序 vs 故事序比對 | 同上 |
| `services/global_timeline_service.py:172` | 同層內次要排序 | 完全空轉 |
| `api/routers/book_event_analysis.py:322` | API 回 `chunk` 欄位 | **永遠是 null** |

前四處的後果一樣：`sorted(key=lambda e: (e.chapter, e.narrative_position or 0))`
在同章事件上全部同分，**章內順序退化成任意**（dict 插入序）。敘事結構頁的 kernel
spine、時間軸的同層排序都受影響，而且不會報錯——它只是排錯，看起來像是有排。

第五處更直接：`chunk` 這個 API 欄位從實作至今回的都是 null。

**這不是「補一個沒人要的欄位」**: 五個消費者都已經寫好在等它，欄位也早就在 domain
model 裡。缺的只有生產者。

**待辦內容**:
- 事件抽取提示加上章內順序，`_parse_events` 寫入
- 既有四本書要重跑 KG 才會有值（與 B-107 同批處理）
- 補一個守衛，避免它再度變成零寫者

**已完成（2026-09-10）—— 但要求章內序有一個沒被預見的代價**

生產者用回應順序編號（不叫 LLM 填數字），1-based。Age of Fire 與《名字的潮汐》
均已重跑，填充率各為 49/49 與 65/65。

**代價**: 《名字的潮汐》事件數 47 → **65（+38%）**。對照實驗證實**不是 LLM 非決定性，
是那句排序指令本身**——要能排序，模型就得把每個事件釘在文本時間軸上，而概括性敘述
在那條軸上沒有單一位置，只能拆成各自有位置的節拍。ch7 的
`other 泰奧多爾與莉莉安娜的愛情與背叛` 被拆成相愛 → 背叛 → 贈錶 → 錶停四拍。

試過三種措辭，**沒有一種能取得章內序而不動顆粒度**（ch7、N=10、基準 5.40–5.70）：

| 做法 | 位置由誰產生 | 顆粒度 |
|---|---|---|
| 最初送出的措辭 | 後端 `enumerate` | 9.00（+58%） |
| **B2「只管清單順序」← 採用** | 後端 `enumerate` | **7.00（+30%）** |
| B1「明講顆粒度」 | 後端 `enumerate` | 雙峰 4 或 10，措辭歧義，否決 |
| C「模型自帶 position 欄位」 | 模型 | 8.00（+48%）；`position` 品質 10/10 |

完整設定、數據與方法論缺口見
`docs/plans/20260910-event-granularity-ordering-experiments.md`。

**顆粒度稅確認付不掉（2026-09-12），本項可以收束。** 09-10 留下的三個「沒試過的
方向」已全部量完，三個都不成立，見
`docs/plans/20260912-untried-granularity-directions.md`：

| 方向 | 結果 | 否決理由 |
|---|---|---|
| 兩段式抽取 | ch1 **+131%**、ch7 **+40%** | 顆粒度反增，呼叫 ×3 |
| 顆粒度寫進 `event_type` 說明 | −4%（在雜訊帶內） | 第四個字眼，一樣無效 |
| `_parse_events` 後合併 | 抹掉 60% 事件 | 不可逆，且被 `group_scenes()` 支配 |

**兩段式的失敗把機制論推進了一步。** 09-10 的結論是「要章內序，就得付顆粒度」；
實測顯示**連序都不必要求，光是多問一次就要付**——ch1 三個場景 488 / 357 / 469 字，
穩定產出 3 / 4 / 5 個事件，**與長度不相關**。每一次 LLM 呼叫都有自己的顆粒度地板，
切成三塊問三次就付三次。兩段式在定義上就是多問，所以結構上不可能達成原本的目的。

**未做**: 兩本書是用最初的措辭重跑的，所以現有事件數反映的是 +58% 那一版而非 B2。
**現在可以決定了**：B-068 的場景分組已上線，較細的節拍是素材不是成本，
**不需要為了壓顆粒度而重跑**。若哪天為了別的理由重跑，順帶對齊即可。

**觸發時機**: B-068 的前置——沒有章內順序，「連續節拍屬於同一場戲」就無法表達。

---


## B-107 Age of Fire 的事件資料停留在 B-082 修好之前 ✅ 完成（2026-09-10）

**背景**: 2026-09-10 走查 B-068 時，量測受這本書干擾才發現。

| 書 | 事件 | 完全相同的標題 |
|---|---|---|
| Age of Fire (併發驗證) | 101 | **26 組 / 60 筆** |
| 其餘三本 | 134 | **0** |

`志豪提出分手` ×3、`志豪與蘇曉琳閃婚` ×3、`蘇曉琳首次踏入林家大院` ×2 這類，
是重跑 KG 抽取累積出來的。

**不是活著的 bug**: B-082 已於 2026-08-20 修好（`_persist_to_kg` delete-first）。
這本書的 `knowledge_graph_at` 是 **2026-08-17T13:12**，早於修正三天，所以是
**修好之前留下的舊資料**。旁證：它的 `timeline_config_json` 還記著
`total_events: 32`，而 KG 裡有 101——約當三次累積。

**後果**: 任何以事件數為基礎的量測，只要含這本書就會被污染，而且會與 B-068 的
「一場戲被切成多個 event」混成同一個成因。B-068 的調查必須明確排除它。

**待辦內容**: 對這本書重跑 knowledge_graph 步驟。delete-first 已就位，重跑是安全的。
順序上排在 B-106 / B-068 之後——那兩項也要重跑，一次做完即可。

**觸發時機**: B-106 與 B-068 落地後，一併重跑。

## B-108 事件衍生的快取失效規則掛在錯的步驟上 ✅ 完成（2026-09-10）

**背景**: 2026-09-10 為 B-106 / B-107 重跑資料前查證影響範圍時發現。

| 步驟 | 重新產生 event id？ | 收 TEU keys | 清 `event:` 快取 | `_STALED_CACHES` |
|---|---|---|---|---|
| `feature-extraction` | ❌ 只做 embedding / 關鍵字，**完全不 import Event** | ✅ | ✅ | 5 個事件衍生分析 |
| `knowledge-graph` | ✅ 全部經 `RelationExtractor` 重生 | ❌ | ❌ | **空的 `()`** |

**兩者剛好相反。** `_STALED_CACHES` 裡那句註解
「Events are re-extracted, so every book-level analysis built on them ages」
就寫在 `feature-extraction` 底下——它描述的是 `knowledge-graph` 的行為。

**後果不是「快取過期」，是「永遠讀不到」**: `event:{book}:{event_id}` 與
`teu:{event_id}` 的鍵裡含 event id。KG 重跑之後那些 id 不存在了，沒有任何東西能再
去要那幾列，但列還在——會被任何數列數的東西算進去。《名字的潮汐》若在修正前重跑，
會留下 38 + 47 = **85 筆這種列**。

**修正（2026-09-10）**: 把 `event:{book}:%` 加進 `knowledge-graph` 的
`_ORPHANED_CACHES`、把五個事件衍生分析加進它的 `_STALED_CACHES`，並讓
`ingestion.py` 在 `knowledge-graph` 時也收集 TEU keys（必須在步驟執行**之前**收，
否則收到的是新 id）。

**刻意沒做的事**: 沒有把這些規則從 `feature-extraction` 移除。它確實不碰 Event，
所以那邊的規則多半是多餘的（會白白丟掉還有效的快取），但「多丟」與「漏丟」的嚴重性
差很多，而且要證明那些分析不隨 re-embedding 老化是另一個命題。**留成獨立的一題。**

**測試側的同一個誤解**: `test_narrative_structure_ages_with_event_extraction` 這個
測試名把 `feature-extraction` 叫成 event extraction，並斷言它是唯一來源——**測試在
釘住這個 bug**。已改名並改判準。

---


## B-091 全面徹查零使用程式碼 ✅ 完成（2026-09-08）

**背景**: B-090 只掃了 `backend/storysphere` 的 top-level 定義與 class 方法，就掃出
5 個零引用符號、其中 2 個不是死碼而是**做到一半被放掉的接線**。同期另外查出
`ConceptInferencePipeline`（229 行，B-092）從誕生至今從未被呼叫，以及
`pipelines/concept_inference.py` 是唯一從未被 import 的模組
（2026-09-10 更新：B-092 已接線，這兩句是當時的觀測，不是現況）。

也就是說「開發到一半莫名其妙放掉」在這個 repo 是有母體的現象，不是零星個案。
目標是**讓零使用的程式碼段落不存在**，並且不是清一次就算，而是有辦法重複執行。

**關鍵教訓：零引用 ≠ 死碼。** 目前已遇到三種結局，掃描只能給出候選，判定必須逐一走查：

1. **真死碼** —— 有取代者，或功能已移除。刪。
2. **被手抄的來源** —— 有人把它複製成 literal（`CharacterAnalysisOutput`）。
   刪掉會把重複固化，正解是讓抄的那一方改用它。
3. **未接線的生產者** —— 消費端活著但讀到的永遠是空值
   （`ConceptInferencePipeline` → `tension_service.py:879` 的 `if inferred:` 分支、
   `unraveling_manifest.py:204` 的計數）。這是產品決定，不是清理決定。

**尚未掃描的範圍**:
- 前端 `frontend/src`：元件、hook、util、i18n key、CSS class
  （B-087 的兩段死 CSS 是手動發現的，沒有系統性掃描）
- ~~巢狀函式與 class 內部的私有方法~~ —— **私有方法已於 2026-09-06 納入掃描器
  （B-098），整個 backend 0 筆**。仍未掃的是「函式裡面再定義的巢狀函式」
- 只被測試引用、生產路徑沒有呼叫者的符號 —— 這類最危險，因為測試會讓它看起來活著
- 只出現在 docstring / 註解 / 文件裡的「已規劃但未接」項目
- `scripts/` 下的孤兒腳本
- 已註冊但從未被觸發的 chat tool（20 個全註冊給 agent，實際被呼叫幾個要看 log 不是讀 code）

**進度（2026-09-05）**

掃描器已固定為 `scripts/scan_dead_code.py`，四個子命令：
`backend` / `exports` / `i18n` / `css`。沒有引入 `ts-prune` 或 `knip`——
自己寫的那份要處理本專案特有的偽陽性（見下），外部工具還是得配一層例外。

| 範圍 | 現況 |
|------|------|
| backend 符號 | **1**（起始 3）：只剩 `LLMClient.get_fallback`（暫緩，見 B-090）。`hero_journey.py` 的 `STAGE_IDS` / `PHASES` 已隨 B-093 刪除 |
| frontend 匯出 | **0**（起始 15，12 刪 3 接） |
| i18n key | **340 / 2327** 未引用 |
| CSS class | **0 / 1796**（起始 86；2026-09-06 清除 123 條規則、681 行） |

**前端匯出那 15 個的三種結局**（比例值得記：**五分之一是要接不是要刪**）：
- 刪 12：`fetchCoOccurrences`（被 aggregate 取代）、`fetchTemporalTask`（被
  `useTaskPolling` 取代）、`intensityBarFill/Edge`、`PolarityPill`、`isSuperNode`、
  `MurmurStepKey`、`RerunTaskResult`、`triggerBookAnalysis`、`regenerateAnalysis`、
  `fetchSep`、`deleteEventAnalysis` / `deleteEntityAnalysis`
- 接 3：`clearMurmur`（上傳失敗路徑的緩衝從未回收）、`aggregatedEdgeWidth`
  （聚合邊寬度不反映權重）、`buildActiveFilterTags`（生效中的篩選只看得到數字）

**掃描器掃不到的一類：model 欄位**（2026-09-06）。判準是「**同組手足都有人讀寫、
只有它沒有**」，只能手動掃，`scan_dead_code.py` 看不到（欄位在 model 裡被宣告，
語法上不是零引用）。目前三筆，全部屬第 1 種（真死碼）而刪除：

| 欄位 | 為什麼是死的 | PR |
|------|------------|----|
| `TEU.review_status` | 沒有端點能改它、不在任何 response schema、快取裡 99 筆全是 `pending`。註解說是 B-027 grouping 用的，但 `group_teus` 載入全部 TEU、不依它篩選 | #88 |
| `Entity.source_spans`（連同 `SpanRef`） | B-024 一次加的四個 provenance 欄位，三個手足在 domain 外有 19 / 3 / 79 處引用，只有它是 0。`concept_inference` 也不寫它（證據塞進 `attributes["evidence"]`） | #89 |
| `StoryTimeRef.absolute_time` | 兩個手足在 `narrative_service.py:852-853` 被填入，唯獨它從未被傳 | #89 |
| `NarrativeStructure.propp_functions`（連同 `ProppFunctionRef`） | 全 repo 零寫入零讀取。docstring 說「B-034 LLM refinement 跑 Propp 分析時才填」，但 B-034 已標 ✅ 完成、實作只有 `refine_with_llm`，Propp 從來不在裡面 | E 敘事走查 |
| `TemporalAnalysis.review_status` | 兩處建構都不傳、`_read_temporal_analysis` 不讀、`PATCH /narrative/:id/review` 走的是 `NarrativeStructure`。與 `TEU.review_status` 同形 | E 敘事走查 |

**`propp_functions` 不是「被手抄的來源」，查證過才刪**: `docs/guides/deep-analysis-event.md`
把 Propp 記在 `eep.structural_role` 名下，但那個欄位的值域是 Setup / Inciting Incident /
Turning Point 一類的敘事節拍，**不是 Propp 的 function code**，兩者不是同一份資料的兩份拷貝。
Propp function 對應的設計意圖只存在於 `docs/plans/20260331-narratology-analysis-design-notes.md`，
真要做是一次獨立的功能開發，不是把一個永遠回傳空陣列的欄位留在 API 回應裡當佔位。
移除**會改到 OpenAPI**（`GET /narrative` 的回應 schema），已重產 `generated.ts`，
diff 僅為該欄位與 `ProppFunctionRef` 定義的移除。

**這五筆共同的形狀**：B-024 / B-033 / B-034 三張票**都標示 ✅ 完成，卻都沒填上自己
宣告的欄位**（B-034 命中兩次：`absolute_time` 的 docstring 引錯到它，`propp_functions`
則是真的宣告在它名下卻沒做）。`TEU.review_status` 的處置另有設計理由（審核關卡設在合成層 TensionLine /
TensionTheme，不設在原料層 TEU），已寫進 `docs/guides/tension-analysis.md` 免得日後
有人以為是漏做又加回來。三者的 `extra` 都是預設 `ignore`，舊快取多出來的鍵會被靜默
忽略，不需遷移；OpenAPI 以離線重產 `generated.ts` 比對為 byte-identical，
`API_CONTRACT.md` 無需更動。

**偵測器本身就是偽陽性的來源，這點必須寫下來**：
第一版的 i18n 掃描只認 `t(\`ns.x.${v}\`)`，漏掉
`const key = \`ns.x.${v}\`; t(key)`，把 `VoiceProfilingPanel` 執行期組出來的
三個 key 判成未用。修法是不再看 `t()`，改成**取所有含插值的模板字面值的靜態
前綴**——不管那個值怎麼傳遞都涵蓋得到。CSS 掃描有一模一樣的問題
（`` `tl-pill-${type}` ``），同一套修法。

**待辦**:
- ~~CSS 那 86 筆~~ **已於 2026-09-06 清完**（見下）。~~i18n 那 340 筆~~
  **已於 2026-09-08 清完**：340 → 19（見下）。

**i18n 那 340 筆的走查結果（2026-09-08）**：**刪 309、留 31**（19 個受動態前綴保護 +
12 個誤刪後還原）。

**「167 處開頭即插值」這個 caveat 被解決了，不是繞過**：逐一檢視後，其中 **166 處是
SVG／CSS 座標**（`` `${x} ${y}` ``），長得像 i18n key 的**只有一處** ——
`BatchEepPanel` 的 `` `${i18nPrefix}.${suffix}` ``。它唯一的呼叫端
（`EventAnalysisPage`）不傳 `i18nPrefix`，所以只會組出 `batch.*`；那 19 個 key
**正在事件分析頁上顯示**，批次刪除會讓整片面板變成裸 key。先扣掉它們，剩下的 321
才逐項走查。

**另外兩種動態組法也查過**：字串相加組 key（0 處）、`t(變數)`（3 處，其中兩處的
變數來自**字串字面值對照表**，掃描器的子字串比對找得到；一處是
`VoiceProfilingPanel` 的 `` `character.voice.tones.${raw}` ``，有靜態前綴、擋得住）。

**踩到一個掃描器的洞，靠瀏覽器實測抓回來**：刪完之後跑 15 頁的 DOM 掃描（找形如
`a.b.c` 的文字節點），設定頁出現三個裸 `nav.badge*`。成因是 `_dynamic_prefixes` 有取到
前綴 `nav.badge`，但**比對端**只認 `path == p` 或 `path.startswith(p + ".")` ——
插值落在**段之間**（`ns.x.${v}`）擋得住，落在**字中間**
（`` nav.badge${cap(kind)} `` → `nav.badgeDev`）就擋不住，兩者不共享 `.` 邊界。

用同一個判準回頭重掃，又找出 9 個（象徵頁空狀態 6、張力頁排序 3）——**那 9 個視覺
掃描沒抓到，因為那些狀態當時沒出現在畫面上**。12 個全部還原，並修掉掃描器的比對
（改為 `startswith(p)`），shielded 從 376 升到 401。

**這印證了 B-091 記過兩次的那句話**：不要把掃描器說的當成事實。這次是第三次，而且是
唯一一次「照掃描器做了才發現它錯」——前兩次都是在動手前發現的。

**驗證**：15 個頁面逐頁掃 DOM 文字節點找裸 key，全部乾淨。

**CSS 那 86 筆的走查結果（2026-09-06）**：**全部是第 1 種（真死碼），沒有第 2、3 種。**
兩種來源，形狀完全不同：

1. **被改版取代的整片殘留**（`tension.css` 54 + `symbols.css` 10）。不是散落各處，
   是 **7 個連續區塊**，每一片的最後一次 TSX 使用都停在某個改版 commit：
   `.tn-section-h*` → 685fde3（章節格點取代軌跡圖）、`.tn-hero-stale*` /
   `-proposition*` / `.tn-booker-glyph` → 385bdf4（hero 翻新）、`.tn-card-*` 整組 +
   `.tn-teu-*` → 5a5eab0（stepper 改 5 段）、`.tn-empty*` → 7a53d61（四張狀態卡）。
   `symbols.css` 那 10 筆全部指向 8616b88；其中 `Polarity pill` 的區塊註解也孤兒了
   —— 那是 **PR #86 刪掉 `PolarityPill` 元件時留下的另一半**
2. **從來沒有被任何元件套用過**（`ss-*` 15、`md-*` 3、`ca-*` 2、`st-*` 2）。
   `git log -S` 在 `frontend/src` 排除 `styles/` 後**完全沒有紀錄**

**判斷細節，兩個值得記**:

- **混用選擇器 22 條先擋下再逐一驗**（`.tn-btn.primary`、`.ca-tab .ca-tab-count`、
  `[data-theme="ink"] .ss-option-card.is-on`…）。這些是「死 class + 活修飾詞」或
  「活父層 + 死子層」，兩種都同樣永遠命中不了。**唯一會判錯的是死 class 出現在
  `:not()` 裡** —— `:not(.從不存在)` 恆真，刪掉整條會改變行為。實測全 repo 0 筆才動手
- **`.ss-btn-danger` 有文件宣告**（`DESIGN_TOKENS.md` 記它是 ink 的 danger 按鈕處理），
  但它從未被套用，真正的 danger 按鈕 `.tn-modal-danger` 在 ink 下沒有專屬處理。
  **沒有據此開票**：B-086 的 109 處盤點已涵蓋這條判準（單一狀態、無可混淆的語意色手足、
  按鈕內有文字），重開等於翻案。該列改為記錄實況

**驗證**: `npm run build` 實際 parse 過全部 CSS（這是刪除沒破壞語法的真正證明），
掃描器 86 → 0，括號平衡檢查通過。
- 尚未掃描：巢狀與私有方法、只被測試引用而生產路徑無呼叫者的符號、
  `scripts/` 孤兒、已註冊但從未被觸發的 chat tool。
- model 欄位的手動判準（同組手足都有人讀寫、只有它沒有）已在張力與角色／事件兩域
  各跑過一次，尚未掃過其餘功能域。
- 決定要不要變成第六道閘門。**傾向不要** —— 判定需要人走查，做成閘門會逼人
  用刪除來消紅燈，正好製造上面第 2、3 種錯誤。比較合適的是定期跑、產出候選清單。

**明確不做**: 不以「掃描說零引用」為由直接刪除。每一筆都要先判定屬於上述哪一種。

**觸發時機**: B-090 已完成第一批；其餘範圍待排。

---


## B-095 英雄旅程的順序常數 `STAGE_ORDER` / `STAGE_PHASE` 無防護 ✅ 完成（2026-09-07）

**背景**: B-093 把 taxonomy 漂移防護從 2 個 framework 擴到 5 個，並刪掉英雄旅程四份
拷貝中沒人讀的那份（`config/hero_journey.py`）。剩下三份都有人用，其中
`frontend/src/components/narrative/heroJourney.ts` 的 `STAGE_ORDER` / `STAGE_PHASE`
**仍在防護之外**。

**為什麼它比顯示名危險**: 現行的漂移測試比對的是 **id 集合**與**顯示名**，
兩者都不含順序。而 `STAGE_ORDER` 帶的是階段序號 —— `stageOrdinal()` 靠它算
「第幾階段」。後端 JSON 若調換或增刪階段，id 集合與顯示名可以完全一致，
序號卻已錯位，而且**畫面照常渲染**，只是每個階段的號碼都是錯的。
這正是本輪走查在找的形狀：意圖（兩份順序要一致）沒有任何東西在驗。

**待辦**:
- 在 `tests/config/test_archetype_taxonomy_drift.py` 加一項：解析 `heroJourney.ts`
  的 `STAGE_ORDER`，與 `config/hero_journey/hero_journey_zh.json` 的 stage 順序**逐位**
  相等（不只是集合相等）
- `STAGE_PHASE` 的 phase 歸屬同理。**先確認後端 JSON 有沒有 phase 欄位** ——
  若沒有，這份是前端獨有的知識，那就不是漂移而是單一來源，只需在常數旁註明
- 沿用 B-061 慣例：新守衛要實測自己會紅（調換兩個階段的順序）

**放後端 pytest 而非前端 vitest**: 同 B-061 / B-093 —— 五道閘門裡有 pytest，
沒有 `npm run test`。

**已完成（2026-09-07）**: 三項守衛加在 `tests/config/test_archetype_taxonomy_drift.py`
——順序逐位相等、phase 對照相等、兩個語系的 JSON 順序一致（順序是結構不是文案，
兩份不一致的話「以哪一份為準」本身就會變成問題）。後端 JSON 確認有 `phase` 欄位，
所以兩份常數都比對得到。實測目前一致，哨兵驗過兩種漂移各自會紅：調換兩個階段的順序、
把某個階段的 phase 標錯。

**觸發時機**: 已執行。

---


## B-096 classify 的洗白守衛只擋全損，不擋部分損失 ✅ 完成（2026-09-07）

**背景**: 「對已失去 `event:{doc}:{id}` 快取的書跑 `POST /narrative/classify` 會把 KG 的
kernel/satellite 權重洗成 `unclassified`」這件事已經有守衛了——服務層
`NarrativeService._would_wipe()` 會中止，端點層回 409。但兩層的條件都是
**`hits == 0 and classified > 0`**，也就是**只有 EEP 快取一筆不剩才擋**。

**還開著的洞**: 部分損失照跑。`eep_coverage` 回 `(12, 38, 47)` 時端點回 202、服務照寫，
結果是 12 個事件重新分類、**另外 26 個已分類事件被靜默重設為 `unclassified`**。
`tests/api/test_narrative.py:278` 正是把這個行為釘成 202（測試名
`test_202_when_the_cache_still_has_entries`）。

**諷刺之處**: `eep_coverage()` 自己的 docstring 寫的是「How much of a classification run
would survive」——需要的數字早就算出來了，門檻設在 0。

**已完成（2026-09-07）—— 但修的不是門檻，是判準**:

走查成因時發現這不是「守衛不夠嚴」的問題。`classify_from_eep` 把**沒有 EEP 當成
「判定為未分類」**，也就是把「沒有證據」讀成「證據顯示沒有」。而沒有 EEP 是**常態**：

| 書 | 事件 | 有 EEP |
|---|---|---|
| 大唐雙龍傳 | 62 | 12 |
| 名字的潮汐 | 47 | 47 |
| 其餘兩本 | 126 | **0** |

EEP 只在有人明確分析那個事件時才產生——上傳流程完全不產生（ingestion 五個步驟裡沒有
事件分析）。批次「一鍵生成全部 EEP」撞到 rate limit 會 `TaskAborted`，已完成的保留、
其餘不補；非配額的失敗則 `failed += 1` 繼續，**且不留清單**（與 B-072 同形）。
孤兒鍵實測 0 筆，所以與重跑 KG 造成的 id 漂移無關。

**兩個功能對「權重從哪來」的認知不一致**：`classify` 認為只有 EEP 算數，
`refine_with_llm` 用自己的 LLM 判斷寫回權重——而敘事頁把 `unclassified_event_ids`
**原封不動餵給 refine**（`NarrativePage.tsx:320`）。兩顆按鈕並排在同一個
`UnclassifiedBlock` 裡，對同一批事件的方向相反。按錯順序就把前一次的產出丟掉。

**修法**：沒有 EEP 但已帶 kernel/satellite 權重的事件**保留原權重**，只有兩者皆無的
才是 unclassified。`_would_wipe()` 隨之刪除——它存在的理由是防止全量覆寫，而全量
覆寫沒了。端點的 409 改為 `hits == 0`，語意從「這會毀掉東西」變成「這什麼都不會做」。

**行為改變一處**：EEP 全空的書按 classify 從 202（跑一個什麼都不做的 task）改為 409
（告訴使用者先跑事件分析）。自動觸發路徑不受影響——`get_kernel_spine` 走的是服務層。

**未做**：UI 那邊 classify 與 refine 並排且沒有說明彼此會互相覆蓋，屬文案／版面決定。

**原本記的「要決定的是門檻不是程式」**:
- 擋在哪？`hits < classified` 就擋（任何淨損失都擋）過於嚴格，正常補跑會被誤擋——
  新事件本來就還沒有 EEP
- 比較可能的形狀是：**只重寫有 EEP 的事件，沒有 EEP 的保留原權重**，讓 classify 從
  「全量覆寫」變成「增量更新」。那樣連守衛都不太需要了，但會改變 `unclassified_event_ids`
  的語意（現在它是「這次沒分到的」，改後是「從來沒分到的」）
- 若維持全量覆寫，至少要讓端點在有淨損失時回 409 並把數字寫進 detail，
  與現有 409 的文案一致

**不是整潔問題**: 《名字的潮汐》已經因為這條路徑掉過權重（見 B-091 走查紀錄），
現行守衛擋掉的是它的極端情形，不是全部。

**觸發時機**: 待排。E 敘事走查（2026-09-06）發現。

---


## B-097 NarrativeService 對 KG 的寫入從不落盤 ✅ 完成（2026-09-07）

**背景**: `classify_from_eep` / `refine_with_llm` / `analyze_temporal_order` 都會改
`Event.narrative_weight`、`narrative_weight_source`、`story_time`，但三者**都只改
`KGService.get_events()` 回傳的記憶體物件，從不呼叫 `self._kg.save()`**。
`api/main.py` 也沒有 lifespan/shutdown 的自動存檔。全檔 12 處 `self._kg.` 全是
`get_events()`。

**所以權重能不能活下來全看運氣**: 只有當同一個 process 裡稍後剛好有別人呼叫
`kg.save()`（`epistemic_state_service`、`link_prediction_service`、`temporal_pipeline`、
`ingestion`、`remove_by_document`）才會被順手寫出去。重啟後端就回到磁碟上的舊值。

**這與已寫下的宣告牴觸**: `_rebuild_structure_from_kg` 的 docstring 明說
「Event.narrative_weight is stored in the KG ... a NarrativeStructure that the cache
lost can be rebuilt from both」——把 KG 當成比快取更耐久的一側。實際上快取
（AnalysisCache，SQLite）才是落盤的那一側，KG 的權重是揮發的。

**實測 `var/knowledge_graph.json`（235 事件 / 4 本書）**:

| 觀察 | 數字 | 解讀 |
|------|------|------|
| `narrative_weight` | kernel 41、unclassified 194、**satellite 0** | 落盤過的只有某次剛好被別人 flush 出去的狀態 |
| `narrative_weight_source` | llm_classified 41、其餘 None | 與上面一致 |
| 帶 `story_time` 的事件 | **0** | `analyze_temporal_order` 的第 5 步（寫回 `story_time`）沒有任何一次落盤 |

**順帶得到一個鑑識指紋**: `classify_from_eep` 在「事件沒有 EEP」時只寫
`narrative_weight = "unclassified"`、**不動 `narrative_weight_source`**。所以被
B-096 那條路徑洗過的事件會留下 `(weight=unclassified, source=llm_classified)` 這組
矛盾的搭配。目前磁碟上 0 筆——洗白如果發生過，也跟著沒落盤。

**補充（2026-09-07，時間軸走查）—— 這一點會改變上面的決策**:
三個方法寫進 KG 的東西**價值不一樣**，不該一起處理：

| 寫入 | 讀者 |
|---|---|
| `narrative_weight` / `narrative_weight_source` | **多**：`get_kernel_spine`、`unraveling_manifest`、`_rebuild_structure_from_kg`、前端劇情骨幹 |
| `Event.story_time`（`analyze_temporal_order` 第 5 步） | **零**。全 repo 只有一個寫入點（`narrative_service.py:862`），唯一的「讀取」是 `kg_service_neo4j.py` 的序列化來回（存進去再取出來，不消費值）。**不進 API、不進前端** |

也就是說「故事時序」在這個 repo 有**兩套獨立實作**，只有一套有消費者：

- `TemporalPipeline` + `TimelineAgent` → `temporal_relations` + `Event.chronological_rank`
  —— 落盤了（實測 235 個事件有 99 個帶 rank），且被時間軸端點、`get_global_timeline`
  工具、建構概覽的 `chronological_rank` 節點消費
- `NarrativeService.analyze_temporal_order`（B-037 Genette）→ `Event.story_time`
  —— 沒落盤（本條目主旨），而且**就算落盤了也沒有人讀**

所以 `story_time` 這一項的正確處置多半不是「補上存檔」，而是**跟著它的
`StoryTimeRef` 一起移除**（#89 已經因為從未被填寫而拿掉它的 `absolute_time`，
剩下的 `relative_order` / `time_anchor` 是有人寫、沒人讀）。Genette 分析真正被
消費的產出是 `TemporalAnalysis` 快取裡的 `displacements`，那條路徑是活的。

**已完成（2026-09-07），分兩半處理，因為兩者的正確答案相反**:

**第一半 —— `narrative_weight` 補上落盤**。`classify_from_eep` 與 `refine_with_llm`
在權重真的改變時呼叫 `self._kg.save()`。用 diff 而非無條件：classify 每次進敘事頁
都可能被 `get_kernel_spine` 自動觸發，而「什麼都沒變」是常態，為了記錄「沒有變化」
重寫整份圖譜 JSON 是有成本無產出。存檔失敗只記 log 不讓任務轉紅（與 ingestion 一致）。
Neo4j 的 `save()` 是 no-op，所以雙後端都正確。

**第二半 —— `Event.story_time` 與 `StoryTimeRef` 移除**。它有一個寫入者、零讀者：
不進 API、不進前端，唯一再碰到它的是 Neo4j 序列化的來回。消費端讀的是
`Event.chronological_rank`（TemporalPipeline）與 `TemporalAnalysis.displacements`。
`analyze_temporal_order` 的第 5 步因此整段拿掉。OpenAPI 不受影響（domain model 未直接曝露）。

**原本記的「要決定的是存在哪一層」**:
- 在 `NarrativeService` 每次寫完就 `await self._kg.save()` —— 最簡單，但整份圖
  重寫一次 JSON，refine 逐事件迴圈裡呼叫會很貴（要改成迴圈結束後存一次）
- 或由呼叫端（router 的背景任務）負責存，與 B-046 修 rerun 時採的
  `_persist_step_output()` 同一形狀
- 或維持揮發，但把 `_rebuild_structure_from_kg` 的 docstring 與那條復原路徑一起改掉
  ——那條路徑正是建立在「KG 比快取耐久」這個現在不成立的前提上

**觸發時機**: 待排。E 敘事走查（2026-09-06）發現。

---


## B-101 前置頁排除數有兩套規則，而且不是同一條 ✅ 完成（2026-09-07）

**背景**: C 象徵走查（2026-09-06）。象徵詮釋只送正文與後記的證據給 LLM，前置頁
（版權頁、書名頁、目次）排除在外——這是 B-074 的修正，理由很硬：《名字的潮汐》
「海」的 13 筆出現有 5 筆是版權頁，而 prompt 只帶前 20 筆且依章節排序，所以那 5 筆
不只是「被包含」，它們是模型**最先讀到**的證據。

**問題不在排除，在於「排除了幾筆」被算了兩次**:

| | 規則 | 位置 |
|---|---|---|
| 後端 | **純位置**：`occ.chapter_number < first_body_chapter`（`first_body` = 最小的 body 章號） | `symbol_service.py:358` |
| 前端 | **角色優先**：`toc`/`preface`→front、`afterword`→back、`body`→body；**只有 `other` 與未宣告的角色**才落回位置 | `chapter_axis.ts:196` `buildSegmentMap` |

`_first_body_chapter()` 的 docstring 明寫「Deriving both from the same rule is what
makes `excluded_front_matter_count` equal the `front` count already on screen；
two rules would let the page say 5 while the backend dropped 4」——**擔心的正是這件事，
而兩邊本來就不是同一條規則。**

**畫面上那句話用的是前端那份**：`InterpretationHero.tsx:223` 的
「這個意象有 N 筆出現在前置頁（版權頁／書名頁），未列入詮釋證據」，N 來自
`signals.distribution.front`。後端算出來的 `excluded_front_matter_count` 隨 SEP 回傳，
而**前端沒有 SEP 的 client**，所以那個權威數字沒有任何讀者。

**現在不會錯，但那是編號碰巧**（2026-09-06 實測 4 本書）:

| 書 | 章號與角色 | 分歧 |
|---|---|---|
| 大唐雙龍傳 / Age of Fire / 3pigredhood | 全部 body，1..N | 無 |
| 名字的潮汐 | `-1: preface`、`0: toc`、`1..10: body` | 無 |

四本書的前置頁都編號 ≤ 0 而 `first_body` 都是 1，所以兩條規則**恰好**給出同一個答案。
**會分歧的形狀**：一個 `role=other`、章號 ≥ 1 但排在第一個 body 章之前的章節 ——
後端把它算進前置頁（證據被丟掉），前端算成正文（不計入警告）。那時畫面會說
「3 筆未列入」而實際丟掉 4 筆，正是 docstring 擔心的情境。

**已完成（2026-09-07）：讓前端讀後端的數字**（使用者決定）。

`SymbolOverviewItem` 新增 `excluded_front_matter_count`，用**與 `assemble_sep` 完全
相同的規則**計算（早於第一個 body 章）。語意搬得過去——SEP 是每個象徵一份，而
overview 的 item 也是每個象徵一份，數字掛在 item 上剛好對應。前端兩個出口
（`InterpretationHero` 的警告、`InterpretationCta` 的提示）都改讀它，不再自己從
`chapter_roles` 推。

**為什麼不能用 overview 現成的 `is_body`**：那是第三條規則。用「不是 body」來算會把
**後記**也算進去，而 B-074 立的線是「前置頁排除、後記保留」——版權頁的「臨海市」是
雜訊，但後記某一句可能是全書最清楚的象徵陳述。畫面會說「2 筆未列入」而 LLM 其實看了
其中一筆。測試把這條釘住了（哨兵實測改用 `is_body` → 2 紅）。

**三個測試**：前置頁出現被計入、後記不被計入、沒有 body 章時不排除任何筆數。

**順帶記下的兩個小事**（不另立條目）:
- **overview 的快取沒有版本閘門，SEP 有**。`SEP` 讀快取時比對 `assembled_by ==
  "symbol_service_v2"`，不符即重組；`SymbolOverview` 直接 `get_as` 收下。目前 3 筆快取
  的欄位都是新的，所以還沒咬到人，但手足之間這條保護是不對稱的
- **SEP 快取有 10 筆 `symbol_service_v1` 殘留**（共 11 筆）。版本閘門正確地忽略它們，
  但沒有人清

**觸發時機**: 待排。C 象徵走查（2026-09-06）發現。

---


## B-102 段落層 keywords 產得出來、送得出去，就是沒有存 ✅ 完成（2026-09-07）

**背景**: 閱讀頁 / document_service 走查（2026-09-06）。這條鏈的每一段都活著，
只有中間少一節：

| 環節 | 狀態 |
|---|---|
| 產生 | `feature_extraction/pipeline.py:141` `para.keywords = kws`，逐段抽 |
| 送進 Qdrant | 同檔 258–259 / 309–310，payload 帶 `keywords` 與 `keyword_scores` |
| **存進 SQLite** | **沒有。`paragraphs` 表沒有 keywords 欄位**（只有 embedding / entities / title_span / role） |
| 讀回來 | 三個 `Paragraph(...)` 建構點都不帶 `keywords` |
| API 回應 | `book_reader.py:260` `keywords=list(p.keywords.keys()) if p.keywords else []` |
| UI 渲染 | `ChunkCard.tsx:103` `{chunk.keywords.length > 0 && <KeywordTags …>}` |

**所以閱讀頁的 chunk 關鍵字標籤永遠不會出現**——從 SQLite 讀出來的段落，
`keywords` 恆為 `None`，回應恆為 `[]`，那個條件式恆假。屬 B-091 的第 3 種結局
（未接線的生產者：消費端活著但永遠讀到空值）。

**實測（2026-09-06）**: 《大唐雙龍傳》第 1 章 13 個段落，帶 keywords 的 **0** 個；
同一個載入路徑的 entities 有 9 個——證明不是載入壞掉，是那個欄位根本沒被存。

**成本沒有白花，別誤記**: 段落 keywords 會被 `_keyword_aggregator` 聚合成
**章節 keywords**，那份有存（`chapters.keywords_json`）也有顯示（`ChapterCard`）。
本環境 `KEYWORD_EXTRACTOR_TYPE=llm`（`token_usage` 有 1371 筆 `service='keyword'`），
但那些呼叫換到了章節層的產出，掉的只是段落層的細節。

**另一個連結**: Qdrant payload 裡的 `keywords` 唯一的讀取者是
`VectorService.search_by_keyword` —— **正是 B-098 掃出來的零呼叫者**。
也就是說段落層 keywords 目前在兩條路上都沒有讀者：SQLite 那條沒存，Qdrant 那條沒人查。

**已完成（2026-09-07）：存起來**（使用者決定）。`paragraphs` 加 `keywords_json`
欄位，走 `init_db` 既有的 migration 慣例（`ALTER TABLE ... ADD COLUMN`，失敗即視為
已存在）。**寫入兩處**（`save_document` / `replace_chapters`）、**讀取三處**
（`get_document` / `get_paragraphs` / `get_paragraphs_by_entity`）各補一次——少補任何
一條，畫面上就會是某些地方有標籤、某些地方沒有。四項測試把三條讀取路徑與
「沒抽過仍是 None」都釘住，哨兵驗過拿掉任一讀取會紅。

**既有的四本書仍是空的**：keywords 的產生點在 feature-extraction，要重跑那一步才會
有值。契約 #5 已註明這件事。

**`search_by_keyword` 的處置仍未決**（B-098 留下的候選）：Qdrant payload 那份
keywords 的唯一讀取者還是它，而它沒有呼叫端。這條與本題脫鉤了——SQLite 這側已經
自給自足。

**觸發時機**: 已執行。

---


## B-103 建構概覽的 Relations 節點顯示的是全庫計數，不是這本書的 ✅ 完成（2026-09-07）

**背景**: 任務儲存 / unraveling 走查（2026-09-07）。`GET /books/:bookId/unraveling`
是**per-book** 端點，頁面也是每本書一頁，但其中的 `kg_relation` 節點吃的是
`kg_service.relation_count` —— 那是 `self._graph.number_of_edges()`，**整個圖譜、
所有書一起算**。

```python
# unraveling_manifest.py:227
status=status_of(complete=relation_count_global > 0, partial=False),
counts={"relations": relation_count_global},
meta={"scope": "global"},
```

**`meta.scope` 沒有任何讀者**：前端 `BuildOverviewPage.tsx` 從不讀 `meta.scope`，
所以「這是跨書計數」這件事只存在於 payload 裡，畫面上看不到。

**兩個後果**:
1. **數字對不上**。實測 `var/knowledge_graph.json` 共 696 條 edge，分屬四本書
   （224 / 84 / 326 / 62）。每本書的建構概覽都顯示 **696**
2. **B-089 的同型問題**：一本剛上傳、還沒跑 KG 抽取的書，這個節點會直接是
   `complete`（因為別本書有 696 條）。B-089 修掉的正是「把從未執行的步驟標成完成」

**資料支援分書計數**：每條 edge 都帶 `document_id`（實測 696/696 都有）。

**為什麼不順手修**: `KGService` 沒有 per-book 的關聯計數方法——只有
`get_relations(entity_id)` 與全域的 `relation_count` property。要加一個就會動到
**雙後端介面**，NetworkX 與 Neo4j 兩邊都要實作，還要更新 B-048 建立的 27/27
parity 測試。那是一次獨立的小開發，不是走查順手能做的。

**已完成（2026-09-07）：改成分書計數**（使用者決定，取徹底的那條）。

`KGServiceBase` 新增抽象方法 `relation_count_for(document_id)`，NetworkX 與 Neo4j
各一份實作。**設計成 async 而非 property**：Neo4j 需要一次往返，NetworkX 從記憶體
即答、只是立刻 await ——沿用該檔既有的 `async_*` 慣例，但這次放在 base 上，兩邊都得實作。

**NetworkX 那份有一個坑**：關聯 id 是 edge 的 **key** 不是屬性，而雙向關聯存成兩條
邊、反向那條的 key 是 `<id>_rev`。直接數邊會把一個關聯報成兩個。剝掉後綴再數 distinct
才是「這本書有幾個關聯」。實測：全域 696 條邊 → 分書 203 / 69 / 259 / 55（合計 586），
差的 110 正好是 220 條 bidirectional 邊的一半。

`meta={"scope": "global"}` 隨之移除——它是為了標註那個全域計數而存在的，而前端從來
沒讀過它。

**測試**：三項——只數指定的書、沒有關聯的書是 0（**這正是舊版會誤報 complete 的
情境**）、雙向關聯只算一次。`test_unraveling.py` 的 mock 也從舊的全域 property 改為
新方法。

**觸發時機**: 已執行。

---


## B-104 兩個已完整實作的深度分析工具永遠註冊不進 chat agent ✅ 完成（2026-09-07）

**背景**: F chat / tools 走查（2026-09-07，讀 code 可查證的那一半）。

`tool_registry.get_chat_tools()` 共 23 個工具，其中 **21 個無條件註冊**，另外兩個
（`analyze_character`、`analyze_event`）是 `if analysis_agent is not None` 才加。
而**唯一的呼叫端 `ChatAgent.__init__` 從不傳這個參數** —— `deps.get_chat_agent()`
傳了 8 個 service，就是沒有 `analysis_agent`。所以那兩個工具在生產環境從未被建構過。

**它們不是 stub**（這是最容易誤判的一點）: `AnalyzeCharacterTool._arun` 呼叫真的
`AnalysisAgent.analyze_character()`、映射成 `CharacterAnalysisOutput`、有錯誤處理。
`deps.get_analysis_agent()` 存在，`main.py:249` 啟動時還會預熱它。**接線就是一行。**

**兩份文件把它們寫成未實作**，方向與現況相反:
- `docs/appendix/TOOLS_CATALOG.md` 標「❌ STUB / Phase 5 — needs domain knowledge」
- `tool_registry.py` 的註解寫「stubs excluded from chat」

兩處已於本次改為記錄實況。這是這輪少見的**反向漂移**：通常是文件比程式碼樂觀，
這次是文件比程式碼悲觀，於是一個做好的能力被自己的註解擋在門外。

**本輪走查自己踩過一次**: PR #80 為了消除重複，把 `analyze_character.py` 改成使用
`CharacterAnalysisOutput` —— 改的是一段**永遠不會執行**的程式碼。當時判定它是
「被手抄的來源」是對的，但沒有人發現那個工具根本註冊不進去。

**決定：接上去**（2026-09-07）。理由是使用者的：chat 沒道理問不了「分析這個角色」，
而功能本來就做好了。`deps.get_chat_agent()` 補上 `analysis_agent=get_analysis_agent()`，
`ChatAgent.__init__` 加一個選填參數轉給 registry。

**選填的條件分支保留**：沒有 `AnalysisAgent` 的呼叫端仍應拿到可用的工具組。

**補上守衛** `tests/tools/test_chat_tool_wiring.py`：registry 那端（給了 agent 就要加、
沒給就不加、其餘工具不受影響）與 `deps` 那端（AST 檢查 `ChatAgent(...)` 有傳
`analysis_agent`）各釘一次。拆掉任一端測試就會紅——實測過。deps 那條用 AST 而非
實際呼叫，因為 `get_chat_agent()` 會建起整條真的 service 依賴鏈。

**未做、留給有 langfuse 資料時再看**：ADR-008 訂了工具選擇準確率 >85% 的目標，
工具從 21 個變 23 個是否影響選擇正確率，沒有基線就無從判斷。深度分析每次呼叫的
token 成本也遠高於其他工具，目前唯一的節流是工具 description 的 DO NOT USE 段落。

**順帶記下（不另立條目）**: `get_all_tool_names()` 沒有任何呼叫端，只在
`tools/__init__.py` 被轉出一次。docstring 說它是「for documentation」，但沒有任何
文件產生流程用它。掃描器看不到它是因為那行 `from ... import` 在語法上就是一次引用
—— **轉出而無下游消費**是 B-098 修完之後仍然存在的一類盲點。

**這一塊還沒查完的部分**: 另外 21 個工具**結構上都進得去**（服務依賴在
`deps.get_chat_agent()` 全部有實例，25 個 args_schema 與 `_arun` 簽章全部對得上，
23 個工具名稱與 `get_all_tool_names()` 完全一致）。但「**實際被 LLM 選中過幾個**」
讀 code 查不出來，要看 langfuse / log —— 那半仍未做。

**觸發時機**: 待排。第 1 條路要先有 langfuse 資料才知道現有 21 個工具的選擇準確率
基線，否則加了工具也無從判斷是否變差。

---


## B-105 移除 10 個無呼叫端的 HTTP 端點 ✅ 完成（2026-09-07）

**背景**: `API_CONTRACT.md` 的「未納入契約的端點」表列了 10 個路由，標記為
**「已判定移除，另案執行」**——判定早就做過，只是沒人執行。本次執行。

| 檔案 | 移除 | 保留 |
|---|---|---|
| `documents.py` | 3 個（整檔刪除） | — |
| `entities.py` | 5 個 | `GET /entities/:entityId`（#24a，象徵頁的 `fetchEntityById` 在用）|
| `relations.py` | 2 個（整檔刪除） | — |

**移除不影響 chat agent**：那些端點與 `tools/graph_tools/` 下的工具是同一組
`KGService` 方法的兩個平行外殼，agent 走工具那條路直接呼叫 service，不經 HTTP。
移除前逐一確認過：外部對 `get_entity_relations` / `get_relation_paths` 等名稱的引用
全部指向**同名的 service 方法與 chat 工具**，不是 HTTP handler。

**連同清掉的殘骸**（移除的直接後果，不是順手整理）:
- response schema 7 個：`EntityListResponse`、`RelationResponse`、`TimelineEntry`、
  `SubgraphResponse`、`RelationStatsResponse`、`DocumentResponse`、`ParagraphResponse`
  ——移除後只剩「自己的定義 + `schemas/__init__.py` 轉出」，正是 B-104 記下的
  「轉出而無下游消費」那類掃描盲點
- `schemas/documents.py` 的 `ChapterResponse` 一併刪除：它與 `schemas/books.py` 的
  **同名 class** 並存，活的是後者（`book_reader` 用它）。同名並存本身就是誤刪的陷阱，
  所以刪前特地分辨了 4 處引用指向哪一個
- 測試檔 `test_documents.py` / `test_relations.py` 刪除，`test_entities.py` 裁到只剩
  留下的那個端點

**`generated.ts` 少 673 行**（重產）。

**契約那一節保留而非刪除**：`test_docs_drift.py::TestApiContractCoverage` 的兩條檢查
都以它為錨。內容改為「目前沒有」，並記下日後若又出現「存在但不打算支援」的路由，
列進來是一個刻意的動作。

**觸發時機**: 已執行。

---


## B-098 scan_dead_code 會把「自己 docstring 裡的提及」算成引用 ✅ 完成（2026-09-06）

**背景**: `scripts/scan_dead_code.py` 的 `refs()` 是對整份檔案文字做
`\b<name>\b` 計數，**沒有排除註解與 docstring**，只扣掉定義自身那一次。
所以一個符號只要在自己檔案的說明文字裡被提到一次，就永遠不會被判為零引用。

**這是偽陰性，與已記錄的偽陽性教訓互為鏡像**：B-091 記的是掃描器把活的判成死的
（i18n 模板前綴那次）；這次是把死的判成活的，而後者更難發現——沒有紅燈可看。

**實測差異**（把註解與字串 token 濾掉後重跑同一套邏輯）:

| 現行掃描器 | 濾掉說明文字後 |
|-----------|--------------|
| backend 符號 **1** | **3** |

多出來的兩個：

- `ConceptInferencePipeline`（已知，B-092）—— 當時它只活在別處的 docstring 裡，
  所以現行掃描器看不到它。**掃描器本來應該要能自己找到 B-092 的**
  （2026-09-10：B-092 已接線，這一筆不再是零引用；掃描器的缺口本身仍未補）
- `VectorService.search_by_keyword`（57 行）+ `_scroll_keyword` + `KeywordSearchResult`
  —— 全 repo 零呼叫者，唯一的其他提及是 `query_models.py:47` 的一句 docstring。
  手足 `VectorService.search`（語意檢索）有 5 個消費者，只有它沒有。
  `GetKeywordsTool` 走的是相反方向（給文件取關鍵字），不是它的消費者

私有常數同理：`_REFINEMENT_CONFIDENCE_THRESHOLD` 撐到現在就是因為
`refine_with_llm` 的 docstring 提了它一次。（該常數已於本次 E 走查移除。）

**修法**: `refs()` 計數前先用 `tokenize` 濾掉 `COMMENT` 與 `STRING` token。
實測整個 backend 跑得動，不需要另建索引。

**注意**: 濾掉之後 `search_by_keyword` 這類候選要照 B-091 的三種結局逐一走查，
**不可批次刪**。

**`VectorService.search_by_keyword` 的處置（2026-09-08）：刪除**（判定為第 1 種）。
三個理由，第一個是決定性的：

1. **它搜的不是文字，是關鍵字欄位**。`MatchValue(key="keywords")` 比對的是每段
   **最多 10 個抽取出來的關鍵字**，不是段落內文。使用者問「哪裡提到劍」，它只答得出
   「哪些段落的前 10 個關鍵字包含劍」——召回率天生很差
2. **真正的文字搜尋已經存在**：`DocumentService.search_paragraphs_by_text`，
   由 `routers/search.py`（搜尋頁）在用
3. **語意搜尋也已經存在**：`vector_search` 工具，chat agent 一直有。再加一個重疊的
   工具會直接影響 ADR-008 的選擇準確率目標（工具數剛從 21 變 23，見 B-104）

也就是說它夾在兩個更好的方案之間，能力比兩者都弱。連同 `_scroll_keyword` 與
`KeywordSearchResult` 一併移除，共 83 行。**掃描器候選 3 → 2**，剩下的兩個
（`get_fallback`、`ConceptInferencePipeline`）都有有效的暫緩理由。

**這也收掉了 B-102 留下的線頭**：Qdrant payload 裡的 `keywords` 從此無人讀取。
payload 要不要繼續帶它是另一題——它不佔 LLM 成本，寫入端也不需要為它多做事，
所以沒有一併處理。

**已完成（2026-09-06）**: `_code_only()` 以 `tokenize` 濾掉 COMMENT / STRING /
FSTRING_MIDDLE 後再計數。同一次順帶把**私有方法**納入掃描（原本 `startswith("_")`
整批跳過，那是 B-091 明列的未掃範圍）—— 啟用後整個 backend 0 筆，範圍就此掃清。
前端三支掃描刻意不動：要在 TS 精確剝掉註解與字串得有真的 parser，regex 版會被
regex literal、巢狀模板、註解裡的引號絆倒，而憑空生出偽陽性正是那份檔案要避免的事；
改為在模組 docstring 標明這個已知缺口。測試放 `tests/scripts/`（`scripts/` 不在
`pythonpath`，以 importlib 依路徑載入），6 項，哨兵實測會紅。

**觸發時機**: 已執行。留下的候選 `VectorService.search_by_keyword` 待逐一走查。

---


## B-075 全系統的 LLM fallback 鏈是壞的（假的 local model + placeholder 被當成已設定） ✅ 完成（2026-08-20）

**背景**: 2026-08-10 追 B-073 時查出。實際載入的設定：

```
primary   = gemini
openai    = True     ← OPENAI_API_KEY=your_openai_...（placeholder，但非空）
anthropic = True     ← ANTHROPIC_API_KEY=your_anthrop...（同上）
local     = '# e.g. qwen2.5:3b, llama3.2, phi3.5'   ← 行內註解被當成值
type      = RunnableWithFallbacks
fallbacks = ['ChatOpenAI:# e.g. qwen2.5:3b, llama3.2, phi3.5']
```

**兩個獨立缺陷**:

1. **`.env` 的 `LOCAL_LLM_MODEL=` 是空的，但行內註解被讀成值。**
   `_has_key(LOCAL)` 因此回傳 True，`get_with_local_fallback()` 掛上一個 model 名叫
   `# e.g. qwen2.5:3b...`、指向 `localhost:11434` 的 `ChatOpenAI`。

2. **`_has_key()` 只判斷非空，placeholder 字串照樣算「已設定」。**
   系統認為 OpenAI / Anthropic 兩家都可用，`get_fallback()` 會挑中一個必定 401 的 provider。

**影響範圍**: **15 個服務**全部走 `get_with_local_fallback()` —— chat_agent、
concept_inference、epistemic_state、extraction、narrative、imagery_extractor、
voice_profiling、keyword、tension、chapter_role_suggester、toc_parser、summary、
analysis、symbol_analysis、`deps.py`。也就是**全系統每一條 LLM 路徑**都掛著一個必定
失敗的 fallback。雲端一旦拋錯（rate limit / timeout / 斷線），就會多打一次註定失敗的
本地請求，最終浮上來的錯誤會被這一層污染。

（哪個 exception 最後勝出**尚未實測**，需要驗證後才能寫進修復方案。）

**與 B-073 的關係**: 這是 B-073 的**前置**。象徵路徑走 `get_with_local_fallback()`，
只串 cloud→local，而 local 是那個垃圾 —— 所以**光是把真的 OpenAI key 填進 `.env`，
「手」也不會被修好**，還會撞上第二道牆。

**另一個已修的前置**: 封鎖原本對 fallback 機制是隱形的 —— `with_fallbacks` 只在
**拋例外**時切換，而 langchain 遇到封鎖是回傳空 `AIMessage`。這點已由 B-073 Phase 1
在象徵路徑修掉（其餘 14 條路徑仍然如此，見 B-076）。

**根因（2026-08-10 查明）**: python-dotenv **只在 `#` 前面有值時才剝除行內註解**：

```
FOO=bar    # note   ->  'bar'
FOO=       # note   ->  '# note'      ← 註解變成值
```

不是 pydantic-settings 的問題，是上游 dotenv 的行為。因此**每一個**「空值 + 行內註解」
的設定都會載入成那段註解。

**波及範圍比 LLM 更廣**: `.env.example` 有 4 個設定是這個形狀，而消費端**全部用真值
判斷** —— 正是這個 bug 專門打穿的寫法：

| 設定 | 消費端 | 後果 |
|---|---|---|
| `LOCAL_LLM_MODEL` | `llm_client._has_key` | 假 fallback 掛上 15 個服務 |
| `QDRANT_API_KEY` | `vector_service.py:89` `or None` | 送垃圾 api-key 給 Qdrant |
| `LANGFUSE_BASE_URL` | `tracing.py:59` `if ...:` | 垃圾 URL 蓋掉正確預設 |
| `LOG_FILE` | `main.py:66` `Path(...)` | 嘗試建立檔名為 `# Optional log file path` 的日誌 |

**已完成（2026-08-10，commit `c218cb8`）**:
- `Settings.blank_out_orphaned_comments` —— `field_validator("*", mode="before")`，
  值若以 `#` 開頭一律視為空。只改 `.env` 不夠：`.env.example` 會把陷阱發給每個新
  開發者，而且下次再寫一個空值設定又會中
- `_is_configured()` 取代 `_has_key()` 的裸 `bool()`，排除 `your_*` placeholder
- `.env.example` 4 行、`.env` 2 行改為註解獨立成行
- `get_with_local_fallback()` **未改** —— `has_local` 一旦正確回報 False，它本來就
  回傳裸的 primary

**實環境驗證**: `local=''`、`qdrant_api_key=''`、openai/anthropic 判為未設定，
`get_with_local_fallback()` 回傳 `ChatGoogleGenerativeAI` 且 `fallbacks=[]`。
原本「全數失敗時哪個 exception 勝出」的疑問隨之消失 —— 已無 fallback 層可污染錯誤。

**~~剩餘待辦~~ 已完成（2026-08-20 複查）**:

原記「`Settings.has_*` 仍用裸 `bool()`，兩套判斷是漂移的溫床」—— 該收斂**已經落地**，
只是沒回頭更新本條目。現況：

- `config/settings.py:14` 的 `is_configured()` 是唯一判準，四個 `has_*` 屬性全部走它
- `core/llm_client.py:152` 的 `_has_key()` 已改為純委派 `Settings.has_*`，
  docstring 直接寫「Delegates to Settings so there is one answer, not two... They did, until B-075.」
- `.env` 的 `LOCAL_LLM_MODEL=` 已是乾淨空值，行內註解清除

實測載入：`local_llm_model=''`、`has_local_llm=False`、僅 `has_gemini=True`。

**本條目結案。**

---


## B-073 Gemini 對「手」的提示回報 PROHIBITED_CONTENT ✅ 完成（2026-08-10）

> **2026-08-10 已重新診斷。** 本條目原記為「LLM 輸出解析失敗（no_json_found）」，
> 指向 `output_extractor.py`。**該診斷是錯的**，extractor 沒有問題。原始錯誤訊息
> 本身就是被誤導的來源，詳見下方「為什麼會誤判」。

**實測結果**: Gemini 在 **prompt 層**就擋下請求，沒有回傳任何內容：

```
block_reason   = BlockedReason.PROHIBITED_CONTENT
content        = ''
usage_metadata = None
```

`langchain_google_genai` 遇到封鎖**不拋錯** —— 只印一行 warning（`Gemini produced an
empty response. Continuing with empty message`）後回傳空的 `AIMessage`。空字串流進
`extract_json_from_text()`，於是 `output_extractor.py:97` 誠實回報「找不到 JSON」。

**為什麼會誤判**: 錯誤訊息說的是 extractor 看得到的最後一層現象，不是原因。任何
provider 層的封鎖或空回應，在這套程式碼裡都會長成 `no_json_found`。

**實際影響範圍（原記載誇大）**: 《名字的潮汐》8 個已快取 SEP 逐一實測 ——
**7 個正常產出，只有「手」被擋**（海 / 血 / 沙 / 腳印 / 光 / 懷錶 / 戒指 皆成功）。
原本寫的「整頁完全無法產出」不成立。

**是誤判，不是內容問題**: 對「手」的 7 段 occurrence context 做 leave-one-out —— 拿掉
`[1]` 或 `[2]` **任一段**即通過，拿掉 `[3]`–`[7]` 任一段仍被擋。沒有單一「有問題的
段落」。文本是讀鹽、兄長溺斃、退潮的純文學敘事。這是分類器對中文文學文本的脆弱誤判。

**`safety_settings` 無效**: `PROHIBITED_CONTENT` 屬**不可設定**的核心政策封鎖，
`llm_client.py:194-199` 那四個 `HarmBlockThreshold.OFF` 蓋不到，調 threshold 沒用。

**與 B-074 無關**: 「手」的 7 段全在正文章節，不涉及前置頁污染。

**已完成（2026-08-10，commit `1e2ef06`）**:
- `_detect_block()` 在解析前辨識封鎖／空回應，拋 `SymbolInterpretationBlocked`
- 該例外刻意不是 `ValueError`／`KeyError`，tenacity 因此不再重試 —— 原本每個被擋的
  意象固定浪費 3 次呼叫
- 封鎖記錄寫入 `symbol_analysis_block:{book}:{imagery}`，成功時自動清除
- 詳見 `docs/plans/20260810-symbol-interpretation-block-record.md`

**Phase 2 已完成（`f98d4e6`）**: overview 疊加 `interpretation_block`；`analyze-all`
預設排除已被拒絕者並計入 `skipped`；`docs/API_CONTRACT.md` 已更新 #15i / #15j。

**Phase 3 已完成（3a `eb1366f` / 3b 見下方 commit）**: `SymbolSignals` 帶 `block`；
`interpretationAdvice()` 新增 **優先於 load 門檻** 的 `blocked` 判定 —— 這是「頁面把
最顯眼的推薦位給唯一產不出來的意象」真正被修掉的地方；側欄 BlockBadge；CTA 的
blocked 分支引用 provider 自己的標籤；批次勾選排除已被拒絕者。

**為什麼結案（2026-09-13 修正指向）**: 原記「真正的解法是可用的 fallback provider
—— 見 B-075」。**那個指標是錯的**：B-075 交付的是設定判準收斂（`is_configured()` 成為
唯一判準），不是補上 fallback provider。真正處理 fallback 的是 **B-099，結論「暫不實作」**
（一般使用者不會備多家 LLM key，前提不成立）。

所以本條目等的前提不會到來。工程面已完成——拒絕會被正確辨識、記錄、呈現、且不再重複
消耗配額；「手」在只有 Gemini 的環境下仍然產不出詮釋，那是既定限制，不是待辦。日後若
真的換／加 provider，重開新票，不必回頭改這裡。

**明確不做**: prompt 擾動重試（砍掉前一兩段證據再送）。雖然實測可通過，但會讓詮釋
根據哪些證據產出變得不確定。列為最後手段。

**觸發時機**: ~~Phase 2/3 接續進行；封鎖本身待 B-075~~ —— Phase 2/3 均已完成，
封鎖本身見上方「為什麼結案」。

---


## B-074 SEP 把前置頁文字當證據送進 LLM ✅ 完成（2026-08-10）

**背景**: 2026-08-08 實作象徵意象頁 D4/D6 時查證。設計稿聲稱「重新生成時將排除前置頁」，但後端沒有這件事：

- `symbol_service.assemble_sep()` 的 `occurrence_contexts` 收**全部**出現，沒有任何 segment 過濾（`symbol_service.py:334-346`）
- `symbol_analysis_service._build_prompt()` 取 `sep.occurrence_contexts[:20]`，而 occurrences 是 `ORDER BY chapter_number ASC`（`symbol_service.py:205`）

兩者相乘的結果：**前置頁是 LLM 最先看到的證據**。以《名字的潮汐》的「海」為例，13 筆出現有 5 筆在版權頁與書名頁（含 ISBN、印刷廠、譯者列表），這 5 筆排在 `[1]`–`[5]`，正文只從 `[6]` 開始。

**影響範圍**: 所有已生成的象徵詮釋，其證據綜述可能混入版權頁文字。「海」現有的詮釋就是在這個條件下生成的。前端的可信度扣分（`trust` 乘數）只影響**排序**，不影響送進 LLM 的內容 —— 這是兩件不同的事，之前被混為一談。

**當時前端的處置（已隨修復更新）**: `InterpretationCta` 與 `InterpretationHero` 在
`front > 0` 時顯示警告，當時說明前置頁文字**會**作為證據送入、且重新生成不會排除。
修復後兩句都改為陳述已排除。

**已完成（2026-08-10）**:
- `assemble_sep()` 排除正文之前的章節，保留後記 —— 與前端 `trust` 乘數同一條判準，
  所以後端回報的排除筆數會等於畫面上的 `front` 數（兩套判準會讓畫面說 5、後端排除 4）
- SEP 新增 `excluded_front_matter_count`，讓「已排除 N 筆」講得出真話
- `_SEP_ASSEMBLER_TAG` 升為 `symbol_service_v2`，**讀快取時比對版本**，不符即重新組裝。
  比在 `cache_invalidation.py` 加 pattern 好：那只在 re-run pipeline 時觸發，舊快取會一直
  留著繼續餵版權頁文字。自癒，不需清除腳本
- 前端警告文案改為陳述已排除（`cta.frontWarn` 與 `interpretation.frontMatterWarning`）
- `docs/API_CONTRACT.md` #15d 已更新

**實測驗證**:「海」的 v1 快取 context 章節為 `[-1,-1,-1,0,0,1,5,7,7,8,9,11,11]` —— 前 5 筆
確實全是前置頁，而 prompt 取 `[:20]` 按序，它們正好佔據 `[1]`–`[5]`。v2 排除這 5 筆。

**待決策（2026-09-13 結案：前提已消失，無事可做）**: 原記「全 DB 有一筆以受污染證據
生成的詮釋（「海」，`review_status = pending`，從未經 HITL 審核）」，並附一段 SQL 要刪
`symbol_analysis:8f18dd59-…:f6bef0f0-…`。**那筆資料早就不在了。**

`8f18dd59` 是《名字的潮汐》**誤刪重傳前的舊 id**（現為 `c4185113`，見 B-117）。2026-09-13
逐庫查證：

| 檢查 | 結果 |
|---|---|
| `analysis_cache` 的 `symbol_analysis:` 列 | **0 筆**（全表 12 筆，無此家族） |
| 五個 store 出現 `8f18dd59` | 全部 0 筆（僅 `token_usage.db` 留 50 筆歷史記帳） |
| `storysphere.db` 有無 interpretation 表 | 無——詮釋只存在 `analysis_cache` |

**也不是 B-117 清掉的**：那 17 筆的家族明細是 `character` 10 / `epistemic` 4 /
`narrative_structure` 2 / `symbol_overview` 1，不含 `symbol_analysis`。所以它在舊書被刪時
就一起沒了，時間點早於 B-117。

**不需要「重生」動作**：下次在象徵頁開「海」時會用 v2 assembler 現算，前置頁已排除。
刻意不主動觸發 LLM 重算——那要花 token，而要的結果（庫裡不留受污染詮釋）已經成立。

未做「以受污染證據生成」的標記：那需要在 `SymbolInterpretation` 記錄它消費的 SEP 版本，
為一筆 legacy 資料加一個 schema 欄位不成比例——如今那筆 legacy 資料也不存在了。

**觸發時機**: ~~B-073 修好之後~~ —— 該前提建立在「完全無法產出」的錯誤診斷上；
實際 8 個意象裡 7 個正常，gate 早已解除。2026-08-10 完成。

---


## B-111 `feature-extraction` 刪掉四個家族的快取，但它不重生那些 id ✅ 完成（2026-09-12）

**背景**: 2026-09-12 為修中文關鍵字（YAKE 無 CJK 斷詞器）重跑
`feature-extraction` 時實測撞見。B-108 當時已看出這裡有問題並寫下
「**留成獨立的一題**」，但**那一題從來沒有被開出來**——B-109 是 `location_id`、
B-110 是張力頁，都不是它。這張票補上。

**`_ORPHANED_CACHES` 的判準是什麼**: 模組 docstring 寫得很清楚——
「Keyed by entity or event id ... **The ids are regenerated**, so these entries
become unreachable」。刪除的理由是**讀不到**，不是**過期**。過期的歸
`_STALED_CACHES`（保留並回報）。

**事實一：`feature-extraction` 不重生任何 id。** 三路獨立證據：

| 證據 | 內容 |
|---|---|
| 靜態 | `pipelines/feature_extraction/pipeline.py` 全檔**零個** KG 參照 |
| 檔案 | 重跑（10:25:39）後 `var/knowledge_graph.json` mtime 仍是 09:58——沒被寫過 |
| 行為 | 重跑後把 `event:` / `character:` 快取列原樣寫回，`#6b` 照列、`#7a` 回 200——代表那些 id 在 KG 裡從頭到尾都在 |

所以 `event:` / `character:` / `epistemic:` 放在 `feature-extraction` 的
`_ORPHANED_CACHES` 底下，**判準不成立**：它們不是 unreachable，只是被刪了。

**事實二：但這些規則不是「多餘」的**——B-108 推測「那邊的規則多半是多餘的」，
這點要更正。`AnalysisService` 確實吃 `feature-extraction` 的產物：

| 分析 | 依賴 | 位置 |
|---|---|---|
| EEP（事件） | `_vector_service.search()` 取 text evidence | `analysis_service.py:789` |
| CEP（角色） | `_vector_service.search()` + `_keyword_service.get_entity_keywords()` | `analysis_service.py:471` / `:485` |
| Epistemic | **無**——`EpistemicStateService.__init__` 只收 `kg_service` / `llm` / `cache` | `epistemic_state_service.py:64` |

所以正確的分類不是「移除」而是**改判**：

- `event:{book}:%`、`character:{book}:%` → 它們**真的會隨重跑老化**（2026-09-12
  這次就是實例：關鍵字從整句變成詞，舊 CEP 是建立在已經不存在的關鍵字證據上），
  但老化的處置是 `_STALED_CACHES`，不是刪除。
- `epistemic:{book}:%` → 對 `feature-extraction` **完全沒有依賴**，這一條才是真正多餘的，應直接移除。
- `symbol_overview:{book}` → 維持刪除可辯護（docstring 的理由是「無人工輸入、
  重算只花一次組裝」），但它掛在此步驟的註記「Carries per-symbol event counts」
  同樣站不住腳——事件數在這一步不會變。

**實測代價**: 2026-09-12 對 `ageoffire` 重跑一次，刪掉 5 列仍然有效的快取——
2 筆事件分析、1 筆角色分析（林志豪）、2 筆 epistemic（Ch.1 / Ch.5）。全部是真金
白銀的 LLM 產出，事後由備份逐位元組還原。使用者沒有被詢問，也沒有被告知。

**卡住的地方（這題不是把兩行從一個 dict 搬到另一個就好）**: staleness 的**回報
路徑只存在於 book-keyed 家族**。`staleness()` 目前的消費者只有
`tension_service.py:659`、`narrative_service.py:660`、`book_timeline.py:277`，
全部是書級分析。把 `event:` / `character:` 搬進 `_STALED_CACHES` 會保住資料，
但沒有任何 UI 會說它過期了——使用者看到的是一份靜默的舊分析。要嘛一併補上
entity-keyed 家族的回報路徑（`#6b` 清單與 `#7d` 詳情各加一個 stale 旗標），
要嘛這題只做 `epistemic:` 的移除、其餘維持現狀並在文件寫明權衡。

**待辦內容**:
1. 從 `feature-extraction` 的 `_ORPHANED_CACHES` 移除 `epistemic:{book}:%`（無依賴，純多餘）
2. 決定 `event:` / `character:` 要不要改判為 stale，以及是否一併補 entity-keyed 的回報路徑
3. 更新 `cache_invalidation.py` 模組 docstring 與 B-108 留下的那段註解——目前那段說
   `feature-extraction`「never touches an Event」是對的，但沒說它其實供給了 EEP 的證據
4. 補測試：釘住「`feature-extraction` 重跑後 event/character 快取仍可讀」

**修正（2026-09-12）**:

1. `cache_invalidation.py` 改判——`event:` / `character:` 從 `_ORPHANED_CACHES`
   移到 `_STALED_CACHES`；`epistemic:` 兩份 map 都不列。模組 docstring 原本把
   「用 entity/event id 當鍵」等同於「一定刪除」，改寫成以步驟為準。
2. **第四個家族**: 寫票時漏了 `teu:`。`ingestion.py` 原本在 feature-extraction
   也收 TEU keys（B-108 補上 knowledge-graph 時沒把舊的拿掉），而 TensionService
   只收 cache、TEU 由事件組成，同樣零依賴。已一併移除。
3. **回報路徑**（這題卡住的地方，已一併做完）: #6a / #6b / #7a / #7d 各加
   `is_stale` / `stale_reason`，判斷交給既有的 `staleness()`。守衛抽成
   `_book_shared.analysis_staleness()`——兩個清單端點的 `except` 會把項目移進
   unanalyzed、角色詳情的 `except` 會變成 404，所以 staleness 在那些位置丟例外
   不會顯示成錯誤，而會靜默地把「有這份分析」改寫成「沒有」。
4. 前端兩頁顯示「證據已更新」徽章，清單列以 info 色圓點標示。`--color-info`
   為既有 token，未新增。
5. 型別接回 generated：`CharacterAnalysisDetail` / `EventAnalysisDetail` /
   `ArchetypeDetail` 原本手寫在 `types.ts`。

**五項既有測試在釘住舊行為**，全部改判準並在 docstring 寫明理由，另補 13 項守衛。
其中 `test_teu_keys_collected_before_events_are_regenerated` 把 feature-extraction
的 pipeline mock 成會替換事件——那是該步驟做不到的事，改由 knowledge-graph 驅動。

**孤兒清理**: `CepData` / `ArcSegment` / `EventEvidenceProfile` 的唯一引用者就是那兩個
改為別名的 detail 型別，因此失去使用端。經全 repo 掃描確認後刪除——前端零殘留、無
barrel re-export、無命名空間匯入（兩者都會讓具名搜尋失效），`generated.ts` 的命中是
`ArcSegmentResponse` 的子字串而非引用。`ParticipantRole` / `CausalityAnalysis` /
`ImpactAnalysis` 不連帶：`EventAnalysisDetail.tsx` 直接使用它們。其餘命中全在後端
Python（`analysis_models` 的同名 Pydantic model，不同語言不同符號）與文件
（`API_CONTRACT.md` 在自己的 ts 區塊裡宣告，不依賴 `types.ts`）。

---

## B-046 建構概覽：節點「觸發建構」CTA 對接 pipeline endpoint ✅ Phase 1 完成（2026-08-11）
**背景**: 2026-05-26 的 Direction A · Diagnostic Dashboard 重設計在「status ≠ complete 且無 blockers」時規劃了帶具體動作文字的主色 CTA，但一直以 disabled 灰按鈕（「觸發建構功能規劃中」）占位，pipeline 未接。

**先修的既有 bug**: `POST /books/:bookId/rerun/:step` 的背景協程 `_run_rerun_step` 只呼叫 `update_pipeline_status`，沒有 `save_document`。`SummarizationPipeline` / `FeatureExtractionPipeline` 是就地修改 `Document`、不碰 SQLite（落盤是 workflow 的責任，見 `ingestion.py` 兩處 `save_document`），所以補跑 summarization / feature-extraction 會照呼叫 LLM、照計費，產物卻隨 request 結束消失，只有 `pipeline_status` 被標成 done。CTA 的前兩個節點正好踩在這上面，故一併修掉：
- 新增 `_DOC_MUTATING_STEPS`（`summarization`、`feature-extraction`）與 `_persist_step_output()` helper
- **失敗路徑也存**：summarization 會跳過已有摘要的章節，把 rate-limit 中斷前完成的部分存下來，才是下次補跑能「續跑」而非重跑的前提
- 存檔失敗只記 warning 不讓 task 轉 error（與 ingestion workflow 一致）
- `knowledge-graph` / `symbol-discovery` 刻意不存：產物寫進 KG / symbol store，重寫整份 chapter/paragraph row 是有成本無效果

**前端實作**（`BuildOverviewPage.tsx`）:
- `NODE_TO_TRIGGER` 對照表（與既有 `NODE_TO_ROUTE` 同層），`TriggerDef = { run, dropsDerived }`
- 觸發全部復用既有端點：`rerunStep`（summaries / keywords / symbols / kg_*）、`triggerBatchEntityAnalysis`（cep、character_analysis_result）、`triggerBatchEventAnalysis`（eep、causality_analysis、impact_analysis）。CEP 與 character_analysis_result 回報同一組計數、同一次批次產出，故共用 trigger
- 確認視窗用既有 `ConfirmDialog`；`dropsDerived` 的 run（三個 rerun step）額外加一句「既有分析結果將被刪除」——只講 token 不足以描述 `invalidate_for_steps` 的後果
- 輪詢用既有 `useTaskPolling`，不自己寫遞迴 poll
- **running 狀態用推導而非另存 state**：taskId 保留、由 `task.status` 判斷是否仍在跑。清掉 taskId 會讓輪詢查詢無法回報結束方式，且 `setState` in effect 會觸發 `react-hooks/set-state-in-effect`
- `<NodeDetail key={selectedNode.nodeId}>`：不加 key 的話切換節點時 CTA state 會殘留，A 節點的執行中狀態會顯示在 B 節點上
- 未接的節點（`teu`、`voice_profile`、`chronological_rank`、`narrative_structure` 等）維持原本的 disabled 占位

**刻意不接 `narrative_structure`**: `POST /narrative/classify` 對已失去 event EEP 快取的書會覆寫 KG 的 kernel 權重（《名字的潮汐》已受影響）。這種副作用不適合放在一鍵 CTA 後面。

**i18n**: `unraveling.cta.*`（zh-TW + en）——`node.<nodeId>.{partial,empty}` 每個節點兩句具體動作，`generic.*` 作為 `defaultValue` fallback，`confirm.*` 四句組成確認視窗文案（ConfirmDialog 用單一 `<p>` 渲染，故以連續句子而非換行組合）。

**實作**: `backend/storysphere/api/routers/books.py`、`frontend/src/pages/BuildOverviewPage.tsx`、`frontend/src/i18n/locales/{zh-TW,en}/analysis.json`

**測試**: `tests/api/test_books_rerun.py` 新增 `TestRerunPersistsDocumentOutput`（5 tests — 兩個 doc-mutating step 各驗成功與失敗都落盤、兩個非 doc step 不重寫、存檔失敗不讓 task 轉 error）

**驗證**: 真實 app 走過四種狀態——active CTA（cep「分析全書角色」）、`dropsDerived` 確認文案（kg_event）、blocker 版（teu）、無端點占位版（voice_profile）；並用 playwright route mock 驗 POST → 輪詢 → done 後 invalidate `['buildOverview', bookId]` 的完整接線與錯誤訊息呈現，未實際消耗 token。

---

## B-076 provider 封鎖／空回應在 30+ 個呼叫點都會偽裝成解析失敗 ✅ 完成（2026-08-10）

**背景**: 2026-08-10 追 B-073 時發現。B-073 的根因不是象徵路徑特有的 ——
`response.content` 直接餵給 `extract_json_from_text()` 的寫法遍及全專案：

`analysis_service`（8 處）、`tension_service`（3）、`narrative_service`（3）、
`epistemic_state_service`（2）、`timeline_agent`、`concept_inference`、
`voice_profiling_service`、`imagery_extractor`、`keyword_service`、`toc_parser`、
`chapter_role_suggester`。

任何一條路徑遇到 provider 封鎖或空回應，都會回報 `no_json_found` 或
`both_parse_failed`，而不是真正的原因。角色 / 事件 / 張力分析若曾出現這類錯誤，過去的
判斷可能都指錯了方向。

**已完成**: 象徵路徑已於 commit `1e2ef06` 修正（`_detect_block()` +
`SymbolInterpretationBlocked`），可作為其餘路徑的參考實作。

**已完成（2026-08-10）**:
- `core/error_handling.py` 新增 `LLMResponseBlocked` / `raise_if_blocked()` / `llm_text()`
  —— 與既有的 `is_rate_limit_error()` 同一個模組，都是 provider 錯誤分類，不另立新模組
- **24 處**呼叫點改用共用版（原估 20 處；`extraction_service` 與 `summary_service` 另有
  4 處不走 extractor，同樣會吞掉封鎖）
- 象徵路徑刪除本地的 `SymbolInterpretationBlocked` / `_detect_block`，改用共用版

**兩個實作時才浮現的差異**:

1. **封鎖與空回應必須分開。** 封鎖是確定性的（同一個 prompt 每次都被拒），空回應不是。
   `SummaryService` 對空摘要**刻意重試**，一律換成不可重試的例外對它是退步。因此拆成
   `raise_if_blocked()`（只管確定性的那半）與 `llm_text()`（兩者都管），summary 用前者。
2. **metadata 必須先確認是 mapping。** `MagicMock.get()` 回傳另一個 MagicMock 而非 None，
   天真讀取與「有 block_reason」無法區分 —— 這會讓套件裡每個用 MagicMock 模擬 LLM 的測試
   全部誤判成封鎖（實際踩到 33 個）。真實 provider 附帶的 metadata 形狀也本來就不一。

**維持降級語意**: `toc_parser` / `chapter_role_suggester` 仍是 `logger.warning` 後降級，
只是 log 現在講真正的原因，不再指控 JSON extractor。

---

## B-077 語言顯示名查表大小寫敏感（`zh-TW` → 「Respond in Zh.」）✅ 完成（2026-08-10）

> **2026-08-10 更正：生產路徑沒有這個問題。** 原記載說「傳入 `zh-TW` 回傳簡體」——
> 那個 `zh-TW`（大寫）是**驗證腳本自己寫死的**，不是系統會傳的值。DB 存的是小寫
> `zh-tw`，`get_document_language()` 原樣回傳，查表得到 "Traditional Chinese"。
> 以生產路徑實測，輸出確為繁體。

**但查表本身是個真陷阱，已一併修掉**:

`get_language_display_name()` 原本大小寫敏感，且 fallback 是
`lang_code.split("-")[0].capitalize()`。因此任何**大寫或帶未知地區碼**的值都會落空：

```
zh-TW -> 'Zh'      zh-CN -> 'Zh'      zh-hk -> 'Zh'
```

結果不是報錯，而是 prompt 變成一句沒有意義的「**Respond in Zh.**」，模型只能猜。
影響 12 個模組、28 個呼叫點。

**這類 bug 咬過一次**: `tests/core/test_language_detection.py` 早有
`test_bare_zh_maps_to_chinese_not_capitalized_code`，註解就寫著「the meaningless prompt
directive "Respond in Zh."」。當時的修法是往表裡補 `zh` 條目，沒動查表邏輯；而
`test_zh_tw_maps_to_traditional_chinese` 只用小寫問，**測試自己選的大小寫讓大寫變體活了下來**。

**已完成（2026-08-10）**: 查表改為大小寫不敏感；未知地區碼回退到基礎語言而非代碼本身
（`zh-hk` → Chinese、`en-GB` → English）。新增大小寫與地區回退的測試。

---

## B-049 累積 Lint 債清理（ruff + eslint） ✅ 完成（2026-07-01）

**背景**: refactor/lightweight 分支長期未跑 lint 清理，合併前盤點發現 `ruff check src/` 有 194 個錯誤（154 個 `--fix` 可自動修，含 I001 import 排序、F401 unused import、F841、B905、E741 等）、前端 `eslint src` 有 39 個錯誤（react-refresh/only-export-components、set-state-in-effect 等）。皆為既有風格債，不影響正確性，故與扶正 main 的合併解耦、獨立處理。

**進度（2026-07-01，全部完成）**:
- ✅ 後端 ruff：194 → **0**（`chore/lint-cleanup`）
- ✅ 前端 eslint 安全子集：39 → **20**（`chore/lint-cleanup`）
- ✅ 前端 react-hooks 高風險 20 個 → **0**（`chore/lint-react-hooks`）
  - `refs ×1`：`onDoneRef.current` 移進 `useLayoutEffect`
  - `exhaustive-deps ×4`：`?? []` 表達式改用 `useMemo` 包覆
  - `set-state-in-effect ×11`：task-polling / DOM-measurement effects 加 eslint-disable block comment
  - `preserve-manual-memoization ×2`：移除 `cardRef` 的 `useCallback`；`sortedEvents` 改用中間變數
  - `immutability ×2`：重構 `useWebSocketChat` deps 後自然消失
- ✅ 驗證：`npm run lint` → 0 problems

---

## B-043 閱讀頁：欄 2 章節搜尋 ✅ 完成（2026-05-14）
**背景**: 欄 2 章節列表為純線性排列，用戶記得角色或關鍵詞但不記得章節時摩擦極高。
**實作**:
- `ReaderPage.tsx`：`searchQuery` state + `useMemo` filter（title / topEntities[].name / keywords）
- 欄 2 結構改為 `flex flex-col`，搜尋欄 sticky、章節列表獨立 scroll
- 選章節時自動清空搜尋（`handleSelectChapter` 內加 `setSearchQuery('')`）
- 結果為空時顯示 empty state（i18n `searchEmpty` key）
- `BezierConnectors`：`chapterCount` prop 改為 `chapterKey`（filtered id 串接字串），確保過濾後 DOM 重算
- Opus review 後修正：`e.name?.` null guard、Rules of Hooks（useMemo 移到 early return 前）

---

## B-044 閱讀頁：EpistemicSidePanel 入口可發現性優化 ✅ 完成（2026-05-14）
**背景**: Brain icon 按鈕無文字說明，功能完全不可發現；`title` tooltip 在行動裝置不顯示。
**實作**:
- Brain button 加常態文字標籤（`角色視角` / `收起`），`minWidth: 5rem` 防寬度跳動
- 首次進入 onboarding popover：`localStorage` flag `storysphere:reader-epistemic-hint-shown`，5 秒 auto-dismiss 或點擊消失，z-index 20
- `EPISTEMIC_HINT_KEY` 提取為 module 層級常數（防 magic string 重複）
- localStorage 讀寫均加 try/catch（Safari 隱私模式防護）
- useEffect timer 內 inline dismiss 邏輯（避免 stale closure lint 警告）
- 新增 i18n key：`epistemicLabel`、`epistemicClose`、`epistemicHint`（zh-TW + en）

---

## Wave 1 — 底層基礎建設 ✅ 全部完成（2026-04-28）

### F-02 進度感知 KG（章節時間切片）✅ 完成（2026-04-24，commit `4be9613`）
**分類**: 底層基礎 — Wave 1 核心

**已實作內容**:
- Domain: `Entity` / `Relation` / `Event` 新增時態欄位（`valid_from/to_chapter`, `chron_index`）；新增 `TimelineConfig` / `TimelineDetectionResult` model
- `KGService.get_snapshot(mode, position)` — 支援 chapter 模式與 story chronology 模式
- `TemporalPipeline` Step 8 分配 `chron_index`，回填 `Entity.first_chron_index`
- Ingestion 自動偵測章節結構，建立 `TimelineConfig`
- API: `GET /graph?mode=&position=`、`GET/PUT /timeline-config`、`POST /detect-timeline`
- 前端: `TimelineControls`（浮動面板，debounced slider）、`TimelineConfigModal`（confirm dialog）
- `GraphPage` + `UploadPage` 已整合

**解鎖**: F-03、F-05（What-If）、F-12（閱讀記憶）、F-13（Role Agent）

---

### F-01 隱性關係推論（KG Link Prediction）✅ 完成（2026-04-27）
**分類**: 加分項（無硬依賴）

**已實作內容**:
- Domain: `InferredRelation`（含 `visible_from_chapter`、`confidence`、`status`）
- `LinkPredictionStore`：aiosqlite SQLite 持久化
- `LinkPredictionService`：Common Neighbors + Adamic-Adar 算法，規則型關係分類，confirm/reject 流程
- API: `POST /inferred-relations/run`、`GET /inferred-relations`、`POST .../confirm`、`POST .../reject`
- `GET /graph?include_inferred=true`：推斷邊以 `inferred=true` 附加，快照過濾時使用 `visible_from_chapter`
- 前端：Cytoscape 虛線邊（amber 色）、GraphToolbar Toggle、`InferredEdgePanel`（確認/否定 UI）
- **注意**: Neo4j 支援缺口仍追蹤於 B-048（原 B-035，2026-06-30 重編以解除與本檔「坎伯英雄旅程」B-035 的撞號）

---

### F-03 角色認識論狀態 ✅ 完成（2026-04-25，commit `4729861`）
**分類**: 底層基礎 — Wave 1 核心

**已實作內容**:
- EventNode 新增 `visibility: Literal["public", "private", "secret"]` 欄位
- `backend/storysphere/services/epistemic_state_service.py`：計算角色認識論狀態
- Domain Model：`CharacterEpistemicState`（known_events, unknown_events, misbeliefs）
- API 端點：`GET /books/:bookId/entities/:entityId/epistemic-state?up_to_chapter={N}`

**解鎖**: F-05（What-If 約束）、F-10（敘事視角分析）、F-13（Role Agent 認識論邊界）

---

### F-04 角色語音側寫（Voice Profiling）✅ 完成（2026-04-25）
**分類**: 底層基礎 — Wave 1

**已實作內容**:
- `backend/storysphere/domain/voice.py`：`VoiceFingerprint` Pydantic model（定量指標 + LLM 質性描述 + 代表性引文）
- `backend/storysphere/services/voice_profiling_service.py`：用 Qdrant 語意搜索 + 量化特徵提取 + LLM 質性描述
- API 端點：`GET /books/:bookId/entities/:entityId/voice`（同步，SQLite cached）
- 前端：角色詳情面板新增「Voice Profile」tab（展示指紋 + 代表性引文）

**解鎖**: F-10（敘事視角）、F-13（Role Agent 對話風格約束）

---

## B-040 符號深度分析（Symbol Deep Analysis）✅ 完成（2026-04-22）
**背景**: B-022 SEP 完成後的下一層 — 以 SEP 為輸入，LLM 產出符號意義命題與跨層連結。架構類比 B-027~B-029（TensionLine → TensionTheme）與 B-026（CEP → CharacterAnalysisResult）。

**內容**:
- `domain/symbol_analysis.py` 新增 `SymbolInterpretation` — 欄位：`theme` / `polarity`(positive|negative|neutral|mixed) / `evidence_summary` / `linked_characters` / `linked_events` / `confidence` / `review_status`(pending|approved|modified|rejected)
- `services/symbol_analysis_service.py` — `SymbolAnalysisService.analyze_symbol(imagery_id, book_id, ...)` cache-first，讀取 SEP → LLM 詮釋 → 存入 `symbol_analysis:{book_id}:{imagery_id}`；`update_interpretation_review()` 支援 HITL
- `agents/analysis_agent.py` — `AnalysisAgent.analyze_symbol()` 入口，async task + metrics tracking
- API endpoints：
  - `POST /api/v1/symbols/{imagery_id}/analyze` → 202 + task_id
  - `GET  /api/v1/symbols/{imagery_id}/analyze/{task_id}` 輪詢
  - `GET  /api/v1/symbols/{imagery_id}/interpretation?book_id=` 取回詮釋
  - `PATCH /api/v1/symbols/{imagery_id}/interpretation` HITL review（可修改 theme/polarity）
- Unraveling DAG：Layer 3 新增 `symbol_analysis_result` 節點，edges `sep→` / `kg_entity→` / `kg_event→`；cache.count_keys 統計 `symbol_analysis:{book_id}:%`

**關鍵設計**:
- LLM 產生的 `linked_characters` / `linked_events` 必須在 SEP 的 `co_occurring_*_ids` 白名單內，超出範圍會被過濾（防幻覺）
- `confidence` clamp 到 [0.0, 1.0]；`polarity` 強制四選一，非法值 fallback 到 `"neutral"`
- tenacity retry 3 次（ValueError / KeyError），透過 `extract_json_from_text` 容錯 LLM 輸出
- 跨書比較（optional）延後評估，複雜度高

**實作**: `backend/storysphere/domain/symbol_analysis.py`（SymbolInterpretation）, `backend/storysphere/services/symbol_analysis_service.py`, `backend/storysphere/agents/analysis_agent.py`（analyze_symbol）, `backend/storysphere/api/routers/symbols.py`（analyze/interpretation endpoints）, `backend/storysphere/api/routers/unraveling.py`（symbol_analysis_result node）

**測試**: `tests/services/test_symbol_analysis_service.py`（9 tests — cache hit/miss/force、LLM ID 過濾、confidence clamp、polarity 校驗、HITL review）、`tests/api/test_symbols.py`（新增 analyze/interpretation/review 測試）、`tests/api/test_unraveling.py`（加入 `symbol_analysis_result` 到 expected nodes）

---

## B-008 Neo4j Backend ✅ 完成
**背景**: ADR-009 設計為 NetworkX（預設）↔ Neo4j（大規模可選），`kg_mode='neo4j'` 有 settings 但未實作。
**內容**:
- `KGServiceBase` ABC 定義 16 個抽象 method
- `Neo4jKGService` 使用 neo4j async driver v6（`properties(r)` 取代 `.data()` 序列化 tuple bug）
- Runtime 切換：`POST /api/v1/kg/switch`，清除 lru_cache，不需重啟
- 雙向遷移：`POST /api/v1/kg/migrate`（nx↔neo4j），async task + task_store 追蹤
- `GET /api/v1/kg/status` 顯示目前 backend、counts、連線狀態
- 前端 `/settings` 頁面：mode toggle、stats、migration 進度
- books.py 移除 `kg._graph` 直接存取，改用公開 API

**注意事項**:
- neo4j driver v6：`result.data()` 將 relationship 序列化為 tuple，需用 `properties(r)` in Cypher
- Pydantic `to_camel` 對 `neo4j_*` 欄位會產生 `neo4J*`（數字後大寫），改用 `graph_db_*` 命名迴避
- 前端型別必須用 `npm run gen:types` 生成，避免手寫欄位名錯誤

**實作**: `backend/storysphere/services/kg_service_base.py`, `kg_service_neo4j.py`, `kg_migration.py`; `backend/storysphere/api/routers/kg_settings.py`; `frontend/src/pages/SettingsPage.tsx`

---

## B-001 Relations Router（API 層遺漏）✅ 完成
**背景**: Phase 8 guide 有規劃但未實作
**內容**:
- `GET /api/v1/relations/paths?source_id={id}&target_id={id}` — 兩實體間關係路徑
- `GET /api/v1/relations/stats?entity_id={id}` — 全圖關係統計（entity_id 可選）

**實作**: `backend/storysphere/api/routers/relations.py`，已掛載至 `main.py`

---

## B-002 Documents Router（API 層遺漏）✅ 完成
**背景**: 架構圖有 Card Details，但沒有文件查詢 API
**內容**:
- `GET /books` — 列出已 ingest 的書籍
- `GET /books/:bookId` — 書籍詳情（含 chapters 列表）

**實作提示**: 呼叫已有的 `DocumentService.list_documents()` 和 `get_document()`
**備註**: 前端已對齊 `API_CONTRACT.md` 的 `/books` API（2026-03-15 重構完成）

---

## B-003 TaskStore 持久化（多進程安全）✅ 完成
**背景**: 目前 `api/store.py` 是 in-memory dict，多 worker (`uvicorn --workers 4`) 時 task 狀態會丟失
**實作**: `SQLiteTaskStore`（WAL mode）+ 啟動時自動清理 TTL 過期 task
**設定**: `task_store_backend`, `task_store_db_path`, `task_store_ttl_days`（預設 30 天）

---

## B-004 Langfuse 監控整合 ✅ 完成
**背景**: 改用 Langfuse（支援自託管）替代 LangSmith
**實作**:
- `backend/storysphere/core/tracing.py` — `configure_langfuse()` + `get_langfuse_handler()` singleton
- `backend/storysphere/agents/chat_agent.py` — `ainvoke`/`astream` 注入 `CallbackHandler`
- `backend/storysphere/agents/analysis_agent.py` — `@_langfuse_observe` 取代 `@traceable`
- Settings: `langfuse_enabled`, `langfuse_public_key`, `langfuse_secret_key`, `langfuse_base_url`
- **文件**: `docs/guides/LANGFUSE_SETUP.md`

---

## B-005 Analysis WebSocket 推送 ✅ 完成
**背景**: ADR-004 設計是 task_id → **WebSocket 主動推送**結果，目前只實作了 polling
**內容**:
- `WS /ws/tasks/{task_id}` — 客戶端訂閱 task_id，server 主動推送 TaskStatus 更新
- `api/ws_manager.py` — ConnectionManager singleton（task_id → list[WebSocket]）
- background task 在 running / done / error 時呼叫 `manager.push()`
- 連接後立即回傳目前狀態；若已 done/error 則直接關閉；進行中每 30s 送 ping

---

## B-006 Metrics API 端點 ✅ 完成
**背景**: Phase 7 `MetricsCollector` 收集了 7 個 KPI，但無法從外部查詢
**內容**:
- `GET /api/v1/metrics` — 回傳 `MetricsCollector.get_stats()` 的快照
- 可選：`GET /api/v1/metrics/history` — 近 N 筆 JSON-line logs（略過，MetricsCollector 未維護 rolling buffer）
**實作**: `backend/storysphere/api/routers/metrics.py`，直接呼叫 `get_metrics().get_stats()`

---

## B-007 多語系 `language` 參數統一傳遞 ✅ 完成
**背景**: CORE.md 多語系策略：透過 `output_language` 參數控制，但 API / Chat Agent 層未統一傳遞
**內容**:
- Chat WebSocket 訊息加入 `language` 欄位（預設 `"en"`）
- `ChatAgent.chat()` / `astream()` 接受 `language` 參數並注入 system prompt
- 同步查詢 API 加入 `?language=zh` query param（影響 summary 等文字輸出）
**備註**: `ChatState.language` 持久保留 session 語言；entity analyze endpoint 加 `language` query param 並傳給 `AnalysisAgent`

---

## B-009 GetChapterSummaryTool 完整實作 ✅ 完成
**背景**: CORE.md 工具目錄 Tool #15 目前是 stub
**內容**: 實作完整邏輯（目前 `DocumentService.get_chapter_summary()` 已存在，接線即可）
**備註**: `chapter_number` 為必填（與 GetSummaryTool 的可選設計不同），已加入 `get_chat_tools()` 作為第 6 個 Retrieval Tool

---

## B-010 Composite Tool #5 ✅ 完成
**背景**: CORE.md 設計 3-5 個 composite tools，目前只有 4 個
**實作**: `GetEventProfileTool` — 輕量級 no-LLM 事件資料聚合器（事件屬性 + 參與者 + timeline context + 段落 + 章節摘要）

---

## B-013 LLMKeywordExtractor 回傳解析強化 ✅ 完成
**背景**: 本地小模型（3B）回傳 JSON 不穩定，`_parse_response` 目前有三個脆弱點：
1. 只處理 ` ``` ` 開頭的 markdown fence，若 LLM 在 JSON 前加說明文字（如 `Here are the keywords:\n{...}`）直接 `JSONDecodeError`
2. 不嘗試從回傳內文中抽取 `{...}` substring，整段不是合法 JSON 就失敗
3. `retry` 只重試 `JSONDecodeError / ValueError / KeyError`，LLM API 錯誤不觸發 retry

**修法**: 在 `_parse_response` 加 regex 抽取第一個 `\{.*\}` block（`re.search(r'\{.*\}', content, re.DOTALL)`）再 parse

**相關檔案**: `backend/storysphere/services/keyword_service.py` — `LLMKeywordExtractor._parse_response()`

---

## B-015 Chat Agent Prompt & Flow Review ✅ 完成
**背景**: Chat Agent 目前會直接傾倒工具原始輸出，未根據使用者問題整理回應。已加 `RESPONSE RULES` 但屬於臨時修補。
**內容**:
- 全面審視 `_SYSTEM_PROMPT`（`chat_agent.py`）的指令品質
- 審視各 tool 的 `description` 是否足夠精確（影響 LLM tool selection 準確率）
- 審視 `QueryPatternRecognizer` fast-route 邏輯與 agent loop 的分工
- 審視 `_build_context_prompt` 動態注入的 context 格式
- 考慮加入 few-shot examples 或輸出格式指引
**完成內容**: LangGraph 低階 API 遷移 + Prompt & Tool Description 全面重構

---

## B-016 Chat Context 切頁殘留 ✅ 完成
**背景**: 從 Reader 切到 Graph 頁面時，chat agent 仍參考 Reader 的 chapter 資料。
**原因**:
1. 前端 `setPageContext` 用 merge（`{ ...prev, ...ctx }`），Graph 頁面未清除 `chapterId` / `chapterTitle`
2. 後端 `ChatState` 的 `book_id` / `chapter_id` 是 per-session 持久的，新訊息的 context 會覆蓋但舊欄位不會自動清除
**修法**:
- 各頁面 `setPageContext` 應重置不屬於該頁面的欄位（如 Graph 清 `chapterId`/`chapterTitle`）
- 後端 WebSocket handler 在 hydrate context 時，將未提供的欄位重置為 `None`

---

## B-023 Event 節點張力欄位強化 ✅ 完成
**背景**: 張力分析的觸發機制依賴 Event 節點的 `tension_signal` 標記。原 ingestion pipeline 提取 Event 節點時未產出此欄位，TEU 組裝無法啟動。
**設計文件**: `docs/plans/20260331-tension-analysis-design-notes.md` Section 五
**實作**:
- 更新 `backend/storysphere/domain/models.py` EventNode schema，新增三個欄位：`tension_signal`, `emotional_intensity`, `emotional_valence`
- 更新 `backend/storysphere/pipelines/entity_extractor.py` 的 Event 提取 prompt
- 與 B-031 合併為一次 migration（EventNode schema + ingestion prompt 只改一次）

---

## B-024 Concept 節點 surface/inferred 分類強化 ✅ 完成
**背景**: 張力分析用 Concept 節點描述對立極點，需區分「文本直接說出的概念」（surface）和「LLM 推斷的命題」（inferred），兩者可信度不同。
**設計文件**: `docs/plans/20260331-tension-analysis-design-notes.md` Section 四
**實作**:
- 更新 ConceptNode schema，新增：`extraction_method`, `source_spans`, `inferred_by`, `confidence`
- Ingestion pipeline 自動標記 `extraction_method="ner"`

---

## B-025 Pre-Analysis Step：Inferred Concept 節點產生流程 ✅ 完成
**背景**: Inferred Concept 節點（LLM 從段落群推斷的抽象命題）不在 ingestion 時產出，而是 TEU 組裝的前置作業。
**前置依賴**: B-024
**實作**: `backend/storysphere/pipelines/concept_inference.py` — 輸入候選段落群，LLM 產出帶置信度的 Concept 標籤，存入 KG

---

## B-026 TEU Domain Model + 組裝 Pipeline（模式 B 優先）✅ 完成
**背景**: TEU（Tension Evidence Unit）是張力分析的最小單元，描述一個場景內的對立關係。模式 B（按需、單 Event 觸發）優先實作。
**前置依賴**: B-023, B-024, B-025
**實作**:
- `backend/storysphere/domain/tension.py`：`TensionPole`, `TEU`, `TensionLine`, `TensionTheme` Pydantic models
- `backend/storysphere/services/tension_service.py`：`assemble_teu(event_id)` + 存取層

---

## B-027 TensionLine 自動 grouping + HITL 審核介面 ✅ 完成
**背景**: TensionLine 是跨場景的對立模式，由多個 TEU 群集而成。需 HITL 介入防止概念相似但獨立的主題被錯誤合併。
**前置依賴**: B-026
**實作**:
- 自動 grouping：概念相似性（向量距離）+ 承載者重疊兩個維度
- API 端點：`GET /api/v1/tension/lines` + `PATCH /api/v1/tension/lines/{id}/review`
- 前端 HITL 審核元件

---

## B-028 模式 A：全書掃描批次 TEU 組裝 ✅ 完成
**背景**: 對全書所有 `tension_signal != "none"` 的 Event 節點批次組裝 TEU，作為完整分析的入口。
**前置依賴**: B-026
**實作**:
- `TensionService.analyze_book_tensions(book_id)` — `asyncio.gather` 並發批次組裝
- API 端點：`POST /api/v1/tension/analyze` → task_id（異步，WebSocket 推送進度）

---

## B-029 TensionTheme 合成 + Frye/Booker 標籤對應 ✅ 完成
**背景**: TensionTheme 是全書層面的張力主題命題，由多條 TensionLine 合成，LLM 產出命題草稿，人工審核確認。
**前置依賴**: B-027
**實作**:
- `TensionService.synthesize_theme(book_id)`
- API 端點：`GET /api/v1/tension/theme` + `PATCH /api/v1/tension/theme/{id}/review`
- `backend/storysphere/config/mythos.py`（Frye/Booker 標籤，類比 `archetypes.py`）

---

## B-030 張力分析與 Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將 B-023 ~ B-029 所有元件串連為完整端到端工作流：ingestion → TEU → TensionLine（HITL）→ TensionTheme（人工審核）。
**前置依賴**: B-028, B-029
**實作**:
- 完整流程文件：`docs/guides/tension-analysis.md`
- 前端：張力分析儀表板（TensionLine 軌跡圖、TEU 列表、TensionTheme 命題展示）

---

## B-031 Event 節點敘事學欄位預留 ✅ 完成（已與 B-023 合併）
**背景**: Kernel/Satellite 分類和熱奈特時序分析都依賴 Event 節點的新欄位，應在 ingestion 時以預設值填入。
**設計文件**: `docs/plans/20260331-narratology-analysis-design-notes.md` Section 五
**實作**（與 B-023 合併為一次 migration）:
- 更新 `backend/storysphere/domain/models.py` EventNode，新增：`narrative_weight`, `narrative_weight_source`, `story_time`
- 新增 `StoryTimeRef` schema（`relative_order`, `time_anchor`, `absolute_time`, `confidence`）

---

## B-032 Ingestion prompt 時間線索提取預留 ✅ 完成
**背景**: 熱奈特時序分析需要故事時間軸，ingestion 時提取文本中已存在的時間線索成本低。
**實作**: `backend/storysphere/services/extraction_service.py` — `story_time_hint` 欄位已在 Event 提取 prompt 中（確認實作時發現已完成）

---

## B-033 Kernel/Satellite 第一階段：摘要啟發式分類 ✅ 完成
**背景**: 現有層級摘要隱含粗略重要性分層，直接作為 Kernel/Satellite 第一階段信號。
**實作**:
- `backend/storysphere/domain/narrative.py`：`NarrativeStructure`, `HeroJourneyStage`, `ProppFunctionRef`, `KernelSatelliteResult`
- `backend/storysphere/services/narrative_service.py`：`classify_by_heuristic(document_id)`, `get_kernel_spine(document_id)`

---

## B-034 Kernel/Satellite 第二階段：LLM 細化分類 ✅ 完成
**背景**: 啟發式結果有誤差，特別是出現在章節摘要但語義上是渲染性的事件。
**實作**: `NarrativeService.refine_with_llm()` — 預設對所有 satellite 進行 LLM 二次判斷；LLM 優先，分歧以 WARNING 記錄

---

## B-035 坎伯英雄旅程 LLM 結構對應 ✅ 完成
**背景**: 輸入章節摘要序列，LLM 輸出英雄旅程階段映射。
**實作**:
- `backend/storysphere/config/hero_journey.py`：12 階段 loader + `get_hero_journey_summary()`
- `backend/storysphere/config/hero_journey/hero_journey_{en,zh}.json`：階段定義
- `NarrativeService.map_hero_journey(document_id)`：章節範圍允許重疊；無證據的階段省略

---

## B-036 NarrativeStructure 節點儲存 + 查詢介面 ✅ 完成
**背景**: 整合 Kernel/Satellite 和英雄旅程結果，提供 API 查詢介面。
**實作**:
- `backend/storysphere/api/schemas/narrative.py`：request schemas
- `backend/storysphere/api/routers/narrative.py`：9 個端點（async classify/refine/hero-journey + polling + sync kernel-spine + GET/PATCH structure）
- `NarrativeService.get_cached_structure()` + `update_review()`

---

## B-037 熱奈特時序分析（倒敘/預敘識別）✅ 完成
**背景**: 文本位置排名 vs 故事時間排名的差值，量化倒敘/預敘。
**前置條件**: story_time_hint 覆蓋率 ≥ 60%（透過 GET /narrative/temporal/coverage 確認）
**實作**:
- `backend/storysphere/domain/narrative.py`：`TemporalAnalysis`, `TemporalDisplacement`
- `NarrativeService.check_temporal_coverage()` + `analyze_temporal_order()`
- API 端點：`POST /api/v1/narrative/temporal` + `GET /narrative/temporal/coverage`

---

## B-038 敘事結構視覺化 + Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將敘事學模組整合為端到端工作流並提供入口。
**實作**:
- `AnalysisAgent.analyze_narrative(document_id)` — 依序執行 heuristic → LLM refine → hero journey
- `AnalysisAgent.__init__` 加入 `narrative_service` 參數
- `docs/guides/narratology.md`：完整流程文件

---

## I 系列（多語系 / i18n）— I-01 ~ I-09 ✅ 全部完成（2026-04-24）

**技術選型**: `react-i18next` + `i18next`
**完成範圍**: 所有 9 個 ticket，涵蓋前端全部 35+ 元件 / 頁面
**字串數**: 約 380–420 個（共 10 個 namespace JSON 檔 + frameworksData.ts 雙語資料）

### I-08：其餘頁面（settings.json + chat.json）

**工作量**: ~2 小時
**涉及元件**: `pages/SettingsPage.tsx`、`pages/TokenUsagePage.tsx`、`pages/SymbolsPage.tsx`、`pages/UnravelingPage.tsx`、`components/chat/ChatWindow.tsx`
**預估字串數**: ~75 個
**實作說明**: SettingsPage / TokenUsagePage / SymbolsPage / ChatWindow 在 I-01~I-07 commit 時已順帶完成。UnravelingPage 的 `STATUS_LABEL`、`COUNT_LABELS`、`'not built'`、`'KG Features'` 在 I-08 專屬 commit 中遷移，新增 `unraveling.*` keys 至 analysis.json，並將 module-level const 重構為 `t()`-backed helper function（`statusLabel`、`countLabel`），TFunction 透過 `buildElements` 和 `getSubLabel` 參數傳入以支援 cytoscape canvas 標籤翻譯。

### I-09：框架索引頁（frameworks.json）⚠️ 特殊處理

**工作量**: ~3 小時
**涉及元件**: `pages/FrameworksPage.tsx`
**預估字串數**: 142+ 個（最大單頁）
**實作說明**: 採用雙層策略。UI 骨架字串（目錄、參考文獻、全站提示）存於 `frameworks.json` namespace。大量靜態內容資料（Jung/Schmidt 原型、英雄旅程、Frye/Booker 框架、SEP 步驟，共 6 個 framework × zh-TW + en）提取至 `src/data/frameworksData.ts`，以 `getFrameworks(lang)` 根據語言回傳對應資料集，FrameworksPage 透過 `i18n.language` 取得當前語言並載入對應資料。

**實作**: `frontend/src/data/frameworksData.ts`（Framework 介面 + FRAMEWORKS_ZH + FRAMEWORKS_EN + getFrameworks）, `frontend/src/i18n/locales/{zh-TW,en}/frameworks.json`, `frontend/src/i18n/index.ts`（新增 frameworks namespace）

---

### I-01 ~ I-07 詳細內容

### I-01：基礎設置

**工作量**: ~1–2 小時
**內容**:
- `cd frontend && npm install react-i18next i18next`
- 建立 `frontend/src/i18n/index.ts` — 初始化 i18next（語言偵測、fallback=en）
- 建立翻譯檔目錄結構：
  ```
  frontend/src/i18n/
    index.ts
    locales/
      zh-TW/
        common.json     ← 共用字串（取消、確認、載入中…）
        nav.json        ← 導覽 / Sidebar
        library.json    ← 書庫相關
        upload.json     ← 上傳相關
        analysis.json   ← 深度分析
        graph.json      ← 圖譜
        reader.json     ← 閱讀器
        settings.json   ← 設定 / Token 用量
        chat.json       ← 對話介面
        frameworks.json ← 框架索引（大量靜態內容）
      en/
        (同上結構)
  ```
- `frontend/src/main.tsx` 引入 `i18n/index.ts`
- Sidebar 新增語言切換按鈕（zh-TW / EN），以 `i18n.changeLanguage()` 切換

---

### I-02：共用字串（common.json）

**工作量**: ~1 小時
**涉及元件**: `components/ui/ConfirmDialog.tsx`、`components/library/StatusBadge.tsx`、`components/analysis/AnalysisListItems.tsx`
**預估字串數**: ~20 個
**代表字串**: 取消、確認、載入中…、搜尋…、重試、錯誤、已分析、尚未分析、處理中、已就緒、已完成、建立、觸發分析失敗，請稍後再試。

---

### I-03：導覽 & 書庫（nav.json + library.json）

**工作量**: ~1.5 小時
**涉及元件**: `components/layout/Sidebar.tsx`、`components/layout/BookNav.tsx`、`pages/LibraryPage.tsx`、`components/library/BookCard.tsx`、`components/library/EmptyLibrary.tsx`、`components/library/RecentBookCard.tsx`
**預估字串數**: ~45 個
**代表字串**: 書庫、上傳、框架索引、Token 用量、系統設定、閱讀、角色分析、事件分析、知識圖譜、時間軸、張力分析、符號意象、建構概覽、最近開啟、全部、已分析、上傳新書、繼續閱讀、開始閱讀、查看處理進度、確認、取消、刪除書籍

---

### I-04：上傳 & 處理（upload.json）

**工作量**: ~1 小時
**涉及元件**: `pages/UploadPage.tsx`、`components/upload/DropZone.tsx`、`components/upload/ProcessingTimeline.tsx`
**預估字串數**: ~25 個
**代表字串**: 上傳 & 處理進度、書籍名稱、作者、留空則由系統自動從文件 metadata 獲取、取消、確認上傳、進入書籍、拖曳 PDF 至此，或點擊選擇檔案、支援 .pdf 格式、PDF 解析、語言偵測、摘要生成、特徵提取、知識圖譜、符號探索、資料儲存

---

### I-05：深度分析（analysis.json）

**工作量**: ~2 小時
**涉及元件**: `pages/CharacterAnalysisPage.tsx`、`pages/EventAnalysisPage.tsx`、`components/analysis/CharacterAnalysisDetail.tsx`、`components/analysis/EventAnalysisDetail.tsx`、`components/analysis/AnalysisListItems.tsx`、`components/analysis/BatchEepPanel.tsx`
**預估字串數**: ~60 個
**代表字串**: 已分析、尚未分析、搜尋…、選擇角色以查看或生成分析、生成分析、覆蓋重新生成、角色簡介、Jung 12 原型、Schmidt 45 原型、信心度、主要原型、發展弧線、事件摘要、事件前後狀態、結構角色、因果分析、根本原因、影響分析

---

### I-06：張力 & 時間軸（分散至 analysis.json）

**工作量**: ~2 小時
**涉及元件**: `pages/TensionPage.tsx`、`pages/TimelinePage.tsx`、`components/timeline/MatrixCanvas.tsx`
**預估字串數**: ~55 個
**代表字串**: 張力分析、Step 1–3 標題、待審核、已核准、已修改、已拒絕、核准、修改標籤、拒絕、儲存、全書張力主題命題、重新計算時序、計算中…、章節順序、故事時序、矩陣視圖、敘事順序 (Sjuzhet)、故事時序 (Fabula)、時序未計算

---

### I-07：圖譜 & 閱讀器（graph.json + reader.json）

**工作量**: ~1.5 小時
**涉及元件**: `pages/GraphPage.tsx`、`components/graph/GraphToolbar.tsx`、`components/graph/EntityDetailPanel.tsx`、`components/graph/EventDetailPanel.tsx`、`pages/ReaderPage.tsx`、`components/reader/BookOverview.tsx`、`components/reader/ChapterCard.tsx`
**預估字串數**: ~35 個
**代表字串**: 節點、關係、搜尋實體…、角色、地點、概念、事件、重置視圖、事件分析、深度分析、相關段落、實體資訊、生成分析、章節、Chunks、實體、關係、全書關鍵字、實體分佈

**實作**: `frontend/src/i18n/locales/{zh-TW,en}/{common,nav,library,upload,analysis,graph,reader}.json`，35+ 個元件 / 頁面遷移至 `useTranslation()` hook

---

## B-022 SEP Domain Model + 組裝 Pipeline ✅ 完成
**背景**: 符號學原止於原始提取（`ImageryEntity` + 共現圖），缺乏結構化的語境 profile，無法作為 LLM 詮釋的輸入。本 ticket 對應 B-026（TEU 組裝）的符號學等價物，只做結構化、不做 LLM 詮釋。下游的 LLM 詮釋步驟拆分為 B-040。
**前置依賴**: B-020, B-021（均已完成）

**實作**:
- `backend/storysphere/domain/symbol_analysis.py`：`SEP`（Symbol Evidence Profile）+ `SEPOccurrenceContext`，欄位包含 `imagery_id`, `book_id`, `term`, `imagery_type`, `frequency`, `occurrence_contexts`（段落文字 + 章節位置）、`co_occurring_entity_ids`、`co_occurring_event_ids`、`chapter_distribution`、`peak_chapters`
- `SymbolService.assemble_sep(imagery_id, book_id, doc_service, kg_service, cache)` — `asyncio.gather` 並行拉取 imagery + occurrences + document + events，組裝 SEP 後存入 `AnalysisCache`（key: `sep:{book_id}:{imagery_id}`）
- `SymbolService.get_sep(imagery_id, book_id, cache)` — cache 查詢
- `GET /api/v1/symbols/{imagery_id}/sep?force=false` — 查詢已組裝的 SEP；cache miss 時即時組裝並持久化
- Unraveling DAG：Layer 2 新增 `sep` 節點（counts: analyzed / total_imagery），邊 `symbols → sep`、`kg_entity → sep`；`cache.count_keys(f"sep:{book_id}:%")` 計數

**設計決策**:
- SEP 存入 `AnalysisCache` 而非 SQLite，與 CEP/EEP/TEU 一致
- `co_occurring_entity_ids` 來源：在 imagery occurrence 所屬 paragraph 的 `paragraph.entities` 欄位；`co_occurring_event_ids` 取章節交集（事件所屬 chapter 出現在 imagery 的 `chapter_distribution` 鍵中）
- `peak_chapters` 取 top 3（`_SEP_PEAK_CHAPTER_COUNT`）
- `assemble_sep` 的依賴透過方法參數注入（類比 `TensionService.assemble_teu`），保持 `SymbolService` 仍為純資料層 + 組裝入口

**測試**: `tests/services/test_symbol_service.py::TestAssembleSEP`（5 案例）+ `tests/api/test_symbols.py::TestSEPEndpoint`（2 案例）

**後續**: B-040 LLM 詮釋以 SEP 為輸入，完成後需在 unraveling DAG 補 `sep → symbol_analysis_result` 邊

**實作**: `backend/storysphere/domain/symbol_analysis.py`, `backend/storysphere/services/symbol_service.py`, `backend/storysphere/api/routers/symbols.py`, `backend/storysphere/api/routers/unraveling.py`

---

## B-039 建構概覽（Unraveling）— 資料透明度 DAG ✅ 完成
**背景**: 系統為每本書建立的資料量體對用戶不可見，功能不可用時也難以診斷是哪個資料層尚未建立。
**實作**:
- `GET /api/v1/books/{book_id}/unraveling` — 聚合端點，兩輪並行查詢（服務計數 + cache key 計數）組裝 manifest JSON
- 5 層 DAG 節點（layer 0–4）：原生文本層（book_meta/chapters/paragraphs）、知識抽取層（summaries/keywords/symbols + KG compound group）、分析中間層（CEP/EEP/TEU）、合成結果層（character/causality/impact/tension/narrative/hero-journey/temporal）、書籍層面合成（tension_theme/chronological_rank）
- KG 子節點（kg_entity/kg_concept/kg_relation/kg_event/kg_temporal_relation）統一放入 `kg_features` compound group
- 前端 Cytoscape.js DAG 視圖，支援節點點擊高亮與 counts 展示
- `AnalysisCache.count_keys(pattern)` 非破壞性計數（含 TTL 過濾）
- TEU 計數特殊處理：fan-out per event_id（`teu:{event_id}` 鍵）並行查詢後加總

**設計決策**:
- Relation count v1 使用全域 `kg_service.relation_count`（KGService 無 document_id filter），meta 標注 `"scope": "global"`
- Symbol occurrence count 用 `sum(e.frequency for e in imagery_entities)`，避免載入所有 SymbolOccurrence

**實作**: `backend/storysphere/api/routers/unraveling.py`; `frontend/src/api/unraveling.ts`

---

## B-012 前端後端 API 整合驗證 ✅ 完成
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**驗收結論**:
- 所有端點回傳格式（camelCase）與前端 types 一致
- `TaskStatus.status` 為 `pending|running|done|error`，符合預期
- `EventAnalysisDetail` 後端已手動構建 camelCase dict，完全對應
- `uploadBook(file, title)` 前端傳兩欄位，後端 `title` 為 Optional，相容
- `.env.local` 中 `VITE_MOCK` 已註解（mock 關閉）
- Segment-based Chunk 回傳已實作（ingestion-time paragraph entity linking + stored offsets）

---

## B-017 意象實體識別策略研究（符號學前置依賴）✅ 完成
**背景**: 符號學分析模組的核心技術挑戰。評估三種識別策略（詞嵌入聚類、LLM 輔助標注、人工種子+擴展）。
**設計文件**: `docs/plans/20260331-symbolic-analysis-design-notes.md` Section 四
**結論**: 採用 LLM 輔助標注（主）+ 詞嵌入聚類（同義詞合併），為 B-018~B-022 的前置依賴。

---

## B-018 ImagerEntity Domain Model 設計 ✅ 完成
**背景**: 符號學模組需要新的實體類型表示意象實體，與現有 `Entity`（人物/地點）平行但語意不同。
**實作**:
- `backend/storysphere/domain/imagery.py`：`ImageryType` enum、`ImageryEntity`、`SymbolOccurrence`、`SymbolCluster`（純 Pydantic）
- 持久層：`backend/storysphere/services/symbol_service.py`（aiosqlite，兩張表：`imagery_entities` + `symbol_occurrences`）

---

## B-019 符號學第一層：候選符號發現 Pipeline ✅ 完成
**背景**: 三層架構的第一層，回答「有什麼值得追蹤？」。
**實作**:
- `backend/storysphere/services/imagery_extractor.py`：LLM 提取 + 貪心余弦相似度聚類（EmbeddingGenerator）
- `backend/storysphere/pipelines/symbol_discovery/pipeline.py`：`SymbolDiscoveryPipeline(BasePipeline)`，章節順序處理
- `backend/storysphere/workflows/ingestion.py`：新增 Step 3b（progress=75），`skip_symbols=True` 可跳過；`IngestionResult.imagery_extracted`

---

## B-020 符號共現網絡建構（Layer 2）✅ 完成
**背景**: 三層架構的第二層，回答「這些符號之間有什麼關係？」。
**實作**:
- `backend/storysphere/services/symbol_graph_service.py`：`SymbolGraphService`，on-demand `build_graph()`，NetworkX `DiGraph`
- 與 KGService 的 EntityNode 完全獨立，作為平行圖層

---

## B-021 詮釋輔助介面（Layer 3）— 符號時間軸 ✅ 完成
**背景**: 三層架構的第三層，組織統計結果為可讀格式。系統只呈現觀察，不提供詮釋。
**實作**:
- `backend/storysphere/api/schemas/symbols.py`：`ImageryEntityResponse`、`ImageryListResponse`、`SymbolTimelineEntry`、`CoOccurrenceEntry`（snake_case）
- `backend/storysphere/api/routers/symbols.py`：`GET /symbols`、`GET /symbols/{id}/timeline`、`GET /symbols/{id}/co-occurrences`
- `backend/storysphere/api/deps.py`：`SymbolServiceDep`、`SymbolGraphServiceDep`
- `frontend/src/api/symbols.ts` + `frontend/src/pages/SymbolsPage.tsx`：符號意象分析頁面

---

## F-17 UI 主題風格切換系統（B&W Theme System）✅ 完成（2026-05-28）
**分類**: UI 系統 — Wave 2
**設計文件**: `docs/plans/20260429-theme-system-bw.md`、`docs/DESIGN_TOKENS.md`、`docs/UI_SPEC.md` Section 3.13

**背景**: StorySphere 設計 token 已在 `tokens.css` 中抽離，主題切換架構基礎（`data-theme` on `<html>`、ThemeContext）已就位。F-17 完成填入第二、三主題 token 值並實作設定頁切換 UI。

**已實作**:
- `frontend/src/styles/tokens.css`：新增 `[data-theme="manuscript"]`、`[data-theme="minimal-ink"]`、`[data-theme="pulp"]` 三個覆蓋區塊（共 644 行）
- 三個 B&W 主題嚴格使用黑白灰，`default` 暖色 token 不受影響
- `frontend/src/contexts/ThemeContext.tsx`：localStorage key `storysphere:theme`，讀寫主題並套用 `data-theme` attribute
- `frontend/src/pages/SettingsPage.tsx`：card picker UI（三色縮圖預覽、選中 accent 邊框、即時套用）
- Cytoscape 節點、BarFill、Stat 卡、Keyword tag 等元件均已 tokenise
- 多個修正 commit 補全 B&W 主題下各元件的可讀性（tensor page、build overview legend、native form controls、BatchEepPanel progress track）
- `docs/DESIGN_TOKENS.md` 對照表同步更新

---

## F-18 系統啟動 Splash Screen ✅ 完成（2026-05-28）
**分類**: UI 體驗 — Wave 2

**背景**: 每個新 session 顯示全螢幕品牌印象畫面，以 `sessionStorage` 判斷是否已顯示，強化第一印象。

**已實作**:
- `frontend/src/components/SplashScreen.tsx`：全螢幕 overlay，`position: fixed; inset: 0; z-index: 9999`；淡入（0.4s）→ 停留（1.5s）→ 淡出（0.4s）後 unmount；點擊可立即略過；背景色 `var(--bg-primary)`
- `frontend/src/hooks/useSplash.ts`：讀寫 `sessionStorage` key `storysphere:splash-shown`，返回 `{ needsSplash, markDone }`
- `frontend/src/components/AppRoot.tsx`：頂層條件渲染 `{needsSplash && <SplashScreen onDone={markDone} />}`
- 後續強化 commit：theme-aware splash（faded bg）、imagery pool、loader bar

---

## I-001 輕量化部署模式（Lightweight Deployment Mode）✅ 完成（2026-05-28）
**性質**: Infrastructure Refactor
**設計文件**: `docs/plans/20260505-i001-lightweight-deployment.md`

**背景**: 系統原預設需要 Qdrant service，對新用戶不友善，且現有 fallback 靜默跳過造成資料狀態不明確。新增兩個明確的部署模式，不做跨模式自動降級。

**已實作**:
- `backend/storysphere/config/settings.py`：新增 `deploy_mode: Literal["lightweight", "standard"] = "lightweight"`、`qdrant_local_path`；lightweight 模式強制 `kg_mode=networkx` 並 log warning
- `backend/storysphere/services/vector_service.py`：依 `deploy_mode` 決定 Qdrant client（local file path vs. remote URL）；standard 模式連線失敗拋明確錯誤
- `backend/storysphere/api/main.py`：lifespan 啟動時針對 lightweight 模式發出多 worker 警告
- `.env.example`：新增 `DEPLOY_MODE=lightweight` 說明，最低配置僅需填 `PRIMARY_LLM_PROVIDER` + 對應 key
- 後續 fix commit 修正 lightweight 模式下多處 API 正確性問題

---

## I-003 主要 LLM Provider 可配置化 ✅ 完成（2026-05-28）
**性質**: Infrastructure Refactor
**設計文件**: `docs/plans/20260505-i003-primary-llm-provider.md`

**背景**: `_resolve_primary()` 原固定 Gemini → OpenAI → Anthropic → Local 的 fallback 順序，非 Gemini 用戶只能被動降級並收到 warning，且 `.env.example` 隱含「必須填 Gemini key」的假設。

**已實作**:
- `backend/storysphere/config/settings.py`：新增 `primary_llm_provider: Literal["gemini", "openai", "anthropic", "local"] = "gemini"`
- `backend/storysphere/core/llm_client.py`：`_resolve_primary()` 改為直接讀取 `settings.primary_llm_provider`；指定 provider 的 key 未設定時啟動報明確錯誤，不靜默降級
- `.env.example`：新增 `PRIMARY_LLM_PROVIDER` 說明，更新「最低配置」範例（只填 provider + 對應 key）
- 與 I-001 同批實作（commit `b6cdd53`、`5d1754a`）

---

## B-045 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 ✅ 完成（2026-06-01）
**設計文件**: `docs/plans/20260601-narrative-page-hero-journey.md`（Claude Design 交付，四佈局比較稿）

**背景**: 後端 `/narrative/*`（#21e/#21f/#21k/#21l）已實作，但前端無 `narrative.ts`、無頁面、無 BookNav 入口，建構概覽頁的 `hero_journey_stage` 節點永遠顯示「未建立」。

**已實作**:
- 後端型別：`GET /narrative`、`PATCH /narrative/{id}/review` 加 `response_model=NarrativeStructure`；`GET /narrative/kernel-spine` 加 `response_model=list[KernelSpineEvent]`（新增 schema）。回傳 shape 不變，`generated.ts` 重新產生後有 `NarrativeStructure` / `HeroJourneyStage` / `KernelSpineEvent` 型別。
- 前端 `api/narrative.ts`：`triggerHeroJourney` / `fetchHeroJourneyTask` / `fetchNarrativeStructure` / `fetchKernelSpine` / `reviewNarrativeStructure`。
- 新頁 `/books/:bookId/narrative`（`NarrativePage.tsx`）+ BookNav「敘事結構」入口（張力／符號之外的第三條平行分析線）。
- 英雄旅程主視圖：四種佈局可切換（A 水平軌跡 / B 三相位分欄 / C 圓環循環 / D 章節對位帶），共用三態視覺語言（filled 填色深淺 / low 警示三角+虛線 / absent「—」虛線空殼），點擊階段展開詮釋 + 章節 + 代表 Kernel 事件 pill + 理論描述/敘事功能。
- 情節骨幹摘要次區塊：書級 Kernel/Satellite 比例條 + 統計 + 依章節的核心事件骨幹 + 跳轉事件分析頁。
- HITL 調整為**書級**（API 只支援 `review_status`，不支援每階段）：區塊標題列 approve / 標記不適用 + 審核狀態徽章，走 #21l。
- 理論文案來源 `frameworksData.ts` hero_journey（localized）；i18n key 前綴 `narrative.*`（`analysis` namespace，zh-TW + en）。所有色彩走既有 token（無新增 token，`DESIGN_TOKENS.md` 不變）。

## B-047 知識圖譜：非預設主題下節點類型識別困難 ✅ 已解（2026-07-10，design system v2）
> 原 B-043，2026-06-30 重編。
**背景**: KG V1 設計統一節點為圓形，類型靠 `--graph-*-fill/-stroke` 區分；舊 manuscript / minimal-ink / pulp 主題把 entity token 收斂到灰階，圓形 + 灰階 = 類型幾乎無法區分。曾評估的方案：節點內疊 icon、標籤前加 type dot、非預設主題保留 shape variation。
**解法**: 未採用上述任何方案 —— design system v2（Ink on Paper，`docs/plans/20260710-design-system-v2-ink-on-paper.md`）移除全部灰階主題，改為 Warm / Ink 兩主題，且 **entity / graph 色環跨主題共用**（Ink 僅將 chrome 單色化，刻意不覆寫分類色）。節點類型在兩主題下均維持彩色可辨，問題由設計層面消解。

## B-054 Splash 圖庫更換 + wording 同步 ✅ 完成（2026-07-16）
**背景**: `SplashScreen.tsx` 的 `IMAGERY_POOL` 原只有 `library-of-books.png` 一張；William 準備新封面圖，備妥後一併更換並同步 wording / 清理。

**已實作**:
- `IMAGERY_POOL` 換為 William 新封面圖 `frontend/src/assets/splash/cover_v2.png`（取代 `library-of-books.png`），credit 落款 `Reading · ink illustration`。
- wordmark + 副標由置中改為**左側垂直置中**（容器 `justifyContent: flex-start` + `paddingLeft: clamp(2rem, 8vw, 8rem)`；前景 `alignItems: flex-start`），配合新圖左下人物、右側塗鴉雲構圖，文字落在左上留白不壓圖。
- 副標中文由「智能小說分析」改為「小說文本分析」。
- 清理換圖後已無引用的 `splash-main.png`、`library-of-books.png`。
- 瀏覽器實測 full-opacity 渲染確認左側置中、文字不壓構圖（warm 主題）。

**未做（刻意）**:
- credit 大小寫校正：新 credit 為全新字串、格式已一致，原「Library of Books/books」大小寫問題隨舊圖移除而消失。
- `tone`（light/dark）欄位：目前 `SplashScreen` 無任何 consumer 讀取 tone，加了即死資料，依「不為未來可能用到加東西」原則不補；日後真有 overlay 對比需求時再一併補欄位與 consumer。

## B-082 重跑 KG 抽取會累積重複的實體 / 關係 / 事件 ✅ 完成（2026-08-20）

**背景**: 2026-08-20 複查後端缺陷時，從 `var/knowledge_graph.json` 的實測資料反推出來的。

**症狀**（四本書實測）:

| 書 | entities | 相異 | events | 相異 | edges | 相異 |
|---|---|---|---|---|---|---|
| **dd129f3d** Age of Fire (併發驗證) | **195** | 73 | **101** | 67 | **326** | 168 |
| 1a1a7266 大唐雙龍傳 | 202 | 202 | 62 | 62 | 224 | 222 |
| 8f18dd59 名字的潮汐 | 39 | 39 | 47 | 47 | 84 | 84 |
| be6b8d99 3pigredhood | 34 | 34 | 25 | 25 | 62 | 62 |

edges 的簽章含 `chapters`，以免把 `_fill_relation_valid_to` 產生的**合法時序分期**
誤算成重複。dd129f3d 的事件是逐字同名的三胞胎（「林素卿召集家人宣讀遺囑」×3 等）。

**根因**: `_persist_to_kg`（`pipelines/knowledge_graph/pipeline.py:266`）呼叫的三個
`add_entity` / `add_relation` / `add_event` 都**以物件自己的 id 為 key**，而那個 id 是
每次抽取現生的 `uuid4`。memory backend 的 dict 賦值與 neo4j 的
`MERGE (ev:Event {id: $id})` 在語意上都是「覆蓋同一個 id」，實際上永遠是新增。
去重只發生在單次執行內（`EntityLinker`、`_remove_merged_relations`），跨執行無人看得到上一次的產出。

**對照**: `symbol_discovery/pipeline.py:63` 有 `delete_by_book()`，docstring 明寫
"Re-ingest safe"。**同一個 repo 裡兩條平行 pipeline，一條做了、一條沒做。**

**與 B-068 的區別**: B-068 是「同一場戲被切成多個 event」（抽取粒度），
這條是「同一個 event 被存了三次」（持久化）。兩者症狀都是「事件太多」，容易混淆。

**觸發條件**: 按第二次 `POST /books/{id}/rerun/knowledge-graph` 就會發生。
dd129f3d 是併發驗證的實驗書，同一步驟被反覆跑才中了三次。

**修法**: `remove_by_document()` 已存在（刪書路徑在用，且 entity / relation / event 三者都清），
在 `_persist_to_kg` 開頭 delete-first 即可。連帶要補 `inferred_relations` 的清理 ——
它存 entity id，而 rerun 路徑沒有對應的 `delete_by_document`。
完整規劃見 [`docs/plans/20260820-kg-rerun-idempotency.md`](plans/20260820-kg-rerun-idempotency.md)。

**既有髒資料**: 不寫遷移腳本。dd129f3d 是可丟棄的實驗書，直接刪書重跑即可；
修法落地後真實書中招也會在下次重跑時自癒。

---

**完成**: PR #60。`_persist_to_kg` 開頭以既有的 `remove_by_document()` delete-first；連帶在 `rerun_step` 成功後清掉 `inferred_relations`（它存 entity id）。順帶修掉一個測試污染：`_rerun` 把 `get_settings` patch 成 MagicMock，真的 `LinkPredictionStore` 會拿 mock 的 repr 當檔名，SQLite 照建不誤，跑完在 repo 根目錄留下三個垃圾 db 而測試仍回報綠。既有髒資料不寫遷移腳本 —— `Age of Fire (併發驗證)` 是可丟棄的實驗書，真實書中招則重跑一次即自癒。

## B-079 imagery occurrence 指向不含該詞的段落 ✅ 完成（2026-08-20）

**背景**: 2026-08-10 驗證 B-074 時發現。「戒指」的詮釋回傳「『戒指』在此後記中並未出現，
因此無法從文本中推斷其象徵意義」—— 模型是誠實的：存下來的段落文字確實不含該詞。

掃過《名字的潮汐》與另一本書全部已快取的 SEP：

```
古玉  3/4 筆的段落不含該詞（ch. 3, 4, 4）
手    1/7 筆                （ch. 7）
沙    3/4 筆                （ch. 5, 6, 11）
合計 7/39 筆 ≈ 18%
```

「戒指」的 `paragraph_text` 是後記首段（直排標題「作 　 者 　 後 　 記」），但
`context_window` 是對的 —— 兩者來源不同，其中一個對應錯了。

**影響範圍**: `occurrence_contexts` 是送進 LLM 的證據本體。約五分之一的引文與該意象無關，
詮釋因此可能建立在錯誤段落上。與 B-074（前置頁污染）是不同的問題：那是「不該送的送了」，
這是「送的內容根本對應錯」。

**根因已查明（2026-08-20）**: 上面列的兩個候選**都不是**。問題在抽取端，不在組裝端 ——
`paragraph_id` 查無此段的筆數是 **0**，`chapter_number` 的正確率是 **142/142**。

`pipelines/symbol_discovery/pipeline.py:159` 的 `_find_paragraph_id` 拿 LLM 生成的
`context_sentence` 去跟段落文字做子字串比對，**比對失敗就靜默退回該章第一段**
（`_find_position` 同型，退回 `0`）。而 `context_sentence` 從來就沒有「必須逐字引用」的約束 ——
142 筆裡有 25 筆連 `term` 本身都不含，模型是在轉述。

實測 22/142（15.5%）當初走了那個 fallback 分支；對不上的 28 筆只有 19 個相異
`paragraph_id`，因為不同意象一起掉進同一個「第一段」。

**修法與實測可行性**: 改用「詞優先、句子作 tiebreaker」後正確率由 80.3% → 99.3%
（83 筆唯一命中、44 筆需 tiebreaker、14 筆靠別名、1 筆確為 LLM 幻覺）。
完整規劃見 [`docs/plans/20260820-imagery-occurrence-anchoring.md`](plans/20260820-imagery-occurrence-anchoring.md)。

**觸發時機**: 已排入實作（2026-08-20）。

---

**完成**: PR #61。查出**兩個**根因：(1) `_find_paragraph_id` 拿 LLM 生成的 `context_sentence` 比對，失敗就靜默退回該章第一段；(2) pypdf 在 CJK 字中插空白，`礁石` 實際存成 `礁 石`。改為 `_find_anchor`：詞優先、別名次之、`context_sentence` 只當 tiebreaker，且比對前兩邊都去空白；定位不到就丟棄，空殼意象不落庫。真實資料重放 80.3% → **100%**，丟棄 0。第二個根因另立 B-083 追蹤未修的部分。

## B-081 四個服務的 token 歸屬缺口（共 7 處）✅ 完成（2026-08-20）

**背景**: 2026-08-19 執行「LLM 呼叫慣例收斂」計畫 P4 時清點出來的。計畫只
盤點了「有呼叫 `set_llm_service_context` 但漏帶 `book_id`」的站點，因此漏掉
更嚴重的一類 —— **根本沒有呼叫過的**：

| 位置 | LLM 呼叫處 | 作用域裡有書嗎 |
|---|---|---|
| `agents/timeline_agent.py:_process_batch` | 1 | **有** —— 簽章就帶 `document_id` |
| `services/epistemic_state_service.py:_infer_misbeliefs` | 1 | 沒有 |
| `services/epistemic_state_service.py:_classify_batch` | 1 | 沒有 |
| `services/voice_profiling_service.py:_llm_qualitative` | 1 | 沒有 |

這三個服務都由 `api/deps.py` 直接注入 router，**不經過任何會設 context 的
入口**。它們的 token 因此記在 contextvar 的預設值 `"unknown"` 上，或更糟 ——
同一個 context 裡前一段程式留下的服務名。

**為什麼本次沒順手修**: 要遷移它們就必須替它們指定一個 `service` 標籤，
而那會直接改變 token 帳目的分類結果。那是資料語意的決定，不是「收斂呼叫
慣例」的範圍（CLAUDE.md 紅線：任務範圍外的改動另開任務）。

**2026-08-20 複查：漏了第四個服務，而且穿透簽章那點是錯的**

`narrative_service` 的三處（`_call_refine_llm` / `_call_hero_journey_llm` /
`_call_temporal_order_llm`）**有**呼叫 `set_llm_service_context("analysis")`，
但不帶 `book_id`；而 `api/routers/` 底下**沒有任何一支 router 設過 book context**，
所以它靠不到上游。症狀與上表四處不同（不是 `"unknown"`，是 `service="analysis"` +
`book_id=NULL`），按「沒呼叫過」去找會直接漏掉。**缺口總數是 7 處，不是 4 處。**

原記「epistemic / voice 的 `book_id` 需要從 router 往下穿，會動到公開方法簽章」**不成立**：
`get_character_knowledge` / `classify_event_visibility` / `get_voice_profile`
三個公開方法**早就都有 `document_id`**，缺的是私有方法。而 contextvar 的語意本來就是
「進入點設一次、下游沿用」，所以設在公開進入點即可 —— **不動任何簽章、不動任何 router**。

**裁示（2026-08-20）**: service bucket 選**併入 `analysis`**，前端零改動。
完整規劃見 [`docs/plans/20260820-token-attribution-remaining.md`](plans/20260820-token-attribution-remaining.md)。

> **該計畫的 §5 Task 3 不必做（2026-08-20 查證）。** 計畫 §4.2 記「3 筆
> `summary` + `book_id=NULL` 是從 rerun 入口進來的」，並據此開了「Task 3：
> 查清 rerun 路徑的 summary NULL」。**那個判讀是錯的**：歸因修正 `7e5f4af`
> 落地於 **2026-08-19 10:08**，而那 3 筆的時間是 **2026-08-18 00:03** ——
> 修正當時還不存在，它們就是普通的修正前資料，rerun 路徑沒有缺口。
>
> 錯誤來源是拿日期粗估當分界（用「08-18 之後」代表「修正之後」），而沒查
> 修正 commit 的實際時間戳。以真正的分界重查：**之前 4,136 列全部 NULL
> （每個 service 都 100%），之後 70 列零 NULL**。
>
> 但「之後零 NULL」**不能**反證 B-081 沒必要做：那 70 列只涵蓋當時實際跑過的
> analysis / extraction / keyword / summary / imagery，本條目修的七處是潛伏的，
> 要那些功能被跑到才會現形。

**與該計畫的關係**: 這是 `docs/plans/20260819-llm-call-convention-consolidation.md`
§2.1 那個缺口的**第二層** —— 該計畫修掉了「有呼叫但漏帶書」，這條是「連
呼叫都沒有」。

**觸發時機**: 下次要讓 `GET /tokens/usage?bookId=...` 的 by-book 加總逼近總量時。

---

**完成**: PR #62。四處補 `set_llm_service_context`、narrative 三處補 `book_id`，全部設在**公開進入點**（四者本來就都收 `document_id`，原記「需從 router 往下穿、會動公開簽章」不成立）。service bucket 依裁示併入 `analysis`，前端零改動。另加 AST 掃描測試，要求每個含 `ainvoke` 的模組都設 context —— 該測試當場找出人工清點漏掉的第八處（`book_ingestion.py` 的 `graph.ainvoke`，查證為 LangGraph 非 LLM，已豁免）。

## B-083 pypdf 在 CJK 字中插空白，逐字元比對因此漏數 ✅ 完成（2026-08-20）

**背景**: 2026-08-20 修 B-079 時查出。原本把一筆定位不到的意象判成 LLM 幻覺，
用戶指出「意象都是從文本拉出來的，不可能不存在」才回頭查真因。

`loader.py:104` 的 `pypdf` `page.extract_text()` 依字形座標推斷空白，CJK 遇到行末
斷字就把一個詞切成兩半 —— 段落實際存的是 `走下了礁 石`，不是 `走下了礁石`。

**盛行率**（「中文字 + 空白 + 中文字」的段落佔比）:

| 書 | 來源 | 佔比 |
|---|---|---|
| 3pigredhood | pdf | **85.7%** |
| Age of Fire | pdf | **71.4%** |
| 名字的潮汐 | pdf | **66.0%** |
| 大唐雙龍傳 | txt | 12.1% |

**已修的**: 意象定位（B-079）已在 `symbol_discovery/pipeline.py` 加 `_squash()`，
比對前兩邊都去空白。

**未修的 —— 本條目**: `knowledge_graph/pipeline.py:161` 的
`chapter_text_lower.count(entity.name.lower())` 是同一種逐字元比對。實測 470 個實體
中 **41 個（8.7%）漏數**，累計漏掉 48 次：

```
薩爾瑪雷納   15 → 18        退名之潮   6 → 10   （漏 40%）
讀鹽人      22 → 24        母親      27 → 29
```

**為什麼值得修**: `mention_count` 不只是顯示用的數字。

| 消費端 | 用途 | 漏數的後果 |
|---|---|---|
| `entity_linker.py:96` | `max(group, key=mention_count)` 選**正規名稱** | 可能翻轉哪個字面成為正式名 |
| `faction_service.py:136` | 派系權重 | 權重偏移 |
| `book_graph.py:93` | 圖譜節點大小（`chunk_count`） | 節點大小失真 |
| `AnalysisListItems.tsx` | 角色列表的提及長條與數字 | 使用者直接看到 |

**待辦內容**:
- 決定正規化的落點：在 `pipeline.py` 就地 squash，或在 loader 端就把字中空白修掉
  （後者影響所有下游，但會改動已入庫文本的語意，且無法回溯既有書）
- 若採前者，`symbol_discovery/pipeline.py` 的 `_squash()` 可抽成共用 helper
- 英文書要留意：去空白會讓兩個相鄰單字接成一個假命中（中文無此問題）

**觸發時機**: 下次動到 KG 實體抽取或 EntityLinker 時。

---

**完成**: PR #64。新增 `core/utils/text_matching.squash_spacing()`，`mention_count` 與意象定位共用（後者原本在 `symbol_discovery` 就地寫了一份，一併收斂）。

規劃時列的「英文書要留意去空白會接出假命中」促使一度打算只去 CJK 之間的空白，**但那是錯的**：書裡的版權頁存的是 `霧  港  文  化 　 F O G  H A R B O R  P R E S S`，拉丁文一樣被逐字元加空白，只去 CJK 空白的話 `Fog Harbor Press` 這種實體永遠對不上。兩種算法在 470 個實體上結果完全相同（41 vs 41），測量分不出高下，故依證據選全部去空白；突變測試把這個決策釘住（改成只去 CJK 空白，拉丁文那項即紅）。代價（`"these ashes"` 含有 `"sea"`）寫成測試，讓它是已知取捨而非日後的意外。

小資料實跑（真實章節 + 真實 pipeline，只換掉 LLM 抽取）：ch9 礁石 **0 → 1**（確實出現在該章卻被算成零次）、ch8 瑪蒂爾德 5 → 6、ch10 瑪蒂爾德 3 → 4。

既有資料不寫遷移腳本 —— `mention_count` 是抽取階段算的，重跑 `rerun/knowledge-graph` 即重算，而該路徑已於 PR #60 修成冪等。

---

#### B-066 前端 `tsc -b` 既有 10 項型別錯誤
**背景**: `npm run build` 已納入 DoD（見 `CLAUDE.md`「完成後必報」），但判準是「無新增」而非「全綠」——因為 main 上本來就有 10 項既有錯誤。這些錯誤不影響 build 產物（vite 走 esbuild，不做型別檢查），但會讓 `tsc -b` 永遠是紅的，久了就沒人看，等於閘門形同虛設。2026-07-30 就有一個 runtime ReferenceError（`BatchEepPanel` 引用已刪除的 `runningAnalyzed`）混在噪音裡差點進 main。

**清單**（2026-07-30 於 main 實測）:
- `components/upload/MurmurWindow.tsx` × 3 — `Cannot find name 'MurmurWindowProps'`（型別定義整個不見），連帶兩個 implicit any
- `components/upload/ProcessingCard.tsx` × 2 — 讀 `TaskStatus.createdAt`，但該欄位不存在於型別上
- `pages/EventAnalysisPage.tsx` × 3 — `sourceData.passages` possibly undefined × 2、`TFunction` 傳入自訂 `(k, o?) => string` 簽章不相容
- `components/graph/EntityDetailPanel.tsx` × 1 — `factionData.factions` possibly undefined
- `hooks/useTaskNotifications.ts` × 1 — `string | null | undefined` 傳給只收 `string | undefined` 的參數

**待辦內容**:
- 逐項修掉（多數是補 optional chaining 或缺失的 props 型別，`MurmurWindowProps` 需確認是被誤刪還是從未定義）
- `ProcessingCard` 的 `createdAt` 要先確認後端是否真的有回傳——若有，是 `generated.ts` 沒重新產生；若沒有，是前端讀錯欄位
- 清完後把 DoD 的判準從「無新增」改成「全綠」，並考慮加進 CI

**注意**: 這是獨立的清理任務，不要夾帶在功能 PR 裡。

**觸發時機**: 下次動到 upload 或 event analysis 相關檔案時順修，或決定把 `tsc -b` 加進 CI 之前。

---

**完成**: 2026-08-20，批次 1（前端重構）。10 項逐條對應清完，`npm run build` 在 main 上
首次 exit 0。

規劃時的兩個未決問題都有了答案：

`MurmurWindowProps` 是**被誤刪**的，不是從未定義——`MurmurWindow` 一直在解構
`{ events, characterSrc }`，只是型別註解指向一個不存在的名字，所以 runtime 正常、
只有 tsc 紅。補回定義即可。

`ProcessingCard` 的 `createdAt` **後端確實有回**：`generated.ts` 的 `TaskStatus`
有 `createdAt` / `kind` / `title` 三個欄位，是手寫的 `api/types.ts` 那份沒跟上。
正解是把 `TaskStatus` 接回 generated schema，但實測那樣做會浮出 7 個真實的
nullability 缺口（generated 的 `subProgress` 是 `number | null`，而
`useSymbolBatch` / 角色頁 / 事件頁三份批次進度複製碼都假設它不會是 null），
範圍超出本次任務，故先補欄位並在型別上留註記。手寫型別遮蔽真實缺口這件事本身
待另開任務處理。

DoD 判準要不要從「無新增」改成「全綠」、要不要進 CI，留給使用者決定——`tsc -b`
與 `eslint` 現在都是全綠，但那是本次觀測，未與後端 ruff 的現況一起評估。

---

#### B-067 mock 模式下時間軸覆蓋率恆為 0%
**背景**: 時間軸頁新增了「已分析／未分析」的虛線圈與覆蓋率列，靠每個事件的 `hasAnalysis` 欄位驅動。但 `frontend/src/api/mock/data.ts` 裡 29 筆時間軸事件的 `hasAnalysis` 全是 `false`——因為這些事件用 `evt-t*` 命名空間，而 mock 的事件分析（`mockEventAnalyses`）走的是 `ent-*`，兩邊根本對不起來。結果是 mock 模式下覆蓋率永遠 0%，這個新視覺完全展示不出對比。

**待辦內容**:
- 決定 mock 的事件分析要不要與時間軸事件共用 id 命名空間（目前 `evt-t*` vs `ent-*` 是分裂的）
- 若要讓覆蓋率可展示，需要一組有意義的混合值，而非隨手填——建議與 `mockEventAnalyses` 對齊後由真實對應關係推導，不寫死
- 一併確認 `temporalAnalyzed: false` 的設定是否也讓其他時序視覺在 mock 下失效

**觸發時機**: 需要用 mock 模式展示或截圖時間軸頁時，或下次整理 mock 資料時。

---

**不做**: 2026-08-20，批次 1（前端重構）。`api/mock/` 整層（2,166 行）連同 7 個
`api/*.ts` 裡的 `MOCK_ENABLED` 分支已一併移除，這條的前提隨之消失。

移除的理由不是「沒在用」，而是**它已經做不到它存在的目的**：19 個 endpoint 模組
裡只有 7 個有 mock 分支，缺的 12 個正好是後來才做的功能（tension、symbols、
narrative、buildOverview、voice、search、tokenUsage…）。把 `VITE_MOCK=true`
打開會得到一個書庫與閱讀頁能動、其他頁全空的 app。要讓它重新可用，得補 12 個
模組的 mock 並讓 19 個模組永遠跟著後端同步，而它依賴的 `api/types.ts` 本身
正在與 `generated.ts` 漂移。

順帶一提，本條描述的 `evt-t*` vs `ent-*` 命名空間分裂確實存在，但那是 mock
資料內部的問題，不影響真實資料路徑。

#### B-070 張力分析頁 RWD 未做
**背景**: 2026-08-05 張力頁翻新（Phase 3）以設計交付包的 1440px 定寬為基準落地，`frontend/src/styles/tension.css` 目前**一個 `@media` 都沒有**。設計交付包本身也只出 1440px 一稿，未涵蓋 1280 / 1024 / 窄視窗。這與時間軸頁 (`docs/UI_SPEC.md` §3.7「已知缺口」) 是同一類缺口。

**具體待決**:
- 右側 `TensionReviewDrawer` 固定 432px：窄視窗改 overlay 蓋住主體，還是推擠主體？
- 章節格點 `grid-template-columns: 320px repeat(N, 1fr)`：章節數多的書（如大唐雙龍傳）超過 N 章時橫捲、分頁、還是按區間聚合？
- `TensionLineTable` 7 欄在 1024px 怎麼收（哪幾欄可折、可否改雙行）？

**注意**: 格點的收斂策略會影響 `TensionChapterGrid` 的資料聚合方式，不是純 CSS 題。

**觸發時機**: 窄視窗使用回報，或統一處理全站 RWD 時（與時間軸頁 RWD 缺口一起做較省）。

**完成**: 2026-08-21，分支 `feat/tension-rwd`。三項待決的結論與理由記在
`docs/UI_SPEC.md` §3.8「已知缺口」，此處只記關鍵發現：

**橫捲本來就是設計意圖，是實作漏了一半。** `tension.css` 早有註解「Wide books scroll the
grid rather than the page.」與 `overflow-x: auto`，但欄寬寫成 `1fr`——展開是
`minmax(auto, 1fr)`，長章節書的欄位會一路壓縮到剩柱子寬，溢出永遠不發生，捲軸也就永遠不出現。
補上 `minmax(var(--tn-grid-cell-w), 1fr)` 的下限之後才真的會捲；標籤欄同時要 `sticky`，
否則捲動後看不出那排柱子屬於哪條張力線。**兩個半成品互相掩護，所以缺陷一直沒被看見。**

**實測**（`/verify`，《名字的潮汐》10 章 / 6 條張力線）:
- 1440 / 1200：版面與 main 一致，格點 `320px + 10 欄`、表格維持 7 欄
- 1080：表格收成 5 欄，極點欄從 515px 回升到 557px；抽屜轉 `absolute`，主欄不再被壓縮
- 900：章節與證據數確實落到第二行（實測 bounding box row2），列高 48 → 86px
- 360（強制溢出）：`scrollWidth 430 > clientWidth 234`，捲動 0 → 196 標籤欄 `left` 恆為 87
- Ink 主題：sticky 欄背景為不透明白、右框線為黑，`--card-shadow: none` 下靠框線分隔
- 四個寬度下 `document.documentElement` 皆無水平捲動；console 0 errors

**未修（不在範圍）**: `審核` 欄 152px 裝不下「核准／修改標籤／拒絕」，三顆按鈕在 1440px
就已經是兩行（實測 44px 高，各寬 42 / 59 / 40）。**這是 main 既有的問題，非 RWD 造成**——
1440 / 1200 / 900 三個寬度量到的數值完全相同。

**未做**: B-071（a11y）仍獨立開著；本輪只動版面，沒有碰非視覺替代與 tab order。

**後續補記（2026-09-12，B-072）**: 本輪的實測涵蓋格點 / 表格 / 抽屜，**但沒有涵蓋
五段 stepper strip**——那條在 640px 以下會把標題折成兩三行、五格擠成直排文字，
360px 時「TensionLine 聚合」疊到隔壁格。它一直是壞的，只是上面「四個寬度皆無水平
捲動」的判準看不到它：strip 用 flex 壓縮而不是溢出，所以**不捲動，只是變得讀不了**。
已於 B-072 補 `max-width: 640px` 的直向堆疊。教訓與格點那兩個半成品同形——
**「沒有水平捲動」不等於「這個寬度可用」。**

---

#### B-062 tension / narrative 前端寫死 language='zh'
**背景**: `frontend/src/api/tension.ts` 與 `narrative.ts` 呼叫後端時預設寫死 `language = 'zh'`（NarrativePage 另以 i18n 語言判斷），而非書籍實際語言。籠統 `zh` 經 `get_language_display_name` 只能得到 "Chinese"，不保證繁簡變體——與 2026-07-17 角色分析簡體漂移是同一類 bug（該次已修 upload/ingestion/analysis 鏈，此兩處為殘留）。

**待辦內容**:
- 兩支 API helper 的 `language` 改由書籍 meta（document language，`zh-tw`/`zh-cn`）帶入，不用 i18n 語言、不寫死
- 檢查其他 `language` 參數呼叫端是否有同樣寫法（`symbols.ts` 等）

**觸發時機**: 張力 / 敘事分析輸出出現繁簡漂移回報時（或下次動到該兩頁時順修）。

---

### 🟢 低優先（可選升級）

**完成**: 2026-08-21，分支 `feat/book-language-field`（後端 Step 1 + 前端 Step 2）。

**影響比本條目記載的大。** 條目說「籠統 `zh` 只能得到 Chinese，不保證繁簡變體」，語氣像是
邊緣狀況。實測 DB 四本書**全部**存 `zh-tw`，而 `get_language_display_name` 是
`"zh" → "Chinese"`、`"zh-tw" → "Traditional Chinese"`，這字串直接進 prompt 的
`"Respond in {name}."`。所以每一本書的張力／敘事分析都在被告知「用中文回答」而非
「用繁體中文回答」，繁簡交給模型猜。**不是潛伏 bug，是四本書全部正在踩。**

**根因不是前端偷懶**: `BookResponse` / `BookDetailResponse` 都沒有 `language` 欄位，前端
根本拿不到書的語言。Step 1 先把輸入補上（只加在 `BookDetailResponse`，列表用不到）。

**範圍比條目記的廣**: 條目只提 tension / narrative 兩頁，實際是**三頁六個呼叫點**——
`TimelinePage.tsx:442` 的 `triggerTemporalAnalysis(bookId)` 連傳都沒傳，靜默吃預設值。

**做法**: 移除 `api/tension.ts` / `api/narrative.ts` 六處 `language = 'zh'` 預設值，改為必填。
**但這只擋得住「忘記傳」，擋不住「傳錯」**——實測 `tsc` 只抓到 TimelinePage 那一個，
其餘五處本來就有傳值（`'zh'` 字面量或 `i18n.language`），型別看不出語意錯誤。

`NarrativePage` 原本的兩處**比寫死更糟**：跟的是 `i18n.language`，也就是**介面語言**。
英文介面讀中文書會請求英文分析。與 B-060「EN 介面 + 中文書計數全 0」是同一個模式。

**驗證**（`/verify`，攔截 POST body，不讓請求打到後端以免燒 LLM 呼叫）:
- `GET /books/{id}` 回傳 `language: 'zh-tw'`
- `POST /tension/theme/synthesize` body 帶 `"language":"zh-tw"`（原為 `"zh"`）
- **英文介面 + 中文書**：`POST /narrative/hero-journey` 帶 `"language":"zh-tw"`（原為 `"en"`）
- `TimelinePage` 那條**只有 compile 層驗證**：觸發鈕被覆蓋率門檻擋住（見 B-065 記的同一情境），
  強制解除 `disabled` 後 handler 自己還有守衛，runtime 沒走到

**順帶產出**: `npm run gen:types` 帶出既有漂移（`bookId` 從未重生過）；`api/types.ts` 檔頭
「四個刻意留在手寫」更正為六個，見 B-084。

---

#### B-085 五道閘門沒有任何 CI 在盯
**背景**: 2026-08-20 前端批次 1–4（PR #66）把 `npm run build` 修綠之後，閘門首次同時
全綠，CLAUDE.md 的 DoD 判準也隨之從「無新增」改為「全綠」。評估後決定**暫不建 CI**，
此條記錄這個決定與它的代價。

**閘門清單以 CLAUDE.md「程式碼品質」為準，此處不重列。** 本條原本自己列了四道，
而 `docs/guides/TESTING.md` 另外要求 `ruff check tests/`、CLAUDE.md 又說三道——
三份文件三個數字。2026-08-21 已收斂：`ruff check tests/` 補綠（126 條），
清單統一放在 CLAUDE.md，本條與 TESTING.md 都改為指回去。

代價很具體：**B-066 就是「沒人盯」的產物**。那 10 個型別錯誤不是一次寫出來的，
是因為 `tsc -b` 長期紅著、紅久了沒人看，才從 0 慢慢累積到 10 個——其中還混著一個
引用了已不存在 interface 的檔案。把閘門弄綠而沒有東西在盯，等於只是把碼表歸零重跑。

**待辦內容**:
- 建 `.github/workflows/`，跑 CLAUDE.md 列的那幾道（repo 是 public，Actions 免費；實測合計約 3 分鐘）
- Python 依賴用 `uv`；測試跑 `-m "not integration"`（`integration` 那組需要真實 API key）
- 注意 `task_store_backend` 預設是 sqlite、`.env` 才是 memory，兩種 backend 的行為不同
  （見 2026-08-19 那次 22 項紅測試），CI 要明確指定用哪一種
- 建起來之後，CLAUDE.md 裡「沒有任何 CI 在盯這五道閘門」那段要一併改掉

**觸發時機**: 下次發現閘門又變紅時，或有第二個人開始提交時（單人開發靠自律還撐得住，
多人就撐不住）。

**完成**: 2026-08-22，`.github/workflows/gates.yml`。

**觸發條件是自己滿足的，不是改變主意。** 本條原本寫的觸發時機是「下次發現閘門又變紅時，
或有第二個人開始提交時」。2026-08-21 一輪工作裡同時撞到三件事，全部都是「沒有東西在盯」
的直接產物：

- `ruff check tests/` 紅著 **126 條**，而且查下來**從來沒綠過**——B-049 清的是 `src/`，
  PR #66 的 `14ffaf2` 對齊的是判準措辭，兩次都不含 `tests/`
- `generated.ts` 落後於後端，`bookId` 這個 query 參數前端手寫了型別、產生器從未重生
- 「幾道閘門」在三份文件裡三個數字（CLAUDE.md 三道、本條四道、TESTING.md 多一道且是紅的），
  沒有一個對

第三件最能說明問題：腐化的不只是閘門，還有**關於閘門的記載**。

**動工前查證的事**（決定了 workflow 長什麼樣）:

- **CI 上沒有 `.env`**（`.gitignore:11`）。實測把 `.env` 移開後 `pytest -m "not integration"`
  仍然 1822 passed，**所以 CI 不需要任何 secret**。這是最大的未知數，先確認才動工。
- **`TASK_STORE_BACKEND` 在 workflow 裡明確釘成 `sqlite`**。`.env` 設 `memory`，程式碼預設
  是 `sqlite`，CI 沒有 `.env` 所以會落到 `sqlite`——那是本機從沒跑過的路徑。兩種都實測過
  （各 1822 passed），但釘死而非放任預設：這兩條是真的不同的 code path，2026-08-19 的
  22 條紅測試就是這個差異造成的。
- **版本對齊本機**（Python 3.13、Node 24）。`pyproject` 只寫 `>=3.11`、`package.json` 沒有
  `engines`，若 CI 用比本機舊的版本，會產生本機重現不了的失敗。
- `uv.lock` 與 `package-lock.json` 都在 → `uv sync --frozen` / `npm ci`。無 extras，
  所以 `--all-extras` 拿掉了。

**指令逐字照抄 CLAUDE.md 的五道**，不發明變體——否則「CI 綠」與「閘門綠」會是兩件事，
而那份剛收斂成唯一權威的清單就不再是權威。

**額外加了一道 `pytest --collect-only`**：`integration` 那 3 條平常被 deselect，import
若被刪壞不會在一般測試裡顯示，只有 collect 會抓到。這是 2026-08-21 清 `tests/` lint 時
學到的——當時刪了 42 個未使用 import。
#### B-086 Ink 主題下狀態語意只靠顏色
**背景**: 2026-08-21 做 B-071 時從該條拆出。Ink 主題把 success / warning / error 塌成同一個黑，
所以任何「只用顏色區分狀態」的指示在 Ink 下都失去語意。stepper 已經處理過（用「圓形 machine /
方形 gate」的形狀差異），但其餘狀態指示**尚未逐一檢查**。

**為什麼獨立成條**: 這不是張力頁的問題。判準是全站的，且修法可能要動 `tokens.css` 與
`docs/DESIGN_TOKENS.md` 的對照表——與 B-071 其餘兩項（單頁、純元件層）的範圍不同，
混在一起做會讓一個 PR 同時改單頁行為與全站 token。

**待辦內容**:
- 先盤點：哪些元件的狀態指示只靠顏色（`tn-status-badge`、各頁的 review 狀態點、
  `--color-success` / `--color-warning` / `--color-error` 的所有使用端）
- 決定替代載體：形狀、圖示、或文字標籤——stepper 用形狀，可作為既有前例
- 若需新增 token，同步更新 `docs/DESIGN_TOKENS.md` 的對照表

**觸發時機**: a11y 稽核，或下次動到狀態指示元件時。

**完成**: 2026-08-22，分支 `fix/epistemic-timeline-row-labels`。

**盤點結果與條目的描述差很多。** 條目寫得像全站議題，實際上：

- **是四個 token 塌陷，不是三個**。本條原本只寫 success / warning / error，但 `--color-info`
  也在 Ink 下變成 `#151515`（`tokens.css:304`）。
- **109 處使用，但只有 14 組是「同一元件多種語意色」**。其餘 95 處是單一狀態（例如錯誤橫幅
  永遠是錯誤），沒有可混淆的對象，塌了也不影響語意。
- **14 組裡有 11 組本來就有非顏色載體**，顏色只是冗餘強化：

  | 元件 | 非顏色載體 |
  |---|---|
  | `.tn-stage` / `-dot` / `-kicker` | `done`→`<Check>`、`failed`→`<AlertTriangle>`，加 machine/gate 形狀，加標題文字 |
  | `.tn-status-badge` | badge 內就是狀態文字 |
  | `.ca-epi-block` / `-title` | `<Eye>` icon + 標題文字 |
  | `.ca-epi-count-dot` ×3 | 點旁邊就是數字 + 文字標籤 |
  | `.ea-participant-role` / `-legend-item` | `roleLabel()` 文字 |
  | `.st-input-flag` / `.st-nav-badge` | 各自的 badge 文字 |

- **2 組是死 CSS**（零 TSX 引用）→ 拆為 B-087，沒有順手刪。

**唯一的真問題是 `.ca-epi-pill`**（`ChapterTimeline`）。pill 內容只有數字，`title` tooltip 是
`Ch.3 · 事件A、事件B`——**不說 known 還是 unknown**，元件內也沒有圖例。兩列只靠
`top: 16px` vs `48px` 區分。預設主題下讀者是靠**顏色**把上方 `.ca-epi-counts` 的圖例對應到
下方 pill；Ink 下那些圖例點也全變黑，**對應關係整條斷掉**。計數本身還讀得到（有文字），
斷的是「哪一列 pill 是已知」。

**修法**: 在 timeline 左側加行首標籤，重用既有的 `knownLabel` / `unknownLabel`，未新增 i18n key。
選它而不選「pill 分形狀」，是因為形狀本身不自明——圓代表什麼仍然要查圖例，只是把「顏色要查
圖例」換成「形狀要查圖例」，而圖例在 Ink 下同樣是黑的。行首標籤所有主題、所有使用者都受益。

**實測**:
- 中文：標籤 top 351 / known pill top 350 —— 對齊；標籤右緣 377、最左 pill 400，間隙 23px
- **英文先撞了**：`Unknown` 右緣 403 > 最左 pill 400，**重疊 3px**。gutter 從 64px 加寬到 84px
  後間隙 17px。這個只在英文出現——gutter 要以最長的語系為準，不是最短的
- Ink：兩種 pill 背景皆 `rgb(21,21,21)`（**逐字相同**，證實塌陷屬實），標籤 `rgb(140,140,140)` 可讀
- `EpistemicCompareDrawer` 共用同一元件，容器 720px 扣掉 gutter 仍有 600px+ ——
  **此處是從寬度推算，未實測**（compare drawer 要先選兩個角色，pair mode 無法用合成事件驅動）

---

#### B-087 張力頁零引用的狀態色 CSS
**背景**: 2026-08-22 盤點 B-086 時發現，記為 `frontend/src/styles/tension.css` 有兩組狀態色規則
在 TSX 裡零引用（`.tn-summary-chip-dot.{approved,modified,rejected}` 與
`.tn-traj-status.{s-approved,s-modified,s-rejected}`，共 6 行），推測是張力頁翻新的殘留。
當時沒有順手刪除，因為 CLAUDE.md 的紅線寫明「禁止憑『看起來沒用』就刪程式」。

**完成**: 2026-08-22，分支 `chore/b087-dead-tension-css`。

**範圍比原記載大 40 倍：不是 6 行，是 243 行。** 原條目只查了那 6 行狀態色，沒有往上查父層。
實際零引用的是**兩個完整 section**：

| Section | 選擇器 | 規則數 |
|---|---|---|
| `/* Trajectory dashboard */` | `.tn-traj*`（含 `-legend`、`-chart`、`-density`、`-row-*`、`-axis-*`、`-status`） | 38 |
| `/* Summary chip bar */` | `.tn-summary*`（含 `-label`、`-chip`、`-chip-dot`、`-spacer`、`-actions`、`-hide-rejected`） | 13 |

原本的 6 行只是這兩段各自的最後幾條規則。刪除 `tension.css:379-621`，檔案 2112 → 1869 行。

**查證方法（比原條目的 grep 嚴格）**:
- 全 repo 搜尋不限副檔名，只有 `tension.css` 本身、worktree 副本、與 `BACKLOG.md` 提到這些字串
- 排除動態組出 class 名的可能：搜過 `` className={`tn-${ ``、`"tn-" +` 等組合形式，零命中
- 檔案內其餘部分（含 B-070 加的 RWD media query）沒有任何一處引用這兩組 class
- 刪除區間 379-621 內只有 `.tn-traj*` / `.tn-summary*` 選擇器，未夾雜其他規則

**旁證**: `TensionChapterGrid.tsx:25` 的註解自陳「This replaces the trajectory chart, which
encoded a line's chapter span as a…」——`.tn-traj*` 正是被它取代的那個元件留下來的。這比
grep 結果更有說服力：grep 證明「現在沒人用」，註解證明「為什麼沒人用」。

**教訓**: 盤點時查到零引用的葉節點，要往上查父層是不是也零引用。B-087 原本記成「兩段狀態色」，
是因為盤點 B-086 時只關心狀態色，看到 `.tn-summary-chip-dot.approved` 就停在那一行，沒有問
`.tn-summary-chip` 本身有沒有人用。結果把一次元件下架的殘留記成了幾行雜訊。

**異動**: `frontend/src/styles/tension.css`（-243 行，純刪除，無新增）。無 token 異動
（只是移除使用端），無 API 異動，無元件異動。五道閘門全綠。

#### B-052 log 中 `neo4j_url` / `qdrant_url` 遮罩
> 來源：2026-07-08 防禦性安全稽核（低風險項）。

**背景**: 啟動時會把 `neo4j_url`、`qdrant_url` 寫入 log。這兩個 URL 目前無內嵌帳密故無實害，
但一旦改用含帳密的連線字串（如 `neo4j://user:pass@host`）即會外洩。

**完成**: 2026-08-22，分支 `chore/b052-mask-db-urls`。

**盤點出 7 處，其中 1 處不是 log。** 條目寫的是「log 中」，但同一批變數還流進兩種非 log 的出口：

| # | 位置 | 型態 | 洩漏到哪 |
|---|---|---|---|
| 1 | `api/deps.py:91` | `logger.info` | log |
| 2 | `workflows/ingestion.py:846` | `logger.info` | log |
| 3 | `services/vector_service.py:99` | `logger.info` | log |
| 4 | `services/kg_migration.py:71` | `logger.info` | log |
| 5 | `services/kg_migration.py:179` | `logger.info` | log |
| 6 | `services/vector_service.py:95` | `RuntimeError` 訊息 | 例外訊息 → 進 log / traceback |
| 7 | `api/routers/kg_settings.py:139` | `HTTPException(detail=…)` | **HTTP response body** |

**#7 比原本要修的 log 更嚴重**，且純看條目標題不會發現：它把 URL 送進 503 的 response body
回給前端，一旦帶帳密就是外洩到瀏覽器，不只是本機 log 檔。決定一起做——同一個變數、同一種
洩漏、同一個 helper，把它留到另一條 backlog 只是讓已知的洞多開一陣子。

其餘 `neo4j_url` / `qdrant_url` 的出現處（`kg_settings.py:67/131/203/210`、`deps.py:87`、
`ingestion.py:848`、`vector_service.py:88`）都是把 URL 傳給 driver 或 migration 函式，
不是輸出，未動。URL 從來不是任何 response schema 的欄位（只出現在 `detail` 字串），
`API_CONTRACT.md` 也沒載明那段 503 文字，故 contract 無需更新。

**helper 搬到 `core/utils/url_masking.py`，不是複製。** 條目建議「複用 `settings_info.py` 的
`_mask_db_url` 遮罩模式」——照字面做會變成把同一段 `urlsplit` 邏輯抄五份。但直接 import 也
不行：`_mask_db_url` 是 api router 的私有函式，而要用它的是 `services/` 與 `workflows/`，
讓 service 去 import api router 是把依賴方向反過來。

所以搬到 `core/utils/`（`text_matching.py`、`output_extractor.py` 的同層），實作逐字不變。
沒有放進 `data_sanitizer.py`：那個模組管的是 LLM prompt 的注入防護，與連線字串遮罩是不同
關注點，同一個檔名下擺兩種「sanitize」只會讓之後的人找錯地方。

`settings_info.py` 的私有版本已刪除，四個既有測試隨受測對象移到 `tests/core/test_url_masking.py`
（依 TESTING.md「新測試依照受測程式碼的層級放入對應子目錄」），另補兩個：bolt URL 帶帳密、
無帳密 URL 不被改動。

**未做（可另開條目）**: 防回歸測試——以 AST 掃描確保新的 log 呼叫不會直接印 `settings.neo4j_url`
/ `qdrant_url`。B-081 用過這個手法。本次未做，因為條目沒要求，且 7 處已收斂到單一 helper。

**異動**: 新增 `backend/storysphere/core/utils/url_masking.py`；修改 `api/deps.py`、
`api/routers/kg_settings.py`、`api/routers/settings_info.py`、`services/kg_migration.py`、
`services/vector_service.py`、`workflows/ingestion.py`；`tests/api/test_settings_info.py`
→ `tests/core/test_url_masking.py`。無新依賴（`urllib.parse` 是標準庫）。五道閘門全綠。

#### B-064 未分析卡「生成分析」按鈕文字對齊 canvas「建立」
**背景**: 角色清單未分析卡的按鈕文字取自 `analysis.json` 的 `generate` key（「生成分析」），
設計稿 canvas 為「建立」。該 key 被多處共用，不能直接改值。

**完成**: 2026-08-22，分支 `fix/b064-create-btn-wording`。

**共用者是 4 個，不是條目寫的 3 個** —— 漏了 `EventRankingView`。逐一對 UI_SPEC 查過用字後
只改其中兩處：

| 呼叫點 | 介面 | UI_SPEC 用字 | 處置 |
|---|---|---|---|
| `AnalysisListItems.tsx:128` | 角色清單卡 | `:359`「建立」 | 改用新 key |
| `RankingView.tsx:110` | 角色排行列 | 未載明（同一顆 `ca-item-mini-btn`） | 改用新 key |
| `EventListItems.tsx:175` | 事件清單 | `:550`「建立分析」 | 不動 |
| `EventRankingView.tsx:134` | 事件排行列 | 未載明 | 不動 |
| `CharacterAnalysisPage.tsx:568` | 角色空狀態主 CTA | 未載明 | 不動 |

**`RankingView` 一併改的判準**（條目留的待確認項）: 排行列與清單卡是**同一顆按鈕** ——
都是掛在角色列右側的 `ca-item-mini-btn`，而 UI_SPEC `:425` 描述整條流程時寫的就是
「點擊『建立』（未分析角色）」。同一個檔案裡的 Hero 卡早已用 `character.overview.ranking.createHero`
=「建立核心角色分析」對過稿，只有排行列漏掉，是同一次對稿的殘留。

**事件兩處刻意不動**: 那是另一種介面，UI_SPEC 給的用字也不同（`:550`「建立分析」）。
把它們一起改成「建立」會是在本條範圍外替事件頁做對稿決定。

**新 key 放 `character.list.createBtn`**（zh-TW「建立」/ en `Create`）: `character.list`
namespace 已存在（`searchPlaceholder` / `frameworkLabel` / `mentionCount`），不建新結構。
`RankingView` 的排行列雖然在 `character.overview.ranking` 底下，仍取用這個 key —— 它渲染的是
`ca-ov-rank-list` 裡的角色列，與清單卡同一種 affordance，複製一份同值的 key 只會讓下次改字時
漏掉一邊。

`generate` key 保留，仍有三個呼叫端在用。

**UI_SPEC 未改**: `:359` 本來就寫「建立」，是實作沒跟上，spec 不需修正。

**異動**: `frontend/src/i18n/locales/{zh-TW,en}/analysis.json`、
`frontend/src/components/analysis/AnalysisListItems.tsx`、
`frontend/src/components/analysis/overview/RankingView.tsx`。無新依賴。五道閘門全綠。

#### B-061 前後端原型 taxonomy 漂移防護測試
**背景**: `frontend/src/data/frameworksData.ts` 的 jung/schmidt item 名稱必須與
`backend/storysphere/config/character_analysis/*.json` 逐字一致（原型篩選以字串相等計數），
此跨層契約過去無任何防護，導致 Schmidt 佔位 5 筆、Jung 兩筆名稱漂移半年未被發現
（2026-07-18 已修）。當時僅靠 `frameworksData.ts` 開頭的 CONSTRAINT 註解提醒。

**完成**: 2026-08-22，分支 `test/b061-archetype-taxonomy-drift`。

**放後端 pytest，不是前端 vitest。** 條目說兩者「擇一納入 CI」，但兩者不等價：五道閘門
（CLAUDE.md）裡有 `pytest -m "not integration"`，**沒有** `npm run test`。vitest 前端雖然
裝了、`package.json` 也有 `test` script，寫進去卻不會在 CI 跑，除非再加第六道閘門——
而那份清單才剛在 B-085 收斂成單一權威，為一個測試去動它不划算。放 pytest 則自動落在
既有閘門裡，零 CI 改動。

前例是 `tests/docs/test_docs_drift.py`：它同樣是後端 pytest 讀前端檔案
（`frontend/src/styles/tokens.css`）做跨層契約檢查。本檔案沿用它的 `REPO_ROOT` 路徑模式。

**檔案放 `tests/config/test_archetype_taxonomy_drift.py`**，與既有的 `test_archetypes.py`
同層（同一個主題），但分開檔案：那份測的是 loader 的行為（純後端單元測試），這份是解析
前端檔案的跨層契約，混在一起會讓「這個檔案在測什麼」失焦。後端側取值用既有的
`config.archetypes.load_archetypes()`，不自己讀 JSON。

**比對的是 `{id: name}` 對應，不是有序清單。** 真正的契約是「同一個 id，兩邊顯示名相同」；
要求陣列順序一致會比契約更嚴，前端排版調整就會誤報。dict 相等同時涵蓋名稱漂移、少一筆、
多一筆三種情況。

**解析器哨兵**：檔案解析型測試的典型失效是「regex 抓不到東西 → 空對空 → 靜默通過」。
所以除了比對本身，另有一條 `test_parser_finds_items` 專門驗解析結果非空，且
`_array_region` / `_framework_items` 在找不到錨點時直接 assert 失敗並說明「解析器需要更新」。

**已實測會失敗**（改壞再還原，三種情境）:

| 情境 | 結果 |
|---|---|
| 名稱漂移（`英雄` → `英雄角色`） | 1 failed |
| 前端少一筆（刪掉 `ruler`） | 1 failed |
| 解析器失效（改掉陣列名 `FRAMEWORKS_ZH`） | 4 failed |

**現況**: 四組（jung/schmidt × zh/en）目前全部一致，共 12 + 45 筆。本次補的是防護，不是修
bug——2026-07-18 那次修正到現在沒有再漂移。

`frameworksData.ts` 的 CONSTRAINT 註解補了兩行，指向這個測試並說明它會解析下方的
`{ id: '…', name: '…'` 形狀，改格式時要一併更新解析器。

**異動**: 新增 `tests/config/test_archetype_taxonomy_drift.py`（8 項測試）；
`frontend/src/data/frameworksData.ts` 註解 +2 行。無新依賴。五道閘門全綠（1830 passed）。

#### B-084 後端實體類別欄位是純 `str`，擋住四個前端型別接回 generated.ts
**背景**: 2026-08-20 前端批次 4 把 `api/types.ts` 手抄的型別接回 `generated.ts` 時，
15 個候選裡 11 個零成本接上，4 個接不了：`GraphNode`、`Segment`、`EntityChunkItem`、
`EntityChunksResponse`。原因是後端把實體類別宣告成純 `str`，而前端手寫版窄化成
`EntityType` union，全站十幾處靠這個窄化做窮舉比對與 `Record<EntityType, …>` 索引。
當時實測接回去會產生 12 個 `string is not assignable to EntityType`。

**完成**: 2026-08-22，分支 `refactor/b084-entity-type-literal`。

**值域盤點**（條目指定的第一步）:

| 欄位 | 實際值域 | 與前端 union 比對 |
|---|---|---|
| `GraphNode.type` | `EntityType` 6 值 ∪ `"event"` = 7 值（`routers/book_graph.py:91` 取 `e.entity_type.value`；`:113` 硬寫 `"event"`） | **完全相同** |
| `SegmentEntity.type` | `EntityType` 6 值（`book_reader.py:165` 的 enum，與 `:196` 的 `ParagraphEntity.entity_type: str`） | 前端多一個 `'event'` |

DB 實查（`var/storysphere.db`，93 個段落、2839 筆 entity）：character 1961 / location 428
/ object 225 / concept 130 / organization 95 —— 全在 6 值內，沒有野值，也沒有 `other`。
條目擔心的「後端可能有前端 union 未涵蓋的值」不成立，實際是反過來：前端多的 `'event'`
是圖譜獨有，domain enum 裡沒有。

**用 domain enum，不另寫一份 Literal 清單**: `api/schemas/entity.py:7` 已有
`from storysphere.domain.entities import EntityType` 的前例（方向 api → domain，正確），
且 `generated.ts` 早就有 `EntityType: "character" | … | "other"` 這個 component。另寫一份
值清單會製造第二個真相來源——那正是 B-061 剛補防護的那類漂移。

`GraphNode.type` 寫成 `EntityType | Literal["event"]` 而非擴充 enum：`"event"` 只在圖譜
成立，塞進 domain enum 會讓所有實體端點都多一個永遠不會出現的值。

**API_CONTRACT 不需更新**: `:261` 早就把 `EntityType` 定義成 7 值（含 `'event'`），`:816`
也早就寫 `GraphNode.type: EntityType`。**是後端沒跟上自己的契約**，這次是實作追上文件。

**只需改 1 個消費端，不是預期的 12 個 cast。** 因為後端收窄後產出的 union 與前端手寫的
逐字相同，十幾處 `Record<EntityType, …>` 全部原封不動。唯一要改的是
`GraphPage.tsx:1203` 的區域 Map 型別——generated 的 `chapterTitle` 是 `string | null`
（Pydantic 的 `str | None`），而該 Map 宣告成 `string | undefined`。改成
`string | null | undefined`；下游是 `group.title || fallback`，`null` 與 `undefined`
行為相同。

**`EntityType` 改為從 generated 推導**: `components['schemas']['GraphNode']['type']`，
不再手寫。

**驗證方式**: `npm run build` 綠只證明編得過，不證明型別正確——若收窄失敗、`EntityType`
退化成 `string`，`Record<string, …>` 一樣編得過。所以另外寫了一個臨時的型別斷言檔跑
`tsc --noEmit`，用雙向 `extends` 驗四件事：`EntityType` 恰好是那 7 個字面值、不是 `string`、
`Segment.entity.type` 恰好是 6 值、`GraphNode.type` 恰好是 7 值。四項皆通過；又把預期值
改成 6 個確認斷言本身會紅（`_1` / `_4` 失敗），才刪掉臨時檔。

**產生 `generated.ts` 的方式**: `npm run gen:types` 需要跑著的後端。改用離線
`create_app().openapi()` 產 spec 再餵 `openapi-typescript`。先用**未改動**的 spec 重產一次
與現有 `generated.ts` 比對，**byte-identical**，確認兩條路徑等價後才用它產新版。
後端改動只讓 `generated.ts` 動了 2 行。

**沒做的那一半 → B-088**: `Book` / `BookDetail` 卡的是 `BookResponse.status`。盤點發現
後端兩個建構點都硬寫 `status="ready"`，從不輸出別的值，而前端 `BookStatus` 有 4 個值。
這不是型別宣告問題，是要先回答「那 4 種狀態是未實作的設計還是已廢棄的舊設計」，故拆出。

**異動**: `api/schemas/book_graph.py`、`api/schemas/books.py`、`frontend/src/api/generated.ts`
（重新產生）、`frontend/src/api/types.ts`、`frontend/src/pages/GraphPage.tsx`。無新依賴。
五道閘門全綠。

#### B-088 書卡狀態徽章永遠是「已就緒」
**背景**: 2026-08-22 做 B-084 時盤點出來的。書庫書卡右上角（`BookCard.tsx:70`）與閱讀頁
書籍概覽（`BookOverview.tsx:118`）的 `StatusBadge` 設計上有四種樣子——已分析（綠）／
已就緒（藍）／處理中（琥珀）／錯誤（紅）——但後端 `books.py` 的兩個建構點都硬寫
`status="ready"`，所以**每本書都是藍色的「已就緒」，「已分析」篩選點下去永遠是空的**。

`Book` / `BookDetail` 也因此卡著接不回 `generated.ts`，是 B-084 唯一沒收掉的兩個型別。

**完成**: 2026-08-22，分支 `feat/b088-book-status`。

**條目原本假設要在 4 個值裡二選一，查證後發現只有 3 個是真的。** 原記載把問題寫成
「那 4 種狀態是未實作的設計還是已廢棄的舊設計」，但 `processing` 兩者都不是——它**結構上
就產不出來**：

- `GET /books` 的 docstring 自己寫明會濾掉還在跑 ingestion 的書（`books.py:81-84`），
  前端另外用 `ProcessingBookCard` 畫。所以列表裡的書永遠不可能是「處理中」
- `StepStatus` 只有 `pending` / `done` / `failed`，**沒有 `running`**。停在 `pending` 的步驟
  可能正在跑、也可能根本沒被要求跑，後端分不出來。用 `pending` 推 `processing` 會讓每本
  只跑了一半的書永遠顯示「處理中」
- `ProcessingBookCard` **完全沒用到** `StatusBadge` 或 `BookStatus`——它自己有 spinner、
  階段文字、進度百分比
- 「處理中」那顆篩選 pill **現在就是能用的**（`LibraryPage.tsx:190` 在該篩選下渲染
  `pendingTasks`），只是走另一條路。`safeBooks.filter(b => b.status === 'processing')`
  那半恆為空，對畫面沒有任何貢獻

所以 `processing` 從 `BookStatus` 移除，pill 與 `ProcessingBookCard` 一行沒動，畫面行為不變。

**判定規則**（`routers/books.py::_book_status`）:

| 條件 | 值 | 徽章 |
|---|---|---|
| 任一步 `failed` | `error` | 🔴 錯誤 |
| 四步全 `done` | `analyzed` | 🟢 已分析 |
| 其餘 | `ready` | 🔵 已就緒 |

「已分析」採「四步全 `done`」而非「知識圖譜跑完就算」。判定資料全在既有的
`PipelineStatus`，沒有新欄位、沒有 DB 遷移——只是把早就存著的東西收斂成一個值。

**順帶收掉 `PipelineStatusResponse`（必要，非順手）**: 接回 `BookDetail` 時 `tsc` 抓到
第四個錯誤——該 model 的四個欄位也是純 `str`，而前端手寫版窄化成 `StepStatus`。這是 B-084
同一個模式的再現，且不修就無法完成本條待辦的第三點（「之後 Book / BookDetail 才能接回
generated」）。改成 `StepStatus` enum 後 `PipelineStatus` / `StepStatus` 兩個前端型別也一併
接回 generated。

**至此 `api/types.ts` 不再有任何手寫的 response 型別**——B-084 收掉 4 個，本條收掉 4 個
（`Book`、`BookDetail`、`PipelineStatus`、`StepStatus`）。

**API_CONTRACT 這次是真的改了**（B-084 那次沒有）: `:79` 的 `status` 值域從 4 個改為 3 個，
並註明推導規則與為什麼沒有 `processing`。反過來，`PipelineStatus` 的部分**不需要改**——
`:69-72` 早就寫著 `'pending' | 'done' | 'failed'`，同樣是後端沒跟上自己的契約。

**移除的前端死碼**（都是 `processing` 恆假造成的，`tsc` 逐一指出，不是靠肉眼判斷）:
- `StatusBadge.tsx` 的 `processing` 樣式
- `BookCard.tsx` 的 `isProcessing`——只影響連結目標，恆假故連結固定指向書籍頁
- `RecentBookCard.tsx` 的 `case 'processing'`
- `LibraryPage.tsx:140` 的 `filter as BookStatus` cast——改寫成明確的三分支，把
  「processing 篩不到書是刻意的」寫進註解，而不是靠一個會說謊的 cast

**驗證**: 11 項純函數測試（三條分支、四個步驟各自失敗、無 JSON、帶 `*_at` 額外欄位的真實
資料）。另用臨時型別斷言檔跑 `tsc --noEmit` 驗 `BookStatus` 恰好 3 值、不是 `string`、
`StepStatus` 恰好 3 值、`Book`/`BookDetail`/`PipelineStatus` 的欄位型別對得上，並確認斷言
本身改錯會紅後才刪除。

**實際資料**: 現有 4 本書四步全 `done`，所以徽章會從「全部藍色」變成「全部綠色」——
一樣整齊，但這次是真的。

**異動**: `api/schemas/books.py`、`api/routers/books.py`、`tests/api/test_book_status_badge.py`
（新增）、`frontend/src/api/{generated.ts,types.ts}`、`frontend/src/components/library/`
三個元件、`frontend/src/pages/LibraryPage.tsx`、`docs/API_CONTRACT.md`。無新依賴。
五道閘門全綠。

---

## B-089 建構概覽把從未執行過的步驟標成「已完成」✅ 完成（2026-09-05）

**背景**: `unraveling_manifest.py` 的 `kg_concept` 節點狀態判定是
`len(concept_entities) > 0`。但 Concept 有兩個來源：ingestion 的 NER 填 `counts.ner`，
pre-analysis（B-025 `ConceptInferencePipeline`）填 `counts.inferred`。27 筆 surface
concept 因此讓節點恆為 `complete` —— 而 `inferred` 從來沒有非零過。

**專門用來回答「什麼還沒建」的那一頁，把一個從未執行過的步驟標成已完成。**

**查證依據**（不是推論）:

| 來源 | 結果 |
|------|------|
| `var/knowledge_graph.json` | 470 筆實體，`extraction_method` 全 `ner`，`inferred` **0 筆** |
| `var/backup-20260728-*/` | 241 筆歷史快照，同樣全零 |
| `git log -S "ConceptInferencePipeline" --all` | 4 個 commit：3 個純 docs + 它自己 2026-04-01 的誕生。**從未有過呼叫端** |
| `var/analysis_cache.db` | 99 筆 `teu` 前綴（張力分析確實跑過），無任何 concept 相關前綴 |

**實作**:
- `unraveling_manifest.py`：兩半都非零才 `complete`，任一半有值是 `partial`，
  都沒有才 `empty`
- `BuildOverviewPage.tsx`：從 `NODE_TO_TRIGGER` 移除 `kg_concept`
- `tests/api/test_unraveling.py`：4 個新測試（只有 ner／兩半皆有／只有 inferred／完全沒有）

**移除 CTA 是必要而非順手**: `ctaState` 由 `status === 'partial'` 推導，只改後端的話
CTA 會從隱藏變成顯示，而它對應的 `KG_RERUN` 只重跑 NER、永遠推不動 `inferred` 那半。
等於用「按不動的按鈕」取代「假綠燈」，比改之前更糟。移除後落回既有的 disabled
「觸發建構功能規劃中」佔位，與 B-046 Phase 2 其餘待接節點一致。

**保留不刪**: i18n 的 `cta.node.kg_concept` —— 端點補上後（B-092 第 2 段）會用回來。

**副作用（預期內）**: 建構概覽整體分數會下降，`score = (complete + partial * 0.5) / total`
使 `kg_concept` 從 1.0 變 0.5。那是正確的下降，先前的分數高估了。

**API_CONTRACT 未改也不需改**: #19 只定義 `status` 的三值域與 `counts` 形狀，
沒有記載各節點的推導規則，回傳 schema 一字未動。

**異動**: `api/unraveling_manifest.py`、`frontend/src/pages/BuildOverviewPage.tsx`、
`tests/api/test_unraveling.py`。無新依賴。五道閘門全綠（1847 passed）。PR #79。

**後續**: 接上 pipeline 本身、以及它「彙集整章卻截掉七成」的問題，見 B-092。

---

## B-090 零引用符號清除（第一批）✅ 完成（2026-09-05）

**背景**: 以 AST 掃描 `backend/storysphere` 全部 top-level 定義與 class 方法，比對
`backend + tests + scripts` 的引用數，排除兩類偽陽性（route handler 有 decorator、
不以名字呼叫；pydantic validator 由 `field_validator` 註冊）後，得到 5 個零引用符號。

**處置結果（三種，不是一種）**:

| 符號 | 處置 |
|------|------|
| `api/schemas/books.py` `EntityAnalysisResponse` | 刪除。端點實際用 `CharacterAnalysisDetailResponse` |
| `core/tracing.py` `is_tracing_enabled()` | 刪除。手足 `update_span` 7 處、`get_langfuse_handler` 3 處 |
| `frontend/src/api/types.ts` `EntityAnalysis` | 刪除。上者的前端雙胞胎，欄位一字不差 |
| `tools/schemas.py` `CharacterAnalysisOutput` | **不刪，改為讓工具用它** —— 見下 |
| `core/llm_client.py` `LLMClient.get_fallback()` | **暫緩**。零引用很可能就是 B-075「fallback 鏈是壞的」的成因，不是死碼 |

`CharacterAnalysisOutput` 是本批最值得記的一筆：它零引用，但 `analyze_character.py`
手刻了一個欄位逐字相同的 dict literal（`model_fields.keys()` 實比對，順序都一樣）。
同層手足 `analyze_event.py:52` 則直接建構 `EventAnalysisOutput`。所以那不是死碼，
是**被抄了一份的 schema**，兩者漂移不會有人發現。改為讓工具用它，順帶補上哨兵測試。

刪除 `EntityAnalysisResponse` 對 OpenAPI 的影響**用重產比對證明而非推論**：離線
`create_app().openapi()` → `openapi-typescript`，與 commit 版 `generated.ts` byte-identical，
故 `API_CONTRACT.md` 與 `generated.ts` 都不需更動。

**觸發時機**: 已執行。方法論與後續全面掃描見 B-091。

**異動**: `api/schemas/books.py`、`core/tracing.py`、`frontend/src/api/types.ts`（三處刪除）、
`tools/analysis_tools/analyze_character.py`、`tests/tools/test_analysis_tools.py`（+2 哨兵測試）。
無新依賴。五道閘門全綠（1849 passed）。PR #80。


---

## B-093 前後端 taxonomy 漂移防護只蓋了五分之二 ✅ 完成（2026-09-06）

**背景**: B-061 建立了「`frameworksData.ts` 的 item 名稱必須與後端 config JSON 逐字一致」
的防護，但 `tests/config/test_archetype_taxonomy_drift.py` 只 `parametrize` 了
`jung` / `schmidt` 兩個。`frameworksData.ts` 實際有 8 個 framework，其中 **5 個有後端對應檔**，
`frye_mythos` / `booker_plots` / `hero_journey` 三組跨層契約一直沒有守衛。

**盤點結果（2026-09-05 實比對）**:

| framework | 後端對應 | 修前涵蓋 | 修前現況 |
|-----------|---------|---------|---------|
| `jung` | `config/character_analysis/jung_archetypes_{en,zh}.json` | ✅ | 一致 |
| `schmidt` | `config/character_analysis/schmidt_archetypes_{en,zh}.json` | ✅ | 一致 |
| `frye_mythos` | `config/mythos/frye_mythos_{en,zh}.json` | ❌ | 一致（4/4 逐字相同） |
| `booker_plots` | `config/mythos/booker_plots_{en,zh}.json` | ❌ | id 有**刻意**差異 |
| `hero_journey` | `config/hero_journey/hero_journey_{en,zh}.json` | ❌ | **英文名稱已漂移 5/12** |
| `chatman` / `genette_temporal_order` / `sep_methodology` | 無 | — | 純前端理論文字，無從比對 |

**處置（PR #87，四件事）**:

1. **新增 id 集合對等測試**，五個 framework 都跑。名稱漂移是顯示問題，**id 漂移是功能
   問題** —— 英雄旅程的 UI 是拿 `stage_id` 去 `frameworksData` 查顯示名
   （`CrossEvidence.tsx:62`），少一個 id 就直接掉 fallback。
2. **名稱逐字相同測試從 2 個擴到 5 個**。對 jung / schmidt 這是功能契約（原型篩選用
   字串相等計數，差一個字 facet 就是 0、篩選恆空）；對其餘三個目前只是一致性，
   但維持同一條規則比「除了某某以外」好記。
3. **修掉已發生的漂移**：`hero_journey` 英文 5 筆對齊到後端（`Ordinary World` →
   `The Ordinary World` 等）。方向是**前端追後端**，理由有三：B-061 建立的規則本來
   就是這個方向；後端 JSON 用的是 Vogler 的正式命名，前端那份是有人自行縮寫；
   維持一條規則比多一條例外好。中文版 12 筆本來就逐字相同，未動。
4. **刪除 `config/hero_journey.py` 的 `STAGE_IDS` / `PHASES`**（21 行，全 repo 零引用）。

**`booker_plots` 的 id 差異是刻意的，不要「修掉」**: 前端是 `tragedy_booker` /
`comedy_booker`，後端是 `tragedy` / `comedy`。原因是 Frye 的四個 mythos 也有 `comedy`
與 `tragedy`，而前端把八個 framework 放在同一份清單裡需要唯一 id，故加後綴消歧義。
天真地比對 id 會在這裡誤報，故以 `_FRONTEND_ID_SUFFIX` 換算後才比對，理由寫在常數旁邊。

**英雄旅程的 taxonomy 原有四份拷貝**，這次刪掉沒人讀的那份：

1. `config/hero_journey/hero_journey_{en,zh}.json` —— 真相來源，`load_hero_journey()` 讀它
2. `config/hero_journey.py` 的 `STAGE_IDS` / `PHASES` —— **已刪**。零引用，且漂移測試
   照 B-061 的做法直接讀 JSON，不需要經過 Python 常數
3. `frontend/src/components/narrative/heroJourney.ts` 的 `STAGE_ORDER` / `STAGE_PHASE`
   —— 有在用（`stageOrdinal()` 靠它算序號），**不可刪且仍無防護，見 B-095**
4. `frontend/src/data/frameworksData.ts` —— 顯示名，英文已對齊

**哨兵實測四種漂移各紅、還原 30 綠**：① jung 名稱漂移 ② hero_journey 少一個 id
③ booker 的刻意後綴被「修掉」 ④ frye 名稱漂移。（B-061 建立的慣例：新增的漂移防護
必須實測自己會紅。）

**放後端 pytest 而非前端 vitest**: 同 B-061 的理由 —— 五道閘門裡有 pytest，
沒有 `npm run test`，vitest 寫了不會在 CI 跑。

**異動**: `tests/config/test_archetype_taxonomy_drift.py`、
`frontend/src/data/frameworksData.ts`、`backend/storysphere/config/hero_journey.py`。
無新依賴。PR #87。

**未做的一項**: 第 3 份拷貝（`heroJourney.ts` 的順序常數）的防護，另立 **B-095**。

---

#### B-092 ConceptInferencePipeline 從未接線，張力分析一直少一段證據

**背景**: `pipelines/concept_inference.py`（229 行，B-025，2026-04-01 產出）**從誕生至今
沒有任何呼叫端**。`git log -S "ConceptInferencePipeline" --all` 只掃到 3 個純 docs commit
與它自己的誕生 commit；全 DB 470 筆實體 `extraction_method` 全是 `ner`，`inferred` 0 筆，
2026-07-28 的備份快照同樣是零。

**它不是死碼，因為有兩個活著的消費者讀它該產出的東西**:
- `services/tension_service.py:879` —— TEU prompt 的 `## Inferred Concepts (thematic)`
  區段，`if inferred:` 分支從未進入過。已組裝的 99 筆 TEU 全數少了這段證據。
- `api/unraveling_manifest.py:204` —— 建構概覽的 `{"ner": …, "inferred": 0}` 計數。

**文件互相矛盾**: 設計文件（`docs/plans/20260331-tension-analysis-design-notes.md:141`）
寫它是硬性前置「完成後才能進行 TEU 組裝」，B-026 的前置依賴也列了 B-025；
`docs/guides/tension-analysis.md:25` 卻降級成「非必要但可提升品質」。
失效機制是 B-026 的「前置依賴 B-025」被「檔案存在」滿足，而不是被「流程會跑」滿足。

**成本實算（非估計）**: 整本書**一次** LLM 呼叫，輸入硬截 12,000 字元。以本專案
`token_usage.db` 校準得 0.73 tokens/字元，單本約 9,500 tokens ——
約當一次 Step 1 TEU 組裝（99 次呼叫、約 22 萬 tokens）的 **4%**。

**接上之前要先修的 bug**: 它蒐集段落的方式是「取候選事件所在章節 → 抓那些章的全部段落」，
而非抓高張力段落本身，然後硬截前 12,000 字元。《大唐雙龍傳》彙集 39,998 字元只送出
12,000，**丟棄 70% 且丟的一律是後段**，命題只看得到書的前段。書越長偏得越嚴重。

**三段拆法**:
1. ~~建構概覽 `kg_concept` 節點不再把只有一半當成完成~~ ✅ 已完成（B-089）
2. 新增後端端點，`kg_concept` 拆成 ner / inferred 兩節點，後者接進 `NODE_TO_TRIGGER`。
   沿用 B-046 Phase 1 的確認視窗與 task 輪詢；`cta.node.kg_concept` 的 i18n key 已保留。
   屬 B-046 Phase 2「無對應批次端點，需先新增後端」那一類。
3. 張力頁 Step 1 前提示「概念推論尚未執行」並跳建構概覽。
   現成樣式：`SymbolsPage.tsx:561` 已在做 `navigate('/books/:id/unraveling')`。

**第 0 段已完成（2026-09-09）—— 而且不只截斷那一個 bug**:

接線前先修截斷 bug 時發現，這個 pipeline 就算接上去也**跑不起來**。從未有呼叫端，
所以三個缺陷全都沒被執行過：

| 缺陷 | 後果 |
|------|------|
| 讀 `p.content`，但 `Paragraph` 的欄位叫 `text` | 第一個段落就 `AttributeError`，**每次必炸** |
| 產出的 `Entity` 沒設 `document_id` | 唯一的消費者 `tension_service.py:205` 用 `list_entities(..., document_id=…)` 撈，**跑成功也照樣看不到** |
| 硬截前 12,000 字元 | 如原本記載 |

前兩個比截斷更根本：截斷只是「證據偏前段」，這兩個是「根本不會有證據」。
`call_llm` 的 `book_id=None` 也一併改成 `document_id`——它上游沒有任何入口會設
contextvar，維持 None 等於保證不歸屬（B-081 同形）。

截斷改成 stride 取樣 + 補滿，預算不變（12,000 字元），改的是**哪些字元**。實測四本：

| 書 | 候選章 | 全文字元 | 舊：涵蓋章 | 新：涵蓋章 |
|---|---|---|---|---|
| 大唐雙龍傳 | 7 | 39,557 | ch1–2（**2/7**） | ch1–7（7/7） |
| 名字的潮汐 | 10 | 13,148 | ch1–10 | ch1–10 |
| 其餘兩本 | 5 / 3 | 未超預算 | 全含 | 全含 |

補了 `tests/pipelines/test_concept_inference.py`（原本 0 個測試，10 項），
三個缺陷各自實測會紅。

**已決（2026-09-09）—— 照 F-01 的形狀加側存 + pending/confirm**: LLM 產出先進側存、
狀態 pending，人工確認後才 `add_entity()` 進 KG。決定理由是命題進 KG 後會被
`assemble_teu` 當既有事實餵給下一輪 LLM，**錯的版本會被當前提繼續傳**——這正是
保守得多的圖演算法（F-01）反而設了關卡的原因。原本 `save=True` 直接寫入沒有任何關卡。

**入口位置已定**: 建構概覽，不是知識圖譜頁。節點已存在、CTA 機制已備妥，
且知識圖譜頁工具列已有「推斷關係」，再放一個「推斷概念」是撞名陷阱。
結果仍會出現在圖譜上（inferred concept 就是 `entity_type=concept` 的節點）。

**觸發時機**: 第 2 段待排；決定側存與否之後即可動工（第 0 段已排除技術障礙）。

**已完成（2026-09-10）—— 四段全部落地**

| 段 | 內容 | PR |
|---|---|---|
| 0 | pipeline 三個從未被執行過的缺陷 | #101 |
| 1 | 建構概覽不再把只有一半當成完成（B-089） | #79 |
| 2a–2d | 側存 + 審核流程 + 四個端點 + 節點拆分 + 前端接線 | #102 |
| 3 | 張力頁 Step 1 前提示「概念推論尚未執行」 | #103 |

**第 0 段揭露的事**: 接線前先修截斷 bug 時發現，這個 pipeline **就算接上去也跑不起來**。
從誕生至今沒有呼叫端，所以三個缺陷一次都沒被執行過：讀 `p.content`（`Paragraph` 的欄位
叫 `text`，第一個段落就 AttributeError）、產出的 `Entity` 沒設 `document_id`（唯一的消費者
用 `list_entities(..., document_id=…)` 撈，跑成功也看不到）、以及原本記載的硬截。**前兩個
比截斷更根本**：截斷只是「證據偏前段」，那兩個是「根本不會有證據」。

截斷改成 stride 取樣 + 補滿，預算不變（12,000 字元），改的是哪些字元。實測：大唐雙龍傳
39,557 字元從涵蓋 ch1–2（**2/7 章**）變成 ch1–7。

**待決的側存問題定案為「加」**: LLM 產出先落 `var/inferred_concepts.db`、狀態 pending，
人工確認後才 `add_entity()` 進 KG。理由是命題進 KG 後會被 `assemble_teu` 當既有事實餵給
下一輪 LLM，錯的版本會被當前提繼續傳。`ConceptInferenceStore.upsert` 刻意不照抄 F-01 的
`ON CONFLICT DO UPDATE SET status = excluded.status`——F-01 有一條 force_refresh 破壞性
重跑路徑（前端獨立按鈕 + confirm() 揭露），概念側存沒有，所以既有列一律保留
id / status / confirmed_entity_id / created_at。

**節點拆分**: `kg_concept` 保留原 id、語意收斂成 NER 那半，新增 `kg_concept_inferred`。
共用一個節點時它只能靠回報 partial 才誠實（B-089）——一個狀態說不了兩件事。拆開後
`kg_concept` 也把 `KG_RERUN` 接回去了：KG 重跑填滿的正好就是它現在宣稱的全部。

**瀏覽器實測抓到一個測試看不見的 bug**: `kg_concept_inferred` 原本掛了一條
`("kg_event", …)` 入邊。入邊在這張圖上的意思是「上游 complete 才准跑我」，而 `kg_event`
只有在每一個事件都帶敘事權重時才 complete——概念推論完全不需要那件事。結果是觸發按鈕
在種子書上被換成停用的「需先完成上游 1 個依賴」，而幾乎每本書都是那個狀態。**單元測試
驗的是邊存在，不是按鈕按得下去。** 已改成唯一入邊 `paragraphs` 並補守衛。

**端到端實測**（大唐雙龍傳，真實 LLM）: 觸發 → 5 筆命題落側存 → 清單渲染 → 採用寫進 KG
並回填 `confirmedEntityId`、節點翻成完整 → 否決移出待審。

**異動**: `pipelines/concept_inference.py`、`domain/inferred_concepts.py`、
`services/concept_inference_store.py`、`services/concept_inference_service.py`、
`api/routers/book_graph.py`、`api/schemas/book_graph.py`、`api/deps.py`、
`api/unraveling_manifest.py`、`pages/BuildOverviewPage.tsx`、`pages/TensionPage.tsx`、
`components/tension/TensionStateCards.tsx`、`api/graph.ts`、`api/queryKeys.ts`、
兩個 locale 的 `analysis.json`、`styles/build-overview.css`、`styles/tension.css`。
新增測試 33 項。無新依賴。`API_CONTRACT.md` #10e–#10h。

**未做**: B-069（張力證據同場景摺疊）仍等 B-068，與本項無關。

