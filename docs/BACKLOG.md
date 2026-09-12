# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-08-10

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## B 系列（既有）

### 🔴 高優先（功能中斷）

#### B-073 Gemini 對「手」的提示回報 PROHIBITED_CONTENT

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

**剩餘待辦**:
- **真正的解法是可用的 fallback provider —— 見 B-075**。本條目的工程面已完成：
  拒絕會被正確辨識、記錄、呈現、且不再重複消耗配額。但「手」在只有 Gemini 的環境下
  仍然產不出詮釋，那不是這裡能修的。

**明確不做**: prompt 擾動重試（砍掉前一兩段證據再送）。雖然實測可通過，但會讓詮釋
根據哪些證據產出變得不確定。列為最後手段。

**觸發時機**: Phase 2/3 接續進行；封鎖本身待 B-075。

---

#### B-074 SEP 把前置頁文字當證據送進 LLM

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

**待決策（未動使用者資料）**: 全 DB 有一筆以受污染證據生成的詮釋（「海」，
`review_status = pending`，從未經 HITL 審核）。**沒有自動刪除**。要讓它失效重生：

```sql
DELETE FROM analysis_cache
WHERE key = 'symbol_analysis:8f18dd59-bd45-4071-a548-58779fcf7ece:f6bef0f0-e8df-4b03-8d7d-6efa8f380a5f';
```

未做「以受污染證據生成」的標記：那需要在 `SymbolInterpretation` 記錄它消費的 SEP 版本，
為一筆 legacy 資料加一個 schema 欄位不成比例。

**觸發時機**: ~~B-073 修好之後~~ —— 該前提建立在「完全無法產出」的錯誤診斷上；
實際 8 個意象裡 7 個正常，gate 早已解除。2026-08-10 完成。

---

#### B-075 全系統的 LLM fallback 鏈是壞的（假的 local model + placeholder 被當成已設定）

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

#### B-078 象徵的事件依附與貫穿度共線（`W.ev` 權重定義待決）

**背景**: 2026-08-07 API 整併時提出，見
`docs/plans/20260807-symbols-api-consolidation.md` 第 4 節。當時標為「需裁示」，
2026-08-10 收攏為本條目 —— **決定暫不實作**。

`assemble_sep()` 的事件關聯是**章節層級**的：

```python
chapters_with_imagery = set(entity.chapter_distribution.keys())
event_ids = [ev.id for ev in events if ev.chapter in chapters_with_imagery]
```

即「這個意象出現過的章，其中所有事件」，不是「與這個意象同段的事件」。`Event` 沒有
paragraph／chunk 參照，段落層級目前做不到。

**後果**: 事件依附與貫穿度高度共線 —— 出現在越多章 → 涵蓋越多事件。前端把它當成權重
0.18 的獨立訊號（`symbolSignals.ts` 的 `W.ev`），實際上有一部分只是 `span` 的重複計票。

**已做的**: `co_occurring_event_count` 只計正文章節（修掉前置頁事件混入）。

**暫不做的理由**: 用 `event.participants ∩ 該意象的共現實體` 收斂成真正的「同場事件」
資料是現成的，但這是**新的度量定義**，超出設計要求。決議 06 校準時把 `W.ev` 調低，
是可接受的收法。

**觸發時機**: 決議 06 的權重校準（屆時一併決定是調權重還是換定義）。

---

### 🟡 中優先（功能完善）

#### B-080 後端 deferred import 分類（結論：不搬）

**背景**: 2026-08-19 執行「後端結構性殘留清理」計畫 §3 時做的分類。全後端有
276 處函式內 import（`# noqa: PLC0415`），讀起來吵，且曾有人開過分支
`refactor/hoist-deferred-imports` 準備搬上去 —— 那個分支零 commit，開了沒做。

**計畫明訂第一步是分類，不是搬動**，因為成因不同、處置也不同。分類結果：

| 成因 | 處數 | 佔比 | 該怎麼辦 |
|---|---|---|---|
| 第一方（`storysphere.*`） | 206 | 75% | **不能搬** —— 迴避循環 import 與延後建構服務。熱點是 `api/deps.py`（32）、`workflows/ingestion.py`（14）、`api/main.py`（13） |
| 重量級三方（langchain / langgraph / torch / qdrant / neo4j …） | 44 | 16% | **不該搬** —— 刻意縮短冷啟動 |
| 輕量（asyncio / datetime / time / json / functools …） | 26 | 9% | 唯一可搬的，但扣掉 yake / pypdf / docx / ebooklib / lxml 這些同樣屬可選解析器的，實際約 **15 處** |

**結論：關掉這一項。** 真正可搬的約 15 / 276 ≈ **5.4%**，動它要逐處查證是否
真的無循環依賴，風險與收益不成比例；而讀起來吵的那 75% 正是**不能**動的那批。

**待辦（只剩收尾）**:
- 刪掉空的 `refactor/hoist-deferred-imports` 分支，免得下次又有人以為這件事待辦
- 若日後真的要動，只碰上表第三列，且必須逐處確認無循環依賴

**觸發時機**: 不再觸發。本條目記錄的是「查過了，不做」。

---

#### B-014 Local LLM 選型評估（進行中）
**背景**: qwen2.5-3b JSON schema 遵從度不穩定（null 代替 []、malformed JSON），已換至 Phi-3.5-mini-instruct Q4_K_M（社群量化），功能正常但速度偏慢。

**Local model 選型條件**:
- JSON schema 遵從度：能穩定回傳 `[]` 而非 `null`，不截斷 JSON
- 大小：Q4_K_M 量化後 ≤ 5GB
- 格式：GGUF，相容 llama.cpp server（OpenAI-compatible `/v1` API）
- 推理速度：single-turn < 30s 為可接受範圍

**待評估候選**:
- Phi-3.5-mini-instruct Q4_K_M（~2.2GB）← 目前使用，格式遵從佳但偏慢
- Qwen2.5-7B-Instruct Q4_K_M（~4.7GB）← 同 family 升級版
- Llama-3.2-3B-Instruct Q4_K_M（~2.0GB）← Meta 新一代 3B

**目標**: 找到速度與格式穩定性平衡最佳的選項。

---

#### B-041 章節審閱 UI 需要專用 Design Token
**背景**: 章節審閱功能（`/upload/review/:bookId`）的視覺語言（切分點指示線、章節 tag、標題高亮）暫時沿用 `--entity-con-*`（靛紫）token，但這組 token 在 manuscript / minimal-ink / pulp 三個主題下會被覆蓋為灰色，紫色語意在非預設主題下失效。

**待辦內容**:
- 在 `frontend/src/styles/tokens.css` 新增 `--review-*` token 系列（建議：`--review-bg`、`--review-border`、`--review-fg`、`--review-dot`）
- 四個主題（default / manuscript / minimal-ink / pulp）各補一組值
- 同步更新 `docs/DESIGN_TOKENS.md` 對照表
- 章節審閱元件（ChapterReviewPage、段落卡片的 title_span highlight）改用新 token

**觸發時機**: 章節審閱功能（上傳流程 Phase 3）完成實作後、UI 視覺 QA 時發現主題一致性問題時。

**前置依賴**: 章節審閱功能完成（無獨立前置）

---

#### B-045 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 ✅ 已完成（2026-06-01）
新增 `/books/:bookId/narrative` 頁，英雄旅程四佈局可切換 + 情節骨幹摘要，封裝 `api/narrative.ts`，BookNav 加入入口。詳見 `docs/BACKLOG_ARCHIVE.md`。

---

#### B-046 建構概覽：節點「觸發建構」CTA 對接 pipeline endpoint ✅ Phase 1 已完成（2026-08-11）
> 原 B-044，2026-06-30 重編：原號與已歸檔的「閱讀頁 EpistemicSidePanel 入口優化」撞號。

Phase 1 接上 12 個節點（summaries / keywords / symbols / kg_entity·concept·relation·event /
cep / character_analysis_result / eep / causality_analysis / impact_analysis），含 token 確認
視窗與 task 輪詢；同時修好 rerun 端點不落盤章節摘要與關鍵字的既有 bug。詳見
[BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)。

**Phase 2 待辦（仍為 disabled 占位的節點）**:
- `tension_lines` / `tension_theme` / `hero_journey_stage` / `temporal_analysis`：端點已存在
  （`/tension/analyze`、`/tension/theme/synthesize`、`/narrative/hero-journey`、`/narrative/temporal`），
  只需補進 `BuildOverviewPage.tsx` 的 `NODE_TO_TRIGGER` 與 i18n `unraveling.cta.node.*`
- `narrative_structure`：對應的 `POST /narrative/classify` 在書已失去 event EEP 快取時會覆寫 KG 的
  kernel 權重，放進一鍵 CTA 太危險。需先讓 classify 對缺快取的情況安全，才能接上
- `teu` / `voice_profile` / `chronological_rank` / `kg_temporal_relation`：無對應批次端點，需先新增後端

**前置依賴**: 對應 pipeline 的後端 endpoint 存在；無則需先新增。

---

#### B-042 章節審閱頁面：段落 Role 自動識別（preamble / section / epigraph）
**背景**: `ParagraphRole` enum 定義了五種 role（`body`、`separator`、`section`、`epigraph`、`preamble`），其中後三者在後端原始碼中標注為 `# v2`，代表**尚未實作自動偵測邏輯**。目前使用者可在 ChapterReviewPage 手動切換 role badge，前端 UI 支援完整；但後端 `DocumentProcessingPipeline` 產出的段落一律為 `body` 或 `separator`，前言、小節標題、題詞需靠使用者自行標記。

**目前行為**:
- `separator`：已自動偵測（regex 無文字字元 + 長度 ≤ 40）
- `preamble`：無自動偵測，前言段落以 `body` 進入 RAG / KG pipeline，可能產生噪音
- `section`：無自動偵測（小節標題類段落）
- `epigraph`：無自動偵測（引言、題詞類段落）

**目錄（TOC）的處理現況**:
- 目錄整頁的每一行被 chapter detector 識別為 heading，但因為 heading 之間沒有正文段落，形成空白 chapter 被過濾掉（`chapters = [c for c in chapters if c.segments]`）
- 這是間接排除，不是主動識別；若目錄行夾雜少量正文或格式不規則，仍可能漏入

**待辦內容**:
- 後端 `document_processing` pipeline 新增 preamble / epigraph 啟發式偵測規則（例如：章節開頭短段、引號包圍段落）
- 或改為 LLM-assisted role 分類，在 chapter_review_node 進入 HITL 前預標注
- 前端 ChapterReviewPage 可針對非 body role 加上更明確的視覺提示（目前僅 dim 效果）
- 考慮是否需要在章節審閱頁面提供「全章套用同一 role」的批次操作

**觸發時機**: 上傳流程穩定後、RAG / KG 品質優化階段

**前置依賴**: 無（可獨立進行）

---

#### B-048 Neo4j 能力缺口（切過去等於整個圖譜功能面停擺）
> 原 B-035，2026-06-30 重編：原號與已歸檔的「坎伯英雄旅程 LLM 結構對應」撞號。
> **2026-09-05 大幅改寫。** 原標題與內容只記 Link Prediction 一項，實際盤點後
> 發現有三項，而且漏記的兩項比記下來的那項嚴重。原文的診斷沒有錯，錯在範圍。

**原本的框架已被推翻**: 這條目原先寫著「這是輕量 NetworkX vs 完整 Neo4j 功能分拆的
**第一個具體案例**。後續所有新功能若有類似的 backend 差異，均需在此記錄」。
那條原則**沒有被遵守**——2026-09-05 盤點時，Neo4j 已有三項能力缺口，只有一項在案，
而漏掉的兩項打掉的是知識圖譜頁本身，不是附屬功能。原則寫下來但沒有機制守，
結果就是它自己記錄的那一項反而是影響最小的。

**完整清單（2026-09-05）**:

| 缺口 | 位置 | 停擺的功能 |
|------|------|-----------|
| `list_relations` | `kg_service_neo4j.py` `raise NotImplementedError` | 知識圖譜頁、角色指標、派系分析、推斷關係 |
| `get_snapshot` | 同上 | 知識圖譜頁、認知狀態、派系分析 |
| Link Prediction 演算法耦合 | `link_prediction_service.py:62` 直接讀 `self._kg._graph` 私有屬性取 networkx 圖物件 | 推斷關係 |

`KG_DEPENDENT_FEATURES` 目前列了 5 個功能（`graph` / `character_metrics` /
`factions` / `link_prediction` / `epistemic_state`），**5 個全部被牽連**。
切到 Neo4j 不是「部分功能降級」，是整個圖譜功能面停擺。

**為什麼沒人發現**: `tests/services/test_kg_backend_parity.py` 驗的是結構——抽象覆蓋、
簽章一致、無未宣告分歧。那兩個方法簽章正確、通過每一項檢查，執行時才拋。
一套全綠的 parity 測試，旁邊擺著一個服務不了圖譜頁的後端。
而 `POST /kg/switch` 只驗連線不驗能力，切過去回一句 `"Switched to neo4j."`。

**已完成（不含任何 Neo4j 實作）**:
- **2026-09-05 PR #83** —— `KGServiceBase.UNSUPPORTED` 把缺口寫成介面的一部分，
  值是 `KG_DEPENDENT_FEATURES` 的 id 而非散文（翻譯歸前端、對照歸後端）；
  parity 測試 AST 掃描兩個實作，釘住宣告等於原始碼實際會 raise 的成員，雙向都擋。
  下一個缺口無法再靜默增加。
- **2026-09-05 PR #84** —— `GET /kg/status` 的 `unsupportedByMode` 回報每個可選後端
  的缺口（讀類別而非 instance，才答得出「切過去會怎樣」）；設定頁在**按下之前**
  就列出會停用哪些功能。

**待辦（真正的實作，尚未動）**:
- `list_relations` 的 Cypher 實作
- `get_snapshot` 的 Cypher 實作
- `KGServiceBase` 新增抽象方法 `get_neighbor_ids(entity_id: str) -> list[str]`，
  讓 Link Prediction 的算法層與 backend 解耦
  - NetworkX：用現有圖結構實作
  - Neo4j：用 `CALL gds.alpha.linkprediction.adamicAdar(...)`
- `LinkPredictionService.run_inference()` 改用抽象方法，**不再讀 `self._kg._graph`**
  這個私有屬性
- 每補完一項，把它從 `Neo4jKGService.UNSUPPORTED` 移除——parity 測試會擋住
  陳舊宣告，所以忘了拿掉會紅

**前置依賴**: B-011（Neo4j docker-compose 環境）。沒有可跑的 Neo4j 就驗不了 Cypher，
這也是上面「已完成」的兩項刻意都不碰實作的原因。

**這次學到的**: 「原則寫在 backlog 但沒有機制守」等於沒有。B-048 自己就是反例——
它明文要求後續缺口都要記在這裡，然後兩個缺口在它眼皮底下長出來沒人記。
PR #83 的作法（把宣告放進生產程式碼、用測試釘住宣告等於現實）才是那條原則的
可執行版本。

---

#### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

#### B-050 邊界輔助辨識：段內拆分（intra-paragraph split）
**背景**: 「邊界輔助辨識」(#22c) 逐段回推找前後附邊界並切成獨立非正文章節，但切點只能落在**段落邊界**。段落是 `chunk_segments` join-then-split 的 ~1200 字 chunk，故事結尾與後附開頭常落在**同一段**，導致該段整段被切進非正文（連幾句故事尾一起排除）或整段留在正文（後附頭沒排除）。

**待辦內容**:
- 對「跨界段落」（回推停止點那一段）做段內二次判斷，找出句子級切點，把該段拆成 [故事尾] + [後附頭] 兩段再套用邊界。
- 需求量小（每端至多一段），可只對邊界那一段送 LLM 做句子級切分。

**前置依賴**: 無（在既有 suggester 上增強）

---

#### B-051 WebSocket 連線身分認證
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: `/ws/chat` 目前以任意 `session_id` 字串共用 dict，單機無實害；多使用者或對外部署時，任一 `session_id` 可存取他人對話狀態。（`/ws/tasks/{id}` 已於 2026-07-11 移除：任務狀態統一走輪詢，串流內容才用 WS。）

**待辦內容**:
- 對外部署時，WebSocket 連線綁定認證身分（依當時採用的認證機制驗證後才允許建立連線與存取對應 session）。

**觸發時機**: **決定對外/多使用者部署後**（現況只綁 loopback，暫無實害）。

**前置依賴**: 部署方向確定 + 認證層決策。

---

#### B-053 Secret 管理（prod）
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: GEMINI / Langfuse key 現存於 `.env`（已 gitignore、本機夠用）。正式對外部署時應改用 secret manager，避免明文檔案外流。

**待辦內容**:
- 依部署階梯擇一：單機 / Docker → pydantic-settings `secrets_dir` 或 Docker secrets；GCP（用 Gemini 最順）→ GCP Secret Manager。
- 程式碼側可加 `secrets_dir` 支援；建立 secret 儲存與 IAM 為 ops 動作。

**觸發時機**: **部署方向（單機 / 雲）確定後**。

**前置依賴**: 部署方向確定。

---

#### B-055 章節審閱 review-data 分章載入
**背景**: `GET /books/:bookId/review-data` 一次回傳整本書全文（含切句），大書時審閱頁初載很重。2026-07-11 上傳流程強化（`docs/plans/20260711-upload-flow-hardening.md`）已讓「接受系統判斷」改走後端捷徑不再拉全文，但人工審閱路徑仍載整本。

**待辦內容**:
- review-data 支援分章 / 分頁載入（或先回骨架後懶載段落文字）
- 前端 ChapterReviewPage 對應改為漸進載入

**觸發時機**: 上傳流程 UX 重構時一併設計。

**前置依賴**: 無。

---

#### B-056 Phase 1 文件解析 sub-progress
**背景**: ingestion phase 1（解析 + 語言偵測 + 入庫）只有 5/10/15 三個粗進度點，大 PDF 解析期間畫面長時間無進度變化。需要 `DocumentProcessingPipeline` 增加 progress callback hook 才能回報頁級進度。

**待辦內容**:
- `DocumentProcessingPipeline` 增加 `sub_cb` hook（比照 phase 2 各 pipeline）
- `run_phase1` 接上 `_progress` 的 `sub_progress/sub_total`

**觸發時機**: 有大檔案解析體感問題回報時。

**前置依賴**: 無。

---

#### B-058 處理卡系統吉祥物欄
**背景**: Claude Design 的上傳流程 canvas 為 running 卡設計了第三欄「系統吉祥物」（裝飾性動態角色 GIF/Lottie，非進度指示），但**資產尚未由設計提供**。2026-07-12 實作重設計時本欄暫略（running 卡維持 時間軸 + murmur 兩欄，murmur 內既有的小 `CharacterSlot` 佔位保留）。

**待辦內容**:
- 設計提供吉祥物動態資產後，於 `ProcessingCard` running 卡加入第三欄並嵌入資產
- 決定是否移除 `MurmurWindow` 內既有的小 `CharacterSlot` 佔位（避免重複）

**觸發時機**: 吉祥物資產備妥後。

**前置依賴**: 設計提供 GIF/Lottie 資產。

---

#### B-057 批次上傳（含跳過審閱選項）
**背景**: 現行章節審閱為每本書的強制人工卡點（單本體驗良好，維持設計）。若日後支援一次上傳多本書，逐本審閱會成為瓶頸，屆時需另行設計批次流程（例如整批排隊審閱、或批次模式允許自動接受系統判斷）。2026-07-11 已確認**不**在單本流程加跳過審閱選項。

**待辦內容**:
- 批次上傳 UI / API 設計（含審閱策略）

**觸發時機**: 出現批次上傳需求時。

**前置依賴**: 上傳流程 UX 重構方向確定。

---

#### B-059 派系語意命名（LLM 為 F-16 社群取名）
**背景**: F-16 派系偵測（#6d）定案為純圖計算、無 LLM，`label` 一律是「Faction N」佔位字串；圖譜頁社群模式與角色分析頁總覽（20260716 翻新計畫的派系分群）都只能以 `topMemberNames` 組合稱呼（「寇仲、徐子陵 等 12 人」）。若由 LLM 依成員與關係取語意名稱（「宇文閥」「宋閥」），兩頁可同時受益。

**待辦內容**:
- 前置問題：分群結果隨 `resolution` / `min_cluster_size` / `chapter` 參數變動，派系無穩定身分——需先決定命名策略：(a) 只對預設參數的分群命名並快取；(b) 以成員集合 hash 當 key 快取；(c) 每次現算（LLM 成本）
- 後端：`FactionService` 之上加命名層（LLM 取名 + 快取），#6d response 的 `label` 填語意名稱（保留佔位字串為 fallback）
- 前端：圖譜頁 ClusterOverviewPanel 與角色頁總覽派系卡自動受益，無需改版面
- API contract：#6d `label` 欄位語意更新

**觸發時機**: 角色頁總覽派系分群（20260716 計畫 #1）上線後，佔位稱呼被回報不夠用時。

**前置依賴**: `docs/plans/20260716-character-page-revamp.md` #1 完成。

---

#### B-060 原型篩選 facet 改以 archetype id 比對
**背景**: 角色分析頁原型篩選（#14）的計數是前端把 `analyzed[].archetypes` 的**名稱字串**與 `frameworksData.ts` taxonomy 名稱做精確相等比對。名稱隨語言而異（後端存書籍語言的 config 名稱、前端 taxonomy 取 UI 語言），所以「EN 介面 + 中文書」時全部計數為 0、篩選恆空。2026-07-18 已將前端 taxonomy 與後端 config 名稱逐字對齊（同語言下正確），跨語言問題屬結構性殘留。

**待辦內容**:
- 後端 #6a `analyzed[].archetypes` 增列 archetype **id**（config 已有 `id` 欄位；`resolve_archetype_name` 處同步回傳 id）
- 前端 `ArchetypeFilterDropdown` facet 與 `archFilter` 篩選改以 id 比對，顯示仍用 taxonomy 名稱
- API contract #6a 同步更新

**觸發時機**: EN 介面使用需求出現時。

---

#### B-063 關係圖角色名冊比對支援 KG 別名
**背景**: 角色分析頁關係 ego 圖的節點可點擊性（橘圈）取決於 CEP relation target 名稱與角色名冊（#6a analyzed+unanalyzed）**精確字串相等**。CEP 寫的名字若是別名 / 異體字（實例：傅君婥在徐子陵關係圖中呈灰圈不可點），即使該角色存在也無法跳轉。

**待辦內容**:
- 名冊比對擴充 KG entity 的 `aliases`（#6a 或另取 entity alias 對照表），name → id lookup 涵蓋別名
- 先查證傅君婥在 KG 中的實際 entity 名稱與 alias 記錄，確認漏配原因

**觸發時機**: 關係圖灰圈誤判回報累積時。

---

#### B-065 各功能頁操作說明缺乏統一機制
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

#### B-068 事件抽取把同一場戲切成多個 event
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

**尚未做，這件之前不能結案**：消費端接上（張力頁目前顯示的仍是 TEU 數）。接線時
要處理「這一章沒有分組」的呈現——那是本次設計的重點，不能畫成一場。

**限制**：一本書、一位標註者、10 章。ch5 與 ch9 的標註可爭議（「傍晚 → 入夜」算不算
時間跳躍）。分隔符是**這本書的排版慣例**，不是通例。
- **前置 B-106**：沒有章內順序，「連續」根本無法表達。`narrative_position`
  目前填充率 0/235
- 是否需要新增 `scene_id` 欄位，等 B-106 落地、能看到真實的章內序之後再決定

**觸發時機**: B-106 完成後即可動工。

---

#### B-069 張力證據「同場景摺疊」無可用判準
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

**現況**: 張力頁證據區誠實顯示「n 則」，不做摺疊，不提供逐字對照。

**觸發時機**: B-068 有進展時，或證據摺疊被使用者實際要求時。

---

#### B-071 張力頁格點與迷你柱狀圖無非視覺替代
**背景**: 2026-08-05 翻新已加入完整鍵盤快捷鍵（J/K/A/X/E/Space/V/Esc）與 `aria-pressed` / `aria-label`，比舊版好很多，但 P1-9 未完全解決。

**✅ 已完成（2026-08-21）**:

- **抽屜焦點處理**。B-070 把抽屜在 1080px 以下改成 overlay 之後，這條從「未定」變成有實害：
  被蓋住的主體沒有 `inert` 也沒有 focus trap，tab 會走進看不見的內容。改法是 `.tn-shell-main`
  在 overlay 且抽屜開啟時掛 `inert`，開啟時記住原焦點並移入抽屜、關閉時歸還。
  **刻意不是傳統 focus trap**：Tab 走完抽屜會到左側導覽列，而導覽列在 x<48、沒有被抽屜蓋住，
  鎖住它反而是敵意行為。`inert` 只拿掉真正被遮蔽的內容，比硬 trap 更貼近實際的視覺狀態。
  用平台原生 `inert`（React 19 支援 boolean prop），未裝 focus-trap 套件、未新增 `useMediaQuery`
  hook——照 `useEscapeKey` 註解自陳的紀律，一個呼叫端先內聯。
- **非視覺替代**。格子的 `aria-label` 逐個列出強度、裝飾用的 `<i>` 柱子全標 `aria-hidden`。

**原記載有誤，一併更正**: 本條原寫「鍵盤與螢幕閱讀器取不到背後的 `tension_description`」——
**這句是錯的**。`tension_description` 在 `TensionTEUInspector.tsx:145` 與
`TensionReviewDrawer.tsx:148` 都是**可見的 `<p>` 純文字**，一直讀得到。格子的 `aria-label`
（`tension.grid.cellLabel`）也早就存在，會念出章節與 TEU 數。真正缺的一直是**強度**——
柱子的高度與 low/mid/high 色帶完全沒有非視覺出口。

`TensionTEUInspector` 的迷你柱只標 `aria-hidden`、未加朗讀內容：展開該章之後每個 TEU 的強度
本來就是可見文字（`:131` 的 `formatIntensity`），在收合標題再念一串只是把同樣的數字念兩遍。
格點格子的情況不同，那裡的強度沒有其他出口。

**剩餘待辦**:
- Ink 主題下 success / warning / error 會塌成同一個黑，**語意不能只靠顏色**——已拆為 **B-086**，
  因為那是全站議題（stepper 已用「圓形 machine / 方形 gate」處理，其餘狀態指示尚未逐一檢查），
  且會動到 `tokens.css` 與 `DESIGN_TOKENS.md`，範圍與本條不同。

**觸發時機**: 本條剩下的部分已移出，見 B-086。

---

#### B-072 張力 Step 1 組裝失敗的 TEU 無清單可看
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

#### B-091 全面徹查零使用程式碼

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

#### B-096 classify 的洗白守衛只擋全損，不擋部分損失

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

#### B-095 英雄旅程的順序常數 `STAGE_ORDER` / `STAGE_PHASE` 無防護

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

#### B-099 `LLMClient.get_fallback` 的暫緩理由已過期，全系統實際上沒有任何 fallback

**背景**: B-090 把 `get_fallback` 列為零引用但**暫緩不刪**，理由記為「很可能就是
B-075『fallback 鏈是壞的』的成因」。2026-09-06 走查 core/ 時複查，**那個理由已經
不成立**：B-075 早在 2026-08-20 結案（`is_configured()` 收斂、行內註解清除、
`_has_key` 改為純委派）。

**但結論仍然是不刪，只是換了個理由——而且是更強的理由**:

`get_with_local_fallback()`（15 個服務全走它）的鏈是 **cloud → local**，而 B-075
修好之後 `has_local` 正確回報 False，所以它回傳的是**裸的 primary、`fallbacks=[]`**。
也就是說：**現在全系統每一條 LLM 路徑都沒有任何 fallback**。這是 B-075 修正的正確
結果（原本掛著的是一個必定失敗的假 local），但它同時意味著跨雲 fallback 從未存在過。

`get_fallback()` 是**唯一**實作「換另一家雲端」的程式碼（gemini → openai →
anthropic，排除 primary），而 `get_with_local_fallback` 的 docstring 明寫
「Multiple cloud providers are NOT chained」。所以它不是死碼，是**寫好沒接的能力**，
屬 B-091 的第 3 種結局。

**這正是 B-073 缺的那一塊**: Gemini 對「手」回報 PROHIBITED_CONTENT 時需要的是
**換一家 provider**，不是重試同一家（`RETRYABLE` 刻意不含 `LLMResponseBlocked`，
理由正是「同一家會再拒一次」）。local 那條路在沒有本地模型時等於沒有。

**決定：暫不接，但理由換掉了**（2026-09-07）

使用者的判斷：**一般使用者不會為了備援去準備好幾家 LLM 的 API key**。跨雲 fallback
的前提是「手上有第二把可用的 key」，而那個前提在這個專案的實際使用情境下多半不成立
——`.env` 目前也確實只有 Gemini 是真的設定好的（OpenAI / Anthropic 是 placeholder，
已被 `is_configured()` 正確判為未設定）。接了也不會生效，直到有人填一把真的 key。

**所以 `get_fallback()` 繼續留著不刪，但這次的理由是有效的**：它是唯一的跨雲切換
實作，而「要不要跨雲」是一個懸而未決的產品問題，不是遺留物。**與 B-090 當初記的
理由（「很可能是 B-075 的成因」）不同，那個已經過期；這個不會。**

**接線的技術前提（查過，留給日後）**: 不能只是把 `get_fallback()` 塞進
`with_fallbacks([...])`。`with_fallbacks` 只在 LLM 物件**拋例外**時切換，而 Gemini 的
封鎖不是例外——langchain 收到的是空的 `AIMessage`，是 `llm_text(response)` 在 invoke
**回傳之後**才看出 `block_reason` 並拋 `LLMResponseBlocked`，那個位置在 LLM 物件外面。
真正要改的是呼叫層：捕捉 `LLMResponseBlocked` → 換 provider → 重跑一次。呼叫點分布是
**20 處走 `call_llm()`**（改一個地方就全涵蓋，且象徵詮釋那條在內）、**13 處直接
`ainvoke`**（各自處理，或先收斂）。

**這對 B-073 的意思**: 「手」的詮釋在可預見的未來不會靠 fallback 解決。剩下的槓桿是
**改提示讓 Gemini 不拒絕**，或接受它產不出來。前者沒試過。

**觸發時機**: 待排。若哪天有第二家 provider 是實際可用的，第一步只需改 `call_llm()`。

**觸發時機**: 待排。與 B-073 綁在一起決定。

---

#### B-100 token 歸屬修好之後沒有任何資料驗證過

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

#### B-101 前置頁排除數有兩套規則，而且不是同一條

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

#### B-102 段落層 keywords 產得出來、送得出去，就是沒有存

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

#### B-103 建構概覽的 Relations 節點顯示的是全庫計數，不是這本書的

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

#### B-104 兩個已完整實作的深度分析工具永遠註冊不進 chat agent

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

#### B-105 移除 10 個無呼叫端的 HTTP 端點 ✅ 已完成（2026-09-07）

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

#### B-106 `narrative_position` 有五個讀者、零個寫者

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

**未做**: 兩本書是用最初的措辭重跑的，所以現有事件數反映的是 +58% 那一版而非 B2。
要不要為了對齊再重跑一次，等 B-068 的場景分組定案後一併決定——分組若成立，
較細的節拍是素材而不是成本。

**觸發時機**: B-068 的前置——沒有章內順序，「連續節拍屬於同一場戲」就無法表達。

---

#### B-107 Age of Fire 的事件資料停留在 B-082 修好之前

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
#### B-108 事件衍生的快取失效規則掛在錯的步驟上

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

#### B-109 `Event.location_id` 是第二個零寫者欄位

**背景**: 2026-09-11 試算 B-068 場景分組判準時發現。`Event.location_id` 全庫填充率
**0/201**——與 B-106 修掉的 `narrative_position` 完全同一種形狀：欄位在
`domain/events.py` 裡、抽取提示不問、`_parse_events` 不設。

**與 B-106 不同的是目前查不到消費者**，所以嚴重性低得多；它不像
`narrative_position` 那樣讓四處排序靜默退化。

**但它有實際代價**: 場景分組最自然的判準「相鄰兩事件是否在同一地點」從一開始就
不可用，只能退而求其次去試地點型參與者（已驗證會誤判，見
`docs/plans/20260911-scene-grouping-criteria.md`）。

**待辦內容**:
- 決定要不要補生產者。**注意這會踩到顆粒度代價**：任何要求模型定位事件的欄位都會
  推高抽取顆粒度（見 `20260910-event-granularity-ordering-experiments.md`），
  而 `location_id` 還多一層——它要求解析到既有的 location 實體 id，不只是文字
- 若決定不補，就把欄位刪掉，不要留著假裝有

**觸發時機**: B-068 第二層（段落錨點）動工時一併決定——兩者都是「要不要為了分組
再向模型多要一個定位欄位」的同一個取捨。

---

#### B-110 張力頁重新整理後就忘記 Step 1 跑過

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

#### B-113 「`failed += 1` 然後繼續、不留清單」還有三處

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

**尚未做**: 三個前端消費端都還沒顯示這份清單——事件頁、角色頁、象徵頁各有自己的批次
UI，放哪裡是各自的設計題。**這正是當初不把三處併進 B-072 的理由**，不是遺漏。

**觸發時機**: 前端接線待各頁下次翻新時處理。

---

#### B-117 已刪書籍的殘留快取（已清）

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

#### B-118 「只被測試引用」的 8 筆已走查，掃描器補上兩個缺口

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

**未做**: 上表四個「有取代者」**沒有刪**。CLAUDE.md 明令不得憑判斷刪程式，
需使用者確認。四筆合計約 60 行，刪除時要連同各自的測試一起。

**§3-1 另兩個範圍也掃完了（2026-09-12）——至此 §3-1 全數收束**

**`scripts/` 三個「孤兒」，實際只有兩個是**：

| 腳本 | 判定 |
|---|---|
| `explore_api.py` | **不是孤兒**——`docs/guides/API_TESTING.md:22` 有文件化用法 |
| `prune_orphan_symbols.py` | docstring 明寫 one-off。**目標已空**：`symbol_store` 兩張表的 book_id 全部對得上活書 |
| `renumber_chapters.py` | docstring 明寫 one-off。**目標已空**：章號正確（toc=0、body=1–10、afterword=11），前置頁沒佔用正文章號 |

兩個 one-off 的條件**不會再出現**——`delete_book` 自 2026-08-18 起會清 symbol_store，
`assign_chapter_numbers()` 已在 pipeline 裡。所以它們是已用畢的遷移腳本。
**未刪**，同樣待確認。

**45 個巢狀函式：掃完是 0 筆。** 掃描器新增這個範圍，第一次跑挑出 1 個
（`create_app() -> _global_handler`），查證是偽陽性——`@app.exception_handler`
由 FastAPI 註冊呼叫，與既有的路由處理器同一類。套用同一條 decorator 排除規則後歸零。

**這個結果與 B-098 把私有方法納入掃描時一樣**：範圍清空本身就是有用的答案，
而且現在它是自動的，不必再有人記得「還有一個範圍沒掃」。巢狀掃描刻意不用
`ast.walk` 找巢狀定義——那會讓雙層巢狀的函式被上面每一層各報一次，而同一個符號
在候選清單裡出現兩次，正是讀者開始不信任清單的起點（有測試釘住）。

---

#### B-116 `temperature=0` 之下 Gemini 仍然不可重現

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

**對「三個沒試過的方向」的意思**: 可以動工了，但**要先在目標章節上量該指標的雜訊**，
而且**不要選 ch7 量事件顆粒度**——它在那個指標上沒有變異，看不出差別。ch1 這種
本身就會跳的章節才有鑑別力。

**不做**: 改用其他 provider 求可重現性。跨雲的前提已於 B-099 收攏為不成立。

**觸發時機**: 下次要比較提示措辭之前，先用 N≥30 估一次雜訊基線。

---

#### B-115 只有收尾標點的一行被判成場景分隔線

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

#### B-114 全站焦點環漏掉 `<summary>`

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


#### B-094 pytest 有一個間歇性失敗（約 1/8）

**背景**: 2026-09-05 跑 B-091 的閘門時遇到 `1 failed, 1864 passed`，
其後連跑 7 次全綠（含刻意與 `npm run build` 併行以複製當時的資源競爭），
無法重現，也因此**沒有拿到失敗的測試名稱**。

**不是當時那批造成的**: 該分支 `git diff origin/main --name-only` 對
`backend/` 與 `tests/` 的異動是零，全部落在 `frontend/` 與 `docs/`。
所以這是既有的 flaky，只是剛好被撞見。

**唯一線索**: 輸出裡有大量 `RuntimeError: Event loop is closed`，指向
async 測試的 teardown。那些訊息平時也會出現（成功的執行也有），所以不能
直接當成兇手，但嫌疑集中在會起背景 task 的那幾組。

**為什麼值得追**: 這專案已經有過一次「閘門紅著沒人看」的教訓（B-066，
`tsc -b` 長期紅到累積 10 個錯誤）。1/8 的 flaky 比長紅更糟——它會讓
「重跑一次就過了」變成習慣動作，等到真的壞掉時沒人相信那個紅燈。

**待辦**:
- 下次撞見時**先把測試名稱留下來**再重跑（`-ra` 或 `--tb=short`，別只看摘要行）
- 若能重現，優先查會建立背景 task 的那幾組（`task_runner`、`sqlite_task_store`、
  `checkpoint_ttl`）—— 已單獨連跑 6 次未重現，所以可能是跨檔案的交互作用
- 考慮在 CI 加 `-p no:cacheprovider` 之外的種子紀錄，讓失敗可回放

**觸發時機**: 下次 CI 或本地再次撞見時。在那之前不值得為它停下手邊工作。

---

#### B-097 NarrativeService 對 KG 的寫入從不落盤

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

#### B-098 scan_dead_code 會把「自己 docstring 裡的提及」算成引用

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

## F 系列（新功能）

**前置閱讀**: `docs/CORE.md`

新功能依依賴關係分為五個波次。

```
Wave 0（前置）✅  →  Wave 1（底層）✅  →  Wave 2（輕量分析）← 目前可開始
                                      →  Wave 3（深度分析）
                                      →  Wave 4（體驗功能）
                                      →  Wave 5（整合大功能）
                     + 加分項（無硬依賴，可插入任意波次）
```

**Wave 0 前置項目** ✅ 全部完成（已歸檔於 BACKLOG_ARCHIVE.md）：
- B-023 + B-031 合併 migration（EventNode 欄位）
- B-012 前後端 API 整合驗證

---

### ✅ Wave 1 — 底層基礎建設（已完成，詳情見 BACKLOG_ARCHIVE.md）

| ID | 功能 | 完成日期 |
|----|------|----------|
| F-01 | 隱性關係推論（Link Prediction） | 2026-04-27 |
| F-02 | 進度感知 KG（章節快照） | 2026-04-24 |
| F-03 | 角色認識論狀態 | 2026-04-25 |
| F-04 | 角色語音側寫（Voice Profiling） | 2026-04-25 |

---

### 🟡 Wave 2 — 輕量分析功能

#### F-06 敘事節奏分析器
**分類**: 分析功能 — Wave 2
**設計文件**: `docs/plans/<YYYYMMDD>-narrative-rhythm.md`（待建立，可與 F-07 合併）

**背景**: 把全書投影成多維節奏曲線，讓讀者一眼看出作者的敘事節奏型態，也讓創作者可以檢查自己的節奏是否過於平均或集中。

**所需資料**:
- 章節列表（已有）
- Event 節點的 `chapter` 欄位（已有）
- `emotional_intensity`（B-023 ✅ 已完成）
- `narrative_weight`（B-033 ✅ 已完成）
- 新角色首次出現的章節（可從 KG 查詢）

**開發方法**:
- 純計算，無額外 LLM：per-chapter 統計以下指標：
  - 事件密度（該章事件數 / 全書平均）
  - 情感強度均值（`emotional_intensity` 平均）
  - kernel 事件比例
  - 新角色出現數
- 節奏型態識別：用滑動窗口（window_size = 3 章）找重複模式（可選，後期優化）
- 輸出：per-chapter 的多維指標陣列，供前端視覺化

**內容**:
- `backend/storysphere/services/rhythm_service.py`：計算節奏指標
- API 端點：`GET /books/:bookId/analysis/rhythm` — 返回章節節奏數據
- 前端：深度分析頁新增「敘事節奏」tab，渲染多維折線圖（Recharts）
- 可與情感溫度圖疊加顯示（同一 X 軸）

**前置依賴**: ~~B-023~~（✅ 已完成）、~~B-033~~（✅ 已完成）→ **前置依賴已全部滿足**

---

#### F-08 伏筆偵測器（「我沒注意到」）
**分類**: 分析功能 — Wave 2
**設計文件**: 不需獨立設計文件，邏輯簡單

**背景**: 找出「重要但低調」的事件節點——這些是作者埋下的伏筆，讀者往往在第一遍閱讀時忽略。選取邏輯完全基於 KG 結構性查詢，不需要額外 LLM。

**所需資料**:
- `narrative_weight = "kernel"`（B-033 ✅ 已完成）
- Event 的 chunk 出現次數（已有）
- EEP 的 `subsequent_event_ids`（已有）

**開發方法**:
- 純 KG 查詢，三個條件交集：
  1. `narrative_weight = "kernel"`（敘事上重要）
  2. 出現的 chunk 數少於全書事件的中位數（文本上低調）
  3. `subsequent_event_ids` 中有至少一個 `tension_signal = "explicit"` 的後續事件（因果上關鍵）
- 按「重要性 / 低調程度比值」排序輸出
- 不需要 LLM 額外調用

**內容**:
- `KGService.get_overlooked_events(book_id, top_n)` — 返回符合條件的事件列表
- API 端點：`GET /books/:bookId/analysis/overlooked-events`
- 前端：閱讀頁新增「伏筆提示」浮動按鈕（讀完後解鎖），點擊展開列表
- 每個伏筆項目：事件標題 + 出現章節 + 後來呼應的事件 + 原文引用段落

**前置依賴**: ~~B-023~~（✅ 已完成）、~~B-033~~（✅ 已完成）→ **前置依賴已全部滿足**

---

#### F-12 閱讀記憶外化系統
**分類**: 體驗功能 — Wave 2
**設計文件**: `docs/plans/<YYYYMMDD>-reading-memory.md`（待建立）

**背景**: 閱讀時的疑問、感想、預測是讀者最有價值的思考，但通常消散在閱讀過程中。F-12 讓這些標注與 KG 結構對齊，並在後續閱讀中主動提醒「你之前的疑問現在有答案了」。

**所需資料**:
- 用戶標注（新資料，需建立 `UserAnnotation` 資料結構）
- Chunk_id 與 Event 的對應關係（已有）
- Qdrant 向量搜索（已有）

**開發方法**:
- `UserAnnotation` 掛在 `chunk_id` 或 `event_id` 上，儲存用戶文字 + 標注類型（疑問 / 詮釋 / 預測）
- 主動提醒邏輯：用標注文字做向量搜索，當用戶進入新章節時，找語義相關的新事件，相關度超過閾值即推送提醒
- 本質上是「個人知識庫 + 觸發式推送」

**內容**:
- `backend/storysphere/domain/annotation.py`：`UserAnnotation` Pydantic model
- `backend/storysphere/services/annotation_service.py`：標注的 CRUD + 提醒觸發邏輯
- SQLite 存儲（沿用 `analysis_cache.py` 模式）
- API 端點：
  - `POST /books/:bookId/annotations` — 建立標注
  - `GET /books/:bookId/annotations` — 列出標注
  - `GET /books/:bookId/annotations/reminders?current_chapter={N}` — 取得當前章節相關的歷史標注提醒
- 前端：閱讀頁 chunk 旁新增標注按鈕 + 提醒浮動 toast

**前置依賴**: F-02（章節進度感知，用於觸發提醒）

---

#### F-16 角色派系偵測（Faction Detection）
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

### 🟠 Wave 3 — 深度分析功能

#### F-05 What-If 情境推演
**分類**: 分析功能 — Wave 3（核心體驗功能）
**設計文件**: `docs/plans/<YYYYMMDD>-what-if.md`（待建立）

**背景**: 讓讀者在 KG 的任意事件節點上標記「反轉此事件」，系統基於因果鏈和角色一致性約束，推演出一條替代敘事分支。多條分支可以並存，形成平行時間軸結構。

**所需資料**:
- F-02（章節快照）
- F-03（角色認識論狀態）— 作為角色反應的約束條件
- EEP 的 `prior_event_ids` / `subsequent_event_ids`（已有）
- CEP 的角色性格結構（已有）

**開發方法**:
四步驟流程：
1. **分歧點選擇**：用戶在事件節點標記「反轉此事件」，輸入反轉描述
2. **因果鏈傳播**：從分歧點往後做圖遍歷，找出所有 `prior_event_ids` 包含它的後續事件，標記為「受影響節點」
3. **角色一致性約束**：對每個受影響事件，用 CEP 性格結構做 LLM 判斷「這個角色在新情境下的反應是否合理」
4. **分支快照生成**：建立平行 KG 版本，受影響節點替換為新推演版本

分支管理：版本控制概念，每條分支有 `id`、`parent_event_id`（分歧點）、`divergence_description`。

**內容**:
- `backend/storysphere/domain/whatif.py`：`WhatIfBranch`、`WhatIfEvent` Pydantic models
- `backend/storysphere/services/whatif_service.py`：因果鏈傳播 + 一致性約束 + 分支生成
- API 端點：
  - `POST /books/:bookId/whatif` — 建立分歧點，觸發推演，返回 `task_id`
  - `GET /books/:bookId/whatif` — 列出所有分支
  - `GET /books/:bookId/whatif/:branchId` — 取得分支詳情（替代事件鏈）
  - `DELETE /books/:bookId/whatif/:branchId` — 刪除分支
- 前端：圖譜頁事件節點右鍵選單新增「建立 What-If 分支」
- 分支視覺化：主線 + 分支以不同顏色顯示，分歧點有特殊標記

**前置依賴**: F-02、F-03、~~B-023~~（✅ 已完成）

---

#### F-07 主題共鳴地圖
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/plans/<YYYYMMDD>-thematic-map.md`（待建立）

**背景**: 把全書的 Concept 節點投影到語義空間，讓讀者一眼看出「這本書真正在談的幾組核心對立」，以及概念之間的共鳴結構。

**所需資料**:
- Concept 節點（已有）
- Concept 節點的向量嵌入（已有，Qdrant）
- 張力分析的 TensionLine（B-027 完成後有，可選）

**開發方法**:
- 從 Qdrant 取 Concept 節點的嵌入向量
- UMAP（或 t-SNE）降維到 2D，保留語義聚類結構
- 共現強度：計算 Concept 節點在相同 chunk 中的共現頻率，作為邊的權重
- 對立關係：優先從 TensionLine 的 `poles` 取得；若 TensionLine 未完成，用向量距離的遠端對作為候選
- 輸出：帶 2D 座標的節點列表 + 帶權重的邊列表

**內容**:
- `backend/storysphere/services/thematic_map_service.py`：降維計算 + 共現矩陣
- API 端點：`GET /books/:bookId/analysis/thematic-map` — 返回節點座標與邊
- 前端：深度分析頁新增「主題地圖」tab，以 Cytoscape.js（已引入）渲染語義散佈圖
- 節點大小 = 全書出現頻率，邊粗細 = 共現強度，顏色 = 概念類型

**前置依賴**: Concept 節點向量嵌入（已有）；B-027（TensionLine，可選強化）

---

#### F-10 敘事視角分析
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/plans/<YYYYMMDD>-narrative-focalization.md`（待建立）

**背景**: 誰在講這個故事？哪些資訊是被刻意過濾的？F-10 分析每章節的敘事視角與資訊不對稱結構，讓讀者理解「故事是怎麼被講的」，讓創作者可以分析技法。

**所需資料**:
- 章節文本（已有）
- F-03（角色認識論狀態）— 用於計算資訊不對稱
- F-04（角色聲音指紋）— 用於對話歸屬識別（可選強化）
- Event 的 `participants` 欄位（已有）

**開發方法**:
- 每章節用 LLM 判斷主要敘事視角類型：`omniscient` / `limited_third` / `first_person` / `multiple`
- 資訊不對稱標記（需 F-03）：找「讀者知道但角色 X 不知道」的事件——即事件的 participants 不包含 X，但 X 是後來受影響的角色
- 輸出：per-chapter 的視角標記 + 資訊不對稱節點列表

**內容**:
- `backend/storysphere/services/focalization_service.py`：視角分類 + 資訊不對稱計算
- `backend/storysphere/domain/focalization.py`：`ChapterFocalization`、`InformationGap` models
- API 端點：`GET /books/:bookId/analysis/focalization` — 返回全書視角分析
- 前端：深度分析頁新增「敘事視角」tab，章節時間軸上標記視角類型 + 資訊不對稱熱點

**前置依賴**: F-03（資訊不對稱計算）

---

### 🔵 Wave 4 — 體驗型功能

#### F-09 未解決張力追蹤器
**分類**: 分析功能 — Wave 4
**設計文件**: 不需獨立設計文件，基於 TensionLine

**背景**: 追蹤全書結尾哪些對立張力仍處於開放狀態——這些可能是作者刻意留下的，也可能是未兌現的承諾。對讀者是閱後反思工具，對創作者是結構性檢查工具。

**所需資料**:
- TensionLine（B-027 完成後有）
- TEU 的 `local_resolution` 欄位（B-026 完成後有）

**開發方法**:
- 對每條 TensionLine，聚合其所有 TEU 的 `local_resolution` 狀態
- 書末層面：用 LLM 判斷 TensionLine 在最後幾章是否有對應的解決事件
- 輸出四種解決狀態：`resolved`（完全解決）/ `transformed`（部分轉化）/ `suspended`（懸而未決）/ `avoided`（被迴避）
- 解決度評分：0.0（完全未解決）~ 1.0（完全解決）

**內容**:
- `TensionService.analyze_resolution(book_id)` — 計算全書張力解決狀態
- API 端點：`GET /books/:bookId/analysis/tension-resolution`
- 前端：深度分析頁張力分析 tab 新增「解決狀態概覽」區塊

**前置依賴**: ~~B-026~~（✅ 已完成，詳見 BACKLOG_ARCHIVE.md）、~~B-027~~（✅ 已完成，詳見 BACKLOG_ARCHIVE.md）→ **前置依賴已全部滿足**

---

#### F-11 角色命運相似度
**分類**: 分析功能 — Wave 4
**設計文件**: `docs/plans/<YYYYMMDD>-character-similarity.md`（待建立）

**背景**: 計算不同角色的命運模式相似度——不是外貌或性格，而是他們經歷的事件弧線、在關係網中的位置、角色弧線類型的相似程度。跨書比較讓讀者看到更深的敘事原型。

**所需資料**:
- CEP（已有）
- 角色弧線（已有）
- 多本書的資料（跨書比較需要）

**開發方法**:
- 把 CEP 的結構化欄位（原型標籤、弧線類型、關係位置）編碼為特徵向量
- 單書內：用餘弦相似度計算角色間的命運模式距離
- 跨書比較：現有架構以 `book_id` 隔離，跨書查詢需新增 `cross_book` 查詢接口（`book_id=None` 則全庫查詢）

**內容**:
- `backend/storysphere/services/character_similarity_service.py`：特徵編碼 + 相似度計算
- API 端點：
  - `GET /books/:bookId/entities/:entityId/similar-characters?scope=book|all` — 返回相似角色列表（附相似度分數）
- 前端：角色分析頁新增「相似角色」區塊，可切換「本書內」/ 「跨書」範圍

**前置依賴**: CEP（已有）

---

#### F-13 Role Agent 系統
**分類**: 體驗功能 — Wave 4（核心沉浸功能）
**設計文件**: `docs/plans/<YYYYMMDD>-role-agent.md`（待建立，因複雜度需完整 guide）

**背景**: 讓每個角色成為可以對話的 Agent，有認識論邊界（不知道他不該知道的事）、有聲音風格、有性格約束。支援四種使用模式：視角重述、單角色對話、多角色聊天室、世界觀建構中的角色測試。

**所需資料**:
- CEP（已有）
- F-03（角色認識論狀態）
- F-04（聲音指紋）
- F-02（章節快照，用於時間點鎖定）

**開發方法**:
Agent persona 組裝（system prompt 建構）：
```
CEP 的性格結構 + 原型標籤
+ 聲音指紋的量化指標與質性描述
+ 認識論狀態（已知事件、未知事件列表）
+ 時間點鎖定（第幾章之後的狀態）
```

認識論邊界強制：Agent 在對話中被問及「他不該知道的事」時，識別並以「不知情」方式回應，不洩露信息。

多角色聊天室：多個 Agent 實例並存，orchestrator 決定輪次（用戶指定角色 / 按對話自然流向），每個 Agent 的 persona 獨立。

**內容**:
- `backend/storysphere/agents/role_agent.py`：RoleAgent class，封裝 persona 建構 + 對話邏輯
- `backend/storysphere/services/role_agent_service.py`：Session 管理、多角色 orchestration
- `backend/storysphere/domain/role_session.py`：`RoleSession`、`RoleMessage`、`MultiRoleRoom` models
- SQLite 存儲：對話記錄（可掛回 KG 作為「平行事件」）
- API 端點：
  - `POST /books/:bookId/role-sessions` — 建立角色對話 session（指定角色 + 章節時間點）
  - `WS /ws/role-sessions/:sessionId` — WebSocket 對話串流
  - `POST /books/:bookId/role-rooms` — 建立多角色聊天室
  - `GET /books/:bookId/role-sessions/:sessionId/history` — 取得對話記錄
- 前端：獨立頁面 `/books/:bookId/roleplay`，支援切換三種模式（視角重述 / 對話 / 多角色室）

**前置依賴**: F-02、F-03、F-04

---

#### F-14 生圖整合（角色縮圖 + 場景圖）
**分類**: 體驗功能 — Wave 4
**設計文件**: `docs/plans/<YYYYMMDD>-image-generation.md`（待建立）

**背景**: 利用 CEP 的外貌描述和 Location 節點的場景描述，自動組裝圖像生成 prompt，為角色和場景生成視覺呈現。書級共享風格設定，保持視覺一致性。

**所需資料**:
- CEP 的外貌相關段落（已有）
- Location 節點描述（已有）
- EEP 的 `state_before/after`（已有，用於場景圖語境）

**開發方法**:
- Prompt 組裝：從 CEP 提取外貌相關句子 + 原型標籤 → 組成角色視覺 prompt
- 書級風格設定：用戶在書籍設定頁設定一次「美術風格 token」（如「水彩插畫，柔和色調」），所有角色和場景 prompt 自動附加
- 預設 API 接口：外部圖像生成服務（DALL-E 3 / Stable Diffusion API），抽象成可替換接口
- 生圖結果存入 `ImageAsset` 資料結構，與 entity_id 關聯

**內容**:
- `backend/storysphere/services/image_gen_service.py`：prompt 組裝 + API 調用 + 結果存儲
- `backend/storysphere/domain/image_asset.py`：`ImageAsset`、`BookVisualStyle` models
- 書籍設定：新增「視覺風格」設定欄位（書級）
- API 端點：
  - `POST /books/:bookId/entities/:entityId/generate-image` — 觸發角色縮圖生成
  - `POST /books/:bookId/locations/:locationId/generate-image` — 觸發場景圖生成
  - `GET /books/:bookId/visual-style` / `PUT` — 取得/更新書籍視覺風格
- 前端：角色詳情面板顯示縮圖，可觸發重新生成；圖譜頁角色節點可顯示縮圖

**前置依賴**: CEP（已有）；無其他硬依賴

---

### 🔴 Wave 5 — 整合型大功能

#### F-19 What-If 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/plans/<YYYYMMDD>-whatif-system.md`（待建立）

**內容**: F-05 的延伸，加入多分支管理 UI、分支事件鏈的完整視覺化、分支之間的比對工具，以及將 Role Agent（F-13）帶入 What-If 分支進行角色對話驗證。

**前置依賴**: F-05、F-13

---

#### F-20 Role Agent 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/plans/<YYYYMMDD>-role-agent.md`（同 F-13）

**內容**: F-13 的完整實作，加入視角重述模式（角色日記 / 回憶錄生成）、對話記錄掛回 KG 作為「平行事件」、多角色聊天室的完整 orchestration 邏輯。

**前置依賴**: F-13（F-02、F-03、F-04）

---

#### F-15 世界觀建構完整系統
**分類**: 整合 — Wave 5（新使用模式）
**設計文件**: `docs/plans/<YYYYMMDD>-worldbuilding.md`（待建立）

**背景**: 把整個系統的使用方向翻轉——從「輸入文本 → 分析理解」變成「輸入設定碎片 → 系統幫你結構化、補全、檢查一致性」。用戶不需要完整小說文本，可以自定義角色卡、地點描述、事件設定，系統自動建構 KG、檢查邏輯、並提供 Role Agent 和 What-If 功能。

**所需資料**:
- 用戶輸入的設定素材（新輸入來源，非 PDF）

**開發方法**:
- 輸入模式：自由文本（設定片段）或結構化表單（角色卡 / 地點卡 / 事件卡）
- 走相同的 ingestion pipeline，來源從 PDF 換成用戶輸入文字
- 邏輯驗證器（核心）：KG 建好後，用圖查詢做：
  - 時間線一致性：事件的因果前提是否在時間上已成立
  - 能力邊界一致性：角色的能力或知識是否有未解釋的突變
  - 地理邏輯：涉及移動的事件時間是否合理（需有地點間距離設定）

**內容**:
- 前端：新增「創作工作坊」模式入口（與閱讀模式平行的使用路徑）
- `backend/storysphere/pipelines/worldbuilding_ingestion.py`：接受結構化設定素材，走改版的 ingestion pipeline
- `backend/storysphere/services/consistency_checker.py`：邏輯一致性圖查詢
- `backend/storysphere/domain/worldbuilding.py`：`CharacterCard`、`LocationCard`、`EventSetting` models
- API 端點：
  - `POST /worldbuilding` — 建立世界觀專案
  - `POST /worldbuilding/:projectId/entities` — 新增角色 / 地點設定
  - `POST /worldbuilding/:projectId/events` — 新增事件設定
  - `GET /worldbuilding/:projectId/consistency-check` — 執行邏輯驗證，返回矛盾列表

**前置依賴**: F-05（What-If）、F-13（Role Agent）、F-09（張力追蹤，可選）

---

---

## Infra 系列（基礎設施重構）

#### I-002 Migration CLI（部署模式遷移工具）
**性質**: Infrastructure Tooling
**目標**: 提供使用者在 lightweight / standard 兩個部署模式之間安全遷移資料的 CLI 工具

**背景**: I-001 建立了互斥的兩個部署模式，但使用者從 lightweight 升級到 standard 時需要將資料搬移：KG 從 NetworkX JSON → Neo4j；向量從 Qdrant local path → Qdrant service。此工具確保遷移有明確流程而非手動操作。

**指令骨架**:
```
python -m cli.migrate lightweight-to-standard
python -m cli.migrate standard-to-lightweight
```

**實作分階段**:
- **I-002 階段（本票）**: 建立 `src/cli/migrate.py` 骨架，接入現有 `services/kg_migration.py` 處理 KG 方向的 lightweight → standard（NetworkX → Neo4j）
- **I-003 後續**: Vector migration（Qdrant local path → Qdrant service）實作

**修改範圍**:
- 新增 `src/cli/` 目錄與 `migrate.py`
- 接入 `backend/storysphere/services/kg_migration.py`（已有 NetworkX → Neo4j 路徑）

**前置依賴**: I-001（`deploy_mode` 設定必須先就位）

---

## I 系列（多語系 / i18n）

**目標**: 前端支援繁體中文（zh-TW）與英文（en），後續語系按需新增。
**技術選型**: `react-i18next` + `i18next`（React 生態主流方案）
**字串規模**: 約 380–420 個不重複字串，分布在 33 個元件 / 頁面中

### 執行策略

```
I-01 (基礎設置) → I-02 (共用字串) → I-03..I-08 (頁面逐批遷移) → I-09 (框架索引)
```

FrameworksPage（I-09）獨立最後處理，因含 140+ 靜態內容字串（原型名稱、描述），需評估是否用 JSON content 檔而非一般 translation key。


**代表字串**: Jung 原型（天真者、孤兒、英雄…×12）、Schmidt 類型（×45）、英雄旅程階段（×12）、Frye 四季神話（×4）、Booker 七種情節（×7）、SEP 步驟（×7）

---

## 📋 狀態追蹤

### B 系列

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-041 | 章節審閱 UI 專用 Design Token | 🟢 低 | 待開始（前置：章節審閱功能完成） |
| B-042 | 章節審閱頁面：段落 Role 自動識別 | 🟢 低 | 待開始 |
| B-043 | 閱讀頁：欄 2 章節搜尋 | 🟡 中 | ✅ 已完成 |
| B-044 | 閱讀頁：EpistemicSidePanel 入口可發現性優化 | 🟡 中 | ✅ 已完成 |
| B-045 | 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 | 🟡 中 | ✅ 已完成 |
| B-046 | 建構概覽：節點觸發建構 CTA 對接 pipeline | 🟢 低 | 待開始（前置：對應 pipeline endpoint） |
| B-047 | 知識圖譜：非預設主題下節點類型識別困難 | 🟢 低 | ✅ 已解（design system v2 兩主題共用 entity 色環，問題不復存在） |
| B-048 | Neo4j 能力缺口（切過去等於整個圖譜功能面停擺） | 🟡 中 | 🔶 部分完成（2026-09-05；PR #83 防護、PR #84 事前警告；三項缺口的實作待 B-011）|
| B-049 | 累積 Lint 債清理（ruff + eslint） | 🟢 低 | ✅ 已完成 |
| B-051 | WebSocket 連線身分認證 | 🟢 低 | 待開始（前置：部署方向 + 認證決策） |
| B-052 | log 中 neo4j/qdrant URL 遮罩 | 🟢 低 | ✅ 已完成（2026-08-22；7 處，其中 1 處是回應 body 不是 log，見 ARCHIVE） |
| B-053 | Secret 管理（prod） | 🟢 低 | 待開始（前置：部署方向確定） |
| B-054 | Splash 圖庫更換 + wording 同步 | ✅ | 完成（2026-07-16，歸檔於 ARCHIVE） |
| B-055 | 章節審閱 review-data 分章載入 | 🟢 低 | 待開始（觸發：上傳流程 UX 重構） |
| B-056 | Phase 1 文件解析 sub-progress | 🟢 低 | 待開始（觸發：大檔解析體感回報） |
| B-057 | 批次上傳（含跳過審閱選項） | 🟢 低 | 待開始（觸發：批次需求出現） |
| B-058 | 處理卡系統吉祥物欄 | 🟢 低 | 待開始（觸發：吉祥物資產備妥） |
| B-059 | 派系語意命名（LLM 為 F-16 社群取名） | 🟢 低 | 待開始（前置：角色頁翻新 #1 派系分群上線） |
| B-060 | 原型篩選 facet 改以 archetype id 比對 | 🟢 低 | 待開始（觸發：EN 介面使用需求） |
| B-061 | 前後端原型 taxonomy 漂移防護測試 | 🟢 低 | ✅ 已完成（2026-08-22；後端 pytest 讀前端檔案，8 項，四組現況皆一致，見 ARCHIVE） |
| B-062 | tension / narrative 前端寫死 language='zh' | 🟡 中 | ✅ 已完成（2026-08-21；後端補 `language` + 前端六個呼叫點接上，影響比原記載大，見 ARCHIVE） |
| B-063 | 關係圖角色名冊比對支援 KG 別名 | 🟢 低 | 待開始（觸發：灰圈誤判回報累積） |
| B-064 | 未分析卡「生成分析」按鈕文字對齊 canvas「建立」 | 🟢 低 | ✅ 已完成（2026-08-22；清單卡 + 排行列兩處改用新 key，事件兩處按 UI_SPEC 不動，見 ARCHIVE） |
| B-065 | 各功能頁操作說明缺乏統一機制 | 🟡 中 | 待開始（觸發：下次翻新任一功能頁時一併設計） |
| B-073 | Gemini 對「手」的提示回報 PROHIBITED_CONTENT | 🔴 高 | 工程面已完成（2026-08-10，Phase 1–3）；「手」仍待可用的 fallback provider，見 B-075 |
| B-074 | SEP 把前置頁文字當證據送進 LLM | 🔴 高 | 已完成（2026-08-10）；僅剩「海」那筆舊詮釋要不要重生，見條目內 SQL |
| B-075 | 全系統 LLM fallback 鏈是壞的（假 local model + placeholder 誤判） | 🔴 高 | ✅ 已完成（2026-08-20 複查：`Settings.has_*` 收斂早已落地——`is_configured()` 是唯一判準，`llm_client._has_key` 已改為純委派；`.env` 的行內註解也已清除） |
| B-076 | provider 封鎖在 30+ 呼叫點偽裝成解析失敗 | 🟡 中 | 已完成（2026-08-10）；24 處呼叫點改用共用 `llm_text()` |
| B-077 | 語言顯示名查表大小寫敏感（`zh-TW` → 「Respond in Zh.」） | 🟢 低 | 已完成（2026-08-10）；原記的「回傳簡體」是驗證腳本的產物，生產路徑無此問題 |
| B-079 | 19.7% 的 imagery occurrence 指向不含該詞的段落 | 🟡 中 | ✅ 已完成（2026-08-20 PR #61；兩個根因：靜默退回第一段 + pypdf 字中空白。定位正確率 80.3% → 100%） |
| B-078 | 象徵事件依附與貫穿度共線（`W.ev` 定義待決） | 🟢 低 | 暫不實作（2026-08-10 收攏；觸發：決議 06 權重校準） |
| B-081 | 四個服務的 token 歸屬缺口（共 7 處） | 🟡 中 | ✅ 已完成（2026-08-20 PR #62；設在公開進入點，併入 `analysis`，另加 AST 掃描測試防回歸） |
| B-082 | 重跑 KG 抽取會累積重複的實體 / 關係 / 事件 | 🔴 高 | ✅ 已完成（2026-08-20 PR #60；`_persist_to_kg` delete-first，連帶清 `inferred_relations`） |
| B-083 | pypdf 在 CJK 字中插空白，`mention_count` 漏數 | 🟡 中 | ✅ 已完成（2026-08-20 PR #64；`core/utils/text_matching.squash_spacing()`，41 個實體的漏數修正） |
| B-080 | 後端 deferred import 分類 | 🟢 低 | **不做**（2026-08-19 分類：276 處中僅 ~5.4% 可搬；75% 是循環依賴迴避） |
| B-084 | 後端實體類別欄位是純 `str`，擋住 4 個前端型別接回 generated | 🟢 低 | ✅ 已完成（2026-08-22；4 個型別已接回，只需改 1 個消費端而非預期的 12 個 cast；`status` 那半拆為 B-088，見 ARCHIVE） |
| B-085 | 五道閘門沒有任何 CI 在盯 | 🟡 中 | ✅ 已完成（2026-08-22；`.github/workflows/gates.yml`，觸發條件在 2026-08-21 滿足） |
| B-066 | 前端 `tsc -b` 既有 10 項型別錯誤 | 🟡 中 | ✅ 已完成（2026-08-20；10 項全清，`npm run build` 於 main 首次 exit 0） |
| B-067 | mock 模式下時間軸覆蓋率恆為 0% | 🟢 低 | **不做**（2026-08-20；`api/mock/` 整層已移除，前提消失） |
| B-068 | 事件抽取把同一場戲切成多個 event | 🟡 中 | 🔶 部分完成（2026-09-12 判準定案並實作 `group_scenes()`：排版分隔符 F1 0.79，無分隔線的章節整章不回傳而非回傳「一場」。**剩消費端接線**——張力頁仍顯示 TEU 數，見條目） |
| B-069 | 張力證據「同場景摺疊」無可用判準 | 🟢 低 | 擱置（2026-09-10 已查明 Jaccard 失敗的原因是節拍不是重複；待 B-068 的場景分組） |
| B-070 | 張力分析頁 RWD 未做 | 🟡 中 | ✅ 已完成（2026-08-21；三項待決全數收斂，見 ARCHIVE 與 UI_SPEC §3.8） |
| B-071 | 張力頁格點與迷你柱狀圖無非視覺替代 | 🟢 低 | 🔶 部分完成（2026-08-21；抽屜焦點與非視覺替代已做，Ink 語意拆為 B-086） |
| B-086 | Ink 主題下狀態語意只靠顏色 | 🟢 低 | ✅ 已完成（2026-08-22；盤點 109 處只有 1 處是真問題，見 ARCHIVE） |
| B-087 | 張力頁零引用的狀態色 CSS | 🟢 低 | ✅ 已完成（2026-08-22；實際範圍是兩整段共 243 行，非原記的 6 行，見 ARCHIVE） |
| B-072 | 張力 Step 1 組裝失敗的 TEU 無清單可看 | 🟢 低 | ✅ 已完成（2026-09-12；後端確認沒留清單，改回傳 `failures`（id/標題/章/例外），前端加收合面板。原記載的「只亮一個 failed 旗標」不成立——部分失敗其實什麼都不亮。同形狀另三處另立 B-113） |
| B-088 | 書卡狀態徽章永遠是「已就緒」 | 🟢 低 | ✅ 已完成（2026-08-22；改由 pipeline_status 推導 3 值，`processing` 證實產不出來已移除；順帶收掉 PipelineStatusResponse，見 ARCHIVE） |
| B-089 | 建構概覽把從未執行過的步驟標成「已完成」 | 🟡 中 | ✅ 已完成（2026-09-05 PR #79；`kg_concept` 兩半都非零才 complete，並移除永遠推不動它的 CTA，見 ARCHIVE） |
| B-090 | 零引用符號清除（第一批） | 🟢 低 | ✅ 已完成（2026-09-05 PR #80；5 個候選三種結局——3 刪、1 因是被手抄的 schema 改為讓工具用它、1 暫緩待 B-075，見 ARCHIVE） |
| B-091 | 全面徹查零使用程式碼 | 🟡 中 | ✅ 已完成（2026-09-08；backend 3→2、前端匯出 15→0、CSS 86→0、i18n 340→19、model 欄位 5 筆、私有方法範圍清空；掃描器修掉三個判準缺陷） |
| B-092 | ConceptInferencePipeline 從未接線，張力分析一直少一段證據 | 🟡 中 | ✅ 已完成（2026-09-10 PR #101/#102/#103；四段全數落地，見 ARCHIVE） |
| B-093 | 前後端 taxonomy 漂移防護只蓋了五分之二 | 🟢 低 | ✅ 已完成（2026-09-06 PR #87；防護 2/5 → 5/5、新增 id 集合對等、hero_journey 英文 5 筆對齊、刪掉零引用的 `STAGE_IDS`/`PHASES`，見 ARCHIVE；殘項另立 B-095） |
| B-094 | pytest 有一個間歇性失敗（約 1/8） | 🟢 低 | 待開始（2026-09-05 撞見一次，7 次重跑未重現，未取得測試名稱；非該批造成） |
| B-105 | 移除 10 個無呼叫端的 HTTP 端點 | 🟢 低 | ✅ 已完成（2026-09-07；`documents.py` / `relations.py` 整檔刪除、`entities.py` 只留 `GET /:entityId`，連同 7 個孤兒 schema 與兩個測試檔；generated.ts 少 673 行） |
| B-106 | `narrative_position` 有五個讀者、零個寫者 | 🟡 中 | ✅ 已完成（2026-09-10 PR #104 + B2 措辭；兩本書已重跑填滿。代價：要求章內序會推高事件顆粒度 +30%，三種措辭都躲不掉，見 plans 的對照實驗） |
| B-107 | Age of Fire 的事件資料停留在 B-082 修好之前 | 🟢 低 | ✅ 已完成（2026-09-10 重跑 KG；101 → 49 事件，60 筆重複標題歸零） |
| B-108 | 事件衍生的快取失效規則掛在錯的步驟上 | 🟡 中 | ✅ 已完成（2026-09-10；`knowledge-graph` 才是重生 event id 的步驟，卻既不清 `event:` 也不收 TEU keys；`feature-extraction` 那份多餘規則留作獨立一題） |
| B-109 | `Event.location_id` 是第二個零寫者欄位 | 🟢 低 | 待開始（2026-09-11 B-068 試算；填充率 0/201，無消費者故嚴重性低，但擋住「同地點」判準；與 B-068 第二層一併決定） |
| B-110 | 張力頁重新整理後就忘記 Step 1 跑過 | 🟡 中 | ✅ 已完成（2026-09-11；`hasTeus` 不看 `teus` query，導致 23 筆 TEU 的書顯示空狀態並引導使用者重跑一次完整 LLM pass） |
| B-111 | `feature-extraction` 刪掉四個家族的快取，但它不重生那些 id | 🟡 中 | ✅ 已完成（2026-09-12；B-108 說要開卻從未開出的那一題。`event:` / `character:` 改判為 stale 並補上 #6a/#6b/#7a/#7d 的回報路徑與兩頁徽章，`epistemic:` / `teu:` 零依賴直接移除；五項測試在釘住舊行為已改判準） |
| B-113 | 「`failed += 1` 然後繼續、不留清單」還有三處 | 🟢 低 | 🔶 後端已完成（2026-09-12；三處都回傳 `failures`，象徵那份連 rate limit 提前 return 也帶著。三個前端消費端未接，各頁有自己的批次 UI） |
| B-114 | 全站焦點環漏掉 `<summary>` | 🟢 低 | ✅ 已完成（2026-09-12；`:where()` 加入 `summary`，三個 details 元件一次涵蓋，tension.css 的 local 規則同時刪除） |
| B-115 | 只有收尾標點的一行被判成場景分隔線 | 🟡 中 | ✅ 已完成（2026-09-12；`_is_separator_segment` 排除整段皆行文標點者。實測 16 筆真分隔全留、4 筆偽陽性全除；刻意不用長度判準——真分隔 `～` 只有 1 字。既有資料需重跑 ingestion，B-068 實作應於讀取端再套一次） |
| B-116 | `temperature=0` 之下 Gemini 仍然不可重現 | 🟡 中 | ✅ 已查明 + 基線已量（2026-09-12；來源是供應端非 llm_retry。N=30 基線：ch1 事件數 range 2、ch7 range 0——雜訊不一定打到你在量的指標，需逐章逐指標量。先前根據 N=5 說「效應不可靠」已更正） |
| B-117 | 已刪書籍的殘留快取 | 🟢 低 | ✅ 已完成（2026-09-12；`analysis_cache` 清掉 17 筆孤兒、26→9，備份在專案外並逐項核對。連帶讓走查 §3-3 的 40 筆 pending 推斷關係失去前提——該表已空） |
| B-118 | 走查 §3-1 三個未掃範圍全數收束，掃描器補上 corpus 拆分／框架回呼／巢狀函式 | 🟡 中 | 🔶 走查完成、掃描器已補（2026-09-12）；巢狀函式 0 筆、scripts 三個裡一個有文件化用法另兩個是已用畢的 one-off。六個刪除候選待使用者確認 |
| B-104 | 兩個已完整實作的深度分析工具永遠註冊不進 chat agent | 🟡 中 | ✅ 已完成（2026-09-07 F 走查；已接上 chat agent 並補雙端守衛，文件反向漂移一併修正；選擇準確率影響待 langfuse 基線） |
| B-103 | 建構概覽的 Relations 節點顯示全庫計數 | 🟢 低 | ✅ 已完成（2026-09-07；雙後端新增 `relation_count_for()`，雙向關聯去重，實測 696 → 分書 203/69/259/55） |
| B-102 | 段落層 keywords 產得出來、送得出去，就是沒有存 | 🟢 低 | ✅ 已完成（2026-09-07；`paragraphs.keywords_json` + 寫入 2 處讀取 3 處；既有書需重跑 feature-extraction 才有值） |
| B-099 | `get_fallback` 的暫緩理由已過期，全系統實際上沒有任何 fallback | 🟢 低 | 暫不實作（2026-09-07 收攏：一般使用者不會備多家 LLM key，前提不成立；`get_fallback` 保留，理由換成有效的那個。技術前提已查明留在條目裡） |
| B-100 | token 歸屬修好之後沒有任何資料驗證過 | 🟢 低 | ✅ 已完成（2026-09-12 實測：108 筆新資料、未歸屬 0 筆、跨 6 個 service 2 本書。注意歷史那 4206 筆已不在庫裡，不是同一個母體，不能宣稱「98.3% → 0%」） |
| B-101 | 前置頁排除數有兩套規則，而且不是同一條 | 🟢 低 | ✅ 已完成（2026-09-07；數字搬進 #15i overview item，前端兩個出口改讀後端值，規則收斂為一條） |
| B-095 | 英雄旅程的順序常數 `STAGE_ORDER` / `STAGE_PHASE` 無防護 | 🟢 低 | ✅ 已完成（2026-09-07；順序、phase、兩語系一致三項守衛，哨兵各驗過會紅） |
| B-096 | classify 的洗白守衛只擋全損，不擋部分損失 | 🟡 中 | ✅ 已完成（2026-09-07；成因是把「沒有 EEP」讀成「判定為未分類」，改為保留無法重現的權重，`_would_wipe` 隨之移除） |
| B-097 | NarrativeService 對 KG 的寫入從不落盤 | 🟡 中 | ✅ 已完成（2026-09-07；`narrative_weight` 改為有變化才落盤，`story_time` / `StoryTimeRef` 因零讀者移除） |
| B-098 | scan_dead_code 會把自己 docstring 裡的提及算成引用 | 🟢 低 | ✅ 已完成（2026-09-06；`_code_only()` 以 tokenize 濾掉註解與字串，backend 符號 1 → 3；順帶納入私有方法，該範圍 0 筆） |

### F 系列

| ID | 項目 | Wave | 前置依賴 | 狀態 |
|----|------|------|----------|------|
| F-01 | 隱性關係推論（Link Prediction） | 加分項 | — | ✅ 已完成 |
| F-02 | 進度感知 KG（章節快照） | Wave 1 | B-023 migration | ✅ 已完成 |
| F-03 | 角色認識論狀態 | Wave 1 | F-02 | ✅ 已完成 |
| F-04 | 角色語音側寫（Voice Profiling） | Wave 1 | — | ✅ 已完成 |
| F-05 | What-If 情境推演 | Wave 3 | F-02、F-03 | 待開始 |
| F-06 | 敘事節奏分析器 | Wave 2 | B-023、B-033 | 待開始 |
| F-07 | 主題共鳴地圖 | Wave 3 | Vector embeddings | 待開始 |
| F-08 | 伏筆偵測器 | Wave 2 | B-023、B-033 | 待開始 |
| F-09 | 未解決張力追蹤器 | Wave 4 | ~~B-026~~、~~B-027~~（均已完成）| 待開始 |
| F-10 | 敘事視角分析 | Wave 3 | F-03 | 待開始 |
| F-11 | 角色命運相似度 | Wave 4 | CEP | 待開始 |
| F-12 | 閱讀記憶外化系統 | Wave 2 | F-02 | 待開始 |
| F-13 | Role Agent 系統 | Wave 4 | F-02、F-03、F-04 | 待開始 |
| F-14 | 生圖整合 | Wave 4 | CEP | 待開始 |
| F-15 | 世界觀建構完整系統 | Wave 5 | F-05、F-13 | 待開始 |
| F-16 | 角色派系偵測（Faction Detection） | Wave 2 | KG 關係（已有） | 待開始 |
| F-17 | UI 主題風格切換系統（B&W Theme System） | Wave 2 | — | ✅ 已完成 |
| F-18 | 系統啟動 Splash Screen | Wave 2 | — | ✅ 已完成 |
| F-19 | What-If 完整系統 | Wave 5 | F-05、F-13 | 待開始 |
| F-20 | Role Agent 完整系統 | Wave 5 | F-13（F-02、F-03、F-04） | 待開始 |

---

### Infra 系列

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| I-001 | 輕量化部署模式（Lightweight Deployment Mode） | 🔴 高 | ✅ 已完成 |
| I-002 | Migration CLI（KG 方向骨架） | 🟡 中 | 待開始 |
| I-003 | 主要 LLM Provider 可配置化 | 🔴 高 | ✅ 已完成 |

### I 系列

| ID | 項目 | 字串數 | 工作量 | 狀態 |
|----|------|--------|--------|------|
| I-01 | 基礎設置（react-i18next + 語言切換） | — | ~2h | ✅ 完成 |
| I-02 | 共用字串（common.json） | ~20 | ~1h | ✅ 完成 |
| I-03 | 導覽 & 書庫（nav.json + library.json） | ~45 | ~1.5h | ✅ 完成 |
| I-04 | 上傳 & 處理（upload.json） | ~25 | ~1h | ✅ 完成 |
| I-05 | 深度分析（analysis.json） | ~60 | ~2h | ✅ 完成 |
| I-06 | 張力 & 時間軸（analysis.json） | ~55 | ~2h | ✅ 完成 |
| I-07 | 圖譜 & 閱讀器（graph.json + reader.json） | ~35 | ~1.5h | ✅ 完成 |
| I-08 | 其餘頁面（settings.json + chat.json） | ~75 | ~2h | ✅ 完成 |
| I-09 | 框架索引頁（frameworks.json，特殊處理） | ~142+ | ~3h | ✅ 完成 |

**總計**: 約 380–420 個字串，估計 ~14–16 小時工作量

---

> ✅ **ID 撞號已解（2026-06-30）**：原先 Active backlog 與 BACKLOG_ARCHIVE.md 有三組 ID 撞號，已重編 Active 側的開放項：建構概覽 CTA B-044→**B-046**、KG 節點識別 B-043→**B-047**、Neo4j Link Prediction B-035→**B-048**。已歸檔的閱讀頁 B-043/B-044 與坎伯英雄旅程 B-035 保留原號。同時補回先前漏列於狀態表的 B-042。

**維護者**: William
**最後更新**: 2026-09-08（i18n 340 → 19，B-091 全面走查告一段落）
