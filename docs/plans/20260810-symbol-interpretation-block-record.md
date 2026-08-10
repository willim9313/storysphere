# 象徵詮釋:讓 provider 封鎖被記住

> 日期:2026-08-10
> 前置:B-073(診斷已由本輪推翻,待改寫)
> 分支:`feat/symbols-api-consolidation`

---

## 1. 問題

`POST /symbols/:id/analyze` 對《名字的潮汐》的「手」永遠失敗。實測原因與 B-073 記載的**不同**:

```
block_reason  = BlockedReason.PROHIBITED_CONTENT
content       = ''
usage_metadata= None
```

Gemini 在 **prompt 層**擋下請求。`langchain_google_genai` 不拋錯,只印 warning 後回傳空的
`AIMessage`,於是 `symbol_analysis_service.py:249` 把空字串送進 extractor,
`output_extractor.py:97` 回報 `no_json_found` —— 一句與真實原因無關的訊息。

### 實測範圍(8 個已快取 SEP)

| 意象 | 結果 | 意象 | 結果 |
|---|---|---|---|
| 海 | ✅ | 腳印 | ✅ |
| 血 | ✅ | 光 | ✅ |
| **手** | 🔴 PROHIBITED_CONTENT | 懷錶 | ✅ |
| 沙 | ✅ | 戒指 | ✅ |

**7/8 正常**。B-073 寫的「整頁完全無法產出」不成立。

### 是誤判,不是內容問題

對「手」的 7 段 context 做 leave-one-out:拿掉 `[1]` 或 `[2]` **任一段**即通過,拿掉
`[3]`–`[7]` 任一段仍被擋。沒有單一「有問題的段落」——這是分類器對中文文學文本的
脆弱誤判。文本是伊內絲讀鹽、兄長溺斃、退潮的純敘事。

`PROHIBITED_CONTENT` 屬**不可設定**的核心政策封鎖,`llm_client.py:194-199` 那四個
`HarmBlockThreshold.OFF` 蓋不到,調 threshold 無效。

與 B-074(前置頁污染)無關 ——「手」的 7 段全在正文章節。

---

## 2. 為什麼「記住失敗」是這輪的重點

環境上短期拿不到第二家 provider(`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 為
placeholder 字串,`LOCAL_LLM_MODEL` 未設)。所以「手」註定失敗。

在那個前提下,現況最大的傷害不是錯誤訊息難看,是**失敗不留痕跡**:

- 側欄的「手」與一個從沒花過 token 的意象**外觀完全相同**
- 「手」訊號強(freq 7,橫跨 ch.1–10 共 7 章),CTA 會顯示
  「訊號夠強 —— 值得把它寫成一段論證」,**主動把讀者推向唯一產不出來的意象**
- 批次只回報「1 失敗」,前端拿不到是哪一個、為什麼
- 結果是無限重試迴圈:點 → 失敗 → 看不懂 → 過幾天再點 → 再失敗

---

## 3. 設計決策

### D1. 獨立快取 key,不塞進 `SymbolInterpretation`

```
symbol_analysis_block:{book_id}:{imagery_id}
```

**不**在 `SymbolInterpretation` 加 status 欄位。若那樣做,`get_interpretation()` 會回傳
一個 `theme` / `evidence_summary` 全空的物件,`InterpretationHero` 就渲染一張空白詮釋卡;
而且每個 consumer 都得先判斷「這是不是墓碑」——這種判斷一定會漏掉一處。

獨立 key 讓 `SymbolInterpretation` **完全不動**:詳情頁、HITL 審核流程、`generated.ts`
的該型別都不必改。

**已驗證不會誤撈**:`list_by_prefix()` 用 `prefix + "%"`(`analysis_cache.py:136`),
`list_interpretations()` 的 prefix 是 `symbol_analysis:{book}:`,而新 key 開頭是
`symbol_analysis_`(底線,非冒號),兩者不相交。

### D2. 只記錄「確定性」失敗

| 情況 | 記錄? | 理由 |
|---|---|---|
| `prompt_feedback.block_reason` 有值 | ✅ `provider_blocked` | 確定性,重試必然再失敗 |
| 回傳空內容但無 block_reason | ✅ `provider_empty` | 症狀相同,且涵蓋非 Gemini provider |
| rate limit | ❌ | 暫時性。寫進去會讓下次批次錯誤跳過 |
| 其他例外 | ❌ | 維持現行只進 log |

### D3. 記錄寫在 service 層,不寫在 router

`SymbolAnalysisService.analyze_symbol()` 的 except 內記錄後 re-raise。單一
(`_run_symbol_analysis`)與批次(`_run_batch_symbol_analysis`)兩條路徑都經過它,
router 不必各改一次、也不會漂移。

### D4. 成功時必須清除

`save_interpretation()` 一併 `invalidate("symbol_analysis_block:{book}:{imagery}")`。
否則日後補上第二家 provider、重生成成功後,失敗徽章仍掛著。

### D5. 批次預設跳過已被擋的,計入 `skipped`

`analyze_all_symbols` 除 `already_interpreted` 外再排除 blocked 集合。
語意與「已有詮釋者 skip」一致。

### D6. `force_refresh` 必須能繞過封鎖記錄

否則永遠卡死。使用者手動重試、或日後補上第二家 provider 時要能重跑。

### D7. 偵測邏輯

```python
def _detect_block(response) -> str | None:
    meta = getattr(response, "response_metadata", None) or {}
    reason = (meta.get("prompt_feedback") or {}).get("block_reason")
    if reason is not None:
        return getattr(reason, "name", str(reason))   # enum → "PROHIBITED_CONTENT"
    content = response.content if isinstance(response.content, str) else ""
    return "empty_response" if not content.strip() else None
```

`block_reason` 回來是 enum(`BlockedReason.PROHIBITED_CONTENT`),直接 `str()` 會帶
類別前綴,取 `.name`。

`prompt_feedback` 是 Gemini 專屬;空內容檢查則對所有 provider 通用。

拋出的例外**不得是** `ValueError` / `KeyError` —— `_call_llm` 的 tenacity 設定
(`symbol_analysis_service.py:229-234`)只重試這兩類,換一個例外型別即自動不重試,
不必動 retry 設定。現況每個被擋意象固定浪費 3 次呼叫。

---

## 4. 分階段(依 CLAUDE.md「超過 3 檔先拆」)

### Phase 1 — 後端:偵測與記錄

| 檔案 | 動作 |
|---|---|
| `backend/storysphere/domain/symbol_analysis.py` | 新增 `InterpretationBlock` model |
| `backend/storysphere/services/symbol_analysis_service.py` | 新增 `_detect_block` / 例外型別 / `save_block` / `list_blocks` / `clear_block`;`analyze_symbol` 捕捉並記錄;`save_interpretation` 清除 |
| `backend/storysphere/services/cache_invalidation.py` | `symbol-discovery` 加 `symbol_analysis_block:{book}:%` |
| `tests/services/test_symbol_analysis_service.py` | 被擋回應 → 記錄且不重試;成功 → 清除;rate limit → 不記錄 |

驗收:對「手」重跑,`task.error` 說出真正原因,且快取出現一筆 block 紀錄。

### Phase 2 — 後端:端點

| 檔案 | 動作 |
|---|---|
| `backend/storysphere/api/schemas/symbols.py` | `SymbolOverviewItem` 新增 `interpretation_block` |
| `backend/storysphere/api/routers/symbols.py` | overview 疊加 blocks;`analyze-all` 排除 blocked |
| `docs/API_CONTRACT.md` | 更新 #15i / #15j |
| `tests/api/test_symbols.py` | overview 回傳 block 欄位;批次跳過 blocked |

完成後在 `frontend/` 跑 `npm run gen:types`。

### Phase 3 — 前端

| 檔案 | 動作 |
|---|---|
| `frontend/src/api/generated.ts` | 重新產生 |
| `frontend/src/components/symbols/symbolSignals.ts` | `SymbolSignals` 帶出 block 狀態 |
| `frontend/src/components/symbols/InterpretationCta.tsx` | 新增 blocked 分支,取代「值得寫成論證」 |
| `frontend/src/components/symbols/SymbolList.tsx` | 側欄徽章:已嘗試 · 被阻擋 |
| `frontend/src/components/symbols/hooks/useSymbolCheck.ts` | `candidates` 排除 blocked |
| `frontend/src/i18n/locales/{en,zh-TW}/analysis.json` | 新文案 |
| `docs/UI_SPEC.md` | 新狀態 |

檔案數偏多,實作前可能再拆成 3a(資料流)/ 3b(呈現)。

---

## 5. 開發前 Checkpoint

**1. 哪些檔案會被異動?** 見第 4 節三張表。

**2. 有沒有現成工具或函式可用?** 有,且刻意複用:
- `AnalysisCache.invalidate(pattern)` 做清除,不新增刪除 API
- `AnalysisCache.list_by_prefix()` 批次載入,與 `list_interpretations()` 同一套
- tenacity 既有的 `retry_if_exception_type((ValueError, KeyError))` —— 換例外型別即免重試,不改 retry 設定
- overview 疊加沿用現有 `model_copy(update=...)` 寫法

**3. 會不會引入新依賴或新結構?**
- 無新套件
- 新增一個快取 key family `symbol_analysis_block:` —— 必要性見 D1(替代方案會污染
  `SymbolInterpretation` 並讓每個 consumer 都要判斷墓碑)
- 新增一個 domain model 與一個例外型別

**4. 改錯怎麼還原?**
- Phase 1/2 純新增,`git revert` 即可;`SymbolInterpretation` 與既有快取格式不動
- 新 key family 獨立,殘留紀錄以
  `DELETE FROM analysis_cache WHERE key LIKE 'symbol_analysis_block:%'` 清乾淨
- 既有 `symbol_analysis:` / `sep:` 快取不受影響

**文件同步:**
- API 有變動(#15i 新欄位、#15j 行為)→ Phase 2 更新 `docs/API_CONTRACT.md`,
  commit 標 `[api-contract updated]`
- 有新 UI 狀態 → Phase 3 更新 `docs/UI_SPEC.md`
- 無 CSS token 變動 → 不動 `docs/DESIGN_TOKENS.md`
- B-073 待改寫(診斷錯誤 + 範圍誇大),完成後依紀律移入 `docs/BACKLOG_ARCHIVE.md`

---

## 6. 已知限制

- **不修復封鎖本身。** 「手」在只有 Gemini 的環境下仍然產不出詮釋。本輪的目標是讓
  失敗被正確辨識、正確呈現、不再無謂重試。真正的解法是第二家 provider(見 B-073 改寫)。
- **不做 prompt 擾動重試。** 雖然實測拿掉前兩段任一段即可通過,但那會讓詮釋根據
  哪些證據產出變得不確定。列為最後手段。
- **不回填既有失敗。** 「手」要等下一次嘗試才會寫入紀錄。第一次點擊即記住,
  不值得為此寫 migration。
- **同樣的遮蔽存在於全專案 30+ 個 extractor 呼叫點**(角色 / 事件 / 張力 / 時間軸 /
  TOC …),本輪只修象徵路徑。另立 backlog 條目。
