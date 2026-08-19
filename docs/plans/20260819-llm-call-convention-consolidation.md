# LLM 呼叫慣例收斂（retry / 語言 / token 歸屬 / 追蹤 shim）

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/core/`（新增與擴充）+ 15 支 service / pipeline / agent
**先例**: B-076 已用同樣手法把 24 處 provider 封鎖判斷收斂成共用的 `llm_text()`（`core/error_handling.py:58`），本份是同一條路的延續

---

## 1. 現況清點（2026-08-19 實測）

同一組「呼叫 LLM」的儀式散在各處，逐份手抄：

| 樣板 | 份數 | 位置 |
|---|---|---|
| `@retry(retry_if_exception_type(ValueError), stop_after_attempt(3), wait_exponential(1,1,5))` **參數完全相同** | **27** | 15 個檔案 |
| `_localize_prompt(prompt, language)` **逐字複製** | 6 | analysis / tension / narrative / symbol_analysis / imagery_extractor / concept_inference |
| `_get_llm()` lazy accessor + 函式內 import `get_llm_client` | ~10 | 各 service |
| `set_llm_service_context(...)` 手動呼叫 | 35 | 各 service / agent / workflow |
| langfuse `try: from langfuse import observe / except ImportError:` shim | 6 | ingestion / extraction / imagery / keyword / summary / analysis |

典型的一份（`services/tension_service.py:820-855`）：

```python
def _get_llm(self):
    if self._llm is None:
        from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415
        self._llm = get_llm_client().get_with_local_fallback(temperature=0.3)
    return self._llm

@retry(
    retry=retry_if_exception_type(ValueError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    reraise=True,
)
async def _call_llm(self, ...):
    from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415
    system_prompt = self._localize_prompt(_TEU_SYSTEM_PROMPT, language)
    llm = self._get_llm()
    set_llm_service_context("analysis")
    response = await llm.ainvoke(messages)
    ...
```

---

## 2. 問題

### 2.1 🔴 token 歸屬的漏洞就長在這裡

35 處 `set_llm_service_context` 中，**有相當一部分沒有帶 `book_id`**：

```python
services/symbol_analysis_service.py:316   set_llm_service_context("analysis")
services/narrative_service.py:460         set_llm_service_context("analysis")
services/extraction_service.py:319        set_llm_service_context("extraction")
services/keyword_service.py:203           set_llm_service_context("keyword")
pipelines/concept_inference.py:198        set_llm_service_context("analysis")
```

對照有帶的：

```python
services/tension_service.py:854           set_llm_service_context("analysis", book_id=document_id)
agents/analysis_agent.py:111              set_llm_service_context("analysis", book_id=document_id)
```

`set_llm_service_context` 的 `book_id` 是「已設值就不覆寫」語意（讓入口設一次、底下繼承），所以漏帶不一定出錯 —— **但只在有上游入口設過的路徑上成立**。沒有那個入口的路徑（chat、部分 tension、章節審閱）就歸屬不到書。

這正是 `project_token_attribution_partial` 記的那個缺口的**機制層根因**：歸屬靠 35 個呼叫點各自記得手寫，而不是靠結構保證。

### 2.2 🟡 27 份相同的 retry 設定

要調整重試策略（次數、退避、哪些例外該重試）得改 27 個地方。B-073 的教訓已經證明「哪些例外不該重試」是會變的 —— 當時為了讓 `SymbolInterpretationBlocked` 不被 tenacity 重試，刻意讓它不繼承 `ValueError`。那個約束目前只寫在一份 plan 裡，沒有任何結構強制它。

### 2.3 🟡 6 份逐字相同的 `_localize_prompt`

純字串處理，零狀態，沒有任何理由存在 6 份。

---

## 3. 🔒 langfuse 的邊界（本次的硬約束）

> **langfuse 是外部監測工具**，用途是在**開發情境**下追蹤應用程式的執行與路徑（LLM 相關）。
> 它是**可有可無**的觀測層，不是執行路徑的一部分。**不能綁死。**

現行 6 份 shim 的形狀本身是**對的** —— 它就是刻意的鬆耦合：

```python
try:
    from langfuse import observe as _lf_observe
except ImportError:
    def _lf_observe(**_kw):
        def _d(fn): return fn
        return _d
```

langfuse 沒裝 → 裝飾器變成 no-op → 程式照跑。這個性質**必須原封不動保留**。

### 3.1 可以做：把 shim 收成一份

搬進 `core/tracing.py`（它已經放了 `update_span`，是這個 shim 的天然歸屬地），其他 6 處改成 `from storysphere.core.tracing import observe`。

收斂後**鬆耦合反而更強**：整個 codebase 只剩**一個**地方提到 `langfuse` 這個套件名，要抽換或移除觀測方案時只需改那一處。現在是 6 處各自 import，抽換要動 6 個檔。

### 3.2 ❌ 明確不做：把 `@observe` 塞進共用的 LLM 呼叫入口

**不要**讓共用 helper 自動幫每次 LLM 呼叫開 span。理由：

1. **trace 樹的形狀會變成重構結構的副產品**，而不是刻意的觀測決策。今天的 span 邊界（`analysis.character.cep`、`analysis.event.eep`…）是有人選過的語意單位，不是「每次 ainvoke 一個」
2. **span 名稱會被機械推導**，失去語意。`analysis.character.cep` 會退化成 `llm_call` 之類的東西，追蹤價值歸零
3. **會讓追蹤變成呼叫路徑的必經環節**。一旦所有 LLM 呼叫都流經一個帶 `@observe` 的函式，「拔掉 langfuse」就從「不裝就好」變成「要改共用程式碼」—— 正好是要避免的綁死
4. **開發／生產的差異會被抹平**。langfuse 是開發情境的工具，塞進核心路徑等於在生產路徑上永遠掛著它的 no-op

### 3.3 結論：span 的所有權留在呼叫端

各 service 繼續自己寫 `@observe(name="analysis.character.cep", as_type="chain", ...)`，**名稱與邊界由作者決定**。共用層只提供那個「裝了就用、沒裝就 no-op」的 import，不決定任何 span 語意。

同理，`core/tracing.py` 的 `update_span` 維持現狀 —— 它已經是正確的形狀（薄包裝、無則靜默）。

---

## 4. 目標形狀

### 4.1 `core/llm_call.py`（新增）

```python
LLM_RETRY = retry(
    retry=retry_if_exception_type((ValueError, KeyError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    reraise=True,
)
"""27 份相同設定的唯一來源。

刻意不重試的例外（如 SymbolInterpretationBlocked）靠「不繼承 ValueError/KeyError」
達成 —— 這個約束現在有了單一落點可以寫在旁邊。
"""

async def call_llm(
    llm,
    *,
    system: str,
    human: str,
    language: str,
    service: str,
    book_id: str | None,      # ← 必填（可為 None，但必須明寫）
) -> str:
    """送出一次 LLM 呼叫並回傳文字。

    ``book_id`` 沒有預設值是刻意的：漏帶就是 token 歸屬漏洞，
    要讓它在簽章上無法被「忘記」。
    """
```

`book_id` 設成**必填參數**是本份最重要的一個設計決定 —— 把 2.1 的問題從「要記得寫」變成「不寫就過不了型別檢查」。

### 4.2 `core/prompts.py`（新增）或併入既有 core 模組

`localize_prompt(prompt, language)` 一份，6 處改為 import。

### 4.3 `core/tracing.py`（擴充）

加入 3.1 的 `observe` shim。**不加任何自動 span 邏輯。**

### 4.4 `_get_llm()` 維持各自持有

**不收斂**。各 service 的 temperature 不同（0.0 / 0.2 / 0.3），lazy 初始化也是刻意的（避免 import 時就建 client）。這裡的「重複」是表面的，實質是各自的設定。

---

## 5. 實作階段

| 階段 | 內容 | 檔案數 | 風險 |
|---|---|---|---|
| P1 | `core/tracing.py` 收 `observe` shim，6 處改 import | 7 | 極低（純 import 搬家，行為不變） |
| P2 | `localize_prompt` 收進 core，6 處改 import + 刪本地版 | 7 | 極低（純函數） |
| P3 | `LLM_RETRY` 常數收進 `core/llm_call.py`，27 處改用 | 分批，每批 ≤ 3 檔 | 低 |
| P4 | `call_llm()` 與 `book_id` 必填，逐檔遷移並補上漏掉的 `book_id` | 分批，每批 ≤ 3 檔 | **中** —— 每個呼叫點都要判斷 book_id 從哪來，不能瞎填 |

P1/P2 可當天做完；P4 是實質工作，需逐檔查證 `book_id` 的來源。

---

## 6. 驗證方式

- `python -m pytest` 無新增失敗
- **P1 專屬**：在**沒有安裝 langfuse** 的環境跑一次全測試，確認 no-op 路徑仍正常。這是 3.1 的核心驗證，不能略過
- **P4 專屬**：跑一本書的完整流程，比對 `GET /tokens/usage?bookId=...` 的 by-book 加總與總量差距是否縮小（現況有一部分歸不到書）
- `ruff check backend/` 無新增錯誤

---

## 7. 明確不做

- 不把 `@observe` 塞進任何共用執行路徑（見 3.2）
- 不改任何 span 名稱或邊界
- 不改 prompt 內容
- 不收斂 `_get_llm()`（見 4.4）
- 不動 `llm_text()`（B-076 已完成，形狀正確）
- 無 endpoint 異動 → `docs/API_CONTRACT.md` 不需更新

---

## 8. 回滾

P1–P3 都是機械搬移，單 commit revert 即還原。P4 分批 commit，每批只碰 ≤ 3 個 service，可單獨 revert。
