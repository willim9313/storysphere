# 方法論頁 × 功能頁對齊盤點

**建立日期**: 2026-08-13
**狀態**: 盤點完成，待逐項排入實作
**目的**: `/methodology` 頁目前收錄六個框架，但各分析功能頁引用的理論並未全數對齊、也未全數連結過去。本筆記盤點缺口，作為後續「逐一修理」的清單，不是一次性重構計畫。

---

## 一、現況：`/methodology` 已收錄的六個框架

資料來源：`frontend/src/data/frameworksData.ts`（`FW_META`）。

| key | 分類 | 引用理論 | 對應功能頁 |
|---|---|---|---|
| `jung` | 角色分析 | Jung 12 原型（Archetypes of the Collective Unconscious, 1934 / Aion, 1951）+ Pearson 1991 系統化版本 | 角色分析頁 |
| `schmidt` | 角色分析 | Schmidt《45 Master Characters》(2001) | 角色分析頁 |
| `hero_journey` | 敘事弧 | Campbell《千面英雄》(1949) + Vogler《The Writer's Journey》12 階段版 (1992) | 敘事結構頁（英雄旅程區塊） |
| `frye_mythos` | 張力 | Frye《批評的解剖》(1957) 四季神話 + Aristotle《詩學》 | 張力分析頁（書級主題） |
| `booker_plots` | 張力 | Booker《The Seven Basic Plots》(2004) + Polti《三十六種戲劇情境》(1895) | 張力分析頁（書級主題） |
| `sep_methodology` | 象徵 | Barthes《Mythologies》(1957) + Saussure《普通語言學教程》(1916) + Eco《A Theory of Semiotics》(1976) | 符號分析頁 |

六個框架都有完整雙語引用（zh-TW/en）、pipeline 說明、輸出欄位表。**這部分本身沒有問題**，缺口在於「功能頁有沒有連過去」與「功能頁用到的理論方法論頁根本沒收錄」兩類。

---

## 二、逐功能頁缺口盤點

### 2.1 角色分析頁 — 已對齊

`CharacterAnalysisPage.tsx:363` 已有 `<Link to={`/methodology?framework=${framework}`}>`，原型卡可直接跳轉 Jung/Schmidt 條目。**無待辦**。

### 2.2 敘事結構頁 — 部分對齊

- 英雄旅程區塊：`HeroJourneySection.tsx` / `StageDetail.tsx` 已連結 `/methodology?framework=hero_journey`（UI_SPEC 3.14 §英雄旅程主視圖）。**已對齊**。
- 事件骨幹（PlotSpine）：副標直接寫 `Chatman kernel / satellite`（UI_SPEC 1556），但：
  - `frameworksData.ts` **沒有 `chatman` 這個 key**，方法論頁的「敘事弧」分類目前只有 `hero_journey` 一項。
  - 該區塊底部只連「事件分析頁」（UI_SPEC 1582），不連方法論頁。
  - **缺口**：需要新增 Chatman《Story and Discourse》(1978) 條目，並在事件骨幹補一個連結。
- 其他結構線索（時序結構／Genette）：讀 `temporalAnalyzed` / `temporalStructure`，深連結至**時間軸頁**（UI_SPEC 1594-1597），同樣不連方法論頁，因為方法論頁沒有 Genette 條目。
  - **缺口**：需要新增 Genette《敘事話語》(1972) 時序（ordre）條目。這個條目會被敘事結構頁與時間軸頁共用（見 2.4）。

### 2.3 事件分析頁

EEP 的 `structural_role`（Setup / Inciting Incident / Turning Point / Escalation / Crisis / Climax / Resolution）目前直接以英文標籤呈現給讀者，但這組詞彙是好萊塢三幕劇編劇術語，**不對應任何已命名的文學理論**，也不在方法論頁的收錄範圍內。

- **這不是「漏收錄」，是需要先決定要不要正式收錄**：如果要收，得先找到具體理論出處（例如 Field《Screenplay》三幕結構）；如果不收，至少該在頁面文案上避免讓讀者誤以為這是嚴謹的敘事學分類（目前它與 Chatman Kernel/Satellite 並列在同一個 EEP 裡，容易讓讀者把兩套精細度不同的系統混為一談，見一、EEP 的 `event_importance` 欄位是 Kernel/Satellite 分類的權威輸入來源）。

### 2.4 時間軸頁

`agents/timeline_agent.py` 的跨事件時序推論（"Consider flashbacks and flash-forwards... Focus on WHEN the event happened in the story world, not where it appears in the text"）在概念上就是 Genette 的故事時間／論述時間區分，但程式碼與頁面都沒有點名 Genette。

- 這條與 2.2 的「其他結構線索／Genette」是**同一個理論、兩個不同的計算入口**（`narrative_service.py` 的 `_TEMPORAL_ORDER_SYSTEM_PROMPT` 是書級的正式時序分類；`timeline_agent.py` 是逐對事件的時序推論），寫方法論頁條目時要說明這個「一個理論、兩處實作」的關係，不要讓讀者以為是兩套方法。
- UI_SPEC 889 提到 V2 曾經有「Genette 著色 toggle」但已移除，代表這條理論曾經在前端被具名呈現過，後來拿掉了——不確定是設計簡化還是遺留債務，實作前建議先確認移除原因。

### 2.5 張力分析頁

- 書級主題（TensionTheme）已對齊：`frye_mythos` / `booker_plots` 都在方法論頁，但**張力分析頁本身沒有連過去**（未在 UI_SPEC 或元件裡找到 `/methodology` 連結）。
  - **缺口**：純補連結，方法論頁條目已存在。
- 章節級張力抽取（TEU / TensionLine，即 `_TEU_SYSTEM_PROMPT` 產出「對立雙極」的那一層）依據的理論——Aristotle agon、Greimas 符號方陣、Peter Brooks《Reading for the Plot》、Mieke Bal——**只寫在 `docs/plans/20260331-tension-analysis-design-notes.md`，完全沒有進 `frameworksData.ts`，程式碼 prompt 裡也沒有點名**。
  - 這是張力分析頁**最大的方法論真空**：讀者在頁面上看到的「對立雙極」抽取邏輯，完全沒有可供學習的方法論頁條目——現有 `frye_mythos`/`booker_plots` 只解釋了「書級主題怎麼從一堆張力線合成」，沒有解釋「張力線本身怎麼從場景抽出來」這一層的理論依據。

### 2.6 符號分析頁

`sep_methodology` 條目本身內容完整（Barthes/Saussure/Eco 三筆引用都在），但**符號分析頁沒有連結過去**（`grep methodology` 只命中 `CharacterAnalysisPage.tsx`，符號分析相關元件都沒有）。

- **缺口**：純補連結，方法論頁條目已存在，跟 2.5 的張力書級主題是同一類缺口。

### 2.7 知識圖譜頁（社群偵測／關係推斷）

`FactionService`（Newman modularity，`greedy_modularity_communities`）與 `LinkPredictionService`（Common Neighbors + Adamic-Adar）都是**圖論演算法，不是文學理論**。

- 這條建議先問清楚方向而非直接修：`/methodology` 頁的定位是「整套分析方法的說明與教育中心」（UI_SPEC 1307），沒有限定只收文學理論。如果要收，這兩個条目的引用會是 Newman (2004) 與 Adamic & Adar (2003) 這類圖論文獻，跟其他六個條目的人文學科調性不同，需要先決定要不要用同一個頁面裝，還是另外用頁內說明（如 tooltip）處理更合適。

### 2.8 認識論狀態（Epistemic State）

概念上呼應 Genette「聚焦（focalization）」——「誰在特定章節知道什麼」——但程式碼、設計筆記都沒有引用理論家名字（`docs/plans/20260331-narratology-analysis-design-notes.md` 甚至明確把「聚焦」標為「❌ 現階段不可行」，理由是自由間接引語辨識準確率不足）。

- 這條**不建議现在勉强對齊**：設計筆記已經明確說這個概念在系統裡是刻意迴避嚴謹理論宣稱的（避免自由間接引語辨識不準卻打著 Genette 的名號）。如果 `EpistemicStateService` 有讀者可見的呈現頁面，文案上應該維持「概念呼應但非正式引用」的說法，不要因為要湊方法論頁而過度宣稱。

---

## 三、發現的既有文件漂移（非功能缺口，是文件過期）

`docs/UI_SPEC.md:1653`（§5.1 頁面跳轉對照表）仍寫：

```
| 角色分析頁 | 點擊「框架索引 ↗」 | `/frameworks?framework=jung` |
```

但 `/frameworks` 路由已在 2026-05-30 重新命名為 `/methodology`（UI_SPEC 1307 已註明），`frontend/src/router.tsx` 也確認目前只剩 `/methodology` 這個路由，程式碼本身（`CharacterAnalysisPage.tsx:363`）已經是正確的 `/methodology?framework=` 寫法。**這行純粹是 UI_SPEC 沒跟著改名同步更新**，建議之後修 2.1~2.7 任何一項時，順手把這行改掉（同一份文件，不需要另開任務）。

---

## 四、缺口分類（依修法難度排序，供後續排優先序參考）

| 類別 | 動作 | 涉及項目 | 狀態 |
|---|---|---|---|
| A. 純補連結（方法論頁條目已存在） | 功能頁加一個 `<Link to="/methodology?framework=...">` | 張力分析頁（frye_mythos/booker_plots，2.5）、符號分析頁（sep_methodology，2.6） | **已完成**（2026-08-13，見下方） |
| B. 需新增方法論頁條目 | 補 `frameworksData.ts` 條目 + 補功能頁連結 | Chatman Kernel/Satellite（2.2 事件骨幹）、Genette 時序（2.2 + 2.4 共用一個條目） | **已完成**（2026-08-13，見下方） |
| C. 理論只存在設計筆記，需先決定要不要正式收錄 | 產品判斷，非單純工程活 | 張力線抽取層的 Aristotle/Greimas/Brooks/Bal（2.5，目前是張力分析頁最大缺口）、EEP structural_role 的三幕劇術語定位（2.3） | **已完成**（2026-08-13，見下方；兩項皆選「輕量說明」而非「開獨立方法論頁條目」） |
| D. 非文學理論，需先定調收錄範圍 | 產品判斷 | 社群偵測／關係推斷（2.7，圖論 vs 人文調性） | **已完成**（2026-08-13，見下方；選「不收進方法論頁，knowledge graph 頁 inline 說明」） |
| E. 刻意不對齊，維持現狀 | 不動 | Epistemic State（2.8，設計筆記已明確標「不可行」） | 不動 |
| F. 文件漂移，跟著其他項目順手修 | 改一行 | UI_SPEC.md:1653 的 `/frameworks` 殘留 | **已修**（隨 B 一起改） |

### 補漏：時間軸頁工具列（2026-08-13，B 類遺漏）

原始盤點的 2.4 節已指出時間軸頁與敘事結構頁共用同一個 Genette 條目，但當時只在
`CrossEvidence.tsx`（敘事結構頁）補了連結，忘了時間軸頁**自己的**工具列——空狀態的
`TimelineOnboardingHero` 雖然寫著「Step 03 · Genette 分析」，但那張卡片只在書本完全
沒有事件時顯示，資料一旦跑出來就消失，工具列上的「倒敘與預敘」按鈕本身沒有連結。

- `TimelineToolbar.tsx`：`ActionRow` 新增可選的 `nameHref` prop，`displacement` 列傳入
  `/methodology?framework=genette_temporal_order`；`storyOrder` 列不傳（純排序，非具名理論）。
- `timeline.css`：新增 `.tl-action-name-link`（虛線底線 + hover 變 accent），因工具列固定
  84px 欄寬、雙行文字已頂到極限，未改動版面尺寸，純疊加底線樣式。
- Playwright 驗證：即使在「尚不可執行」（覆蓋率不足）的鎖定態，連結依然正確渲染並可點擊
  導航，0 console 錯誤。

### B 類完成記錄（2026-08-13）

- `frameworksData.ts` 新增 `chatman`（敘事弧分析）與 `genette_temporal_order`（敘事弧分析）兩個框架條目，各附 2 筆參考文獻、pipeline、輸出欄位、類型卡。
- `ConceptDiagram.tsx` 新增對應概念圖：Chatman 為因果鏈（K1→K2→K3 + 虛線衛星），Genette 為雙軸交叉圖（文本順序 vs 故事順序，交叉線＝倒敘／預敘）。
- `PlotSpine.tsx`（事件骨幹副標）與 `CrossEvidence.tsx`（其他結構線索副標）比照 `HeroJourneySection.tsx` 既有模式，把純文字副標改成連往方法論頁的 `nl-term-link`。
- 兩者皆以 Playwright 端到端驗證：方法論頁條目渲染正確、參考文獻正確、功能頁連結可點擊並正確導航，全程 0 console 錯誤。

### A 類完成記錄（2026-08-13）

- `TensionThemeHero.tsx`：`tn-frye-badge` / `tn-booker-badge` 由 `<span>` 改為 `<Link>`，分別連往 `/methodology?framework=frye_mythos` / `booker_plots`；`tension.css` 補 `text-decoration: none` 與 `:hover { opacity: 0.85 }`。
- `InterpretationHero.tsx`：`sym-hero-tag`（「LLM 詮釋」）由 `<span>` 改為 `<Link>`，連往 `/methodology?framework=sep_methodology`；`symbols.css` 補 `text-decoration: none` 與 `:hover { background: var(--bg-tertiary) }`（沿用 `.sym-linked-chip:hover` 既有慣例）。
- Playwright 端到端驗證：在「名字的潮汐」重新合成張力主題後，確認浪漫傳奇／重生兩個 badge 皆為正確連結並可導航；在種子測試書上對「鏡子」意象觸發詮釋生成後，確認「LLM 詮釋」tag 正確連結並可導航。全程 0 console 錯誤。

### C 類完成記錄（2026-08-13）

兩項都選「輕量說明」而非「開獨立方法論頁條目」——理由：張力線抽取層的四位理論家（Aristotle/Greimas/Brooks/Bal）彼此分析單位不同（尤其 Greimas 符號方陣是四項式結構，系統只抽兩極），開正式條目等於宣稱精確實作；EEP `structural_role` 只是 7 個借自好萊塢編劇慣例的扁平標籤，份量撐不起一整頁方法論條目。

- `frameworksData.ts`：`frye_mythos`／`booker_plots` 兩個條目的 description 末段各加一句「TEU 抽取受這些理論啟發，非精確實作」的誠實聲明（zh+en），**不**新增 references 書目條目——保持 References 區只列精確引用的來源，讓「引用」與「概念啟發」在版面上有明確區隔。
- `EventAnalysisDetail.tsx` + `event-analysis.css` + `analysis.json`（zh+en）：「結構角色」欄位值下方新增一行 muted 斜體小字「編劇慣例（三幕劇），非嚴謹敘事學分類」，與緊鄰的「重要性」（Chatman kernel/satellite）做出區隔，不用 tooltip（比照 UI_SPEC 既有「不用 tooltip」原則）。
- Playwright 端到端驗證：兩處文案皆正確渲染，無版面破版；此輪未觸發任何新的 LLM 分析，未變動任何書籍資料。

### D 類完成記錄（2026-08-13）

選「不進方法論頁」——雖然 Newman modularity／Common Neighbors+Adamic-Adar 都是精確可引用的實作（不像 C 類有過度宣稱風險），但方法論頁現有 8 個條目共用一套「文學理論教育中心」調性（概念圖、信心值誠實框、跨書查閱），圖論演算法風格不搭，且「跨書查閱」對單書圖譜拓樸的產物完全不適用，不值得為此新開一個 `FrameworkCategory`。

- `ClusterOverviewPanel.tsx`：既有的 `CommunityScopeCard`（社群模式常駐說明卡，非收合的進階設定）補一句「怎麼分的」機制說明。
- `InferredEdgePanel.tsx`：既有的警示橫幅下方新增一則機制說明框（沿用 `CommunityScopeCard` 同款 dashed/muted 視覺）。
- 兩處 i18n key（`v1.cluster.communityScope.mechanism`、`v1.inferred.review.mechanism`）zh+en 皆補齊。
- Playwright 端到端驗證：社群模式與推斷關係審查面板皆正確顯示新說明，無破版；此輪只瀏覽既有資料，未觸發任何新運算。

---

## 五、參考

- 完整的 prompt 原文與 docstring 節錄見本次盤點對話（分析功能方法論總覽），未另存檔，如需要可要求補一份 `docs/plans/<YYYYMMDD>-analysis-prompts-theory-sources.md` 彙整逐字稿。
- 理論書目本身已在 `docs/plans/20260331-narratology-analysis-design-notes.md`、`20260331-symbolic-analysis-design-notes.md`、`20260331-tension-analysis-design-notes.md` 三份筆記列出，本筆記不重複抄錄書目，只記「哪裡缺對齊」。
